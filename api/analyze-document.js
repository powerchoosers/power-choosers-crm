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
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('vault')
      .download(filePath);

    if (downloadError || !fileData) {
      logger.error('[Analyze Document] Download Error:', downloadError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to download file from storage' }));
      return;
    }

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
    - contract_end_date: The specific expiration date. If not found, estimate based on term length.
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: Estimated annual kWh. If a monthly bar chart exists, sum it up. If only one month, multiply by 12.
    - esids: An array of ESI ID numbers (17-22 digits) and their service addresses found in the document.

    Return ONLY a JSON object with this structure:
    {
      "type": "SIGNED_CONTRACT" | "BILL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number (e.g., 0.045) or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "esids": [
          { "id": "100...", "address": "123 Main St..." }
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

    // 5. Update Database based on findings
    const updates = {};
    const { type, data } = analysis;

    if (data.contract_end_date) updates.contract_end_date = data.contract_end_date;
    if (data.strike_price) updates.current_rate = String(data.strike_price);
    if (data.supplier) updates.electricity_supplier = data.supplier;
    if (data.annual_usage) updates.annual_usage = String(data.annual_usage);

    if (type === 'SIGNED_CONTRACT') {
      updates.status = 'ACTIVE_LOAD';
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', accountId);

      if (updateError) logger.error('[Analyze Document] Account Update Error:', updateError);
    }

    // Insert Meters (ESIDs)
    if (data.esids && data.esids.length > 0) {
      const metersToInsert = data.esids.map((m) => ({
        account_id: accountId,
        esid: m.id,
        service_address: m.address,
        status: 'Active',
        metadata: { source: 'ai_extraction', document: fileName }
      }));

      const { error: meterError } = await supabaseAdmin
        .from('meters')
        .upsert(metersToInsert, { onConflict: 'esid' });
      
      if (meterError) logger.error('[Analyze Document] Meter Insert Error:', meterError);
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
