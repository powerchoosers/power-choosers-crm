// Perplexity Sonar Email Generation (Serverless) - Vercel function
// 7 Preset HTML Templates - AI provides text only, we control styling
// Expects POST { prompt, mode: 'standard'|'html', recipient, to, senderName, fromEmail }

import { cors } from './_cors.js';

// ========== SUBJECT LINE VARIANTS ==========
// Multiple subject line options that randomly select to reduce template-like appearance
const SUBJECT_LINE_VARIANTS = {
  'cold-email': {
    ceo: [
      '[contact_name], contract timing question',
      '[contact_name], energy renewal strategy',
      '[contact_name], rate lock opportunity',
      '[contact_name], energy budget question',
      '[company] contract renewal timing'
    ],
    finance: [
      '[contact_name], budget question about energy renewal',
      '[contact_name], rate lock timing question',
      '[contact_name], cost predictability question',
      '[contact_name], energy budget cycle question'
    ],
    operations: [
      '[contact_name], facility renewal timing question',
      '[contact_name], energy operations question',
      '[contact_name], facility rate lock timing',
      '[company] facility renewal timing'
    ],
    default: [
      '[contact_name], contract timing question',
      '[contact_name], energy renewal timing',
      '[contact_name], rate lock timing question',
      '[company] contract renewal question',
      '[contact_name], energy renewal strategy'
    ]
  }
};

// Get random subject line based on email type and role
function getRandomSubjectLine(type = 'cold-email', role = 'default', firstName = '', company = '') {
  const roleKey = role === 'ceo' || role === 'executive' || role === 'owner' ? 'ceo' :
                  role === 'finance' || role === 'controller' || role === 'cfo' || role === 'accounting' ? 'finance' :
                  role === 'operations' || role === 'facilities' || role === 'logistics' ? 'operations' :
                  'default';
  
  const variants = SUBJECT_LINE_VARIANTS[type]?.[roleKey] || SUBJECT_LINE_VARIANTS[type]?.default;
  if (!variants || variants.length === 0) {
    return `${firstName || 'there'}, contract timing question`;
  }
  
  const selected = variants[Math.floor(Math.random() * variants.length)];
  
  // Replace placeholders
  return selected
    .replace(/\[contact_name\]/g, firstName || 'there')
    .replace(/\[company\]/g, company || 'your company');
}

// ========== EMAIL GENERATION MODES ==========
// Different email tones to reduce template-like appearance
const EMAIL_GENERATION_MODES = {
  consultative: { 
    tone: 'Discovery-focused, asking questions, low pressure',
    approach: 'Ask discovery questions to understand their situation',
    ctaStyle: 'Soft qualifying questions'
  },
  direct: { 
    tone: 'Confident, specific, value upfront, assertive',
    approach: 'Lead with specific insights and concrete value',
    ctaStyle: 'Direct questions about their process'
  },
  balanced: { 
    tone: 'Professional mix of insight + value, peer-to-peer',
    approach: 'Combine observation with specific value proposition',
    ctaStyle: 'Balanced between discovery and action'
  }
};

// Get random generation mode
function getRandomGenerationMode() {
  const modes = Object.keys(EMAIL_GENERATION_MODES);
  const random = modes[Math.floor(Math.random() * modes.length)];
  return random;
}

// ========== NEWS LIBRARY: 2025 Market Triggers ==========
const NEWS_LIBRARY = {
  ratespike11pct: {
    headline: 'Electricity rates up 11% nationally in 2025',
    fact: 'National average increase Jan-Aug 2025. Some states seeing 17%+ jumps.',
    date: 'November 2025',
    relevance: 'Creates urgency for early renewal timing',
    integrate: 'With rates up 11% nationally, teams that lock in early are protecting their budgets.'
  },
  
  rateapprovals34b: {
    headline: '$34B in rate hike approvals in 2025 alone',
    fact: '34 billion in rate increase requests approved in first 3 quarters of 2025 (vs. 16B in 2024)',
    date: 'September 2025',
    relevance: 'Creates urgency for consolidation and early planning',
    integrate: 'With 34B in rate hikes approved so far this year, consolidating energy agreements prevents being caught off-guard.'
  },
  
  datacenterdemand50pct: {
    headline: 'AI demand driving electricity rates up 50% (2023-2024)',
    fact: 'Data center energy demands drove rates up 50% in 18 months. Energy demand projected to grow 42% by 2035.',
    date: 'October 2025',
    relevance: 'Especially relevant for data centers, capacity-sensitive operations',
    integrate: 'Data center demand pushed rates up 50% in the last 18 months. If your facilities are capacity-sensitive, early review prevents rate shock.'
  },
  
  deregulationrisk: {
    headline: 'Deregulation volatility in Texas, PA, MD',
    fact: 'Texas deregulation saw rates spike 7x in early years. Long-term costs exceeded $24B; $5,100 per household.',
    date: 'November 2025',
    relevance: 'Especially relevant in deregulated markets',
    integrate: 'If you operate in a deregulated market like Texas, timing your renewal strategically is critical—deregulation often leads to rate volatility.'
  },
  
  renewablescompliance: {
    headline: 'Renewable energy priority #2 for executives (after AI)',
    fact: 'Corporate net-zero goals resuming after 2024 pause. Clean energy mandates tightening.',
    date: 'October 2025',
    relevance: 'Relevant for ESG-conscious companies',
    integrate: 'With renewable mandates tightening, companies are bundling rate locks with renewable credits—often seeing significant total savings.'
  }
};

// ========== ROLE-SPECIFIC CTA VARIATIONS ==========
const CTA_BY_ROLE = {
  operations: [
    'When does your current electricity contract expire?',
    'Are you locking in early, or waiting closer to expiration?',
    'With your production schedule, does contract timing usually sync with cash flow or market opportunity?'
  ],
  
  finance: [
    'With rates up 11%, are you locking in early or waiting?',
    'Are rising electricity costs affecting your 2025 budget planning?',
    'Would energy cost predictability help your financial forecasting?'
  ],
  
  ceo: [
    'Is energy contract renewal on your agenda for this quarter?',
    'Are market spikes affecting your profit margin on energy?',
    'When budgeting for energy, are you locking in costs or dealing with volatility?'
  ],
  
  procurement: [
    'Are you managing renewals centrally, or does each location handle independently?',
    'How many energy suppliers are you currently managing?',
    'When locations renew, do you shop around or just renew what you had?'
  ],
  
  facilities: [
    'How are you managing energy renewals across your facilities?',
    'Are you coordinating energy contracts for all your locations?',
    'When do your facilities typically renew energy contracts?'
  ],
  
  nonprofit_executive: [
    'How are you making sure more funding goes to your mission, not vendors?',
    'What if optimization could redirect $50K to programs annually?',
    'Is energy cost management part of your strategic cost-reduction plan?'
  ],
  
  nonprofit_finance: [
    'Is your nonprofit currently filing electricity exemption certificates?',
    'How much could exemption recovery impact your program funding?',
    'Would energy strategy optimization help you reallocate budget to programs?'
  ]
};

// Helper: Map news hook keys to NEWS_LIBRARY
function mapNewsHookKey(hookKey) {
  const mapping = {
    'rate_spike_national': 'ratespike11pct',
    'rate_spike_regional': 'ratespike11pct',
    'rate_approvals': 'rateapprovals34b',
    'datacenter_demand_spike': 'datacenterdemand50pct',
    'deregulation_risk': 'deregulationrisk',
    'renewables_compliance': 'renewablescompliance'
  };
  return mapping[hookKey] || hookKey;
}

// Helper: Build news context for prompt
function buildNewsContext(newsHooks, prospect, angle) {
  if (!newsHooks || newsHooks.length === 0) return '';
  
  const hookKey = mapNewsHookKey(newsHooks[0]);
  const hook = NEWS_LIBRARY[hookKey];
  if (!hook) return '';
  
  return `
CURRENT MARKET CONTEXT (integrate naturally if relevant):
- Headline: ${hook.headline}
- Fact: ${hook.fact}
- Date: ${hook.date}
- Relevance: ${prospect?.industry || 'their'} company considering ${angle?.primaryMessage || 'energy strategy'}
- Integration: Weave this naturally into the email if it strengthens the hook. Don't force it.
Example: "${hook.integrate}"
`;
}

// ========== ANGLE-SPECIFIC CTA MAPPINGS ==========
const CTA_BY_ANGLE = {
  exemption_recovery: [
    'Are you currently claiming electricity exemptions?',
    'Is your organization filing electricity exemption certificates?',
    'Have you filed for electricity sales tax exemptions yet?'
  ],
  timing_strategy: [
    'When does your current electricity contract expire?',
    'Are you locking in early, or waiting closer to expiration?',
    'When do you typically renew energy contracts—before peak season or waiting until the last minute?'
  ],
  consolidation: [
    'How many locations are you managing energy for?',
    'Are you managing renewals centrally, or does each location handle independently?',
    'How are you coordinating energy contracts across your locations?'
  ],
  demand_efficiency: [
    'Are you optimizing consumption before you renew your contract?',
    'Have you optimized consumption before negotiating rates?',
    'Are you managing consumption efficiency before rate shopping?'
  ],
  operational_efficiency: [
    'Are you optimizing operations before negotiating energy rates?',
    'How much time are you spending managing energy procurement?',
    'Are energy costs impacting your operational efficiency?'
  ],
  operational_simplicity: [
    'How much time are you spending managing energy renewals?',
    'Are you managing multiple energy suppliers or contracts?',
    'How many energy suppliers are you currently managing?'
  ],
  operational_continuity: [
    'What\'s more critical for your operations—energy savings or guaranteed uptime?',
    'Does energy cost predictability matter for your operational planning?',
    'Are you prioritizing cost savings or operational reliability?'
  ],
  cost_control: [
    'Are you locking in energy costs ahead of time, or dealing with rate volatility?',
    'Does energy cost predictability matter for your budget planning?',
    'Are you dealing with rate volatility or locking in costs?'
  ],
  mission_funding: [
    'How are you managing energy costs so more funding goes to your mission?',
    'What if energy optimization could redirect savings to programs?',
    'Is energy cost management part of your strategic cost-reduction plan?'
  ],
  budget_stability: [
    'When budgeting for energy, are you locking in costs or dealing with volatility?',
    'Does budget predictability matter for your financial planning?',
    'Are you dealing with energy cost volatility year to year?'
  ],
  data_governance: [
    'When you plan for energy, do you have unified metering?',
    'Do you have visibility into energy usage across your facilities?',
    'How are you tracking energy consumption and costs?'
  ]
};

// Helper: Get angle-specific CTA
function getAngleSpecificCTA(selectedAngle) {
  if (!selectedAngle || !selectedAngle.id) return null;
  
  const angleCTAs = CTA_BY_ANGLE[selectedAngle.id];
  if (angleCTAs && angleCTAs.length > 0) {
    return angleCTAs[Math.floor(Math.random() * angleCTAs.length)];
  }
  
  // Fallback: use openingTemplate as CTA if no specific mapping
  return selectedAngle.openingTemplate || null;
}

// Helper: Infer industry from company name
function inferIndustryFromCompanyName(companyName) {
  if (!companyName) return '';
  
  const name = String(companyName).toLowerCase();
  
  // Hospitality keywords
  if (/\b(inn|hotel|motel|resort|lodge|suites|hospitality|accommodation|bed\s*and\s*breakfast|b&b|b\s*&\s*b)\b/i.test(name)) {
    return 'Hospitality';
  }
  
  // Restaurant/Food Service
  if (/\b(restaurant|cafe|diner|bistro|grill|bar\s*&?\s*grill|tavern|pub|eatery|food\s*service)\b/i.test(name)) {
    return 'Hospitality';
  }
  
  // Manufacturing
  if (/\b(manufacturing|manufacturer|industrial|factory|plant|production|fabrication)\b/i.test(name)) {
    return 'Manufacturing';
  }
  
  // Healthcare
  if (/\b(hospital|clinic|medical|healthcare|health\s*care|physician|doctor|dental|pharmacy)\b/i.test(name)) {
    return 'Healthcare';
  }
  
  // Retail
  if (/\b(retail|store|shop|market|outlet|merchandise|boutique)\b/i.test(name)) {
    return 'Retail';
  }
  
  // Logistics/Transportation
  if (/\b(logistics|transportation|warehouse|shipping|freight|delivery|distribution|trucking)\b/i.test(name)) {
    return 'Logistics';
  }
  
  // Data Center
  if (/\b(data\s*center|datacenter|server|hosting|cloud|colo)\b/i.test(name)) {
    return 'DataCenter';
  }
  
  // Nonprofit
  if (/\b(nonprofit|non-profit|charity|foundation|501c3|501\(c\)\(3\))\b/i.test(name)) {
    return 'Nonprofit';
  }
  
  return '';
}

// Helper: Infer industry from account description
function inferIndustryFromDescription(description) {
  if (!description) return '';
  
  const desc = String(description).toLowerCase();
  
  // Hospitality
  if (/\b(hotel|inn|motel|resort|lodge|accommodation|hospitality|guest|room|booking|stay)\b/i.test(desc)) {
    return 'Hospitality';
  }
  
  // Restaurant/Food
  if (/\b(restaurant|cafe|dining|food|beverage|menu|cuisine|chef)\b/i.test(desc)) {
    return 'Hospitality';
  }
  
  // Manufacturing
  if (/\b(manufacturing|production|factory|plant|industrial|assembly|fabrication)\b/i.test(desc)) {
    return 'Manufacturing';
  }
  
  // Healthcare
  if (/\b(hospital|clinic|medical|healthcare|patient|treatment|diagnosis|surgery)\b/i.test(desc)) {
    return 'Healthcare';
  }
  
  // Retail
  if (/\b(retail|store|merchandise|shopping|customer|product|sale)\b/i.test(desc)) {
    return 'Retail';
  }
  
  // Logistics
  if (/\b(logistics|warehouse|shipping|distribution|freight|transportation|delivery)\b/i.test(desc)) {
    return 'Logistics';
  }
  
  // Data Center
  if (/\b(data\s*center|server|hosting|cloud|infrastructure|computing)\b/i.test(desc)) {
    return 'DataCenter';
  }
  
  // Nonprofit
  if (/\b(nonprofit|charity|foundation|mission|donation|volunteer)\b/i.test(desc)) {
    return 'Nonprofit';
  }
  
  return '';
}

// Helper: Get best CTA (angle-aware priority)
function getBestCTA(selectedAngle, role, industry, ctaPattern) {
  // Priority 1: Angle-specific CTA (if angle exists)
  if (selectedAngle) {
    const angleCTA = getAngleSpecificCTA(selectedAngle);
    if (angleCTA) {
      return angleCTA;
    }
  }
  
  // Priority 2: Role-specific CTA (if role matches and angle doesn't override)
  const roleCTA = getRoleSpecificCTA(role, industry);
  if (roleCTA) {
    return roleCTA;
  }
  
  // Priority 3: Pattern-based CTA
  if (ctaPattern && ctaPattern.template) {
    return ctaPattern.template;
  }
  
  // Priority 4: Angle openingTemplate as fallback
  if (selectedAngle && selectedAngle.openingTemplate) {
    return selectedAngle.openingTemplate;
  }
  
  // Ultimate fallback
  return 'When does your current electricity contract expire?';
}

// Helper: Get role-specific CTA
function getRoleSpecificCTA(role, industry = null) {
  if (!role) return CTA_BY_ROLE.operations?.[0] || 'When does your current contract renew?';
  
  // Normalize role - handle special characters and variations
  let normalizedRole = role.toLowerCase()
    .replace(/[\/&]/g, ' ')  // Replace / and & with spaces
    .replace(/\s+/g, ' ')    // Normalize multiple spaces
    .trim();
  
  // Check for nonprofit roles (must check first)
  if (normalizedRole.includes('nonprofit') || normalizedRole.includes('executive director')) {
    return CTA_BY_ROLE.nonprofit_executive?.[Math.floor(Math.random() * CTA_BY_ROLE.nonprofit_executive.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  if (normalizedRole.includes('nonprofit') && (normalizedRole.includes('finance') || normalizedRole.includes('cfo'))) {
    return CTA_BY_ROLE.nonprofit_finance?.[Math.floor(Math.random() * CTA_BY_ROLE.nonprofit_finance.length)] || 
           CTA_BY_ROLE.finance[0];
  }
  
  // Finance roles (comprehensive detection)
  const financeKeywords = [
    'cfo', 'chief financial officer', 'controller', 'director of finance', 
    'accounting manager', 'accounting', 'ap coordinator', 'ap ', 'accounts payable',
    'treasurer', 'business office manager', 'office manager', 'finance manager',
    'financial', 'bookkeeper', 'accountant'
  ];
  if (financeKeywords.some(keyword => normalizedRole.includes(keyword))) {
    return CTA_BY_ROLE.finance?.[Math.floor(Math.random() * CTA_BY_ROLE.finance.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  // Executive/CEO roles (comprehensive detection)
  const executiveKeywords = [
    'ceo', 'chief executive', 'president', 'owner', 'coo', 'chief operating officer',
    'general manager', 'gm', 'superintendent', 'director general',
    'managing director', 'executive director', 'vp ', 'vice president'
  ];
  if (executiveKeywords.some(keyword => normalizedRole.includes(keyword))) {
    return CTA_BY_ROLE.ceo?.[Math.floor(Math.random() * CTA_BY_ROLE.ceo.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  // Facilities roles (comprehensive detection)
  const facilitiesKeywords = [
    'facilities', 'facility', 'facilities administrator', 'facilities manager',
    'environmental health', 'ehs', 'safety', 'maintenance', 'maintenance manager',
    'plant manager', 'warehouse manager', 'building manager', 'property manager',
    'fulfillment', 'fulfillment facilities'
  ];
  if (facilitiesKeywords.some(keyword => normalizedRole.includes(keyword))) {
    return CTA_BY_ROLE.facilities?.[Math.floor(Math.random() * CTA_BY_ROLE.facilities.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  // Procurement roles
  const procurementKeywords = [
    'procurement', 'purchasing', 'buyer', 'sourcing', 'supply chain',
    'vendor management', 'supplier relations'
  ];
  if (procurementKeywords.some(keyword => normalizedRole.includes(keyword))) {
    return CTA_BY_ROLE.procurement?.[Math.floor(Math.random() * CTA_BY_ROLE.procurement.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  // Operations roles (catch-all for managers and coordinators)
  const operationsKeywords = [
    'operations', 'operational', 'production', 'plant', 'hr manager', 'human resources',
    'it manager', 'information technology', 'fulfillment', 'logistics', 'coordinator',
    'manager', 'director', 'supervisor', 'administrator'
  ];
  if (operationsKeywords.some(keyword => normalizedRole.includes(keyword))) {
    return CTA_BY_ROLE.operations?.[Math.floor(Math.random() * CTA_BY_ROLE.operations.length)] || 
           CTA_BY_ROLE.operations[0];
  }
  
  // Default to operations
  return CTA_BY_ROLE.operations?.[Math.floor(Math.random() * CTA_BY_ROLE.operations.length)] || 
         'When does your current contract renew?';
}

// Company research cache (session-level)
const companyResearchCache = new Map();
const linkedinResearchCache = new Map();
const websiteResearchCache = new Map();
const contactLinkedinCache = new Map();
const recentActivityCache = new Map();
const locationContextCache = new Map();

async function researchCompanyInfo(companyName, industry) {
  if (!companyName) return null;
  
  const cacheKey = `${companyName}_${industry}`;
  if (companyResearchCache.has(cacheKey)) {
    console.log(`[Research] Using cached info for ${companyName}`);
    return companyResearchCache.get(cacheKey);
  }
  
  try {
    const researchPrompt = `Research ${companyName}${industry ? ', a ' + industry + ' company' : ''}.
Provide a concise 2-paragraph description (2-3 sentences per paragraph) covering:
- What they do and business focus
- Facilities/operations, footprint, relevant energy context (usage intensity, locations, hours)
Keep it factual, specific, and useful for an energy cost discussion.`;
    
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

async function researchContactLinkedIn(linkedinUrl, contactName, companyName) {
  if (!linkedinUrl) {
    console.log(`[Contact LinkedIn] No LinkedIn URL for ${contactName}`);
    return null;
  }
  
  const cacheKey = linkedinUrl;
  if (contactLinkedinCache.has(cacheKey)) {
    console.log(`[Contact LinkedIn] Using cached data for ${contactName}`);
    return contactLinkedinCache.get(cacheKey);
  }
  
  try {
    const linkedinPrompt = `Research the LinkedIn personal profile at ${linkedinUrl} for ${contactName}${companyName ? ' at ' + companyName : ''}. Extract:
    - Current role and tenure in position (e.g., "3 years as General Manager")
    - Career background and recent moves
    - Recent posts or content that shows their priorities
    - Skills or endorsements relevant to energy/procurement
    - Any mutual connections (if possible)
    Provide a concise 2-3 sentence summary focusing on role tenure, recent activity, and professional context relevant to energy procurement discussions.`;
    
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
      console.error(`[Contact LinkedIn] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const contactData = data.choices?.[0]?.message?.content || null;
    
    if (contactData) {
      console.log(`[Contact LinkedIn] Found data for ${contactName}`);
      contactLinkedinCache.set(cacheKey, contactData);
    }
    
    return contactData;
  } catch (error) {
    console.error('[Contact LinkedIn] Research failed:', error);
    return null;
  }
}

async function researchRecentCompanyActivity(companyName, industry, city, state) {
  if (!companyName) return null;
  
  const cacheKey = `${companyName}_${industry || ''}_${city || ''}`;
  if (recentActivityCache.has(cacheKey)) {
    console.log(`[Recent Activity] Using cached data for ${companyName}`);
    return recentActivityCache.get(cacheKey);
  }
  
  try {
    const activityPrompt = `Research recent news, announcements, or activity for ${companyName}${industry ? ', a ' + industry + ' company' : ''}${city && state ? ' in ' + city + ', ' + state : ''}.
    Look for:
    - Recent expansion, new facilities, or growth announcements
    - Funding rounds, acquisitions, or major investments
    - Recent hires or leadership changes
    - Facility additions or operational changes
    - Industry news affecting their business
    - Regulatory changes in their market
    Focus on events from the past 6 months that would be relevant context for an energy procurement discussion.
    Provide a concise 2-3 sentence summary if you find recent activity, otherwise return null.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: activityPrompt }],
        max_tokens: 200,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      console.error(`[Recent Activity] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const activityData = data.choices?.[0]?.message?.content || null;
    
    // Only cache if we found actual activity
    if (activityData && !activityData.toLowerCase().includes('no recent') && !activityData.toLowerCase().includes('unable to find')) {
      console.log(`[Recent Activity] Found activity for ${companyName}`);
      recentActivityCache.set(cacheKey, activityData);
      return activityData;
    }
    
    return null;
  } catch (error) {
    console.error('[Recent Activity] Research failed:', error);
    return null;
  }
}

async function researchLocationContext(city, state, industry) {
  if (!city || !state) return null;
  
  const cacheKey = `${city}_${state}_${industry || ''}`;
  if (locationContextCache.has(cacheKey)) {
    console.log(`[Location Context] Using cached data for ${city}, ${state}`);
    return locationContextCache.get(cacheKey);
  }
  
  try {
    const locationPrompt = `Research energy market context for ${city}, ${state}${industry ? ' for ' + industry + ' companies' : ''}.
    Focus on:
    - Regional energy market trends and competitive landscape
    - Local supplier landscape and market dynamics
    - Regional rate trends or regulatory changes
    - Energy procurement patterns in this area
    Provide a concise 2-3 sentence summary focusing on what would be relevant for a business energy procurement discussion.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: locationPrompt }],
        max_tokens: 200,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      console.error(`[Location Context] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const locationData = data.choices?.[0]?.message?.content || null;
    
    if (locationData) {
      console.log(`[Location Context] Found data for ${city}, ${state}`);
      locationContextCache.set(cacheKey, locationData);
    }
    
    return locationData;
  } catch (error) {
    console.error('[Location Context] Research failed:', error);
    return null;
  }
}

// Lightweight sanitizer to remove brand-first phrasing and prefer first-person voice
function deSalesify(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
    .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
    .replace(/\bPower Choosers helps\b/gi, 'Most teams see')
    .replace(/\bPower Choosers can help\b/gi, 'Most teams see')
    .replace(/\bPower Choosers\b/gi, 'We');
}

// Remove citation brackets from text (e.g., [1], [2], [3])
function removeCitationBrackets(text) {
  if (!text) return text;
  return String(text)
    .replace(/\[\d+\]/g, '') // Remove [1], [2], [3], etc.
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
}

// Industry/size-aware post-processor to avoid generic "your industry" and inaccurate size references
function personalizeIndustryAndSize(text, { industry, companyName, sizeCategory, job }) {
  if (!text) return text;
  let out = String(text);

  // Replace generic "your industry" with specific industry when available
  if (industry && /your industry/i.test(out)) {
    out = out.replace(/your industry/gi, industry);
  }

  // Remove ALL size assumptions - "small company/business" can be insulting to business owners
  // Use neutral, empowering language regardless of actual size
  const neutralGroup = industry ? `companies in ${industry}` : 'companies like yours';
  
  // Aggressive removal of "small" language - assume nothing about company size
  // Replace with industry-based or role-based language
  const industryBased = industry ? `companies in ${industry}` : 'companies like yours';
  const roleBased = job ? `As ${job}` : (industry ? `As a ${industry} company` : 'As a company');
  
  out = out
    // Catch "as a small" patterns first (most common)
    .replace(/\bAs a small (?:company|business|firm|organization|operation)\b/gi, industry ? `As a ${industry} company` : 'As a company')
    .replace(/\bAs a small\b/gi, roleBased)
    .replace(/\bas a small (?:company|business|firm|organization|operation)\b/gi, industry ? `as a ${industry} company` : 'as a company')
    .replace(/\bas a small\b/gi, roleBased.toLowerCase())
    // CEO/role patterns
    .replace(/\bAs CEO of a small business\b/gi, 'As CEO')
    .replace(/\bAs CEO of your company\b/gi, 'As CEO')
    .replace(/\bAs President of a small (?:company|business)\b/gi, 'As President')
    .replace(/\bAs Director of a small (?:company|business)\b/gi, 'As Director')
    .replace(/\bAs Manager of a small (?:company|business)\b/gi, 'As Manager')
    // Generic "small company/business" patterns
    .replace(/\bof a small company\b/gi, '')
    .replace(/\bof a small business\b/gi, '')
    .replace(/\ba small company\b/gi, industryBased)
    .replace(/\ba small business\b/gi, industryBased)
    .replace(/\bsmall companies\b/gi, 'companies')
    .replace(/\bsmall businesses\b/gi, 'businesses')
    .replace(/\bfor a small company like yours\b/gi, `for ${neutralGroup}`)
    .replace(/\bfor small businesses like yours\b/gi, `for ${neutralGroup}`)
    .replace(/\bfor a small business like yours\b/gi, `for ${neutralGroup}`)
    .replace(/\bsmall businesses like yours\b/gi, neutralGroup)
    .replace(/\bsmall business like yours\b/gi, neutralGroup)
    .replace(/\bwith limited resources\b/gi, 'with operational efficiency in mind')
    .replace(/\blimited resources\b/gi, 'operational efficiency')
    .replace(/\bfor small business\b/gi, 'for businesses')
    .replace(/\bfor a small company\b/gi, 'for companies')
    .replace(/\bsmall business operators\b/gi, 'business operators')
    .replace(/\bsmall business owners\b/gi, 'business owners')
    .replace(/\boperators like you\b/gi, industry ? `operators in ${industry}` : 'operators')
    .replace(/\bespecially those with limited resources\b/gi, 'especially those focused on efficiency')
    // Additional catch-all patterns
    .replace(/\bsmall (?:company|business|firm|organization|operation)\b/gi, industry ? `${industry} company` : 'company')
    .replace(/\bsmaller (?:company|business|firm|organization|operation)\b/gi, industry ? `${industry} company` : 'company');

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
    const jobTitle = (recipient?.job || recipient?.title || recipient?.role || '').toLowerCase()
      .replace(/[\/&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Finance roles (comprehensive detection)
    const financeKeywords = [
      'cfo', 'chief financial officer', 'controller', 'director of finance', 
      'accounting manager', 'accounting', 'ap coordinator', 'ap ', 'accounts payable',
      'treasurer', 'business office manager', 'office manager', 'finance manager',
      'financial', 'bookkeeper', 'accountant'
    ];
    if (financeKeywords.some(keyword => jobTitle.includes(keyword))) {
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
          template: 'How do you typically evaluate energy suppliers when renewing?',
          guidance: 'ROI-focused question that assumes evaluation process'
        }
      ];
      return cfoPatterns[Math.floor(Math.random() * cfoPatterns.length)];
    }
    
    // Facilities roles (comprehensive detection)
    const facilitiesKeywords = [
      'facilities', 'facility', 'facilities administrator', 'facilities manager',
      'environmental health', 'ehs', 'safety', 'maintenance', 'maintenance manager',
      'plant manager', 'warehouse manager', 'building manager', 'property manager',
      'fulfillment', 'fulfillment facilities'
    ];
    if (facilitiesKeywords.some(keyword => jobTitle.includes(keyword))) {
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
          template: 'How do you currently evaluate energy suppliers when renewing?',
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
  const jobTitle = (recipient?.job || recipient?.title || recipient?.role || '').toLowerCase()
    .replace(/[\/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Finance roles (comprehensive detection)
  const financeKeywords = [
    'cfo', 'chief financial officer', 'controller', 'director of finance', 
    'accounting manager', 'accounting', 'ap coordinator', 'ap ', 'accounts payable',
    'treasurer', 'business office manager', 'office manager', 'finance manager',
    'financial', 'bookkeeper', 'accountant'
  ];
  if (financeKeywords.some(keyword => jobTitle.includes(keyword))) {
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
        template: 'How do you typically evaluate energy suppliers when renewing?',
        guidance: 'ROI-focused question that assumes evaluation process'
      }
    ];
    return cfoPatterns[Math.floor(Math.random() * cfoPatterns.length)];
  }
  
  // Facilities roles (comprehensive detection)
  const facilitiesKeywords = [
    'facilities', 'facility', 'facilities administrator', 'facilities manager',
    'environmental health', 'ehs', 'safety', 'maintenance', 'maintenance manager',
    'plant manager', 'warehouse manager', 'building manager', 'property manager',
    'fulfillment', 'fulfillment facilities'
  ];
  if (facilitiesKeywords.some(keyword => jobTitle.includes(keyword))) {
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
      prompt: 'Start with authentic voice + specific company observation. NO role intro, NO generic market statistics.',
      example: 'Been wondering—with your fabrication operations in Houston, early renewal timing tends to lock in better rates than last-minute scrambles. Best practice is renewing 6 months to 1 year in advance, though most companies wait until 30-60 days out or scramble at the last minute.',
      energyFocus: 'Contract renewal timing and specific operations'
    },
    {
      type: 'role_specific',
      prompt: 'Start with disarming opener + specific observation about their company. NO "As a [role]" pattern.',
      example: 'Let me ask you something—are you locking in early or waiting close to expiration? With your [specific operations], timing tends to matter more than squeezing a last-minute rate.',
      energyFocus: 'Role-specific challenges with authentic tone'
    },
    {
      type: 'timing_urgency',
      prompt: 'Open with authentic voice + timing observation. NO generic rate statistics.',
      example: 'Here\'s what I\'m seeing—best practice is renewing 6 months to 1 year in advance, though most companies in [industry] wait until 30-60 days out or scramble at the last minute. Waiting till the last minute usually means paying whatever the market demands.',
      energyFocus: 'Contract timing and early renewal benefits'
    },
    {
      type: 'budget_pressure',
      prompt: 'Lead with observation + budget context specific to their business.',
      example: 'Looking at your situation—when budgeting for energy, are you locking in costs or dealing with volatility? With [company details], predictability usually matters as much as the rate itself.',
      energyFocus: 'Budget predictability and cost management'
    },
    {
      type: 'compliance_risk',
      prompt: 'Reference specific compliance observation. NO corporate speak.',
      example: 'Question for you—is your [industry type] organization claiming electricity exemptions? A lot of facilities miss this, but the refund potential can be significant.',
      energyFocus: 'Tax exemptions and compliance opportunities'
    },
    {
      type: 'operational_efficiency',
      prompt: 'Focus on operational challenge with conversational tone.',
      example: 'From what I\'m hearing—how many facilities are you managing energy for? Consolidating renewals across locations usually saves more than negotiating each one separately.',
      energyFocus: 'Multi-site consolidation and operational efficiency'
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
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Follow-Up Call', 'Book Your Consultation', 'Let's Schedule Time to Talk')" }
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
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Free Assessment', 'Let's Continue the Conversation')" }
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
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Free Assessment', 'Let's Continue the Conversation')" }
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
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Free Assessment', 'Let's Continue the Conversation')" }
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
        value_proposition: { type: "string", description: "Observation-based value prop with specific measurable value (include percentages or dollar amounts). Use patterns like 'Most [role] see [specific #] when they [action]' - NOT 'We help' or 'We work with'" },
        social_proof_optional: { type: "string", description: "Brief credibility with real outcomes (optional, 1 sentence)" },
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule Your Free Assessment', 'Book a Consultation', 'Explore Your Savings Potential')" },
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
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Assessment')" }
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
        opening_paragraph: { type: "string", description: "Opening paragraph (2-3 sentences) based on the user's prompt. This should reflect what they typed in, not generic text. Use natural, conversational language that addresses their specific question or concern." },
        sections: { type: "array", items: { type: "string" }, description: "1-5 one-sentence content points" },
        list_header: { type: "string", description: "Header for sections list, e.g. 'How We Can Help:', 'Key Benefits:', 'Why This Matters:'" },
        cta_text: { type: "string", description: "Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Free Assessment', 'Let's Continue the Conversation')" }
      },
      required: ["subject", "greeting", "opening_paragraph", "sections", "list_header", "cta_text"],
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
  // Try to get industry segmentation from settings first (client-side settings passed via marketContext.meetingPreferences)
  // Note: This is called server-side, so we'll need to accept industrySegmentation as a parameter
  // For now, use hardcoded fallback that matches settings structure
  
  const industryMap = {
    manufacturing: {
      painPoints: ['production downtime', 'energy-intensive operations', 'equipment reliability'],
      avgSavings: '10-20%',
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

// Enhanced version that accepts industrySegmentation from settings
function getIndustrySpecificContentFromSettings(industry, industrySegmentation) {
  // Check if industrySegmentation is provided from settings
  if (industrySegmentation?.enabled && industrySegmentation?.rules) {
    const industryKey = industry?.toLowerCase() || '';
    
    // Try exact match first
    if (industrySegmentation.rules[industryKey]) {
      const rule = industrySegmentation.rules[industryKey];
      return {
        painPoints: rule.painPoints || [],
        avgSavings: rule.avgSavings || '10-20%',
        keyBenefit: rule.keyBenefit || 'cost savings',
        urgencyDrivers: rule.urgencyDrivers || [],
        language: `${rule.keyBenefit || 'cost savings'} for ${industry} companies`
      };
    }
    
    // Try partial match (e.g., "healthcare facilities" contains "healthcare")
    for (const [key, rule] of Object.entries(industrySegmentation.rules)) {
      if (industryKey.includes(key) || key.includes(industryKey)) {
        return {
          painPoints: rule.painPoints || [],
          avgSavings: rule.avgSavings || '10-20%',
          keyBenefit: rule.keyBenefit || 'cost savings',
          urgencyDrivers: rule.urgencyDrivers || [],
          language: `${rule.keyBenefit || 'cost savings'} for ${industry} companies`
        };
      }
    }
  }
  
  // Fallback to hardcoded values
  return getIndustrySpecificContent(industry);
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

async function buildSystemPrompt({ mode, recipient, to, prompt, senderName = 'Lewis Patterson', templateType, whoWeAre, selectedAngle = null, toneOpener = null }) {
  // Analyze manual prompt for enhanced context understanding
  const promptAnalysis = analyzeManualPrompt(prompt);
  
  // Extract recipient data
  const r = recipient || {};
  const name = r.fullName || r.full_name || r.name || '';
  const firstName = r.firstName || r.first_name || (name ? String(name).split(' ')[0] : '');
  const company = r.company || r.accountName || '';
  const job = r.title || r.job || r.role || '';
  const energy = r.energy || {};
  const transcript = (r.transcript || r.callTranscript || r.latestTranscript || '').toString().slice(0, 1000);
  const notes = [r.notes, r.account?.notes].filter(Boolean).join('\n').slice(0, 500);
  
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

  // Industry detection with fallbacks
  let industry = r.industry || r.account?.industry || '';
  
  // If no industry field, infer from company name
  if (!industry && company) {
    industry = inferIndustryFromCompanyName(company);
  }
  
  // If still no industry, try to infer from account description
  if (!industry && accountDescription) {
    industry = inferIndustryFromDescription(accountDescription);
  }

  // Enhanced research with all personalization data sources
  let researchData = null;
  let linkedinContext = null;
  let websiteContext = null;
  let contactLinkedinContext = null;
  let recentActivityContext = null;
  let locationContextData = null;

  // Get location data for context
  const city = r.account?.city || r.city || '';
  const state = r.account?.state || r.state || '';
  
  // Get contact LinkedIn URL for personal profile research
  const contactLinkedinUrl = r.linkedin || r.linkedinUrl || null;
  const contactFullName = firstName + (r.lastName || r.last_name ? ' ' + (r.lastName || r.last_name) : '');

  // Always run research in parallel for comprehensive personalization
  const researchPromises = [];
  
  // Company research (only if no description exists)
  if (!accountDescription && company) {
    console.log(`[Research] No description for ${company}, starting enhanced research...`);
    
    const linkedinUrl = r.account?.linkedin || r.account?.linkedinUrl || null;
    const domain = r.account?.domain || r.account?.website || null;
    
    researchPromises.push(
      researchCompanyInfo(company, industry).then(result => ({ type: 'company', data: result })),
      researchLinkedInCompany(linkedinUrl, company).then(result => ({ type: 'companyLinkedin', data: result })),
      scrapeCompanyWebsite(domain, company).then(result => ({ type: 'website', data: result }))
    );
  } else {
    // Still get company LinkedIn and website if we have URLs
    const linkedinUrl = r.account?.linkedin || r.account?.linkedinUrl || null;
    const domain = r.account?.domain || r.account?.website || null;
    if (linkedinUrl) {
      researchPromises.push(researchLinkedInCompany(linkedinUrl, company).then(result => ({ type: 'companyLinkedin', data: result })));
    }
    if (domain) {
      researchPromises.push(scrapeCompanyWebsite(domain, company).then(result => ({ type: 'website', data: result })));
    }
  }

  // Contact LinkedIn research (personal profile)
  if (contactLinkedinUrl && contactFullName) {
    researchPromises.push(
      researchContactLinkedIn(contactLinkedinUrl, contactFullName, company).then(result => ({ type: 'contactLinkedin', data: result }))
    );
  }

  // Recent company activity research
  if (company) {
    researchPromises.push(
      researchRecentCompanyActivity(company, industry, city, state).then(result => ({ type: 'recentActivity', data: result }))
    );
  }

  // Location context research
  if (city && state) {
    researchPromises.push(
      researchLocationContext(city, state, industry).then(result => ({ type: 'location', data: result }))
    );
  }

  // Run all research in parallel
  if (researchPromises.length > 0) {
    const results = await Promise.all(researchPromises);
    
    for (const { type, data } of results) {
      switch (type) {
        case 'company':
          if (data) {
            accountDescription = data;
            if (r.account?.id) {
              researchData = await saveAccountDescription(r.account.id, accountDescription);
            }
          }
          break;
        case 'companyLinkedin':
          linkedinContext = data;
          break;
        case 'website':
          websiteContext = data;
          break;
        case 'contactLinkedin':
          contactLinkedinContext = data;
          break;
        case 'recentActivity':
          recentActivityContext = data;
          break;
        case 'location':
          locationContextData = data;
          break;
      }
    }
  }

  // For prompt brevity, summarize to ~220 chars without destroying saved description
  if (accountDescription) {
    const trimmed = accountDescription.replace(/\s+/g, ' ').trim();
    accountDescription = trimmed.length > 220 ? trimmed.slice(0, 217) + '…' : trimmed;
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
  const ctaPattern = templateType === 'cold_email' ? getCTAPattern(recipient, null, templateType) : null;
  const openingStyle = templateType === 'cold_email' ? getOpeningStyle(recipient) : null;
  
  // Get role-specific context
  const roleContext = job ? getRoleSpecificLanguage(job) : null;
  
  // Determine role category for variant selection
  const roleCategory = !job ? 'default' :
                      /ceo|president|owner|founder|executive|chief/i.test(job) ? 'ceo' :
                      /finance|cfo|controller|accounting|treasurer/i.test(job) ? 'finance' :
                      /operations|facilities|logistics|maintenance|procurement/i.test(job) ? 'operations' :
                      'default';
  
  // Get email generation mode (random selection for variety)
  const generationMode = getRandomGenerationMode();
  const modeInstructions = EMAIL_GENERATION_MODES[generationMode];
  
  // Get subject line variant (for suggestions in prompt)
  const suggestedSubject = templateType === 'cold_email' ? 
    getRandomSubjectLine('cold-email', roleCategory, firstName, company) : null;
  
  // Get industry-specific content (no settings dependency - use defaults)
  const industryContent = industry ? getIndustrySpecificContentFromSettings(industry, null) : null;
  
  // Get company size context
  const companySizeContext = getCompanySizeContext(r.account || {});
  
  // Get contract urgency level
  const contractUrgency = getContractUrgencyLevel(energy.contractEnd);
  
  // Detect trigger events
  const triggerEvents = detectTriggerEvents(r.account || {}, recipient);
  
  // Get deep personalization
  const deepPersonalization = getDeepPersonalization(r.account || {}, recipient);
  
  // Extract tenure from contact LinkedIn if available
  let tenure = null;
  if (contactLinkedinContext) {
    const tenureMatch = contactLinkedinContext.match(/(\d+)\s+years?\s+(?:as|in|at|with)/i) || 
                       contactLinkedinContext.match(/tenure.*?(\d+)\s+years?/i);
    if (tenureMatch) {
      tenure = tenureMatch[1] + ' years';
    }
  }
  
  // Get operational details from account
  const employees = r.account?.employees || null;
  const squareFootage = r.account?.squareFootage || r.account?.square_footage || null;
  const occupancyPct = r.account?.occupancyPct || r.account?.occupancy_pct || null;
  const annualUsage = r.account?.annualUsage || r.account?.annualKilowattUsage || r.account?.annual_usage || null;
  
  const recipientContext = `
RECIPIENT INFORMATION:
- Name: ${firstName || 'there'} ${company ? 'at ' + company : ''}
${job ? '- Role: ' + job + ' (focus on ' + (roleContext?.language || 'business operations') + ')' : ''}
${tenure ? '- Tenure: ' + tenure + ' in current role (use naturally: "In your ' + tenure + ' as ' + job + '...")' : ''}
${r.seniority ? '- Seniority Level: ' + r.seniority : ''}
${r.department ? '- Department: ' + r.department : ''}
${industry ? '- Industry: ' + industry : ''}
${accountDescription ? '- Company Description: ' + accountDescription : ''}
${city && state ? '- Location: ' + city + ', ' + state : ''}

OPERATIONAL DETAILS:
${employees ? '- Facility Scale: ' + employees + ' employees' : ''}
${squareFootage ? '- Facility Size: ' + squareFootage.toLocaleString() + ' sq ft' : ''}
${occupancyPct ? '- Occupancy: ' + occupancyPct + '%' : ''}
${annualUsage ? '- Annual Usage: ' + annualUsage.toLocaleString() + ' kWh' : ''}

RESEARCH DATA:
${linkedinContext ? '- Company LinkedIn: ' + linkedinContext : ''}
${websiteContext ? '- Company Website: ' + websiteContext : ''}
${contactLinkedinContext ? '- Contact LinkedIn Profile: ' + contactLinkedinContext + ' (use for tenure, career background, recent posts)' : ''}
${recentActivityContext ? '- Recent Company Activity: ' + recentActivityContext + ' (reference naturally WITHOUT saying "I noticed" or "I saw"—just weave it into conversation)' : ''}
${locationContextData ? '- Regional Energy Market: ' + locationContextData + ' (use for location-specific context)' : ''}

ENERGY DATA:
${energy.supplier ? '- Current Supplier: ' + energy.supplier : ''}
${energy.currentRate ? '- Current Rate: ' + energy.currentRate + '/kWh' : ''}
${contractEndLabel ? '- Contract Ends: ' + contractEndLabel : ''}

HISTORICAL CONTEXT:
${transcript ? '- Call Notes: ' + transcript : ''}
${notes ? '- Additional Notes: ' + notes : ''}

INDUSTRY-SPECIFIC CONTEXT:
${industryContent ? '- Industry Focus: ' + industryContent.language + '\n- Key Pain Points: ' + industryContent.painPoints.join(', ') + '\n- Average Savings: ' + industryContent.avgSavings + '\n- Key Benefit: ' + industryContent.keyBenefit + '\n- Urgency Drivers: ' + industryContent.urgencyDrivers.join(', ') : ''}

COMPANY SIZE CONTEXT (USE FOR FOCUS/PROACH ONLY - NEVER SAY "SMALL COMPANY"):
- Focus Area: ${companySizeContext.focus}
- Pain Points: ${companySizeContext.painPoints.join(', ')}
- Approach: ${companySizeContext.approach}
- Language Style: ${companySizeContext.language}
CRITICAL: Use this context for understanding their needs, but ALWAYS phrase as industry-based: "As a ${industry || '[industry]'} company" or "companies in ${industry || '[industry]'}" - NEVER say "small company", "small business", or reference company size unless it's clearly a large enterprise.

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
${companySizeContext && companySizeContext.size === 'large' ? '- Size Context: "As a large ' + (industry || 'company') + ', ' + companySizeContext.focus + ' is key..."' : ''}
${companySizeContext && companySizeContext.size !== 'large' ? '- Industry Context: "As a ' + (industry || 'company') + ', ' + companySizeContext.focus + ' is key..." (NEVER say "small company" or "small business" - use industry instead)' : ''}
${contractUrgency ? '- Urgency Level: "With ' + contractUrgency.level + ' timing, ' + contractUrgency.focus + '..."' : ''}

ROLE-SPECIFIC OPENING HOOK EXAMPLES (USE AUTHENTIC TONE):
${job?.toLowerCase().includes('cfo') || job?.toLowerCase().includes('finance') ? '- CFO: "Question for you—does energy cost predictability matter for your budget planning? With ' + company + '\'s operations, locking in early usually gives CFOs more control than waiting..."' : ''}
${job?.toLowerCase().includes('facilities') || job?.toLowerCase().includes('maintenance') ? '- Facilities: "Let me ask you something—how are you handling energy renewals on top of everything else? Most facilities teams consolidate this to free up time for actual operations..."' : ''}
${job?.toLowerCase().includes('procurement') || job?.toLowerCase().includes('purchasing') ? '- Procurement: "Here\'s what I\'m seeing—best practice is renewing 6 months to 1 year in advance, though most procurement teams wait until 30-60 days out. Waiting usually means taking whatever the market offers..."' : ''}
${job?.toLowerCase().includes('operations') || job?.toLowerCase().includes('manager') ? '- Operations: "Looking at your situation—are rising energy costs affecting your operational budget? With ' + company + ', predictable costs usually matter as much as the actual rate..."' : ''}
${job?.toLowerCase().includes('president') || job?.toLowerCase().includes('ceo') ? '- Executive: "Been wondering—when budgeting for energy, are you locking in costs or dealing with volatility? Most CEOs I talk to prefer predictability over squeezing the lowest possible rate..."' : ''}
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
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation). Examples: "Schedule a Follow-Up Call", "Book Your Consultation", "Let's Schedule Time to Talk", "Schedule Your Free Assessment". Vary based on conversation context but always focus on scheduling.`,

      follow_up: `
TEMPLATE: Follow-Up with Value Props
Generate text for these fields:
- greeting: "Hello ${firstName},"
- progress_update: Brief status update on where things stand
- value_props: Array of 4-6 concise selling points (each 1 sentence)
- urgency_message: Market timing/urgency message (1-2 sentences)
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation). Examples: "Schedule a Consultation", "Book Your Free Assessment", "Let's Continue the Conversation". Vary based on conversation context but always focus on scheduling.`,

      energy_health: `
TEMPLATE: Energy Health Check Invitation
Generate text for these fields:
- greeting: "Hello ${firstName},"
- assessment_items: Array of 4-6 items we review (concise, 1 line each)
- contract_info: Reference to their contract end date ${contractEndLabel || 'soon'}
- benefits: What they'll learn from assessment (2-3 sentences)
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation). Examples: "Schedule Your Free Assessment", "Book Your Energy Health Check", "Schedule a Consultation". Vary based on conversation context but always focus on scheduling.`,

      proposal: `
TEMPLATE: Proposal Delivery
Generate text for these fields:
- greeting: "Hello ${firstName},"
- proposal_summary: Brief overview of proposal terms (2-3 sentences)
- pricing_highlight: Key pricing numbers/savings (1-2 sentences)
- timeline: Array of 3-5 implementation steps
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation). Examples: "Let's Discuss Your Proposal", "Schedule a Proposal Review", "Book Your Consultation". Vary based on conversation context but always focus on scheduling.`,

      cold_email: `
TEMPLATE: Cold Email Outreach (Authentic Tone - Lewis's Voice)

SENDER PROFILE:
- Name: ${senderName}
- Age: 29
- Background: African American business professional
- Tone: Conversational, direct, authentic (not corporate speak)
- Voice: Natural, disarming openers (not ChatGPT patterns)

${selectedAngle ? `
SELECTED ANGLE (PRIMARY FOCUS):
- Angle: ${selectedAngle.id}
- Message: ${selectedAngle.primaryMessage}
- Value: ${selectedAngle.primaryValue}
- Opening: ${selectedAngle.openingTemplate}
${selectedAngle.situationalContext ? `- Context: ${selectedAngle.situationalContext}` : ''}
${selectedAngle.newsHooks && selectedAngle.newsHooks.length > 0 ? buildNewsContext(selectedAngle.newsHooks, { industry, company: recipient?.company || company }, selectedAngle) : ''}
` : ''}

${toneOpener ? `TONE OPENER: ` + JSON.stringify(toneOpener) + ` (use this to start)` : ''}

Generate text for these fields:
- greeting: "Hi ${firstName},"
- opening_hook: ${toneOpener || 'Use authentic, natural opener'} ${selectedAngle ? selectedAngle.openingTemplate : 'Start with a direct question about their energy situation.'} ${accountDescription ? 'Context: ' + accountDescription.substring(0, 100) + '...' : 'Reference their industry challenges.'} Keep it conversational, 1-2 sentences MAX. 

INDUSTRY ADAPTATION: ${industry ? `The recipient is in ${industry} industry. ` : ''}Adapt your messaging to this specific industry's challenges and context. If the industry is not in the examples below, use your knowledge of that industry to craft relevant messaging. Examples:
  * Manufacturing: Production downtime, equipment reliability, energy-intensive operations
  * Healthcare: Budget constraints, regulatory compliance, patient care continuity
  * Retail: Multiple locations, unpredictable costs, seasonal demand
  * Hospitality: Guest comfort, operational costs, seasonal demand
  * Education: Facility maintenance, student safety, budget constraints
  * Logistics/Transportation: Multi-location operations, fuel costs, operational efficiency
  * Technology: Data center costs, uptime requirements, scalability
  * ${industry && !['Manufacturing', 'Healthcare', 'Retail', 'Hospitality', 'Education'].includes(industry) ? `* ${industry}: Use your knowledge of this industry's energy challenges and operational context` : ''}

IMPORTANT: ${company ? 'Reference ' + company + ' naturally. ' : ''}Keep it conversational, avoid over-specific details (no exact sq ft, employee counts, or contract rates). Focus on industry patterns and common challenges, not hyper-specific data. If the industry is unfamiliar, focus on universal business concerns: cost control, budget predictability, operational efficiency.

- value_proposition: OBSERVATION-BASED VALUE PROP (2-3 sentences). CRITICAL RULES:
  * LEAD WITH NUMBERS: Put percentages/savings at START of sentence, not buried mid-sentence
  * OBSERVATION PATTERN: "Most [role] I talk to see [specific #] when they [action]"
  * ACTION-FOCUSED: What they'd experience, not what we deliver
  * FORBIDDEN TRANSITIONS: NEVER use "That's why...", "The reality is...", "We help...", "We work with...", "This approach..."
  * USE INSTEAD: "Most [role] I talk to...", "Here's what typically happens...", "From what I'm seeing...", "Here's the thing..."
  * Example (GOOD): "Most facilities teams I talk to either plan 6-12 months ahead or scramble the last 30 days. The ones that plan usually lock in 8-15% better terms."
  * Example (GOOD): "12-20% consumption reductions happen from efficiency alone, before they talk to a new supplier. Here's why that matters: you renew from strength instead of scrambling."
  * Example (BAD): "That's why most companies we work with typically reduce consumption by 12-20% through targeted efficiency measures."
  * Example (BAD): "We help companies secure better rates and manage procurement. Clients typically save 10-20%."

- social_proof_optional: Brief credibility IF relevant (1 sentence, optional). Example: "Most ${industry || '[industry]'} companies see 10-20% savings." Keep it general, not hyper-specific.
${(() => {
  const bestCTA = getBestCTA(selectedAngle, recipient?.job || recipient?.title || recipient?.role || job || 'operations', industry, ctaPattern);
  const angleCTA = selectedAngle ? getAngleSpecificCTA(selectedAngle) : null;
  const roleCTA = getRoleSpecificCTA(recipient?.job || recipient?.title || recipient?.role || job || 'operations', industry);
  
  if (angleCTA && angleCTA === bestCTA) {
    return `- cta_text: "${bestCTA}" (ANGLE-SPECIFIC CTA - use this exact CTA related to ${selectedAngle.primaryMessage}). Keep under 15 words. MUST be complete sentence with proper ending punctuation. NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .).
- cta_type: Return "qualifying"`;
  } else if (roleCTA && roleCTA === bestCTA) {
    return `- cta_text: "${bestCTA}" (ROLE-SPECIFIC CTA - use this exact CTA). Keep under 15 words. MUST be complete sentence with proper ending punctuation. NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .).
- cta_type: Return "qualifying"`;
  } else {
    return `- cta_text: "${bestCTA}" (use this exact CTA${selectedAngle ? ' related to ' + selectedAngle.primaryMessage : ''}). Keep under 15 words. MUST be complete sentence with proper ending punctuation. NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .).
- cta_type: Return "qualifying"`;
  }
})()}

AUTHENTIC TONE REQUIREMENTS:
- Sound like ${senderName} (29, conversational, direct, no corporate speak)
${toneOpener ? `- REQUIRED OPENER: MUST use ` + JSON.stringify(toneOpener) + ` or similar natural variation to start the opening paragraph` : `- REQUIRED: Use natural, disarming openers like "Been wondering—", "Here's what I'm seeing—", "Question for you—", "Let me ask you something—"`}
- FORBIDDEN PHRASES (NEVER USE):
  ✗ "I noticed..." or "I saw..." (sounds like research)
  ✗ "I'm Lewis..." or "I am..." (bio introductions)
  ✗ "As [Role] of [Company]..." (corporate role intros)
  ✗ "I wanted to reach out..." (corporate speak)
  ✗ "Hope this email finds you well..." (generic greeting)
  ✗ "Out of curiosity—" or "Quick one—" (AI patterns)
  ✗ "15-25% rate increases" or "rates rising 15-25%" (generic statistics)
  ✗ "That's why..." (too academic, explanatory)
  ✗ "The reality is..." (statement-based, weak)
  ✗ "We help..." or "We work with..." (shifts focus from them to you)
  ✗ "This approach..." (too educational)
- REQUIRED: Natural, conversational language like "Here's what I'm seeing...", "Most teams I talk to...", "From what I'm hearing...", "Been wondering—", "Here's what typically happens..."
- Be specific but not creepy: Reference industry patterns, not exact employee counts or sq ft
${accountDescription ? '- Context available: Mention ' + accountDescription.substring(0, 80) + '... naturally WITHOUT saying "I noticed"' : ''}
${company ? '- Reference ' + company + ' by name naturally' : ''}

EMAIL RULES:
- 75-130 words total (keep it short)
- ONE clear CTA question ending with ? (ONLY ONE question mark in entire email)
${toneOpener ? `- REQUIRED: Start with ` + JSON.stringify(toneOpener) + ` or similar natural variation` : `- REQUIRED: Use authentic tone opener like "Been wondering—", "Here's what I'm seeing—", "Question for you—"`}
- OPENING PARAGRAPH: 1-2 sentences MAX. Remove explanatory text before value prop. Pattern: Opening question → Value prop → Proof
- PARAGRAPH 2 (VALUE PROP): 
  * Lead with NUMBERS at start of sentence (e.g., "12-20% consumption reductions happen..." NOT "Through optimization, companies reduce by 12-20%")
  * Use OBSERVATION-BASED transitions: "Most [role] I talk to...", "Here's what typically happens...", "From what I'm seeing..."
  * FORBIDDEN: "That's why...", "The reality is...", "We help...", "We work with...", "This approach..."
  * ACTION-FOCUSED: What they'd experience, not what we deliver
- FORBIDDEN: NO "I noticed...", NO "I'm Lewis...", NO "As [Role]...", NO "I wanted to reach out", NO "Hope this email finds you well"
- FORBIDDEN: NO "15-25% rate increases" or similar generic statistics
- NO company size mentions: NEVER say "small company" or "small business"
- Value prop must include specific numbers (e.g., "save 10-20%") with numbers at START of sentence
- Focus on ${selectedAngle ? selectedAngle.id + ' angle (' + selectedAngle.primaryMessage + ')' : 'industry challenges'}
- Complete sentences only, no incomplete phrases

GENERATION MODE: ${generationMode || 'balanced'}
${generationMode === 'consultative' ? '- Softer approach: "Been wondering—", "How do you typically..."' : ''}
${generationMode === 'direct' ? '- Direct approach: Use "${toneOpener}", get to the point quickly' : ''}
${generationMode === 'balanced' ? '- Balanced approach: Conversational but focused' : ''}

SUBJECT LINE RULES (CRITICAL - MUST BE SPECIFIC, NOT VAGUE):
${suggestedSubject ? `- SUGGESTED SUBJECT (use this pattern or similar): ` + JSON.stringify(suggestedSubject) : ''}
- Target: 4-6 words (specific questions get 30% higher open rates than vague statements)
- Maximum: 50 characters (ensures full display on mobile)
- MUST be specific to their role and timing aspect (contract renewal, rate lock timing, budget cycle)
- REQUIRED PATTERNS (use these, customize naturally):
  * "${firstName}, contract timing question" (specific, role-agnostic)
  * "${firstName}, rate lock timing question" (specific to rate procurement)
  * "${firstName}, budget question about energy renewal" (for Controllers/CFO)
  * "${firstName}, facility renewal timing question" (for Operations/Facilities)
  * "${company} contract renewal question" (company-specific)
  * "${company} energy renewal timing" (specific and actionable)
- FORBIDDEN VAGUE PATTERNS (DO NOT USE):
  * "thoughts on energy planning" (too vague)
  * "insight to ease costs" (too vague)
  * "thoughts on energy strategy" (too vague)
  * "${firstName}, thoughts on..." (permission-based, weak)
- Role-specific variations:
  * Controllers/CFO: "${firstName}, budget question about energy renewal timing"
  * Operations/Facilities: "${firstName}, facility renewal timing question"
  * CEOs/Owners: "${firstName}, contract timing question" or "${company} energy renewal timing"
- Focus on: contract renewal, rate lock timing, budget cycle, facility renewal
- Use question format when possible (increases curiosity)
- Include firstName or company name for personalization
- NO statistics or percentages in subject lines
- NO generic "thoughts on" or "insights" language
- Return the style you chose in subject_style field

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
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation). Examples: "Schedule a Consultation", "Book Your Assessment", "Schedule a Meeting". Vary based on conversation context but always focus on scheduling. Note: Even for invoice requests, the CTA should be about scheduling a follow-up meeting.`,

      general: `
TEMPLATE: General Purpose Email (Manual Input)
Generate text for these fields:
- greeting: "Hello ${firstName}," or "Hi ${firstName},"
- opening_paragraph: CRITICAL - This MUST be based on the user's specific prompt. Read what they typed and create a natural, conversational opening paragraph (2-3 sentences) that directly addresses their question or concern. DO NOT use generic text like "I wanted to reach out about an interesting opportunity." Instead, use their actual words and context. For example, if they mention "rates went down in October but now creeping back up," start with something like "Sean, rates dipped in October but they're climbing again now..." - Reference the situation naturally WITHOUT saying "I noticed" - Use their specific details, numbers, and concerns from the prompt.
- sections: Array of 2-5 content points - EACH MUST BE EXACTLY ONE SENTENCE (no multi-sentence items)
- list_header: Choose a contextual header for the list section based on email content (e.g., "How We Can Help:", "Key Benefits:", "Why This Matters:", "What to Expect:", "Our Approach:")
- cta_text: Call-to-action button text for scheduling (flexible wording but must be about scheduling a meeting/consultation, e.g., 'Schedule a Consultation', 'Book Your Free Assessment', 'Let's Schedule Time to Talk'). Vary the wording based on the conversation context but always focus on scheduling.
${dynamicFields.length > 0 ? `
DYNAMIC FIELDS (include if relevant):
${dynamicFields.map(field => `- ${field.name}: ${field.description}`).join('\n')}
` : ''}

CRITICAL RULES:
- opening_paragraph MUST reflect the user's actual prompt, not generic text
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

  // Check if this is an out-of-office reply first
  const isOutOfOffice = /out of(?:[ -]the)?[ -]office|ooo|away from|be back|returning/i.test(String(prompt || '')) ||
                       /won'?t be (?:in|available)|will be unavailable/i.test(String(prompt || ''));

  if (isOutOfOffice) {
    const oooRules = `
OUT-OF-OFFICE AUTO-REPLY DETECTED:

CRITICAL RULES:
- This is an automated absence notification, NOT a sales opportunity
- Generate a brief, courteous acknowledgment ONLY
- NO sales pitch, NO energy services, NO value propositions
- Keep total response under 40 words
- Acknowledge their absence and return date
- Express intention to reconnect when they're back
- Use warm, casual tone

OUTPUT FORMAT (JSON):
{
  "subject": "Re: [their subject]",
  "greeting": "Hi ${firstName || 'there'},",
  "paragraph1": "[Brief acknowledgment - 1 sentence]",
  "paragraph2": "[Thank them and note their return date - 1 sentence]",
  "paragraph3": "[Simple 'talk soon' closing - 1 sentence]",
  "closing": "Best regards,\\n${senderName ? senderName.split(' ')[0] : 'Lewis'}"
}

FORBIDDEN:
❌ NO "15-25% rate increases"
❌ NO "electricity costs"
❌ NO "energy solutions"
❌ NO questions about contracts
❌ NO sales language whatsoever

EXAMPLE TONE:
"Thanks for the heads up! Enjoy your time off, and I'll catch up with you when you're back in the office."

CRITICAL: Return ONLY valid JSON with brief, friendly acknowledgment. No business discussion.`;

    return { 
      prompt: oooRules,
      researchData: null,
      openingStyle: null
    };
  }

  // Standard text mode (existing logic)
  const identity = whoWeAre || `You are ${senderName}, an Energy Strategist at Power Choosers. You help businesses secure better electricity rates and manage energy procurement more effectively. Write in first person ("we"/"I"). Do NOT use brand-first openers like "At Power Choosers," or "Power Choosers helps" — prefer observation-based language like "Most teams I talk to..." or "Here's what I'm seeing..." instead of "We help" or "I help".

${selectedAngle ? `
SELECTED ANGLE FOR THIS EMAIL:
- Focus: ${selectedAngle.primaryMessage}
- Value: ${selectedAngle.primaryValue}
- Opening Template: ${selectedAngle.openingTemplate}
` : ''}

${toneOpener ? `TONE: Start with ` + JSON.stringify(toneOpener) + ` or similar authentic, natural opener
` : ''}

CONTEXT USAGE RULES:
${contractEndLabel ? '- The recipient\'s contract ends ' + contractEndLabel + ' - reference this naturally' : ''}
${notes || transcript ? '- Use call notes/transcript to add specific context from your conversation' : ''}
${job ? '- Acknowledge their role as ' + job : ''}
- Personalize based on their industry and current situation
- Make it feel like you just spoke with them`;

  const outputFormat = `
OUTPUT FORMAT (JSON):
{
  "subject": "[Your subject line]",
  "greeting": "Hi ${firstName || 'there'},",
  "paragraph1": "[Opening paragraph with context - 2-3 sentences]",
  "paragraph2": "[Main message paragraph - 3-4 sentences about value and next steps]",
  "paragraph3": "[Call to action paragraph - clear question or request]",
  "closing": "Best regards,\\n${senderName ? senderName.split(' ')[0] : 'Lewis'}"
}

CRITICAL: Return ONLY valid JSON. Each paragraph should be a separate field. Do not include any text outside the JSON structure.
IMPORTANT: The closing field must include a newline between "Best regards," and the sender name (e.g., "Best regards,\\nLewis").`;

  // Check if this is a cold email in standard mode
  const isColdEmailStandard = /cold.*email|could.*not.*reach/i.test(String(prompt || ''));
  
  if (isColdEmailStandard) {
    const ctaPattern = getCTAPattern(recipient, null, 'cold_email');
    
    const coldEmailRules = `
EMAIL TYPE: Cold Email (Never Spoke Before)

${selectedAngle ? `
SELECTED ANGLE (PRIMARY FOCUS - USE THIS):
- Angle: ${selectedAngle.id}
- Primary Message: ${selectedAngle.primaryMessage}
- Value Proposition: ${selectedAngle.primaryValue}
- Opening Template: ${selectedAngle.openingTemplate}
${selectedAngle.situationalContext ? `- Context: ${selectedAngle.situationalContext}` : ''}
${selectedAngle.newsHooks && selectedAngle.newsHooks.length > 0 ? buildNewsContext(selectedAngle.newsHooks, { industry, company }, selectedAngle) : ''}
` : ''}

${toneOpener ? `AUTHENTIC TONE OPENER: ` + JSON.stringify(toneOpener) + ` (MUST use this to start the opening paragraph)` : ''}

GREETING (MANDATORY - MUST BE FIRST LINE):
✓ Start with "Hi ${firstName || 'there'},"
✓ NEVER skip the greeting
✓ NEVER start with company name or industry information
✓ Greeting must be on its own line with blank line after

CRITICAL QUALITY RULES:
- AUTHENTIC OPENING: ${toneOpener ? `MUST start with ` + JSON.stringify(toneOpener) : 'Use authentic, conversational opener'} + ${selectedAngle ? selectedAngle.openingTemplate : 'direct question about their energy situation'}
  - FORBIDDEN OPENING PATTERNS (NEVER USE THESE):
    ✗ "I noticed..." (sounds like research, not authentic)
    ✗ "I'm Lewis, an Energy Strategist..." (corporate bio intro)
    ✗ "I am..." or "My name is..." (introductions)
    ✗ "As [Role] of [Company]..." (corporate role intro)
    ✗ "As [Role], you understand..." (corporate role assumption)
    ✗ "I wanted to reach out..." (corporate speak)
    ✗ "Hope this email finds you well..." (generic greeting)
    ✗ "Out of curiosity—" or "Quick one—" (AI patterns)
  - REQUIRED: ${toneOpener ? `MUST start with ` + JSON.stringify(toneOpener) + ` or similar natural variation (e.g., "Been wondering—", "Here's what I'm seeing—", "Question for you—", "Let me ask you something—")` : `Use authentic, conversational opener like "Been wondering—", "Here's what I'm seeing—", "Question for you—", "Let me ask you something—"`}
  - DO NOT use generic market statistics like "rates rising 15-25%" or "15-25% rate increases" (NEVER mention these percentages)
  - DO NOT mention "data center demand" or generic rate increases
  - Focus ONLY on ${company}'s specific situation, industry challenges they face, or operational details
  - INDUSTRY ADAPTATION: ${industry ? `The recipient is in ${industry} industry. ` : ''}Adapt your messaging to this specific industry's challenges. If the industry is unfamiliar, use your knowledge of that industry or focus on universal business concerns: cost control, budget predictability, operational efficiency.
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- NUMBER PLACEMENT: LEAD WITH NUMBERS at start of sentence (e.g., "12-20% consumption reductions happen..." NOT "Through optimization, companies reduce by 12-20%")
- MEASURABLE CLAIMS: "save 10-20%" or "$X annually" NOT "significant savings"
- VALUE PROP TONE: Use OBSERVATION-BASED patterns ("Most [role] I talk to see [specific #] when they [action]") NOT explanatory ("That's why...", "We help...", "This approach...")
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: ${accountDescription ? 'Must naturally reference: "' + accountDescription + '"' : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- NO SIZE ASSUMPTIONS: NEVER use "small company", "small business", "as a small company", "as a small business", "limited resources" - these can insult business owners. Use role/industry focus instead: Reference their role naturally (e.g., "For CFOs like you...") or "As a ${industry} company", "companies in ${industry}". NEVER use "As [Role] of [Company]..." - that's corporate speak. Only use "large" if you have clear evidence it's a large enterprise.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
  - CRITICAL: Only ONE question mark (?) in the entire email - the CTA question
  - DO NOT ask multiple questions like "When does your contract expire, and are rising costs affecting your budget?"
  - DO NOT combine questions with "and" or "or" - pick ONE question only
  - Examples of SINGLE CTAs:
    ✓ "When does your current electricity contract expire?"
    ✓ "Are you locking in early or waiting closer to expiration?"
    ✗ "When does your contract expire, and how do you handle renewals?" (TWO questions)
    ✗ "When does your contract expire? Are rising costs affecting your budget?" (TWO questions)
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

HUMAN TOUCH REQUIREMENTS (CRITICAL - Write Like an Expert Human, Not AI):
- Write like a 29-year-old business professional - conversational, direct, authentic
- ${toneOpener ? `MUST start with ` + JSON.stringify(toneOpener) : `Use authentic, conversational opener`}
- Focus on THEIR specific situation only
- ${selectedAngle ? `Focus on: ${selectedAngle.primaryMessage}` : 'Focus on their energy situation'}
- Use natural, conversational language: ${toneOpener ? JSON.stringify(toneOpener) : `"Let me ask you something—"`} followed by ${selectedAngle ? selectedAngle.openingTemplate : 'a direct question'}
- Reference context naturally WITHOUT saying "I noticed" or "I saw":
  * ${accountDescription ? 'Reference: "' + accountDescription.substring(0, 80) + '..." naturally in conversation' : 'Reference their business type naturally'}
  * ${recentActivityContext ? 'Mention: ' + recentActivityContext.substring(0, 60) + '... naturally' : 'Reference industry trends naturally'}
  * ${contractEndLabel ? 'Use: "With your contract ending ' + contractEndLabel + '..." naturally' : 'Reference their energy situation naturally'}
- Use natural transitions: "Here's the thing...", "Given that...", "Most teams I talk to...", "Here's what typically happens..."
- FORBIDDEN TRANSITIONS: NEVER use "That's why..." (too academic), "The reality is..." (statement-based, weak)
- Vary sentence length: Mix short punchy statements with longer explanatory ones
- Use conversational connectors: "Here's what I'm seeing...", "Most teams I talk to...", "From what I'm hearing...", "Here's what typically happens..."
- Avoid AI patterns: NO "I wanted to reach out", "Hope this email finds you well", "I noticed...", "I've been tracking..." or other template phrases
- DO NOT mention generic market statistics - focus on their specific situation
- Sound like a peer who knows their industry, not a researcher
${tenure ? '- Use tenure naturally: "In your ' + tenure + ' as ' + job + ', you\'ve likely seen..." (tenure available)' : ''}

EVIDENCE OF RESEARCH (Show You Know Their Business - Reference Naturally, NOT "I noticed"):
${accountDescription ? '✓ Use account description: Reference "' + accountDescription.substring(0, 100) + '..." naturally in conversation' : ''}
${linkedinContext ? '✓ Use company LinkedIn: Reference recent company posts or announcements naturally' : ''}
${websiteContext ? '✓ Use website info: Reference naturally WITHOUT saying "I noticed" or "I saw"' : ''}
${recentActivityContext ? '✓ Use recent activity: Reference ' + recentActivityContext.substring(0, 60) + '... naturally' : ''}
${locationContextData ? '✓ Use location context: "Given ' + (city || '[location]') + '\'s energy market..." naturally' : ''}
${squareFootage ? '✓ Use facility size: Reference ' + squareFootage.toLocaleString() + ' sq ft facility when relevant (but avoid exact numbers in opening)' : ''}
${employees ? '✓ Use scale: Reference ' + employees + ' employees when relevant (but avoid exact numbers in opening)' : ''}
CRITICAL: Reference this data naturally in conversation - DO NOT say "I noticed" or "I saw" - just weave it into the conversation naturally

CONVERSATIONAL FLOW PATTERNS:
${toneOpener ? `✓ GOOD: ` + JSON.stringify(toneOpener) + `${selectedAngle ? ' ' + selectedAngle.openingTemplate : ' [direct question about their energy situation]'}` : `✓ GOOD: "Let me ask you something—[direct question about their energy situation]"`}
✓ GOOD: "${toneOpener || 'Here\'s what I\'m seeing'}—${company} operates in ${industry || '[industry]'}. Energy costs for facilities like yours often..."
✓ GOOD: "Given your role as ${job || '[role]'}, you're probably dealing with ${roleContext?.painPoints[0] || '[pain point]'}. ${selectedAngle ? selectedAngle.primaryMessage : 'Here\'s what I\'ve found...'}"
✓ GOOD: "${industry || '[Industry]'} companies are facing [specific challenge]. ${company || '[Company]'} likely sees this in..."
✓ GOOD: "Companies in ${industry || '[industry]'}" (not "your industry")
✗ BAD: "I noticed..." (sounds like research, not authentic)
✗ BAD: "I wanted to reach out about..." (corporate speak)
✗ BAD: "I hope this email finds you well..." (corporate speak)
✗ BAD: "I'm reaching out because..." (corporate speak)

PARAGRAPH STRUCTURE (CRITICAL):
Paragraph 1 (Opening Hook - 1-2 sentences MAX):
${toneOpener ? `- MUST start with: ` + JSON.stringify(toneOpener) : `- Use authentic, conversational opener`}
${selectedAngle ? `- Focus on: ${selectedAngle.primaryMessage}` : '- Focus on their energy situation'}
${selectedAngle ? `- Use opening template: ${selectedAngle.openingTemplate}` : '- Start with a direct question about their energy situation'}
- Reference ${company} specifically
- NO "I noticed..." or "I saw..." (sounds like research)
- NO generic market statistics (rates rising 15-25%, data center demand)
- NO corporate speak ("I wanted to reach out", "Hope this email finds you well")
- REMOVE explanatory text before value prop - jump to value prop after opening question
- Keep it conversational and human

Paragraph 2 (Value Proposition - 2-3 sentences):
- LEAD WITH NUMBERS: Put percentages/savings at START of sentence (e.g., "12-20% consumption reductions happen..." NOT "Through optimization, companies reduce by 12-20%")
- OBSERVATION-BASED: "Most [role] I talk to see [specific #] when they [action]"
- FORBIDDEN: "That's why...", "The reality is...", "We help...", "We work with...", "This approach..."
- USE INSTEAD: "Most [role] I talk to...", "Here's what typically happens...", "From what I'm seeing...", "Here's the thing..."
- ACTION-FOCUSED: What they'd experience, not what we deliver
- SPECIFIC measurable value: "save 10-20%", "reduce costs by $X" (with numbers at START of sentence)

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
${toneOpener ? `MUST START with: ` + JSON.stringify(toneOpener) : `Use authentic, natural opener (not "I wanted to reach out" or "Hope this email finds you well")`}
${selectedAngle ? `Focus on: ${selectedAngle.primaryMessage}` : 'Focus on their energy situation'}
${selectedAngle ? `Opening template: ${selectedAngle.openingTemplate}` : 'Start with a direct question about their energy situation'}
${accountDescription ? `Context available: ${accountDescription.substring(0, 100)}...` : 'Reference their industry challenges'}
CRITICAL: 
- NO "I noticed..." bio openings (sounds like research, not authentic)
- NO generic market statistics ("rates rising 15-25%", "data center demand")
- NO corporate speak ("I wanted to reach out", "Hope this email finds you well")
- Use ${toneOpener || 'authentic, conversational opener'} + ${selectedAngle ? selectedAngle.openingTemplate : 'direct question about their situation'}
- Reference ${company} specifically, not other companies
- Keep it conversational and human (like a 29-year-old business professional)

VALUE PROPOSITION (1-2 sentences MINIMUM):
${selectedAngle ? `PRIMARY FOCUS: ${selectedAngle.primaryValue}` : 'Observation-based value prop with SPECIFIC MEASURABLE VALUE (e.g., "Most [role] see [specific #] when they [action]")'}
${selectedAngle?.id === 'timing_strategy' && selectedAngle?.situationalContext ? `- TIMING CONTEXT: ${selectedAngle.situationalContext} (reference this when explaining value)` : ''}
- MUST include: (1) Observation-based pattern, (2) Concrete numbers at START: "10-20% savings happen when...", "Most teams see $X", "12-20% reductions occur..."
${selectedAngle ? `- Use angle value: ${selectedAngle.primaryValue}` : '- Reference their business type and industry challenges'}
- Example (GOOD): ${selectedAngle?.id === 'timing_strategy' ? `"Most facilities teams I talk to either plan 6-12 months ahead or scramble the last 30 days. The ones that plan usually lock in 8-15% better terms."` : (selectedAngle?.id === 'demand_efficiency' ? `"12-20% consumption reductions happen from efficiency alone, before they talk to a new supplier. Here's why that matters: you renew from strength instead of scrambling."` : (selectedAngle ? `"Most [role] I talk to see ${selectedAngle.primaryValue} when they [action]."` : '"Most companies here see 10-20% savings when they lock in rates early, before contracts expire."'))}
- Example (BAD): "That's why most companies we work with typically reduce consumption by 12-20% through targeted efficiency measures."
- Example (BAD): "We help companies secure better rates and manage procurement. Clients typically save 10-20%."
- NEVER end with incomplete phrases or "within [company name]"
- ALWAYS include a complete value proposition - never skip this field
- THIS FIELD IS MANDATORY - NEVER LEAVE BLANK

CTA (ASSERTIVE, NOT PERMISSION-BASED):
${(() => {
  const bestCTA = getBestCTA(selectedAngle, recipient?.job || recipient?.title || recipient?.role || job || 'operations', industry, ctaPattern);
  const angleCTA = selectedAngle ? getAngleSpecificCTA(selectedAngle) : null;
  const roleCTA = getRoleSpecificCTA(recipient?.job || recipient?.title || recipient?.role || job || 'operations', industry);
  
  if (angleCTA && angleCTA === bestCTA) {
    return `ANGLE-SPECIFIC CTA (HIGHEST PRIORITY - USE THIS): "${bestCTA}" - This CTA directly relates to ${selectedAngle.primaryMessage}`;
  } else if (roleCTA && roleCTA === bestCTA) {
    return `ROLE-SPECIFIC CTA (USE THIS): "${bestCTA}"`;
  } else if (selectedAngle) {
    return `ANGLE-RELATED CTA: "${bestCTA}" - This CTA relates to ${selectedAngle.primaryMessage}`;
  } else {
    return `CTA: "${bestCTA}"`;
  }
})()}
- CRITICAL: Generate EXACTLY ONE question. The CTA MUST relate to the email body and selected angle.
${(() => {
  const bestCTA = getBestCTA(selectedAngle, recipient?.job || recipient?.title || recipient?.role || job || 'operations', industry, ctaPattern);
  const angleCTA = selectedAngle ? getAngleSpecificCTA(selectedAngle) : null;
  
  if (angleCTA && angleCTA === bestCTA) {
    return `- PRIMARY CTA: "${bestCTA}" (matches ${selectedAngle.primaryMessage} angle)`;
  } else if (selectedAngle) {
    return `- ANGLE-SPECIFIC OPTIONS (relate to ${selectedAngle.primaryMessage}): ${selectedAngle.openingTemplate} or adapt this as your CTA question`;
  } else {
    return `- PRIMARY CTA: "${bestCTA}"`;
  }
})()}
- ASSERTIVE PATTERNS (pick ONE only - use role-specific CTA above if available):
  * "When does your current contract renew?"
  * "Are you locking in early or waiting close to expiration?"
  * "When you renew, do you shop around or just renew what you had?"
  * "What's your renewal timeline?"
  * "Does energy cost predictability matter for your budget planning?" (for finance roles)
- FORBIDDEN PERMISSION-BASED PATTERNS (DO NOT USE):
  * "Would you be open to a conversation?" (asking permission, weak)
  * "Are you interested in learning more?" (permission-based)
  * "Would you like to schedule a call?" (meeting request too early)
  * "Open to discussing your energy setup?" (permission-based)
- MUST: Assume the conversation is happening - don't ask for permission to talk
- YES: Ask specific question about their contract, timing, or process
- Role-specific CTAs (choose ONE):
  * Finance roles (CFO, Controller): Focus on predictability, budget cycles, timing
  * Operations roles: Focus on renewal timing, early lock-in, facility operations
  * Executive roles: Focus on contract timing, strategic planning
- Keep under 15 words
- Complete sentence with proper punctuation (? or .)
- MUST be complete sentence with proper ending punctuation
- NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .)
- Generate ONLY ONE CTA - no second questions, no follow-up questions

EMAIL GENERATION MODE: ${generationMode.toUpperCase()}
${modeInstructions ? `
Tone: ${modeInstructions.tone}
Approach: ${modeInstructions.approach}
CTA Style: ${modeInstructions.ctaStyle}
${generationMode === 'consultative' ? `
* Use discovery questions: "I'm curious..." "How do you typically..." "What matters more to you..."
* Lower pressure approach - understand their situation first` : ''}
${generationMode === 'direct' ? `
* Lead with specific insights: "Here's what I found..." "Most teams I talk to..." "Let me ask you something—"
* Assertive but respectful - present facts and ask direct questions` : ''}
${generationMode === 'balanced' ? `
* Combine observation + value: Reference their situation naturally, then "Here's what I'm seeing..."
* Professional but conversational - show expertise without being pushy` : ''}
` : ''}

SUBJECT LINE (MUST BE SPECIFIC, NOT VAGUE):
${suggestedSubject ? `SUGGESTED SUBJECT: ` + JSON.stringify(suggestedSubject) + ` (use this pattern or similar)` : ''}
- Under 50 characters
- MUST be specific to their role and timing aspect (contract renewal, rate lock timing, budget cycle)
- REQUIRED PATTERNS (use these):
  * "${firstName}, contract timing question" (specific)
  * "${firstName}, rate lock timing question" (specific)
  * "${firstName}, budget question about energy renewal" (for Controllers/CFO)
  * "${company} contract renewal question" (company-specific)
- FORBIDDEN: "thoughts on energy planning", "insight to ease costs", "${firstName}, thoughts on..."
- NO numbers or percentages
- Role-specific: Controllers/CFO = "budget question", Operations = "facility renewal timing"

TOTAL LENGTH: 100-130 words (scannable, not overwhelming - 2-3 short paragraphs)
CTA LENGTH: 8-15 words maximum, must be complete and assertive
TONE: Write like a 29-year-old Texas business pro - conversational, confident, direct, peer-to-peer
- Use contractions: "we're," "don't," "it's," "you're," "I'm"
- Vary sentence length: Short. Medium sentence. Longer explanation when needed.
- AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "unleash," "synergy"
- Sound like: colleague who knows their industry and has talked to others like them
- Use casual confidence: "Let me ask you something—" "Question for you—" "Been wondering—"
`;

    return { 
      prompt: [identity, recipientContext, coldEmailRules, outputFormat].join('\n\n'),
      researchData: researchData,
      openingStyle: selectedAngle?.id || null
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
✓ Reference company-specific observation or timing, NEVER generic rate statistics
✓ NO generic market statistics — use accountDescription and company context only
✓ CTA: Use EXACTLY ONE qualifying question (pick ONE: "When does your contract expire?" OR "Are rising costs affecting your budget?" — not both)
✓ Subject line: Under 50 chars, include ${firstName || 'recipient name'}
✓ Closing: "Best regards," on its own line, followed by sender name on next line
✓ DO NOT include citation markers like [1], [2], [3]

PARAGRAPH STRUCTURE (CRITICAL):
✓ Paragraph 1: Greeting line - "Hi ${firstName || 'there'},"
✓ Paragraph 2: Opening context (2-3 sentences) 
✓ Paragraph 3: Main message and value proposition (3-4 sentences)
✓ Paragraph 4: Call to action (1 sentence only — EXACTLY ONE question, must end with ?)
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

    const { prompt, mode = 'standard', recipient = null, to = '', fromEmail = '', senderName = 'Lewis Patterson', whoWeAre, selectedAngle = null, toneOpener = null } = req.body || {};
    
    console.log('[Perplexity] Received angle:', selectedAngle?.id, '| Tone:', toneOpener);
    
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
    
    const meetingTimes = getSuggestedMeetingTimes(null);
    
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
    
    const { prompt: systemPrompt, researchData, openingStyle: openingStyleUsed, dynamicFields } = await buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType, whoWeAre, selectedAngle, toneOpener });
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

    let response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    let data = await response.json();
    
    if (!response.ok) {
      // Fallback: retry WITHOUT response_format (schema) to salvage content for HTML mode callers
      try {
        const fallbackBody = {
          model: 'sonar',
          messages: [
            { role: 'system', content: dateContext + (await buildSystemPrompt({ mode, recipient, to, prompt, senderName, templateType, whoWeAre, selectedAngle, toneOpener })).prompt },
            { role: 'user', content: prompt || 'Draft a professional email' }
          ],
          max_tokens: 600
        };
        response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fallbackBody)
        });
        data = await response.json();
      } catch (fallbackErr) {
        const msg = data?.error?.message || data?.detail || 'API error';
        console.error('[Perplexity] API error and fallback failed:', msg, fallbackErr);
        return res.writeHead(500, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'API error', detail: msg }));
      }
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
              `secure better energy rates before contracts expire. Most teams see 10-20% savings on annual costs.`
            );
          }
        }
        
        // Validate CTA completeness for cold emails
        if (templateType === 'cold_email' && jsonData.cta_text) {
          const incompleteCTA = /would you be open to a quick$/i.test(jsonData.cta_text);
          if (incompleteCTA) {
            console.warn('[Validation] Incomplete CTA detected, fixing...');
            jsonData.cta_text = 'When does your current electricity contract expire?';
          }
        }
        
        // Validate missing value propositions for cold emails
        if (templateType === 'cold_email' && (!jsonData.value_proposition || jsonData.value_proposition.trim() === '')) {
          console.warn('[Validation] Missing value proposition detected, adding default...');
          const industry = recipient?.industry || 'businesses';
          jsonData.value_proposition = `Most ${industry} companies see 10-20% savings when they lock in rates early, before contracts expire.`;
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
              jsonData.value_proposition = `${jsonData.value_proposition} Most teams see 10-20% savings on annual energy costs.`;
            }
          }
        }
        
        // Enforce single CTA for cold emails (remove extra questions)
        function enforceSingleCTA(text) {
          if (!text) return text;
          // Find all sentences ending with ?
          const questions = text.match(/[^.!?]*\?/g) || [];
          
          // If more than one question, keep only the last one (the CTA)
          if (questions.length > 1) {
            console.warn('[CTA Cleanup] Multiple questions detected, keeping only last one');
            // Remove all but the last question
            for (let i = 0; i < questions.length - 1; i++) {
              text = text.replace(questions[i], '');
            }
          }
          
          return text.trim();
        }
        
        // Remove forbidden phrases from any text
        function removeForbiddenPhrases(text) {
          if (!text) return text;
          let cleaned = text;
          
          // Remove "I noticed" patterns
          cleaned = cleaned.replace(/\bI noticed\b/gi, '');
          cleaned = cleaned.replace(/\bI saw\b/gi, '');
          
          // Remove corporate bio intros
          cleaned = cleaned.replace(/\bI'm Lewis,?\s+an?\s+Energy Strategist\b/gi, '');
          cleaned = cleaned.replace(/\bI am Lewis,?\s+an?\s+Energy Strategist\b/gi, '');
          cleaned = cleaned.replace(/\bMy name is Lewis\b/gi, '');
          
          // Remove corporate role intros
          cleaned = cleaned.replace(/\bAs\s+(?:CFO|President|CEO|Controller|Manager|Director)\s+of\s+[^,]+,\s*/gi, '');
          cleaned = cleaned.replace(/\bAs\s+(?:CFO|President|CEO|Controller|Manager|Director),\s*you\s+understand\b/gi, 'You understand');
          
          // Remove "I wanted to reach out"
          cleaned = cleaned.replace(/\bI wanted to reach out\b/gi, '');
          
          // Remove "Hope this email finds you well"
          cleaned = cleaned.replace(/\bHope this email finds you well\b/gi, '');
          
          // Clean up double spaces and punctuation
          cleaned = cleaned.replace(/\s+/g, ' ').trim();
          cleaned = cleaned.replace(/\s+([,.!?])/g, '$1');
          
          return cleaned;
        }
        
        // Final language polishing: de-salesify and personalize industry/size
        const sizeCategory = (recipient?.account ? (recipient.account.annualUsage ? (recipient.account.annualUsage < 500000 ? 'small' : (recipient.account.annualUsage < 5000000 ? 'medium' : 'large')) : null) : null);
        const personalizeCtx = { 
          industry: recipient?.industry || null, 
          companyName: recipient?.company || null, 
          sizeCategory,
          job: recipient?.title || recipient?.job || recipient?.role || null
        };
        if (jsonData.greeting) jsonData.greeting = removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.greeting, personalizeCtx)));
        if (jsonData.opening_hook) {
          jsonData.opening_hook = enforceSingleCTA(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.opening_hook, personalizeCtx))));
          jsonData.opening_hook = removeForbiddenPhrases(jsonData.opening_hook);
        }
        if (jsonData.value_proposition) {
          jsonData.value_proposition = removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.value_proposition, personalizeCtx)));
          jsonData.value_proposition = removeForbiddenPhrases(jsonData.value_proposition);
        }
        if (jsonData.social_proof_optional) jsonData.social_proof_optional = removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.social_proof_optional, personalizeCtx)));
        if (jsonData.cta_text) jsonData.cta_text = enforceSingleCTA(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.cta_text, personalizeCtx))));
        
        // Clean all other string fields in jsonData to remove citations
        Object.keys(jsonData).forEach(key => {
          if (typeof jsonData[key] === 'string') {
            jsonData[key] = removeCitationBrackets(jsonData[key]);
          } else if (Array.isArray(jsonData[key])) {
            jsonData[key] = jsonData[key].map(item => 
              typeof item === 'string' ? removeCitationBrackets(item) : item
            );
          }
        });

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
        // Fallback for HTML mode: return plain text content so frontend can render standard email
        console.warn('[Perplexity] JSON parse failed for HTML mode; returning plain text output fallback');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          ok: true,
          output: data?.choices?.[0]?.message?.content || content || '',
          templateType: null,
          citations: data?.citations || []
        }));
      }
    }
    
    // Standard mode
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Standard mode: de-salesify and personalize industry/size in the raw content string
    const sizeCategoryStd = (recipient?.account ? (recipient.account.annualUsage ? (recipient.account.annualUsage < 500000 ? 'small' : (recipient.account.annualUsage < 5000000 ? 'medium' : 'large')) : null) : null);
    const personalizeCtxStd = { 
      industry: recipient?.industry || null, 
      companyName: recipient?.company || null, 
      sizeCategory: sizeCategoryStd,
      job: recipient?.title || recipient?.job || recipient?.role || null
    };
    const polished = removeCitationBrackets(deSalesify(personalizeIndustryAndSize(content, personalizeCtxStd)));
    return res.end(JSON.stringify({ 
      ok: true, 
      output: polished,
      citations: citations
    }));
    
  } catch (e) {
    console.error('[Perplexity] Handler error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to generate email', message: e.message }));
  }
}
