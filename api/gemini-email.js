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
  const sqftRaw = r.squareFootage || r.square_footage || '';
  const sqftNum = Number(String(sqftRaw).replace(/[^0-9.]/g, ''));
  let facilityScale = '';
  if (!isNaN(sqftNum) && sqftNum > 0) {
    if (sqftNum < 20000) facilityScale = 'small facility';
    else if (sqftNum < 100000) facilityScale = 'mid-sized facility';
    else facilityScale = 'large facility';
  }

  const companyOverview = [
    'Power Choosers is an energy procurement and management partner.',
    'We competitively source from 100+ electricity and natural gas suppliers, negotiate agreements, and manage renewals.',
    'Services include: energy procurement, contract negotiation/renewals, bill management/reporting, and efficiency/sustainability guidance.'
  ].join(' ');

  const common = `You are Power Choosers' email assistant. Draft a clear, concise, and friendly ${mode === 'html' ? 'HTML' : 'plain text'} outbound email.
- Keep tone professional and helpful.
- Personalize with known recipient context when appropriate.
- Include a concrete next step (e.g., a brief call/demo time window).
- Avoid hallucinations; if unsure, keep it generic.
- Do not include handlebars-like placeholders (e.g., {{first_name}}). Use natural text.`;

  const recipientContext = `Recipient/context signals (use selectively; do not reveal sensitive specifics):
- Name: ${name || 'Unknown'} (${firstName || 'Unknown'})
- Company: ${company || 'Unknown'}
- Title/Role: ${job || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Facility: ${facilityScale || 'Unknown scale'} (do NOT mention exact square footage)
- Energy usage/supplier/contract (if relevant): ${usage || 'n/a'}, ${supplier || 'n/a'}, ${contractEnd || 'n/a'}
- LinkedIn: ${linkedin || 'n/a'}`;

  const bizContext = `About Power Choosers (for positioning only): ${companyOverview}`;

  const subjectGuidelines = `Subject line requirements:
- The FIRST LINE must begin with "Subject:" followed by the subject text.
- Keep it under ~60 characters and make it specific.
- Prefer including ${firstName ? 'the recipient\'s first name' : 'the company name'} and/or the company name (e.g., "${firstName || 'Name'} — energy options for ${company || 'your facilities'}").`;

  const bodyGuidelines = `Body requirements:
- Write 3 short paragraphs (1–3 sentences each) + a clear CTA.
- Reflect the recipient's title/company/industry when helpful.
- You may allude to scale (e.g., multi-site or large facility) but do NOT state exact square footage.
- Mention one or two of our offerings most relevant to this contact (procurement, renewals/contracting, bill management, or efficiency) without overloading the email.
- Keep it skimmable and client-friendly.`;

  const outputStyle = mode === 'html'
    ? `Formatting contract: Output must be exactly two parts.
1) First line: Subject: ...
2) Then one blank line, then the BODY as a minimal HTML fragment (no <html>/<head>/<body>). Use <p> for paragraphs.`
    : `Formatting contract: Output must be exactly two parts.
1) First line: Subject: ...
2) Then one blank line, then the BODY as plain text (no code fences).`;

  const instructions = `User prompt: ${prompt || 'Draft a friendly outreach email.'}`;

  return [
    common,
    recipientContext,
    bizContext,
    subjectGuidelines,
    bodyGuidelines,
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
