/**
 * Apollo People Search Endpoint
 * Proxies requests to Apollo's /mixed_people/search endpoint
 * Used for the Prospecting page to find new contacts
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation, requireApolloAuth } from './_utils.js';
import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  
  const auth = await requireApolloAuth(req, res);
  if (!auth) return;

  try {
    const { 
      page = 1, 
      per_page = 10, 
      q_keywords,
      person_titles,
      person_locations,
      organization_ids,
      q_organization_domains,
      q_organization_domains_list,
      q_organization_name,
      organization_num_employees_ranges,
      revenue_range
    } = req.body || {};

    const APOLLO_API_KEY = getApiKey();

    const normalizeDomain = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0];

    // Apollo mixed_people/api_search: send EITHER q_organization_domains_list (array) OR q_organization_domains (single), not both (422 if both sent)
    const normalizedDomainsList = Array.isArray(q_organization_domains_list)
      ? q_organization_domains_list.map(normalizeDomain).filter(Boolean)
      : [];
    const hasDomainsList = normalizedDomainsList.length > 0;
    const rawSingleDomain = q_organization_domains && typeof q_organization_domains === 'string' ? q_organization_domains : undefined;
    const singleDomain = normalizeDomain(rawSingleDomain);

    const searchBody = {
      page,
      per_page: Math.min(per_page, 100), // Apollo max is 100
      q_keywords,
      person_titles,
      person_locations,
      organization_ids,
      q_organization_name,
      organization_num_employees_ranges,
      revenue_range,
    };
    if (hasDomainsList) {
      searchBody.q_organization_domains_list = normalizedDomainsList;
    } else if (singleDomain) {
      searchBody.q_organization_domains = singleDomain;
    }

    // Remove undefined keys
    Object.keys(searchBody).forEach(key =>
      searchBody[key] === undefined && delete searchBody[key]
    );
    const searchUrl = `${APOLLO_BASE_URL}/mixed_people/api_search`;
    const searchResp = await fetchWithRetry(searchUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify(searchBody)
    });

    if (!searchResp.ok) {
      const text = await searchResp.text();
      res.writeHead(searchResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();

    const rawPeople = searchData.people || [];

    // Map response to a clean format for the frontend
    const people = rawPeople.map(person => {
      // Robust location extraction
      let location = '';
      if (person.city || person.state || person.country) {
        location = formatLocation(person.city, person.state, person.country);
      } else if (person.organization?.city || person.organization?.state || person.organization?.country) {
        location = formatLocation(person.organization.city, person.organization.state, person.organization.country);
      } else {
        location = person.country || '';
      }

      const domain = person.organization?.primary_domain || person.organization?.domain;
      const firstName = person.first_name || '';
      const lastName = person.last_name || person.last_name_obfuscated || '';
      const fullName = person.name || `${firstName} ${lastName}`.trim();

      return {
        id: person.id,
        name: fullName,
        firstName: firstName,
        lastName: lastName,
        title: person.title || person.headline,
        company: person.organization?.name,
        companyId: person.organization_id,
        domain: domain,
        location: location,
        linkedin: person.linkedin_url,
        email: person.email, // Note: Often masked/null until enriched
        emailStatus: person.email_status,
        photoUrl: person.photo_url,
        seniority: person.seniority,
        departments: person.departments,
        organization: {
          id: person.organization?.id,
          name: person.organization?.name,
          domain: domain,
          logoUrl: person.organization?.logo_url,
          industry: person.organization?.industry || (person.organization?.industries || [])[0] || person.organization?.industry_category || (person.organization?.sic_codes?.[0] ? `SIC: ${person.organization.sic_codes[0]}` : null),
          employees: person.organization?.estimated_num_employees || person.organization?.employee_count || null, // STRICT: No growth metrics
          location: (person.organization && (person.organization.city || person.organization.state || person.organization.country))
            ? formatLocation(person.organization.city, person.organization.state, person.organization.country)
            : location // Fallback to person's location if org location is missing
        }
      };
    });

    // Persist searchable cache for Org Intelligence / Apollo panel re-use.
    // We keep the same shape used elsewhere in apollo_searches: { company, contacts, timestamp }.
    try {
      const firstOrg = rawPeople.find((p) => p?.organization)?.organization || null;
      const fallbackDomain = hasDomainsList
        ? normalizedDomainsList[0]
        : normalizeDomain(singleDomain);
      const companyDomain = normalizeDomain(firstOrg?.primary_domain || firstOrg?.domain || fallbackDomain || '');
      const companyName = firstOrg?.name || q_organization_name || '';

      const companySummary = {
        id: firstOrg?.id || '',
        name: companyName,
        domain: companyDomain,
        description: firstOrg?.short_description || firstOrg?.seo_description || '',
        employees: firstOrg?.estimated_num_employees || firstOrg?.employee_count || null,
        industry: firstOrg?.industry || (firstOrg?.industries && firstOrg.industries[0]) || '',
        city: firstOrg?.city || '',
        state: firstOrg?.state || '',
        country: firstOrg?.country || '',
        address: firstOrg?.raw_address || firstOrg?.street_address || '',
        logoUrl: firstOrg?.logo_url || null,
        linkedin: firstOrg?.linkedin_url || '',
        companyPhone: firstOrg?.phone || firstOrg?.sanitized_phone || '',
        zip: firstOrg?.postal_code || '',
        revenue: firstOrg?.annual_revenue_printed || ''
      };

      const contactsForCache = people.map((person) => ({
        id: person.id,
        name: person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        photoUrl: person.photoUrl || '',
        title: person.title || '',
        email: person.email || 'N/A',
        status: person.emailStatus === 'verified' ? 'verified' : 'unverified',
        isMonitored: false,
        location: person.location || '',
        linkedin: person.linkedin || '',
        phones: []
      }));

      const cacheData = {
        company: companySummary,
        contacts: contactsForCache,
        timestamp: Date.now(),
        source: 'search-people',
        stale: contactsForCache.length === 0,
        stale_until: contactsForCache.length === 0
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : null
      };

      const keys = [];
      if (companyDomain) keys.push(companyDomain);
      if (companyName && !keys.includes(companyName)) keys.push(companyName);

      if (keys.length > 0 && supabaseAdmin) {
        let shouldWriteCache = true;

        // Guardrail: never overwrite a non-empty cached contact set with an empty result.
        if (contactsForCache.length === 0) {
          const { data: existingRows } = await supabaseAdmin
            .from('apollo_searches')
            .select('key, data')
            .in('key', keys);

          const hasExistingNonEmpty = (existingRows || []).some((row) => {
            const existingContacts = row?.data?.contacts;
            return Array.isArray(existingContacts) && existingContacts.length > 0;
          });

          if (hasExistingNonEmpty) shouldWriteCache = false;
        }

        if (shouldWriteCache) {
          const rows = keys.map((key) => ({
            key,
            data: cacheData,
            updated_at: new Date().toISOString()
          }));
          await supabaseAdmin
            .from('apollo_searches')
            .upsert(rows, { onConflict: 'key' });
        }
      }
    } catch (cacheError) {
      console.warn('[Apollo Search People] Cache upsert failed:', cacheError?.message || cacheError);
    }

    // Construct pagination manually
    const total_entries = searchData.total_entries || searchData.pagination?.total_entries || 0;
    const total_pages = searchData.pagination?.total_pages || Math.ceil(total_entries / (Math.min(per_page, 100) || 10));
    
    const pagination = {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total_entries: total_entries,
        total_pages: total_pages
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      people,
      pagination: pagination
    }));

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: error.message 
    }));
  }
}



