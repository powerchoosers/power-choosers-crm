
export default async function analyzeBillHandler(req, res) {
  try {
    const { fileData, mimeType } = req.body || {};

    if (!fileData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file data provided' }));
      return;
    }

    // Sanitize fileData - remove any existing data prefix if present
    const base64Data = fileData.replace(/^data:.*?;base64,/, '');


    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;

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

    // 1. Primary: Perplexity (Sonar-Pro)
    if (perplexityApiKey) {
      try {
        console.log(`[Bill Debugger] Analyzing with Perplexity (Sonar-Pro)...`);

        const isPdf = mimeType === 'application/pdf';
        // For PDFs, Perplexity expects raw base64. For images, it expects Data URL.
        const fileUrlContent = isPdf ? base64Data : `data:${mimeType || 'image/png'};base64,${base64Data}`;
        const attachmentType = isPdf ? 'file_url' : 'image_url';

        const body = {
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
          // response_format: { type: 'json_object' } // Perplexity Sonar-Pro does NOT support this yet
        };

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${perplexityApiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            console.log('[Bill Debugger] Raw Perplexity Response:', content);

            let jsonString = content;
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonString = content.substring(firstBrace, lastBrace + 1);
            }

            try {
              const parsed = JSON.parse(jsonString);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(parsed));
              return;
            } catch (parseError) {
              console.error('[Bill Debugger] JSON Parse Error:', parseError.message);
              console.error('[Bill Debugger] Failed JSON String:', jsonString);

              // Fallback: Try to clean markdown codes if simple extraction failed
              try {
                const cleanMarkdown = content.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanMarkdown);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(parsed));
                return;
              } catch (e2) {
                // If all fails, send error so frontend doesn't hang or guess
                throw new Error('Failed to parse AI response as JSON');
              }
            }
          }
        } else {
          const errorData = await response.json();
          console.error('[Bill Debugger] Perplexity error:', errorData);
        }
      } catch (error) {
        console.error('[Bill Debugger] Perplexity connection failed:', error);
      }
    }

    // 2. Secondary Fallback: OpenRouter (gpt-4o-mini)
    if (openRouterKey) {
      try {
        console.log(`[Bill Debugger] Falling back to OpenRouter (gpt-5-nano)...`);

        // Note: gpt-4o-mini / OpenRouter multimodal support for base64 varies by model.
        // We will try standard message format.
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://nodalpoint.io',
            'X-Title': 'Nodal Point CRM'
          },
          body: JSON.stringify({
            model: 'openai/gpt-5-nano',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: mimeType?.includes('pdf') ? 'file_url' : 'image_url',
                    [mimeType?.includes('pdf') ? 'file_url' : 'image_url']: {
                      url: mimeType?.includes('pdf') ? base64Data : `data:${mimeType || 'image/png'};base64,${base64Data}`
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
            return;
          }
        } else {
          const errText = await response.text();
          console.error('[Bill Debugger] OpenRouter Error:', response.status, errText);
        }
      } catch (error) {
        console.error('[Bill Debugger] OpenRouter fallback failed:', error);
      }
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Analysis failed',
      message: 'Exhausted both Perplexity and OpenRouter.'
    }));

  } catch (error) {
    console.error('[Bill Analysis Error]:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Analysis failed',
      message: error.message
    }));
  }
}
