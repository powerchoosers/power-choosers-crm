import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handleApiAnalyzeBill(req, res) {
  try {
    const { fileData, mimeType } = req.body;

    if (!fileData || !mimeType) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing fileData or mimeType' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY;
    if (!apiKey) {
      console.error('[Bill Debugger] GEMINI_API_KEY not configured');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a forensic energy auditor. Analyze this Texas commercial electricity invoice and extract the following data into a clean JSON object:
    - provider_name (string)
    - customer_name (string)
    - billing_period (string, e.g., "Aug 12 - Sep 11, 2024")
    - total_usage_kwh (number)
    - billed_demand_kw (number)
    - total_amount_due (number)
    - account_number (string)
    - esi_id (string)
    - meter_number (string)
    - tdu_delivery_charges (number)
    - energy_charge (number)
    
    If a field is missing, use null. Return ONLY the JSON object.`;

    // Remove base64 header if present
    const base64Data = fileData.replace(/^data:.*;base64,/, '');

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Clean up potential markdown code blocks
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data }));

  } catch (error) {
    console.error('[Bill Debugger] Analysis failed:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Analysis failed', message: error.message }));
  }
}
