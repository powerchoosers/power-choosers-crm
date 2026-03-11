import { createClient } from '@supabase/supabase-js';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { supabaseAdmin } from '@/lib/supabase';

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
    const isCsvOrText = mimeType.includes('csv') || mimeType.includes('text') || safeFileName.toLowerCase().endsWith('.csv');

    let textContentSnippet = "";
    if (isCsvOrText) {
      const fullText = Buffer.from(arrayBuffer).toString('utf-8');
      // Cap text to avoid overwhelming context, but large enough for monthly/daily interval CSVs
      textContentSnippet = fullText.substring(0, 50000);
    }

    let prompt = `
    You are an expert energy analyst for Nodal Point CRM. Analyze this document.
    
    The original filename is: "${safeFileName}"
    Use the filename as a strong signal for classification (e.g. "OncorSummaryUsageData", "annual usage", "12 month usage", "usage data", ".csv" → USAGE_DATA).
    
    Task 1: Classify the document type.
    - "SIGNED_CONTRACT": A signed Energy Service Agreement (ESA) or similar binding contract with visible signatures, signature blocks, or executed/countersigned language.
    - "CONTRACT": An unsigned contract, draft contract, MSA, ESA template, or execution-ready agreement without signature. Also blank contracts awaiting signature.
    - "BILL": A standard utility bill, invoice, or monthly statement. This explicitly includes documents titled in Spanish such as "recibo", "factura", "recibos luz", "servicio electrico" or any variation indicating a utility bill.
    - "USAGE_DATA": Usage/telemetry: ERCOT or utility usage summaries, OncorSummaryUsageData, annual usage, 12-month or 13-month usage, CSV usage data profiles.
    - "PROPOSAL": ANY document proposing a service, engagement, or contract to a prospect or customer. This is a BROAD category covering TWO types:
        TYPE A — Energy Pricing Proposals: Documents with proposed kWh rates, $/MWh pricing, contract terms, and energy cost breakdowns from a supplier or broker. Examples: "First Texas Energy Proposal", "Energy Supply Quote", "Rate Proposal", "Pricing Sheet".
        TYPE B — Advisory / Pitch / Outreach Proposals: Business development documents, energy audit proposals, broker engagement letters, consulting proposals, tariff forensics presentations, commercial real estate energy proposals, or any document presenting a service offering to a prospect — even if they contain NO energy rates. Examples: "Nodal Point Proposal", "Energy Audit Proposal", "Energy Advisory Presentation", documents addressed to a company presenting services or a program.
        WHEN IN DOUBT between PROPOSAL and OTHER, classify as PROPOSAL if the document is addressed to a prospect and proposes any kind of engagement.
    - "OTHER": Anything else that does not fit the above categories.

    Task 2: Extract key data fields.
    - contract_end_date: The specific expiration date (YYYY-MM-DD).
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: IF THIS IS A USAGE DATA FILE (like a CSV or usage profile) spanning 12 or 13 months, CALCULATE the EXACT 12-month annual usage across the most recent 12 months in the file. Otherwise, extract estimated annual kWh if present.
    - monthly_kwh: The total kWh consumed in the billing period.
    - billing_days: Number of days in the billing period.
    - esids: An array of ALL ESI ID numbers (17-22 digits) found in the document. Include service addresses if found.

    Return ONLY a JSON object:
    {
      "type": "SIGNED_CONTRACT" | "CONTRACT" | "BILL" | "USAGE_DATA" | "PROPOSAL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "monthly_kwh": number or null,
        "billing_days": number or null,
        "esids": [{ "id": "string", "address": "string" }]
      }
    }
    `;

    if (isCsvOrText) {
      prompt += `\n\n[DOCUMENT CONTENT START]\n${textContentSnippet}\n[DOCUMENT CONTENT END]\n`;
    }

    let analysis = null;

    // Helper block to construct message content to avoid sending text files as image_url
    const buildMessageContent = () => {
      let contentArray = [{ type: 'text', text: prompt }];
      if (!isCsvOrText) {
        const isPdf = mimeType === 'application/pdf';
        const fileUrlContent = isPdf ? base64Data : `data:${mimeType};base64,${base64Data}`;
        const attachmentType = isPdf ? 'file_url' : 'image_url';
        contentArray.push({
          type: attachmentType,
          [attachmentType]: { url: fileUrlContent }
        });
      }
      return contentArray;
    };

    // 3. Try Perplexity (Sonar-Pro)
    if (perplexityApiKey) {
      try {
        logger.log('[Analyze Document] Trying Perplexity...');

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
                content: buildMessageContent()
              }
            ]
            // response_format: { type: 'json_object' }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            console.log('[Analyze Document] Raw Perplexity Response:', content);
            let cleanContent = content.trim();
            // Robust JSON extraction
            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleanContent = jsonMatch[0];
            }
            analysis = JSON.parse(cleanContent);
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
                content: buildMessageContent()
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
      CONTRACT: 'CONTRACT',
      BILL: 'INVOICE',
      USAGE_DATA: 'USAGE_DATA',
      PROPOSAL: 'PROPOSAL',
      OTHER: null,
    };

    const documentType = documentTypeMap[type];
    const { data: existingDocument } = await supabaseAdmin
      .from('documents')
      .select('id, metadata')
      .eq('account_id', accountId)
      .eq('storage_path', filePath)
      .maybeSingle();

    if (existingDocument?.id) {
      const nextMetadata = {
        ...(existingDocument.metadata || {}),
        ai_extraction: {
          type,
          data,
          analyzed_at: new Date().toISOString(),
          source: 'analyze-document'
        }
      };

      const documentUpdates = { metadata: nextMetadata };
      if (documentType) documentUpdates.document_type = documentType;

      await supabaseAdmin
        .from('documents')
        .update(documentUpdates)
        .eq('id', existingDocument.id);
    } else if (documentType) {
      await supabaseAdmin
        .from('documents')
        .update({ document_type: documentType })
        .eq('account_id', accountId)
        .eq('storage_path', filePath);
    }

    const updates = {};
    // Bills and usage data → apply extracted fields immediately
    const shouldApplyUsageFieldsNow = type === 'BILL' || type === 'USAGE_DATA';
    // Signed contracts → apply contract fields to account (supplier, rate, end date, volume)
    const shouldApplyContractFields = type === 'SIGNED_CONTRACT';
    if (shouldApplyUsageFieldsNow || shouldApplyContractFields) {
      if (data.contract_end_date) updates.contract_end_date = data.contract_end_date;
      if (data.strike_price) updates.current_rate = String(data.strike_price);
      if (data.supplier) updates.electricity_supplier = data.supplier;
      if (data.annual_usage) updates.annual_usage = String(data.annual_usage);
    }

    if (data.monthly_kwh && data.peak_demand_kw && data.billing_days) {
      const hoursInPeriod = data.billing_days * 24;
      const loadFactor = data.monthly_kwh / (data.peak_demand_kw * hoursInPeriod);
      updates.load_factor = Number(Math.min(Math.max(loadFactor, 0), 1).toFixed(3));
    }

    if (data.usage_history && Array.isArray(data.usage_history) && data.usage_history.length > 0) {
      const { data: currentAcct } = await supabaseAdmin
        .from('accounts')
        .select('metadata')
        .eq('id', accountId)
        .single();

      const currentMetadata = currentAcct?.metadata || {};
      updates.metadata = {
        ...currentMetadata,
        usageHistory: data.usage_history
      };
    }

    // Status and Deal Pipeline Transitions
    let dealStageToSet = null;

    if (type === 'BILL') {
      updates.status = 'Active';
      dealStageToSet = 'AUDITING';
    }

    if (type === 'SIGNED_CONTRACT') {
      // Signed contract = confirmed customer, move deal to secured
      updates.status = 'CUSTOMER';
      dealStageToSet = 'SECURED';
    }

    if (Object.keys(updates).length > 0) {
      // 1. Update Account Record
      await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', accountId);

      // 2. Cascade Status to Contacts
      if (updates.status) {
        await supabaseAdmin
          .from('contacts')
          .update({ status: updates.status })
          .eq('accountId', accountId);
      }
    }

    // 3. Update or Create the Deal/Contract Record
    if (dealStageToSet) {
      const { data: existingDeals } = await supabaseAdmin
        .from('deals')
        .select('id, stage')
        .eq('accountId', accountId)
        .order('createdAt', { ascending: false })
        .limit(1);

      if (existingDeals && existingDeals.length > 0) {
        // Only update the stage if it represents a forward progression, 
        // but for simplicity, we override to reflect the parsed document status.
        await supabaseAdmin
          .from('deals')
          .update({ stage: dealStageToSet, updatedAt: new Date().toISOString() })
          .eq('id', existingDeals[0].id);
      } else {
        // Create a new Deal record if none exists
        const { data: accountData } = await supabaseAdmin
          .from('accounts')
          .select('name, ownerId')
          .eq('id', accountId)
          .single();

        await supabaseAdmin
          .from('deals')
          .insert({
            id: crypto.randomUUID(),
            title: `Contract Revision: ${accountData?.name || 'Account'}`,
            accountId: accountId,
            stage: dealStageToSet,
            probability: dealStageToSet === 'SECURED' ? 100 : 25,
            ownerId: accountData?.ownerId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
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
