// Gemini Email Generation (Serverless) - Vercel function
// Expects POST { prompt, mode: 'standard'|'html', recipient, to }
// Requires env var GEMINI_API_KEY

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://power-choosers-crm.vercel.app'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function buildSystemPrompt({ mode, recipient, to, prompt, style, subjectStyle, subjectSeed }) {
  // Extract recipient data
  const r = recipient || {};
  const name = r.fullName || r.full_name || r.name || '';
  const firstName = r.firstName || r.first_name || (name ? String(name).split(' ')[0] : '');
  const company = r.company || r.accountName || '';
  const job = r.title || r.job || r.role || '';
  const industry = r.industry || '';
  const energy = r.energy || {};
  const transcript = (r.transcript || r.callTranscript || r.latestTranscript || '').toString().slice(0, 1000);
  const notes = [r.notes, r.account?.notes].filter(Boolean).join('\n').slice(0, 500);
  
  // Format contract end date to Month YYYY
  const toMonthYear = (val) => {
    const s = String(val || '').trim();
    if (!s) return '';
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${months[d.getMonth()]} ${d.getFullYear()}`;
    const m = s.match(/(\d{1,2})[\/\-].*?(\d{4})/);
    return m ? `${months[Math.min(12, Math.max(1, parseInt(m[1])))-1]} ${m[2]}` : s;
  };
  
  const contractEndLabel = toMonthYear(energy.contractEnd || '');
  
  // Detect email type
  const promptLower = String(prompt || '').toLowerCase();
  const isEnergyHealthCheck = /energy.*health.*check/i.test(promptLower);
  const isInvoiceRequest = /invoice.*request|send.*invoice/i.test(promptLower);
  const isColdEmail = /cold.*email|could.*not.*reach/i.test(promptLower);
  
  // Build simplified system prompt
  const identity = `You are Power Choosers' email assistant. Create a ${mode === 'html' ? 'structured' : 'concise'} professional email.

WHO WE ARE: Power Choosers helps companies save on electricity and natural gas by competitively sourcing from 100+ suppliers, negotiating contracts, and managing renewals.`;

  const recipientContext = `RECIPIENT:
- Name: ${firstName || 'there'} (${company || 'Unknown Company'})
- Role: ${job || 'Unknown'}
- Industry: ${industry || 'Unknown'}
${energy.supplier ? `- Current Supplier: ${energy.supplier}` : ''}
${energy.currentRate ? `- Current Rate: ${energy.currentRate}/kWh` : ''}
${contractEndLabel ? `- Contract Ends: ${contractEndLabel}` : ''}
${transcript ? `- Recent Call Notes: ${transcript}` : ''}
${notes ? `- Additional Context: ${notes}` : ''}`;

  const emailTypeInstructions = (() => {
    if (isEnergyHealthCheck) {
      return `EMAIL TYPE: Energy Health Check Invitation
STRUCTURE:
- Greeting + warm intro (reference day/season)
- Explain what Energy Health Check is (1-2 sentences): review of current bill/supplier/rate, contract end, usage estimate, projected savings, supplier rating
- Offer 2 specific time slots
- ONE clear CTA question`;
    }
    
    if (isInvoiceRequest) {
      return `EMAIL TYPE: Invoice Request Follow-up
STRUCTURE:
- Greeting + warm reminder
- Explain why we need invoice (3 bullet points):
  • ESID(s)
  • Contract End Date
  • Service Address
- ONE time-bounded CTA (today or EOD)`;
    }
    
    if (isColdEmail) {
      return `EMAIL TYPE: Cold Email (Never Spoke Before)
STRUCTURE:
- Greeting + warm intro (reference day/season)
- Paragraph 1: Pattern-interrupt hook with specific pain point or opportunity
- Paragraph 2: "I recently spoke with [colleague name] at ${company || 'your company'} and wanted to connect with you as well" + value prop
- ONE clear CTA`;
    }
    
    return `EMAIL TYPE: ${promptLower.includes('follow') ? 'Follow-up' : promptLower.includes('warm') ? 'Warm Intro' : 'General Outreach'}
STRUCTURE:
- Greeting + personalized intro (reference day/season, call transcript if available)
- 1-2 short paragraphs (1-2 sentences each)
- Include relevant energy details naturally if available
- ONE clear CTA`;
  })();

  const qualityRules = `QUALITY REQUIREMENTS:
✓ Length: 70-110 words total
✓ Greeting: Use "${firstName || 'there'}," then add season/day awareness ("I hope you're having a productive week")
✓ NO duplicate phrases or repeated information
✓ ONE call-to-action only
✓ Reference energy data naturally if provided (${energy.supplier ? `supplier ${energy.supplier}` : ''}${energy.currentRate ? `, rate ${energy.currentRate}` : ''}${contractEndLabel ? `, contract ends ${contractEndLabel}` : ''})
✓ Use transcript insights if available
✓ Subject line: Under 50 chars, include ${firstName ? 'recipient name' : 'company name'}, be specific
✓ Dates: Month YYYY only (never exact day)
✓ Closing: "Best regards," then sender name on next line (no blank line between)
✓ NO placeholders like {{name}} - use actual names`;

  const outputFormat = mode === 'html'
    ? `OUTPUT FORMAT:
Subject: [Your subject line here]

[Body content as plain text paragraphs - the frontend will style it with cards, buttons, and icons]`
    : `OUTPUT FORMAT:
Subject: [Your subject line here]

[Body as plain text paragraphs]`;

  return [identity, recipientContext, emailTypeInstructions, qualityRules, outputFormat, `\nUSER REQUEST: ${prompt || 'Draft outreach email'}`].join('\n\n');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing GEMINI_API_KEY' });

    const { prompt, mode = 'standard', recipient = null, to = '', style = 'auto', subjectStyle = 'auto', subjectSeed = '' } = req.body || {};
    const sys = buildSystemPrompt({ mode, recipient, to, prompt, style, subjectStyle, subjectSeed });

    // Google Generative Language API (Gemini 2.0 Flash Experimental - latest model)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
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
      console.error('[Gemini] API error:', msg, data);
      return res.status(resp.status).json({ error: msg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return res.status(200).json({ ok: true, output: text });
  } catch (e) {
    console.error('Gemini handler error', e);
    return res.status(500).json({ error: 'Failed to generate email', message: e.message });
  }
}
