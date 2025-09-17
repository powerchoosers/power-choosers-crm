// Gemini Email Generation (Serverless) - Vercel function
// Expects POST { prompt, mode: 'standard'|'html', recipient, to }
// Requires env var GEMINI_API_KEY

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

function buildSystemPrompt({ mode, recipient, to, prompt, style, subjectStyle, subjectSeed }) {
  const r = recipient || {};
  const name = r.fullName || r.full_name || r.name || '';
  const firstName = r.firstName || r.first_name || (name ? String(name).split(' ')[0] : '');
  const email = r.email || '';
  const company = r.company || r.accountName || '';
  const job = r.title || r.job || r.role || '';
  const industry = r.industry || '';
  const linkedin = r.linkedin || '';
  const energy = r.energy || {};
  const transcript = (r.transcript || r.callTranscript || r.latestTranscript || '').toString().slice(0, 2000);
  // NEW: Added next_steps from recipient data
  const next_steps = (r.next_steps || r.account?.next_steps || '').toString().slice(0, 800);
  const usage = energy.usage || '';
  const supplier = energy.supplier || '';
  const contractEnd = energy.contractEnd || '';
  const currentRate = energy.currentRate || '';
  const sqftRaw = r.squareFootage || r.square_footage || '';
  // Format helper: convert any date-like string to "Month YYYY"
  const toMonthYear = (val) => {
    const s = String(val || '').trim();
    if (!s) return '';
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${months[d.getMonth()]} ${d.getFullYear()}`;
    const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // MM/DD/YYYY
    if (m1) { const m = Math.max(1, Math.min(12, parseInt(m1[1], 10))); return `${months[m - 1]} ${m1[3]}`; }
    const m2 = s.match(/^(\d{4})[\-](\d{1,2})[\-](\d{1,2})$/); // YYYY-MM-DD
    if (m2) { const m = Math.max(1, Math.min(12, parseInt(m2[2], 10))); return `${months[m - 1]} ${m2[1]}`; }
    const m3 = s.match(/^(\d{1,2})[\/\-](\d{4})$/); // MM/YYYY
    if (m3) { const m = Math.max(1, Math.min(12, parseInt(m3[1], 10))); return `${months[m - 1]} ${m3[2]}`; }
    const m4 = s.match(/([A-Za-z]+)\s+(\d{4})/); // Month YYYY
    if (m4) return `${m4[1]} ${m4[2]}`;
    const y = s.match(/(19\d{2}|20\d{2})/);
    if (y) return y[1];
    return s;
  };
  const contractEndLabel = toMonthYear(contractEnd);
  const sqftNum = Number(String(sqftRaw).replace(/[^0-9.]/g, ''));
  let facilityScale = '';
  if (!isNaN(sqftNum) && sqftNum > 0) {
    if (sqftNum < 20000) facilityScale = 'small facility';
    else if (sqftNum < 100000) facilityScale = 'mid-sized facility';
    else facilityScale = 'large facility';
  }

  // Notes from contact or associated account
  const notes = [r.notes, r.account?.notes].filter(Boolean).join(' \n').slice(0, 800);
  
  // Extract colleague information from notes
  let colleagueInfo = null;
  if (notes) {
    // Look for patterns like "spoke with [name]", "talked to [name]", "met with [name]", etc.
    const colleaguePatterns = [
      /spoke with ([A-Za-z\s]+)/i,
      /talked to ([A-Za-z\s]+)/i,
      /met with ([A-Za-z\s]+)/i,
      /connected with ([A-Za-z\s]+)/i,
      /called ([A-Za-z\s]+)/i
    ];
    
    for (const pattern of colleaguePatterns) {
      const match = notes.match(pattern);
      if (match && match[1]) {
        colleagueInfo = {
          name: match[1].trim(),
          found: true
        };
        break;
      }
    }
  }

  // Determine if the user prompt is requesting a cold email template
  const isColdPrompt = /cold\s+email|could\s+not\s+reach\s+by\s+phone/i.test(String(prompt || ''));
  // Determine if the user prompt is requesting an Energy Health Check template
  const isEhcPrompt = /energy\s+health\s+check/i.test(String(prompt || ''));
  // Determine if the user prompt is requesting a Standard Invoice Request
  const isInvoicePrompt = /standard\s+invoice\s+request|invoice\s+request/i.test(String(prompt || ''));

  // Common industry pain points. Pick 1 (max 2) that best fits context.
  const painPoints = [
    'billing issues or invoice complexity',
    'high TDU/delivery charges relative to energy',
    'confusing or unfavorable contract terms (bandwidth, swing, pass-throughs)',
    'above-market current rate / renewal risk',
    'rising market costs driven by data centers/population growth',
    'high load/operational intensity for manufacturers or large facilities (>20k sf)'
  ];

  const companyOverview = [
    'Power Choosers is an energy procurement and management partner.',
    'We competitively source from 100+ electricity and natural gas suppliers, negotiate agreements, and manage renewals.',
    'Services include: energy procurement, contract negotiation/renewals, bill management/reporting, and efficiency/sustainability guidance.'
  ].join(' ');

  const common = `You are Power Choosers' email assistant. Draft a clear, concise, and friendly ${mode === 'html' ? 'HTML' : 'plain text'} outbound email.

CRITICAL RULES (ZERO TOLERANCE FOR VIOLATIONS):
- NEVER duplicate any sentence, phrase, or call-to-action within the same email
- NEVER repeat the same information in different words
- NEVER use the same phrase twice anywhere in the email
- Each sentence must add unique value to the email
- Include exactly ONE clear call-to-action, which MUST be a question and end with a question mark (?).
- End with "Best regards," followed immediately by the sender name on the next line with no blank line between them
- Keep tone professional and helpful
- Personalize with known recipient context when appropriate
- Avoid hallucinations; if unsure, keep it generic
- Do not include handlebars-like placeholders (e.g., {{first_name}}). Use natural text
- NEVER end sentences with incomplete phrases like "improving your?" or "discuss your?" - always complete the thought
- Before sending, mentally check: "Have I used any phrase or sentence twice?" If yes, rewrite`;

  const personalTouch = `PERSONAL TOUCH REQUIREMENT:
- After "Hi [Name]," always include a personal paragraph about the current time/season.
- Be aware of the current day of the week and upcoming/recent holidays.
- Examples: "I hope you're having a great start to the week" (Monday), "I hope you're having a productive week" (Tuesday-Thursday), "I hope you're having a great Friday" (Friday), "I hope you're having a wonderful holiday season" (near Christmas), "I hope you're having a great start to the new year" (January), etc.
- Keep it natural and warm, not generic.`;

  const recipientContext = `Recipient/context signals (use selectively; do not reveal sensitive specifics):
- Name: ${name || 'Unknown'} (${firstName || 'Unknown'})
- Company: ${company || 'Unknown'}
- Title/Role: ${job || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Facility: ${facilityScale || 'Unknown scale'} (do NOT mention exact square footage)
- Energy (if relevant): usage=${usage || 'n/a'}; supplier=${supplier || 'n/a'}; currentRate=${currentRate || 'n/a'}; contractEnd=${contractEndLabel || 'n/a'}
- LinkedIn: ${linkedin || 'n/a'}
- Notes (free text, optional): ${notes || 'n/a'}
- Colleague contact: ${colleagueInfo?.found ? colleagueInfo.name : 'none found'}
- Next Steps (from CRM): ${next_steps || 'n/a'}
- Transcript (top priority; summarize and use insights, do not quote sensitive specifics): ${transcript ? (transcript.slice(0, 600) + (transcript.length > 600 ? '…' : '')) : 'n/a'}`;

  const bizContext = `About Power Choosers (for positioning only): ${companyOverview}`;
  
  // NEW: Guidelines for using transcript and next_steps
  const transcriptAndNextStepsGuidelines = `TRANSCRIPT & NEXT STEPS GUIDELINES (ABSOLUTE TOP PRIORITY):
- If a call transcript or a 'Next Steps' field exists, you MUST treat them as the source of truth.
- The email's opening and call-to-action MUST directly reflect the topics, agreements, or action items from the transcript/next steps.
- Example: If transcript says "client will send the invoice tomorrow afternoon", the email MUST reference this: "Following up on our call, will you still be able to send over that invoice this afternoon?"
- Synthesize insights from both fields if they exist. Do NOT quote them directly.`;

  const priorityDirectives = `Content PRIORITY order (use what is present, skip what isn't):
1) ABSOLUTE TOP PRIORITY: Synthesized insights from Call Transcript and Next Steps.
2) Energy contract details (supplier, rate, contract end Month YYYY, usage)
3) Notes content (what was discussed or pain points)
4) Title/role for relevance
5) Account city/state (do not use contact's city/state)
Ensure the opening hook uses the highest available priority data. If transcript or next steps exist, derive the hook from them.`;

  const subjectGuidelines = `Subject line requirements:
- The FIRST LINE must begin with "Subject:" followed by the subject text.
- Keep it tight: aim under ~50 characters; make it specific.
- Prefer including ${firstName ? 'the recipient\'s first name' : 'the company name'} and/or the company name (e.g., "${firstName || 'Name'} — energy options for ${company || 'your facilities'}").
- When applicable, hint the chosen pain point in the subject (e.g., "${company || 'Your accounts'} — simplify bills" or "${firstName || 'Team'} — renewal timing")
- For other email types: Experiment with different approaches - questions, value props, time-sensitive offers, industry-specific benefits, etc.`
    + (isColdPrompt
      ? `\n- For "cold email to a lead I could not reach by phone": Consider a pattern-interrupt subject or a specific pain point (e.g., renewal risk, above-market rate) and you may include reference to speaking with their colleague if appropriate.`
      : '')
    + (isInvoicePrompt
      ? `\n- For "Standard Invoice Request": Make the ask clear and helpful (e.g., "Invoice copy for quick review" or "Last bill to start your Energy Health Check").`
      : '');

  const subjectVariety = `Subject VARIETY directives (strict):
- SUBJECT_STYLE: ${subjectStyle || 'auto'}; SUBJECT_SEED: ${subjectSeed || 'auto'}.
- Maintain high variation across runs. If auto, pick by seed.
- Allowed styles (choose one): question, curiosity, metric, time_sensitive, pain_point, proof_point.
- Keep under ~50 chars; avoid spammy words; vary structure/wording across runs.`;

  const brevityGuidelines = `Brevity and style requirements:
- Total body length target: ~70–110 words max (be concise).
- Use short sentences and plain words. Cut filler and hedging.
- Prefer active voice and verbs over adjectives.
- Keep one value prop tightly aligned to the hook.`;

  const bodyGuidelines = `Body requirements (STRICT ADHERENCE):
- Structure: 2 very short paragraphs (1–2 sentences each) + a single-line CTA.
- NEVER duplicate any sentence, phrase, or information within the email
- Each sentence must add unique value - no repetition
- Include exactly ONE call-to-action, which MUST be a question and end with a question mark (?).
- Reflect the recipient's title/company/industry when helpful.
- You may allude to scale (e.g., multi-site or large facility) but do NOT state exact square footage.
- Mention one or two of our offerings most relevant to this contact (procurement, renewals/contracting, bill management, or efficiency) without overloading the email.
- Keep it skimmable and client-friendly.
 - Avoid opening with generic statements (e.g., "we work with 100+ suppliers"). Lead with the most relevant point for the reader.`;

  const variationDirectives = `Variation directives:
- STYLE seed (hint, may be "auto"): ${style || 'auto'}; SUBJECT seed: ${subjectStyle || 'auto'}.
- If STYLE is "auto", pick one style at random each time:
  • hook_question: open with a sharp question that ties to a transcript insight or pain point
  • value_bullets: second paragraph uses 2–3 bullet points (HTML <ul><li>…</li></ul>; plain text use •) for benefits or steps
  • proof_point: include one brief proof point (e.g., recent result, supplier count) without sounding generic
  • risk_focus: highlight one timely risk (renewal timing, above‑market rate) tied to their situation
  • timeline_focus: emphasize timing (e.g., contract end Month YYYY) and next steps
- If SUBJECT is "auto", vary subject types between: question, outcome‑oriented, time‑sensitive, pain‑point specific.
- Avoid repeating the same opening or subject phrasing across runs.
- If transcript provided, derive the HOOK from the transcript first (top priority), then supplement with notes and energy fields.`;

  // UPDATED: Refined specific prompt handling based on user feedback
  const specificHandling = `SPECIFIC PROMPT HANDLING:
  - "Warm intro after a call": Reference the call once (what we discussed), then propose specific next steps. The CTA must be a question suggesting two time windows for a follow-up and MUST end with a question mark (?).
  - "Follow-up with tailored value props": Assume a few days/weeks have passed. Recap in one line, then highlight 1–2 tailored benefits tied to their industry/facility scale or known data. Optionally include one brief proof point. End with a light CTA to keep the lead warm.
  - "Schedule an energy health check":
    • Never include any mention of speaking with a colleague.
    • Structure STRICTLY:
      – Paragraph 1: One concise sentence that explains what an Energy Health Check is and why it matters. If transcript/next steps indicate warm context, reference the prior call. If cold, tie to a single relevant pain point.
      – Paragraph 2: One concise sentence listing what the review covers: bill/supplier/rate review, contract end Month YYYY, usage estimate, Energy Health Score, projected costs, supplier BBB rating, and next steps.
      – CTA line: Exactly one short question offering two specific time windows (e.g., "Does Tue 10–12 or Thu 2–4 work for that?").
  - "Proposal delivery with next steps": Provide a crisp summary of the options (supplier/term/rate/est. annual cost/notable terms), selection guidance, and 2–3 clear next steps. CTA: short call to review/confirm.
  - "Cold email to a lead I could not reach by phone": COLD email. Structure: 1) Pattern‑interrupt hook using one concrete pain point. 2) "I recently spoke with ${colleagueInfo?.found ? colleagueInfo.name : 'a colleague'} at ${company || 'your company'} and wanted to connect..." + value prop. 3) ONE call‑to‑action. NEVER say "following up on our call".
  - "Standard Invoice Request":
    • This is a polite follow-up to get an invoice.
    • If a transcript or 'next_steps' field mentions the invoice, you MUST reference that conversation (e.g., "Following up on our call..."). Otherwise, use a simple reminder ("Sending a quick reminder..."). Do NOT use "As promised".
    • STRUCTURE (MUST BE FOLLOWED EXACTLY):
      1. Personal greeting ("Hi [Name], I hope you're having a productive week.").
      2. Polite reminder sentence. If energy details are known, include them naturally here (e.g., "...reminder about the invoice for your ${company} account with ${supplier || 'your supplier'}.").
      3. Bullet point explanation (MUST be this exact text): "We use your invoice to:".
      4. The following 3 bullets, exactly: "• Verify your ESID(s)", "• Confirm your Contract End Date (Month YYYY)", "• Validate your Service Address".
      5. CTA line: A single, time-bound question asking for the invoice. It MUST end with a question mark (?). Example: "Will you be able to send a copy of your latest invoice by end of day today?".`;

  const energyGuidelines = `If energy contract details exist, weave them in briefly (do not over-explain):
- Supplier: mention by name (e.g., "with ${supplier || 'your supplier'}").
- Contract end: reference month and year only (no day), e.g., "before ${contractEndLabel || 'your renewal window'}".
- Current rate: you may reference the rate succinctly if provided (normalize like 0.089 → $0.089/kWh), e.g., "at ${currentRate || 'your current'} $/kWh".
- Usage: reference qualitatively (e.g., "your usage profile" or "annual usage") without exact precision if it feels too granular.
- Do NOT mention exact square footage; keep scale abstract (e.g., "large facility").`;

  const dateGuidelines = `Date redaction policy:
- If you mention dates (e.g., a contract end date), state only Month and Year (e.g., "April 2026"). Do NOT include an exact day.`;

  const painPointGuidelines = `Choose ONE primary pain-point as the HOOK for the opening line. Consider the industry and signals above. Examples: ${painPoints.join('; ')}. Use at most one supporting pain-point if it adds clarity.`;

  const notesGuidelines = `If notes are present, incorporate a relevant reference in one line (e.g., recent call context or initiative) — keep it natural and non-repetitive.`;

  const outputStyle = mode === 'html'
    ? `Formatting contract: Output must be exactly two parts.
1) First line: Subject: ...
2) Then one blank line, then the BODY as a minimal HTML fragment (no <html>/<head>/<body>). Use <p> for paragraphs.`
    : `Formatting contract: Output must be exactly two parts.
1) First line: Subject: ...
2) Then one blank line, then the BODY as plain text (no code fences).`;

  const baseChecklist = `FINAL CHECKLIST (MANDATORY VERIFICATION):
- Complete all sentences - no incomplete thoughts.
- NO duplicate content anywhere in the email - check every sentence.
- NO repeated phrases or similar wording.
- Exactly one call-to-action, ending with a question mark (?).
- Proper signature formatting.
- Each sentence adds unique value.
- Personal touch included after greeting.`;

  const invoiceChecklist = `
- Standard Invoice Request specifics:
  • The structure MUST match the prompt exactly: Greeting -> Reminder -> "We use your invoice to:" -> 3 bullets -> Time-bound CTA question.
  • The reminder MUST reference a transcript/next_step if available.
  • The CTA MUST be a time-bound question ending in a question mark.`;

  const instructions = `User prompt: ${prompt || 'Draft a friendly outreach email.'}

${baseChecklist}${isInvoicePrompt ? invoiceChecklist : ''}

- Read the entire email once more to catch any duplication`;

  return [
    common,
    recipientContext,
    bizContext,
    transcriptAndNextStepsGuidelines, // NEW: Added explicit guidelines for transcript/next_steps
    priorityDirectives,
    dateGuidelines,
    brevityGuidelines,
    painPointGuidelines,
    energyGuidelines,
    notesGuidelines,
    subjectGuidelines,
    subjectVariety,
    bodyGuidelines,
    variationDirectives,
    specificHandling,
    personalTouch, // Moved to be just before the final instructions
    outputStyle,
    instructions
  ].join('\n\n');
}


export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing GEMINI_API_KEY' });

    const { prompt, mode = 'standard', recipient = null, to = '', style = 'auto', subjectStyle = 'auto', subjectSeed = '' } = req.body || {};
    const sys = buildSystemPrompt({ mode, recipient, to, prompt, style, subjectStyle, subjectSeed });

    // Using gemini-1.5-pro-latest
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;

    const apiRequestBody = {
      contents: [{ role: 'user', parts: [{ text: sys }] }],
      generationConfig: {
        // NEW: Enforcing JSON output for reliability
        response_mime_type: "application/json",
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 2048
      },
      // NEW: Defining the JSON schema the model MUST follow
      tools: [{
        function_declarations: [{
          name: "email_formatter",
          description: "Formats the email into a structured JSON object with a subject and a body.",
          parameters: {
            type: "OBJECT",
            properties: {
              subject: { type: "STRING", description: "The email subject line, 4-8 words long." },
              body: { type: "STRING", description: "The full email body, adhering to all content and formatting rules." }
            },
            required: ["subject", "body"]
          }
        }]
      }],
      tool_config: {
        function_calling_config: { mode: "ANY" } // Force the model to use the specified tool
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiRequestBody)
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data?.error?.message || 'Gemini API error';
      console.error('Gemini API Error:', data);
      return res.status(resp.status).json({ error: msg, details: data });
    }

    // Extract the function call response from the new JSON format
    const functionCall = data?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall && functionCall.name === 'email_formatter') {
      const { subject, body } = functionCall.args;
      // Reconstruct the simple text output for the frontend to parse
      const textOutput = `Subject: ${subject || ''}\n\n${body || ''}`;
      return res.status(200).json({ ok: true, output: textOutput, json: functionCall.args }); // Send both for compatibility
    }
    
    // Fallback to old text extraction if JSON/function call fails
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return res.status(200).json({ ok: true, output: text });

  } catch (e) {
    console.error('Gemini handler error', e);
    return res.status(500).json({ error: 'Failed to generate email', message: e.message });
  }
}
