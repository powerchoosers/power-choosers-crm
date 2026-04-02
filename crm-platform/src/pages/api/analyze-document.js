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

function normalizeDocumentName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFilenameDocumentType(fileName) {
  const normalized = normalizeDocumentName(fileName);
  if (!normalized) return null;

  if (/\b(letter of engagement|engagement letter|general loe|loe)\b/.test(normalized)) {
    return 'LOE';
  }

  return null;
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

function normalizeHeaderKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildRowLookup(row) {
  const lookup = new Map();
  if (!row || typeof row !== 'object') return lookup;

  for (const [key, value] of Object.entries(row)) {
    lookup.set(normalizeHeaderKey(key), value);
  }

  return lookup;
}

function getRowValue(lookup, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (const alias of keys) {
    const value = lookup.get(normalizeHeaderKey(alias));
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

function parseSpreadsheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF?.parse_date_code?.(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function formatUsageMonth(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function normalizeDemandUnit(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('mixed')) return 'mixed';
  if (raw.includes('kva')) return 'kVA';
  if (raw.includes('kw')) return 'kW';
  return null;
}

function extractDemandField(lookup, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  const candidates = [];

  for (const alias of keys) {
    const rawValue = getRowValue(lookup, alias);
    const numericValue = parseNumber(rawValue);
    if (numericValue == null) continue;

    const unit = normalizeDemandUnit(alias) || (normalizeHeaderKey(alias).includes('kva') ? 'kVA' : 'kW');
    candidates.push({ value: numericValue, unit });
  }

  if (candidates.length === 0) {
    return { value: null, unit: null };
  }

  const preferred = candidates.find((candidate) => Math.abs(candidate.value) > 0);
  return preferred || candidates[0];
}

function collectServiceAddress(lookup) {
  const parts = [
    getRowValue(lookup, ['Service Address 1', 'Service Address1', 'Service Address']),
    getRowValue(lookup, ['Service Address 2', 'Service Address2']),
    getRowValue(lookup, ['Service Address 3', 'Service Address3']),
  ]
    .map((part) => normalizeAddress(part))
    .filter(Boolean);

  if (parts.length > 0) {
    return normalizeAddress(parts.join(', '));
  }

  const fallback = normalizeAddress(
    getRowValue(lookup, ['Service Address', 'Address', 'Site Address', 'Service Location', 'Location'])
  );

  return fallback || '';
}

function normalizeStructuredUsageRow(row, sheetName) {
  if (!row || typeof row !== 'object') return null;

  const lookup = buildRowLookup(row);
  const actualKwh = parseNumber(getRowValue(lookup, ['Actual KWH', 'Actual KWh', 'Actual Usage', 'Usage', 'kWh', 'KWH']));

  if (actualKwh == null) return null;

  const esid = normalizeEsid(getRowValue(lookup, ['ESI ID', 'ESIID', 'ESI', 'ESI Id', 'ESI #', 'ESIID#', 'ESI Number']));
  const serviceAddress = collectServiceAddress(lookup);
  const endDate = parseSpreadsheetDate(getRowValue(lookup, ['End Date', 'Ending Date', 'Bill End Date', 'Billing End Date']));
  const startDate = parseSpreadsheetDate(getRowValue(lookup, ['Start Date', 'Beginning Date', 'Bill Start Date', 'Billing Start Date']));
  const monthDate = endDate || startDate;
  const month = formatUsageMonth(monthDate) || String(getRowValue(lookup, ['Month', 'Billing Month', 'Period']) ?? '').trim();
  const billedDemand = extractDemandField(lookup, ['Billed KW', 'Billed KVA', 'Billing KW', 'Billing KVA', 'Demand Billed', 'Billed Demand']);
  const actualDemand = extractDemandField(lookup, ['Metered KW', 'Metered KVA', 'Actual KW', 'Actual KVA', 'Peak KW', 'Peak KVA', 'Demand']);
  const tdspCharges = parseNumber(getRowValue(lookup, ['TDSP Charges', 'TDSP Charge', 'Delivery Charges', 'TDSP']));
  const powerFactor = parseNumber(getRowValue(lookup, ['Power Factor', 'PF']));
  const billingDays = startDate && endDate
    ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : null;

  return {
    month: month || '',
    kwh: actualKwh,
    billed_kw: billedDemand.value,
    actual_kw: actualDemand.value,
    billed_demand_unit: billedDemand.unit,
    actual_demand_unit: actualDemand.unit,
    tdsp_charges: tdspCharges,
    esid: esid || null,
    service_address: serviceAddress || null,
    billing_days: billingDays,
    power_factor: powerFactor,
    source_sheet: sheetName || null
  };
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
      const lookup = buildRowLookup(row);

      // Actual KWH is the authoritative usage column in utility usage exports.
      const actualKwh = parseNumber(
        getRowValue(lookup, ['Actual KWH', 'Actual KWh', 'Actual Usage', 'Usage', 'kWh', 'KWH']) ??
        row.actual_kwh ??
        row.actualKwh ??
        row.actualKWH ??
        row.kwh ??
        row.kwh_usage
      );

      if (actualKwh == null) return null;

      const billedDemand = extractDemandField(lookup, ['Billed KW', 'Billed KVA', 'Billing KW', 'Billing KVA', 'Demand Billed', 'Billed Demand']);
      const actualDemand = extractDemandField(lookup, ['Metered KW', 'Metered KVA', 'Actual KW', 'Actual KVA', 'Peak KW', 'Peak KVA', 'Demand']);

      return {
        month: String(row.month ?? row.period ?? row.billing_month ?? '').trim(),
        kwh: actualKwh,
        billed_kw: billedDemand.value,
        actual_kw: actualDemand.value,
        billed_demand_unit: normalizeDemandUnit(row.billed_demand_unit ?? row.billedDemandUnit ?? row.billed_unit ?? row.billedUnit) || billedDemand.unit,
        actual_demand_unit: normalizeDemandUnit(row.actual_demand_unit ?? row.actualDemandUnit ?? row.actual_unit ?? row.actualUnit) || actualDemand.unit,
        tdsp_charges: parseNumber(getRowValue(lookup, ['TDSP Charges', 'TDSP Charge', 'Delivery Charges', 'TDSP'])) ?? null,
        esid: normalizeEsid(getRowValue(lookup, ['ESI ID', 'ESIID', 'ESI', 'ESI Id', 'ESI #', 'ESIID#', 'ESI Number']) ?? row.esid ?? row.esi_id ?? row.esiId) || null,
        service_address: normalizeAddress(
          getRowValue(lookup, ['Service Address 1', 'Service Address1', 'Service Address 2', 'Service Address2', 'Service Address 3', 'Service Address3', 'Service Address']) ??
          row.service_address ??
          row.address ??
          row.site ??
          row.site_name
        ) || null,
        billing_days: parseNumber(getRowValue(lookup, ['Billing Days', 'Billing Day', 'Days']) ?? row.billing_days ?? row.billingDays) ?? null,
        power_factor: parseNumber(getRowValue(lookup, ['Power Factor', 'PF']) ?? row.power_factor ?? row.powerFactor) ?? null,
        source_sheet: String(row.source_sheet ?? row.sheet ?? '').trim() || null
      };
    })
    .filter(Boolean);
}

function deriveAnnualUsageFromHistory(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const monthlyTotals = new Map();

  for (const row of rows) {
    const month = String(row.month ?? '').trim();
    const kwh = parseNumber(row.kwh);
    if (!month || kwh == null) continue;

    const current = monthlyTotals.get(month) || 0;
    monthlyTotals.set(month, current + kwh);
  }

  if (monthlyTotals.size === 0) {
    const total = rows.reduce((sum, row) => sum + (parseNumber(row.kwh) || 0), 0);
    return total > 0 ? Math.round(total) : null;
  }

  const sortedMonths = Array.from(monthlyTotals.entries())
    .map(([month, total]) => ({
      month,
      total,
      sortKey: monthSortKey(month)
    }))
    .filter((entry) => entry.sortKey != null)
    .sort((a, b) => b.sortKey - a.sortKey);

  if (sortedMonths.length === 0) {
    const total = rows.reduce((sum, row) => sum + (parseNumber(row.kwh) || 0), 0);
    return total > 0 ? Math.round(total) : null;
  }

  const latestTwelve = sortedMonths.slice(0, 12);
  const total = latestTwelve.reduce((sum, entry) => sum + entry.total, 0);
  return total > 0 ? Math.round(total) : null;
}

function deriveLatestMonthUsage(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const monthlyTotals = new Map();
  for (const row of rows) {
    const month = String(row.month ?? '').trim();
    const kwh = parseNumber(row.kwh);
    if (!month || kwh == null) continue;
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + kwh);
  }

  if (monthlyTotals.size === 0) return null;

  const sortedMonths = Array.from(monthlyTotals.entries())
    .map(([month, total]) => ({
      month,
      total,
      sortKey: monthSortKey(month)
    }))
    .filter((entry) => entry.sortKey != null)
    .sort((a, b) => b.sortKey - a.sortKey);

  if (sortedMonths.length === 0) return null;
  const latest = sortedMonths[0];
  return latest.total > 0 ? Math.round(latest.total) : null;
}

function buildStructuredUsageAnalysis(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    return null;
  }

  const rows = [];
  const esids = new Map();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets?.[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    for (const row of rawRows) {
      const normalized = normalizeStructuredUsageRow(row, sheetName);
      if (!normalized) continue;
      rows.push(normalized);

      if (normalized.esid) {
        const existing = esids.get(normalized.esid);
        const nextAddress = normalized.service_address || null;
        if (!existing || (!existing.address && nextAddress)) {
          esids.set(normalized.esid, {
            id: normalized.esid,
            address: nextAddress
          });
        }
      }
    }
  }

  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const aKey = monthSortKey(a.month) ?? 0;
    const bKey = monthSortKey(b.month) ?? 0;
    if (aKey !== bKey) return aKey - bKey;
    const aSite = normalizeAddressKey(a.service_address || a.esid || '');
    const bSite = normalizeAddressKey(b.service_address || b.esid || '');
    return aSite.localeCompare(bSite);
  });

  const normalizedRows = normalizeUsageHistory(rows);
  const annualUsage = deriveAnnualUsageFromHistory(normalizedRows);
  const monthlyKwh = deriveLatestMonthUsage(normalizedRows);

  return {
    type: 'USAGE_DATA',
    data: {
      contract_end_date: null,
      strike_price: null,
      supplier: null,
      annual_usage: annualUsage,
      monthly_kwh: monthlyKwh,
      billing_days: null,
      esids: Array.from(esids.values()),
      usage_history: normalizedRows
    }
  };
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
    const canUseAI = Boolean(perplexityApiKey || openRouterKey);

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

    let workbook = null;
    let fullText = '';
    let structuredUsageAnalysis = null;
    let textContentSnippet = '';

    try {
      if (isCsvOrText) {
        fullText = Buffer.from(arrayBuffer).toString('utf-8');
        workbook = XLSX.read(fullText, { type: 'string', cellDates: true });
      } else if (isExcel) {
        workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer', cellDates: true });
      }
    } catch (parseErr) {
      logger.warn('[Analyze Document] Workbook parse failed, falling back to text snippet:', parseErr?.message || parseErr);
    }

    if (workbook) {
      structuredUsageAnalysis = buildStructuredUsageAnalysis(workbook);

      const csvParts = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) {
          csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
        }
      }
      textContentSnippet = csvParts.join('\n\n').substring(0, 50000);
      logger.log('[Analyze Document] Spreadsheet converted to CSV text, length:', textContentSnippet.length);
    } else if (isCsvOrText) {
      textContentSnippet = fullText.substring(0, 50000);
    }

    if (structuredUsageAnalysis) {
      logger.log('[Analyze Document] Structured usage file parsed locally; skipping AI extraction');
    } else if (!canUseAI) {
      logger.error('[Analyze Document] Missing AI configuration and no structured usage data available');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: AI keys missing' }));
      return;
    }

    let analysis = structuredUsageAnalysis;
    let prompt = null;

    if (!analysis) {
      prompt = `
    You are an expert energy analyst for Nodal Point CRM. Analyze this document.
    
    The original filename is: "${safeFileName}"
    Use the filename as a strong signal for classification (e.g. "OncorSummaryUsageData", "annual usage", "12 month usage", "usage data", ".csv" → USAGE_DATA).
    If the filename/title clearly says LOE, Letter of Engagement, Engagement Letter, or General LOE, classify it as LOE.
    
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
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g. 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: IF THIS IS A USAGE DATA FILE (like a CSV/XLSX usage profile) spanning 12 or 13 months, CALCULATE the EXACT 12-month annual usage across the most recent 12 months in the file.
      IMPORTANT: when the file has an "Actual KWH" column, use that as the kWh source of truth (not Metered KW or Billed KW).
      If demand is shown in kVA instead of kW, keep the number and set the matching demand unit field to "kVA" instead of converting it.
      Otherwise, extract estimated annual kWh if present.
    - monthly_kwh: The total kWh consumed in the billing period.
    - billing_days: Number of days in the billing period.
    - esids: An array of ALL ESI ID numbers (17-22 digits) found in the document. Include service addresses if found.
    - usage_history: When usage data is present, return monthly rows with these exact keys:
      { "month": "MMM YYYY", "kwh": number, "billed_kw": number|null, "actual_kw": number|null, "billed_demand_unit": "kW"|"kVA"|null, "actual_demand_unit": "kW"|"kVA"|null, "tdsp_charges": number|null, "esid": "string|null", "service_address": "string|null" }.
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
        "usage_history": [{ "month": "MMM YYYY", "kwh": number, "billed_kw": number, "actual_kw": number, "billed_demand_unit": "kW" | "kVA", "actual_demand_unit": "kW" | "kVA", "tdsp_charges": number, "esid": "string", "service_address": "string" }]
      }
    }
    `;

      if (isCsvOrText || isExcel) {
        prompt += `\n\n[DOCUMENT CONTENT START]\n${textContentSnippet}\n[DOCUMENT CONTENT END]\n`;
      }
    }

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
    if (analysis) {
      logger.log('[Analyze Document] Structured usage extraction ready; skipping AI calls');
    } else if (perplexityApiKey) {
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

    const filenameHintType = inferFilenameDocumentType(safeFileName);
    if (filenameHintType && analysis.type !== filenameHintType) {
      logger.log(
        `[Analyze Document] Overriding AI type ${analysis.type} with filename hint ${filenameHintType} for ${safeFileName}`
      );
      analysis = {
        ...analysis,
        type: filenameHintType
      };
    }

    logger.log('[Analyze Document] Analysis successful:', analysis.type);

    const { type } = analysis;
    const data = analysis.data && typeof analysis.data === 'object' ? analysis.data : {};
    analysis.data = data;
    const normalizedUsageHistory = normalizeUsageHistory(data?.usage_history);
    const derivedAnnualUsageFromHistory = deriveAnnualUsageFromHistory(normalizedUsageHistory);
    const derivedMonthlyUsage = deriveLatestMonthUsage(normalizedUsageHistory);
    const esidMapFromHistory = new Map();

    if (normalizedUsageHistory.length > 0) {
      data.usage_history = normalizedUsageHistory;
    }
    if (derivedAnnualUsageFromHistory != null) {
      data.annual_usage = derivedAnnualUsageFromHistory;
    }
    if (derivedMonthlyUsage != null && data.monthly_kwh == null) {
      data.monthly_kwh = derivedMonthlyUsage;
    }
    for (const row of normalizedUsageHistory) {
      if (!row?.esid) continue;
      const nextAddress = row.service_address || null;
      if (!esidMapFromHistory.has(row.esid) || (!esidMapFromHistory.get(row.esid)?.address && nextAddress)) {
        esidMapFromHistory.set(row.esid, { id: row.esid, address: nextAddress });
      }
    }
    if ((!Array.isArray(data.esids) || data.esids.length === 0) && esidMapFromHistory.size > 0) {
      data.esids = Array.from(esidMapFromHistory.values());
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
