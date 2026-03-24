import { cors } from './_cors.js';
import logger from './_logger.js';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

function normalizeEsid(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 17 || digits.length > 22) return null;
  return digits;
}

function normalizeAddress(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeAddressKey(value) {
  return normalizeAddress(value).toUpperCase();
}

function extractAddressFromServiceEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return normalizeAddress(entry);
  if (typeof entry === 'object' && typeof entry.address === 'string') {
    return normalizeAddress(entry.address);
  }
  return '';
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function monthSortKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Handles common patterns like "Jan 2026", "January 2026", "2026-01", etc.
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) return timestamp;

  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const match = raw.toLowerCase().match(/([a-z]{3,9})\s+(\d{4})/);
  if (!match) return null;
  const monthKey = match[1].slice(0, 3);
  const year = Number(match[2]);
  const month = monthMap[monthKey];
  if (month == null || !Number.isFinite(year)) return null;
  return Date.UTC(year, month, 1);
}

function normalizeUsageHistory(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;

      // Actual KWH is the authoritative usage column in utility usage exports.
      const actualKwh = parseNumber(
        row.actual_kwh ??
        row.actualKwh ??
        row.actualKWH ??
        row['Actual KWH'] ??
        row.kwh
      );

      if (actualKwh == null) return null;

      return {
        month: String(row.month ?? row.period ?? row.billing_month ?? '').trim(),
        kwh: actualKwh,
        billed_kw: parseNumber(row.billed_kw ?? row.billedKw ?? row['Billed KW']) ?? 0,
        actual_kw: parseNumber(row.actual_kw ?? row.actualKw ?? row.metered_kw ?? row['Metered KW']) ?? 0,
        tdsp_charges: parseNumber(row.tdsp_charges ?? row.tdspCharges ?? row['TDSP Charges']) ?? 0,
        esid: normalizeEsid(row.esid ?? row.esi_id ?? row.esiId) || null,
        service_address: normalizeAddress(row.service_address ?? row.address ?? row.site ?? row.site_name) || null
      };
    })
    .filter(Boolean);
}

function deriveAnnualUsageFromHistory(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const withSort = rows
    .map((row) => ({ row, sortKey: monthSortKey(row.month) }))
    .filter((x) => x.sortKey != null);

  // Fall back to raw rows if month parsing fails.
  const source = withSort.length > 0
    ? withSort.sort((a, b) => b.sortKey - a.sortKey).map((x) => x.row)
    : rows;

  const latestTwelve = source.slice(0, 12);
  if (latestTwelve.length === 0) return null;

  const total = latestTwelve.reduce((sum, row) => sum + (parseNumber(row.kwh) || 0), 0);
  return total > 0 ? Math.round(total) : null;
}

/**
 * AI-powered document analysis for Nodal Point CRM.
 * Handles bills, usage files, contracts, proposals, and LOEs.
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
    const lowerFileName = safeFileName.toLowerCase();
    const isCsvOrText =
      mimeType.includes('csv') ||
      mimeType.includes('text') ||
      lowerFileName.endsWith('.csv') ||
      lowerFileName.endsWith('.txt') ||
      lowerFileName.endsWith('.tsv');

    const isExcel =
      mimeType.includes('spreadsheetml') ||
      mimeType.includes('ms-excel') ||
      lowerFileName.endsWith('.xlsx') ||
      lowerFileName.endsWith('.xls');

    let textContentSnippet = "";
    if (isCsvOrText) {
      const fullText = Buffer.from(arrayBuffer).toString('utf-8');
      // Cap text to avoid overwhelming context, but large enough for monthly/daily interval CSVs
      textContentSnippet = fullText.substring(0, 50000);
    } else if (isExcel) {
      // Convert Excel to CSV text so the AI can read it like a CSV
      try {
        const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
        const csvParts = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          if (csv.trim()) {
            csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
          }
        }
        textContentSnippet = csvParts.join('\n\n').substring(0, 50000);
        logger.log('[Analyze Document] Excel converted to CSV text, length:', textContentSnippet.length);
      } catch (xlsxErr) {
        logger.error('[Analyze Document] Excel parse failed:', xlsxErr.message);
      }
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
    - "LOE": A Letter of Engagement, engagement letter, scope-confirmation letter, or advisory onboarding document that formalizes a service relationship without being a full pricing proposal or contract. Use this for documents titled "LOE", "Letter of Engagement", "General LOE", or similar engagement letters.
      WHEN IN DOUBT between LOE and PROPOSAL, use LOE for service-scope or engagement letters and PROPOSAL for actual pricing/quote/pitch packages.
    - "PROPOSAL": Any document proposing a service, engagement, or contract to a prospect or customer that is not a standalone LOE. This covers pricing proposals, energy quotes, pitch decks, advisory proposals, and commercial service proposals.
      WHEN IN DOUBT between PROPOSAL and OTHER, classify as PROPOSAL if the document is addressed to a prospect and proposes a clear service offering.
    - "OTHER": Anything else that does not fit the above categories.

    Task 2: Extract key data fields.
    - contract_end_date: The specific expiration date (YYYY-MM-DD).
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: IF THIS IS A USAGE DATA FILE (like a CSV/XLSX usage profile) spanning 12 or 13 months, CALCULATE the EXACT 12-month annual usage across the most recent 12 months in the file.
      IMPORTANT: when the file has an "Actual KWH" column, use that as the kWh source of truth (not Metered KW or Billed KW).
      Otherwise, extract estimated annual kWh if present.
    - monthly_kwh: The total kWh consumed in the billing period.
    - billing_days: Number of days in the billing period.
    - esids: An array of ALL ESI ID numbers (17-22 digits) found in the document. Include service addresses if found.
    - usage_history: When usage data is present, return monthly rows with these exact keys:
      { "month": "MMM YYYY", "kwh": number, "billed_kw": number|null, "actual_kw": number|null, "tdsp_charges": number|null, "esid": "string|null", "service_address": "string|null" }.
      If an "Actual KWH" column exists, map that value into "kwh".
      For multi-site files, include one row per site per month (do not collapse sites together).

    Return ONLY a JSON object:
    {
      "type": "SIGNED_CONTRACT" | "CONTRACT" | "BILL" | "USAGE_DATA" | "LOE" | "PROPOSAL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "monthly_kwh": number or null,
        "billing_days": number or null,
        "esids": [{ "id": "string", "address": "string" }],
        "usage_history": [{ "month": "MMM YYYY", "kwh": number, "billed_kw": number, "actual_kw": number, "tdsp_charges": number, "esid": "string", "service_address": "string" }]
      }
    }
    `;

    if (isCsvOrText || isExcel) {
      prompt += `\n\n[DOCUMENT CONTENT START]\n${textContentSnippet}\n[DOCUMENT CONTENT END]\n`;
    }

    let analysis = null;

    // Helper block to construct message content to avoid sending text files as image_url
    const buildMessageContent = () => {
      let contentArray = [{ type: 'text', text: prompt }];
      // CSV, text, and Excel files are sent as inline text (no binary attachment)
      if (!isCsvOrText && !isExcel) {
        const isPdf = mimeType === 'application/pdf';
        const isImage = mimeType.startsWith('image/');
        const fileUrlContent = isPdf ? base64Data : `data:${mimeType};base64,${base64Data}`;
        const attachmentType = isImage ? 'image_url' : 'file_url';
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
    const normalizedUsageHistory = normalizeUsageHistory(data?.usage_history);
    const derivedAnnualUsageFromHistory = deriveAnnualUsageFromHistory(normalizedUsageHistory);

    if (normalizedUsageHistory.length > 0) {
      data.usage_history = normalizedUsageHistory;
    }
    if (derivedAnnualUsageFromHistory != null) {
      data.annual_usage = derivedAnnualUsageFromHistory;
    }

    // 5. Update Database
    const documentTypeMap = {
      SIGNED_CONTRACT: 'CONTRACT',
      CONTRACT: 'CONTRACT',
      BILL: 'INVOICE',
      USAGE_DATA: 'USAGE_DATA',
      LOE: 'LOE',
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
    const { data: accountSnapshot } = await supabaseAdmin
      .from('accounts')
      .select('metadata, service_addresses')
      .eq('id', accountId)
      .single();
    // Bills and usage data → apply extracted fields immediately.
    // Contracts (signed or unsigned) → data is stored in document metadata only;
    // account fields are applied at actual signing time via /api/signatures/execute.
    const shouldApplyUsageFieldsNow = type === 'BILL' || type === 'USAGE_DATA';
    if (shouldApplyUsageFieldsNow) {
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
      const currentMetadata = accountSnapshot?.metadata || {};
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

    // SIGNED_CONTRACT and CONTRACT: status/deal changes are deferred to
    // /api/signatures/execute, which fires only after the contact actually signs.

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

    // Insert/update meters (skip exact duplicates, update changed addresses only)
    let meterSyncSummary = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0
    };

    if (data.esids && Array.isArray(data.esids) && data.esids.length > 0) {
      const nowIso = new Date().toISOString();
      const incomingByEsid = new Map();

      for (const row of data.esids) {
        const normalizedEsid = normalizeEsid(row?.id);
        if (!normalizedEsid) continue;

        const nextAddress = normalizeAddress(row?.address);
        const existing = incomingByEsid.get(normalizedEsid);
        if (!existing || (!existing.service_address && nextAddress)) {
          incomingByEsid.set(normalizedEsid, {
            esid: normalizedEsid,
            service_address: nextAddress || null
          });
        }
      }

      const incomingMeters = Array.from(incomingByEsid.values());
      if (incomingMeters.length > 0) {
        const esids = incomingMeters.map((m) => m.esid);
        const { data: existingMeters } = await supabaseAdmin
          .from('meters')
          .select('id, account_id, esid, service_address, metadata')
          .in('esid', esids);

        const existingByEsid = new Map(
          (existingMeters || []).map((m) => [m.esid, m])
        );

        const metersToInsert = [];
        const metersToUpdate = [];

        for (const meter of incomingMeters) {
          const existing = existingByEsid.get(meter.esid);
          if (!existing) {
            metersToInsert.push({
              account_id: accountId,
              esid: meter.esid,
              service_address: meter.service_address,
              status: 'Active',
              metadata: {
                source: 'ai_extraction',
                document: fileName,
                extracted_at: nowIso,
                last_seen_at: nowIso
              }
            });
            continue;
          }

          // ESIDs are globally unique in this schema. Don't reassign across accounts.
          if (existing.account_id && existing.account_id !== accountId) {
            meterSyncSummary.conflicts += 1;
            continue;
          }

          const incomingAddressKey = normalizeAddressKey(meter.service_address);
          const existingAddressKey = normalizeAddressKey(existing.service_address);
          const shouldUpdateAddress =
            !!incomingAddressKey && incomingAddressKey !== existingAddressKey;

          if (!shouldUpdateAddress) {
            meterSyncSummary.skipped += 1;
            continue;
          }

          metersToUpdate.push({
            id: existing.id,
            service_address: meter.service_address,
            metadata: {
              ...(existing.metadata || {}),
              source: 'ai_extraction',
              document: fileName,
              extracted_at: nowIso,
              last_seen_at: nowIso
            }
          });
        }

        if (metersToInsert.length > 0) {
          await supabaseAdmin
            .from('meters')
            .insert(metersToInsert);
          meterSyncSummary.inserted = metersToInsert.length;
        }

        if (metersToUpdate.length > 0) {
          for (const meter of metersToUpdate) {
            await supabaseAdmin
              .from('meters')
              .update({
                service_address: meter.service_address,
                metadata: meter.metadata,
                updated_at: nowIso
              })
              .eq('id', meter.id);
          }
          meterSyncSummary.updated = metersToUpdate.length;
        }
      }
    }

    // Keep account-level service address array in sync with newly discovered meter addresses.
    const existingServiceAddresses = Array.isArray(accountSnapshot?.service_addresses)
      ? accountSnapshot.service_addresses
      : [];
    const existingAddressMap = new Map();
    for (const entry of existingServiceAddresses) {
      const addr = extractAddressFromServiceEntry(entry);
      const key = normalizeAddressKey(addr);
      if (!key) continue;
      existingAddressMap.set(key, entry);
    }

    const { data: accountMeters } = await supabaseAdmin
      .from('meters')
      .select('service_address')
      .eq('account_id', accountId);

    let addressAdded = false;
    for (const meter of accountMeters || []) {
      const addr = normalizeAddress(meter.service_address);
      const key = normalizeAddressKey(addr);
      if (!key || existingAddressMap.has(key)) continue;
      existingAddressMap.set(key, { address: addr });
      addressAdded = true;
    }

    if (addressAdded) {
      await supabaseAdmin
        .from('accounts')
        .update({ service_addresses: Array.from(existingAddressMap.values()) })
        .eq('id', accountId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, analysis, meterSync: meterSyncSummary }));

  } catch (error) {
    logger.error('[Analyze Document] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error.message || 'Unknown analysis error'
    }));
  }
}
