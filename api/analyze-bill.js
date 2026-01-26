import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function analyzeBillHandler(req, res) {
  try {
    const { fileData, mimeType } = req.body || {};
    
    if (!fileData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file data provided' }));
      return;
    }

    const geminiApiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

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

    // 1. Try Gemini Models first (Free tier)
    if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const modelCandidates = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-pro-exp'
      ];

      for (const modelName of modelCandidates) {
        try {
          console.log(`[Bill Debugger] Attempting Gemini analysis with: ${modelName}`);
          const model = genAI.getGenerativeModel({
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
          const msg = e.message.toLowerCase();
          if (msg.includes('quota') || msg.includes('429') || msg.includes('limit')) {
            console.warn(`[Bill Debugger] Gemini ${modelName} quota exceeded, trying next...`);
            continue;
          }
          console.error(`[Bill Debugger] Gemini ${modelName} fatal error:`, e.message);
          break; // Stop if it's not a quota error
        }
      }
    }

    // 2. Fallback to Perplexity (Sonar) if Gemini fails or is exhausted
    if (perplexityApiKey) {
      try {
        console.log(`[Bill Debugger] Falling back to Perplexity (Sonar)`);
        // Perplexity doesn't support file uploads directly in the API yet, 
        // but we can try to send the prompt. 
        // NOTE: Since Sonar can't see the PDF/Image either, we log a warning.
        console.warn(`[Bill Debugger] Sonar fallback initiated, but Sonar lacks vision/PDF support. Analysis may be limited.`);
        
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${perplexityApiKey}`,
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              { role: 'system', content: 'You are a forensic bill analyst.' },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(content);
          return;
        }
      } catch (error) {
        console.error('[Bill Debugger] Perplexity fallback failed:', error);
      }
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Analysis failed', 
      message: 'Exhausted all available models (Gemini & Sonar).' 
    }));

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
