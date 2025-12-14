// Perplexity Sonar Email Generation (Serverless) - Vercel function
// 7 Preset HTML Templates - AI provides text only, we control styling
// Expects POST { prompt, mode: 'standard'|'html', recipient, to, senderName, fromEmail }

import { cors } from './_cors.js';
import * as IndustryDetection from './_industry-detection.js';
import logger from './_logger.js';
import { db } from './_firebase.js';
import fs from 'fs';
import path from 'path';

// Debug logging helper - writes directly to file
const DEBUG_LOG_PATH = path.join(process.cwd(), '.cursor', 'debug.log');
function debugLog(data) {
  try {
    const logLine = JSON.stringify(data) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, logLine, 'utf8');
  } catch (err) {
    // Fallback to console if file write fails
    console.log('[DEBUG]', JSON.stringify(data));
  }
}

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

// ========== ANGLE-BASED CTAs ==========
// CTAs based on angle opening questions from ANGLES-DOCUMENTATION.md and cta-mastery-guide.md
// Structure: [Opening Question] + [Value/Statistic] + [Low-friction closing question]
const angleCtaMap = {
  'timing_strategy': {
    opening: 'When does your current electricity contract expire?',
    value: '10-20% better rates when locking in 6 months early',
    full: 'When does your current electricity contract expire?\n\nWorth a 10-minute look?'
  },
  'exemption_recovery': {
    opening: 'Are you currently claiming electricity exemptions on your production facilities?',
    value: '$75K-$500K in unclaimed exemptions over 4 years',
    full: 'Are you currently claiming electricity exemptions on your production facilities?\n\nMost manufacturers leave $75K-$500K on the table. Worth exploring?'
  },
  'consolidation': {
    opening: 'How many locations are you managing energy for?',
    value: '15-25% savings by consolidating all locations',
    full: 'How many locations are you managing energy for?\n\nConsolidating contracts typically means 15-25% savings. Worth a look?'
  },
  'demand_efficiency': {
    opening: 'Are you optimizing consumption before you renew your contract?',
    value: '12-20% consumption reduction before rate shopping',
    full: 'Are you optimizing consumption before you renew your contract?\n\n12-20% reduction before rate shopping can mean massive savings. Worth a conversation?'
  },
  'operational_continuity': {
    opening: 'How do you currently handle energy during peak demand periods?',
    value: 'Demand charges are often 40-60% of the bill',
    full: 'How do you currently handle energy during peak demand periods?\n\nDemand charges are often 40-60% of the bill. Worth addressing?'
  },
  'mission_funding': {
    opening: 'How are you making sure more funding goes to your mission, not vendors?',
    value: '10-20% savings redirected to programs',
    full: 'How are you making sure more funding goes to your mission, not vendors?\n\n10-20% savings redirected to programs. Worth exploring?'
  },
  'budget_stability': {
    opening: 'When budgeting for energy, are you locking in costs or dealing with volatility?',
    value: 'Fixed costs for better program planning',
    full: 'When budgeting for energy, are you locking in costs or dealing with volatility?\n\nFixed costs for better program planning. Worth a conversation?'
  },
  'operational_simplicity': {
    opening: 'Are you managing multiple energy suppliers or contracts?',
    value: 'Single vendor, unified billing',
    full: 'Are you managing multiple energy suppliers or contracts?\n\nSingle vendor, unified billing. Worth a look?'
  },
  'cost_control': {
    opening: 'Does energy cost predictability matter for your budget planning?',
    value: '10-20% savings with predictable costs',
    full: 'Does energy cost predictability matter for your budget planning?\n\n10-20% savings with predictable costs. Worth exploring?'
  },
  'operational_efficiency': {
    opening: 'Are energy costs impacting your operational efficiency?',
    value: '10-18% cost reduction',
    full: 'Are energy costs impacting your operational efficiency?\n\n10-18% cost reduction. Worth a conversation?'
  },
  'data_governance': {
    opening: 'Do you have visibility into energy usage across your facilities?',
    value: 'Centralized metering and reporting',
    full: 'Do you have visibility into energy usage across your facilities?\n\nCentralized metering and reporting. Worth exploring?'
  }
};

// Get CTA for selected angle (with creative control for Perplexity)
function getAngleCta(selectedAngle) {
  if (!selectedAngle || !selectedAngle.id) return null;
  
  // Use angle's own openingTemplate and primaryValue if available (from angle object)
  // Otherwise fall back to angleCtaMap
  const angleId = selectedAngle.id;
  const ctaData = angleCtaMap[angleId];
  
  if (!ctaData) return null;
  
  // Return the full CTA structure for Perplexity to use as foundation
  return {
    opening: selectedAngle.openingTemplate || ctaData.opening,
    value: selectedAngle.primaryValue || ctaData.value,
    full: ctaData.full,
    angleId: angleId
  };
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

// Company research cache (session-level - in-memory for fast access)
const companyResearchCache = new Map();
const linkedinResearchCache = new Map();
const websiteResearchCache = new Map();
const contactLinkedinCache = new Map();
const recentActivityCache = new Map();
const locationContextCache = new Map();

// OPTIMIZED: Firestore cache helper for Perplexity research (48-hour TTL)
// Reduces Perplexity API costs by 30-50% by caching research results
async function getPerplexityCache(cacheKey, cacheType = 'perplexity-research') {
    if (!db) return null;
    try {
        const doc = await db.collection('aiCache').doc(`${cacheType}-${cacheKey}`).get();
        if (doc.exists) {
            const data = doc.data();
            const cacheAge = Date.now() - (data.cachedAt || 0);
            const CACHE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
            
            if (cacheAge < CACHE_DURATION_MS && data.result) {
                logger.log(`[Perplexity Cache] Hit for ${cacheType} (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
                return data.result;
            }
        }
    } catch (err) {
        logger.warn(`[Perplexity Cache] Read error (non-critical): ${err.message}`);
    }
    return null;
}

async function setPerplexityCache(cacheKey, result, cacheType = 'perplexity-research') {
    if (!db || !result) return;
    try {
        await db.collection('aiCache').doc(`${cacheType}-${cacheKey}`).set({
            result,
            cachedAt: Date.now(),
            source: 'perplexity'
        });
    } catch (err) {
        logger.warn(`[Perplexity Cache] Write error (non-critical): ${err.message}`);
    }
}

async function researchCompanyInfo(companyName, industry, additionalContext = {}) {
  if (!companyName) return null;
  
  // Build cache key with additional context to avoid confusion between similar company names
  const contextKey = additionalContext.domain || additionalContext.location || '';
  const cacheKey = `${companyName}_${industry || ''}_${contextKey}`;
  
  // Check Firestore cache first (persistent across restarts)
  const firestoreCache = await getPerplexityCache(cacheKey, 'company-research');
  if (firestoreCache) {
    companyResearchCache.set(cacheKey, firestoreCache); // Populate in-memory cache
    return firestoreCache;
  }
  
  // Check in-memory cache (session-level)
  if (companyResearchCache.has(cacheKey)) {
    logger.log(`[Research] Using in-memory cached info for ${companyName}`);
    return companyResearchCache.get(cacheKey);
  }
  
  try {
    // Build disambiguation context
    const disambiguationParts = [];
    if (additionalContext.domain) {
      disambiguationParts.push(`website: ${additionalContext.domain}`);
    }
    if (additionalContext.location) {
      disambiguationParts.push(`location: ${additionalContext.location}`);
    }
    if (additionalContext.accountDescription) {
      // Use first 50 chars of description for disambiguation
      const descPreview = additionalContext.accountDescription.substring(0, 50).trim();
      if (descPreview) {
        disambiguationParts.push(`description: ${descPreview}`);
      }
    }
    const disambiguationContext = disambiguationParts.length > 0 
      ? ` Additional context to distinguish this company: ${disambiguationParts.join(', ')}.` 
      : '';
    
    // CRITICAL: Add explicit disambiguation for companies with similar names
    const disambiguationWarning = companyName.toLowerCase().includes('meta') && !companyName.toLowerCase().includes('tech')
      ? ' IMPORTANT: This is NOT Meta (Facebook/Meta Platforms). This is a different company. Do NOT confuse with Meta Platforms Inc. or Facebook.'
      : companyName.toLowerCase().includes('meta') && companyName.toLowerCase().includes('tech')
      ? ' IMPORTANT: This is Meta Tech Industries (a precision machine shop/manufacturing company), NOT Meta Platforms Inc. (Facebook). Do NOT confuse with Meta Platforms or Facebook.'
      : '';
    
    const researchPrompt = `Research ${companyName}${industry ? ', a ' + industry + ' company' : ''}.${disambiguationContext}${disambiguationWarning}
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
      logger.error(`[Research] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const description = data.choices?.[0]?.message?.content || null;
    
    if (description) {
      logger.log(`[Research] Found info for ${companyName}`);
      companyResearchCache.set(cacheKey, description); // In-memory cache
      await setPerplexityCache(cacheKey, description, 'company-research'); // Firestore cache
    }
    
    return description;
  } catch (error) {
    logger.error('[Research] Company research failed:', error);
    return null;
  }
}

async function saveAccountDescription(accountId, description) {
  if (!accountId || !description) return false;
  
  try {
    const { db } = await import('./_firebase.js');
    if (!db) {
      logger.warn('[Research] Firestore not available, skipping save');
      return false;
    }
    
    const updateData = {
      shortDescription: description,
      descriptionUpdatedAt: new Date().toISOString(),
      descriptionSource: 'web_research'
    };
    
    await db.collection('accounts').doc(accountId).update(updateData);
    
    logger.log(`[Research] Saved description for account ${accountId}`);
    
    // Return the saved data so we can notify the frontend
    return { id: accountId, description, timestamp: updateData.descriptionUpdatedAt };
  } catch (error) {
    logger.error('[Research] Failed to save description:', error);
    return false;
  }
}

async function researchLinkedInCompany(linkedinUrl, companyName) {
  // Graceful handling: return null if no LinkedIn URL
  if (!linkedinUrl) {
    logger.log(`[LinkedIn] No LinkedIn URL for ${companyName}`);
    return null;
  }
  
  const cacheKey = linkedinUrl;
  
  // Check Firestore cache first
  const firestoreCache = await getPerplexityCache(cacheKey, 'linkedin-company');
  if (firestoreCache) {
    linkedinResearchCache.set(cacheKey, firestoreCache);
    return firestoreCache;
  }
  
  // Check in-memory cache
  if (linkedinResearchCache.has(cacheKey)) {
    logger.log(`[LinkedIn] Using in-memory cached data for ${companyName}`);
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
      logger.error(`[LinkedIn] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const linkedinData = data.choices?.[0]?.message?.content || null;
    
    if (linkedinData) {
      logger.log(`[LinkedIn] Found data for ${companyName}`);
      linkedinResearchCache.set(cacheKey, linkedinData);
      await setPerplexityCache(cacheKey, linkedinData, 'linkedin-company');
    }
    
    return linkedinData;
  } catch (error) {
    logger.error('[LinkedIn] Research failed:', error);
    return null; // Graceful failure
  }
}

async function scrapeCompanyWebsite(domain, companyName) {
  // Graceful handling: return null if no domain
  if (!domain) {
    logger.log(`[Web Scrape] No domain for ${companyName}`);
    return null;
  }
  
  try {
    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    const cacheKey = cleanDomain;
    
    // Check Firestore cache first
    const firestoreCache = await getPerplexityCache(cacheKey, 'website-research');
    if (firestoreCache) {
      websiteResearchCache.set(cacheKey, firestoreCache);
      return firestoreCache;
    }
    
    // Check in-memory cache
    if (websiteResearchCache.has(cacheKey)) {
      logger.log(`[Web Scrape] Using in-memory cached data for ${companyName}`);
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
      logger.error(`[Web Scrape] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const websiteData = data.choices?.[0]?.message?.content || null;
    
    if (websiteData) {
      logger.log(`[Web Scrape] Found data for ${companyName}`);
      websiteResearchCache.set(cacheKey, websiteData);
      await setPerplexityCache(cacheKey, websiteData, 'website-research');
    }
    
    return websiteData;
  } catch (error) {
    logger.error('[Web Scrape] Website analysis failed:', error);
    return null; // Graceful failure
  }
}

async function researchContactLinkedIn(linkedinUrl, contactName, companyName) {
  if (!linkedinUrl) {
    logger.log(`[Contact LinkedIn] No LinkedIn URL for ${contactName}`);
    return null;
  }
  
  const cacheKey = linkedinUrl;
  
  // Check Firestore cache first
  const firestoreCache = await getPerplexityCache(cacheKey, 'contact-linkedin');
  if (firestoreCache) {
    contactLinkedinCache.set(cacheKey, firestoreCache);
    return firestoreCache;
  }
  
  // Check in-memory cache
  if (contactLinkedinCache.has(cacheKey)) {
    logger.log(`[Contact LinkedIn] Using in-memory cached data for ${contactName}`);
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
      logger.error(`[Contact LinkedIn] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const contactData = data.choices?.[0]?.message?.content || null;
    
    if (contactData) {
      logger.log(`[Contact LinkedIn] Found data for ${contactName}`);
      contactLinkedinCache.set(cacheKey, contactData);
      await setPerplexityCache(cacheKey, contactData, 'contact-linkedin');
    }
    
    return contactData;
  } catch (error) {
    logger.error('[Contact LinkedIn] Research failed:', error);
    return null;
  }
}

async function researchRecentCompanyActivity(companyName, industry, city, state, additionalContext = {}) {
  if (!companyName) return null;
  
  // Build cache key with additional context to avoid confusion
  const contextKey = additionalContext.domain || '';
  const cacheKey = `${companyName}_${industry || ''}_${city || ''}_${state || ''}_${contextKey}`;
  
  // Check Firestore cache first
  const firestoreCache = await getPerplexityCache(cacheKey, 'recent-activity');
  if (firestoreCache) {
    recentActivityCache.set(cacheKey, firestoreCache);
    return firestoreCache;
  }
  
  // Check in-memory cache
  if (recentActivityCache.has(cacheKey)) {
    logger.log(`[Recent Activity] Using in-memory cached data for ${companyName}`);
    return recentActivityCache.get(cacheKey);
  }
  
  try {
    // CRITICAL: Add explicit disambiguation for companies with similar names
    const disambiguationWarning = companyName.toLowerCase().includes('meta') && !companyName.toLowerCase().includes('tech')
      ? ' IMPORTANT: This is NOT Meta (Facebook/Meta Platforms). This is a different company. Do NOT confuse with Meta Platforms Inc. or Facebook.'
      : companyName.toLowerCase().includes('meta') && companyName.toLowerCase().includes('tech')
      ? ' IMPORTANT: This is Meta Tech Industries (a precision machine shop/manufacturing company), NOT Meta Platforms Inc. (Facebook). Do NOT confuse with Meta Platforms or Facebook.'
      : '';
    
    const activityPrompt = `Research recent news, announcements, or activity for ${companyName}${industry ? ', a ' + industry + ' company' : ''}${city && state ? ' in ' + city + ', ' + state : ''}.${disambiguationWarning}
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
      logger.error(`[Recent Activity] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const activityData = data.choices?.[0]?.message?.content || null;
    
    // Only cache if we found actual activity
    if (activityData && !activityData.toLowerCase().includes('no recent') && !activityData.toLowerCase().includes('unable to find')) {
      logger.log(`[Recent Activity] Found activity for ${companyName}`);
      recentActivityCache.set(cacheKey, activityData);
      await setPerplexityCache(cacheKey, activityData, 'recent-activity');
      return activityData;
    }
    
    return null;
  } catch (error) {
    logger.error('[Recent Activity] Research failed:', error);
    return null;
  }
}

async function researchLocationContext(city, state, industry) {
  if (!city || !state) return null;
  
  const cacheKey = `${city}_${state}_${industry || ''}`;
  
  // Check Firestore cache first
  const firestoreCache = await getPerplexityCache(cacheKey, 'location-context');
  if (firestoreCache) {
    locationContextCache.set(cacheKey, firestoreCache);
    return firestoreCache;
  }
  
  // Check in-memory cache
  if (locationContextCache.has(cacheKey)) {
    logger.log(`[Location Context] Using in-memory cached data for ${city}, ${state}`);
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
      logger.error(`[Location Context] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const locationData = data.choices?.[0]?.message?.content || null;
    
    if (locationData) {
      logger.log(`[Location Context] Found data for ${city}, ${state}`);
      locationContextCache.set(cacheKey, locationData);
      await setPerplexityCache(cacheKey, locationData, 'location-context');
    }
    
    return locationData;
  } catch (error) {
    logger.error('[Location Context] Research failed:', error);
    return null;
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

// Remove citation brackets from text (e.g., [1], [2], [3])
function removeCitationBrackets(text) {
  if (!text) return text;
  return String(text)
    .replace(/\[\d+\]/g, '') // Remove [1], [2], [3], etc.
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
}

// Remove em dashes and hyphens from opening hooks and replace with commas or natural flow
function removeEmDashes(text) {
  if (!text) return text;
  return String(text)
    // Replace em dash (—) and en dash (–) at end of phrases with comma or nothing
    .replace(/(\w+)\s*[—–]\s+/g, '$1, ')  // "Curious—" → "Curious, "
    .replace(/(\w+)\s*[—–]$/g, '$1')      // "Curious—" at end → "Curious"
    .replace(/\s*[—–]\s+/g, ', ')         // Any remaining dashes → comma
    // Replace compound adjectives with hyphens (e.g., "higher-than-expected" → "higher than expected")
    .replace(/(\w+)-(\w+)-(\w+)/g, '$1 $2 $3')  // "higher-than-expected" → "higher than expected"
    .replace(/(\w+)-(\w+)/g, (match, p1, p2) => {
      // Only replace if it's a compound adjective pattern, not regular hyphenated words
      const compoundPatterns = ['higher-than', 'lower-than', 'more-than', 'less-than', 'better-than', 'worse-than', 'longer-than', 'shorter-than'];
      if (compoundPatterns.some(p => match.toLowerCase().includes(p))) {
        return `${p1} ${p2}`;
      }
      return match; // Keep other hyphens (e.g., "energy-intensive", "24/7")
    });
}

// Industry/size-aware post-processor to avoid generic "your industry" and inaccurate size references
function personalizeIndustryAndSize(text, { industry, companyName, sizeCategory, job }) {
  if (!text) return text;
  let out = String(text);

  // CRITICAL FIX: Replace "Default companies" or "Default" industry references
  // This happens when industry is "Default" or empty - replace with neutral language
  out = out
    .replace(/\bDefault companies\b/gi, 'companies like yours')
    .replace(/\bDefault company\b/gi, 'companies like yours')
    .replace(/\bI help Default\b/gi, 'I help companies')
    .replace(/\bhelp Default\b/gi, 'help companies')
    .replace(/\bfor Default\b/gi, 'for companies')
    .replace(/\bwith Default\b/gi, 'with companies')
    .replace(/\bin Default\b/gi, '')  // Remove "in Default" entirely
    .replace(/\bDefault\b/gi, '')      // Remove standalone "Default" word
    .replace(/\s+/g, ' ')              // Clean up extra spaces
    .trim();

  // Replace generic "your industry" with specific industry when available
  if (industry && industry !== 'Default' && /your industry/i.test(out)) {
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
  
  logger.log('[Prompt Analysis] Extracted context:', analysis);
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
  
  logger.log('[Dynamic Fields] Generated fields:', dynamicFields);
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
        logger.log(`[Template Detection] Matched "${templateType}" for prompt: "${prompt}"`);
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
    logger.log(`[Template Detection] Exact match "${promptMap[prompt]}" for prompt: "${prompt}"`);
    return promptMap[prompt];
  }
  
  // Default to general template for unrecognized prompts
  logger.log(`[Template Detection] Using "general" template for prompt: "${prompt}"`);
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
        greeting: { type: "string", description: "MUST be exactly 'Hello [FIRST NAME ONLY],' - Use ONLY the first name, NEVER the full name. For example: 'Hello Kurt,' NOT 'Hello Kurt Lacoste,'" },
        opening_hook: { type: "string", description: "Problem-aware opening about industry challenge or market condition (1-2 sentences, NO statistics)" },
        value_proposition: { type: "string", description: "How we help with specific measurable value (include percentages or dollar amounts)" },
        social_proof_optional: { type: "string", description: "Brief credibility with real outcomes (optional, 1 sentence)" },
        cta_text: { type: "string", description: "Low-friction CTA - use qualifying questions for cold emails (e.g., 'Is this on your radar?', 'Have you already handled this?') or meeting requests for follow-ups (e.g., 'Schedule Your Free Assessment', 'Book a Consultation')" },
        cta_type: { type: "string", description: "CTA pattern used: qualifying_question, soft_ask_with_context, value_question, timing_question, or direct_meeting" },
        closing: { type: "string", description: "Closing line like 'Best regards,' or 'Cheers,' followed by sender's first name on new line" }
      },
      required: ["subject", "subject_style", "greeting", "opening_hook", "value_proposition", "cta_text", "cta_type", "closing"],
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
    
    logger.log('[Schema Enhancement] Added dynamic fields:', dynamicFields.map(f => f.name));
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
      painPoints: [
        'production downtime',
        'energy-intensive operations',
        'equipment reliability',
        'energy spend doubling on renewal for large facilities',
        'confusing riders and line items on bills that hide negotiable costs',
        'being on the wrong contract structure leading to high delivery charges'
      ],
      avgSavings: '15-25%',
      keyBenefit: 'operational continuity',
      urgencyDrivers: ['production schedules', 'equipment uptime'],
      language: 'operational efficiency and production continuity'
    },
    healthcare: {
      painPoints: [
        'budget constraints',
        'regulatory compliance',
        'patient care continuity',
        'unpredictable utility bills impacting care budgets',
        'multiple meters and contracts renewing at different times causing chaos'
      ],
      avgSavings: '10-18%',
      keyBenefit: 'cost predictability',
      urgencyDrivers: ['budget cycles', 'compliance deadlines'],
      language: 'budget optimization and regulatory compliance'
    },
    retail: {
      painPoints: [
        'multiple locations',
        'unpredictable costs',
        'seasonal demand',
        'fragmented contracts across locations renewing at different times',
        'bills with hard-to-explain riders and fees that can be removed'
      ],
      avgSavings: '12-20%',
      keyBenefit: 'centralized management',
      urgencyDrivers: ['lease renewals', 'expansion plans'],
      language: 'cost control and centralized management'
    },
    hospitality: {
      painPoints: [
        'seasonal demand',
        'guest comfort',
        'operational costs',
        'multi-property contracts renewing at different times creating chaos',
        'wrong contract type causing high delivery charges during peak seasons'
      ],
      avgSavings: '12-18%',
      keyBenefit: 'cost stability',
      urgencyDrivers: ['seasonal planning', 'guest satisfaction'],
      language: 'cost stability and guest experience'
    },
    education: {
      painPoints: [
        'budget constraints',
        'facility maintenance',
        'student safety',
        'energy spend jumping significantly on renewal impacting academic budgets',
        'confusing line items on bills that hide negotiable costs'
      ],
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

async function buildSystemPrompt({ 
  mode, 
  recipient, 
  to, 
  prompt, 
  senderName = 'Lewis Patterson', 
  templateType, 
  whoWeAre, 
  marketContext, 
  meetingPreferences, 
  industrySegmentation,
  selectedAngle,
  toneOpener,
  emailPosition = 1, // 1, 2, or 3 for CTA escalation and subject progression
  previousAngles = [] // Array of angle IDs used in previous emails
}) {
  // Analyze manual prompt for enhanced context understanding
  const promptAnalysis = analyzeManualPrompt(prompt);
  
  // Extract recipient data
  const r = recipient || {};
  const name = r.fullName || r.full_name || r.name || '';
  const firstName = r.firstName || r.first_name || (name ? String(name).split(' ')[0] : '');
  const company = r.company || r.accountName || '';
  const job = r.title || r.job || r.role || '';
  // Normalize industry using shared detection helpers when missing
  let industry = r.industry || '';
  // Filter out "Default" - treat it as empty/unknown industry
  if (industry === 'Default' || industry === 'default') {
    industry = '';
  }
  // Normalize industry to lowercase for consistent usage in prompts (avoid "Manufacturing" vs "manufacturing")
  const industryLower = industry ? industry.toLowerCase() : '';
  const energy = r.energy || {};
  const transcript = (r.transcript || r.callTranscript || r.latestTranscript || '').toString().slice(0, 1000);
  const notes = [r.notes, r.account?.notes].filter(Boolean).join('\n').slice(0, 500);
  // Debug log to see what account data is available
  logger.debug('[Debug] Full account data for', company, ':', JSON.stringify(r.account, null, 2));
  
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

  // If industry not provided but we have company or description, infer it here
  try {
    if (!industry && company) {
      industry = IndustryDetection.inferIndustryFromCompanyName(company) || industry;
    }
    if (!industry && accountDescription) {
      industry = IndustryDetection.inferIndustryFromDescription(accountDescription) || industry;
    }
  } catch (_) {
    // Best-effort only; fall back to whatever was passed in
  }
  
  // Company research (only if no description exists)
  if (!accountDescription && company) {
    logger.log(`[Research] No description for ${company}, starting enhanced research...`);
    
    const linkedinUrl = r.account?.linkedin || r.account?.linkedinUrl || null;
    const domain = r.account?.domain || r.account?.website || null;
    const location = city && state ? `${city}, ${state}` : (city || state || '');
    
    // Pass additional context to help disambiguate similar company names
    const additionalContext = {
      domain: domain,
      location: location,
      accountDescription: accountDescription // Even if empty, pass it for consistency
    };
    
    researchPromises.push(
      researchCompanyInfo(company, industry, additionalContext).then(result => ({ type: 'company', data: result })),
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
    const domain = r.account?.domain || r.account?.website || null;
    const additionalContext = {
      domain: domain,
      accountDescription: accountDescription
    };
    researchPromises.push(
      researchRecentCompanyActivity(company, industry, city, state, additionalContext).then(result => ({ type: 'recentActivity', data: result }))
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
  // CRITICAL: Truncate company description to prevent "description dumping" in emails
  // Extract key business type words only (not full sentences) - this is for CONTEXT ONLY, not to copy into email
  if (accountDescription) {
    const trimmed = accountDescription.replace(/\s+/g, ' ').trim();
    // Get first sentence only (split on period, exclamation, or question mark)
    const firstSentence = trimmed.split(/[.!?]/)[0].trim();
    
    // Instead of truncating with "...", extract key business type words
    // Look for patterns like "contract manufacturing", "restaurant chain", "manufacturing company"
    const businessTypePatterns = [
      /(contract\s+manufacturing|manufacturing\s+company|manufacturer)/i,
      /(restaurant\s+chain|restaurant|dining)/i,
      /(retail\s+chain|retailer|retail)/i,
      /(healthcare|hospital|clinic|medical)/i,
      /(logistics|warehouse|distribution|shipping)/i,
      /(data\s+center|hosting|cloud)/i,
      /(construction|contractor|builder)/i,
      /(education|school|university|college)/i
    ];
    
    let businessType = '';
    for (const pattern of businessTypePatterns) {
      const match = firstSentence.match(pattern);
      if (match) {
        businessType = match[0].toLowerCase();
        break;
      }
    }
    
    // If no pattern found, try to extract first 2-3 key words (avoiding articles, prepositions)
    if (!businessType && firstSentence.length > 0) {
      const words = firstSentence.split(/\s+/).filter(w => 
        w.length > 3 && 
        !/^(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|this|that|these|those|with|from|for|about|into|onto|upon|over|under|above|below|between|among|during|before|after|since|until|while|when|where|why|how|what|which|who|whom|whose)$/i.test(w)
      );
      businessType = words.slice(0, 3).join(' ').toLowerCase();
    }
    
    // Cap at 50 characters, truncate at word boundary (no "...")
    if (businessType.length > 50) {
      const words = businessType.split(/\s+/);
      let result = '';
      for (const word of words) {
        if ((result + ' ' + word).length <= 50) {
          result = result ? result + ' ' + word : word;
        } else {
          break;
        }
      }
      accountDescription = result || businessType.substring(0, 50).trim();
    } else {
      accountDescription = businessType || '';
    }
    
    // Log what we're passing to the AI
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'perplexity-email.js:2105','message':'Account description processing','data':{company,originalLength:trimmed.length,originalPreview:trimmed.substring(0,100),processedDescription:accountDescription,hasDescription:!!accountDescription},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
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
  
  // Determine role category for variant selection
  const roleCategory = !job ? 'default' :
                      /ceo|president|owner|founder|executive|chief/i.test(job) ? 'executive' :
                      /finance|cfo|controller|accounting|treasurer/i.test(job) ? 'finance' :
                      /operations|facilities|logistics|maintenance|procurement/i.test(job) ? 'operations' :
                      'default';
  
  // Get dynamic savings range by industry + role
  function getDynamicSavingsRange(industry, roleCategory) {
    const SAVINGS_BY_INDUSTRY_ROLE = {
      'Manufacturing': {
        'Finance': '15-25%', // Budget-focused, high impact
        'Operations': '12-20%', // Efficiency-focused
        'Executive': '10-20%',
        'Default': '12-20%'
      },
      'Retail': {
        'Finance': '12-20%',
        'Operations': '10-18%',
        'Executive': '12-18%',
        'Default': '10-18%'
      },
      'Healthcare': {
        'Finance': '10-15%', // Constrained budgets
        'Operations': '8-12%', // Uptime priority over cost
        'Executive': '10-15%',
        'Default': '10-15%'
      },
      'Nonprofit': {
        'Finance': '8-15%', // Smaller margins but material
        'Operations': '8-12%',
        'Executive': '8-15%',
        'Default': '8-15%'
      },
      'Hospitality': {
        'Finance': '12-18%',
        'Operations': '10-15%',
        'Executive': '12-18%',
        'Default': '12-18%'
      },
      'Education': {
        'Finance': '10-15%',
        'Operations': '8-12%',
        'Executive': '10-15%',
        'Default': '10-15%'
      },
      'Default': {
        'Finance': '10-20%',
        'Operations': '10-20%',
        'Executive': '10-20%',
        'Default': '10-20%'
      }
    };
    
    const industryKey = industry || 'Default';
    const industryConfig = SAVINGS_BY_INDUSTRY_ROLE[industryKey] || SAVINGS_BY_INDUSTRY_ROLE.Default;
    return industryConfig[roleCategory] || industryConfig.Default;
  }
  
  const dynamicSavingsRange = getDynamicSavingsRange(industry, roleCategory);
  
  // Get email generation mode (random selection for variety)
  const generationMode = getRandomGenerationMode();
  const modeInstructions = EMAIL_GENERATION_MODES[generationMode];
  
  // Get subject line variant (for suggestions in prompt)
  const suggestedSubject = templateType === 'cold_email' ? 
    getRandomSubjectLine('cold-email', roleCategory, firstName, company) : null;
  
  // Get industry-specific content (prefer settings if provided)
  const industryContent = industry ? getIndustrySpecificContentFromSettings(industry, industrySegmentation) : null;
  
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
${accountDescription ? '- Business Focus (CONTEXT ONLY - DO NOT COPY INTO EMAIL): ' + accountDescription : ''}
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
${recentActivityContext ? '- Recent Company Activity: ' + recentActivityContext + ' (reference naturally through questions, not "I noticed" or "I saw"). IMPORTANT: If activity mentions "new" facilities/offices, verify timing - if it\'s from 2022 or earlier, frame as "your [location] facility" not "new facility" to avoid sounding outdated.' : ''}
${locationContextData ? '- Regional Energy Market: ' + locationContextData + ' (use for location-specific context)' : ''}

ENERGY DATA:
${energy.supplier ? '- Current Supplier: ' + energy.supplier : ''}
${energy.currentRate ? '- Current Rate: ' + energy.currentRate + '/kWh' : ''}
${contractEndLabel ? '- Contract Ends: ' + contractEndLabel : ''}
${energy.contractEnd ? (() => {
  const today = new Date();
  const contractEndDate = new Date(energy.contractEnd);
  const daysUntilExpiry = Math.floor((contractEndDate - today) / (1000 * 60 * 60 * 24));
  const monthsUntilExpiry = Math.floor(daysUntilExpiry / 30);
  const urgencyLevel = daysUntilExpiry < 60 ? 'CRITICAL' : daysUntilExpiry < 180 ? 'HIGH' : monthsUntilExpiry < 12 ? 'MEDIUM' : 'LOW';
  const isIdealRenewalWindow = monthsUntilExpiry >= 4 && monthsUntilExpiry <= 8;
  return `\n## CONTRACT RENEWAL CONTEXT (CRITICAL)\nTheir current contract ends ${contractEndLabel}. This is ~${monthsUntilExpiry} months away (${daysUntilExpiry} days). Urgency: ${urgencyLevel}.\n${isIdealRenewalWindow ? 'IDEAL renewal window (4-8 months out) - perfect timing for early renewal.' : 'Renewal Strategy: ' + (monthsUntilExpiry < 4 ? 'URGENT - emphasize cost lock-in before rate increases' : 'Reference timing advantage and planning benefits') + '.'}\nKEY MESSAGE: ${monthsUntilExpiry < 4 ? 'Emphasize cost lock-in and avoiding rate increases.' : monthsUntilExpiry <= 8 ? 'Emphasize early renewal benefits and better terms.' : 'Emphasize planning advantage and strategic timing.'}`;
})() : ''}

HISTORICAL CONTEXT:
${transcript ? '- Call Notes: ' + transcript : ''}
${notes ? '- Additional Notes: ' + notes : ''}

INDUSTRY-SPECIFIC CONTEXT:
${industryContent ? '- Industry Focus: ' + industryContent.language + '\n- Key Pain Points: ' + industryContent.painPoints.join(', ') + '\n- Average Savings: ' + industryContent.avgSavings + '\n- Key Benefit: ' + industryContent.keyBenefit + '\n- Urgency Drivers: ' + industryContent.urgencyDrivers.join(', ') : ''}
${dynamicSavingsRange ? `\n## TYPICAL SAVINGS FOR THEIR ROLE\nCompanies in similar roles and industries (${industry || 'their industry'} - ${roleCategory} role) typically see ${dynamicSavingsRange} savings. Use this as your concrete value claim instead of generic "10-20%".` : ''}

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
${accountDescription ? '- Business Focus (CONTEXT ONLY): "' + accountDescription + '" - Use this for context, but DO NOT copy it into the email. Instead, reference ONE short detail naturally.' : ''}
${industryContent ? '- Industry Focus: "Manufacturing companies like ' + company + ' typically face ' + industryContent.painPoints[0] + '..."' : ''}
${companySizeContext && companySizeContext.size === 'large' ? '- Size Context: "As a large ' + (industry || 'company') + ', ' + companySizeContext.focus + ' is key..."' : ''}
${companySizeContext && companySizeContext.size !== 'large' ? '- Industry Context: "As a ' + (industry || 'company') + ', ' + companySizeContext.focus + ' is key..." (NEVER say "small company" or "small business" - use industry instead)' : ''}
${contractUrgency ? '- Urgency Level: "With ' + contractUrgency.level + ' timing, ' + contractUrgency.focus + '..."' : ''}

ROLE-SPECIFIC OPENING HOOK EXAMPLES:
${job?.toLowerCase().includes('cfo') || job?.toLowerCase().includes('finance') ? '- CFO: "As CFO of ' + company + ', you\'re likely planning 2025 budgets with energy costs rising..."' : ''}
${job?.toLowerCase().includes('facilities') || job?.toLowerCase().includes('maintenance') ? '- Facilities: "Managing energy procurement on top of facilities operations can be time-consuming..."' : ''}
${job?.toLowerCase().includes('procurement') || job?.toLowerCase().includes('purchasing') ? '- Procurement: "As procurement manager, you know the energy market is competitive..."' : ''}
${job?.toLowerCase().includes('operations') || job?.toLowerCase().includes('manager') ? '- Operations: "Energy costs can be one of the most unpredictable operational expenses..."' : ''}
${job?.toLowerCase().includes('president') || job?.toLowerCase().includes('ceo') ? '- Executive: "As President of ' + company + ', you understand the importance of managing operational costs..."' : ''}
`;

  // Debug log for recipient context
  logger.debug(`[Debug] Recipient context for ${firstName} at ${company}:`, {
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

    // Build optional angle + tone opener context for cold emails
    let angleContextBlock = '';
    if (templateType === 'cold_email' && selectedAngle && typeof selectedAngle === 'object') {
      const angleId = selectedAngle.id || 'primary_angle';
      const angleFocus = selectedAngle.primaryMessage || selectedAngle.label || 'primary focus';
      const angleOpening = selectedAngle.openingTemplate || '';
      const angleValue = selectedAngle.primaryValue || '';
      angleContextBlock = `

PRIMARY ANGLE FOR THIS EMAIL (CRITICAL - USE THIS AS YOUR LENS - DO NOT IGNORE):
- Angle ID: ${angleId}
- Focus: ${angleFocus}
${angleOpening ? '- Example opening pattern: "' + angleOpening + '"' : ''}
${angleValue ? '- Primary value proposition: "' + angleValue + '"' : ''}

**MANDATORY ANGLE USAGE:**
- You MUST structure the ENTIRE email around this specific angle (${angleFocus})
- The opening_hook MUST focus on this angle's specific problem/challenge
- DO NOT default to generic "demand charges" or "delivery charges" unless the angle is specifically about demand efficiency
- If angle is "timing_strategy" → focus on contract renewal timing, early renewal benefits, renewal windows
- If angle is "cost_control" → focus on rising electricity costs, budget pressure, cost predictability
- If angle is "exemption_recovery" → focus on tax exemptions, unclaimed exemptions, exemption certificates
- If angle is "consolidation" → focus on multi-location management, contract consolidation, unified billing
- If angle is "demand_efficiency" → THEN you can mention demand charges, but ONLY if this is the angle
- If angle is "operational_simplicity" → focus on time spent managing energy, vendor complexity, procurement burden

**DO NOT** mention "demand charges" or "delivery charges" unless the angle is specifically about demand efficiency. Use the angle's focus instead.

## ANGLE VALUE LOCK (CRITICAL - NON-NEGOTIABLE)
${(() => {
  const angleValueProps = {
    timing_strategy: "The key message: locking in rates 6 months early typically yields better terms than waiting until 30-60 days before expiry.",
    exemption_recovery: "The key message: many businesses leave significant electricity tax exemptions unclaimed—often $75K-500K over 4 years.",
    consolidation: "The key message: managing multiple locations on separate contracts means lost consolidation savings—typically 10-20%.",
    demand_efficiency: "The key message: optimizing consumption BEFORE renewal shopping gives negotiating leverage and measurable savings.",
    cost_control: "The key message: fixing cost volatility means locking fixed rates and predictable budgets.",
    operational_simplicity: "The key message: simplifying energy procurement reduces time spent managing vendors and contracts."
  };
  const valueProp = angleValueProps[angleId] || '';
  return valueProp ? `${valueProp}\nDO NOT deviate from this message. Every sentence should reinforce it.` : '';
})()}`;
    }

    const toneOpenerRule = (templateType === 'cold_email' && toneOpener)
      ? `

**OPENING HOOK - CREATIVE FREEDOM WITH VARIETY**:
- **CRITICAL: NEVER use em dashes (—) or en dashes (–) in the opening hook. Use commas or natural flow.**
- **FORBIDDEN OPENER**: "Wondering how [company] is handling..." is STRICTLY FORBIDDEN. This pattern is overused and sounds templated.
- **FORBIDDEN REPETITION**: Do NOT default to "Quick question" every time. This is overused and makes all emails sound the same. Vary your opener style.
- **CREATIVE FREEDOM**: You have full creative freedom to craft a natural, conversational opener. The tone opener "${toneOpener}" is provided as INSPIRATION - use it as a stylistic guide and try to match its style, not ignore it.
- **VARIETY IS CRITICAL**: Vary your opener style across emails. Mix between these approaches (DO NOT use "Quick question" repeatedly):
  * **Direct questions**: "Are you...", "How are you...", "When does...", "What's your approach to..."
  * **Soft curiosity**: "Curious if...", "Wonder if...", "Curious, " (use "Quick question" sparingly - it's overused)
  * **Peer observations**: "Most teams...", "Usually when...", "From what I'm seeing...", "I've found that...", "Most people I talk to..."
  * **Honest/direct**: "Honestly, ", "So here's the thing, "
  * **Disarmed/confused**: "Not sure if...", "Quick question that might be off base..." (only use this specific variation, not generic "Quick question")
- **USE THE TONE OPENER STYLE**: The tone opener "${toneOpener}" suggests a ${toneOpener.toLowerCase().includes('curious') ? 'curiosity' : toneOpener.toLowerCase().includes('honestly') ? 'direct/honest' : toneOpener.toLowerCase().includes('most') || toneOpener.toLowerCase().includes('teams') || toneOpener.toLowerCase().includes('people') ? 'peer observation' : toneOpener.toLowerCase().includes('question') ? 'direct question' : toneOpener.toLowerCase().includes('so here') ? 'direct/honest' : 'conversational'} style. Try to match this style rather than defaulting to "Quick question".
- **NATURALNESS OVER MATCHING**: The goal is natural, human-sounding openers that vary across emails. Don't force-match the tone opener if a different natural phrasing works better, but also don't ignore it and default to "Quick question".
- The opener must:
  1. Sound like a real person (not a template)
  2. Open with a genuine question or curiosity (not a statement)
  3. Avoid salesy language ("I noticed", "I saw", "Hope this finds you")
  4. Vary from previous emails - don't repeat "Quick question" or any other opener pattern
- The opener should go immediately after the greeting with proper paragraph spacing`
      : '';

    // NEPQ structure and guardrails (cold email only)
    const nepqRules = templateType === 'cold_email' ? `

NEPQ STRUCTURE (MANDATORY FOR COLD EMAILS):
- Opening hook: FIRST sentence after greeting should start with a conversational opener (any style - see tone opener options above). This can be a soft curiosity question, direct question, or peer observation - vary it across emails.
- **CRITICAL PUNCTUATION: NEVER use em dashes (—) or en dashes (–) in the opening hook. Use commas or natural flow. Examples: "Curious, " (NOT "Curious—"), "Question for you, " (NOT "Question for you—"). This is mandatory.**
- **CRITICAL: You MUST include at least TWO questions in the email:**
  1. Problem-awareness question: Ask about a specific challenge/problem (can be in opening hook or second sentence)
  2. Low-friction CTA question: End with a simple qualifying question (yes/no style). Examples: "Is this on your radar?" / "Have you already handled this?" / "Is this a priority for this quarter?" / "When does your contract expire?" / "How many locations are you managing?"
- Value/Gap statement: 1–2 sentences starting with "The reason I ask is..." or "Typically, we see..." that explain why you asked and what can go wrong.
- **MANDATORY**: The email MUST end with a qualifying question (the CTA). Without this second question, the email will be rejected.

FORBIDDEN LANGUAGE (DO NOT USE):
- "I saw", "I noticed", "I read", "hope this email finds you well", "just following up", "my name is", "I wanted to reach out/introduce"
- **Em dashes (—) or en dashes (–) in opening hooks or tone openers - use commas instead**
- Do not pitch meetings/time blocks ("15 minutes", "book a call", "schedule a meeting"). Keep CTA a qualifying question.
- Do not pitch our company/services; stay focused on their potential problem.
` : '';

    const basePrompt = `${whoWeAre || 'You are generating TEXT CONTENT ONLY for Power Choosers email templates.'}

SENDER: ${senderName}
IMPORTANT: Return PLAIN TEXT only in JSON fields. NO HTML tags, NO styling, NO formatting.
We handle all HTML/CSS styling on our end.

${recipientContext}

${angleContextBlock}

${nepqRules}

${conditionalRules}

Use web search to personalize content about ${company || 'the recipient'}. 

**CRITICAL COMPANY NAME DISAMBIGUATION**: If the company name is "${company}", make absolutely sure you are researching and referencing the CORRECT company. Do NOT confuse companies with similar names (e.g., "Meta Tech Industries" is a precision machine shop in Houston, NOT Meta Platforms/Facebook). Always verify you are referencing the correct company based on the industry, location, and business description provided.`;

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
TEMPLATE: Cold Email Outreach
Generate text for these fields:
- greeting: MUST be exactly "Hello ${firstName}," - Use ONLY the first name "${firstName}", NEVER use the full name. This is mandatory.
- opening_hook: **CREATIVE OPENER - VARY YOUR STYLE** (toneOpener "${toneOpener}" is stylistic inspiration only)
  **FORBIDDEN**: "Wondering how [company] is handling..." is STRICTLY FORBIDDEN. This pattern is overused and will be rejected.
  **CREATIVE FREEDOM**: You have full creative freedom to craft a natural, conversational opener. The tone opener "${toneOpener}" is provided as INSPIRATION - use it as a stylistic guide, not a template. Feel free to rephrase it naturally or use a different but similar style.
  **VARIETY IS CRITICAL**: Vary your opener style across emails. Mix between (DO NOT use "Quick question" repeatedly):
  * Direct questions: "Are you...", "How are you...", "When does...", "What's your approach to..."
  * Soft curiosity: "Curious if...", "Wonder if...", "Curious, " (use "Quick question" sparingly - it's overused)
  * Peer observations: "Most teams...", "Usually when...", "From what I'm seeing...", "I've found that...", "Most people I talk to..."
  * Honest/direct: "Honestly, ", "So here's the thing, "
  * Disarmed/confused: "Not sure if...", "Quick question that might be off base..." (only this specific variation, not generic "Quick question")
  **FORBIDDEN**: "Wondering how..." is STRICTLY FORBIDDEN - it's overused and templated.
  **NATURALNESS OVER MATCHING**: The goal is natural, human-sounding openers that vary across emails. Use the tone opener style as your guide, but don't force-match it if a different natural phrasing works better. Just don't default to "Quick question". Then continue with problem awareness (1-2 sentences total). ${selectedAngle && typeof selectedAngle === 'object' ? `**CRITICAL - USE THE SELECTED ANGLE**: This email MUST focus on "${selectedAngle.primaryMessage || selectedAngle.label || 'the selected angle'}". ${selectedAngle.id === 'demand_efficiency' ? 'You CAN mention demand charges since this angle is about demand efficiency.' : 'DO NOT mention "demand charges" or "delivery charges" - this angle is NOT about demand. Focus on ' + (selectedAngle.primaryMessage || selectedAngle.label) + ' instead. For example, if angle is "timing_strategy", focus on contract renewal timing. If angle is "cost_control", focus on rising electricity costs or budget pressure. If angle is "exemption_recovery", focus on tax exemptions. If angle is "consolidation", focus on multi-location management.'} ${selectedAngle.openingTemplate ? 'Use this angle\'s opening pattern as inspiration: "' + selectedAngle.openingTemplate + '"' : ''}` : '**DO NOT default to "demand charges"** - vary the pain points you mention.'} ${accountDescription ? `**CRITICAL - DO NOT USE THE BUSINESS FOCUS TEXT**: The "Business Focus" (${accountDescription}) is ONLY for you to understand their business type. DO NOT copy it, quote it, or reference it directly in the email. Instead, use industry-specific language naturally. GOOD: "Most ${industryLower || 'manufacturing'} companies I work with..." or "Companies like ${company} typically..." BAD: "${accountDescription}..." or "As a ${accountDescription}..." or any variation that includes the business focus text.` : 'Reference their specific business challenges.'} Focus on industry-specific energy challenges:
  **CRITICAL PUNCTUATION RULE: NEVER use em dashes (—) or en dashes (–) in the opening_hook. Use commas or natural flow instead. Examples: "Curious, " (NOT "Curious—"), "Question for you, " (NOT "Question for you—"), "Real question, " (NOT "Real question—"). This is mandatory - em dashes will be rejected.**
  * Manufacturing: Production downtime, equipment reliability, energy-intensive operations
  * Healthcare: Budget constraints, regulatory compliance, patient care continuity
  * Retail: Multiple locations, unpredictable costs, seasonal demand
  * Hospitality: Guest comfort, operational costs, seasonal planning
   * Education: Facility maintenance, student safety, budget optimization
   * Use company-specific data: current supplier, rate, contract timing, recent achievements
IMPORTANT:
- Always reference ${company} specifically.
- Use qualitative language (rising, increasing, higher) NOT percentages (15-25%, 20-30%) in the opening hook.
- For demand charges and cost impacts, use CONDITIONAL language: "can increase demand charges and push costs higher if the contract structure no longer matches your new load profile" (NOT "demand charges that eat 20-30% more into budgets").
- FACILITY TIMING: If referencing facilities/offices, be careful with "new" - if the activity is from 2022 or earlier, use "your [location] facility" instead of "new facility" to avoid sounding outdated.
- Keep it natural and conversational.
- NEVER mention company size ("small company", "small business") - focus on role, industry, and operational challenges instead.
- NEVER start the email by restating their full "About us" description (for example, "Safety Vision is a leading provider of..."). Instead, summarize their situation in plain, conversational language tied to energy costs.
- value_proposition: How we help (1-2 sentences MINIMUM). MUST include BOTH: (1) HOW we help, AND (2) CONDITIONAL value language (NOT unverified specific percentages). Use conditional language like "can reduce costs", "often gives more optionality", "may help avoid renewal risk" instead of asserting specific percentages as facts. Only use specific percentages if you have verified data. Include role-specific benefits:
  * CFOs: Budget predictability, cost reduction, risk mitigation
  * Facilities Managers: Operational efficiency, maintenance cost reduction
  * Procurement Managers: Vendor management, contract optimization
  * Operations Managers: Cost control, efficiency improvements
Example: "We help manufacturing companies secure better rates before contracts expire. Early renewal often gives more optionality and can reduce renewal risk compared with waiting until the last window." Be concrete, not vague. NEVER end with incomplete phrase like "within [company]". ALWAYS include a complete value proposition - never skip this field. THIS FIELD IS MANDATORY - NEVER LEAVE BLANK. Use conditional language ("can", "often", "may") for unverified claims - do NOT assert specific percentages as facts unless you have verified data.
- social_proof_optional: Brief credibility statement IF relevant (1 sentence, optional). Use conditional language for outcomes: "We've helped [similar company] reduce energy costs", "Our clients in [industry] often see cost reductions", "Companies like [company] have achieved savings". Only use specific percentages if you have verified data. NEVER use vague phrases like "similar companies" or "many businesses".
${(() => {
  const angleCta = getAngleCta(selectedAngle);
  if (angleCta && templateType === 'cold_email') {
    // CTA Escalation based on email position
    let ctaEscalation = '';
    let closingQuestion = '';
    
    if (emailPosition === 1) {
      // Email 1: Soft discovery question
      closingQuestion = 'Worth a 10-minute look?';
      ctaEscalation = `
  * EMAIL POSITION: This is Email #1 (first contact)
  * CTA STRENGTH: SOFT - Discovery question
  * Structure: [Opening Question] + [Value/Statistic] + [Low-friction closing question]
  * Example: "${angleCta.opening}\n\n${angleCta.value}.\n\n${closingQuestion}"`;
    } else if (emailPosition === 2) {
      // Email 2: Medium-strength ask
      closingQuestion = 'Can I pull a quick analysis for you?';
      ctaEscalation = `
  * EMAIL POSITION: This is Email #2 (follow-up)
  * CTA STRENGTH: MEDIUM - Reference previous + Value ask
  * MUST reference Email #1 naturally: "On that ${angleCta.opening.toLowerCase()} question..."
  * Structure: [Reference Email 1] + [New Angle Insight] + [Medium-strength ask]
  * Example: "On that ${angleCta.opening.toLowerCase()} question, ${angleCta.value}.\n\n${closingQuestion}"`;
    } else if (emailPosition >= 3) {
      // Email 3+: Hard ask with time options
      closingQuestion = 'Can you do Thursday 2-3pm or Friday 10-11am? If not, when works better?';
      ctaEscalation = `
  * EMAIL POSITION: This is Email #${emailPosition} (final attempt)
  * CTA STRENGTH: HARD - Specific time options
  * MUST create urgency: "Rate lock windows are tightening..."
  * Structure: [Urgency] + [Time Options] + [Alternative close]
  * Example: "Rate lock windows are tightening. ${closingQuestion}"`;
    }
    
    return `
- cta_text: **CREATIVE CTA BUTTON TEXT** - Create button text (2-5 words) that NATURALLY FLOWS from the email content above
  * **CRITICAL**: This is BUTTON TEXT, not a question. Keep it short (2-5 words), action-oriented, and compelling
  * **MUST align with the selected angle**: "${angleCta.opening}" (use this as inspiration, but be creative)
  * **MUST match the email's opening hook**: Your button text should reference or build on the problem/challenge mentioned in opening_hook
  * **MUST match the email's value proposition**: Reference the value/benefit you mentioned in value_proposition
  * **MUST match the industry**: ${industryLower ? `For ${industryLower} companies, use industry-specific language` : 'Use industry-appropriate language'}
  * **CREATIVE FREEDOM**: You can rephrase, combine, or create variations - the angle is your GUIDE, not a template
  * **Button text examples** (2-5 words, action-oriented):
    - If angle is "timing_strategy" → "Check Renewal Timing" or "Review Contract Window" or "Explore Early Renewal"
    - If angle is "cost_control" → "Review Energy Costs" or "Explore Savings" or "Check Budget Impact"
    - If angle is "exemption_recovery" → "Check Exemptions" or "Review Tax Savings" or "Explore Refunds"
    - If angle is "consolidation" → "Review Locations" or "Explore Consolidation" or "Check Multi-Site Savings"
    - If opening_hook mentions "contract renewal" → "Review Renewal Options" or "Check Contract Timing"
    - If opening_hook mentions "rising costs" → "Explore Savings" or "Review Energy Costs"
    - If opening_hook mentions "multiple locations" → "Review Locations" or "Explore Consolidation"
  * **Keep it short**: 2-5 words maximum, action-oriented, no question marks
${ctaEscalation}
  * **BUTTON TEXT REQUIREMENTS**:
    - Keep it SHORT: 2-5 words maximum
    - Action-oriented: Use verbs like "Check", "Review", "Explore", "Get Started"
    - NO question marks: This is button text, not a question
    - Examples: "Check Renewal Timing", "Review Energy Costs", "Explore Savings", "Get Started"
  * **Industry-specific CTAs**:
    ${industryLower === 'manufacturing' ? '- Manufacturing: Focus on production efficiency, equipment reliability, energy-intensive operations (e.g., "How are you handling energy costs for your production floor?")' : ''}
    ${industryLower === 'healthcare' ? '- Healthcare: Focus on budget constraints, patient care continuity (e.g., "How are rising electricity costs affecting your budget for patient care?")' : ''}
    ${industryLower === 'retail' ? '- Retail: Focus on multiple locations, seasonal demand (e.g., "How are you managing energy costs across your locations?")' : ''}
    ${industryLower === 'hospitality' ? '- Hospitality: Focus on guest comfort, operational costs (e.g., "How are you balancing guest comfort with energy costs?")' : ''}
    ${industryLower === 'education' ? '- Education: Focus on facility maintenance, budget optimization (e.g., "How are you handling energy costs while maintaining facility quality?")' : ''}
  * FORBIDDEN CTAs - DO NOT use these phrases:
    - "If you ever want a second opinion on your setup"
    - "I can spend 10 minutes looking at your situation"
    - "Would you be open to a conversation"
    - "Let's schedule a call"
    - Any meeting request or permission-based language (except Email 3+)
  * If you don't use the angle-based CTA, the email will be rejected
- cta_type: Return "angle_question"
`;
  } else if (ctaPattern) {
    return `
- cta_text: **CREATIVE CTA GENERATION** - Create a call-to-action that NATURALLY FLOWS from the email content above
  * **Use this pattern as inspiration**: "${ctaPattern.template}" (but be creative - rephrase it naturally)
  * **MUST match the email's opening hook**: Your CTA should reference or build on the problem/challenge mentioned in opening_hook
  * **MUST match the email's value proposition**: Reference the value/benefit you mentioned in value_proposition
  * **MUST match the industry**: ${industryLower ? `For ${industryLower} companies, use industry-specific language` : 'Use industry-appropriate language'}
  * **MUST match the role**: ${job ? `For ${job} roles, focus on role-specific concerns (e.g., ${job.toLowerCase().includes('cfo') || job.toLowerCase().includes('finance') ? 'budget planning, cost predictability' : job.toLowerCase().includes('facilities') || job.toLowerCase().includes('operations') ? 'facility operations, renewal timing' : 'role-specific challenges'})` : ''}
  * **CREATIVE FREEDOM**: You can rephrase, combine, or create variations - the pattern is your GUIDE, not a template
  * **Natural flow**: The CTA should feel like a natural continuation of the email, not a disconnected ask
  * Keep under 15 words
  * MUST be complete sentence with proper ending punctuation
  * NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .)
- cta_type: Return "${ctaPattern.type}"
`;
  } else {
    return `
- cta_text: **CREATIVE CTA GENERATION** - Create a call-to-action that NATURALLY FLOWS from the email content above
  * **MUST match the email's opening hook**: Your CTA should reference or build on the problem/challenge mentioned in opening_hook
  * **MUST match the email's value proposition**: Reference the value/benefit you mentioned in value_proposition
  * **MUST match the industry**: ${industryLower ? `For ${industryLower} companies, use industry-specific language` : 'Use industry-appropriate language'}
  * **MUST match the selected angle**: ${selectedAngle && typeof selectedAngle === 'object' ? `Focus on "${selectedAngle.primaryMessage || selectedAngle.label}" - use "${selectedAngle.openingTemplate || 'the angle\'s opening question'}" as inspiration` : 'Use angle-appropriate language'}
  * **CREATIVE FREEDOM**: Create a natural, conversational question that flows from the email content
  * **Natural flow**: The CTA should feel like a natural continuation of the email, not a disconnected ask
  * **Examples**:
    - If email talks about contract renewal → "When does your contract expire?"
    - If email talks about rising costs → "How are you handling budget pressure from rising rates?"
    - If email talks about multiple locations → "How many facilities are you managing energy for?"
  * Keep under 15 words
  * MUST be complete sentence with proper ending punctuation
  * NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .)
- cta_type: Return "qualifying"
`;
  }
})()}
- closing: Sign off with a professional closing. Use "Best regards," or "Cheers," followed by the sender's first name "${senderName ? senderName.split(' ')[0] : 'Lewis'}" on a new line. Example: "Best regards,\n${senderName ? senderName.split(' ')[0] : 'Lewis'}"

HUMAN TOUCH REQUIREMENTS (CRITICAL - Write Like an Expert Human, Not AI):
- Write like a knowledgeable energy expert who researched their company deeply
- Show you did homework: When you have specific data, use QUESTIONS instead of observations:
  * Ask about their business type naturally: "How are ${industry || 'manufacturing'} companies like ${company} handling energy costs?" (DO NOT mention the business focus text - use industry/company name instead)
  ${recentActivityContext ? '* Ask about ' + recentActivityContext.substring(0, 60) + '...: "With [recent activity], how has that affected your energy planning?" (if recent activity found)' : '* DO NOT mention recent activity, recent news, or recent public activity - there is none available'}
  * Reference website naturally: "On your website, I see..." → "How are you handling [specific challenge mentioned on website]?" (if website context available)
  * "Given ${city ? city + '\'s' : '[location]\'s'} energy market conditions..." (if location context available)
- Use natural transitions: "That's why...", "Given that...", "With ${contractEndLabel ? ('your contract ending ' + contractEndLabel) : '[specific situation]'}..."
- Include micro-observations: Reference their website, recent posts, industry trends they'd recognize through QUESTIONS
- Vary sentence length: Mix short punchy statements with longer explanatory ones
- Use conversational connectors: "Here's the thing...", "The reality is...", "What I've found..."
- Avoid AI patterns: NO "I wanted to reach out", "Hope this email finds you well", "I noticed", "I saw", "I read", or other template phrases
- Show expertise subtly: "In my experience with ${industry || '[industry]'} companies", ask questions about ${industryContent ? industryContent.painPoints[0] : '[specific trend]'}
${tenure ? '- Use tenure naturally: "In your ' + tenure + ' as ' + job + ', how have you seen..." (if tenure available)' : ''}
${contactLinkedinContext ? '- Reference contact profile: Use insights from their LinkedIn profile naturally through questions' : ''}

EVIDENCE OF RESEARCH (Show You Know Their Business):
${accountDescription ? '✓ PRIORITY: Use business focus for context only: The business focus (' + accountDescription + ') tells you their business type. Use industry-specific language (e.g., "manufacturing companies", "restaurant chains") but DO NOT mention the business focus text itself. This is your PRIMARY hook when no recent activity.' : ''}
${linkedinContext ? '✓ Use company LinkedIn: Reference recent company posts or announcements through questions' : ''}
${websiteContext ? '✓ PRIORITY: Use website info: Ask about specific challenges mentioned on their website (DO NOT say "I noticed") - strong alternative when no recent activity' : ''}
${recentActivityContext ? '✓ Use recent activity: Ask "With ' + recentActivityContext.substring(0, 60) + '..., how has that impacted..." (DO NOT say "I saw")' : '✗ DO NOT mention recent activity, recent news, recent public activity, or "no recent activity" - there is none available. INSTEAD, use account description, website context, contract timing, or industry-specific questions'}
${locationContextData ? '✓ Use location context: "Given ' + (city || '[location]') + '\'s energy market..."' : ''}
${contractEndLabel ? '✓ PRIORITY: Use contract timing: "With your contract ending ' + contractEndLabel + '..." - strong hook when no recent activity' : ''}
${squareFootage ? '✓ Use facility size: Reference ' + squareFootage.toLocaleString() + ' sq ft facility when relevant' : ''}
${employees ? '✓ Use scale: Reference ' + employees + ' employees when relevant for context' : ''}
${industry ? '✓ Use industry context: Reference ' + industry + ' industry challenges naturally through questions' : ''}

CONVERSATIONAL FLOW PATTERNS:
✓ GOOD: "With ${company} operating in ${industryLower || '[industry]'}, how are you handling energy costs for facilities like yours?"
✓ GOOD: "Given your role as ${job || '[role]'}, are you dealing with ${roleContext?.painPoints[0] || '[pain point]'}? Here's what I've found..."
✓ GOOD: "${industryLower ? industryLower.charAt(0).toUpperCase() + industryLower.slice(1) : '[Industry]'} companies are facing ${industryContent?.painPoints[0] || '[specific challenge]'}. How is ${company || '[Company]'} handling this?"
✓ GOOD: "Companies in ${industryLower || '[industry]'}" (not "your industry")
✓ GOOD: "As ${job || '[role]'}" (not "As CEO of a small business")
✗ BAD: "I wanted to reach out about..."
✗ BAD: "I hope this email finds you well..."
✗ BAD: "I'm reaching out because..."

KNOWLEDGE DEMONSTRATION:
- Reference specific operational details: ${accountDescription ? '"As ' + accountDescription.substring(0, 80) + '..."' : 'Company-specific details'}
- Mention industry-specific challenges: ${selectedAngle && typeof selectedAngle === 'object' ? `**USE THE SELECTED ANGLE'S FOCUS**: This email is about "${selectedAngle.primaryMessage || selectedAngle.label}". ${selectedAngle.id === 'demand_efficiency' ? 'You CAN mention demand/delivery charges since this angle is about demand efficiency.' : 'DO NOT mention "demand charges" or "delivery charges" - focus on the angle\'s specific challenge instead: ' + (selectedAngle.primaryMessage || selectedAngle.label) + '. For example: timing_strategy → contract renewal timing, early renewal windows; cost_control → rising electricity costs, budget pressure; exemption_recovery → tax exemptions, unclaimed exemptions; consolidation → multi-location management, unified billing.'}` : ''} ${industryContent ? 'VARY the pain points you mention - do NOT always default to "load demand" or "delivery charges". Use different pain points from this list: ' + industryContent.painPoints.join(', ') + '. Examples: rising electricity costs, budget pressure, contract timing, rate volatility, bill complexity, renewal surprises. Mix it up - not every email should mention load/demand.' : 'Industry pain points - VARY them (not always load/demand)'} (not generic "operational costs")
- Show understanding of their role's pain points: ${roleContext?.painPoints.join(', ') || '[role pain points]'}
${locationContextData ? '- Include location context: ' + locationContextData.substring(0, 80) + '...' : ''}
${contractEndLabel ? '- Reference contract timing: "With your contract ending ' + contractEndLabel + '..."' : ''}
${energy.supplier ? '- Reference current supplier: "With ' + energy.supplier + ' as your current supplier..."' : ''}

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
- VALUE PROP MUST: Include HOW we help AND WHAT results using CONDITIONAL language (e.g., "We help [industry] companies secure better rates before contracts expire. Early renewal often gives more optionality and can reduce renewal risk.") Do NOT assert specific percentages as facts unless you have verified data.
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

FORBIDDEN CTAs (CRITICAL - DO NOT USE THESE):
- "If you ever want a second opinion on your setup"
- "I can spend 10 minutes looking at your situation"
- "If you ever want a second opinion"
- "second opinion on your setup"
- "10 minutes looking at your situation"
- "spend 10 minutes looking"
- "Would you be open to a conversation"
- "Let's schedule a call"
- Any permission-based language ("Would you be open to...", "If you want...")
- Any meeting request language
These old CTAs are FORBIDDEN. You MUST use the angle-based CTA provided above.

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
  - NEVER assume company size. DO NOT use "small company", "small business", "as a small company", "as a small business", "limited resources", or similar phrases - these can be insulting to business owners. Use neutral language: "companies in ${industry}", "companies like yours", or focus on role/industry instead.
  - Focus on role and industry specifics: "As CEO" (not "As CEO of a small business"), "As a ${industry} company" (not "As a small company"), "companies in manufacturing" (not "small manufacturing companies").
  - If role and tenure are available (from LinkedIn), you may include them naturally (e.g., "In your 3 years as General Manager").
  - CRITICAL: If you need to reference the company, use "As a ${industry} company" or "As ${job}" - NEVER say "as a small company" or "as a small business".

EMAIL GENERATION MODE: ${generationMode.toUpperCase()}
${modeInstructions ? `
- Tone: ${modeInstructions.tone}
- Approach: ${modeInstructions.approach}
- CTA Style: ${modeInstructions.ctaStyle}
${generationMode === 'consultative' ? `
  * Focus on discovery questions to understand their situation
  * Use softer language: "I'm curious..." "Out of curiosity..." "How do you typically..."
  * Lower pressure: Ask about their process rather than demanding action
  * Example CTA: "How do you typically handle your energy renewals?"` : ''}
${generationMode === 'direct' ? `
  * Lead with specific insights and concrete value upfront
  * Use confident language: "Here's what I found..." "The reality is..."
  * Assertive but respectful: Present facts and ask direct questions
  * Example CTA: "When does your contract renew? Early renewal often gives more optionality compared with waiting."` : ''}
${generationMode === 'balanced' ? `
  * Combine observation with specific value proposition
  * Professional but conversational: Ask a question about their situation, then "Here's what I've found..."
  * Balanced approach: Show expertise without being pushy
  * Example CTA: "Question for you, what's your renewal timeline?"` : ''}
` : ''}

SUBJECT LINE RULES (CRITICAL - PERPLEXITY HAS CREATIVE CONTROL):
- You MUST create a unique, angle-specific subject line for each email
- DO NOT use the same subject line pattern repeatedly
- SUBJECT LINE PROGRESSION (based on email position):
${emailPosition === 1 ? `
  * EMAIL #1: Question format with angle
  * Pattern: "[FirstName], [angle question]?"
  * Examples: "${firstName}, when does your contract expire?", "${firstName}, are you claiming exemptions?"
  * Focus: Discovery question specific to the angle` : ''}
${emailPosition === 2 ? `
  * EMAIL #2: Reference format with "re:" prefix
  * Pattern: "re: [previous angle keyword] [new angle keyword]"
  * Examples: "re: contract timing consolidation question", "re: exemptions timing question"
  * Focus: Show continuation, reference previous email naturally
  * MUST use "re:" prefix to indicate follow-up` : ''}
${emailPosition >= 3 ? `
  * EMAIL #${emailPosition}: Urgency format
  * Pattern: "Last attempt [urgency message]" or "Final note [angle keyword]"
  * Examples: "Last attempt rate lock window closing", "Final note renewal timing", "One last thought rate timing"
  * Focus: Create urgency without being pushy, acknowledge final attempt
  * MUST be different from Emails 1-2` : ''}
- Base your subject on the selected angle, but be creative:
${selectedAngle?.id === 'timing_strategy' ? `
  * Angle: Timing Strategy
  * Core question: "When does your contract expire?"
  * Creative variations: "${firstName}, when does your contract expire?", "${company} renewal timing question", "${firstName}, rate lock timing?", "${firstName}, contract renewal window?"
` : ''}
${selectedAngle?.id === 'exemption_recovery' ? `
  * Angle: Exemption Recovery
  * Core question: "Are you claiming exemptions?"
  * Creative variations: "${firstName}, are you claiming exemptions?", "${company} tax exemption question", "${firstName}, unclaimed exemptions?", "${firstName}, electricity exemptions?"
` : ''}
${selectedAngle?.id === 'consolidation' ? `
  * Angle: Consolidation
  * Core question: "How many locations?"
  * Creative variations: "${firstName}, how many locations are you managing?", "${company} multi-site energy question", "${firstName}, consolidation opportunity?", "${firstName}, multiple locations?"
` : ''}
${selectedAngle?.id === 'demand_efficiency' ? `
  * Angle: Demand Efficiency
  * Core question: "Optimizing before renewal?"
  * Creative variations: "${firstName}, optimizing before renewal?", "${company} consumption efficiency question", "${firstName}, pre-renewal optimization?", "${firstName}, efficiency before renewal?"
` : ''}
${selectedAngle?.id === 'operational_continuity' ? `
  * Angle: Operational Continuity
  * Core question: "Peak demand handling?"
  * Creative variations: "${firstName}, peak demand handling?", "${company} operational continuity question", "${firstName}, uptime vs savings?", "${firstName}, demand charge question?"
` : ''}
${selectedAngle?.id === 'mission_funding' ? `
  * Angle: Mission Funding
  * Core question: "More funding to mission?"
  * Creative variations: "${firstName}, redirecting funds to mission?", "${company} mission funding question", "${firstName}, vendor cost question?", "${firstName}, program funding?"
` : ''}
${selectedAngle?.id === 'budget_stability' ? `
  * Angle: Budget Stability
  * Core question: "Locking in costs?"
  * Creative variations: "${firstName}, locking in energy costs?", "${company} budget stability question", "${firstName}, cost predictability?", "${firstName}, budget volatility?"
` : ''}
${selectedAngle?.id === 'operational_simplicity' ? `
  * Angle: Operational Simplicity
  * Core question: "Multiple suppliers?"
  * Creative variations: "${firstName}, managing multiple suppliers?", "${company} vendor consolidation question", "${firstName}, unified billing?", "${firstName}, supplier management?"
` : ''}
${selectedAngle?.id === 'cost_control' ? `
  * Angle: Cost Control
  * Core question: "Cost predictability?"
  * Creative variations: "${firstName}, energy cost predictability?", "${company} budget planning question", "${firstName}, rate volatility?", "${firstName}, cost control?"
` : ''}
${!selectedAngle || !selectedAngle.id ? `
  * No specific angle - use role-based variations:
  * "${firstName}, contract timing question" (specific, role-agnostic)
  * "${firstName}, rate lock timing question" (specific to rate procurement)
  * "${company} contract renewal question" (company-specific)
` : ''}
- Target: 4-6 words, 50 characters max
- MUST vary from email to email - never repeat the same subject
- Use question format when possible (increases curiosity)
- Include firstName or company name for personalization
- NO statistics or percentages in subject lines
- NO generic "thoughts on" or "insights" language
- FORBIDDEN VAGUE PATTERNS: "thoughts on energy planning", "insight to ease costs", "thoughts on energy strategy"
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
- opening_paragraph: CRITICAL - This MUST be based on the user's specific prompt. Read what they typed and create a natural, conversational opening paragraph (2-3 sentences) that directly addresses their question or concern. DO NOT use generic text like "I wanted to reach out about an interesting opportunity." DO NOT use "I noticed" or "I saw". Instead, use their actual words and context through QUESTIONS. For example, if they mention "rates went down in October but now creeping back up," start with something like "Sean, rates dipped in October but they're climbing again now. How is that impacting your budget planning?" - Use their specific details, numbers, and concerns from the prompt.
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
  const identity = whoWeAre || `You are ${senderName}, an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates. Write in first person ("we"/"I"). Do NOT use brand-first openers like "At Power Choosers," or "Power Choosers helps" - prefer "We help" or "I help".

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
- Early renewals often give more optionality and can reduce renewal risk compared with waiting` : ''}`;

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
${selectedAngle && typeof selectedAngle === 'object' ? `- **USE THE SELECTED ANGLE**: This email MUST focus on "${selectedAngle.primaryMessage || selectedAngle.label}". ${selectedAngle.id === 'demand_efficiency' ? 'You CAN mention demand charges since this angle is about demand efficiency.' : 'DO NOT mention "demand charges" or "delivery charges" - focus on ' + (selectedAngle.primaryMessage || selectedAngle.label) + ' instead. For example: timing_strategy → contract renewal timing; cost_control → rising electricity costs/budget pressure; exemption_recovery → tax exemptions; consolidation → multi-location management.'}` : '- DO NOT default to "demand charges" - vary the pain points you mention.'}
- OBSERVATION-BASED OPENING: MUST start with SPECIFIC observation about ${company || 'their company'}, NOT generic market facts
  ${marketContext?.enabled ? `
  - Market context is ENABLED - you may reference general market trends if relevant
  - BUT: Still lead with specific observation about ${company} first` : `
  - Market context is DISABLED - DO NOT use generic market statistics like "rates rising 15-25%"
  - DO NOT mention "data center demand" or generic rate increases
  - Focus ONLY on ${company}'s specific situation, industry challenges they face, or operational details
  - Use questions like "How is ${company} handling operations..." or "With ${accountDescription ? accountDescription.substring(0, 60) + '...' : 'your facilities'}, how are you..." (DO NOT use "I noticed")`}
- SPECIFIC VALUE: Include concrete numbers in value prop (percentages, dollar amounts, outcomes)
- MEASURABLE CLAIMS: "save ${marketContext?.typicalClientSavings || '10-20%'}" or "$X annually" NOT "significant savings"
- COMPLETE SENTENCES: Every sentence must have subject + verb + complete thought. NO incomplete phrases like "within [company]" or "like [company]"
- QUALIFYING CTAs: Prefer questions over meeting requests for cold emails
- SOCIAL PROOF: Use real outcomes when mentioning similar companies
- USE ACCOUNT DESCRIPTION: ${accountDescription ? 'Must naturally reference: "' + accountDescription + '"' : 'Reference their specific business'}
- NATURAL LANGUAGE: Write like a real person researching their company
- COMPANY SPECIFICITY: ALWAYS reference ${company} specifically. NEVER mention other companies by name in this email.
- NO SIZE ASSUMPTIONS: NEVER use "small company", "small business", "as a small company", "as a small business", "limited resources" - these can insult business owners. Use role/industry focus instead: "As CEO", "As a ${industry} company", "companies in ${industry}". Only use "large" if you have clear evidence it's a large enterprise.
- COMPLETE CTAs: CTA must be a complete sentence, not cut off or incomplete
- SINGLE CTA: Generate exactly ONE call to action per email
- PROPER ENDINGS: All CTAs must end with proper punctuation (? or .)

HUMAN TOUCH REQUIREMENTS (CRITICAL - Write Like an Expert Human, Not AI):
- Write like a knowledgeable energy expert who researched ${company || 'their company'} deeply
- ${marketContext?.enabled ? 'Market context is ENABLED, but still lead with specific question' : 'Market context is DISABLED - focus on THEIR specific situation only'}
- Show you did homework: When you have specific data, use QUESTIONS instead of observations:
  ${accountDescription ? '* PRIORITY: Use business focus for context: The business focus tells you their business type. Ask about their industry-specific challenges (e.g., "How are manufacturing companies like ' + company + ' handling energy costs?") but DO NOT mention the business focus text itself.' : '* Ask about [specific detail about their company]: "How is [specific detail] affecting your energy costs?"'}
  ${recentActivityContext ? '* Ask about ' + recentActivityContext.substring(0, 60) + '...: "With [recent activity], how has that impacted your planning?" (you have recent activity - USE THIS)' : '* DO NOT mention recent activity, recent news, or recent public activity - there is none available. Use account description, website, or contract timing instead'}
  ${websiteContext ? '* PRIORITY: Reference website through questions: "How are you handling [specific challenge from website]?" (you have website context - USE THIS as strong alternative)' : '* Reference website through questions: "How are you handling [specific challenge from website]?" (if available)'}
  ${city && marketContext?.enabled ? '* "Given ' + city + '\'s energy market conditions..." (you have location)' : ''}
  ${contractEndLabel && !marketContext?.enabled ? '* PRIORITY: "With your contract ending ' + contractEndLabel + '..." (use contract timing - strong hook when no recent activity)' : ''}
- Use natural transitions: "That's why...", "Given that...", "With ${contractEndLabel ? ('your contract ending ' + contractEndLabel) : '[specific situation]'}..."
- Include micro-observations: Reference their website, recent posts, industry trends they'd recognize through QUESTIONS
- Vary sentence length: Mix short punchy statements with longer explanatory ones
- Use conversational connectors: "Here's the thing...", "The reality is...", "What I've found..."
- Avoid AI patterns: NO "I wanted to reach out", "Hope this email finds you well", "I noticed", "I saw", "I read", "I've been tracking how companies..." or other template phrases
${marketContext?.enabled ? '- You may reference general market trends, but lead with specific question first' : '- DO NOT mention generic market statistics - focus on their specific situation'}
- Show expertise subtly: "In my experience with ${industry || '[industry]'} companies", ask questions about [specific trend about their company]
${tenure ? '- Use tenure naturally: "In your ' + tenure + ' as ' + job + ', how have you seen..." (tenure available)' : ''}

EVIDENCE OF RESEARCH (Show You Know Their Business):
${accountDescription ? '✓ PRIORITY: Use account description: Reference "' + accountDescription.substring(0, 100) + '..." naturally - this is your PRIMARY hook when no recent activity' : ''}
${linkedinContext ? '✓ Use company LinkedIn: Reference recent company posts or announcements' : ''}
${websiteContext ? '✓ PRIORITY: Use website info: Ask about specific challenges from their website (DO NOT say "I noticed") - strong alternative when no recent activity' : ''}
${recentActivityContext ? '✓ Use recent activity: Ask "With ' + recentActivityContext.substring(0, 60) + '..., how has that impacted..." (DO NOT say "I saw")' : '✗ DO NOT mention recent activity, recent news, recent public activity, or "no recent activity" - there is none available. INSTEAD, use account description, website context, contract timing, or industry-specific questions'}
${locationContextData ? '✓ Use location context: "Given ' + (city || '[location]') + '\'s energy market..."' : ''}
${contractEndLabel ? '✓ PRIORITY: Use contract timing: "With your contract ending ' + contractEndLabel + '..." - strong hook when no recent activity' : ''}
${squareFootage ? '✓ Use facility size: Reference ' + squareFootage.toLocaleString() + ' sq ft facility when relevant' : ''}
${employees ? '✓ Use scale: Reference ' + employees + ' employees when relevant' : ''}
${industry ? '✓ Use industry context: Reference ' + industry + ' industry challenges naturally through questions' : ''}

CONVERSATIONAL FLOW PATTERNS:
✓ GOOD: "With ${company} operating in ${industry || '[industry]'}, how are you handling energy costs for facilities like yours?"
✓ GOOD: "Given your role as ${job || '[role]'}, are you dealing with ${roleContext?.painPoints[0] || '[pain point]'}? Here's what I've found..."
✓ GOOD: "${industry || '[Industry]'} companies are facing [specific challenge]. How is ${company || '[Company]'} handling this?"
✓ GOOD: "Companies in ${industry || '[industry]'}" (not "your industry")
✗ BAD: "I wanted to reach out about..."
✗ BAD: "I hope this email finds you well..."
✗ BAD: "I'm reaching out because..."

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
${marketContext?.enabled ? `
Lead with SPECIFIC QUESTION about ${company} FIRST, then optionally reference market context:
- "With ${company} operating in ${city || '[location]'}, how are you handling contracts renewing in 2025?"
- "Given ${accountDescription ? accountDescription.substring(0, 60) + '...' : company + '\'s operations'}, how are energy costs impacting your budget?"
- "${industry || 'Your industry'} companies like ${company} are facing [specific challenge]. How are you addressing this?"` : `
Lead with SPECIFIC QUESTION about ${company} - NO generic market statistics:
- "With ${company} operating ${accountDescription ? accountDescription.substring(0, 60) + '...' : 'facilities in ' + (city || '[location]')}, how are you handling..."
- "With ${contractEndLabel ? ('your contract ending ' + contractEndLabel) : 'your current energy setup'}, how are you planning for..."
- "How is ${company} handling energy costs given [specific detail about their operations]?"
- "Companies with ${industryContent?.painPoints[0] || '[specific pain point]'} typically benefit from early planning. Is this on your radar?"
DO NOT mention: "rates rising 15-25%", "data center demand", generic market statistics
DO NOT use: "I noticed", "I saw", "I read"`}
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

CTA (CREATIVE, CONTENT-ALIGNED, NOT PERMISSION-BASED):
**CRITICAL**: Your CTA MUST naturally flow from the email content you just wrote above. It should feel like a natural continuation, not a disconnected ask.

- **MUST match the opening hook**: Reference the problem/challenge you mentioned in the opening (e.g., if you mentioned "contract renewal timing", ask about their renewal timeline)
- **MUST match the value proposition**: Reference the value/benefit you mentioned (e.g., if you mentioned "early renewal gives more optionality", ask about their renewal timing)
- **MUST match the industry**: ${industryLower ? `For ${industryLower} companies, use industry-specific language and challenges` : 'Use industry-appropriate language'}
- **MUST match the selected angle**: ${selectedAngle && typeof selectedAngle === 'object' ? `Focus on "${selectedAngle.primaryMessage || selectedAngle.label}" - use "${selectedAngle.openingTemplate || 'the angle\'s opening question'}" as inspiration, but be creative` : 'Use angle-appropriate language'}
- **MUST match the role**: ${job ? `For ${job} roles, focus on role-specific concerns` : ''}

**CREATIVE FREEDOM**:
- You have FULL CREATIVE CONTROL to create a natural, conversational question
- The angle and pattern are GUIDES, not templates - rephrase, combine, or create variations
- Make it feel like a real person asking a genuine question, not a sales script
- Examples of creative variations:
  ${selectedAngle && typeof selectedAngle === 'object' && selectedAngle.id === 'timing_strategy' ? '  * "When does your contract expire? Early renewal often gives more optionality compared with waiting."' : ''}
  ${selectedAngle && typeof selectedAngle === 'object' && selectedAngle.id === 'cost_control' ? '  * "How are you handling budget pressure from rising electricity costs?"' : ''}
  ${selectedAngle && typeof selectedAngle === 'object' && selectedAngle.id === 'exemption_recovery' ? '  * "Are you currently claiming electricity exemptions? Most manufacturers leave $75K-$500K unclaimed."' : ''}
  ${selectedAngle && typeof selectedAngle === 'object' && selectedAngle.id === 'consolidation' ? '  * "How many facilities are you managing energy for? Consolidating contracts typically means 10-20% savings."' : ''}
  * If email talks about contract renewal → "When does your contract expire?"
  * If email talks about rising costs → "How are you handling budget pressure from rising rates?"
  * If email talks about multiple locations → "How many facilities are you managing energy for?"

**ASSERTIVE PATTERNS** (use these styles - they assume conversation is happening):
- Direct questions: "When does your current contract renew?"
- Discovery questions: "How are you handling [specific challenge from email]?"
- Timing questions: "Are you locking in 6 months early or waiting closer to renewal?"
- Value questions: "Does [value from email] matter for your [role-specific concern]?"

**FORBIDDEN PERMISSION-BASED PATTERNS** (DO NOT USE):
- "Would you be open to a conversation?" (asking permission, weak)
- "Are you interested in learning more?" (permission-based)
- "Would you like to schedule a call?" (meeting request too early)
- "Open to discussing your energy setup?" (permission-based)

**Industry-specific CTA guidance**:
${industryLower === 'manufacturing' ? '- Manufacturing: Focus on production efficiency, equipment reliability, energy-intensive operations (e.g., "How are you handling energy costs for your production floor?")' : ''}
${industryLower === 'healthcare' ? '- Healthcare: Focus on budget constraints, patient care continuity (e.g., "How are rising electricity costs affecting your budget for patient care?")' : ''}
${industryLower === 'retail' ? '- Retail: Focus on multiple locations, seasonal demand (e.g., "How are you managing energy costs across your locations?")' : ''}
${industryLower === 'hospitality' ? '- Hospitality: Focus on guest comfort, operational costs (e.g., "How are you balancing guest comfort with energy costs?")' : ''}
${industryLower === 'education' ? '- Education: Focus on facility maintenance, budget optimization (e.g., "How are you handling energy costs while maintaining facility quality?")' : ''}

- Keep under 15 words
- Complete sentence with proper punctuation (? or .)
- MUST be complete sentence with proper ending punctuation
- NEVER cut off mid-sentence. ALWAYS end with proper punctuation (? or .)
- Generate ONLY ONE CTA

EMAIL GENERATION MODE: ${generationMode.toUpperCase()}
${modeInstructions ? `
Tone: ${modeInstructions.tone}
Approach: ${modeInstructions.approach}
CTA Style: ${modeInstructions.ctaStyle}
${generationMode === 'consultative' ? `
* Use discovery questions: "I'm curious..." "How do you typically..." "What matters more to you..."
* Lower pressure approach - understand their situation first` : ''}
${generationMode === 'direct' ? `
* Lead with specific insights: "Here's what I found..." "The reality is..."
* Assertive but respectful - present facts and ask direct questions` : ''}
${generationMode === 'balanced' ? `
* Combine question + value: Ask about their situation, then "Here's what I've found..."
* Professional but conversational - show expertise without being pushy` : ''}
` : ''}

SUBJECT LINE (MUST BE SPECIFIC, NOT VAGUE):
${suggestedSubject ? `SUGGESTED SUBJECT: "${suggestedSubject}" (use this pattern or similar)` : ''}
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

WORD COUNT TARGETS (CRITICAL):
- Email body (greeting + opening + value prop + CTA, excluding closing): 50-90 words MAXIMUM
- This is NOT a guideline. Keep it short. Do NOT write long paragraphs.
- Scanability beats completeness. Use 1-sentence paragraphs where possible.
- TOTAL LENGTH: 60-90 words for body content (scannable, not overwhelming - 2-3 short paragraphs)
CTA LENGTH: 8-15 words maximum, must be complete and assertive
TONE: Write like a 29-year-old Texas business pro - conversational, confident, direct, peer-to-peer
- Use contractions: "we're," "don't," "it's," "you're," "I'm"
- Vary sentence length: Short. Medium sentence. Longer explanation when needed.
- AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "unleash," "synergy"
- Sound like: colleague who knows their industry and has talked to others like them
- Use casual confidence: "Real question," "Out of curiosity," "Question for you," (use commas, not em dashes)
- **CRITICAL: NEVER use em dashes (—) or en dashes (–) after conversational phrases. Always use commas or natural flow. Examples: "Curious, " (NOT "Curious—"), "Question for you, " (NOT "Question for you—"). This is mandatory and will be rejected if violated.**
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
      logger.error('[Perplexity] Missing PERPLEXITY_API_KEY');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing API key' }));
      return;
    }

    const { 
      prompt, 
      mode = 'standard', 
      recipient = null, 
      to = '', 
      fromEmail = '', 
      senderName = 'Lewis Patterson', 
      whoWeAre, 
      marketContext, 
      meetingPreferences, 
      industrySegmentation,
      selectedAngle,
      toneOpener,
      emailPosition = 1, // 1, 2, or 3 for CTA escalation and subject progression
      previousAngles = [] // Array of angle IDs used in previous emails
    } = req.body || {};
    
    // Detect template type for both HTML and standard modes
    const templateType = getTemplateType(prompt);
    
    logger.log('[Perplexity] Template type:', templateType, 'for prompt:', prompt);
    
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
    
    const { prompt: systemPrompt, researchData, openingStyle: openingStyleUsed, dynamicFields } = await buildSystemPrompt({ 
      mode, 
      recipient, 
      to, 
      prompt, 
      senderName, 
      templateType, 
      whoWeAre, 
      marketContext, 
      meetingPreferences, 
      industrySegmentation,
      selectedAngle,
      toneOpener,
      emailPosition,
      previousAngles
    });
    
    // #region agent log
    const logDataPerplexity = {location:'perplexity-email.js:3201',message:'System prompt built',data:{hasToneOpenerRule:systemPrompt.includes('TONE OPENER'),toneOpenerProvided:toneOpener?.substring(0,30)||null,angleId:selectedAngle?.id||null,templateType:templateType||null,systemPromptLength:systemPrompt.length,systemPromptPreview:systemPrompt.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'};
    debugLog(logDataPerplexity);
    // #endregion
    
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
            { 
              role: 'system', 
              content: dateContext + (await buildSystemPrompt({ 
                mode, 
                recipient, 
                to, 
                prompt, 
                senderName, 
                templateType, 
                whoWeAre, 
                marketContext, 
                meetingPreferences, 
                industrySegmentation,
                selectedAngle,
                toneOpener,
                emailPosition,
                previousAngles
              })).prompt 
            },
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
        logger.error('[Perplexity] API error and fallback failed:', msg, fallbackErr);
        return res.writeHead(500, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'API error', detail: msg }));
      }
    }

    let content = data?.choices?.[0]?.message?.content || '';
    const citations = data?.citations || [];
    
    logger.log('[Perplexity] Response received, length:', content.length);
    
    // For HTML mode, return parsed JSON with template type
    if (mode === 'html' && content) {
      try {
        const jsonData = JSON.parse(content);
        logger.log('[Perplexity] Parsed JSON for template:', templateType);
        
        // Validate value proposition completeness for cold emails
        if (templateType === 'cold_email' && jsonData.value_proposition) {
          const incomplete = /\b(within|like|such as|including)\s+[A-Z][^.!?]*$/i.test(jsonData.value_proposition);
          if (incomplete) {
            logger.warn('[Validation] Incomplete value prop detected, fixing...');
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
            logger.warn('[Validation] Incomplete CTA detected, fixing...');
            jsonData.cta_text = 'Would you be open to discussing your current energy setup?';
          }
        }
        
        // Validate missing value propositions for cold emails
        if (templateType === 'cold_email' && (!jsonData.value_proposition || jsonData.value_proposition.trim() === '')) {
          logger.warn('[Validation] Missing value proposition detected, adding default...');
          const industry = recipient?.industry || 'businesses';
          jsonData.value_proposition = `We help ${industry} companies secure better rates before contracts expire. Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs.`;
        }
        
        // Validate missing opening_hook for cold emails
        if (templateType === 'cold_email' && (!jsonData.opening_hook || jsonData.opening_hook.trim() === '')) {
          logger.warn('[Validation] Missing opening_hook detected, adding default...');
          const company = recipient?.company || 'Companies';
          jsonData.opening_hook = `${company} are likely facing rising electricity costs with contracts renewing in 2025.`;
        }
        
        // Validate for duplicate CTAs and old CTAs in cold emails
        if (templateType === 'cold_email' && jsonData.cta_text) {
          // Check if the CTA contains multiple questions or meeting requests
          const hasMultipleQuestions = (jsonData.cta_text.match(/\?/g) || []).length > 1;
          const hasMeetingRequest = /does.*work.*call|tuesday|thursday|monday|wednesday|friday|15-minute|brief.*call|quick.*call|meeting|schedule|calendar/i.test(jsonData.cta_text);
          const hasTimeSlot = /\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)/i.test(jsonData.cta_text);
          
          // Check for old "second opinion" CTA
          const hasOldCta = /second opinion|10 minutes looking|spend.*minutes.*looking|ever want.*second/i.test(jsonData.cta_text);
          
          // If angle-based CTA should be used, check if it's missing or wrong
          const shouldUseAngleCta = selectedAngle && getAngleCta(selectedAngle);
          let hasAngleCta = false;
          
          if (shouldUseAngleCta) {
            const angleCta = getAngleCta(selectedAngle);
            const ctaLower = jsonData.cta_text.toLowerCase();
            // Check if CTA contains the angle's opening question (first 15-20 chars)
            const openingKey = angleCta.opening?.toLowerCase().substring(0, 20) || '';
            const angleId = selectedAngle.id || '';
            
            // Check for angle-specific keywords
            hasAngleCta = openingKey && ctaLower.includes(openingKey) ||
                         (angleId === 'timing_strategy' && (ctaLower.includes('contract expire') || ctaLower.includes('renewal'))) ||
                         (angleId === 'exemption_recovery' && (ctaLower.includes('exemption') || ctaLower.includes('claiming'))) ||
                         (angleId === 'consolidation' && (ctaLower.includes('location') || ctaLower.includes('facilit'))) ||
                         (angleId === 'demand_efficiency' && (ctaLower.includes('optimiz') || ctaLower.includes('consumption'))) ||
                         (angleId === 'operational_continuity' && (ctaLower.includes('peak') || ctaLower.includes('demand'))) ||
                         (angleId === 'mission_funding' && (ctaLower.includes('mission') || ctaLower.includes('funding'))) ||
                         (angleId === 'budget_stability' && (ctaLower.includes('budget') || ctaLower.includes('volatil'))) ||
                         (angleId === 'operational_simplicity' && (ctaLower.includes('supplier') || ctaLower.includes('vendor'))) ||
                         (angleId === 'cost_control' && (ctaLower.includes('predictab') || ctaLower.includes('cost'))) ||
                         (angleId === 'operational_efficiency' && (ctaLower.includes('efficien') || ctaLower.includes('operational'))) ||
                         (angleId === 'data_governance' && (ctaLower.includes('metering') || ctaLower.includes('reporting')));
          }
          
          if (hasMultipleQuestions || hasMeetingRequest || hasTimeSlot || hasOldCta || (shouldUseAngleCta && !hasAngleCta)) {
            logger.warn('[Validation] Invalid or missing angle-based CTA detected, replacing...', {
              hasOldCta,
              hasAngleCta,
              shouldUseAngleCta: !!shouldUseAngleCta,
              currentCta: jsonData.cta_text
            });
            // Use angle-based CTA if available
            if (shouldUseAngleCta) {
              const angleCta = getAngleCta(selectedAngle);
              jsonData.cta_text = angleCta.full;
              logger.log('[Validation] Replaced with angle-based CTA:', angleCta.full);
            } else {
              jsonData.cta_text = 'When does your current energy contract expire?';
            }
          }
        }
        
        // Validate and fix "Wondering how..." overuse in opening_hook
        if (templateType === 'cold_email' && jsonData.opening_hook && toneOpener) {
          const openingHookLower = jsonData.opening_hook.toLowerCase().trim();
          const hasWonderingHow = /^wondering how/i.test(openingHookLower);
          
          if (hasWonderingHow) {
            // Replace "Wondering how..." with tone opener style
            logger.warn('[Validation] "Wondering how..." detected, replacing with tone opener style:', toneOpener);
            
            // Extract the question part after "Wondering how [company] is handling..."
            const wonderingMatch = jsonData.opening_hook.match(/^wondering how [^?]+\?/i);
            const questionPart = wonderingMatch ? wonderingMatch[0].replace(/^wondering how /i, '') : '';
            
            // Convert tone opener to natural opener
            let naturalOpener = '';
            const toneOpenerLower = toneOpener.toLowerCase();
            // REMOVED "real talk" - not professional enough for corporate America
            if (toneOpenerLower.includes('honestly')) {
              naturalOpener = 'Honestly, ';
            } else if (toneOpenerLower.includes('curious')) {
              naturalOpener = 'Curious if ';
            } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
              naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
            } else if (toneOpenerLower.includes('out of curiosity')) {
              naturalOpener = 'Out of curiosity, ';
            } else if (toneOpenerLower.includes('question for you')) {
              naturalOpener = 'Question for you, ';
            } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
              naturalOpener = 'Most teams ';
            } else if (toneOpenerLower.includes('from what')) {
              naturalOpener = 'From what I\'m hearing, ';
            } else if (toneOpenerLower.includes('looking at')) {
              naturalOpener = 'Looking at your situation, ';
            } else if (toneOpenerLower.includes('so here')) {
              naturalOpener = 'So here\'s the thing, ';
            } else if (toneOpenerLower.includes('not sure')) {
              naturalOpener = 'Not sure if ';
            } else {
              naturalOpener = 'Curious if ';
            }
            
            // Rebuild opening hook with natural opener
            if (questionPart) {
              jsonData.opening_hook = naturalOpener + questionPart;
            } else {
              // Fallback: use tone opener directly
              const restOfHook = jsonData.opening_hook.replace(/^wondering how [^?]+\?/i, '').trim();
              jsonData.opening_hook = naturalOpener + restOfHook;
            }
            
            // Log the replacement
            fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'perplexity-email.js:3586','message':'Wondering how replacement applied','data':{originalPreview:jsonData.opening_hook.substring(0,100),replacedWith:naturalOpener,toneOpener},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
          }
        }
        
        // Validate no statistics in opening_hook for cold emails
        if (templateType === 'cold_email' && jsonData.opening_hook) {
          const hasStatistics = /\d+[-–]\d+%|\d+%|save \$\d+|reduce costs by|15-25%|20-30%|10-20%|data center.*\d+%|rates up \d+%/i.test(jsonData.opening_hook);
          if (hasStatistics) {
            logger.warn('[Validation] Statistics detected in opening_hook:', jsonData.opening_hook);
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
            logger.warn('[Validation] Fixed opening_hook:', jsonData.opening_hook);
          }
        }
        
        // Validate email length for cold emails (90-130 words optimal)
        if (templateType === 'cold_email') {
          const fullEmail = `${jsonData.greeting || ''} ${jsonData.opening_hook || ''} ${jsonData.value_proposition || ''} ${jsonData.cta_text || ''}`.trim();
          const wordCount = fullEmail.split(/\s+/).length;
          
          if (wordCount > 150) {
            logger.warn(`[Validation] Email too long (${wordCount} words), optimizing...`);
            // Only remove social proof if present
            if (jsonData.social_proof_optional) {
              jsonData.social_proof_optional = '';
            }
          } else if (wordCount < 80) {
            logger.warn(`[Validation] Email too short (${wordCount} words), expanding value proposition...`);
            // Only expand if value prop is very short
            if (jsonData.value_proposition && jsonData.value_proposition.length < 40) {
              jsonData.value_proposition = `${jsonData.value_proposition} Our clients typically save ${marketContext?.typicalClientSavings || '10-20%'} on annual energy costs.`;
            }
          }
        }
        
        // Final language polishing: de-salesify and personalize industry/size
        const sizeCategory = (recipient?.account ? (recipient.account.annualUsage ? (recipient.account.annualUsage < 500000 ? 'small' : (recipient.account.annualUsage < 5000000 ? 'medium' : 'large')) : null) : null);
        const personalizeCtx = { 
          industry: recipient?.industry || null, 
          companyName: recipient?.company || null, 
          sizeCategory,
          job: recipient?.title || recipient?.job || recipient?.role || null
        };
        
        // Log angle usage for debugging (selectedAngle is passed in req.body, not recipient)
        const selectedAngleFromBody = req.body?.selectedAngle;
        if (selectedAngleFromBody && typeof selectedAngleFromBody === 'object') {
          const angleId = selectedAngleFromBody.id || null;
          const angleFocus = selectedAngleFromBody.primaryMessage || selectedAngleFromBody.label || null;
          const openingHookText = jsonData.opening_hook || '';
          const hasDemandCharges = /(demand charges|delivery charges)/i.test(openingHookText);
          fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'perplexity-email.js:3530','message':'Angle usage in generated email','data':{angleId,angleFocus,company:recipient?.company,openingHookPreview:openingHookText.substring(0,150),hasDemandCharges,shouldHaveDemandCharges:angleId==='demand_efficiency'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        }
        
        // Log angle usage and opener variety for debugging
        if (selectedAngle && typeof selectedAngle === 'object') {
          const angleId = selectedAngle.id || null;
          const angleFocus = selectedAngle.primaryMessage || selectedAngle.label || null;
          const openingHookText = jsonData.opening_hook || '';
          const hasDemandCharges = /(demand charges|delivery charges)/i.test(openingHookText);
          const hasWonderingHow = /^wondering how/i.test(openingHookText.trim());
          const selectedToneOpener = req.body?.toneOpener || null;
          const usesSelectedOpener = selectedToneOpener && openingHookText.toLowerCase().includes(selectedToneOpener.toLowerCase().substring(0, 10));
          fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'perplexity-email.js:3530','message':'Angle and opener usage in generated email','data':{angleId,angleFocus,company:recipient?.company,openingHookPreview:openingHookText.substring(0,150),hasDemandCharges,shouldHaveDemandCharges:angleId==='demand_efficiency',selectedToneOpener,usesSelectedOpener,hasWonderingHow,openerVariety:hasWonderingHow?'low (defaulting to Wondering how)':'good (varied)'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        }
        
        // Helper function to sanitize percentages and fix "Default" references
        const sanitizePercentages = (text) => {
          if (!text) return text;
          return String(text)
            .replace(/15-20%/gi, '10-20%')
            .replace(/15-25%/gi, '10-20%');
        };
        
        if (jsonData.greeting) jsonData.greeting = sanitizePercentages(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.greeting, personalizeCtx))));
        if (jsonData.opening_hook) jsonData.opening_hook = removeEmDashes(sanitizePercentages(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.opening_hook, personalizeCtx)))));
        if (jsonData.value_proposition) jsonData.value_proposition = sanitizePercentages(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.value_proposition, personalizeCtx))));
        if (jsonData.social_proof_optional) jsonData.social_proof_optional = sanitizePercentages(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.social_proof_optional, personalizeCtx))));
        if (jsonData.cta_text) jsonData.cta_text = removeEmDashes(sanitizePercentages(removeCitationBrackets(deSalesify(personalizeIndustryAndSize(jsonData.cta_text, personalizeCtx)))));
        
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
        logger.warn('[Perplexity] JSON parse failed for HTML mode; returning plain text output fallback');
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
    // Sanitize percentages and personalize
    let polished = removeCitationBrackets(deSalesify(personalizeIndustryAndSize(content, personalizeCtxStd)));
    polished = polished
      .replace(/15-20%/gi, '10-20%')
      .replace(/15-25%/gi, '10-20%');
    return res.end(JSON.stringify({ 
      ok: true, 
      output: polished,
      citations: citations
    }));
    
  } catch (e) {
    logger.error('[Perplexity] Handler error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to generate email', message: e.message }));
  }
}
