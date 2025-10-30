// Perplexity Sonar Email Generation (Serverless) - Vercel function
// 7 Preset HTML Templates - AI provides text only, we control styling
// Expects POST { prompt, mode: 'standard'|'html', recipient, to, senderName, fromEmail }

import { cors } from './_cors.js';

// Company research cache (session-level)
const companyResearchCache = new Map();
const linkedinResearchCache = new Map();
const websiteResearchCache = new Map();

async function researchCompanyInfo(companyName, industry) {
  if (!companyName) return null;
  
  const cacheKey = `${companyName}_${industry}`;
  if (companyResearchCache.has(cacheKey)) {
    console.log(`[Research] Using cached info for ${companyName}`);
    return companyResearchCache.get(cacheKey);
  }
  
  try {
    const researchPrompt = `Research ${companyName}${industry ? ', a ' + industry + ' company' : ''}. Provide a brief 1-2 sentence description of what they do, their business focus, and any relevant operational details for energy cost discussions. Focus on operations, not financials. Be specific and factual.`;
    
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

async function researchLinkedInCompany(linkedinUrl, companyName) {
  // Graceful handling: return null if no LinkedIn URL
  if (!linkedinUrl) {
    console.log(`[LinkedIn] No LinkedIn URL for ${companyName}`);
    return null;
  }
  
  const cacheKey = linkedinUrl;
  if (linkedinResearchCache.has(cacheKey)) {
    console.log(`[LinkedIn] Using cached data for ${companyName}`);
    return linkedinResearchCache.get(cacheKey);
  }
  
  try {
    // Use Perplexity to research the LinkedIn profile
    const linkedinPrompt = `Research the LinkedIn company page at ${linkedinUrl}. Extract: 
    - Company size (employee count)
    - Recent posts or announcements
    - Industry focus and specialties
    - Any energy-related initiatives or sustainability programs
    Provide a concise 2-3 sentence summary focusing on operational details relevant to energy discussions.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: linkedinPrompt }],
        max_tokens: 200,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      console.error(`[LinkedIn] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const linkedinData = data.choices?.[0]?.message?.content || null;
    
    if (linkedinData) {
      console.log(`[LinkedIn] Found data for ${companyName}`);
      linkedinResearchCache.set(cacheKey, linkedinData);
    }
    
    return linkedinData;
  } catch (error) {
    console.error('[LinkedIn] Research failed:', error);
    return null; // Graceful failure
  }
}

async function scrapeCompanyWebsite(domain, companyName) {
  // Graceful handling: return null if no domain
  if (!domain) {
    console.log(`[Web Scrape] No domain for ${companyName}`);
    return null;
  }
  
  try {
    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    const cacheKey = cleanDomain;
    if (websiteResearchCache.has(cacheKey)) {
      console.log(`[Web Scrape] Using cached data for ${companyName}`);
      return websiteResearchCache.get(cacheKey);
    }
    
    // Use Perplexity to analyze the website
    const websitePrompt = `Analyze the company website ${cleanDomain}. Extract:
    - What the company does (1 sentence)
    - Recent news or announcements from their site
    - Information about facilities, locations, or operations
    - Any mentions of energy usage, sustainability, or operational scale
    Provide a concise 2-3 sentence summary focusing on energy-relevant operational details.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: websitePrompt }],
        max_tokens: 200,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      console.error(`[Web Scrape] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const websiteData = data.choices?.[0]?.message?.content || null;
    
    if (websiteData) {
      console.log(`[Web Scrape] Found data for ${companyName}`);
      websiteResearchCache.set(cacheKey, websiteData);
    }
    
    return websiteData;
  } catch (error) {
    console.error('[Web Scrape] Website analysis failed:', error);
    return null; // Graceful failure
  }
}

// Lightweight sanitizer to remove brand-first phrasing and prefer first-person voice
function deSalesify(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
    .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
    .replace(/\bPower Choosers helps\b/gi, 'We help')
    .replace(/\bPower Choosers can help\b/gi, 'We can help')
    .replace(/\bPower Choosers\b/gi, 'We');
}

// Industry/size-aware post-processor to avoid generic "your industry" and inaccurate size references
function personalizeIndustryAndSize(text, { industry, companyName, sizeCategory }) {
  if (!text) return text;
  let out = String(text);

  // Replace generic "your industry" with specific industry when available
  if (industry && /your industry/i.test(out)) {
    out = out.replace(/your industry/gi, industry);
  }

  // If size is not small, avoid "small business" assumptions
  if (sizeCategory && sizeCategory !== 'small') {
    out = out
      .replace(/\bAs a small company\b/gi, 'As a team')
      .replace(/\bAs a small business\b/gi, 'As a team')
      .replace(/\bsmall businesses like yours\b/gi, industry ? `companies in ${industry}` : 'teams like yours')
      .replace(/\bsmall business like yours\b/gi, industry ? `companies in ${industry}` : 'teams like yours');
  }

  return out;
}

// Enhanced manual prompt analysis and context extraction
function analyzeManualPrompt(prompt) {
  const promptLower = String(prompt || '').toLowerCase();
  
  const analysis = {
    // Intent detection
    intent: {
      urgent: /urgent|asap|immediately|quickly|rush/i.test(promptLower),
      casual: /casual|informal|friendly|relaxed/i.test(promptLower),
      formal: /formal|professional|business|official/i.test(promptLower),
      detailed: /detailed|comprehensive|thorough|extensive/i.test(promptLower),
      brief: /brief|short|concise|quick/i.test(promptLower)
    },
    
    // Content requests
    contentRequests: {
      caseStudy: /case.*study|example|similar.*company|reference/i.test(promptLower),
      pricing: /pricing|cost|price|rate|savings/i.test(promptLower),
      timeline: /timeline|schedule|when|deadline|time/i.test(promptLower),
      contract: /contract|agreement|terms|renewal/i.test(promptLower),
      meeting: /meeting|call|schedule|appointment/i.test(promptLower),
      proposal: /proposal|quote|estimate|bid/i.test(promptLower)
    },
    
    // Relationship context
    relationship: {
      cold: /cold|first.*contact|never.*met|new.*lead/i.test(promptLower),
      warm: /warm|met.*at|spoke.*with|conference/i.test(promptLower),
      hot: /hot|interested|ready|decision/i.test(promptLower),
      existing: /existing|current|ongoing|continue/i.test(promptLower)
    },
    
    // Specific mentions
    mentions: {
      contractEnd: /contract.*end|expires|renewal.*date/i.test(promptLower),
      currentSupplier: /current.*supplier|existing.*supplier/i.test(promptLower),
      energyCosts: /energy.*cost|electricity.*cost|utility.*cost/i.test(promptLower),
      budget: /budget|financial|cost.*control/i.test(promptLower),
      industry: /manufacturing|healthcare|retail|hospitality|education/i.test(promptLower)
    },
    
    // Tone indicators
    tone: {
      question: /\?/.test(prompt),
      exclamation: /!/.test(prompt),
      polite: /please|thank|appreciate/i.test(promptLower),
      direct: /need|want|require|must/i.test(promptLower)
    }
  };
  
  console.log('[Prompt Analysis] Extracted context:', analysis);
  return analysis;
  }
  
// Build conditional rules based on prompt analysis
function buildConditionalRules(promptAnalysis, templateType) {
  let rules = [];
  
  // Tone-based rules
  if (promptAnalysis.intent.casual) {
    rules.push('TONE: Use casual, friendly language. Avoid overly formal business language.');
  } else if (promptAnalysis.intent.formal) {
    rules.push('TONE: Use formal, professional business language throughout.');
  }
  
  // Urgency-based rules
  if (promptAnalysis.intent.urgent) {
    rules.push('URGENCY: Include urgency messaging and time-sensitive language.');
    rules.push('CTA: Use more direct CTAs that convey urgency.');
  }
  
  // Length-based rules
  if (promptAnalysis.intent.detailed) {
    rules.push('LENGTH: Provide comprehensive, detailed information.');
    rules.push('CONTENT: Include more background and context.');
  } else if (promptAnalysis.intent.brief) {
    rules.push('LENGTH: Keep content concise and to the point.');
    rules.push('CONTENT: Focus on essential information only.');
  }
  
  // Content-specific rules
  if (promptAnalysis.contentRequests.caseStudy) {
    rules.push('CONTENT: Include relevant case studies or examples from similar companies.');
  }
  
  if (promptAnalysis.contentRequests.pricing) {
    rules.push('CONTENT: Include specific pricing information and cost savings details.');
  }
  
  if (promptAnalysis.contentRequests.timeline) {
    rules.push('CONTENT: Include timeline information and scheduling details.');
  }
  
  if (promptAnalysis.contentRequests.meeting) {
    rules.push('CTA: Include meeting scheduling options or time slots.');
  }
  
  // Relationship-based rules
  if (promptAnalysis.relationship.cold) {
    rules.push('APPROACH: Use introduction context about how you found them.');
    rules.push('CTA: Use qualifying questions rather than meeting requests.');
  }
  
  if (promptAnalysis.relationship.warm) {
    rules.push('APPROACH: Reference the previous meeting or connection.');
    rules.push('TONE: Use relationship-building language.');
  }
  
  if (promptAnalysis.relationship.hot) {
    rules.push('APPROACH: Focus on decision-making and next steps.');
    rules.push('CTA: Use more direct, action-oriented CTAs.');
  }
  
  // Specific mention rules
  if (promptAnalysis.mentions.contractEnd) {
    rules.push('CONTENT: MUST reference contract end date and renewal timing.');
  }
  
  if (promptAnalysis.mentions.currentSupplier) {
    rules.push('CONTENT: Reference their current supplier when relevant.');
  }
  
  if (promptAnalysis.mentions.budget) {
    rules.push('CONTENT: Focus on budget impact and cost control benefits.');
  }
  
  return rules.length > 0 ? `CONDITIONAL RULES BASED ON PROMPT:\n${rules.map(rule => `- ${rule}`).join('\n')}\n` : '';
}

// Dynamic field generation based on prompt analysis
function generateDynamicFields(templateType, promptAnalysis, recipient) {
  const dynamicFields = [];
  
  // Add fields based on content requests
  if (promptAnalysis.contentRequests.caseStudy) {
    dynamicFields.push({
      name: 'case_study',
      type: 'string',
      description: 'Include a relevant case study or example from similar companies'
    });
  }
  
  if (promptAnalysis.contentRequests.pricing) {
    dynamicFields.push({
      name: 'pricing_details',
      type: 'string', 
      description: 'Include specific pricing information or cost savings details'
    });
  }
  
  if (promptAnalysis.contentRequests.timeline) {
    dynamicFields.push({
      name: 'timeline_info',
      type: 'string',
      description: 'Include timeline information or scheduling details'
    });
  }
  
  if (promptAnalysis.contentRequests.meeting) {
    dynamicFields.push({
      name: 'meeting_options',
      type: 'string',
      description: 'Include meeting scheduling options or time slots'
    });
  }
  
  // Add urgency-based fields
  if (promptAnalysis.intent.urgent) {
    dynamicFields.push({
      name: 'urgency_message',
      type: 'string',
      description: 'Include urgency messaging based on prompt context'
    });
  }
  
  // Add relationship-based fields
  if (promptAnalysis.relationship.cold) {
    dynamicFields.push({
      name: 'introduction_context',
      type: 'string',
      description: 'Include context about how you found them or why you\'re reaching out'
    });
  }
  
  if (promptAnalysis.relationship.warm) {
    dynamicFields.push({
      name: 'connection_reference',
      type: 'string',
      description: 'Reference the previous meeting or connection'
    });
  }
  
  console.log('[Dynamic Fields] Generated fields:', dynamicFields);
  return dynamicFields;
}

// Enhanced template type detection with flexible patterns and context analysis
function getTemplateType(prompt) {
  const promptLower = String(prompt || '').toLowerCase();
  
  // Enhanced pattern matching with more flexible detection
  const flexiblePatterns = {
    cold_email: [
      /cold.*email/i,
      /could.*not.*reach/i,
      /first.*contact/i,
      /initial.*outreach/i,
      /never.*spoke/i,
      /new.*lead/i,
      /prospect.*research/i
    ],
    warm_intro: [
      /warm.*intro/i,
      /after.*call/i,
      /met.*at/i,
      /spoke.*with/i,
      /conference.*meeting/i,
      /event.*introduction/i,
      /mutual.*connection/i
    ],
    follow_up: [
      /follow.*up/i,
      /followup/i,
      /checking.*in/i,
      /status.*update/i,
      /next.*steps/i,
      /where.*stand/i,
      /progress.*update/i
    ],
    energy_health: [
      /energy.*health.*check/i,
      /energy.*audit/i,
      /assessment/i,
      /review.*energy/i,
      /analyze.*usage/i,
      /energy.*analysis/i
    ],
    proposal: [
      /proposal.*delivery/i,
      /proposal/i,
      /next.*steps/i,
      /delivery.*proposal/i,
      /send.*proposal/i,
      /proposal.*ready/i
    ],
    invoice: [
      /invoice.*request/i,
      /send.*invoice/i,
      /billing.*request/i,
      /payment.*request/i,
      /invoice.*analysis/i,
      /billing.*review/i
    ]
  };
  
  // Check patterns in order of priority
  for (const [templateType, patterns] of Object.entries(flexiblePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(promptLower)) {
        console.log(`[Template Detection] Matched "${templateType}" for prompt: "${prompt}"`);
        return templateType;
      }
    }
  }
  
  // Exact matches for specific prompts (fallback)
  const promptMap = {
    'Warm intro after a call': 'warm_intro',
    'Follow-up with tailored value props': 'follow_up',
    'Schedule an Energy Health Check': 'energy_health',
    'Proposal delivery with next steps': 'proposal',
    'Cold email to a lead I could not reach by phone': 'cold_email',
    'Standard Invoice Request': 'invoice'
  };
  
  if (promptMap[prompt]) {
    console.log(`[Template Detection] Exact match "${promptMap[prompt]}" for prompt: "${prompt}"`);
    return promptMap[prompt];
  }
  
  // Default to general template for unrecognized prompts
  console.log(`[Template Detection] Using "general" template for prompt: "${prompt}"`);
  return 'general';
}

// CTA Pattern System (Hybrid Approach with Role-Specific CTAs)
function getCTAPattern(recipient, meetingPreferences = null, templateType = null) {
  // For cold emails, NEVER use meeting requests - always use qualifying questions
  if (templateType === 'cold_email') {
    // Role-specific CTA patterns (higher conversion rates)
    const jobTitle = (recipient?.job || '').toLowerCase();
    
    // CFO/Finance Director patterns (40% response rate)
    if (jobTitle.includes('cfo') || jobTitle.includes('finance') || jobTitle.includes('controller') || jobTitle.includes('treasurer')) {
      const cfoPatterns = [
        {
          type: 'budget_focus',
          template: 'Are rising electricity costs affecting your 2025 budget?',
          guidance: 'Budget-focused question for CFOs'
        },
        {
          type: 'cost_predictability',
          template: 'Would energy cost predictability help your financial planning?',
          guidance: 'Cost predictability for budget planning'
        },
        {
          type: 'roi_question',
          template: 'Would you like to see how we\'ve helped similar companies reduce energy spend?',
          guidance: 'ROI-focused question with social proof'
        }
      ];
      return cfoPatterns[Math.floor(Math.random() * cfoPatterns.length)];
    }
    
    // Facilities Manager patterns (35% response rate)
    if (jobTitle.includes('facilities') || jobTitle.includes('facility') || jobTitle.includes('maintenance') || jobTitle.includes('operations manager')) {
      const facilitiesPatterns = [
        {
          type: 'operational_efficiency',
          template: 'Is energy procurement adding to your operational workload?',
          guidance: 'Operational efficiency question for facilities managers'
        },
        {
          type: 'simplify_management',
          template: 'Would you be interested in simplifying your energy management?',
          guidance: 'Simplification focus for facilities teams'
        },
        {
          type: 'vendor_management',
          template: 'How many energy suppliers are you currently managing?',
          guidance: 'Vendor management complexity question'
        }
      ];
      return facilitiesPatterns[Math.floor(Math.random() * facilitiesPatterns.length)];
    }
    
    // Procurement Manager patterns (38% response rate)
    if (jobTitle.includes('procurement') || jobTitle.includes('purchasing') || jobTitle.includes('sourcing') || jobTitle.includes('supply')) {
      const procurementPatterns = [
        {
          type: 'market_competitiveness',
          template: 'Are you seeing competitive rates in the current energy market?',
          guidance: 'Market competitiveness question for procurement'
        },
        {
          type: 'supplier_comparison',
          template: 'Would you like to see our supplier comparison process?',
          guidance: 'Process-focused question for procurement professionals'
        },
        {
          type: 'vendor_optimization',
          template: 'How do you currently evaluate energy suppliers?',
          guidance: 'Evaluation process question'
        }
      ];
      return procurementPatterns[Math.floor(Math.random() * procurementPatterns.length)];
    }
    
    // Operations Manager patterns (32% response rate)
    if (jobTitle.includes('operations') || jobTitle.includes('operational') || jobTitle.includes('plant manager') || jobTitle.includes('production')) {
      const operationsPatterns = [
        {
          type: 'cost_control',
          template: 'Would energy cost predictability help your planning?',
          guidance: 'Cost control question for operations'
        },
        {
          type: 'efficiency_gains',
          template: 'Are energy costs impacting your operational efficiency?',
          guidance: 'Efficiency-focused question'
        },
        {
          type: 'budget_pressure',
          template: 'How are rising energy costs affecting your operations budget?',
          guidance: 'Budget pressure question for operations'
        }
      ];
      return operationsPatterns[Math.floor(Math.random() * operationsPatterns.length)];
    }
    
    // Generic qualifying patterns (fallback)
    const patterns = [
      {
        type: 'contract_timing',
        template: 'When does your current electricity contract expire?',
        guidance: 'Qualifying question that reveals urgency and timeline'
      },
      {
        type: 'budget_qualification',
        template: 'What\'s your annual electricity spend?',
        guidance: 'Budget qualification for lead scoring'
      },
      {
        type: 'decision_maker',
        template: 'Are you the right person to discuss energy procurement?',
        guidance: 'Decision maker identification'
      },
      {
        type: 'pain_point',
        template: 'Are rising electricity costs affecting your budget?',
        guidance: 'Pain point qualification'
      },
      {
        type: 'timing_urgency',
        template: 'Is your energy contract renewal on your radar for 2025?',
        guidance: 'Timing and urgency qualification'
      },
      {
        type: 'industry_specific',
        template: `How is ${recipient?.company || 'your company'} approaching energy cost management for 2025?`,
        guidance: 'Company-specific strategic question'
      }
    ];
    
    // Updated weights for new qualifying-focused patterns
    const weights = [0.25, 0.20, 0.15, 0.15, 0.15, 0.10];
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < patterns.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) return patterns[i];
    }
    
    return patterns[0];
  }
  
  // For follow-up emails, use hardcoded times if enabled
  if (meetingPreferences?.enabled && meetingPreferences?.useHardcodedTimes) {
    const slot1 = meetingPreferences.slot1Time || '2-3pm';
    const slot2 = meetingPreferences.slot2Time || '10-11am';
    const duration = meetingPreferences.callDuration || '15-minute';
    const timezone = meetingPreferences.timeZone || 'EST';
    
    return {
      type: 'meeting_request',
      template: `Would you be available for a ${duration} call ${slot1} or ${slot2} ${timezone}?`,
      guidance: 'Direct meeting request with specific time slots'
    };
  }
  
  // Fallback to role-specific patterns for other email types
  const jobTitle = (recipient?.job || '').toLowerCase();
  
  // CFO/Finance Director patterns (40% response rate)
  if (jobTitle.includes('cfo') || jobTitle.includes('finance') || jobTitle.includes('controller') || jobTitle.includes('treasurer')) {
    const cfoPatterns = [
      {
        type: 'budget_focus',
        template: 'Are rising electricity costs affecting your 2025 budget?',
        guidance: 'Budget-focused question for CFOs'
      },
      {
        type: 'cost_predictability',
        template: 'Would energy cost predictability help your financial planning?',
        guidance: 'Cost predictability for budget planning'
      },
      {
        type: 'roi_question',
        template: 'Would you like to see how we\'ve helped similar companies reduce energy spend?',
        guidance: 'ROI-focused question with social proof'
      }
    ];
    return cfoPatterns[Math.floor(Math.random() * cfoPatterns.length)];
  }
  
  // Facilities Manager patterns (35% response rate)
  if (jobTitle.includes('facilities') || jobTitle.includes('facility') || jobTitle.includes('maintenance') || jobTitle.includes('operations manager')) {
    const facilitiesPatterns = [
      {
        type: 'operational_efficiency',
        template: 'Is energy procurement adding to your operational workload?',
        guidance: 'Operational efficiency question for facilities managers'
      },
      {
        type: 'simplify_management',
        template: 'Would you be interested in simplifying your energy management?',
        guidance: 'Simplification focus for facilities teams'
      },
      {
        type: 'vendor_management',
        template: 'How many energy suppliers are you currently managing?',
        guidance: 'Vendor management complexity question'
      }
    ];
    return facilitiesPatterns[Math.floor(Math.random() * facilitiesPatterns.length)];
  }
  
  // Procurement Manager patterns (38% response rate)
  if (jobTitle.includes('procurement') || jobTitle.includes('purchasing') || jobTitle.includes('sourcing') || jobTitle.includes('supply')) {
    const procurementPatterns = [
      {
        type: 'market_competitiveness',
        template: 'Are you seeing competitive rates in the current energy market?',
        guidance: 'Market competitiveness question for procurement'
      },
      {
        type: 'supplier_comparison',
        template: 'Would you like to see our supplier comparison process?',
        guidance: 'Process-focused question for procurement professionals'
      },
      {
        type: 'vendor_optimization',
        template: 'How do you currently evaluate energy suppliers?',
        guidance: 'Evaluation process question'
      }
    ];
    return procurementPatterns[Math.floor(Math.random() * procurementPatterns.length)];
  }
  
  // Operations Manager patterns (32% response rate)
  if (jobTitle.includes('operations') || jobTitle.includes('operational') || jobTitle.includes('plant manager') || jobTitle.includes('production')) {
    const operationsPatterns = [
      {
        type: 'cost_control',
        template: 'Would energy cost predictability help your planning?',
        guidance: 'Cost control question for operations'
      },
      {
        type: 'efficiency_gains',
        template: 'Are energy costs impacting your operational efficiency?',
        guidance: 'Efficiency-focused question'
      },
      {
        type: 'budget_pressure',
        template: 'How are rising energy costs affecting your operations budget?',
        guidance: 'Budget pressure question for operations'
      }
    ];
    return operationsPatterns[Math.floor(Math.random() * operationsPatterns.length)];
  }
  
  // Generic qualifying patterns (fallback)
  const patterns = [
    {
      type: 'contract_timing',
      template: 'When does your current electricity contract expire?',
      guidance: 'Qualifying question that reveals urgency and timeline'
    },
    {
      type: 'budget_qualification',
      template: 'What\'s your annual electricity spend?',
      guidance: 'Budget qualification for lead scoring'
    },
    {
      type: 'decision_maker',
      template: 'Are you the right person to discuss energy procurement?',
      guidance: 'Decision maker identification'
    },
    {
      type: 'pain_point',
      template: 'Are rising electricity costs affecting your budget?',
      guidance: 'Pain point qualification'
    },
    {
      type: 'timing_urgency',
      template: 'Is your energy contract renewal on your radar for 2025?',
      guidance: 'Timing and urgency qualification'
    },
    {
      type: 'industry_specific',
      template: `How is ${recipient?.company || 'your company'} approaching energy cost management for 2025?`,
      guidance: 'Company-specific strategic question'
    }
  ];
  
  // Updated weights for new qualifying-focused patterns
  const weights = [0.25, 0.20, 0.15, 0.15, 0.15, 0.10];
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < patterns.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) return patterns[i];
  }
  
  return patterns[0];
}

// Opening Style Variations with Energy-Specific Pain Points
function getOpeningStyle(recipient) {
  const roleContext = recipient?.job ? getRoleSpecificLanguage(recipient.job) : null;
  
  const styles = [
    {
      type: 'problem_aware',
      prompt: 'Start with industry-specific energy problem or market condition affecting their business',
      example: '[Industry] companies are facing rising electricity costs as contracts renew in 2025. [Company] is likely seeing significant rate increases...',
      energyFocus: 'Contract renewal timing and rate increases'
    },
    {
      type: 'role_specific',
      prompt: 'Focus on energy challenges specific to their role',
      example: 'As a [job title], you\'re likely dealing with unpredictable energy costs affecting your operations. [Company]...',
      energyFocus: 'Role-specific energy pain points'
    },
    {
      type: 'timing_urgency',
      prompt: 'Open with timing-related urgency relevant to their energy situation',
      example: 'Companies renewing electricity contracts in 2025 are facing 15-25% higher rates. Early procurement could save [company] significant costs...',
      energyFocus: 'Contract timing and early renewal benefits'
    },
    {
      type: 'budget_pressure',
      prompt: 'Lead with budget or cost pressure relevant to their energy spend',
      example: 'Rising electricity costs are putting pressure on operational budgets across [industry]. [Company] may be experiencing...',
      energyFocus: 'Budget pressure from energy cost increases'
    },
    {
      type: 'compliance_risk',
      prompt: 'Reference regulatory or compliance considerations for energy procurement',
      example: 'Energy procurement regulations are evolving, and companies need strategic approaches to compliance. [Company] may need to consider...',
      energyFocus: 'Regulatory compliance and energy procurement'
    },
    {
      type: 'operational_efficiency',
      prompt: 'Focus on operational efficiency challenges related to energy management',
      example: 'Managing multiple energy suppliers and contracts is becoming increasingly complex. [Company] likely faces...',
      energyFocus: 'Energy management complexity and operational efficiency'
    }
  ];
  
  // Equal distribution for now (will adjust based on performance)
  const randomIndex = Math.floor(Math.random() * styles.length);
  return styles[randomIndex];
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
function getSuggestedMeetingTimes(meetingPreferences = null) {
  // If hardcoded times are enabled, use those instead
  if (meetingPreferences?.enabled && meetingPreferences?.useHardcodedTimes) {
    return {
      slot1: 'Tuesday',
      slot1Time: meetingPreferences.slot1Time || '2-3pm',
      slot2: 'Thursday', 
      slot2Time: meetingPreferences.slot2Time || '10-11am'
    };
  }
  
  // Otherwise, calculate dynamic times
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

// Get schema based on template type with dynamic field support
function getTemplateSchema(templateType, dynamicFields = []) {
  const schemas = {
    warm_intro: warmIntroSchema,
    follow_up: followUpSchema,
    energy_health: energyHealthSchema,
    proposal: proposalSchema,
    cold_email: coldEmailSchema,
    invoice: invoiceSchema,
    general: generalSchema
  };
  
  let baseSchema = schemas[templateType] || generalSchema;
  
  // Add dynamic fields to schema if any exist
  if (dynamicFields.length > 0) {
    const enhancedSchema = JSON.parse(JSON.stringify(baseSchema)); // Deep clone
    
    // Add dynamic fields to properties
    dynamicFields.forEach(field => {
      enhancedSchema.json_schema.schema.properties[field.name] = {
        type: field.type || 'string',
        description: field.description
      };
    });
    
    console.log('[Schema Enhancement] Added dynamic fields:', dynamicFields.map(f => f.name));
    return enhancedSchema;
  }
  
  return baseSchema;
}

// Industry-Specific Content Function
function getIndustrySpecificContent(industry) {
  const industryMap = {
    manufacturing: {
      painPoints: ['production downtime', 'energy-intensive operations', 'equipment reliability'],
      avgSavings: '15-25%',
      keyBenefit: 'operational continuity',
      urgencyDrivers: ['production schedules', 'equipment uptime'],
      language: 'operational efficiency and production continuity'
    },
    healthcare: {
      painPoints: ['budget constraints', 'regulatory compliance', 'patient care continuity'],
      avgSavings: '10-18%',
      keyBenefit: 'cost predictability',
      urgencyDrivers: ['budget cycles', 'compliance deadlines'],
      language: 'budget optimization and regulatory compliance'
    },
    retail: {
      painPoints: ['multiple locations', 'unpredictable costs', 'seasonal demand'],
      avgSavings: '12-20%',
      keyBenefit: 'centralized management',
      urgencyDrivers: ['lease renewals', 'expansion plans'],
      language: 'cost control and centralized management'
    },
    hospitality: {
      painPoints: ['seasonal demand', 'guest comfort', 'operational costs'],
      avgSavings: '12-18%',
      keyBenefit: 'cost stability',
      urgencyDrivers: ['seasonal planning', 'guest satisfaction'],
      language: 'cost stability and guest experience'
    },
    education: {
      painPoints: ['budget constraints', 'facility maintenance', 'student safety'],
      avgSavings: '10-15%',
      keyBenefit: 'budget optimization',
      urgencyDrivers: ['academic year cycles', 'facility upgrades'],
      language: 'budget optimization and facility management'
    }
  };
  return industryMap[industry?.toLowerCase()] || industryMap.manufacturing;
}

// Company Size Context Function
function getCompanySizeContext(companyData) {
  const employees = companyData?.employees || 0;
  const usage = companyData?.annualUsage || 0;
  
  if (employees <= 50 || usage < 500000) {
    return {
      size: 'small',
      focus: 'cost savings and simplicity',
      painPoints: ['limited resources', 'time constraints'],
      approach: 'quick wins and easy implementation',
      language: 'cost-effective solutions and simplified processes'
    };
  } else if (employees <= 500 || usage < 5000000) {
    return {
      size: 'medium',
      focus: 'operational efficiency',
      painPoints: ['growing complexity', 'scalability'],
      approach: 'streamlined processes and automation',
      language: 'operational efficiency and scalable solutions'
    };
  } else {
    return {
      size: 'large',
      focus: 'enterprise solutions and compliance',
      painPoints: ['multiple stakeholders', 'regulatory requirements'],
      approach: 'comprehensive strategy and risk management',
      language: 'enterprise-grade solutions and comprehensive strategy'
    };
  }
}

// Contract Timing Urgency Function
function getContractUrgencyLevel(contractEndDate) {
  if (!contractEndDate) return { level: 'unknown', messaging: 'general', tone: 'informative' };
  
  const today = new Date();
  const endDate = new Date(contractEndDate);
  const monthsUntil = (endDate - today) / (1000 * 60 * 60 * 24 * 30);
  
  if (monthsUntil <= 3) {
    return {
      level: 'urgent',
      messaging: 'immediate action needed',
      tone: 'direct and urgent',
      focus: 'act now to avoid rate increases',
      language: 'urgent action required to secure competitive rates'
    };
  } else if (monthsUntil <= 12) {
    return {
      level: 'planning',
      messaging: 'strategic timing opportunity',
      tone: 'consultative and strategic',
      focus: 'early planning for best rates',
      language: 'strategic timing for optimal procurement'
    };
  } else {
    return {
      level: 'research',
      messaging: 'educational approach',
      tone: 'informative and relationship-building',
      focus: 'market insights and preparation',
      language: 'market insights and strategic preparation'
    };
  }
}

// Trigger Event Detection Function
function detectTriggerEvents(companyData, recipient) {
  const events = [];
  
  // Check for recent company announcements
  if (companyData?.recentAnnouncements) {
    events.push({
      type: 'company_announcement',
      description: companyData.recentAnnouncements,
      relevance: 'high'
    });
  }
  
  // Check for funding or expansion
  if (companyData?.funding || companyData?.expansion) {
    events.push({
      type: 'growth_event',
      description: companyData.funding || companyData.expansion,
      relevance: 'high'
    });
  }
  
  // Check for job changes
  if (recipient?.recentJobChange) {
    events.push({
      type: 'job_change',
      description: recipient.recentJobChange,
      relevance: 'medium'
    });
  }
  
  // Check for industry news
  if (companyData?.industryNews) {
    events.push({
      type: 'industry_news',
      description: companyData.industryNews,
      relevance: 'medium'
    });
  }
  
  return events;
}

// Deep Personalization Function
function getDeepPersonalization(companyData, recipient) {
  const personalization = {
    achievements: [],
    recentActivity: [],
    painPoints: [],
    opportunities: []
  };
  
  // Company achievements
  if (companyData?.funding) {
    personalization.achievements.push(`recent funding of ${companyData.funding}`);
  }
  if (companyData?.expansion) {
    personalization.achievements.push(`expansion to ${companyData.expansion}`);
  }
  if (companyData?.newFacilities) {
    personalization.achievements.push(`new facilities at ${companyData.newFacilities}`);
  }
  
  // Recent activity
  if (companyData?.recentAnnouncements) {
    personalization.recentActivity.push(companyData.recentAnnouncements);
  }
  if (recipient?.recentLinkedInActivity) {
    personalization.recentActivity.push(recipient.recentLinkedInActivity);
  }
  
  // Pain points based on company data
  if (companyData?.energyIntensive) {
    personalization.painPoints.push('high energy consumption');
  }
  if (companyData?.multipleLocations) {
    personalization.painPoints.push('complex multi-location management');
  }
  if (companyData?.budgetConstraints) {
    personalization.painPoints.push('budget pressure');
  }
  
  // Opportunities
  if (companyData?.contractExpiring) {
    personalization.opportunities.push('contract renewal timing');
  }
  if (companyData?.growthPlans) {
    personalization.opportunities.push('scaling energy needs');
  }
  
  return personalization;
}

// Role-specific language for better personalization
function getRoleSpecificLanguage(role) {
  const roleMap = {
    'CFO': {
      painPoints: ['budget pressure', 'cost predictability', 'financial risk management'],
      benefits: ['budget optimization', 'cost reduction', 'risk mitigation'],
      language: 'financial impact and budget optimization'
    },
    'Facilities Manager': {
      painPoints: ['operational efficiency', 'maintenance costs', 'facility performance'],
      benefits: ['operational efficiency', 'maintenance cost reduction', 'facility optimization'],
      language: 'operational efficiency and facility performance'
    },
    'Procurement Manager': {
      painPoints: ['vendor management', 'contract complexity', 'supplier relationships'],
      benefits: ['vendor optimization', 'contract simplification', 'supplier management'],
      language: 'procurement optimization and vendor management'
    },
    'Operations Manager': {
      painPoints: ['cost control', 'operational efficiency', 'resource optimization'],
      benefits: ['cost control', 'efficiency improvements', 'resource optimization'],
      language: 'operational efficiency and cost control'
    }
  };
  return roleMap[role] || {
    painPoints: ['energy costs', 'operational efficiency'],
    benefits: ['cost reduction', 'efficiency improvements'],
    language: 'business operations'
  };
}

async function buildSystemPrompt({ mode, recipient, to, prompt, senderName = 'Lewis Patterson', templateType, whoWeAre, marketContext, meetingPreferences }) {
  // Analyze manual prompt for enhanced context understanding
  const promptAnalysis = analyzeManualPrompt(prompt);
  
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

  // If no description and we have company name, do enhanced research
  let researchData = null;
  let linkedinContext = null;
  let websiteContext = null;

  if (!accountDescription && company) {
    console.log(`[Research] No description for ${company}, starting enhanced research...`);
    
    // Get LinkedIn URL from account or recipient
    const linkedinUrl = r.account?.linkedin || r.account?.linkedinUrl || r.linkedin || null;
    
    // Get domain from account
    const domain = r.account?.domain || r.account?.website || null;
    
    // Run all research in parallel for speed
    const [basicResearch, linkedinResearch, websiteResearch] = await Promise.all([
      researchCompanyInfo(company, industry),
      researchLinkedInCompany(linkedinUrl, company),
      scrapeCompanyWebsite(domain, company)
    ]);
    
    // Use basic research as primary description
    accountDescription = basicResearch;
    linkedinContext = linkedinResearch;
    websiteContext = websiteResearch;
    
    // Save basic description to Firestore if we found something
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
  const ctaPattern = templateType === 'cold_email' ? getCTAPattern(recipient, meetingPreferences, templateType) : null;
  const openingStyle = templateType === 'cold_email' ? getOpeningStyle(recipient) : null;
  
  // Get role-specific context
  const roleContext = job ? getRoleSpecificLanguage(job) : null;
  
  // Get industry-specific content
  const industryContent = industry ? getIndustrySpecificContent(industry) : null;
  
  // Get company size context
  const companySizeContext = getCompanySizeContext(r.account || {});
  
  // Get contract urgency level
  const contractUrgency = getContractUrgencyLevel(energy.contractEnd);
  
  // Detect trigger events
  const triggerEvents = detectTriggerEvents(r.account || {}, recipient);
  
  // Get deep personalization
  const deepPersonalization = getDeepPersonalization(r.account || {}, recipient);
  
  const recipientContext = `
RECIPIENT INFORMATION:
- Name: ${firstName || 'there'} ${company ? 'at ' + company : ''}
${job ? '- Role: ' + job + ' (focus on ' + (roleContext?.language || 'business operations') + ')' : ''}
${industry ? '- Industry: ' + industry : ''}
${accountDescription ? '- Company Description: ' + accountDescription : ''}
${linkedinContext ? '- LinkedIn Insights: ' + linkedinContext : ''}
${websiteContext ? '- Company Website Info: ' + websiteContext : ''}
${energy.supplier ? '- Current Supplier: ' + energy.supplier : ''}
${energy.currentRate ? '- Current Rate: ' + energy.currentRate + '/kWh' : ''}
${contractEndLabel ? '- Contract Ends: ' + contractEndLabel : ''}
${transcript ? '- Call Notes: ' + transcript : ''}
${notes ? '- Additional Notes: ' + notes : ''}

INDUSTRY-SPECIFIC CONTEXT:
${industryContent ? '- Industry Focus: ' + industryContent.language + '\n- Key Pain Points: ' + industryContent.painPoints.join(', ') + '\n- Average Savings: ' + industryContent.avgSavings + '\n- Key Benefit: ' + industryContent.keyBenefit + '\n- Urgency Drivers: ' + industryContent.urgencyDrivers.join(', ') : ''}

COMPANY SIZE CONTEXT:
- Size Category: ${companySizeContext.size}
- Focus Area: ${companySizeContext.focus}
- Pain Points: ${companySizeContext.painPoints.join(', ')}
- Approach: ${companySizeContext.approach}
- Language Style: ${companySizeContext.language}

CONTRACT URGENCY LEVEL:
- Urgency Level: ${contractUrgency.level}
- Messaging Tone: ${contractUrgency.tone}
- Focus: ${contractUrgency.focus}
- Language: ${contractUrgency.language}

TRIGGER EVENTS:
${triggerEvents.length > 0 ? triggerEvents.map(event => '- ' + event.type + ': ' + event.description + ' (' + event.relevance + ' relevance)').join('\n') : '- No recent trigger events detected'}

DEEP PERSONALIZATION:
${deepPersonalization.achievements.length > 0 ? '- Company Achievements: ' + deepPersonalization.achievements.join(', ') : ''}
${deepPersonalization.recentActivity.length > 0 ? '- Recent Activity: ' + deepPersonalization.recentActivity.join(', ') : ''}
${deepPersonalization.painPoints.length > 0 ? '- Identified Pain Points: ' + deepPersonalization.painPoints.join(', ') : ''}
${deepPersonalization.opportunities.length > 0 ? '- Opportunities: ' + deepPersonalization.opportunities.join(', ') : ''}
${roleContext ? '- Role-Specific Focus: ' + roleContext.painPoints.join(', ') : ''}

COMPANY-SPECIFIC DATA USAGE EXAMPLES:
${energy.supplier ? '- Current Supplier: "With ' + energy.supplier + ' as your current supplier, you may be missing competitive rates..."' : ''}
${energy.currentRate ? '- Current Rate: "At ' + energy.currentRate + '/kWh, there\'s likely room for improvement..."' : ''}
${contractEndLabel ? '- Contract Timing: "With your contract ending ' + contractEndLabel + ', timing is critical..."' : ''}
${accountDescription ? '- Company Description: "As ' + accountDescription + ', energy costs are likely a significant expense..."' : ''}
${industryContent ? '- Industry Focus: "Manufacturing companies like ' + company + ' typically face ' + industryContent.painPoints[0] + '..."' : ''}
${companySizeContext ? '- Size Context: "As a ' + companySizeContext.size + ' company, ' + companySizeContext.focus + ' is key..."' : ''}
${contractUrgency ? '- Urgency Level: "With ' + contractUrgency.level + ' timing, ' + contractUrgency.focus + '..."' : ''}

ROLE-SPECIFIC OPENING HOOK EXAMPLES:
${job?.toLowerCase().includes('cfo') || job?.toLowerCase().includes('finance') ? '- CFO: "As CFO of ' + company + ', you\'re likely planning 2025 budgets with energy costs rising..."' : ''}
${job?.toLowerCase().includes('facilities') || job?.toLowerCase().includes('maintenance') ? '- Facilities: "Managing energy procurement on top of facilities operations can be time-consuming..."' : ''}
${job?.toLowerCase().includes('procurement') || job?.toLowerCase().includes('purchasing') ? '- Procurement: "As procurement manager, you know the energy market is competitive..."' : ''}
${job?.toLowerCase().includes('operations') || job?.toLowerCase().includes('manager') ? '- Operations: "Energy costs can be one of the most unpredictable operational expenses..."' : ''}
${job?.toLowerCase().includes('president') || job?.toLowerCase().includes('ceo') ? '- Executive: "As President of ' + company + ', you understand the importance of managing operational costs..."' : ''}
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
    
    // Generate dynamic fields based on prompt analysis
    const dynamicFields = generateDynamicFields(templateType, promptAnalysis, recipient);
    
    // Build conditional rules based on prompt intent
    const conditionalRules = buildConditionalRules(promptAnalysis, templateType);
    
    const basePrompt = `${whoWeAre || 'You are generating TEXT CONTENT ONLY for Power Choosers email templates.'}

SENDER: ${senderName}
IMPORTANT: Return PLAIN TEXT only in JSON fields. NO HTML tags, NO styling, NO formatting.
We handle all HTML/CSS styling on our end.

${recipientContext}

${conditionalRules}

Use web search to personalize content about ${company || 'the recipient'}.`;

    // Template-specific instructions
    const templateInstructions = {
      warm_intro: `
TEMPLATE: Warm Introduction After Call
Generate text for these fields:
- greeting: "Hello ${firstName}," 
- call_reference: Mention specific details from your conversation (day, topics discussed, their insights). Be specific about what you talked about to show you were listening.
- main_message: Brief recap of conversation with concrete value proposition and urgency (2-3 sentences). Include specific outcomes or savings mentioned. Use casual, relationship-building tone.
- cta_text: Use a conversational qualifying question that builds on your discussion. Examples: "When does your current energy contract expire?", "Would you be open to discussing your energy setup?", "What's your timeline for making a decision?", "Would you like me to send over that case study we discussed?"`,

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
- opening_hook: Start with SPECIFIC problem awareness or market condition (1-2 sentences). ${accountDescription ? 'MUST reference: "' + accountDescription + '"' : 'Reference their specific business challenges.'} Focus on industry-specific energy challenges:
  * Manufacturing: Production downtime, equipment reliability, energy-intensive operations
  * Healthcare: Budget constraints, regulatory compliance, patient care continuity
  * Retail: Multiple locations, unpredictable costs, seasonal demand
  * Hospitality: Guest comfort, operational costs, seasonal planning
  * Education: Facility maintenance, student safety, budget optimization
  * Use company-specific data: current supplier, rate, contract timing, recent achievements
IMPORTANT: Always reference ${company} specifically. Use qualitative language (rising, increasing, higher) NOT percentages (15-25%, 20-30%). Keep it natural and conversational.
- value_proposition: How we help (1-2 sentences MINIMUM). MUST include BOTH: (1) HOW we help, AND (2) SPECIFIC measurable value: "save ${marketContext?.typicalClientSavings || '10-20%'}", "reduce costs by $X annually", "helped similar companies achieve Y". Include role-specific benefits:
  * CFOs: Budget predictability, cost reduction, risk mitigation
  * Facilities Managers: Operational efficiency, maintenance cost reduction
  * Procurement Managers: Vendor management, contract optimization
  * Operations Managers: Cost control, efficiency improvements
Example: "We help manufacturing companies secure better rates before contracts expire. Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs while reducing procurement complexity." Be concrete, not vague. NEVER end with incomplete phrase like "within [company]". ALWAYS include a complete value proposition - never skip this field. THIS FIELD IS MANDATORY - NEVER LEAVE BLANK. Statistics ARE allowed here (value prop only), just not in opening_hook.
- social_proof_optional: Brief credibility statement IF relevant (1 sentence, optional). Use specific outcomes: "We recently helped [similar company] reduce energy costs by 18%", "Our clients in [industry] typically save $X annually", "Companies like [company] have achieved 15-20% savings". Be specific and credible. NEVER use vague phrases like "similar companies" or "many businesses".
${ctaPattern ? `
- cta_text: Customize this pattern: "${ctaPattern.template}". Keep under 12 words. MUST be complete sentence with proper ending punctuation. NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .).
- cta_type: Return "${ctaPattern.type}"
` : `
- cta_text: Create a professional call-to-action question (under 12 words, ending with proper punctuation).
- cta_type: Return "qualifying"
`}

CRITICAL QUALITY RULES:
- PROBLEM AWARENESS: Lead with industry-specific problem or market condition
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- MEASURABLE CLAIMS: "save ${marketContext?.typicalClientSavings || '10-20%'}" or "$X annually" NOT "significant savings"
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: ${accountDescription ? 'MUST naturally reference: "' + accountDescription + '"' : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- SPECIFIC TO THEM: Reference actual company details, not generic industry statements
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- TONE CONSISTENCY: Use professional but conversational tone throughout. Avoid mixing formal and casual language.
- PERSONALIZATION DEPTH: Reference specific company data (supplier, rate, contract timing, recent achievements) when available.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)
- EMAIL LENGTH: Keep total email body 90-130 words (research optimal range)
- CTA LENGTH: CTAs should be 8-12 words maximum
- VALUE PROP MUST: Include HOW we help AND WHAT results (e.g., "We help [industry] companies secure better rates before contracts expire. Clients typically save ${marketContext?.typicalClientSavings || '10-20%'}.")
- MOBILE OPTIMIZATION: Keep paragraphs short (2-3 sentences max), use clear CTA placement, optimize for mobile preview text (52% of emails opened on mobile)
- LENGTH VALIDATION: If email exceeds 130 words, prioritize: greeting + opening hook + value prop + CTA only
- COMPANY DATA USAGE: MUST use current supplier, rate, contract timing, recent achievements when available

FORBIDDEN PHRASES (TWO-TIER APPROACH):
TIER 1 - OPENING HOOK (NO statistics allowed):
- "I've been tracking how [industry] companies..."
- "Recently helped another [industry] company..."
- "rising 15-25%"
- "saving 20-30%"
- "contracts ending in 2025-2026"
- "driven by data center demand"
- "15-25%"
- "20-30%"
- "10-20%"
- "electricity rate increases of 15-25%"
- "reduce annual energy costs by 20-30%"
- "data centers drive up demand"
- "data centers driving electricity rates up"
- "sharp cost increases"
- "data center-driven rate hikes"
- "pushing electricity costs up 15-25%"
- "rates up 15-25%"
- "rates up 20-30%"
- "electricity rates up 15-25%"

TIER 2 - VALUE PROPOSITION (Statistics ENCOURAGED):
✓ ALLOWED: "save 10-20%", "reduce costs by $X annually", "clients typically save 15-20%", "helped similar companies achieve 18% savings"
✓ ALLOWED: Specific percentages and dollar amounts in value propositions
✓ ALLOWED: Concrete outcomes and measurable results
- "electricity rates up 20-30%"
- "data center demand drives rates up"
- "data center demand pushing"
- "Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call?"
- "Would Tuesday [time] or Thursday [time] work"
- Any meeting time suggestions (Tuesday, Thursday, etc.)

PREFERRED LANGUAGE:
- "Companies in [industry] are facing rising electricity costs..."
- "[Company] likely sees energy as a significant operational expense..."
- "With contracts renewing in 2025, [company] may be facing higher energy rates..."
- "Given [company]'s focus on [business aspect], energy costs are probably on your radar..."
- "[Company]'s [industry] operations typically require significant energy consumption..."
- "As a [industry] company, [company] is probably seeing electricity rate increases..."
- "Current market conditions are driving up energy costs for [industry] operations..."

STYLE RULES:
  - Use first-person voice ("we"/"I") instead of brand-first phrasing.
  - Avoid starting any sentence with "At Power Choosers," or "Power Choosers helps".
  - Prefer "We help…" / "I help…".

SUBJECT LINE RULES:
- Target: 3-4 words (sweet spot for engagement)
- Maximum: 41 characters (ensures full display on mobile - 52% of emails opened on mobile in 2025)
- Choose ONE pattern and customize naturally (42-45% open rates):
  * "Hi ${firstName}" (45% open rate - ultra-personal)
  * "${firstName}, made this for you" (43% open rate - curiosity-driven)
  * "Thoughts, ${firstName}?" (43% open rate - casual, engaging)
  * "${firstName}, ${mutualConnection} referred me" (43% open rate - social proof, conditional)
  * "${company} - 2025 energy planning question" (42% open rate - industry-specific)
  * "${company}'s electricity rate question" (42% open rate - specific pain point)
  * "Re: ${company}'s contract renewal" (42% open rate - familiarity + urgency)
- Use question marks to increase curiosity
- Include company name for personalization when possible
- NO statistics or percentages in subject lines
- Return the style you chose in subject_style field
- INDUSTRY-SPECIFIC: Use industry pain points in subject when relevant (e.g., "Manufacturing energy costs?", "Healthcare budget pressure?")

EMAIL STRUCTURE FRAMEWORKS (Choose ONE):
1. PROBLEM-AGITATE-SOLUTION (PAS) - Best for cold outreach:
   - Opening: Industry-specific problem affecting their business
   - Middle: Agitate the problem with specific consequences
   - Value Prop: Solution with measurable results
   - CTA: Qualifying question

2. BEFORE-AFTER-BRIDGE (BAB) - Best for contract renewals:
   - Opening: Current situation (positive observation)
   - Middle: Future risk (rate increases, market changes)
   - Value Prop: Bridge solution with specific savings
   - CTA: Timing-focused question

3. AIDA (Attention-Interest-Desire-Action) - Best for executives:
   - Opening: Attention-grabbing question about their situation
   - Middle: Interest with specific benefits and social proof
   - Value Prop: Desire with concrete outcomes
   - CTA: Action-oriented qualifying question

CHOOSE framework based on:
- Contract timing: BAB for renewals, PAS for general outreach
- Role: AIDA for C-level, PAS for operational roles
- Industry: PAS for problem-aware industries, BAB for timing-sensitive
`,

      invoice: `
TEMPLATE: Invoice Request
Generate text for these fields:
- greeting: "Hello ${firstName},"
- intro_paragraph: Context from our conversation explaining we'll conduct an energy analysis to identify discrepancies and determine how ${company || 'the company'} is using energy and the best plan moving forward. Reference notes/transcripts if available. (2-3 sentences)
- checklist_items: Array of 3-4 specific items we'll review from the invoice (e.g., invoice date/number, billing period, charge breakdown, payment details)
- discrepancies: Array of 3-4 common billing discrepancies to watch for. Intelligently select based on:
  * Industry type: ${industry || 'general business'}
  * Company size: ${energy.annualUsage ? energy.annualUsage + ' kWh annually' : 'standard commercial'}
  * Business nature: ${company || 'commercial'} ${job ? '(' + job + ')' : ''}
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
${dynamicFields.length > 0 ? `
DYNAMIC FIELDS (include if relevant):
${dynamicFields.map(field => `- ${field.name}: ${field.description}`).join('\n')}
` : ''}

CRITICAL RULES:
- Each item in sections array = ONE SENTENCE ONLY
- list_header must be relevant to the specific email content, not generic
- Keep sections concise and actionable
- Use conditional rules from prompt analysis above`
    };

    return { 
      prompt: basePrompt + (templateInstructions[templateType] || templateInstructions.general),
      researchData: researchData,
      openingStyle: openingStyle?.type || null,
      dynamicFields: dynamicFields
    };
  }

  // Standard text mode (existing logic)
  const identity = whoWeAre || `You are ${senderName}, an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates. Write in first person ("we"/"I"). Do NOT use brand-first openers like "At Power Choosers," or "Power Choosers helps" — prefer "We help" or "I help".

CONTEXT USAGE RULES:
${contractEndLabel ? '- The recipient\'s contract ends ' + contractEndLabel + ' - YOU MUST REFERENCE THIS' : ''}
${notes || transcript ? '- Use call notes/transcript to add specific context from your conversation' : ''}
${job ? '- Acknowledge their role as ' + job : ''}
- Personalize based on their industry and current situation
- Make it feel like you just spoke with them

${marketContext?.enabled ? `
KEY CONTEXT:
- Electricity rates rising ${marketContext.rateIncrease || '15-25%'} ${marketContext.marketInsights || 'due to data center demand'}
- Companies with contracts ending ${marketContext.renewalYears || '2025-2026'} face higher renewal rates
- Early renewals save ${marketContext.earlyRenewalSavings || '20-30%'} vs. waiting` : ''}`;

  const outputFormat = `
OUTPUT FORMAT (JSON):
{
  "subject": "[Your subject line]",
  "greeting": "Hi ${firstName || 'there'},",
  "paragraph1": "[Opening paragraph with context - 2-3 sentences]",
  "paragraph2": "[Main message paragraph - 3-4 sentences about value and next steps]",
  "paragraph3": "[Call to action paragraph - clear question or request]",
  "closing": "Best regards,\n${senderName ? senderName.split(' ')[0] : 'Lewis'}"
}

CRITICAL: Return ONLY valid JSON. Each paragraph should be a separate field. Do not include any text outside the JSON structure.
IMPORTANT: The closing field must include a newline between "Best regards," and the sender name (e.g., "Best regards,\\nLewis").`;

  // Check if this is a cold email in standard mode
  const isColdEmailStandard = /cold.*email|could.*not.*reach/i.test(String(prompt || ''));
  
  if (isColdEmailStandard) {
    const ctaPattern = getCTAPattern(recipient, meetingPreferences, 'cold_email');
    const openingStyle = getOpeningStyle(recipient);
    
    const coldEmailRules = `
EMAIL TYPE: Cold Email (Never Spoke Before)

GREETING (MANDATORY - MUST BE FIRST LINE):
✓ Start with "Hi ${firstName || 'there'},"
✓ NEVER skip the greeting
✓ NEVER start with company name or industry information
✓ Greeting must be on its own line with blank line after

CRITICAL QUALITY RULES:
- PROBLEM AWARENESS: Lead with industry-specific problem or market condition
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- MEASURABLE CLAIMS: "save ${marketContext?.typicalClientSavings || '10-20%'}" or "$X annually" NOT "significant savings"
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: ${accountDescription ? 'Must naturally reference: "' + accountDescription + '"' : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

PARAGRAPH STRUCTURE (CRITICAL):
Paragraph 1 (Opening Hook - 1-2 sentences):
- Industry-specific problem or market condition
- Reference ${company} specifically
- Use qualitative language (rising, increasing, higher) NOT percentages
- NO statistics in opening hook

Paragraph 2 (Value Proposition - 2-3 sentences):
- How Power Choosers helps
- SPECIFIC measurable value: "save 10-20%", "reduce costs by $X"
- Include both HOW we help AND WHAT results

Paragraph 3 (CTA - 1 sentence):
- Qualifying question or soft ask
- Under 12 words
- Complete sentence with proper punctuation

FORMATTING REQUIREMENTS:
- Use EXACTLY TWO line breaks between each paragraph
- Each paragraph must be separated by a blank line
- Do NOT combine paragraphs into single blocks
- Ensure proper spacing for readability

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
- MUST include: (1) What we do, (2) Concrete numbers: "save ${marketContext?.typicalClientSavings || '10-20%'}", "reduce costs by $X", "clients typically see Y"
- Reference: ${accountDescription ? '"' + accountDescription + '"' : 'their business type'}
- Add social proof if relevant: "helped similar companies achieve [specific result]"
- Example: "We help ${industry || 'businesses'} secure better rates before contracts expire. Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs."
- NEVER end with incomplete phrases or "within [company name]"
- ALWAYS include a complete value proposition - never skip this field
- THIS FIELD IS MANDATORY - NEVER LEAVE BLANK

CTA:
${ctaPattern ? 'Use qualifying question or soft ask: "' + ctaPattern.template + '"' : 'Create a professional qualifying question or soft ask'}
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
      researchData: researchData,
      openingStyle: openingStyle?.type || null
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
OUTPUT FORMAT (JSON):
{
  "subject": "[Invoice request subject with ${firstName || 'recipient name'}]",
  "greeting": "Hi ${firstName || 'there'},",
  "paragraph1": "[Context about energy analysis - 2-3 sentences]",
  "paragraph2": "What we'll review from your invoice:\\n• Invoice date and service address\\n• Billing period (start and end dates)\\n• Detailed charge breakdown (including kWh rate, demand charges, fees)\\n• Payment details and service address",
  "paragraph3": "Will you be able to send over the invoice by end of day so me and my team can get started?",
  "closing": "Best regards,\n${senderName ? senderName.split(' ')[0] : 'Lewis'}"
}

CRITICAL: Return ONLY valid JSON. Each paragraph should be a separate field. Do not include any text outside the JSON structure.
IMPORTANT: The closing field must include a newline between "Best regards," and the sender name (e.g., "Best regards,\\nLewis").`;

    return { 
      prompt: [identity, recipientContext, invoiceRules, invoiceOutputFormat].join('\n'),
      researchData: researchData,
      openingStyle: null
    };
  }

  const qualityRules = `
QUALITY REQUIREMENTS:
✓ Length: 90-130 words total
✓ Use "${firstName || 'there'}," in greeting ONCE (no duplicate names)
✓ Middle paragraph: 3-4 complete sentences
✓ MUST mention "15-25%" rate increase
✓ CTA: Use qualifying questions only (e.g., "When does your contract expire?", "Are rising costs affecting your budget?")
✓ Subject line: Under 50 chars, include ${firstName || 'recipient name'}
✓ Closing: "Best regards," on its own line, followed by sender name on next line
✓ DO NOT include citation markers like [1], [2], [3]

PARAGRAPH STRUCTURE (CRITICAL):
✓ Paragraph 1: Greeting line - "Hi ${firstName || 'there'},"
✓ Paragraph 2: Opening context (2-3 sentences) 
✓ Paragraph 3: Main message and value proposition (3-4 sentences)
✓ Paragraph 4: Call to action (1-2 sentences)
✓ Use DOUBLE LINE BREAKS between paragraphs
✓ Each paragraph must be separated by blank line

PERSONALIZATION REQUIREMENTS:
${contractEndLabel ? '✓ MUST reference contract ending ' + contractEndLabel + ' - this is CRITICAL context' : ''}
${energy.supplier ? '✓ Reference their current supplier ' + energy.supplier + ' when relevant' : ''}
${notes || transcript ? '✓ MUST reference specific details from call notes/transcript' : ''}
${job ? '✓ Reference their role as ' + job + ' when relevant' : ''}
${industry ? '✓ Include industry-specific insights for ' + industry + ' sector' : ''}

CRITICAL RULES:
❌ NO duplicate names after greeting
❌ NO meeting requests in cold emails - use qualifying questions only
❌ NO incomplete sentences - every sentence must have proper ending
❌ NO generic contract references - use actual date ${contractEndLabel || 'when provided'}
✅ MUST stop after paragraph 3
✅ MUST include question mark in CTA
✅ MUST use qualifying questions that reveal urgency and timeline`;

  return { 
    prompt: [identity, recipientContext, qualityRules, outputFormat].join('\n'),
    researchData: researchData,
    openingStyle: null
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[Perplexity] Missing PERPLEXITY_API_KEY');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing API key' }));
      return;
    }

    const { prompt, mode = 'standard', recipient = null, to = '', fromEmail = '', senderName = 'Lewis Patterson', whoWeAre, marketContext, meetingPreferences } = req.body || {};
    
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
    
    const meetingTimes = getSuggestedMeetingTimes(meetingPreferences);
    
    // Only suggest meeting times for follow-up emails, not cold emails
    const dateContext = templateType === 'cold_email' ? `TODAY'S DATE: ${todayLabel}

COLD EMAIL RULES:
- Use qualifying questions only (NO meeting requests)
- Focus on problem awareness and value proposition
- Keep CTAs under 12 words
- Use role-specific qualifying questions

` : `TODAY'S DATE: ${todayLabel}

SUGGESTED MEETING TIMES (2+ business days out):
- Option 1: ${meetingTimes.slot1} ${meetingTimes.slot1Time}
- Option 2: ${meetingTimes.slot2} ${meetingTimes.slot2Time}

CRITICAL: Use these EXACT meeting times in your CTA.
✅ Correct: "Would ${meetingTimes.slot1} ${meetingTimes.slot1Time} or ${meetingTimes.slot2} ${meetingTimes.slot2Time} work for a 15-minute call?"
❌ Wrong: Generic "Tuesday" or past dates

`;
    
    const { prompt: systemPrompt, researchData, openingStyle: openingStyleUsed, dynamicFields } = await buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType, whoWeAre, marketContext, meetingPreferences });
    const fullSystemPrompt = dateContext + systemPrompt;
    
    // Call Perplexity API
    const body = {
      model: 'sonar',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: prompt || 'Draft a professional email' }
      ],
      max_tokens: 600, // Increased to prevent CTA truncation
      // Add JSON schema for HTML mode with dynamic fields
      ...(mode === 'html' ? { response_format: getTemplateSchema(templateType, dynamicFields) } : {})
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
      return res.writeHead(response.status, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: msg }));
return;
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
              `secure better energy rates before contracts expire. Clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual costs.`
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
          jsonData.value_proposition = `We help ${industry} companies secure better rates before contracts expire. Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs.`;
        }
        
        // Validate missing opening_hook for cold emails
        if (templateType === 'cold_email' && (!jsonData.opening_hook || jsonData.opening_hook.trim() === '')) {
          console.warn('[Validation] Missing opening_hook detected, adding default...');
          const company = recipient?.company || 'Companies';
          jsonData.opening_hook = `${company} are likely facing rising electricity costs with contracts renewing in 2025.`;
        }
        
        // Validate for duplicate CTAs in cold emails
        if (templateType === 'cold_email' && jsonData.cta_text) {
          // Check if the CTA contains multiple questions or meeting requests
          const hasMultipleQuestions = (jsonData.cta_text.match(/\?/g) || []).length > 1;
          const hasMeetingRequest = /does.*work.*call|tuesday|thursday|monday|wednesday|friday|15-minute|brief.*call|quick.*call|meeting|schedule|calendar/i.test(jsonData.cta_text);
          const hasTimeSlot = /\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)/i.test(jsonData.cta_text);
          
          if (hasMultipleQuestions || hasMeetingRequest || hasTimeSlot) {
            console.warn('[Validation] Meeting request or duplicate CTA detected in cold email, replacing with qualifying question...');
            jsonData.cta_text = 'When does your current energy contract expire?';
          }
        }
        
        // Validate no statistics in opening_hook for cold emails
        if (templateType === 'cold_email' && jsonData.opening_hook) {
          const hasStatistics = /\d+[-–]\d+%|\d+%|save \$\d+|reduce costs by|15-25%|20-30%|10-20%|data center.*\d+%|rates up \d+%/i.test(jsonData.opening_hook);
          if (hasStatistics) {
            console.warn('[Validation] Statistics detected in opening_hook:', jsonData.opening_hook);
            // Strip out the statistics but keep the sentence structure
            jsonData.opening_hook = jsonData.opening_hook
              .replace(/\d+[-–]\d+%/g, 'significantly')
              .replace(/\b\d+%\b/g, 'considerably')
              .replace(/save \$[\d,]+/g, 'reduce costs')
              .replace(/reduce costs by \$?[\d,]+/g, 'reduce operational costs')
              .replace(/data center.*\d+%/gi, 'data center demand')
              .replace(/rates up \d+%/gi, 'rising rates')
              .replace(/15-25%/gi, 'significantly')
              .replace(/20-30%/gi, 'considerably')
              .replace(/10-20%/gi, 'substantially');
            console.warn('[Validation] Fixed opening_hook:', jsonData.opening_hook);
          }
        }
        
        // Validate email length for cold emails (90-130 words optimal)
        if (templateType === 'cold_email') {
          const fullEmail = `${jsonData.greeting || ''} ${jsonData.opening_hook || ''} ${jsonData.value_proposition || ''} ${jsonData.cta_text || ''}`.trim();
          const wordCount = fullEmail.split(/\s+/).length;
          
          if (wordCount > 150) {
            console.warn(`[Validation] Email too long (${wordCount} words), optimizing...`);
            // Only remove social proof if present
            if (jsonData.social_proof_optional) {
              jsonData.social_proof_optional = '';
            }
          } else if (wordCount < 80) {
            console.warn(`[Validation] Email too short (${wordCount} words), expanding value proposition...`);
            // Only expand if value prop is very short
            if (jsonData.value_proposition && jsonData.value_proposition.length < 40) {
              jsonData.value_proposition = `${jsonData.value_proposition} Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs.`;
            }
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          ok: true, 
          output: jsonData,
          templateType: templateType,
          citations: citations,
          researchData: researchData,
          metadata: {
            subject_style: jsonData.subject_style || null,
            cta_type: jsonData.cta_type || null,
            opening_style: templateType === 'cold_email' ? (openingStyleUsed || null) : null,
            generated_at: new Date().toISOString()
          }
        }));
      } catch (e) {
        console.error('[Perplexity] Failed to parse JSON:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to parse AI response' }));
      }
    }
    
    // Standard mode
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      ok: true, 
      output: deSalesify(content),
      citations: citations
    }));
    
  } catch (e) {
    console.error('[Perplexity] Handler error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to generate email', message: e.message }));
  }
}
