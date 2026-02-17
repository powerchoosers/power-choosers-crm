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
      - contractEndDate (MM/YYYY or YYYY-MM-DD. Look for varied phrasing like "valid through the meter date on or following...", "contract expires...", "ends...", "valid through...". If not found, return null.)
      - retailPlanName (e.g., "Fixed Price", "Index")
      - providerName (The Retail Electric Provider / REP - e.g., Reliant, TXU, Gexa, Direct Energy)
      
      - totalUsage (kWh) - Look for "Total Usage", "Base Usage", or the sum of meter reads.
      - peakDemand (kW) - Look for "Actual kW/kVA", "Billed kW/kVA", or "NCP Demand". If both actual and billed exist, prefer BILLED.
      
      - energyChargeTotal ($) - Look for "Total Commercial Charges" or the sum of energy-specific line items.
      - deliveryChargeTotal ($) - IMPORTANT: Look for "Total Distribution Charges" or the sum of all delivery/TDU/Distribution line items.
      - taxesAndFees ($)
      - demandRatchetCharge ($) - Sum of items like "Distribution System Charge", "Transmission Cost Recov Factor".
      
      - energyRatePerKWh ($/kWh)
      
      - productType (Extracted from "Product:" field - usually "Fixed Price", "Flex", or "Month-to-Month")
      
      If you cannot find a specific field, return null. 
      IMPORTANT: For numbers, return the string with commas if present.
      Ensure output is valid JSON. 
    `;

    // Improved number parsing
    const parseNum = (val) => {
      if (val === null || val === undefined) return 0;
      const cleaned = String(val).replace(/[$,\s]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    // Function to process the AI results with forensic logic
    const processResults = (parsed) => {
      // 1. Geographic Intelligence
      const { city, state } = parseAddress(parsed.serviceAddress);
      const zone = mapLocationToZone(city, state, parsed.serviceAddress);
      const territory = getTerritoryFromZone(zone);
      const market = getMarketContext(territory);

      // 2. Metrics & Classification
      const usage = parseNum(parsed.totalUsage);
      const totalAmount = parseNum(parsed.totalAmountDue);
      const peakDemand = parseNum(parsed.peakDemand);
      const energyCharges = parseNum(parsed.energyChargeTotal);
      const deliveryCharges = parseNum(parsed.deliveryChargeTotal);
      const demandCharges = parseNum(parsed.demandRatchetCharge);

      console.log(`[Bill Debugger] Normalized Metrics:`, { usage, peakDemand, totalAmount, deliveryCharges });

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
        provider: parsed.providerName || parsed.retailPlanName || 'Unknown',
        productType: parsed.productType || 'Unknown',
        contractEndDate: parsed.contractEndDate
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
              console.log(`[Bill Debugger] Raw AI JSON:`, jsonString);
              const parsed = JSON.parse(jsonString);
              console.log(`[Bill Debugger] Parsed Fields:`, {
                customerName: parsed.customerName,
                usage: parsed.totalUsage,
                demand: parsed.peakDemand,
                address: parsed.serviceAddress,
                product: parsed.productType
              });
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
