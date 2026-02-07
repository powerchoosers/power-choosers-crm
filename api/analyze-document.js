import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { supabaseAdmin } from './_supabase.js';

/**
 * AI-powered document analysis for Nodal Point CRM.
 * Handles both standard bills and signed contracts.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const geminiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      logger.error('[Analyze Document] Missing Gemini configuration');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: Gemini key missing' }));
      return;
    }

    const { accountId, filePath, fileName } = req.body;

    if (!accountId || !filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing accountId or filePath' }));
      return;
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    // 1. Download file from Supabase Storage
    logger.log('[Analyze Document] Attempting download from vault:', filePath);
    
    let fileData;
    let downloadError;
    
    // Try direct download first
    const downloadResult = await supabaseAdmin
      .storage
      .from('vault')
      .download(filePath);
    
    fileData = downloadResult.data;
    downloadError = downloadResult.error;

    // If direct download fails, try using signed URL method
    if (downloadError || !fileData) {
      logger.warn('[Analyze Document] Direct download failed, trying signed URL method...', {
        error: downloadError?.message,
        filePath
      });
      
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
          .storage
          .from('vault')
          .createSignedUrl(filePath, 60);
        
        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error(signedUrlError?.message || 'Failed to create signed URL');
        }
        
        // Fetch the file using the signed URL
        const response = await fetch(signedUrlData.signedUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        fileData = blob;
        downloadError = null;
        logger.log('[Analyze Document] Signed URL method succeeded');
      } catch (fallbackError) {
        logger.error('[Analyze Document] Both download methods failed:', {
          originalError: downloadError?.message,
          fallbackError: fallbackError.message,
          filePath
        });
      }
    }

    if (downloadError || !fileData) {
      logger.error('[Analyze Document] Final Download Error:', {
        error: downloadError,
        message: downloadError?.message,
        statusCode: downloadError?.statusCode,
        filePath,
        hasFileData: !!fileData
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to download file from storage',
        details: downloadError?.message || 'No file data returned',
        filePath 
      }));
      return;
    }
    
    logger.log('[Analyze Document] File downloaded successfully, size:', fileData.size);

    // 2. Prepare file for Gemini
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    
    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: fileData.type || 'application/pdf',
      },
    };

    // 3. Construct Prompt
    const prompt = `
    You are an expert energy analyst for Nodal Point CRM. Analyze this document.
    
    Task 1: Classify the document type.
    - "SIGNED_CONTRACT": A signed Energy Service Agreement (ESA) or similar binding contract.
    - "BILL": A standard utility bill or invoice.
    - "OTHER": Anything else.

    Task 2: Extract key data fields.
    - contract_end_date: The specific expiration date. If not found, estimate based on term length or service end date.
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: Estimated annual kWh. If a monthly bar chart exists, sum it up. If only one month, multiply by 12.
    - monthly_kwh: The total kWh consumed in the billing period (for load factor calculation).
    - peak_demand_kw: The peak demand in kW during the billing period (often labeled as "Demand", "Peak kW", "Max Demand").
    - billing_days: Number of days in the billing period (to calculate accurate load factor).
    - esids: An array of ALL ESI ID numbers (17-22 digits) found in the document. Include EVERY ESI ID you find, with their service addresses.

    CRITICAL: Extract ALL ESI IDs from the document. Bills often have multiple meters listed.

    Return ONLY a JSON object with this structure:
    {
      "type": "SIGNED_CONTRACT" | "BILL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number (e.g., 0.045) or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "monthly_kwh": number or null,
        "peak_demand_kw": number or null,
        "billing_days": number or null,
        "esids": [
          { "id": "10000000000000000000", "address": "123 Main St, Dallas, TX 75201", "rate": "0.045", "end_date": "03/25" }
        ]
      }
    }
    `;

    // 4. Call Gemini
    const result = await model.generateContent([prompt, filePart]);
    const responseText = result.response.text();
    
    // Clean and parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    logger.log('[Analyze Document] Gemini Analysis Result:', analysis);

    const { type, data } = analysis || {};
    if (!data || typeof data !== 'object') {
      logger.warn('[Analyze Document] No data object in analysis, skipping DB updates');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, analysis }));
      return;
    }

    // 5. Update Database based on findings
    const updates = {};

    if (data.contract_end_date) updates.contract_end_date = data.contract_end_date;
    if (data.strike_price) updates.current_rate = String(data.strike_price);
    if (data.supplier) updates.electricity_supplier = data.supplier;
    if (data.annual_usage) updates.annual_usage = String(data.annual_usage);

    // Calculate Load Factor
    // Formula: Load Factor = (Total kWh) / (Peak Demand kW × Hours in Period)
    // Result is a decimal between 0 and 1 (e.g., 0.65 = 65% load factor)
    if (data.monthly_kwh && data.peak_demand_kw && data.billing_days) {
      const hoursInPeriod = data.billing_days * 24;
      const loadFactor = data.monthly_kwh / (data.peak_demand_kw * hoursInPeriod);
      
      // Clamp between 0 and 1, and round to 3 decimal places
      const clampedLoadFactor = Math.min(Math.max(loadFactor, 0), 1);
      updates.load_factor = Number(clampedLoadFactor.toFixed(3));
      
      logger.log('[Analyze Document] Load Factor Calculated:', {
        monthly_kwh: data.monthly_kwh,
        peak_demand_kw: data.peak_demand_kw,
        billing_days: data.billing_days,
        hours: hoursInPeriod,
        load_factor: updates.load_factor
      });
    }

    // When a bill or signed contract lands in Data Locker, mark account (and linked contacts) as customer
    if (type === 'SIGNED_CONTRACT' || type === 'BILL') {
      updates.status = 'CUSTOMER';
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', accountId);

      if (updateError) logger.error('[Analyze Document] Account Update Error:', updateError);

      // Sync linked contacts to Customer so People list shows "Client" immediately
      if (updates.status === 'CUSTOMER') {
        const { error: contactsError } = await supabaseAdmin
          .from('contacts')
          .update({ status: 'Customer' })
          .eq('accountId', accountId);
        if (contactsError) logger.error('[Analyze Document] Contacts status sync error:', contactsError);
      }
    }

    // Insert Meters (ESIDs) – requires unique constraint on meters(esid); see migration 20260202175056
    if (data.esids && Array.isArray(data.esids) && data.esids.length > 0) {
      logger.log('[Analyze Document] Processing ESIDs:', data.esids.length);

      const metersToInsert = data.esids
        .filter((m) => m && (m.id != null && String(m.id).trim() !== ''))
        .map((m) => ({
          account_id: accountId,
          esid: String(m.id).trim(),
          service_address: m.address != null ? String(m.address).trim() : null,
          rate: m.rate != null ? String(m.rate) : null,
          end_date: m.end_date != null ? String(m.end_date) : null,
          status: 'Active',
          metadata: {
            source: 'ai_extraction',
            document: fileName,
            extracted_at: new Date().toISOString()
          }
        }));

      if (metersToInsert.length > 0) {
        const { error: meterError } = await supabaseAdmin
          .from('meters')
          .upsert(metersToInsert, { onConflict: 'esid' });

        if (meterError) {
          logger.error('[Analyze Document] Meter Insert Error:', meterError);
        } else {
          logger.log('[Analyze Document] Successfully inserted/updated', metersToInsert.length, 'meters');
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, analysis }));

  } catch (error) {
    logger.error('[Analyze Document] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: error.message || 'Unknown analysis error',
      details: error.toString()
    }));
  }
}
