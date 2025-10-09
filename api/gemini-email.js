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

WHO WE ARE: Power Choosers helps companies secure lower electricity and natural gas rates by competitively sourcing from 100+ suppliers, negotiating contracts, and managing renewals. With electricity rates rising 15-25% due to data center demand, companies that lock in rates NOW can save significantly.`;
  
  // Add debug logging for transcript and notes
  console.log('[Gemini] Recipient data:', {
    name: firstName,
    company,
    hasTranscript: !!transcript,
    hasNotes: !!notes,
    transcriptLength: transcript.length,
    notesLength: notes.length,
    energyData: {
      supplier: energy.supplier || 'none',
      rate: energy.currentRate || 'none',
      contractEnd: contractEndLabel || 'none'
    }
  });

  const marketUrgency = `MARKET CONTEXT (Use strategically):
- Electricity rates are rising 15-25% due to data center boom and increased demand
- Suppliers are warning of continued increases through 2025-2026
- Companies with contracts ending in 2025-2026 face renewal at higher rates
- Acting before contract end (ideally 3-6 months early) locks in current pricing
- Late renewals often result in 20-30% higher rates than early renewals

USE THIS TO CREATE URGENCY: Reference rising rates, supplier warnings, or timing risk when relevant.`;

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
    if (promptLower.includes('warm intro') || promptLower.includes('after a call') || promptLower.includes('after call')) {
      return `EMAIL TYPE: Warm Intro After Recent Call
STRUCTURE (STRICT ORDER - MUST FOLLOW EXACTLY):

Paragraph 1 - MUST BE EXACTLY 1-2 SENTENCES:
  1. Greeting: "I hope you're having a productive week"
  2. Call reference: "It was great speaking with you [today/yesterday/earlier today] about ${company || 'your company'}'s electricity and natural gas needs"

Paragraph 2 - MUST BE EXACTLY 3-4 SENTENCES containing ALL of these:
  1. What we do (1 sentence): "Power Choosers helps ${industry || 'companies'} secure competitive electricity and natural gas rates"
  2. Market urgency (1 sentence): "With rates rising 15-25% due to data center demand, companies renewing in 2025-2026 face significant increases"
  3. How we help (1 sentence): "We source from 100+ suppliers to find rates below market, negotiate favorable terms, and time contracts to avoid rate spikes"
  4. Timing urgency (1 sentence): "Your contract ending ${contractEndLabel || 'soon'} means you have [X months] to lock in current pricing before rates climb further—early renewals typically save 20-30% vs. waiting"

Paragraph 3 - MUST BE A QUESTION WITH SPECIFIC TIME SLOTS:
  Example: "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call to review your options?"
  
MANDATORY ELEMENTS:
✓ MUST mention "15-25%" rate increase
✓ MUST mention "data center demand" or "rising rates"
✓ MUST include two specific time slots (Day + Time)
✓ Middle paragraph MUST be 3-4 complete sentences
✓ NEVER repeat recipient's name after greeting`;
    }
    
    if (isEnergyHealthCheck) {
      return `EMAIL TYPE: Energy Health Check Invitation
STRUCTURE:
Paragraph 1 (2 sentences):
  - Greeting with day/season awareness
  - What it is + urgency: "An Energy Health Check reviews your current electricity and natural gas contract to identify savings opportunities and protect against rising rates (up 15-25% due to market conditions)"

Paragraph 2 (2-3 sentences):
  - What we review: Current supplier/rate, contract end ${contractEndLabel ? contractEndLabel : 'date'}, usage patterns, projected costs at market rates vs. our negotiated rates, supplier reliability
  - Why it matters: "With your contract ending ${contractEndLabel ? contractEndLabel : 'soon'}, acting now means avoiding renewal at peak prices"

Paragraph 3:
  - Specific CTA with 2 time slots: "Does [Day Time] or [Day Time] work for a 15-minute review?"

CRITICAL: Emphasize rising rates (15-25%) and timing risk`;
    }
    
    if (isInvoiceRequest) {
      return `EMAIL TYPE: Invoice Request Follow-up
STRUCTURE:
Paragraph 1 (2 sentences):
  - Greeting + reminder: "Following up on our conversation about reviewing your electricity and natural gas costs"
  - Urgency tie-in: "With rates climbing 15-25%, getting your invoice to me today means we can start identifying savings immediately"

Paragraph 2 (Bullet list):
  - "We use your invoice to:"
  • Confirm ESID(s) and service details
  • Identify contract end date (${contractEndLabel || 'to time your renewal optimally'})
  • Verify service addresses and usage patterns

Paragraph 3:
  - Time-bounded CTA: "Could you send your latest invoice by EOD today so my team can start your review right away?"`;
    }
    
    if (isColdEmail) {
      return `EMAIL TYPE: Cold Email (Never Spoke Before)
STRUCTURE:
Paragraph 1 (1-2 sentences):
  - Greeting with day/season awareness
  - Pattern-interrupt hook with FEAR: "Electricity and natural gas rates are spiking 15-25% across ${industry || 'your industry'} as suppliers warn of continued increases through 2026"

Paragraph 2 (2-3 sentences):
  - Colleague reference: "I recently spoke with a colleague at ${company || 'your company'} about their energy needs"
  - Value prop with urgency: "Power Choosers helps companies like yours secure rates below market by competitively sourcing from 100+ suppliers and timing renewals strategically"
  - Specific benefit: "With your contract ending ${contractEndLabel || 'in the next 12-18 months'}, locking in rates now could save 20-30% compared to waiting until renewal"

Paragraph 3:
  - Specific CTA with 2 time slots

CRITICAL: Create fear of missing out, emphasize cost of waiting`;
    }
    
    return `EMAIL TYPE: ${promptLower.includes('follow') ? 'Follow-up' : 'General Outreach'}
STRUCTURE:
- Greeting + personalized intro (reference day/season, call transcript if available)
- 2-3 paragraphs with market urgency: "With electricity rates rising 15-25%, now is the time to review your options"
- Include relevant energy details naturally if available
- ONE clear CTA with specific time slots`;
  })();

  const qualityRules = `QUALITY REQUIREMENTS (STRICT ENFORCEMENT):
✓ Length: 90-130 words total
✓ STRUCTURE COMPLIANCE: Follow the paragraph structure exactly as specified above
✓ Greeting: Use "${firstName || 'there'}," ONCE, then add season/day awareness
✓ Middle paragraph: MUST be 3-4 complete sentences with urgency
✓ Market urgency: MUST mention "15-25%" and "data center demand" or "rising rates"
✓ CTA: MUST include two specific time slots (e.g., "Tuesday 2-3pm or Thursday 10-11am")
✓ Fear + Solution: Create urgency then show how we solve it
✓ NO duplicate phrases or repeated information
✓ ONE call-to-action with specific time slots
✓ Reference ${energy.supplier ? `supplier ${energy.supplier}` : 'their supplier'}${contractEndLabel ? `, contract ending ${contractEndLabel}` : ''} naturally
✓ Subject line: Under 50 chars, include ${firstName ? 'recipient name' : 'company name'}, hint at urgency
✓ Closing: "Best regards," then sender name on next line`;

  const avoidPatterns = `AVOID THESE PATTERNS:
❌ Generic CTAs: "Would you be open to a call next week?" - TOO VAGUE
✅ Specific CTAs: "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call?"

❌ Short middle paragraph: "We help companies save. Your contract ends soon."
✅ Proper middle paragraph: "Power Choosers helps ${industry || 'companies'} secure competitive electricity and natural gas rates. With rates rising 15-25% due to data center demand, companies renewing in 2025-2026 face significant increases. We source from 100+ suppliers to find rates below market and time contracts strategically. Your contract ending ${contractEndLabel || 'May 2026'} means you have months to lock in pricing—early renewals save 20-30%."

❌ No urgency: "Power Choosers can help with your energy needs."
✅ With urgency: "With rates spiking 15-25% due to data center demand, companies renewing now face significant increases."

❌ Repeating name: "Hi Patrick, Patrick, I hope..."
✅ Correct: "Hi Patrick, I hope you're having a productive week."`;

  const outputFormat = mode === 'html'
    ? `OUTPUT FORMAT:
Subject: [Your subject line here]

[Body content as plain text paragraphs - the frontend will style it with cards, buttons, and icons]`
    : `OUTPUT FORMAT:
Subject: [Your subject line here]

[Body as plain text paragraphs]`;

  return [identity, marketUrgency, recipientContext, emailTypeInstructions, qualityRules, avoidPatterns, outputFormat, `\nUSER REQUEST: ${prompt || 'Draft outreach email'}`].join('\n\n');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    // Anchor 'today' server-side to help models avoid past dates in CTAs
    const today = new Date();
    const todayLabel = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing GEMINI_API_KEY' });

    const { prompt, mode = 'standard', recipient = null, to = '', style = 'auto', subjectStyle = 'auto', subjectSeed = '' } = req.body || {};
    const sys = [
      `TODAY: ${todayLabel}. If you suggest times, they MUST be in the future relative to this date. Never propose past months/years. Prefer this/next week windows.`,
      buildSystemPrompt({ mode, recipient, to, prompt, style, subjectStyle, subjectSeed })
    ].join('\n\n');

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
