import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function analyzeBillHandler(req, res) {
  try {
    const { fileData, mimeType } = req.body || {};
    
    if (!fileData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file data provided' }));
      return;
    }

    const apiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Bill Debugger] GEMINI_API_KEY not configured');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'API Key Missing', 
        message: 'The Gemini API key is not set in the production environment.' 
      }));
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Model Candidate Chain (Prioritizing 2.5 Flash-Lite per Nodal Point standards)
    const modelCandidates = [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite-preview',
      'gemini-2.5-flash',
      'gemini-3-flash-preview',
      'gemini-2.0-flash'
    ];

    let lastErr = null;
    let model = null;

    for (const modelName of modelCandidates) {
      try {
        console.log(`[Bill Debugger] Attempting analysis with: ${modelName}`);
        model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        });
        // We test with a dummy call or just proceed
        break; 
      } catch (e) {
        lastErr = e;
        continue;
      }
    }

    if (!model) throw lastErr || new Error("Failed to initialize any Gemini model");

    const prompt = `
      Analyze this energy bill. Extract the following details in JSON format:
      - customerName
      - accountNumber
      - serviceAddress
      - billingPeriod (start and end dates)
      - totalAmountDue
      - dueDate
      - usagekWh (total usage for the period)
      - demandKW (if available, peak demand)
      - deliveryCharges (breakdown of TDU/delivery fees)
      - energyCharges (the supply/generation part of the bill)
      - taxesAndFees
      - averageRatePerKWh (total bill / total usage)
      
      If you cannot find a specific field, return null for that field.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileData,
          mimeType: mimeType || 'application/pdf'
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Clean up potential markdown formatting from AI
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(jsonStr);
  } catch (error) {
    console.error('[Bill Analysis Error]:', error);
    
    // Ensure we ALWAYS return JSON to avoid "Non-JSON response" errors
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Analysis failed', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
}
