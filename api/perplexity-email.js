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

// Template type detection (exact match + pattern matching)
function getTemplateType(prompt) {
  const promptLower = String(prompt || '').toLowerCase();
  
  // Check for cold email patterns first
  if (/cold.*email|could.*not.*reach/i.test(promptLower)) {
    return 'cold_email';
  }
  
  // Check for other patterns
  if (/warm.*intro|after.*call/i.test(promptLower)) {
    return 'warm_intro';
  }
  
  if (/follow.*up|followup/i.test(promptLower)) {
    return 'follow_up';
  }
  
  if (/energy.*health.*check/i.test(promptLower)) {
    return 'energy_health';
  }
  
  if (/proposal.*delivery|proposal/i.test(promptLower)) {
    return 'proposal';
  }
  
  if (/invoice.*request|send.*invoice/i.test(promptLower)) {
    return 'invoice';
  }
  
  // Exact matches for specific prompts
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

// CTA Pattern System (Hybrid Approach)
function getCTAPattern(recipient) {
  const patterns = [
    {
      type: 'soft_ask',
      template: 'Would you be open to a brief [duration] call to discuss [topic]?',
      guidance: 'Low commitment, asks permission first'
    },
    {
      type: 'value_offer', 
      template: 'Would you be interested in [specific value/analysis] for [company]?',
      guidance: 'Offers value before asking for time'
    },
    {
      type: 'question_based',
      template: 'Any thoughts on how [company] is handling [specific challenge]?',
      guidance: 'Asks for opinion, very low pressure'
    },
    {
      type: 'direct_meeting',
      template: 'Does [time1] or [time2] work for a quick [duration] call?',
      guidance: 'Direct but flexible with options'
    }
  ];
  
  // Weighted random selection (favor softer approaches for cold emails)
  const weights = [0.35, 0.35, 0.20, 0.10]; // Heavily favor soft_ask and value_offer
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < patterns.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) return patterns[i];
  }
  
  return patterns[0];
}

// Opening Style Variations
function getOpeningStyle(recipient) {
  const styles = [
    {
      type: 'industry_insight',
      prompt: 'Start with company-specific observation from account description',
      example: 'I noticed [company] specializes in [specific detail from description], and wanted to reach out about energy cost management...'
    },
    {
      type: 'market_urgency',
      prompt: 'Open with relevant market condition specific to their business',
      example: 'With the current energy market affecting [industry] businesses, I thought [company] might be interested in...'
    },
    {
      type: 'social_proof',
      prompt: 'Reference work with similar companies without specifics',
      example: 'I work with several [industry] companies on energy cost management, and noticed [company]...'
    },
    {
      type: 'direct_problem',
      prompt: 'Address likely pain point based on their business',
      example: 'Given [company]\'s [business aspect from description], energy costs are probably a significant concern...'
    }
  ];
  
  // Equal distribution for now (will adjust based on performance)
  return styles[Math.floor(Math.random() * styles.length)];
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

// Calculate appropriate meeting times (2+ business days out)
function getSuggestedMeetingTimes() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Calculate 2 business days from today
  const firstSlot = addBusinessDays(today, 2);
  const secondSlot = addBusinessDays(today, 4); // 4 business days for second option
  
  const formatDay = (date) => {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const today = new Date();
    const daysUntil = Math.floor((date - today) / (1000 * 60 * 60 * 24));
    
    // Determine if it's "this week" or "next week"
    const todayDay = today.getDay();
    const targetDay = date.getDay();
    
    // If crossing into next week or more than 7 days away
    if (daysUntil > 7 || (targetDay <= todayDay && daysUntil > 2)) {
      return `${weekday} next week`;
    } else {
      return `this ${weekday}`;
    }
  };
  
  return {
    slot1: formatDay(firstSlot),
    slot2: formatDay(secondSlot),
    slot1Time: '2-3pm',
    slot2Time: '10-11am'
  };
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
        subject: { 
          type: "string", 
          description: "Email subject under 50 chars following best practices"
        },
        subject_style: {
          type: "string",
          description: "Style used: quick_question, re_prefix, thoughts, industry_specific, or value_prop"
        },
        greeting: { type: "string", description: "Hello {firstName}," },
        pain_points: { type: "array", items: { type: "string" }, description: "2-3 industry challenges (NO statistics, use natural language)" },
        solution_intro: { type: "string", description: "How we help (1-2 sentences, reference account description, avoid numbers)" },
        social_proof: { type: "string", description: "Brief credibility mention (avoid percentages and statistics)" },
        cta_text: { type: "string", description: "Complete call to action sentence with proper ending punctuation" },
        cta_type: { type: "string", description: "CTA pattern used: soft_ask, value_offer, question_based, or direct_meeting" }
      },
      required: ["subject", "subject_style", "greeting", "pain_points", "solution_intro", "social_proof", "cta_text", "cta_type"],
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
        sections: { type: "array", items: { type: "string" }, description: "1-5 one-sentence content points" },
        list_header: { type: "string", description: "Header for sections list, e.g. 'How We Can Help:', 'Key Benefits:', 'Why This Matters:'" },
        cta_text: { type: "string", description: "Call to action" }
      },
      required: ["subject", "greeting", "sections", "list_header", "cta_text"],
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
  // Add account description
  const accountDescription = (r.account?.shortDescription || r.account?.short_desc || r.account?.descriptionShort || '').slice(0, 300);
  
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
  
  // Get dynamic patterns for cold emails (needed for both HTML and standard modes)
  const ctaPattern = templateType === 'cold_email' ? getCTAPattern(recipient) : null;
  const openingStyle = templateType === 'cold_email' ? getOpeningStyle(recipient) : null;
  
  const recipientContext = `
RECIPIENT INFORMATION:
- Name: ${firstName || 'there'} ${company ? `at ${company}` : ''}
${job ? `- Role: ${job}` : ''}
${industry ? `- Industry: ${industry}` : ''}
${accountDescription ? `- Company Description: ${accountDescription}` : ''}
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
- pain_points: Array of 2-3 industry challenges (NATURAL LANGUAGE ONLY - NO statistics, NO percentages)
- solution_intro: How Power Choosers helps (1-2 sentences). ${accountDescription ? `MUST reference: "${accountDescription}" in a natural way.` : 'Reference their business naturally.'} NO percentages or statistics.
- social_proof: Brief credibility statement (NO numbers, NO percentages, keep vague like "similar companies" or "other businesses in your industry")
- cta_text: Customize this pattern for the recipient: "${ctaPattern.template}". Replace placeholders with specific details. MUST be a complete sentence with proper ending punctuation.
- cta_type: Return "${ctaPattern.type}" as the CTA pattern used

CRITICAL QUALITY RULES:
- USE ACCOUNT DESCRIPTION: If provided, naturally weave "${accountDescription || 'their business'}" into the email
- NO STATISTICS: Avoid all percentages (15-25%, 20-30%, etc.) and specific savings numbers
- NO YEAR RANGES: Don't mention "2025-2026" or specific contract years
- NATURAL LANGUAGE: Write like a real person, not a template
- SPECIFIC TO THEM: Reference actual company details, not generic industry statements
- ONE NUMBER MAX: If you must use a number, only use ONE in the entire email
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

FORBIDDEN PHRASES:
- "I've been tracking how [industry] companies..."
- "Recently helped another [industry] company..."
- "rising 15-25%"
- "saving 20-30%"
- "contracts ending in 2025-2026"
- "driven by data center demand"

PREFERRED LANGUAGE:
- "I noticed [company] [specific detail from description]..."
- "Given [company]'s focus on [business aspect]..."
- "With the current energy market..."
- "Any thoughts on how [company] is approaching..."

SUBJECT LINE RULES:
- Under 50 characters
- Choose ONE pattern and customize naturally:
  * "Quick question about [company]'s energy strategy"
  * "Re: [company]'s energy costs" 
  * "${firstName}, thoughts on energy planning?"
  * "[company] - energy market question"
- NO statistics or percentages in subject lines
- Return the style you chose in subject_style field

OPENING STYLE:
Use "${openingStyle.type}" approach. ${openingStyle.prompt}. Keep it 1-2 sentences, natural and conversational. ${accountDescription ? `Reference: "${accountDescription}"` : 'Focus on their company.'}
`,

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
- sections: Array of 2-5 content points - EACH MUST BE EXACTLY ONE SENTENCE (no multi-sentence items)
- list_header: Choose a contextual header for the list section based on email content (e.g., "How We Can Help:", "Key Benefits:", "Why This Matters:", "What to Expect:", "Our Approach:")
- cta_text: Appropriate call to action based on context

CRITICAL RULES:
- Each item in sections array = ONE SENTENCE ONLY
- list_header must be relevant to the specific email content, not generic
- Keep sections concise and actionable`
    };

    return basePrompt + (templateInstructions[templateType] || templateInstructions.general);
  }

  // Standard text mode (existing logic)
  const identity = `You are ${senderName}, an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.

CONTEXT USAGE RULES:
${contractEndLabel ? `- The recipient's contract ends ${contractEndLabel} - YOU MUST REFERENCE THIS` : ''}
${notes || transcript ? `- Use call notes/transcript to add specific context from your conversation` : ''}
${job ? `- Acknowledge their role as ${job}` : ''}
- Personalize based on their industry and current situation
- Make it feel like you just spoke with them

KEY CONTEXT:
- Electricity rates rising 15-25% due to data center demand
- Companies with contracts ending 2025-2026 face higher renewal rates
- Early renewals save 20-30% vs. waiting`;

  const outputFormat = `
OUTPUT FORMAT:
Subject: [Your subject line]

[Body as plain text paragraphs]

DO NOT include closing or sender name - these will be added automatically.`;

  // Check if this is a cold email in standard mode
  const isColdEmailStandard = /cold.*email|could.*not.*reach/i.test(String(prompt || ''));
  
  if (isColdEmailStandard) {
    const ctaPattern = getCTAPattern(recipient);
    const openingStyle = getOpeningStyle(recipient);
    
    const coldEmailRules = `
EMAIL TYPE: Cold Email (Never Spoke Before)

CRITICAL QUALITY RULES:
- NO STATISTICS: Avoid percentages, specific numbers, year ranges
- USE ACCOUNT DESCRIPTION: ${accountDescription ? `Must naturally reference: "${accountDescription}"` : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- ONE PROBLEM FOCUS: Pick one specific challenge, not multiple statistics
- CONSULTATIVE TONE: Ask for thoughts, don't pitch
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

OPENING (1-2 sentences):
Style: ${openingStyle.type}
${openingStyle.prompt}
${accountDescription ? `MUST incorporate: "${accountDescription}" naturally` : ''}
Example structure: "I noticed ${company} [specific detail]..." or "Given ${company}'s focus on [aspect]..."

BODY (2-3 sentences):
- Briefly explain how Power Choosers helps (NO numbers, NO percentages)
- Reference context: ${industry ? `their industry (${industry})` : 'their business'}, ${accountDescription ? `their description: "${accountDescription}"` : 'their company focus'}
- Create relevance through their specific situation, NOT market statistics
- FORBIDDEN: "15-25%", "20-30%", "2025-2026", "data center demand"

CTA:
Customize this pattern for the recipient: "${ctaPattern.template}"
- Replace ALL placeholders: [duration], [topic], [company], [specific value/analysis], [specific challenge], [time1], [time2]
- MUST be a complete sentence with proper ending punctuation
- Make it consultative - ask for thoughts or offer value, don't just request meetings
- Generate ONLY ONE CTA

SUBJECT LINE:
- Under 50 characters
- Natural and specific to them
- NO numbers or percentages
- Examples: "Quick question about ${company}'s energy strategy", "${firstName}, thoughts on energy planning?"

TOTAL LENGTH: 70-100 words (shorter is better for cold emails)
TONE: Consultative and curious, not sales-heavy
`;

    return [identity, recipientContext, coldEmailRules, outputFormat].join('\n\n');
  }

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
• Invoice date and service address
• Billing period (start and end dates)
• Detailed charge breakdown (including kWh rate, demand charges, fees)
• Payment details and service address

Paragraph 3 (CTA - use EXACTLY this text):
"Will you be able to send over the invoice by end of day so me and my team can get started?"

CRITICAL RULES:
✓ Subject line: Under 50 chars, mention invoice request
✓ Use "${firstName || 'there'}," in greeting ONCE (no duplicate names)
✓ Length: 90-140 words total
✓ DO NOT include citation markers like [1], [2], [3]
✓ DO NOT repeat the contact's name after greeting
✓ DO NOT repeat "We will review..." or "What we'll review..." twice - say it ONCE before the bullet list
✓ DO NOT include closing or sender name - these will be added automatically`;

    const invoiceOutputFormat = `
OUTPUT FORMAT:
Subject: [Invoice request subject with ${firstName || 'recipient name'}]

Hi ${firstName || 'there'},

[Paragraph 1: Context about energy analysis - 2-3 sentences]

What we'll review from your invoice:
• Invoice date and service address
• Billing period (start and end dates)
• Detailed charge breakdown (including kWh rate, demand charges, fees)
• Payment details and service address

Will you be able to send over the invoice by end of day so me and my team can get started?

DO NOT include closing or sender name - these will be added automatically.`;

    return [identity, recipientContext, invoiceRules, invoiceOutputFormat].join('\n');
  }

  const qualityRules = `
QUALITY REQUIREMENTS:
✓ Length: 90-130 words total
✓ Use "${firstName || 'there'}," in greeting ONCE (no duplicate names)
✓ Middle paragraph: 3-4 complete sentences
✓ MUST mention "15-25%" rate increase
✓ CTA: 2 COMPLETE time slots with question mark (e.g., "Tuesday 2-3pm or Thursday 10-11am")
✓ Subject line: Under 50 chars, include ${firstName || 'recipient name'}
✓ Closing: "Best regards," on its own line
✓ DO NOT include citation markers like [1], [2], [3]

PERSONALIZATION REQUIREMENTS:
${contractEndLabel ? `✓ MUST reference contract ending ${contractEndLabel} - this is CRITICAL context` : ''}
${energy.supplier ? `✓ Reference their current supplier ${energy.supplier} when relevant` : ''}
${notes || transcript ? `✓ MUST reference specific details from call notes/transcript` : ''}
${job ? `✓ Reference their role as ${job} when relevant` : ''}
${industry ? `✓ Include industry-specific insights for ${industry} sector` : ''}

CRITICAL RULES:
❌ NO duplicate names after greeting
❌ NO vague CTAs - must include BOTH complete time slots from suggested meeting times
❌ NO incomplete sentences - every sentence must have proper ending
❌ NO generic contract references - use actual date ${contractEndLabel || 'when provided'}
❌ NO generic "Tuesday/Thursday" - use the EXACT meeting times provided above
✅ MUST stop after paragraph 3
✅ MUST include question mark in CTA
✅ MUST use the suggested meeting times with proper "this week" or "next week" context`;

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
    
    // Detect template type for both HTML and standard modes
    const templateType = getTemplateType(prompt);
    
    console.log('[Perplexity] Template type:', templateType, 'for prompt:', prompt);
    
    // Build system prompt with TODAY context and suggested meeting times
    const today = new Date();
    const todayLabel = today.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const meetingTimes = getSuggestedMeetingTimes();
    
    const dateContext = `TODAY'S DATE: ${todayLabel}

SUGGESTED MEETING TIMES (2+ business days out):
- Option 1: ${meetingTimes.slot1} ${meetingTimes.slot1Time}
- Option 2: ${meetingTimes.slot2} ${meetingTimes.slot2Time}

CRITICAL: Use these EXACT meeting times in your CTA.
✅ Correct: "Would ${meetingTimes.slot1} ${meetingTimes.slot1Time} or ${meetingTimes.slot2} ${meetingTimes.slot2Time} work for a 15-minute call?"
❌ Wrong: Generic "Tuesday" or past dates

`;
    
    const systemPrompt = dateContext + buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType });
    
    // Call Perplexity API
    const body = {
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt || 'Draft a professional email' }
      ],
      max_tokens: 600, // Increased to prevent CTA truncation
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
          citations: citations,
          metadata: {
            subject_style: jsonData.subject_style,
            cta_type: jsonData.cta_type,
            opening_style: templateType === 'cold_email' ? openingStyle?.type : null,
            generated_at: new Date().toISOString()
          }
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
