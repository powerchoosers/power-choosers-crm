import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { draft, type, context, contact, prompt, provider, mode = 'generate_email' } = req.body;

  if (!draft && !prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Draft content or prompt is required' }));
    return;
  }

  // Handle OpenRouter (ChatGPT-OSS)
  if (provider === 'openrouter') {
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    if (!openRouterKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenRouter API key not configured' }));
      return;
    }

    try {
      let systemInstruction = '';
      let userContent = '';

      if (mode === 'optimize_prompt') {
        systemInstruction = `
          You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
          Your task is to optimize an AI prompt that will be used to generate sequence emails.
          
          PROMPT GUIDELINES:
          - Make the prompt more specific, forensic, and aligned with Nodal Point philosophy.
          - Ensure it focuses on financial variance, market volatility, and technical grid risk.
          - Use engineering/quantitative terminology.
          - The optimized prompt should result in emails that are direct and minimalist.
          - Preserve all existing technical requirements in the prompt while making them more "Forensic".
          
          INSTRUCTIONS:
          - Output ONLY the optimized prompt text.
        `;
        userContent = `Optimize this prompt for an email node: ${prompt}`;
      } else if (mode === 'generate_email') {
        systemInstruction = `
          You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
          Your task is to generate a sequence step (type: ${type}) based on specific instructions.
          ${contact ? `TARGET CONTACT: ${contact.name} (${contact.company}), Load Zone: ${contact.load_zone}` : ''}
          
          TONE GUIDELINES:
          - Forensic, Direct, Minimalist.
          - Highlight financial variance, market volatility, or technical risk.
          - Sound like a grid engineer or quantitative analyst.
          - NO marketing fluff.
          
          INSTRUCTIONS:
          - Output ONLY the email/script body.
          - Use HTML for formatting (paragraphs, line breaks).
          - Preserve variables like {{first_name}}.
        `;
        userContent = `Instructions: ${prompt}\n\nDraft/Context: ${draft || '(None)'}`;
      } else {
        systemInstruction = `
          You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
          Your task is to optimize a sequence step draft (type: ${type}).
          ${contact ? `TARGET CONTACT: ${contact.name} (${contact.company}), Load Zone: ${contact.load_zone}` : ''}
          
          TONE GUIDELINES:
          - Forensic, Direct, Minimalist.
          - Highlight financial variance, market volatility, or technical risk.
          - Sound like a grid engineer or quantitative analyst.
          - NO marketing fluff.
          
          INSTRUCTIONS:
          - Output ONLY the optimized email/script body.
          - Use HTML for formatting (paragraphs, line breaks).
          - Preserve variables like {{first_name}}.
        `;
        userContent = `Optimize this draft: ${draft}`;
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.API_BASE_URL || "https://nodalpoint.io",
          "X-Title": "Nodal Point CRM"
        },
        body: JSON.stringify({
          "model": "openai/gpt-4o-mini", // Cost-effective, high intelligence
          "messages": [
            { "role": "system", "content": systemInstruction },
            { "role": "user", "content": userContent }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API Error: ${errText}`);
      }

      const data = await response.json();
      const generatedText = data.choices[0].message.content.trim();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ optimized: generatedText }));
      return;

    } catch (error) {
       logger.error('[AI Optimization] OpenRouter Error:', error);
       // Fallback to Gemini if OpenRouter fails? Or just error out. 
       // User explicitly asked for OpenRouter, so let's report error if it fails.
       res.writeHead(500, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ error: 'Failed to generate with OpenRouter', details: error.message }));
       return;
    }
  }

  // Legacy Gemini Implementation
  const apiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const contactContext = contact ? `
      TARGET CONTACT:
      - Name: ${contact.name}
      - Company: ${contact.company}
      - Load Zone: ${contact.load_zone}
    ` : '';

    const systemPrompt = `
      You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
      Your task is to optimize a rough draft for a sequence step (type: ${type}).
      ${contactContext}
      
      TONE GUIDELINES:
      - Forensic, Direct, Minimalist.
      - No marketing fluff, no "hope you're doing well", no "I'd love to chat".
      - Highlight the financial variance, market volatility, or technical risk.
      - Sound like a grid engineer or a quantitative analyst, not a salesperson.
      
      INSTRUCTIONS:
      - Rewrite the draft to be more impactful and aligned with the Nodal Point philosophy.
      - Preserve any dynamic variables in {{double_braces}} like {{first_name}} or {{company_name}}.
      - Output ONLY the optimized text. No preamble, no explanation.
      
      CONTEXT: ${context || 'sequence_step_optimization'}
    `;

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Draft to optimize: ${draft}` }
    ]);

    const response = await result.response;
    const optimizedText = response.text().trim();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ optimized: optimizedText }));

  } catch (error) {
    logger.error('[AI Optimization] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to optimize draft',
      details: error.message 
    }));
  }
}
