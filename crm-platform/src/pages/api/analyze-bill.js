import { mapLocationToZone } from '../../lib/market-mapping';
import { generateFeedback } from '../../app/bill-debugger/utils/feedbackLogic';
import { getMarketContext, getTerritoryFromZone } from '../../app/bill-debugger/utils/rateDatabase';

/**
 * Helper to extract city and state from a service address string.
 */
function parseAddress(addressString) {
  if (!addressString) return { city: '', state: '' };

  // Basic address parsing: "123 Main St, City, State Zip"
  const parts = addressString.split(',').map(p => p.trim());
  if (parts.length < 2) return { city: '', state: '' };

  const city = parts[parts.length - 2] || '';
  const lastPart = parts[parts.length - 1] || '';
  const stateMatch = lastPart.match(/([A-Z]{2})/);
  const state = stateMatch ? stateMatch[1] : '';

  return { city, state };
}

export default async function analyzeBillHandler(req, res) {
  try {
    const { fileData, mimeType } = req.body || {};

    if (!fileData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file data provided' }));
      return;
    }

    // Sanitize fileData - remove any existing data prefix if present
    const base64Data = fileData.replace(/^data:.*?;base64,/, '');


    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;

    const prompt = `
      Analyze this energy bill for a Texas commercial facility. Extract the following details in JSON format:
      - customerName (Look for "Customer Name", "Company Name", or the primary name on the service address)
      - accountNumber
      - serviceAddress (Full street, city, state, zip of the facility location)
      - billingPeriod (start and end dates as YYYY-MM-DD)
      - totalAmountDue ($)
      - dueDate (YYYY-MM-DD)
      - contractEndDate (find near the retail plan or TDU details)
      - retailPlanName (e.g., "Fixed Price", "Index")
      - providerName (The Retail Electric Provider / REP - e.g., Reliant, TXU, Gexa, Direct Energy)
      
      - totalUsage (kWh)
      - peakDemand (kW) - IMPORTANT: Look for "Peak Demand", "Billed Demand", or "NCP Demand".
      
      - energyChargeTotal ($)
      - deliveryChargeTotal ($) (TDU/TDSP charges)
      - taxesAndFees ($)
      - demandRatchetCharge ($) - Look for "Demand" line items.
      
      - energyRatePerKWh ($/kWh)
      - deliveryRatePerKWh ($/kWh)
      
      If you cannot find a specific field, return null.
      Ensure output is valid JSON. 
    `;

    // Function to process the AI results with forensic logic
    const processResults = (parsed) => {
      // 1. Geographic Intelligence
      const { city, state } = parseAddress(parsed.serviceAddress);
      const zone = mapLocationToZone(city, state, parsed.serviceAddress);
      const territory = getTerritoryFromZone(zone);
      const market = getMarketContext(territory);

      // 2. Metrics & Classification
      const usage = parseFloat(String(parsed.totalUsage).replace(/,/g, '')) || 0;
      const totalAmount = parseFloat(String(parsed.totalAmountDue).replace(/[$,]/g, '')) || 0;
      const peakDemand = parseFloat(String(parsed.peakDemand).replace(/,/g, '')) || 0;
      const energyCharges = parseFloat(String(parsed.energyChargeTotal).replace(/[$,]/g, '')) || 0;
      const deliveryCharges = parseFloat(String(parsed.deliveryChargeTotal).replace(/[$,]/g, '')) || 0;
      const demandCharges = parseFloat(String(parsed.demandRatchetCharge).replace(/[$,]/g, '')) || 0;

      const isFacilityLarge = peakDemand > market.demandMeteredThreshold || usage > 20000;
      const allInRate = usage > 0 ? totalAmount / usage : 0;
      const demandPercentOfBill = totalAmount > 0 ? (demandCharges / totalAmount) * 100 : 0;

      // 3. Generate Forensic Feedback
      const feedback = generateFeedback({
        allInRate: allInRate,
        energyComponent: usage > 0 ? energyCharges / usage : 0,
        deliveryComponent: usage > 0 ? deliveryCharges / usage : 0,
        peakDemandKW: peakDemand,
        totalUsage: usage,
        totalBill: totalAmount,
        billingPeriod: parsed.billingPeriod || '',
        provider: parsed.providerName || parsed.retailPlanName || 'Unknown'
      }, territory);

      return {
        ...parsed,
        // Ensure providerName is normalized
        providerName: parsed.providerName || parsed.supplier || 'Unknown Provider',
        customerName: parsed.customerName || 'Unknown Client',
        analysis: {
          zone,
          territory,
          isFacilityLarge,
          facilitySize: isFacilityLarge ? 'large' : 'small',
          allInRateCents: (allInRate * 100).toFixed(2),
          demandPercentOfBill: demandPercentOfBill.toFixed(1),
          feedback,
          marketContext: market
        }
      };
    };

    // 1. Primary: Perplexity (Sonar-Pro)
    if (perplexityApiKey) {
      try {
        console.log(`[Bill Debugger] Analyzing with Perplexity (Sonar-Pro)...`);

        const isPdf = mimeType === 'application/pdf';
        const fileUrlContent = isPdf ? base64Data : `data:${mimeType || 'image/png'};base64,${base64Data}`;
        const attachmentType = isPdf ? 'file_url' : 'image_url';

        const body = {
          model: 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: attachmentType,
                  [attachmentType]: { url: fileUrlContent }
                }
              ]
            }
          ]
        };

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${perplexityApiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            let jsonString = content;
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonString = content.substring(firstBrace, lastBrace + 1);
            }

            try {
              const parsed = JSON.parse(jsonString);
              const forensicResult = processResults(parsed);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: forensicResult }));
              return;
            } catch (pErr) {
              console.error('[Bill Debugger] Parse error processing forensic logic:', pErr);
            }
          }
        }
      } catch (error) {
        console.error('[Bill Debugger] Perplexity connection failed:', error);
      }
    }

    // 2. Secondary Fallback: OpenRouter
    if (openRouterKey) {
      try {
        console.log(`[Bill Debugger] Falling back to OpenRouter...`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://nodalpoint.io',
            'X-Title': 'Nodal Point CRM'
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: mimeType?.includes('pdf') ? 'file_url' : 'image_url',
                    [mimeType?.includes('pdf') ? 'file_url' : 'image_url']: {
                      url: mimeType?.includes('pdf') ? base64Data : `data:${mimeType || 'image/png'};base64,${base64Data}`
                    }
                  }
                ]
              }
            ],
            response_format: { type: 'json_object' }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            try {
              const parsed = JSON.parse(content);
              const forensicResult = processResults(parsed);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: forensicResult }));
              return;
            } catch (e) {
              console.error('[Bill Debugger] OpenRouter JSON error:', e);
            }
          }
        }
      } catch (error) {
        console.error('[Bill Debugger] OpenRouter fallback failed:', error);
      }
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Analysis failed',
      message: 'Exhausted both Perplexity and OpenRouter.'
    }));

  } catch (error) {
    console.error('[Bill Analysis Error]:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Analysis failed',
      message: error.message
    }));
  }
}
