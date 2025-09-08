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

function buildSystemPrompt({ mode, recipient, to, prompt }) {
  const r = recipient || {};
  const name = r.fullName || r.full_name || r.name || '';
  const firstName = r.firstName || r.first_name || (name ? String(name).split(' ')[0] : '');
  const email = r.email || '';
  const company = r.company || r.accountName || '';
  const job = r.title || r.job || r.role || '';
  const industry = r.industry || '';
  const linkedin = r.linkedin || '';
  const energy = r.energy || {};
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
- Include exactly ONE clear call-to-action
- End with "Best regards," followed immediately by the sender name on the next line with no blank line between them
- Keep tone professional and helpful
- Personalize with known recipient context when appropriate
- Avoid hallucinations; if unsure, keep it generic
- Do not include handlebars-like placeholders (e.g., {{first_name}}). Use natural text
- Before sending, mentally check: "Have I used any phrase or sentence twice?" If yes, rewrite

PERSONAL TOUCH REQUIREMENT:
- After "Hi [Name]," always include a personal paragraph about the current time/season
- Be aware of the current day of the week and upcoming/recent holidays
- Examples: "I hope you're having a great start to the week" (Monday), "I hope you're having a productive week" (Tuesday-Thursday), "I hope you're having a great Friday" (Friday), "I hope you're having a wonderful holiday season" (near Christmas), "I hope you're having a great start to the new year" (January), etc.
- Keep it natural and warm, not generic

CONTEXT AWARENESS:
- For "warm intro after a call": Reference the previous conversation naturally, don't repeat the same phrase twice
- For "follow-up with tailored value props": Focus on specific benefits relevant to their industry/company size
- For "schedule an energy health check":
    • Never reference speaking with a colleague; do not include that phrasing in this email type.
    • Use notes to infer relationship stage:
      – If notes indicate we already spoke (e.g., "spoke with", "talked to", "met", "called"), write as a warm follow‑up.
      – Otherwise treat as a cold intro and briefly explain what an Energy Health Check is and why companies need one.
    • Briefly outline what the health check covers: current bill/supplier/rate review, contract end month/year (Month YYYY only), quick usage estimate, Energy Health Score, projected costs at our sell rate vs. current, supplier BBB rating insight, and recommended next steps.
    • Offer two specific time windows and include exactly one short question CTA.
- For "proposal delivery with next steps": Reference the proposal and outline clear next steps
- For "cold email to a lead I could not reach by phone": This is a COLD email to someone you have NEVER spoken with. In the second paragraph, start with "I recently spoke with ${colleagueInfo?.found ? colleagueInfo.name : 'a colleague'} at ${company || 'your company'} and wanted to connect with you as well" - do NOT say "following up on our call" or reference any conversation with this specific person`;

  const recipientContext = `Recipient/context signals (use selectively; do not reveal sensitive specifics):
- Name: ${name || 'Unknown'} (${firstName || 'Unknown'})
- Company: ${company || 'Unknown'}
- Title/Role: ${job || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Facility: ${facilityScale || 'Unknown scale'} (do NOT mention exact square footage)
- Energy (if relevant): usage=${usage || 'n/a'}; supplier=${supplier || 'n/a'}; currentRate=${currentRate || 'n/a'}; contractEnd=${contractEndLabel || 'n/a'}
- LinkedIn: ${linkedin || 'n/a'}
- Notes (free text, optional): ${notes || 'n/a'}
- Colleague contact: ${colleagueInfo?.found ? colleagueInfo.name : 'none found'}`;

  const bizContext = `About Power Choosers (for positioning only): ${companyOverview}`;

  const subjectGuidelines = `Subject line requirements:
- The FIRST LINE must begin with "Subject:" followed by the subject text.
- Keep it tight: aim under ~50 characters; make it specific.
- Prefer including ${firstName ? 'the recipient\'s first name' : 'the company name'} and/or the company name (e.g., "${firstName || 'Name'} — energy options for ${company || 'your facilities'}").
- When applicable, hint the chosen pain point in the subject (e.g., "${company || 'Your accounts'} — simplify bills" or "${firstName || 'Team'} — renewal timing")
- For other email types: Experiment with different approaches - questions, value props, time-sensitive offers, industry-specific benefits, etc.` + (isColdPrompt
    ? `\n- For "cold email to a lead I could not reach by phone": Consider a pattern-interrupt subject or a specific pain point (e.g., renewal risk, above-market rate) and you may include reference to speaking with their colleague if appropriate.`
    : '');

  const brevityGuidelines = `Brevity and style requirements:
- Total body length target: ~70–110 words max (be concise).
- Use short sentences and plain words. Cut filler and hedging.
- Prefer active voice and verbs over adjectives.
- Keep one value prop tightly aligned to the hook.`;

  const bodyGuidelines = `Body requirements (STRICT ADHERENCE):
- Structure: 2 very short paragraphs (1–2 sentences each) + a single-line CTA.
- NEVER duplicate any sentence, phrase, or information within the email
- Each sentence must add unique value - no repetition
- Include exactly ONE call-to-action
- Reflect the recipient's title/company/industry when helpful.
- You may allude to scale (e.g., multi-site or large facility) but do NOT state exact square footage.
- Mention one or two of our offerings most relevant to this contact (procurement, renewals/contracting, bill management, or efficiency) without overloading the email.
- Keep it skimmable and client-friendly.
 - Avoid opening with generic statements (e.g., "we work with 100+ suppliers"). Lead with the most relevant point for the reader.`;

  const specificHandling = `SPECIFIC PROMPT HANDLING:
  - "Warm intro after a call": Reference the call once (what we discussed), then propose specific next steps and suggest two time windows for a follow-up. Keep it concise.
  - "Follow-up with tailored value props": Assume a few days/weeks have passed. Recap in one line, then highlight 1–2 tailored benefits tied to their industry/facility scale or known data. Optionally include one brief proof point. End with a light CTA to keep the lead warm.
  - "Schedule an energy health check":
    • Do NOT include any mention of speaking with a colleague (that belongs only to the cold-call-not-reached template).
    • If notes imply prior conversation, write a warm follow‑up; otherwise, for cold outreach, include a one‑line explanation of what the Energy Health Check is, why it matters, and tie benefits to known data or common pain points for their industry.
    • Explicitly mention coverage: current bill/supplier/rate review, contract end month/year, quick usage estimate, Energy Health Score, projected costs at our sell rate vs. current, supplier BBB rating, recommended next steps.
    • End with exactly one short question CTA with two time windows.
  - "Proposal delivery with next steps": Provide a crisp summary of the options (supplier/term/rate/est. annual cost/notable terms), selection guidance, and 2–3 clear next steps. CTA: short call to review/confirm.
  - "Cold email to a lead I could not reach by phone": This is a COLD email to someone you have NEVER spoken with. Structure: 1) Pattern‑interrupt hook using one concrete pain point or timely risk for their industry (no generic claims), 2) "I recently spoke with ${colleagueInfo?.found ? colleagueInfo.name : 'a colleague'} at ${company || 'your company'} and wanted to connect with you as well" + tightly aligned value prop, 3) ONE call‑to‑action. NEVER say "following up on our call" with this person.`;

  const energyGuidelines = `If energy contract details exist, weave them in briefly (do not over-explain):
- Supplier: mention by name (e.g., "with ${supplier || 'your supplier'}").
- Contract end: reference month and year only (no day), e.g., "before ${contractEndLabel || 'your renewal window'}".
- Current rate: you may reference the rate succinctly if provided (e.g., "at ${currentRate || 'your current'} $/kWh").
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
- Complete all sentences - no incomplete thoughts
- NO duplicate content anywhere in the email - check every sentence
- NO repeated phrases or similar wording
- Exactly one call-to-action
- Proper signature formatting with no blank line before sender name
- Each sentence adds unique value to the email
- Personal touch included after greeting (day/season awareness)`;

  const coldChecklist = `
- Cold email specifics:
  • Do NOT reference any prior conversation with this person.
  • In paragraph 1, use a concrete pain point or timely risk as a pattern‑interrupt hook (avoid generic claims).
  • In paragraph 2, include: "I recently spoke with ${colleagueInfo?.found ? colleagueInfo.name : 'a colleague'} at ${company || 'your company'} and wanted to connect with you as well" + a tightly aligned value prop.
  • Subject may reference the colleague or a specific risk/pain point.
  • Include exactly ONE call-to-action, no duplicates.`;

  const instructions = `User prompt: ${prompt || 'Draft a friendly outreach email.'}

${baseChecklist}${isColdPrompt ? coldChecklist : ''}

- Read the entire email once more to catch any duplication`;

  return [
    common,
    recipientContext,
    bizContext,
    dateGuidelines,
    brevityGuidelines,
    painPointGuidelines,
    energyGuidelines,
    notesGuidelines,
    subjectGuidelines,
    bodyGuidelines,
    specificHandling,
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

    const { prompt, mode = 'standard', recipient = null, to = '' } = req.body || {};
    const sys = buildSystemPrompt({ mode, recipient, to, prompt });

    // Google Generative Language API (Gemini 1.5 Pro)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: sys }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 2048
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || 'Gemini API error';
      return res.status(resp.status).json({ error: msg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return res.status(200).json({ ok: true, output: text });
  } catch (e) {
    console.error('Gemini handler error', e);
    return res.status(500).json({ error: 'Failed to generate email', message: e.message });
  }
}
