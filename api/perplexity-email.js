// Perplexity Sonar Email Generation (Serverless) - Vercel function
// 7 Preset HTML Templates - AI provides text only, we control styling
// Expects POST { prompt, mode: 'standard'|'html', recipient, to, senderName, fromEmail }

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

// Template type detection (exact match)
function getTemplateType(prompt) {
  const promptMap = {
    'Warm intro after a call': 'warm_intro',
    'Follow-up with tailored value props': 'follow_up',
    'Schedule an Energy Health Check': 'energy_health',
    'Proposal delivery with next steps': 'proposal',
    'Cold email to a lead I could not reach by phone': 'cold_email',
    'Standard Invoice Request': 'invoice'
  };
  
  return promptMap[prompt] || 'general'; // Default to general template for manual prompts
}

// Calculate business days (excluding weekends)
function addBusinessDays(startDate, days) {
  let count = 0;
  let current = new Date(startDate);
  
  while (count < days) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
  }
  
  return current;
}

// Format deadline with calculated business days
function formatDeadline(days = 3) {
  const deadline = addBusinessDays(new Date(), days);
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const formatted = deadline.toLocaleDateString('en-US', options);
  return `Needed in ${days} business days (by ${formatted})`;
}

// JSON Schema for Template 1: Warm Intro
const warmIntroSchema = {
  type: "json_schema",
  json_schema: {
    name: "warm_intro_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        call_reference: { type: "string", description: "Reference to the call (day, topic)" },
        main_message: { type: "string", description: "What we discussed and next steps" },
        cta_text: { type: "string", description: "Time slot options question" }
      },
      required: ["subject", "greeting", "call_reference", "main_message", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 2: Follow-Up
const followUpSchema = {
  type: "json_schema",
  json_schema: {
    name: "follow_up_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        progress_update: { type: "string", description: "Where we are in process" },
        value_props: { type: "array", items: { type: "string" }, description: "4-6 selling points" },
        urgency_message: { type: "string", description: "Market timing message" },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "progress_update", "value_props", "urgency_message", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 3: Energy Health Check
const energyHealthSchema = {
  type: "json_schema",
  json_schema: {
    name: "energy_health_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        assessment_items: { type: "array", items: { type: "string" }, description: "Items we review" },
        contract_info: { type: "string", description: "Current contract details" },
        benefits: { type: "string", description: "What they'll learn" },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "assessment_items", "contract_info", "benefits", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 4: Proposal Delivery
const proposalSchema = {
  type: "json_schema",
  json_schema: {
    name: "proposal_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        proposal_summary: { type: "string", description: "Key terms overview" },
        pricing_highlight: { type: "string", description: "Main pricing numbers" },
        timeline: { type: "array", items: { type: "string" }, description: "Implementation steps" },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "proposal_summary", "pricing_highlight", "timeline", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 5: Cold Email
const coldEmailSchema = {
  type: "json_schema",
  json_schema: {
    name: "cold_email_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        pain_points: { type: "array", items: { type: "string" }, description: "Industry challenges" },
        solution_intro: { type: "string", description: "How we help" },
        social_proof: { type: "string", description: "Companies like yours..." },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "pain_points", "solution_intro", "social_proof", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 6: Invoice Request
const invoiceSchema = {
  type: "json_schema",
  json_schema: {
    name: "invoice_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        intro_paragraph: { type: "string", description: "Context about why we're conducting energy analysis, reference notes/transcripts from conversation" },
        checklist_items: { type: "array", items: { type: "string" }, description: "What we review from invoice" },
        discrepancies: { type: "array", items: { type: "string" }, description: "3-4 common billing discrepancies to watch for based on industry/company" },
        deadline: { type: "string", description: "When we need it (e.g., in 3 business days by [date])" },
        cta_text: { type: "string", description: "Call to action asking for invoice" }
      },
      required: ["subject", "greeting", "intro_paragraph", "checklist_items", "discrepancies", "deadline", "cta_text"],
      additionalProperties: false
    }
  }
};

// JSON Schema for Template 7: General/Manual
const generalSchema = {
  type: "json_schema",
  json_schema: {
    name: "general_template",
    strict: true,
    schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject under 50 chars" },
        greeting: { type: "string", description: "Hello {firstName}," },
        sections: { type: "array", items: { type: "string" }, description: "1-5 content blocks" },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "sections", "cta_text"],
      additionalProperties: false
    }
  }
};

// Get schema based on template type
function getTemplateSchema(templateType) {
  const schemas = {
    warm_intro: warmIntroSchema,
    follow_up: followUpSchema,
    energy_health: energyHealthSchema,
    proposal: proposalSchema,
    cold_email: coldEmailSchema,
    invoice: invoiceSchema,
    general: generalSchema
  };
  return schemas[templateType] || generalSchema;
}

function buildSystemPrompt({ mode, recipient, to, prompt, senderName = 'Lewis Patterson', templateType }) {
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
  
  // Format contract end date
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
`;

  // For HTML mode, return text-only prompts based on template type
  if (mode === 'html') {
    const basePrompt = `You are generating TEXT CONTENT ONLY for Power Choosers email templates.

SENDER: ${senderName}
IMPORTANT: Return PLAIN TEXT only in JSON fields. NO HTML tags, NO styling, NO formatting.
We handle all HTML/CSS styling on our end.

${recipientContext}

Use web search to personalize content about ${company || 'the recipient'}.`;

    // Template-specific instructions
    const templateInstructions = {
      warm_intro: `
TEMPLATE: Warm Introduction After Call
Generate text for these fields:
- greeting: "Hello ${firstName}," 
- call_reference: Mention when you spoke and what you discussed
- main_message: Brief recap of conversation, value prop, urgency (2-3 sentences)
- cta_text: Suggest 2 specific time slots like "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call?"`,

      follow_up: `
TEMPLATE: Follow-Up with Value Props
Generate text for these fields:
- greeting: "Hello ${firstName},"
- progress_update: Brief status update on where things stand
- value_props: Array of 4-6 concise selling points (each 1 sentence)
- urgency_message: Market timing/urgency message (1-2 sentences)
- cta_text: Clear next step request`,

      energy_health: `
TEMPLATE: Energy Health Check Invitation
Generate text for these fields:
- greeting: "Hello ${firstName},"
- assessment_items: Array of 4-6 items we review (concise, 1 line each)
- contract_info: Reference to their contract end date ${contractEndLabel || 'soon'}
- benefits: What they'll learn from assessment (2-3 sentences)
- cta_text: Suggest 2 time slots for review`,

      proposal: `
TEMPLATE: Proposal Delivery
Generate text for these fields:
- greeting: "Hello ${firstName},"
- proposal_summary: Brief overview of proposal terms (2-3 sentences)
- pricing_highlight: Key pricing numbers/savings (1-2 sentences)
- timeline: Array of 3-5 implementation steps
- cta_text: Next action request`,

      cold_email: `
TEMPLATE: Cold Email Outreach
Generate text for these fields:
- greeting: "Hello ${firstName},"
- pain_points: Array of 3-4 industry challenges (concise)
- solution_intro: How Power Choosers solves these (2-3 sentences)
- social_proof: Reference to similar companies (1-2 sentences)
- cta_text: Low-pressure meeting request`,

      invoice: `
TEMPLATE: Invoice Request
Generate text for these fields:
- greeting: "Hello ${firstName},"
- intro_paragraph: Context from our conversation explaining we'll conduct an energy analysis to identify discrepancies and determine how ${company || 'the company'} is using energy and the best plan moving forward. Reference notes/transcripts if available. (2-3 sentences)
- checklist_items: Array of 3-4 specific items we'll review from the invoice (e.g., invoice date/number, billing period, charge breakdown, payment details)
- discrepancies: Array of 3-4 common billing discrepancies to watch for. Intelligently select based on:
  * Industry type: ${industry || 'general business'}
  * Company size: ${energy.annualUsage ? `${energy.annualUsage} kWh annually` : 'standard commercial'}
  * Business nature: ${company || 'commercial'} ${job ? `(${job})` : ''}
  Choose from: high rates, excessive delivery charges, hidden fees, wrong contract type, poor customer service, unfavorable renewal timing, demand charges, peak usage penalties, incorrect meter readings, unauthorized fees
- deadline: Use exactly: "${formatDeadline(3)}"
- cta_text: Use exactly: "Will you be able to send over the invoice by end of day so me and my team can get started?"`,

      general: `
TEMPLATE: General Purpose Email
Generate text for these fields:
- greeting: "Hello ${firstName},"
- sections: Array of 2-4 content paragraphs (each 2-4 sentences)
- cta_text: Appropriate call to action based on context`
    };

    return basePrompt + (templateInstructions[templateType] || templateInstructions.general);
  }

  // Standard text mode (existing logic)
  const identity = `You are an AI email assistant for Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.

KEY CONTEXT:
- Electricity rates rising 15-25% due to data center demand
- Companies with contracts ending 2025-2026 face higher renewal rates
- Early renewals save 20-30% vs. waiting`;

  // Check if this is an invoice request in standard mode
  const isInvoiceStandard = /invoice.*request|send.*invoice/i.test(String(prompt || ''));
  
  if (isInvoiceStandard) {
    const invoiceRules = `
INVOICE REQUEST EMAIL STRUCTURE:

Paragraph 1 (2-3 sentences):
- Context from our conversation about conducting energy analysis
- Explain we'll identify discrepancies and determine how ${company || 'the company'} is using energy and the best plan moving forward
- DO NOT explicitly mention "notes/transcripts" - just reference "as we discussed"

Paragraph 2 (What we'll review from your invoice:):
• Invoice date and unique invoice number
• Billing period (start and end dates)
• Detailed charge breakdown (including kWh rate, demand charges, fees)
• Payment details and remittance address

Paragraph 3 (CTA - use EXACTLY this text):
"Will you be able to send over the invoice by end of day so me and my team can get started?"

CRITICAL RULES:
✓ Subject line: Under 50 chars, mention invoice request
✓ Use "${firstName || 'there'}," in greeting ONCE (no duplicate names)
✓ Closing: "Best regards," on its own line
✓ Length: 90-140 words total
✓ DO NOT include citation markers like [1], [2], [3]
✓ DO NOT repeat the contact's name after greeting
✓ DO NOT repeat "We will review..." or "What we'll review..." twice - say it ONCE before the bullet list
✓ NO standalone sender name before "Best regards,"`;

    const invoiceOutputFormat = `
OUTPUT FORMAT:
Subject: [Invoice request subject with ${firstName || 'recipient name'}]

Hi ${firstName || 'there'},

[Paragraph 1: Context about energy analysis - 2-3 sentences]

What we'll review from your invoice:
• Invoice date and unique invoice number
• Billing period (start and end dates)
• Detailed charge breakdown (including kWh rate, demand charges, fees)
• Payment details and remittance address

Will you be able to send over the invoice by end of day so me and my team can get started?

Best regards,`;

    return [identity, recipientContext, invoiceRules, invoiceOutputFormat].join('\n');
  }

  const qualityRules = `
QUALITY REQUIREMENTS:
✓ Length: 90-130 words total
✓ Use "${firstName || 'there'}," in greeting ONCE (no duplicate names)
✓ Middle paragraph: 3-4 complete sentences
✓ MUST mention "15-25%" rate increase
✓ CTA: 2 specific time slots with question mark
✓ Subject line: Under 50 chars, include ${firstName || 'recipient name'}
✓ Closing: "Best regards," on its own line
✓ DO NOT include citation markers like [1], [2], [3]

CRITICAL RULES:
❌ NO duplicate names after greeting
❌ NO vague CTAs
❌ NO incomplete sentences
✅ MUST stop after paragraph 3
✅ MUST include question mark in CTA`;

  const outputFormat = `
OUTPUT FORMAT:
Subject: [Your subject line]

[3 paragraphs of plain text]

Best regards,`;

  return [identity, recipientContext, qualityRules, outputFormat].join('\n');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[Perplexity] Missing PERPLEXITY_API_KEY');
      return res.status(500).json({ error: 'Missing API key' });
    }

    const { prompt, mode = 'standard', recipient = null, to = '', fromEmail = '', senderName = 'Lewis Patterson' } = req.body || {};
    
    // Detect template type for HTML mode
    const templateType = mode === 'html' ? getTemplateType(prompt) : null;
    
    console.log('[Perplexity] Template type:', templateType, 'for prompt:', prompt);
    
    // Build system prompt with TODAY context
    const today = new Date();
    const todayLabel = today.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const dateContext = `TODAY'S DATE: ${todayLabel}

CRITICAL: ALL time references MUST be in the FUTURE.
✅ Correct: "Tuesday 2-3pm", "Thursday afternoon", "next week"
❌ Wrong: Past dates

`;
    
    const systemPrompt = dateContext + buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType });
    
    // Call Perplexity API
    const body = {
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt || 'Draft a professional email' }
      ],
      // Add JSON schema for HTML mode
      ...(mode === 'html' ? { response_format: getTemplateSchema(templateType) } : {})
    };

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      const msg = data?.error?.message || data?.detail || 'API error';
      console.error('[Perplexity] API error:', msg);
      return res.status(response.status).json({ error: msg });
    }

    let content = data?.choices?.[0]?.message?.content || '';
    const citations = data?.citations || [];
    
    console.log('[Perplexity] Response received, length:', content.length);
    
    // For HTML mode, return parsed JSON with template type
    if (mode === 'html' && content) {
      try {
        const jsonData = JSON.parse(content);
        console.log('[Perplexity] Parsed JSON for template:', templateType);
        
        return res.status(200).json({ 
          ok: true, 
          output: jsonData,
          templateType: templateType,
          citations: citations
        });
      } catch (e) {
        console.error('[Perplexity] Failed to parse JSON:', e);
        return res.status(500).json({ error: 'Failed to parse AI response' });
      }
    }
    
    // Standard mode
    return res.status(200).json({ 
      ok: true, 
      output: content,
      citations: citations
    });
    
  } catch (e) {
    console.error('[Perplexity] Handler error:', e);
    return res.status(500).json({ error: 'Failed to generate email', message: e.message });
  }
}
