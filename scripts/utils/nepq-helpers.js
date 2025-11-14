/**
 * NEPQ Email Helper Functions
 * Utilities for angle selection, exemption detection, and prompt building
 */

import NEPQ_CONFIG from '../config/nepq-email-config.js';

// ========== TAX EXEMPTION DETECTION ==========

/**
 * Map industry string to tax exemption type
 * @param {string} industry - Industry from account data
 * @returns {string|null} - Exemption type or null if not exempt
 */
export function getTaxExemptStatus(industry) {
  if (!industry) return null;
  
  const normalized = String(industry).trim();
  
  // Direct match
  if (NEPQ_CONFIG.industryExemptionMap[normalized]) {
    return NEPQ_CONFIG.industryExemptionMap[normalized];
  }
  
  // Partial match (case-insensitive)
  const industryLower = normalized.toLowerCase();
  for (const [key, value] of Object.entries(NEPQ_CONFIG.industryExemptionMap)) {
    if (industryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(industryLower)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Get exemption details for a given exemption type
 * @param {string} exemptionType - Type of exemption (Manufacturing, Nonprofit, etc.)
 * @returns {object|null} - Exemption details or null
 */
export function getExemptionDetails(exemptionType) {
  if (!exemptionType) return null;
  return NEPQ_CONFIG.exemptionTypes[exemptionType] || null;
}

// ========== ANGLE SELECTION ==========

/**
 * Select best angle based on contact, account, and exemption status
 * @param {object} contact - Contact data with role, title, etc.
 * @param {object} account - Account data with industry, facilities, etc.
 * @param {string} forceAngle - Optional forced angle override
 * @returns {string} - Selected angle key
 */
export function selectBestAngle(contact, account, forceAngle = null) {
  // If forced angle, use it
  if (forceAngle && NEPQ_CONFIG.enabledAngles.includes(forceAngle)) {
    return forceAngle;
  }
  
  // Get tax exempt status
  const taxExemptStatus = getTaxExemptStatus(account?.industry);
  
  // Exemption-first strategy: If exempt and exemption_recovery enabled, prioritize it
  if (NEPQ_CONFIG.exemptionFirstStrategy && taxExemptStatus && 
      NEPQ_CONFIG.enabledAngles.includes('exemption_recovery')) {
    return 'exemption_recovery';
  }
  
  // Check role-based priority
  const role = contact?.role || contact?.title || contact?.jobTitle || null;
  if (role) {
    const roleAngles = NEPQ_CONFIG.roleAnglePriority[role];
    if (roleAngles) {
      const enabledRoleAngle = roleAngles.find(angle => NEPQ_CONFIG.enabledAngles.includes(angle));
      if (enabledRoleAngle) return enabledRoleAngle;
    }
  }
  
  // Check industry-based priority
  const industry = account?.industry;
  if (industry) {
    const industryAngles = NEPQ_CONFIG.industryAnglePriority[industry];
    if (industryAngles) {
      const enabledIndustryAngle = industryAngles.find(angle => NEPQ_CONFIG.enabledAngles.includes(angle));
      if (enabledIndustryAngle) return enabledIndustryAngle;
    }
  }
  
  // Filter angles based on requirements
  const eligibleAngles = NEPQ_CONFIG.enabledAngles.filter(angleKey => {
    const angle = NEPQ_CONFIG.angles[angleKey];
    if (!angle) return false;
    
    // Check exemption requirement
    if (angle.requiresExemption && !taxExemptStatus) return false;
    
    // Check facility count requirement
    if (angle.requiresFacilityCount && (!account?.numberOfFacilities || account.numberOfFacilities < 2)) return false;
    
    // Check deregulated market requirement
    if (angle.requiresDeregulatedMarket && !account?.marketDeregulated) return false;
    
    // Check contract date requirement
    if (angle.requiresContractDate && !account?.contractExpirationDate) return false;
    
    // Check expansion requirement
    if (angle.requiresExpansion && !account?.recentExpansion) return false;
    
    return true;
  });
  
  // Random selection from eligible angles
  if (eligibleAngles.length > 0) {
    return eligibleAngles[Math.floor(Math.random() * eligibleAngles.length)];
  }
  
  // Fallback to timing_risk if enabled
  if (NEPQ_CONFIG.enabledAngles.includes('timing_risk')) {
    return 'timing_risk';
  }
  
  // Final fallback - first enabled angle
  return NEPQ_CONFIG.enabledAngles[0] || 'timing_risk';
}

/**
 * Select relevant news hook for the selected angle
 * @param {string} angleKey - Selected angle
 * @param {string} industry - Account industry
 * @param {array} accountNews - Account-specific news items
 * @returns {object|null} - News hook or null
 */
export function selectNewsHook(angleKey, industry = null, accountNews = null) {
  // If account has specific news, use first relevant one
  if (accountNews && Array.isArray(accountNews) && accountNews.length > 0) {
    return accountNews[0];
  }
  
  const angle = NEPQ_CONFIG.angles[angleKey];
  if (!angle || !angle.newsHooks || angle.newsHooks.length === 0) {
    return null;
  }
  
  // Get relevant news hooks for this angle
  const relevantNewsKeys = angle.newsHooks.filter(key => key !== 'all');
  
  if (relevantNewsKeys.length === 0) {
    // Use any news hook
    const allNewsKeys = Object.keys(NEPQ_CONFIG.newsHooks);
    if (allNewsKeys.length > 0) {
      const randomKey = allNewsKeys[Math.floor(Math.random() * allNewsKeys.length)];
      return NEPQ_CONFIG.newsHooks[randomKey];
    }
    return null;
  }
  
  // Random selection from relevant news hooks
  const randomKey = relevantNewsKeys[Math.floor(Math.random() * relevantNewsKeys.length)];
  return NEPQ_CONFIG.newsHooks[randomKey];
}

// ========== DATE & URGENCY CALCULATIONS ==========

/**
 * Calculate renewal urgency from contract expiration date
 * @param {string|Date} contractEndDate - Contract expiration date
 * @returns {object} - { urgency: 'immediate'|'high'|'medium'|'low', daysUntil, timeframe }
 */
export function calculateRenewalUrgency(contractEndDate) {
  if (!contractEndDate) {
    return { urgency: 'unknown', daysUntil: null, timeframe: null };
  }
  
  const endDate = new Date(contractEndDate);
  const now = new Date();
  const daysUntil = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  
  let urgency, timeframe;
  
  if (daysUntil < 0) {
    urgency = 'expired';
    timeframe = 'expired';
  } else if (daysUntil <= 90) {
    urgency = 'immediate';
    timeframe = 'in the next 90 days';
  } else if (daysUntil <= 180) {
    urgency = 'high';
    timeframe = 'in 3-6 months';
  } else if (daysUntil <= 365) {
    urgency = 'medium';
    timeframe = 'in 6-12 months';
  } else {
    urgency = 'low';
    timeframe = 'in 12+ months';
  }
  
  return { urgency, daysUntil, timeframe };
}

// ========== PROMPT BUILDING ==========

/**
 * Build NEPQ-structured prompt merging angle, exemption, and news
 * @param {object} params - { contact, account, angleKey, exemptionDetails, newsHook, senderName }
 * @returns {string} - Constructed prompt
 */
export function buildNEPQPrompt({ contact, account, angleKey, exemptionDetails, newsHook, senderName = 'Lewis Patterson' }) {
  const angle = NEPQ_CONFIG.angles[angleKey];
  if (!angle) {
    throw new Error(`Invalid angle key: ${angleKey}`);
  }
  
  const firstName = contact?.firstName || contact?.first_name || 'there';
  const companyName = account?.companyName || account?.name || account?.company || 'your company';
  const industry = account?.industry || 'your industry';
  const role = contact?.role || contact?.title || contact?.jobTitle || 'decision maker';
  
  // Build context sections
  let exemptionContext = '';
  if (exemptionDetails) {
    exemptionContext = `
**TAX EXEMPTION OPPORTUNITY (PRIORITY):**
- Type: ${exemptionDetails.description}
- Refund Potential: ${exemptionDetails.refundPotential} (4-year window)
- Qualifying Usage: ${exemptionDetails.qualifyingUsage}
- How to Claim: ${exemptionDetails.claimProcess}

IMPORTANT: Lead with exemption opportunity. Most prospects don't know they can recover this.`;
  }
  
  let newsContext = '';
  if (newsHook) {
    newsContext = `
**CURRENT MARKET CONTEXT:**
- Headline: ${newsHook.headline}
- Fact: ${newsHook.fact}
- Email Hook: "${newsHook.emailHook}"

Weave this market context naturally into the email if it strengthens the relevance (don't force it).`;
  }
  
  // Build variable replacement map
  const replacements = {
    '{contact_first_name}': firstName,
    '{First}': firstName,
    '{contact_company}': companyName,
    '{company_name}': companyName,
    '{company_industry}': industry,
    '{industry_type}': industry,
    '{contact_job_title}': role,
    '{role}': role,
    '{facility_count}': account?.numberOfFacilities || '5',
    '{location}': account?.city && account?.state ? `${account.city}, ${account.state}` : 'new markets',
    '{rate_increase}': newsHook?.fact?.match(/(\d+)%/)?.[1] || '11',
    '{savings_range}': '8-15',
    '{refund_potential}': exemptionDetails?.refundPotential || '$50K-$200K',
    '{exemption_type}': exemptionDetails?.name || 'tax',
    '{urgency_timeframe}': calculateRenewalUrgency(account?.contractExpirationDate).timeframe || '6 months',
    '{news_headline}': newsHook?.headline || 'recent market changes',
    '{news_fact}': newsHook?.fact || 'Market conditions are shifting',
    '{customer_count}': '124 million'
  };
  
  // Replace variables in angle structure
  const replaceVars = (text) => {
    let result = text;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return result;
  };
  
  const hook = replaceVars(angle.hook);
  const situational = replaceVars(angle.situational);
  const outcome = replaceVars(angle.outcome);
  const cta = replaceVars(angle.cta);
  
  // Construct NEPQ prompt merging Power Choosers tone
  return `Write a cold introduction email using NEPQ structure for: ${firstName}, ${role} at ${companyName}.

Industry: ${industry}
Tax Exemption Status: ${exemptionDetails ? 'YES (' + exemptionDetails.description + ')' : 'None'}

**NEPQ STRUCTURE (REQUIRED):**

1. GREETING (RANDOMIZE):
   - Use ONE of: "Hi ${firstName}," OR "Hey ${firstName}," OR "Hello ${firstName},"

2. CONNECTION QUESTION (DISARMING, STATUS-FRAME):
   ${hook}

3. SITUATIONAL RELEVANCE (WHY NOW, NOT SOMEDAY):
   ${situational}

4. OUTCOME TEASER (SPECIFIC, NOT GENERIC):
   ${outcome}

5. ONE CLEAR CTA (YES/NO, MOBILE-FRIENDLY):
   ${cta}

${exemptionContext}

${newsContext}

**POWER CHOOSERS TONE (CRITICAL - 29-YEAR-OLD TEXAS BUSINESS PRO):**
- Write like a peer, not a salesperson (conversational, confident, direct)
- Use contractions: "we're," "don't," "it's," "you're," "I'm"
- Vary sentence length: Short. Medium sentence. Longer explanation when needed.
- AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "unleash," "synergy," "dive into," "solution"
- Sound like: colleague who knows their industry and has talked to others like them
- Use casual confidence: "Quick question—" "Real question—" "Out of curiosity—"
- NO: "Would you be open to..." (permission-based, weak)
- YES: Ask specific questions that assume conversation is happening

**CONSTRAINTS:**
- 75-130 words total
- Mobile-friendly (short lines)
- NO biographical facts about the company (no Wikipedia-style intros)
- NO generic "typically save 10-20%" claims (use angle-specific outcomes)
- NO emojis or hype language
- If exemption exists, emphasize exemption + refund opportunity (not just rates)
- If news exists, reference it naturally (don't force it)
- One question per section ONLY
- End with signature: "Best,\\n${senderName}"

**SUBJECT LINE:**
Generate a subject line that is:
- Specific to their role and the angle (not generic)
- Examples: "${firstName}, contract timing question" or "${firstName}, exemption recovery check"
- NOT: "thoughts on energy planning" or "insight to ease costs"
- Focus on: contract renewal, exemption recovery, rate lock timing, budget planning

Deliver output as:
Subject: [your subject line]

[email body]`;
}

/**
 * Build angle-specific data object for API calls
 * @param {object} params - { contact, account, angleKey, forceAngle }
 * @returns {object} - { angle, angleKey, exemptionDetails, newsHook, taxExemptStatus, renewalUrgency }
 */
export function buildAngleData({ contact, account, angleKey = null, forceAngle = null }) {
  // Select angle
  const selectedAngle = angleKey || selectBestAngle(contact, account, forceAngle);
  
  // Get tax exempt status
  const taxExemptStatus = getTaxExemptStatus(account?.industry);
  
  // Get exemption details if applicable
  const exemptionDetails = taxExemptStatus ? getExemptionDetails(taxExemptStatus) : null;
  
  // Select news hook
  const newsHook = selectNewsHook(selectedAngle, account?.industry, account?.recentNews);
  
  // Calculate renewal urgency
  const renewalUrgency = calculateRenewalUrgency(account?.contractExpirationDate);
  
  // Get angle config
  const angle = NEPQ_CONFIG.angles[selectedAngle];
  
  return {
    angle,
    angleKey: selectedAngle,
    exemptionDetails,
    newsHook,
    taxExemptStatus,
    renewalUrgency
  };
}

// ========== VALIDATION ==========

/**
 * Validate that contact and account have minimum required data
 * @param {object} contact - Contact data
 * @param {object} account - Account data
 * @returns {object} - { valid: boolean, missing: array }
 */
export function validateEmailData(contact, account) {
  const missing = [];
  
  if (!contact) {
    missing.push('contact object');
  } else {
    if (!contact.firstName && !contact.first_name) missing.push('contact.firstName');
    if (!contact.email) missing.push('contact.email');
  }
  
  if (!account) {
    missing.push('account object');
  } else {
    if (!account.companyName && !account.name && !account.company) missing.push('account.companyName');
    if (!account.industry) missing.push('account.industry');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

// ========== EXPORT HELPERS ==========

export const NEPQHelpers = {
  getTaxExemptStatus,
  getExemptionDetails,
  selectBestAngle,
  selectNewsHook,
  calculateRenewalUrgency,
  buildNEPQPrompt,
  buildAngleData,
  validateEmailData
};

export default NEPQHelpers;

