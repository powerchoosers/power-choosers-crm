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
        `- TARGET_IDENTITY: ${contact?.name || 'Unknown'} (${contact?.industry || 'Unknown'}) at ${contact?.company || 'Unknown'}`,
        contact?.location && `- LOCATION: ${contact.location}`,
        `- ENERGY_INTEL: Load Zone ${contact?.load_zone || 'Unknown'}, Factor ${contact?.load_factor || 'Unknown'}, Annual Usage ${contact?.annual_usage || 'Unknown'}, Contract Exp ${contact?.contractEndDate || 'Unknown'}`,
        vectors.includes('recent_news') && `- SIGNALS: ${contact?.news || 'No news signals.'}`,
        vectors.includes('transcripts') && `- PREVIOUS_DIALOG: ${contact?.transcript || 'No previous call transcripts.'}`,
        contact?.metadata && `- EXTENDED_METADATA: ${JSON.stringify(contact.metadata)}`
      ].filter(Boolean).join('\n');

      if (mode === 'optimize_prompt') {
        systemInstruction = `
          You are the Nodal Architect. Your task is to clean and tighten a prompt that will be used to generate cold email copy.

          RULES:
          1. Keep it under 80 words.
          2. No mention of bullets.
          3. State the goal, the target persona, and one key risk signal.
          4. Output ONLY the optimized prompt text. No explanations.
        `;
        userContent = `Original prompt:\n\n${prompt}`;
      } else if (mode === 'generate_email') {
        systemInstruction = `
          You write cold emails for an Energy Analyst at Nodal Point. You do not sell, you diagnose.

          RULES:
          1. Max 80 words.
          2. 6th grade vocabulary. No corporate jargon.
          3. NO bullet points. Write in 2–3 short paragraphs.
          4. NO em-dashes (—). Use commas or periods.
          5. Start with first name and a comma only. No "Hi" or "Hello."
          6. If you use bullets, this email fails. Use paragraphs only.
          7. NO CITATIONS OR LINKS: Do not include any external links, URLs, or bracketed citations (e.g. [source.com]).
          8. TEXAS DEREGULATED MARKET (ERCOT): We operate in Texas. Use only Texas energy terminology (4CP tags, TDUs, Co-op risks). Forbid UK references (like "Citizens Advice").

          HIGH_AGENCY_IDENTITY_RESOLUTION:
          - NEVER wait for bracketed variables like {{company}} or {{industry}}.
          - You possess the target's full identity in NEURAL_CONTEXT. Use it proactively to make the email feel manual and researched.
          - ALIAS_MAPPING: 
            - If STRATEGY says "the prospect" or "them" -> Use ${contact?.name || 'the contact'}.
            - If STRATEGY says "their company" or "the business" -> Use ${contact?.company || 'the business'}.
            - If STRATEGY says "their industry" -> Use ${contact?.industry || 'their industry'}.
            - If STRATEGY says "their location" -> Use ${contact?.location || contact?.city || 'their area'}.
          - WEAVE DATA NATURALLY: A high-agency analyst doesn't use placeholders; they use facts. If you know they are in 'Manufacturing', don't just say 'your industry'. Say 'the manufacturing sector' or 'your production facility'.

          INTELLIGENT_CONTEXT_MAPPING:
          - Use the NEURAL_CONTEXT and EXTENDED_METADATA to personalize the email proactively.
          - RESOLVE PLACEHOLDERS: If the STRATEGY *does* contain variables like {{company}}, {{industry}}, etc., resolve them.
          - If a field is missing (e.g., no asset_type), infer it logically (e.g., "facilities" or "operation nodes") or use a natural, professional phrase.
          - Do not wait for explicit instructions; if you see a relevant data point (like a recent call or a news signal), weave it in.

          NEURAL_CONTEXT:
          ${dataVectors}

          STRATEGY (follow this above all else):
          ${prompt}

          INSTRUCTIONS:
          - Generate a sequence step (type: ${type}) based on the STRATEGY.
          - Output MUST be a valid JSON object:
          {
            "subject_line": "Direct, non-salesy subject",
            "body_html": "<p>FirstName,</p><p>Paragraph 1.</p><p>Paragraph 2.</p>",
            "logic_reasoning": "Explain how you resolved the target's identity and applied the Nodal diagnostic posture without relying on static templates."
          }
        `;
        userContent = `STRATEGY: ${prompt}\n\nDraft/Context: ${draft || '(None)'}`;
      } else {
        systemInstruction = `
          You are the Nodal Architect. You do not sell; you diagnose.
          
          CORE DIRECTIVES:
          1. Brevity: Max 80 words.
          2. 6th Grade Vocabulary.
          3. Tone: Professional, human, direct.
          4. Formatting: NO EM-DASHES (—).
          5. NO bullet points. Use short paragraphs.
          6. NO CITATIONS OR LINKS: Do not include any external URLs or bracketed sources.
          7. TEXAS/ERCOT CONTEXT: Only use Texas energy market references. No UK references.

          INTELLIGENT_CONTEXT_MAPPING:
          - Use the NEURAL_CONTEXT and EXTENDED_METADATA to personalize the draft proactively.
          - RESOLVE PLACEHOLDERS: If the draft or strategy contains variables like {{company}}, {{industry}}, {{city}}, {{asset_type}}, etc., you MUST resolve them using the provided context.
          
          HIGH_AGENCY_IDENTITY_RESOLUTION:
          - DO NOT wait for bracketed variables. If the draft is generic (e.g. "your company", "your industry"), you MUST replace those with specific data from NEURAL_CONTEXT (e.g. "${contact?.company || 'your business'}", "${contact?.industry || 'your industry'}").
          - When optimizing, make the text feel manual and researched. A high-agency analyst doesn't use placeholders; they use facts.

          NEURAL_CONTEXT:
          ${dataVectors}
          
          INSTRUCTIONS:
          - Optimize the provided draft (type: ${type}) using the Strategy: ${prompt || '(None)'}.
          - Output MUST be a valid JSON object:
            {
              "subject_line": "Forensic and direct subject",
              "body_html": "Optimized body with HTML tags.",
              "logic_reasoning": "Explanation of optimization choices and high-agency identity resolution."
            }
        `;
        userContent = `Draft to optimize: ${draft}`;
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
          "model": "google/gemini-2.5-flash",
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
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error('OpenRouter API key not configured');
    }

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
      - NO CITATIONS OR LINKS: Forbid external URLs or bracketed sources.
      - TEXAS/ERCOT SPECIFIC: Avoid UK or non-US energy market references.
      
      INSTRUCTIONS:
      - Rewrite the draft to be more impactful and aligned with the Nodal Point philosophy.
      - Preserve any dynamic variables in {{double_braces}} like {{first_name}} or {{company_name}}.
      - Output ONLY the optimized text. No preamble, no explanation.
      
      CONTEXT: ${context || 'sequence_step_optimization'}
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.API_BASE_URL || "https://nodalpoint.io",
        "X-Title": "Nodal Point CRM"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash",
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": `Draft to optimize: ${draft}` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API Error: ${errText}`);
    }

    const data = await response.json();
    const optimizedText = data.choices[0].message.content.trim();

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
