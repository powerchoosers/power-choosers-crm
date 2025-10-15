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

// Company research cache (session-level)
const companyResearchCache = new Map();

async function researchCompanyInfo(companyName, industry) {
  if (!companyName) return null;
  
  const cacheKey = `${companyName}_${industry}`;
  if (companyResearchCache.has(cacheKey)) {
    console.log(`[Research] Using cached info for ${companyName}`);
    return companyResearchCache.get(cacheKey);
  }
  
  try {
    const researchPrompt = `Research ${companyName}${industry ? `, a ${industry} company` : ''}. Provide a brief 1-2 sentence description of what they do, their business focus, and any relevant operational details for energy cost discussions. Focus on operations, not financials. Be specific and factual.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: researchPrompt }],
        max_tokens: 150,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      console.error(`[Research] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const description = data.choices?.[0]?.message?.content || null;
    
    if (description) {
      console.log(`[Research] Found info for ${companyName}`);
      companyResearchCache.set(cacheKey, description);
    }
    
    return description;
  } catch (error) {
    console.error('[Research] Company research failed:', error);
    return null;
  }
}

async function saveAccountDescription(accountId, description) {
  if (!accountId || !description) return false;
  
  try {
    const { db } = await import('./_firebase.js');
    if (!db) {
      console.warn('[Research] Firestore not available, skipping save');
      return false;
    }
    
    const updateData = {
      shortDescription: description,
      descriptionUpdatedAt: new Date().toISOString(),
      descriptionSource: 'web_research'
    };
    
    await db.collection('accounts').doc(accountId).update(updateData);
    
    console.log(`[Research] Saved description for account ${accountId}`);
    
    // Return the saved data so we can notify the frontend
    return { id: accountId, description, timestamp: updateData.descriptionUpdatedAt };
  } catch (error) {
    console.error('[Research] Failed to save description:', error);
    return false;
  }
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
      type: 'qualifying_question',
      template: 'When does your current energy contract expire?',
      guidance: 'Qualifying question, low pressure, gets useful info'
    },
    {
      type: 'soft_ask_with_context',
      template: 'Would you be open to discussing your current energy setup?',
      guidance: 'Soft ask focused on their situation, not meeting'
    },
    {
      type: 'value_question',
      template: 'Would it make sense to have a brief conversation about your energy strategy?',
      guidance: 'Consultative, positions as strategic discussion'
    },
    {
      type: 'timing_question',
      template: 'If your contract is in the next 12 months, would you be interested in what we\'re seeing in the market?',
      guidance: 'Conditional offer, provides value'
    },
    {
      type: 'direct_meeting',
      template: 'Does [time1] or [time2] work for a quick call?',
      guidance: 'Direct but flexible - only for warm leads'
    },
    {
      type: 'industry_specific',
      template: `How is ${recipient?.company || 'your company'} approaching energy cost management for 2025?`,
      guidance: 'Company-specific strategic question'
    },
    {
      type: 'problem_aware_question',
      template: 'Are rising electricity costs affecting your operational budget?',
      guidance: 'Problem-aware qualifying question'
    }
  ];
  
  // Weighted random selection (heavily favor qualifying and soft asks)
  const weights = [0.25, 0.25, 0.20, 0.15, 0.10, 0.04, 0.01];
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < patterns.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) return patterns[i];
  }
  
  return patterns[0];
}

// Opening Style Variations
function getOpeningStyle(recipient) {
  const styles = [
    {
      type: 'problem_aware',
      prompt: 'Start with industry-specific problem or market condition affecting their business',
      example: '[Industry] operations are facing [specific challenge]. [Company] is likely seeing [specific impact]...'
    },
    {
      type: 'timing_urgency',
      prompt: 'Open with timing-related urgency relevant to their situation',
      example: 'Companies renewing electricity contracts in 2025 are facing significantly higher rates. [Company]...'
    },
    {
      type: 'social_proof',
      prompt: 'Reference work with similar companies without revealing specifics',
      example: 'We work with several [industry] companies on energy cost management. Given [company]\'s [business aspect]...'
    },
    {
      type: 'insight_based',
      prompt: 'Lead with valuable industry insight specific to their business',
      example: '[Industry] companies are proactively addressing energy costs before contracts renew. [Company]...'
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
        opening_hook: { type: "string", description: "Problem-aware opening about industry challenge or market condition (1-2 sentences, NO statistics)" },
        value_proposition: { type: "string", description: "How we help with specific measurable value (include percentages or dollar amounts)" },
        social_proof_optional: { type: "string", description: "Brief credibility with real outcomes (optional, 1 sentence)" },
        cta_text: { type: "string", description: "Complete call to action sentence with proper ending punctuation" },
        cta_type: { type: "string", description: "CTA pattern used: qualifying_question, soft_ask_with_context, value_question, timing_question, or direct_meeting" }
      },
      required: ["subject", "subject_style", "greeting", "opening_hook", "value_proposition", "cta_text", "cta_type"],
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

async function buildSystemPrompt({ mode, recipient, to, prompt, senderName = 'Lewis Patterson', templateType }) {
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
  // Debug log to see what account data is available
  console.log('[Debug] Full account data for', company, ':', JSON.stringify(r.account, null, 2));
  
  // Clean and sanitize account description - check multiple possible field names
  let accountDescription = (r.account?.shortDescription || r.account?.short_desc || r.account?.descriptionShort || r.account?.description || r.account?.companyDescription || r.account?.accountDescription || '')
    .replace(/Not disclosed/gi, '')
    .replace(/undefined/gi, '')
    .replace(/null/gi, '')
    .replace(/\d+\s+employees/gi, '')
    .replace(/operating from facilities totaling[^.]*square feet/gi, '')
    .replace(/Under the leadership of[^.]*$/gi, '')
    .replace(/based in [^,]*, [^,]*/gi, '') // Remove location details
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // If no description and we have company name, research it
  let researchData = null;
  if (!accountDescription && company) {
    console.log(`[Research] No description for ${company}, researching...`);
    accountDescription = await researchCompanyInfo(company, industry);
    
    // Save to Firestore if we found something and have account ID
    if (accountDescription && r.account?.id) {
      researchData = await saveAccountDescription(r.account.id, accountDescription);
    }
  }

  // Take first sentence or 80 characters, whichever is shorter
  if (accountDescription) {
    if (accountDescription.includes('.')) {
      accountDescription = accountDescription.split('.')[0] + '.';
    }
    accountDescription = accountDescription.slice(0, 80).trim();
  }
  
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

  // Debug log for recipient context
  console.log(`[Debug] Recipient context for ${firstName} at ${company}:`, {
    firstName,
    company,
    industry,
    accountDescription: accountDescription ? accountDescription.substring(0, 50) + '...' : 'none',
    researchData: researchData ? 'found' : 'none'
  });

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
- opening_hook: Start with problem awareness or market condition (1-2 sentences). ${accountDescription ? `Reference: "${accountDescription}".` : 'Reference their business.'} Examples: "Companies in ${industry || 'your industry'} are seeing X", "${company} likely faces Y challenge", "Current market conditions for ${industry || 'businesses like yours'}..." IMPORTANT: Always reference ${company} specifically, not other companies.
- value_proposition: How Power Choosers helps (1-2 sentences MINIMUM). MUST include BOTH: (1) HOW we help, AND (2) SPECIFIC measurable value: "save 10-20%", "reduce costs by $X annually", "helped similar companies achieve Y". Example: "We help manufacturing companies secure better rates before contracts expire. Our clients typically save 10-20% on annual energy costs." Be concrete, not vague. NEVER end with incomplete phrase like "within [company]". ALWAYS include a complete value proposition - never skip this field. THIS FIELD IS MANDATORY - NEVER LEAVE BLANK.
- social_proof_optional: Brief credibility statement IF relevant (1 sentence, optional)
- cta_text: Customize this pattern: "${ctaPattern.template}". Keep under 12 words. MUST be complete sentence with proper ending punctuation. NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .).
- cta_type: Return "${ctaPattern.type}"

CRITICAL QUALITY RULES:
- PROBLEM AWARENESS: Lead with industry-specific problem or market condition
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- MEASURABLE CLAIMS: "save 10-20%" or "$X annually" NOT "significant savings"
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: If provided, naturally reference "${accountDescription || 'their business'}"
- NATURAL LANGUAGE: Write like a real person, not a template
- SPECIFIC TO THEM: Reference actual company details, not generic industry statements
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)
- EMAIL LENGTH: Keep total email body under 100 words
- CTA LENGTH: CTAs should be 10-12 words maximum
- VALUE PROP MUST: Include HOW we help AND WHAT results (e.g., "We help [industry] companies secure better rates before contracts expire. Clients typically save 10-20%.")

FORBIDDEN PHRASES:
- "I've been tracking how [industry] companies..."
- "Recently helped another [industry] company..."
- "rising 15-25%"
- "saving 20-30%"
- "contracts ending in 2025-2026"
- "driven by data center demand"
- "15-25%"
- "20-30%"
- "electricity rate increases of 15-25%"
- "reduce annual energy costs by 20-30%"

PREFERRED LANGUAGE:
- "I noticed [company] [specific detail from description]..."
- "Given [company]'s focus on [business aspect]..."
- "With the current energy market..."
- "Any thoughts on how [company] is approaching..."
- "[Company] likely faces [specific operational challenge]..."
- "Companies in [industry] are seeing [market condition]..."
- "Current market conditions for [industry] operations..."

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

    return { 
      prompt: basePrompt + (templateInstructions[templateType] || templateInstructions.general),
      researchData: researchData
    };
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
- PROBLEM AWARENESS: Lead with industry-specific problem or market condition
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- MEASURABLE CLAIMS: "save 10-20%" or "$X annually" NOT "significant savings"
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: ${accountDescription ? `Must naturally reference: "${accountDescription}"` : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

OPENING (1-2 sentences):
Style: ${openingStyle.type}
${openingStyle.prompt}
Lead with PROBLEM AWARENESS or MARKET CONDITION relevant to ${company}
Examples: 
- "Companies in ${industry || 'your industry'} are facing [specific challenge]"
- "With contracts renewing in 2025, ${company} is likely seeing [specific impact]"
- "${industry || 'Your industry'} operations are experiencing [market condition]"
IMPORTANT: Always reference ${company} specifically, not other companies.

VALUE PROPOSITION (1-2 sentences MINIMUM):
- Explain how Power Choosers helps with SPECIFIC MEASURABLE VALUE
- MUST include: (1) What we do, (2) Concrete numbers: "save 10-20%", "reduce costs by $X", "clients typically see Y"
- Reference: ${accountDescription ? `"${accountDescription}"` : 'their business type'}
- Add social proof if relevant: "helped similar companies achieve [specific result]"
- Example: "We help ${industry || 'businesses'} secure better rates before contracts expire. Our clients typically save 10-20% on annual energy costs."
- NEVER end with incomplete phrases or "within [company name]"
- ALWAYS include a complete value proposition - never skip this field
- THIS FIELD IS MANDATORY - NEVER LEAVE BLANK

CTA:
Use qualifying question or soft ask: "${ctaPattern.template}"
- Qualifying questions work best: "When does your contract expire?", "Would you be open to discussing your energy setup?"
- Avoid requesting specific meeting times in first email
- Keep under 12 words
- MUST be complete sentence with proper ending punctuation
- NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .)
- Generate ONLY ONE CTA

SUBJECT LINE:
- Under 50 characters
- Natural and specific to them
- NO numbers or percentages
- Examples: "Quick question about ${company}'s energy strategy", "${firstName}, thoughts on energy planning?"

TOTAL LENGTH: 65-85 words (INCLUDING the CTA)
CTA LENGTH: 8-12 words maximum, must be complete
TONE: Problem-aware, consultative, and value-focused
`;

    return { 
      prompt: [identity, recipientContext, coldEmailRules, outputFormat].join('\n\n'),
      researchData: researchData
    };
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

    return { 
      prompt: [identity, recipientContext, invoiceRules, invoiceOutputFormat].join('\n'),
      researchData: researchData
    };
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

  return { 
    prompt: [identity, recipientContext, qualityRules, outputFormat].join('\n'),
    researchData: researchData
  };
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
    
    const { prompt: systemPrompt, researchData } = await buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType });
    const fullSystemPrompt = dateContext + systemPrompt;
    
    // Call Perplexity API
    const body = {
      model: 'sonar',
      messages: [
        { role: 'system', content: fullSystemPrompt },
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
        
        // Validate value proposition completeness for cold emails
        if (templateType === 'cold_email' && jsonData.value_proposition) {
          const incomplete = /\b(within|like|such as|including)\s+[A-Z][^.!?]*$/i.test(jsonData.value_proposition);
          if (incomplete) {
            console.warn('[Validation] Incomplete value prop detected, fixing...');
            jsonData.value_proposition = jsonData.value_proposition.replace(
              /\b(within|like|such as|including)\s+[A-Z][^.!?]*$/i,
              'secure better energy rates before contracts expire. Clients typically save 10-20% on annual costs.'
            );
          }
        }
        
        // Validate CTA completeness for cold emails
        if (templateType === 'cold_email' && jsonData.cta_text) {
          const incompleteCTA = /would you be open to a quick$/i.test(jsonData.cta_text);
          if (incompleteCTA) {
            console.warn('[Validation] Incomplete CTA detected, fixing...');
            jsonData.cta_text = 'Would you be open to discussing your current energy setup?';
          }
        }
        
        // Validate missing value propositions for cold emails
        if (templateType === 'cold_email' && (!jsonData.value_proposition || jsonData.value_proposition.trim() === '')) {
          console.warn('[Validation] Missing value proposition detected, adding default...');
          const industry = recipient?.industry || 'businesses';
          jsonData.value_proposition = `We help ${industry} companies secure better rates before contracts expire. Our clients typically save 10-20% on annual energy costs.`;
        }
        
        // Validate for duplicate CTAs in cold emails
        if (templateType === 'cold_email' && jsonData.cta_text) {
          // Check if the CTA contains multiple questions or meeting requests
          const hasMultipleQuestions = (jsonData.cta_text.match(/\?/g) || []).length > 1;
          const hasMeetingRequest = /does.*work.*call|tuesday|thursday|monday|wednesday|friday/i.test(jsonData.cta_text);
          const hasStrategyQuestion = /energy strategy|energy setup/i.test(jsonData.cta_text);
          
          if (hasMultipleQuestions || (hasMeetingRequest && hasStrategyQuestion)) {
            console.warn('[Validation] Duplicate CTA detected, using single qualifying question...');
            jsonData.cta_text = 'When does your current energy contract expire?';
          }
        }
        
        return res.status(200).json({ 
          ok: true, 
          output: jsonData,
          templateType: templateType,
          citations: citations,
          researchData: researchData,
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
