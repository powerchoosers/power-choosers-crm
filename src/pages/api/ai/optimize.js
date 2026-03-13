import { cors } from '../_cors.js';
import logger from '../_logger.js';

function extractJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  }
}

function normalizeBodyHtml(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/<\s*p[>\s]/i.test(text)) return text;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  return lines.map((line) => `<p>${line}</p>`).join('');
}

function normalizeSubject(input) {
  const value = String(input || '').trim();
  if (!value) return 'Message from Nodal Point';
  return value.replace(/\s+/g, ' ').slice(0, 140);
}

function normalizeSenderFirstName(input) {
  const cleaned = String(input || '').replace(/<[^>]*>/g, '').trim();
  if (!cleaned) return 'Lewis';
  const first = cleaned.split(/\s+/)[0] || 'Lewis';
  return first.replace(/[^A-Za-z'-]/g, '') || 'Lewis';
}

function ensureThanksSignoff(input, senderFirstName) {
  const html = String(input || '').trim();
  if (!html) return html;

  const firstName = normalizeSenderFirstName(senderFirstName);
  const hasExactSignoff = new RegExp(
    `<p[^>]*>\\s*Thanks,\\s*<br\\s*\\/?\\>\\s*${firstName}\\s*<\\/p>\\s*$`,
    'i'
  ).test(html);
  if (hasExactSignoff) return html;

  // Remove common closings at the end so the enforced signoff stays consistent.
  const withoutClose =
    html.replace(
      /(?:<p[^>]*>\s*(?:Best regards|Regards|Sincerely|Cheers|Thanks|Thank you),?\s*(?:<br\s*\/?>\s*[^<]+)?<\/p>\s*|<p[^>]*>\s*(?:Best regards|Regards|Sincerely|Cheers|Thanks|Thank you),?\s*<\/p>\s*<p[^>]*>[\s\S]*?<\/p>\s*)+$/i,
      ''
    ).trim();

  return `${withoutClose}<p>Thanks,<br>${firstName}</p>`;
}

function cleanCompanyName(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'Unknown';

  let cleaned = raw;

  // Outreach should use the operating name, not the full legal entity string.
  cleaned = cleaned.replace(/\s+d\/b\/a\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+dba\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+a\/k\/a\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+aka\s+.+$/i, '');
  cleaned = cleaned.replace(/,\s*(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '');
  cleaned = cleaned.replace(/\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || raw;
}

function softenFirstTouchEnergyJargon(input, strategy) {
  const text = String(input || '');
  const strategyText = String(strategy || '');
  const isFirstTouch = /first[-\s]?touch|day\s*1|forensic opener/i.test(strategyText);
  if (!text || !isFirstTouch) return text;

  return text
    .replace(/\b4CP\b/gi, 'summer peak demand tags')
    .replace(/\bTDUs\b/g, 'delivery utilities')
    .replace(/\bTDU\b/g, 'delivery utility')
    .replace(/\bESI\s*ID\b/gi, 'service meter ID');
}

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
      const hasLinkedIn = !!(contact?.has_linkedin || contact?.linkedin_url || contact?.linkedinUrl);
      const hasWebsite = !!(contact?.has_website || contact?.website || contact?.domain);
      const sourceLabel = contact?.source_label || (hasLinkedIn ? 'linkedin' : (hasWebsite ? 'website' : 'public_company_info'));
      const hasEnergyVector = Array.isArray(vectors) && vectors.some(v => ['energy_context', 'energy_intel'].includes(String(v)));
      const contactTitle = typeof contact?.title === 'string' && contact.title.trim() ? contact.title.trim() : 'Unknown';
      const contactIndustry = typeof contact?.industry === 'string' && contact.industry.trim() ? contact.industry.trim() : 'Unknown';
      const contactLocation = typeof contact?.location === 'string' && contact.location.trim()
        ? contact.location.trim()
        : (typeof contact?.city === 'string' && contact.city.trim()
          ? `${contact.city.trim()}${contact?.state ? `, ${String(contact.state).trim()}` : ''}`
          : 'Unknown');
      const companyName = cleanCompanyName(contact?.company);
      const supplier = (contact?.electricity_supplier || contact?.supplier || contact?.metadata?.energy?.supplier || 'Unknown');
      const currentRate = (contact?.current_rate ?? contact?.metadata?.energy?.current_rate ?? 'Unknown');
      const contractEndRaw = (contact?.contract_end_date || contact?.contractEndDate || null);
      const contractEndYear = contact?.contract_end_year || (contractEndRaw ? new Date(contractEndRaw).getUTCFullYear() : null);

      const dataVectors = [
        `- TARGET_IDENTITY: ${contact?.name || 'Unknown'} (${contactIndustry}) at ${companyName}`,
        `- COMPANY_OUTREACH_NAME: ${companyName}`,
        contact?.company && companyName !== contact.company ? `- COMPANY_LEGAL_NAME: ${contact.company}` : null,
        `- ROLE: ${contactTitle}`,
        `- LOCATION: ${contactLocation}`,
        `- VECTOR_STATE: energy_enabled=${hasEnergyVector}`,
        hasEnergyVector
          ? `- ENERGY_INTEL: Supplier ${supplier}, Current Rate ${currentRate}, Load Zone ${contact?.load_zone || 'Unknown'}, Factor ${contact?.load_factor || 'Unknown'}, Annual Usage ${contact?.annual_usage || 'Unknown'}, Contract End Year ${contractEndYear || 'Unknown'}`
          : '- ENERGY_INTEL: disabled_by_vector',
        `- SOURCE_TRUTH: source_label=${sourceLabel}, has_linkedin=${hasLinkedIn}, has_website=${hasWebsite}`,
        contact?.linkedin_url && `- LINKEDIN_URL: ${contact.linkedin_url}`,
        contact?.linkedinUrl && `- LINKEDIN_URL: ${contact.linkedinUrl}`,
        contact?.website && `- WEBSITE: ${contact.website}`,
        contact?.domain && `- DOMAIN: ${contact.domain}`,
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
          1. Max 90 words.
          2. 6th grade vocabulary. No corporate jargon.
          3. NO bullet points. Write in 2–3 short paragraphs.
          4. NO em-dashes (—). Use commas or periods.
          5. Start with first name and a comma only. No "Hi" or "Hello."
          6. If you use bullets, this email fails. Use paragraphs only.
          7. NO CITATIONS OR LINKS: Do not include any external links, URLs, or bracketed citations (e.g. [source.com]).
          8. TEXAS DEREGULATED MARKET (ERCOT): Keep context Texas/ERCOT and forbid UK references (like "Citizens Advice").
          9. HOOK RULE:
            - Sentence one must mention the account city (or the outreach-friendly company name if no city exists) and tie that place to one concrete operational reality—renewal timing, demand spikes, longer run hours, billing cycle hits, etc.
            - Avoid vague openers like "energy costs are tough" or "utility charges are complex" without grounding them in that specific location and what is shifting now.
          10. SUBJECT RULE:
            - Subject line must be 4–7 words.
            - Vary the angle: use the account city OR company name as an anchor, OR lead with a cost-specific question, OR reference renewal/contract timing, OR use a "I noticed something" hook.
            - Do NOT fall back to the same formula every time (avoid always writing "[City] bill check").
            - Never use "Quick question", "Following up", "Just checking in", or "Reaching out" as subject openers.
            - Keep it problem-based and specific (e.g., "Fort Worth industrial billing gap", "before your 2027 contract renewal", "who reviews electricity at [Company]?").
          11. JARGON TRANSLATION RULE:
            - Never use unexplained acronyms like 4CP, TDU, ESI ID, pass-through, nodal adder, or load zone shorthand in first-touch copy.
            - Use plain business language first: "energy rate per kWh" and "demand/delivery charges".
            - If a technical term is necessary, define it in the same sentence in plain English.
          12. CTA RULE:
            - First touch should ask for interest with a concrete offer, not a meeting request.
            - Offer: if they send Lewis their latest electricity statement, he will reply with a 2–3 bullet forensic snapshot of what stands out.
            - End with a low-friction yes/no question referencing that offer.
          13. VOICE RULE:
            - Use first-person peer language from Lewis ("I", "I can", "I review"), not corporate team language.
            - Avoid openers like "our firm", "we help businesses", or "at Nodal Point, we...".
            - You may mention Nodal Point once for identity, but keep the voice consultative and person-to-person.
          14. SOURCE TRUTH IS HARD RULE:
            - If source_label=linkedin (or has_linkedin=true), you may reference LinkedIn once.
            - If source_label=website (or has_linkedin=false and has_website=true), do NOT mention LinkedIn. Reference website/public company info instead.
            - If source_label=public_company_info (or has_linkedin=false and has_website=false), do NOT mention LinkedIn or website. Say you were reviewing companies in their industry/area.
            - Never claim a source that is not supported by SOURCE_TRUTH.
          15. COMPANY NAME RULE:
            - Use COMPANY_OUTREACH_NAME in copy, not the full legal entity name.
            - Strip legal suffixes like Inc, LLC, Ltd, Corp and ignore DBA phrasing unless the STRATEGY explicitly requires the legal name.
            - No normal human writes "Eduardo E. Lozano & Co., Inc. dba eelco" in a cold email opener. Do not do that.
          16. FIELD USAGE QUALITY RULE:
            - If ROLE is known, tailor one phrase to that role's business priorities.
            - If INDUSTRY is known, use the exact industry naturally once (avoid generic "many businesses").
            - If LOCATION is known, anchor the observation to that place naturally.
            - If any field is Unknown, do not invent it and do not force awkward placeholders.
          17. ENERGY INTEL RULES:
            - If VECTOR_STATE says energy_enabled=false, do not mention specific supplier, rate, load zone, or contract timing details.
            - If energy is enabled and supplier is known, you may reference supplier once naturally.
            - Treat contract end month/day as potentially unreliable. Use renewal YEAR framing only (e.g., "before your 2027 renewal"), not exact month/day claims.
            - Never state certainty about exact contract month/day unless explicitly provided as verified in STRATEGY text.

          HIGH_AGENCY_IDENTITY_RESOLUTION:
          - NEVER wait for bracketed variables like {{company}} or {{industry}}.
          - You possess the target's full identity in NEURAL_CONTEXT. Use it proactively to make the email feel manual and researched.
          - ALIAS_MAPPING: 
            - If STRATEGY says "the prospect" or "them" -> Use ${contact?.name || 'the contact'}.
            - If STRATEGY says "their company" or "the business" -> Use ${companyName || 'the business'}.
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
          - DO NOT wait for bracketed variables. If the draft is generic (e.g. "your company", "your industry"), you MUST replace those with specific data from NEURAL_CONTEXT (e.g. "${companyName || 'your business'}", "${contact?.industry || 'your industry'}").
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
        const parsed = extractJsonObject(generatedContent);
        if (parsed && typeof parsed === 'object') {
          const bodyCandidate = parsed.body_html || parsed.body || parsed.content || '';
          finalResult = {
            optimized: ensureThanksSignoff(
              softenFirstTouchEnergyJargon(normalizeBodyHtml(bodyCandidate), prompt),
              contact?.sender_first_name
            ),
            subject: normalizeSubject(parsed.subject_line || parsed.subject),
            logic: parsed.logic_reasoning || parsed.reasoning || null
          };
        } else {
          // Fallback if AI didn't return valid JSON despite instructions
          finalResult = {
            optimized: ensureThanksSignoff(
              softenFirstTouchEnergyJargon(normalizeBodyHtml(generatedContent), prompt),
              contact?.sender_first_name
            ),
            subject: normalizeSubject(null)
          };
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
      - Use plain English for energy costs. Prefer "energy rate per kWh" and "demand/delivery charges" over acronyms like 4CP or TDU.
      
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
