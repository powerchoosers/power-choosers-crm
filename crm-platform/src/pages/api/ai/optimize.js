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

  const { draft, type, context, contact, prompt, provider, mode = 'generate_email', vectors = [] } = req.body;

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

      const dataVectors = [
        vectors.includes('firmographics') && `- CONTACT: ${contact?.name || 'Unknown'} at ${contact?.company || 'Unknown'} (${contact?.industry || 'Unknown'})`,
        vectors.includes('energy_intel') && `- ENERGY_INTEL: Load Zone ${contact?.load_zone || 'Unknown'}, Factor ${contact?.load_factor || 'Unknown'}, Annual Usage ${contact?.annual_usage || 'Unknown'}, Contract Exp ${contact?.contractEndDate || 'Unknown'}`,
        vectors.includes('recent_news') && `- SIGNALS: ${contact?.news || 'No news signals.'}`,
        vectors.includes('transcripts') && `- PREVIOUS_DIALOG: ${contact?.transcript || 'No previous call transcripts.'}`
      ].filter(Boolean).join('\n');

      if (mode === 'optimize_prompt') {
        systemInstruction = `
          You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
          Your task is to optimize an AI prompt that will be used to generate sequence emails.
          
          PROMPT GUIDELINES:
          - Writing Level: 6th Grade. Use simple words. Short sentences.
          - Tone: Individual human. Sound like a person typing quickly to a peer.
          - Style: Forensic but minimalist. Focus on financial liability and grid risk.
          - RULES: No em-dashes (—). No en-dashes (–). Use commas or colons.
          - BULLETS: Max 15 words per item. 
          
          INSTRUCTIONS:
          - Output ONLY the optimized prompt text.
        `;
        userContent = `Optimize this prompt for an email node: ${prompt}`;
      } else if (mode === 'generate_email') {
        systemInstruction = `
          You are a human Energy Analyst at Nodal Point. You do not sell; you diagnose.
          
          CORE DIRECTIVES:
          1. Writing Level: 6th Grade. Use very simple language. Avoid corporate buzzwords.
          2. Tone: Human-to-human. Sound like you're typing this yourself. No "I hope this finds you well" or "reaching out."
          3. Brevity: Max 60-80 words.
          4. Formatting: NO EM-DASHES (—).
          5. Bullets: Max 15 words per bullet.
          
          NEURAL_CONTEXT (Use ONLY these vectors if relevant):
          ${dataVectors || '- No specific data vectors provided.'}
          - CONTACT_COMPANY: ${contact?.company || 'Unknown'}
          
          INSTRUCTIONS:
          - Generate a sequence step (type: ${type}) based on the STRATEGY provided.
          - PERSONALIZATION: If high-value news or transcripts are in NEURAL_CONTEXT, mention them specifically (e.g., "I saw the news about..." or "Thinking about our last chat...").
          - Output MUST be a valid JSON object:
            {
              "subject_line": "Direct, non-salesy subject",
              "body_html": "Simple body with <p> and <br> tags. Two <br> after greeting. Use first name only (e.g. 'Hi Sarah,').",
              "logic_reasoning": "Explain why this approach fits a human, 6th-grade level tone."
            }
        `;
        userContent = `STRATEGY: ${prompt}\n\nDraft/Context: ${draft || '(None)'}`;
      } else {
        systemInstruction = `
          You are the Nodal Architect. You do not sell; you diagnose.
          
          CORE DIRECTIVES:
          1. Brevity: Max 80 words.
          2. Tone: Professional, human, direct.
          3. Formatting: NO EM-DASHES (—).
          4. Bullets: Max 15 words per item.
          
          INSTRUCTIONS:
          - Optimize the provided draft (type: ${type}).
          - Output MUST be a valid JSON object:
            {
              "subject_line": "Forensic and direct subject",
              "body_html": "Optimized body with HTML tags.",
              "logic_reasoning": "Explanation of optimization choices."
            }
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
          "model": "openai/gpt-4o-mini",
          "response_format": { "type": "json_object" },
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
      const generatedContent = data.choices[0].message.content.trim();

      let finalResult;
      if (mode === 'optimize_prompt') {
        finalResult = { optimized: generatedContent };
      } else {
        try {
          const parsed = JSON.parse(generatedContent);
          finalResult = {
            optimized: parsed.body_html,
            subject: parsed.subject_line,
            logic: parsed.logic_reasoning
          };
        } catch (e) {
          // Fallback if AI didn't return valid JSON despite instructions
          finalResult = { optimized: generatedContent };
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(finalResult));
      return;

    } catch (error) {
      logger.error('[AI Optimization] OpenRouter Error:', error);
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
      - Professional, Human, Direct.
      - No em-dashes (—). No en-dashes (–). Use commas or colons.
      - Bullet points must be one single, short sentence. Max 15 words per bullet.
      - Highlight the financial variance, market volatility, or technical risk.
      
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
