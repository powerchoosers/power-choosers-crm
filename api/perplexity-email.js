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

// JSON Schema for HTML email structured output
const emailHtmlSchema = {
  type: "json_schema",
  json_schema: {
    name: "email_html_output",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Email subject line (under 50 characters)"
        },
        hero_section: {
          type: "string",
          description: "Opening greeting and intro paragraph with inline CSS. Use color:#1f2937 for text on white backgrounds."
        },
        cost_comparison_html: {
          type: "string",
          description: "HTML table showing current vs. Power Choosers rates. Red box (#e74c3c background, white text) for current costs, green box (#27ae60 background, white text) for savings. Include annual cost calculations. Use table-based layout with inline CSS only."
        },
        benefits_section_html: {
          type: "string",
          description: "2-column table layout showing benefits. Each column in a light grey box (#f8f9fa background, dark text #1f2937). Use table cells for columns. Inline CSS only."
        },
        additional_info_html: {
          type: "string",
          description: "Additional savings information (5-20% efficiency gains). Use styled div or table. Dark text (#374151) on light background. Inline CSS only."
        },
        cta_html: {
          type: "string",
          description: "Call-to-action button or text. Orange background (#e67e22), white text, rounded corners, centered. Use table for button structure. Include contact email and phone."
        }
      },
      required: ["subject", "hero_section", "cost_comparison_html", "benefits_section_html", "cta_html"],
      additionalProperties: false
    }
  }
};

function buildSystemPrompt({ mode, recipient, to, prompt, senderName = 'Lewis Patterson' }) {
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

  // For HTML mode, use JSON schema structured output
  if (mode === 'html') {
    return `You are generating content for a professional HTML email from Power Choosers.

SENDER: ${senderName}
EMAIL: l.patterson@powerchoosers.com
PHONE: 817-663-0380

CRITICAL INSTRUCTIONS:
- Generate structured JSON matching the schema
- All HTML must use INLINE CSS only (no external styles)
- Text on white/light backgrounds: use #1f2937 or #374151
- Text on dark backgrounds: use #ffffff
- Use table-based layouts for email compatibility
- Red (#e74c3c) for current costs, Green (#27ae60) for savings
- Include actual calculations based on recipient data
- ALWAYS use "${senderName}" when referring to yourself/the sender
- DO NOT use "Laurence" or any other name

RECIPIENT CONTEXT:
${recipientContext}

CONTENT REQUIREMENTS:
1. hero_section: Greeting + brief intro (dark text on white). Start with "Hello ${firstName}," then "I'm ${senderName} from Power Choosers..."
2. cost_comparison_html: Cost table with current rate vs. our rate, annual costs, savings
3. benefits_section_html: 2-column benefits (expert negotiation, efficiency solutions)
4. additional_info_html: Efficiency savings info (5-20% additional savings)
5. cta_html: Contact button with email (l.patterson@powerchoosers.com) and phone (817-663-0380)

Use web search to find context about ${company || 'the company'} for personalization.

OUTPUT: Return JSON matching the schema with properly styled HTML in each field.`;
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

    const { prompt, mode = 'standard', recipient = null, to = '', fromEmail = '', senderName = 'Lewis Patterson' } = req.body || {};
    
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
    
    const systemPrompt = dateContext + buildSystemPrompt({ mode, recipient, to, prompt, senderName });
    
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
      ],
      // Add JSON schema for HTML mode
      ...(mode === 'html' ? { response_format: emailHtmlSchema } : {})
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
    let content = data?.choices?.[0]?.message?.content || '';
    const citations = data?.citations || [];
    const searchResults = data?.search_results || [];
    
    // Parse JSON response for HTML mode
    if (mode === 'html' && content) {
      try {
        console.log('[Perplexity] Raw content from Sonar (first 500 chars):', content.substring(0, 500));
        const jsonResponse = JSON.parse(content);
        console.log('[Perplexity] Parsed JSON keys:', Object.keys(jsonResponse));
        console.log('[Perplexity] hero_section length:', jsonResponse.hero_section?.length || 0);
        console.log('[Perplexity] cost_comparison_html length:', jsonResponse.cost_comparison_html?.length || 0);
        console.log('[Perplexity] benefits_section_html length:', jsonResponse.benefits_section_html?.length || 0);
        console.log('[Perplexity] cta_html length:', jsonResponse.cta_html?.length || 0);
        
        const hasTags = (s) => /<[a-z][\s\S]*>/i.test(s || '');
        const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
        
        // Assemble HTML from JSON fields
        let hero = jsonResponse.hero_section;
        if (!hasTags(hero)) {
          console.log('[Perplexity] hero_section has no HTML tags, applying fallback styling');
          hero = `<div style="color:#1f2937; font-size:15px; line-height:1.6;">${escapeHtml(hero)}</div>`;
        }
        let cost = jsonResponse.cost_comparison_html;
        if (!hasTags(cost)) {
          console.log('[Perplexity] cost_comparison_html has no HTML tags, applying fallback styling');
          cost = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr><td style="background:#e74c3c; color:#ffffff; border-radius:6px; padding:14px;">${escapeHtml(cost || 'Current costs')}</td></tr>
  <tr><td style="height:8px;"></td></tr>
  <tr><td style="background:#27ae60; color:#ffffff; border-radius:6px; padding:14px;">Estimated with Power Choosers</td></tr>
</table>`;
        }
        let benefits = jsonResponse.benefits_section_html;
        if (!hasTags(benefits)) {
          console.log('[Perplexity] benefits_section_html has no HTML tags, applying fallback styling');
          benefits = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>
  <td width="50%" style="background:#f8f9fa; color:#1f2937; padding:16px; border-radius:6px;">${escapeHtml(benefits || 'Competitive rates')}</td>
  <td width="16" style="width:16px;">&nbsp;</td>
  <td width="50%" style="background:#f8f9fa; color:#1f2937; padding:16px; border-radius:6px;">Efficiency solutions</td>
</tr></table>`;
        }
        let cta = jsonResponse.cta_html;
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        if (!hasTags(cta)) {
          console.log('[Perplexity] cta_html has no HTML tags, applying fallback styling');
          cta = `<table border="0" cellspacing="0" cellpadding="0" style="margin:20px 0;">
  <tr>
    <td style="background:#e67e22; border-radius:28px; padding:14px 28px;">
      <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">Schedule Your Free Consultation</a>
    </td>
  </tr>
</table>`;
        } else {
          // Ensure mailto points to sender if no href present
          if (!/mailto:/i.test(cta)) {
            console.log('[Perplexity] cta_html has no mailto link, adding one');
            cta += `\n<table border="0" cellspacing="0" cellpadding="0" style="margin:12px 0;">
  <tr><td><a href="mailto:${mail}" style="color:#e67e22;">Email ${mail}</a></td></tr>
</table>`;
          }
        }

        const htmlBody = `
${hero}

${cost}

${benefits}

${jsonResponse.additional_info_html || ''}

${cta}
        `.trim();
        
        // Return as structured output
        content = `Subject: ${jsonResponse.subject || 'Energy Solutions'}

${htmlBody}`;
        
        console.log('[Perplexity] Parsed JSON structured output for HTML email');
      } catch (e) {
        console.warn('[Perplexity] Failed to parse JSON response, using raw content:', e);
      }
    }
    
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

