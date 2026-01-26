import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function analyzeBillHandler(req, res) {
  try {
    const { fileData, mimeType } = req.body || {};
    
    if (!fileData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file data provided' }));
      return;
    }

    const openRouterApiKey = process.env.OPEN_ROUTER_API_KEY;
    const geminiApiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;

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
      Ensure the output is strictly valid JSON.
    `;

    // 1. Try OpenRouter first as requested by Trey
    if (openRouterApiKey) {
      try {
        const orModel = 'openai/gpt-oss-120b';
        console.log(`[Bill Debugger] Attempting OpenRouter analysis with: ${orModel}`);
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': 'https://nodalpoint.io',
            'X-Title': 'Nodal Point CRM',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType || 'application/pdf'};base64,${fileData}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            console.log(`[Bill Debugger] OpenRouter success with ${orModel}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
            return;
          }
        } else {
          const errText = await response.text();
          console.warn(`[Bill Debugger] OpenRouter failed (${response.status}): ${errText}`);
        }
      } catch (error) {
        console.error('[Bill Debugger] OpenRouter error:', error);
      }
    }

    // 2. Fallback to Gemini if OpenRouter fails or is not configured
    if (!geminiApiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'API Key Missing', 
        message: 'No AI provider (OpenRouter or Gemini) is available for analysis.' 
      }));
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    
    // Model Candidate Chain
    const modelCandidates = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-pro-exp'
    ];

    let lastErr = null;
    let model = null;

    for (const modelName of modelCandidates) {
      try {
        console.log(`[Bill Debugger] Attempting Gemini fallback analysis with: ${modelName}`);
        model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        });
        
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
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(jsonStr);
        return;
      } catch (e) {
        console.warn(`[Bill Debugger] Gemini ${modelName} failed: ${e.message}`);
        lastErr = e;
        continue;
      }
    }

    throw lastErr || new Error("Failed to analyze bill with any available model");

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
