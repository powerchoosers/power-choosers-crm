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
  const name = r.name || r.full_name || r.fullName || '';
  const email = r.email || '';
  const company = r.company || r.accountName || '';
  const job = r.title || r.role || '';

  const common = `You are Power Choosers' email assistant. You will draft a clear, concise, and friendly ${mode === 'html' ? 'HTML' : 'plain text'} email for outbound sales.
- Keep tone professional and helpful.
- Personalize with known recipient context when appropriate.
- Include a concrete next step.
- Avoid hallucinations: if unsure about a fact, keep it generic.
- Do not include placeholders like {{first_name}}; write using natural language, we will merge variables later as needed.`;

  const recipientContext = `Known recipient fields:
- Name: ${name || 'Unknown'}
- Email: ${email || 'Unknown'}
- Company: ${company || 'Unknown'}
- Title/Role: ${job || 'Unknown'}`;

  const outputStyle = mode === 'html'
    ? `Output STRICTLY valid HTML fragment suitable for an email body. Use semantic tags and inline styles where helpful. Do not include <html>, <head>, or <body> wrappers; produce the inner HTML only.`
    : `Output plain text suitable for an email body. Do not include code fences.`;

  const instructions = `User prompt: ${prompt || 'Draft a friendly outreach email.'}`;

  return [common, recipientContext, outputStyle, instructions].join('\n\n');
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
