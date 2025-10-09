// Perplexity Sonar Email Generation (Serverless) - Vercel function
// Expects POST { prompt, mode: 'standard'|'html', recipient, to }
// Requires env var PERPLEXITY_API_KEY

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

function buildSystemPrompt({ mode, recipient, to, prompt }) {
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
  
  // Detect email type from prompt
  const promptLower = String(prompt || '').toLowerCase();
  const isWarmIntro = promptLower.includes('warm intro') || promptLower.includes('after a call') || promptLower.includes('after call');
  const isEnergyHealthCheck = /energy.*health.*check/i.test(promptLower);
  const isInvoiceRequest = /invoice.*request|send.*invoice/i.test(promptLower);
  const isColdEmail = /cold.*email|could.*not.*reach/i.test(promptLower);
  const isFollowUp = promptLower.includes('follow');
  
  // Add debug logging
  console.log('[Perplexity] Recipient data:', {
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

  // Define recipientContext BEFORE it's used in HTML mode check
  const recipientContext = `
RECIPIENT INFORMATION:
- Name: ${firstName || 'there'} ${company ? `at ${company}` : ''}
${job ? `- Role: ${job}` : ''}
${industry ? `- Industry: ${industry}` : ''}
${energy.supplier ? `- Current Supplier: ${energy.supplier}` : ''}
${energy.currentRate ? `- Current Rate: ${energy.currentRate}/kWh` : ''}
${contractEndLabel ? `- Contract Ends: ${contractEndLabel}` : ''}
${transcript ? `- Call Notes: ${transcript}` : ''}
${notes ? `- Additional Notes: ${notes}` : ''}

${company ? `Use your web search to find additional context about ${company} (industry, size, location, recent news) to personalize the email.` : ''}`;

  // For HTML mode, use completely different prompt structure
  if (mode === 'html') {
    const exampleStructure = `
<!-- Cost Comparison Table Example -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ecf0f1; border-radius: 8px; margin: 20px 0;">
  <tr><td style="padding: 25px;">
    <h3 style="color: #2c3e50; text-align: center;">Your Energy Costs</h3>
    
    <table width="100%" cellpadding="15" style="background-color: #e74c3c; border-radius: 6px; margin-bottom: 15px;">
      <tr><td>
        <h4 style="color: #ffffff;">Current Rate: $0.082/kWh</h4>
        <p style="color: #ffffff; font-size: 24px; font-weight: bold;">$418,200 annually</p>
      </td></tr>
    </table>
    
    <table width="100%" cellpadding="15" style="background-color: #27ae60; border-radius: 6px;">
      <tr><td>
        <h4 style="color: #ffffff;">Power Choosers Rate: $0.075/kWh</h4>
        <p style="color: #ffffff; font-size: 24px; font-weight: bold;">$382,500 annually</p>
        <p style="color: #ffffff;"><strong>Savings: $35,700/year</strong></p>
      </td></tr>
    </table>
  </td></tr>
</table>

<!-- 2-Column Benefits Example -->
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="50%" style="padding-right: 15px; vertical-align: top;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px;">
        <h4>🔥 Competitive Rates</h4>
        <p>Access to 100+ suppliers</p>
      </div>
    </td>
    <td width="50%" style="padding-left: 15px; vertical-align: top;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px;">
        <h4>⚡ Efficiency Audits</h4>
        <p>LED upgrades, HVAC optimization</p>
      </div>
    </td>
  </tr>
</table>

<!-- CTA Button Example -->
<table cellpadding="0" cellspacing="0" style="margin: 20px 0;">
  <tr>
    <td style="background-color: #e67e22; border-radius: 25px; padding: 15px 35px;">
      <a href="mailto:l.patterson@powerchoosers.com" style="color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
        Schedule Your Free Consultation
      </a>
    </td>
  </tr>
</table>`;

    return `You are an expert at creating professional HTML email templates for Power Choosers.

CRITICAL: Generate COMPLETE HTML EMAIL BODY with inline CSS (no external stylesheets).

YOUR TASK:
Generate a structured HTML email body that includes:

1. HERO SECTION (optional based on context):
   - Personalized greeting
   - Brief intro paragraph

2. MAIN CONTENT (choose appropriate structure):
   - Cost comparison tables (if numbers available)
   - 2-column benefit sections
   - Feature cards with icons/emojis
   - Bullet point lists
   - Color-coded boxes for emphasis

3. CALL TO ACTION:
   - Orange button linking to email/phone
   - Specific time slots or action request

4. STYLING REQUIREMENTS:
   - Use table-based layout (email-safe)
   - Inline CSS only
   - Background colors: Use green (#27ae60) for savings, red (#e74c3c) for costs, blue (#3498db) for benefits, grey (#ecf0f1) for neutral
   - Font: Arial, sans-serif
   - Responsive: max-width 600px
   - Professional spacing and padding

RECIPIENT CONTEXT:
${recipientContext}

OUTPUT:
Generate ONLY the email body HTML (no <html>, <head>, or <body> tags).
Start with the hero section and end with the CTA.
Use real data from context when available.

Example structure to follow:
${exampleStructure}

Subject: [Create compelling subject line under 50 chars]

[Your HTML content here]`;
  }

  // Build simplified system prompt - let Sonar do the research
  const identity = `You are an AI email assistant for Power Choosers, a company that helps businesses secure lower electricity and natural gas rates by competitively sourcing from 100+ suppliers.

KEY CONTEXT:
- Electricity rates are rising 15-25% due to data center demand
- Companies with contracts ending in 2025-2026 face renewal at higher rates
- Early renewals (3-6 months before contract end) typically save 20-30% vs. waiting`;

  // Build email structure based on type
  let structure = '';
  
  if (isWarmIntro) {
    structure = `EMAIL TYPE: Warm Introduction After Call

WRITE EXACTLY 3 PARAGRAPHS. STOP AFTER PARAGRAPH 3.

Paragraph 1 (1-2 sentences):
- Greeting: "I hope you're having a productive [day/week]"
- Call reference: "It was great speaking with you [today/yesterday] about ${company || 'your company'}'s energy needs"

Paragraph 2 (EXACTLY 3-4 SENTENCES):
- What we do: "Power Choosers helps ${industry || 'companies'} secure competitive electricity and natural gas rates"
- Market urgency: "With rates rising 15-25% due to data center demand, companies renewing in 2025-2026 face significant increases"
- How we help: "We source from 100+ suppliers to find rates below market, negotiate favorable terms, and time contracts to avoid rate spikes"
- Timing benefit: "Your contract ending ${contractEndLabel || 'in [timeframe]'} means you have time to lock in current pricing—early renewals save 20-30% vs. waiting"

Paragraph 3 (CTA with 2 specific time slots):
Format: "Does [Day Time] or [Day Time] work for a 15-minute call to review your options?"
Example: "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call to review your options?"

MUST include question mark. MUST have 2 specific time options.`;
    
  } else if (isEnergyHealthCheck) {
    structure = `EMAIL TYPE: Energy Health Check Invitation

WRITE EXACTLY 3 PARAGRAPHS. STOP AFTER PARAGRAPH 3.

Paragraph 1 (2 sentences):
- Greeting: "I hope you're having a productive [day/week]"
- What it is: "An Energy Health Check reviews your current electricity and natural gas contract to identify savings opportunities and protect against rising rates (up 15-25% due to market conditions)"

Paragraph 2 (2-3 sentences):
- What we review: "We review your current supplier/rate, contract end ${contractEndLabel || 'date'}, usage patterns, and projected costs at market rates vs. our negotiated rates"
- Why it matters: "With your contract ending ${contractEndLabel || 'soon'}, acting now means avoiding renewal at peak prices"

Paragraph 3 (CTA):
Format: "Does [Day Time] or [Day Time] work for a 15-minute review?"
Example: "Does Tuesday 10am-12pm or Thursday 2-4pm work for a 15-minute review?"`;
    
  } else if (isInvoiceRequest) {
    structure = `EMAIL TYPE: Invoice Request Follow-up

WRITE EXACTLY 3 PARAGRAPHS. STOP AFTER PARAGRAPH 3.

Paragraph 1 (2 sentences):
- Greeting + reminder: "Following up on our conversation about reviewing your energy costs"
- Urgency: "With rates climbing 15-25%, getting your invoice to me today means we can start identifying savings immediately"

Paragraph 2 (Bullet list):
"We use your invoice to:
• Confirm ESID(s) and service details
• Identify contract end date${contractEndLabel ? ` (${contractEndLabel})` : ''}
• Verify service addresses and usage patterns"

Paragraph 3 (CTA):
"Could you send your latest invoice by EOD today so my team can start your review right away?"`;
    
  } else if (isColdEmail) {
    structure = `EMAIL TYPE: Cold Email (Never Spoke Before)

WRITE EXACTLY 3 PARAGRAPHS. STOP AFTER PARAGRAPH 3.

Paragraph 1 (1-2 sentences):
- Greeting: "I hope you're having a productive [day/week]"
- Hook with fear: "Electricity and natural gas rates are spiking 15-25% across ${industry || 'your industry'} as suppliers warn of continued increases through 2026"

Paragraph 2 (2-3 sentences):
- Colleague reference: "I recently spoke with a colleague at ${company || 'your company'} about their energy needs"
- Value prop: "Power Choosers helps companies like yours secure rates below market by competitively sourcing from 100+ suppliers and timing renewals strategically"
- Benefit: "With your contract ending ${contractEndLabel || 'in the next 12-18 months'}, locking in rates now could save 20-30% compared to waiting until renewal"

Paragraph 3 (CTA):
Format: "Does [Day Time] or [Day Time] work for a quick 15-minute call?"
Example: "Does Tuesday 2-3pm or Thursday 10-11am work for a quick 15-minute call?"`;
    
  } else {
    structure = `EMAIL TYPE: ${isFollowUp ? 'Follow-up' : 'General Outreach'}

WRITE EXACTLY 3 PARAGRAPHS. STOP AFTER PARAGRAPH 3.

Paragraph 1: Greeting + personalized intro
Paragraph 2: Market urgency + value proposition (3-4 sentences): "With electricity and natural gas rates rising 15-25%, now is the time to review your options. Power Choosers helps companies secure competitive rates by sourcing from 100+ suppliers and timing renewals strategically."
Paragraph 3: CTA with 2 specific time slots
Format: "Does [Day Time] or [Day Time] work for a 15-minute call?"
Example: "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call?"`;
  }

  const qualityRules = `
QUALITY REQUIREMENTS:
✓ Length: 90-130 words total
✓ Use "${firstName || 'there'}," in greeting (ONCE only)
✓ Middle paragraph MUST be 3-4 complete sentences
✓ MUST mention "15-25%" rate increase
✓ CTA MUST include 2 specific time slots and end with question mark
✓ Subject line: Under 50 chars, include ${firstName || 'recipient name'}, hint at urgency
✓ Closing: "Best regards," on its own line

CRITICAL RULES:
❌ NO duplicate names ("Hi Patrick, Patrick...")
❌ NO vague CTAs ("open to a call next week?")
❌ NO incomplete sentences
✅ MUST stop writing after paragraph 3
✅ MUST include question mark in CTA
✅ MUST have 2 specific time options in CTA`;

  const outputFormat = `
OUTPUT FORMAT:
Subject: [Your subject line here]

[Body as 3 paragraphs of plain text]`;

  return [identity, structure, recipientContext, qualityRules, outputFormat].join('\n');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    // Validate API key
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[Perplexity] Missing PERPLEXITY_API_KEY environment variable');
      return res.status(500).json({ error: 'Missing PERPLEXITY_API_KEY environment variable' });
    }

    const { prompt, mode = 'standard', recipient = null, to = '' } = req.body || {};
    
    // Build system prompt with TODAY context
    const today = new Date();
    const todayLabel = today.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentYear = today.getFullYear();
    
    const dateContext = `TODAY'S DATE: ${todayLabel} (${currentYear})

CRITICAL: ALL time references MUST be in the FUTURE.
✅ Correct: "Tuesday 2-3pm", "Thursday afternoon", "next week"
❌ Wrong: Any month/year before ${currentYear}, or dates that have already passed

If you mention a specific month/year, it MUST be ${currentYear} or later.

`;
    
    const systemPrompt = dateContext + buildSystemPrompt({ mode, recipient, to, prompt });
    
    console.log('[Perplexity] Calling Sonar API with prompt type:', prompt);

    // Call Perplexity API
    const url = 'https://api.perplexity.ai/chat/completions';
    const body = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt || 'Draft a professional outreach email'
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      const msg = data?.error?.message || data?.detail || 'Perplexity API error';
      console.error('[Perplexity] API error:', msg, data);
      return res.status(response.status).json({ error: msg });
    }

    // Extract content and citations
    const content = data?.choices?.[0]?.message?.content || '';
    const citations = data?.citations || [];
    const searchResults = data?.search_results || [];
    
    console.log('[Perplexity] Response received, length:', content.length);
    if (citations.length > 0) {
      console.log('[Perplexity] Citations:', citations.slice(0, 3));
    }

    return res.status(200).json({ 
      ok: true, 
      output: content,
      citations: citations,
      search_results: searchResults
    });
    
  } catch (e) {
    console.error('[Perplexity] Handler error:', e);
    return res.status(500).json({ error: 'Failed to generate email', message: e.message });
  }
}

