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

  const { draft, type, context, contact } = req.body;

  if (!draft) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Draft content is required' }));
    return;
  }

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
