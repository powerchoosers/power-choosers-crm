/**
 * Apollo People Enrichment Endpoint
 * Replaces Lusha /api/lusha/enrich endpoint
 * Features:
 * - Direct enrichment (no search required) - saves 50% credits
 * - Auto-save to Apollo contacts - makes future enrichments FREE
 * - Smart strategy selection based on cached data
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { 
      requestId, 
      contactIds, 
      contacts = [],  // NEW: Accept contact objects with cached data
      company, 
      name, 
      title, 
      revealEmails, 
      revealPhones 
    } = req.body || {};
    
    if (!contactIds || contactIds.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing contactIds' 
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    const enrichedContacts = [];
    
    // Apollo enrichment uses People Match endpoint
    // KEY ADVANTAGE: Apollo supports direct enrichment without search!
    // We can enrich by email, Apollo ID, or name+domain (saves 1 credit per contact)
    
    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      const cachedContact = contacts[i] || {}; // Fallback to empty object
      
      try {
        // 🎯 SMART ENRICHMENT STRATEGY (Priority Order):
        // 1. Email (best - most reliable)
        // 2. Apollo person ID (good - cached from previous search)
        // 3. Name + Domain (acceptable - still works)
        // 4. Fallback to Apollo ID from contactIds array
        
        const matchBody = {
          reveal_personal_emails: revealEmails !== false,
          reveal_phone_number: revealPhones === true  // Enable phone reveals with webhook
        };
        
        // If phone reveals are requested, provide webhook URL
        if (revealPhones === true) {
          // Construct webhook URL from request host
          // Use PUBLIC_BASE_URL env var if available, otherwise construct from headers
          let baseUrl = process.env.PUBLIC_BASE_URL;
          if (!baseUrl) {
             const protocol = req.headers['x-forwarded-proto'] || 'https';
             const host = req.headers['host'] || req.headers['x-forwarded-host'];
             baseUrl = `${protocol}://${host}`;
          }
          const webhookUrl = `${baseUrl}/api/apollo/phone-webhook`;
          const webhookUrlForApollo = /%[0-9A-Fa-f]{2}/.test(webhookUrl) ? webhookUrl : encodeURIComponent(webhookUrl);
          
          matchBody.webhook_url = webhookUrlForApollo;
          logger.log('[Apollo Enrich] 📞 Phone reveals enabled with webhook:', webhookUrlForApollo);
        }
        
        // Strategy 1: Use cached email (BEST - most reliable match)
        const emailToUse = cachedContact.email || (i === 0 ? req.body.email : null);
        if (emailToUse) {
          matchBody.email = emailToUse;
          logger.log('[Apollo Enrich] Using email strategy for:', emailToUse);
        }
        // Strategy 2: Use cached Apollo person ID (GOOD - from previous widget session)
        else if (cachedContact.apolloId || cachedContact.personId || cachedContact.id || (!cachedContact.id && contactId && contactId.length > 15)) {
          // If contactId looks like an Apollo ID (long string), use it
          matchBody.id = cachedContact.apolloId || cachedContact.personId || cachedContact.id || contactId;
          logger.log('[Apollo Enrich] Using Apollo ID strategy for:', matchBody.id);
        }
        // Strategy 3: Use name + domain/company (ACCEPTABLE - still works)
        // Apollo supports either first_name+last_name OR single name parameter
        // We can use domain OR organization_name
        else if (company?.domain || company?.name) {
          const firstName = cachedContact.firstName || (i === 0 ? req.body.firstName : null);
          const lastName = cachedContact.lastName || (i === 0 ? req.body.lastName : null);
          const fullName = cachedContact.fullName || cachedContact.name || (i === 0 ? req.body.name : null);

          // Set company context (prefer domain, fallback to name)
          if (company.domain) matchBody.domain = company.domain;
          if (company.name) matchBody.organization_name = company.name;

          // Try first_name + last_name first (more specific)
          if (firstName && lastName) {
            matchBody.first_name = firstName;
            matchBody.last_name = lastName;
            logger.log('[Apollo Enrich] Using first_name+last_name + company strategy');
          } else if (fullName) {
            // Fallback to name parameter
            matchBody.name = fullName;
            logger.log('[Apollo Enrich] Using name + company strategy');
          } else {
             logger.log('[Apollo Enrich] ⚠️ Missing name for company strategy. Contact:', cachedContact);
          }
        }
        // Strategy 4: Fallback to contactId as Apollo person ID
        else {
          matchBody.id = contactId;
          logger.log('[Apollo Enrich] Using contactId as Apollo ID (fallback):', contactId);
        }
        
        logger.log('[Apollo Enrich] Match request:', JSON.stringify(matchBody, null, 2));

        const url = `${APOLLO_BASE_URL}/people/match`;
        const resp = await fetchWithRetry(url, {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'X-Api-Key': APOLLO_API_KEY
          },
          body: JSON.stringify(matchBody)
        });

        if (!resp.ok) {
          const text = await resp.text();
          logger.error('[Apollo Enrich] API error for contact', contactId, ':', resp.status, text);
          continue;
        }

        const data = await resp.json();
        logger.log('[Apollo Enrich] Response for', contactId, '- person found:', !!data.person);
        
        if (data.person) {
          const mappedContact = mapApolloContactToLushaFormat(data.person);
          enrichedContacts.push(mappedContact);
          
          // 💰 CREDIT OPTIMIZATION: Auto-save to Apollo contacts
          // Makes future enrichments of this person FREE!
          try {
            await saveToApolloContacts(data.person, APOLLO_API_KEY);
          } catch (saveError) {
            // Log but don't fail the enrichment if save fails
            logger.error('[Apollo Enrich] Failed to save contact to Apollo:', saveError.message);
          }
        }
      } catch (error) {
        logger.error('[Apollo Enrich] Error enriching contact', contactId, ':', error);
        continue;
      }
    }
    
    const response = {
      contacts: enrichedContacts,
      requestId: requestId || 'apollo_enrich_' + Date.now()
    };
    
    logger.log('[Apollo Enrich] Final response:', enrichedContacts.length, 'contacts enriched');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    logger.error('[Apollo Enrich] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloContactToLushaFormat(apolloPerson) {
  // Extract phone numbers
  const phones = (apolloPerson.phone_numbers || [])
    .map(p => ({
      number: p.sanitized_number || p.raw_number,
      type: p.type || 'work'
    }));

  // Extract emails (filter out placeholders)
  const emails = [];
  if (apolloPerson.email && !apolloPerson.email.includes('email_not_unlocked')) {
    emails.push({
      address: apolloPerson.email,
      type: 'work',
      status: apolloPerson.email_status
    });
  } else if (apolloPerson.email) {
    logger.log('[Apollo Enrich] 📧 Filtering out placeholder email:', apolloPerson.email);
  }

  // Check for specific phone types
  const hasMobilePhone = phones.some(p => 
    (p.type || '').toLowerCase().includes('mobile')
  );
  const hasDirectPhone = phones.some(p => 
    (p.type || '').toLowerCase().includes('direct') ||
    (p.type || '').toLowerCase().includes('work')
  );

  return {
    contactId: apolloPerson.id,
    id: apolloPerson.id,
    firstName: apolloPerson.first_name || '',
    lastName: apolloPerson.last_name || '',
    fullName: apolloPerson.name || `${apolloPerson.first_name} ${apolloPerson.last_name}`.trim(),
    jobTitle: apolloPerson.title || apolloPerson.headline || '',
    companyName: apolloPerson.organization?.name || '',
    companyId: apolloPerson.organization_id || '',
    fqdn: apolloPerson.organization?.primary_domain || '',
    emails: emails,
    phones: phones,
    email: emails[0]?.address || '',
    phone: phones[0]?.number || '',
    hasEmails: emails.length > 0,
    hasPhones: phones.length > 0,
    hasMobilePhone: hasMobilePhone,
    hasDirectPhone: hasDirectPhone,
    linkedin: apolloPerson.linkedin_url || '',
    location: formatLocation(apolloPerson.city, apolloPerson.state, apolloPerson.country),
    city: apolloPerson.city || '',
    state: apolloPerson.state || '',
    country: apolloPerson.country || '',
    industry: apolloPerson.organization?.industry || (apolloPerson.organization?.industries && apolloPerson.organization.industries[0]) || '',
    seniority: apolloPerson.seniority || '',
    // Department/functional area (if Apollo provides it)
    department: apolloPerson.department || '',
    photoUrl: apolloPerson.photo_url || '',
    isSuccess: true
  };
}

/**
 * Save enriched person to Apollo contacts
 * Makes their data permanently accessible for FREE in future enrichments
 * @param {Object} apolloPerson - Apollo person data
 * @param {string} apiKey - Apollo API key
 */
async function saveToApolloContacts(apolloPerson, apiKey) {
  try {
    // Extract direct and mobile phone numbers
    const phoneNumbers = apolloPerson.phone_numbers || [];
    const directPhone = phoneNumbers.find(p => 
      (p.type || '').toLowerCase().includes('direct') || 
      (p.type || '').toLowerCase().includes('work')
    );
    const mobilePhone = phoneNumbers.find(p => 
      (p.type || '').toLowerCase().includes('mobile')
    );
    
    // Build contact creation request
    const contactData = {
      first_name: apolloPerson.first_name,
      last_name: apolloPerson.last_name,
      email: apolloPerson.email,
      organization_name: apolloPerson.organization?.name,
      website_url: apolloPerson.organization?.website_url || apolloPerson.organization?.primary_domain
    };
    
    // Add phone numbers if available
    if (directPhone) {
      contactData.direct_phone = directPhone.raw_number || directPhone.sanitized_number;
    }
    if (mobilePhone) {
      contactData.mobile_phone = mobilePhone.raw_number || mobilePhone.sanitized_number;
    }
    
    logger.log('[Apollo Enrich] Saving to contacts:', apolloPerson.email);
    
    const saveUrl = `${APOLLO_BASE_URL}/contacts`;
    const saveResp = await fetchWithRetry(saveUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(contactData)
    });
    
    if (saveResp.ok) {
      logger.log('[Apollo Enrich] Successfully saved to contacts - future enrichments FREE!');
    } else {
      const errorText = await saveResp.text();
      logger.warn('[Apollo Enrich] Contact save failed:', saveResp.status, errorText);
    }
  } catch (error) {
    logger.error('[Apollo Enrich] Error saving to contacts:', error);
    throw error;
  }
}

