import { createClient } from '@supabase/supabase-js';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { supabaseAdmin } from './_supabase.js';

/**
 * AI-powered document analysis for Nodal Point CRM.
 * Handles both standard bills and signed contracts.
 * Primary: Perplexity (Sonar-Pro), Fallback: OpenRouter (gpt-4o-mini)
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;

    if (!perplexityApiKey && !openRouterKey) {
      logger.error('[Analyze Document] Missing AI configuration');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: AI keys missing' }));
      return;
    }

    const { accountId, filePath, fileName } = req.body;

    if (!accountId || !filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing accountId or filePath' }));
      return;
    }

    // 1. Download file from Supabase Storage
    logger.log('[Analyze Document] Attempting download from vault:', filePath);

    let fileData;
    let downloadError;

    const downloadResult = await supabaseAdmin
      .storage
      .from('vault')
      .download(filePath);

    fileData = downloadResult.data;
    downloadError = downloadResult.error;

    if (downloadError || !fileData) {
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
          .storage
          .from('vault')
          .createSignedUrl(filePath, 60);

        if (!signedUrlError && signedUrlData?.signedUrl) {
          const response = await fetch(signedUrlData.signedUrl);
          if (response.ok) {
            fileData = await response.blob();
            downloadError = null;
          }
        }
      } catch (fallbackError) {
        logger.error('[Analyze Document] Fallback download failed');
      }
    }

    if (downloadError || !fileData) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to download file from storage' }));
      return;
    }

    logger.log('[Analyze Document] File downloaded successfully');

    // 2. Prepare file data
    const arrayBuffer = await fileData.arrayBuffer();
    const rawBase64 = Buffer.from(arrayBuffer).toString('base64');
    // Ensure we don't have a prefix in the raw variable
    const base64Data = rawBase64.replace(/^data:.*?;base64,/, '');
    let mimeType = fileData.type || 'application/pdf';

    const safeFileName = typeof fileName === 'string' ? fileName : '';
    const prompt = `
    You are an expert energy analyst for Nodal Point CRM. Analyze this document.
    
    The original filename is: "${safeFileName}"
    Use the filename as a strong signal for classification (e.g. "OncorSummaryUsageData", "annual usage", "12 month usage", "usage data" → USAGE_DATA).
    
    Task 1: Classify the document type.
    - "SIGNED_CONTRACT": A signed Energy Service Agreement (ESA) or similar binding contract.
    - "BILL": A standard utility bill or invoice.
    - "USAGE_DATA": Usage/telemetry: ERCOT or utility usage summaries, OncorSummaryUsageData, annual usage, 12-month usage, CSV usage data.
    - "PROPOSAL": Sales proposals, RFP responses, quotes, pricing proposals.
    - "OTHER": Anything else.

    Task 2: Extract key data fields.
    - contract_end_date: The specific expiration date (YYYY-MM-DD).
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: Estimated annual kWh.
    - monthly_kwh: The total kWh consumed in the billing period.
    - peak_demand_kw: The peak demand in kW during the billing period.
    - billing_days: Number of days in the billing period.
    - esids: An array of ALL ESI ID numbers (17-22 digits) found in the document. Include service addresses if found.

    Return ONLY a JSON object:
    {
      "type": "SIGNED_CONTRACT" | "BILL" | "USAGE_DATA" | "PROPOSAL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "monthly_kwh": number or null,
        "peak_demand_kw": number or null,
        "billing_days": number or null,
        "esids": [{ "id": "string", "address": "string" }]
      }
    }
    `;

    let analysis = null;

    // 3. Try Perplexity (Sonar-Pro)
    if (perplexityApiKey) {
      try {
        logger.log('[Analyze Document] Trying Perplexity...');
        const isPdf = mimeType === 'application/pdf';
        const fileUrlContent = isPdf ? base64Data : `data:${mimeType};base64,${base64Data}`;
        const attachmentType = isPdf ? 'file_url' : 'image_url';

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${perplexityApiKey}`,
          },
          body: JSON.stringify({
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
            // response_format: { type: 'json_object' }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            analysis = JSON.parse(content);
          }
        }
      } catch (e) {
        logger.error('[Analyze Document] Perplexity error:', e.message);
      }
    }

    // 4. Fallback to OpenRouter
    if (!analysis && openRouterKey) {
      try {
        logger.log('[Analyze Document] Falling back to OpenRouter...');
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-5-nano',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: mimeType === 'application/pdf' ? 'file_url' : 'image_url',
                    [mimeType === 'application/pdf' ? 'file_url' : 'image_url']: {
                      url: mimeType === 'application/pdf' ? base64Data : `data:${mimeType};base64,${base64Data}`
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
            analysis = JSON.parse(content);
          }
        } else {
          const errText = await response.text();
          console.error('[Analyze Document] OpenRouter Error:', response.status, errText);
        }
      } catch (e) {
        logger.error('[Analyze Document] OpenRouter error:', e.message);
      }
    }

    if (!analysis) {
      throw new Error('Analysis failed on all available models');
    }

    logger.log('[Analyze Document] Analysis successful:', analysis.type);

    const { type, data } = analysis;

    // 5. Update Database
    const documentTypeMap = {
      SIGNED_CONTRACT: 'CONTRACT',
      BILL: 'INVOICE',
      USAGE_DATA: 'USAGE_DATA',
      PROPOSAL: 'PROPOSAL',
      OTHER: null,
    };

    const documentType = documentTypeMap[type];
    if (documentType) {
      await supabaseAdmin
        .from('documents')
        .update({ document_type: documentType })
        .eq('account_id', accountId)
        .eq('storage_path', filePath);
    }

    const updates = {};
    if (data.contract_end_date) updates.contract_end_date = data.contract_end_date;
    if (data.strike_price) updates.current_rate = String(data.strike_price);
    if (data.supplier) updates.electricity_supplier = data.supplier;
    if (data.annual_usage) updates.annual_usage = String(data.annual_usage);

    if (data.monthly_kwh && data.peak_demand_kw && data.billing_days) {
      const hoursInPeriod = data.billing_days * 24;
      const loadFactor = data.monthly_kwh / (data.peak_demand_kw * hoursInPeriod);
      updates.load_factor = Number(Math.min(Math.max(loadFactor, 0), 1).toFixed(3));
    }

    if (type === 'SIGNED_CONTRACT' || type === 'BILL') {
      updates.status = 'CUSTOMER';
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', accountId);

      if (updates.status === 'CUSTOMER') {
        await supabaseAdmin
          .from('contacts')
          .update({ status: 'Customer' })
          .eq('accountId', accountId);
      }
    }

    // Insert Meters
    if (data.esids && Array.isArray(data.esids) && data.esids.length > 0) {
      const metersToInsert = data.esids
        .filter((m) => m?.id)
        .map((m) => ({
          account_id: accountId,
          esid: String(m.id).trim(),
          service_address: m.address ? String(m.address).trim() : null,
          status: 'Active',
          metadata: {
            source: 'ai_extraction',
            document: fileName,
            extracted_at: new Date().toISOString()
          }
        }));

      if (metersToInsert.length > 0) {
        await supabaseAdmin
          .from('meters')
          .upsert(metersToInsert, { onConflict: 'esid' });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, analysis }));

  } catch (error) {
    logger.error('[Analyze Document] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error.message || 'Unknown analysis error'
    }));
  }
}
