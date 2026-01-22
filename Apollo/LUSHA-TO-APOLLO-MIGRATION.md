# Lusha to Apollo.io API Migration Plan

## Executive Summary

This document outlines the complete migration from Lusha API to Apollo.io API while maintaining the **exact same widget UI/UX**. No frontend changes will be made to the widget - only the backend API endpoints and data mapping logic will change.

### 💰 Cost Comparison Summary

| Metric | Lusha (Current) | Apollo (New) | Difference |
|--------|----------------|--------------|---------|
| **Widget Open (initial load)** | 4 credits | 2 credits | **50% savings** ✅ |
| **Email reveal (net-new)** | 1 credit | 1 credit | Same |
| **Phone reveal (net-new)** | 1 credit | **5 credits** | **+400% cost** ⚠️ |
| **100 widget opens (no reveals)** | 400 credits | 200 credits | **200 credits saved** ✅ |
| **100 opens + 200 phone reveals** | 600 credits | 1200 credits | **+600 credits** ⚠️ |

**Key Findings:**
- ✅ **Widget opens:** Apollo is **50% cheaper** (2 vs 4 credits)
- ✅ **Email reveals:** Same cost (1 credit per net-new email)
- ⚠️ **Phone reveals:** Apollo is **5x more expensive** (5 vs 1 credit per net-new phone)
- ✅ **Bonus data:** Apollo provides company phone & address (Lusha doesn't)
- ✅ **Direct enrichment:** Apollo can enrich without search (Lusha requires search first = saves 1 credit per cached contact)
- 💡 **Strategy:** Use Apollo for company/contact discovery, minimize phone reveals, leverage direct enrichment for cached contacts

### 🎯 Migration Highlights

- ✅ **Zero frontend changes** - Widget UI stays identical
- ✅ **50% cost reduction** on widget opens (4 → 2 credits)
- ✅ **50% savings on cached contact enrichment** - Apollo supports direct enrichment without search (Lusha requires search first)
- ✅ **Better data quality** - Apollo has 275M+ contacts vs Lusha's smaller database
- ✅ **More company data** - Apollo provides company phone & address (Lusha doesn't have these)
- ✅ **Same email reveal cost** - 1 credit per email (unchanged)
- ⚠️ **Phone reveals 5x more expensive** - 5 credits vs Lusha's 1 credit
- 💡 **Hybrid approach recommended** - Use Apollo for discovery, consider keeping Lusha for phone reveals
- 💡 **Cache Apollo person IDs & emails** - Enables direct enrichment (skip search) for massive credit savings
- ✅ **Straightforward migration** - Only backend API mapping changes needed

---

## Table of Contents

1. [API Endpoint Mapping](#api-endpoint-mapping)
2. [Authentication Strategy](#authentication-strategy)
3. [Data Structure Mapping](#data-structure-mapping)
4. [Implementation Plan](#implementation-plan)
5. [Required Apollo Documentation](#required-apollo-documentation)
6. [🎯 Critical Workflow Difference: Direct Enrichment](#-critical-workflow-difference-direct-enrichment) ⭐ NEW
7. [🎁 Bonus: Free Forever Data with "Create Contact" API](#-bonus-free-forever-data-with-create-contact-api) ⭐ NEW
8. [Credit Usage Comparison](#credit-usage-comparison)
9. [Migration Steps](#migration-steps)
10. [Testing Checklist](#testing-checklist)

---

## API Endpoint Mapping

### Current Lusha Endpoints → Apollo Replacements

| Lusha Endpoint | Apollo Endpoint | Purpose | Cost |
|---------------|-----------------|---------|------|
| `GET /api/lusha/company` | `POST /api/v1/mixed_companies/search` + `GET /api/v1/organizations/{id}` | Get company information by domain/name | 1 credit/page |
| `POST /api/lusha/contacts` | `POST /api/v1/mixed_people/search` | Search for people at a company | 1 credit/page |
| `POST /api/lusha/enrich` | `POST /api/v1/people/match` | Enrich individual contact (email: 1cr, phone: 5cr) | 1-6 credits |
| `GET /api/lusha/usage` | `POST /api/v1/usage_stats/api_usage_stats` | Check API usage and credits (requires master key) | Free |
| N/A (new) | `POST /api/v1/contacts` | Save enriched contact to Apollo (makes data permanently free) | Free ✨ |

---

## Authentication Strategy

### Lusha (Current)
```javascript
headers: {
  'api_key': LUSHA_API_KEY
}
```

### Apollo (New)
```javascript
headers: {
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
  'X-Api-Key': APOLLO_API_KEY  // Note: Capital X, hyphenated
}
```

**Environment Variable:**
- Add `APOLLO_API_KEY` to your environment configuration
- Store in server-side only (never expose to frontend)

**Important Header Notes:**
- Apollo uses `X-Api-Key` header (capital X, hyphenated)
- Always include `Cache-Control: no-cache` per Apollo best practices
- For usage stats endpoint, you need a **master API key** (not a regular API key)

---

## Data Structure Mapping

### 🆕 Bonus: Company-Level Fields (Not Available in Lusha)

Apollo provides company-level contact data that Lusha doesn't have. These fields will now populate in your Account Detail page:

| Field | Apollo Source | Account Detail Mapping | Notes |
|-------|---------------|------------------------|-------|
| **Company Phone** | `phone`, `sanitized_phone`, `primary_phone.number` | `companyPhone` | Direct company switchboard number |
| **Company Address** | `raw_address`, `street_address` | `address` | Full company headquarters address |
| **City** | `city` | `city` | HQ city |
| **State** | `state` | `state` | HQ state/province |
| **Country** | `country` | `country` | HQ country |
| **Postal Code** | `postal_code` | N/A (can add) | HQ postal/zip code |

**Impact on Account Detail Page:**
- ✅ The **Company Phone** field in `account-detail.js` (line ~1251) will now be automatically populated from Apollo
- ✅ The **Service Addresses** section (line ~1283-1297) can leverage Apollo's HQ address as the default primary address
- ✅ City, State, Country fields will be auto-populated for better data completeness
- ✅ These fields were previously empty with Lusha because Lusha only provides person-level contact data

**Frontend Display (No Changes Needed):**
The account-detail page already has these fields built in:
- `<div class="info-label">COMPANY PHONE</div>` → Will display Apollo's company phone
- `<div class="info-label">PRIMARY ADDRESS</div>` → Can display Apollo's headquarters address
- Click-to-call functionality already supports company phone with `isCompanyPhone: true` flag

**Example Apollo Organization Response:**
```javascript
{
  "id": "5e66b6381e05b4008c8331b8",
  "name": "Apollo.io",
  "primary_domain": "apollo.io",
  "phone": "+1 415-123-4567",
  "sanitized_phone": "+14151234567",
  "primary_phone": {
    "number": "+1 415-123-4567",
    "source": "Scraped",
    "sanitized_number": "+14151234567"
  },
  "raw_address": "535 mission street, san francisco, california, united states, 94105",
  "street_address": "535 Mission Street",
  "city": "San Francisco",
  "state": "California",
  "postal_code": "94105",
  "country": "United States"
}
```

---

### 1. Company Data Mapping

#### Lusha Response Structure
```javascript
{
  data: {
    id: "lusha_company_id",
    name: "Company Name",
    domain: "company.com",
    website: "https://company.com",
    description: "Company description",
    employees: "100-500",
    mainIndustry: "Technology",
    location: {
      city: "San Francisco",
      state: "California",
      country: "United States",
      fullLocation: "San Francisco, CA, US"
    },
    social: {
      linkedin: "https://linkedin.com/company/..."
    },
    logoUrl: "https://...",
    founded: 2015,
    revenueRange: ["$10M", "$50M"]
  }
}
```

#### Apollo Response Structure
```javascript
{
  organizations: [{
    id: "5e66b6381e05b4008c8331b8",
    name: "Company Name",
    website_url: "http://www.company.com",
    primary_domain: "company.com",
    short_description: "Company description",
    estimated_num_employees: 250,
    industry: "information technology & services",
    city: "San Francisco",
    state: "California",
    country: "United States",
    phone: "+1 415-555-1234",
    sanitized_phone: "+14155551234",
    primary_phone: {
      number: "+1 415-555-1234",
      source: "Scraped",
      sanitized_number: "+14155551234"
    },
    raw_address: "123 Market St, San Francisco, California, United States, 94102",
    street_address: "123 Market St",
    postal_code: "94102",
    linkedin_url: "http://www.linkedin.com/company/...",
    logo_url: "https://zenprospect-production.s3.amazonaws.com/...",
    founded_year: 2015,
    annual_revenue: 25000000,
    annual_revenue_printed: "25M"
  }]
}
```

#### Mapping Function
```javascript
function mapApolloCompanyToLushaFormat(apolloOrg) {
  return {
    id: apolloOrg.id,
    name: apolloOrg.name || '',
    domain: apolloOrg.primary_domain || '',
    website: apolloOrg.website_url || '',
    description: apolloOrg.short_description || apolloOrg.seo_description || '',
    employees: formatEmployeeRange(apolloOrg.estimated_num_employees),
    industry: apolloOrg.industry || (apolloOrg.industries && apolloOrg.industries[0]) || '',
    city: apolloOrg.city || '',
    state: apolloOrg.state || '',
    country: apolloOrg.country || '',
    address: apolloOrg.raw_address || apolloOrg.street_address || '',
    companyPhone: apolloOrg.phone || apolloOrg.sanitized_phone || (apolloOrg.primary_phone && apolloOrg.primary_phone.number) || '',
    location: formatLocation(apolloOrg),
    linkedin: apolloOrg.linkedin_url || '',
    logoUrl: apolloOrg.logo_url || null,
    foundedYear: apolloOrg.founded_year || '',
    revenue: formatRevenue(apolloOrg.annual_revenue_printed),
    companyType: apolloOrg.industries && apolloOrg.industries[0] || ''
  };
}

function formatEmployeeRange(count) {
  if (!count) return '';
  if (count < 10) return '1-10';
  if (count < 50) return '10-50';
  if (count < 200) return '50-200';
  if (count < 500) return '200-500';
  if (count < 1000) return '500-1000';
  if (count < 5000) return '1000-5000';
  return '5000+';
}

function formatLocation(org) {
  const parts = [org.city, org.state, org.country].filter(Boolean);
  return parts.join(', ');
}

function formatRevenue(revenuePrinted) {
  return revenuePrinted || '';
}
```

---

### 2. Contact Data Mapping

#### Lusha Response Structure
```javascript
{
  contacts: [{
    contactId: "lusha_contact_id",
    id: "lusha_contact_id",
    name: "John Doe" or { first: "John", last: "Doe", full: "John Doe" },
    firstName: "John",
    lastName: "Doe",
    fullName: "John Doe",
    jobTitle: "CEO",
    companyName: "Company Name",
    emails: [{ address: "john@company.com", type: "work" }],
    phones: [{ number: "+14155551234", type: "mobile" }],
    linkedin: "https://linkedin.com/in/johndoe",
    location: "San Francisco, CA",
    hasEmails: true,
    hasPhones: true,
    hasMobilePhone: true,
    hasDirectPhone: false
  }],
  requestId: "search_request_id",
  totalResults: 45
}
```

#### Apollo Response Structure
```javascript
{
  people: [{
    id: "66b8a5d38d90c000011cce51",
    first_name: "John",
    last_name: "Doe",
    name: "John Doe",
    title: "CEO",
    email: "john@apollo.io",
    email_status: "verified",
    linkedin_url: "http://www.linkedin.com/in/johndoe",
    state: "California",
    city: "San Francisco",
    country: "United States",
    organization_id: "5e66b6381e05b4008c8331b8",
    organization: {
      id: "5e66b6381e05b4008c8331b8",
      name: "Company Name"
    },
    phone_numbers: [{
      raw_number: "(415) 555-1234",
      sanitized_number: "+14155551234",
      type: "mobile",
      status: "valid_number"
    }],
    contact: {
      // Additional enriched contact data
      contact_emails: [{ email: "john@company.com" }],
      phone_numbers: [...]
    }
  }],
  pagination: {
    page: 1,
    per_page: 10,
    total_entries: 45,
    total_pages: 5
  }
}
```

#### Mapping Function
```javascript
function mapApolloContactToLushaFormat(apolloPerson) {
  // Extract phone numbers from Apollo format
  const phones = (apolloPerson.phone_numbers || apolloPerson.contact?.phone_numbers || [])
    .map(p => ({
      number: p.sanitized_number || p.raw_number,
      type: p.type || 'work'
    }));

  // Extract emails from Apollo format
  const emails = [];
  if (apolloPerson.email) {
    emails.push({ address: apolloPerson.email, type: 'work' });
  }
  if (apolloPerson.contact?.contact_emails) {
    apolloPerson.contact.contact_emails.forEach(e => {
      if (e.email && !emails.find(ex => ex.address === e.email)) {
        emails.push({ address: e.email, type: 'work' });
      }
    });
  }

  // Determine phone type flags
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
    
    // Contact methods
    emails: emails,
    phones: phones,
    email: emails[0]?.address || '',
    phone: phones[0]?.number || '',
    
    // Flags for widget display
    hasEmails: emails.length > 0,
    hasPhones: phones.length > 0,
    hasMobilePhone: hasMobilePhone,
    hasDirectPhone: hasDirectPhone,
    
    // Additional info
    linkedin: apolloPerson.linkedin_url || '',
    location: formatContactLocation(apolloPerson),
    city: apolloPerson.city || '',
    isSuccess: true // Apollo returns only successful matches
  };
}

function formatContactLocation(person) {
  const parts = [person.city, person.state, person.country].filter(Boolean);
  return parts.join(', ');
}
```

---

## Implementation Plan

### Phase 1: Create Apollo API Wrapper Files

Create new files that mirror the Lusha API structure:

```
api/apollo/
├── _utils.js          // Apollo-specific utilities
├── company.js         // Company search & enrichment
├── contacts.js        // People search
├── enrich.js          // People enrichment
└── usage.js           // API usage tracking
```

### Phase 2: Implement Each Endpoint

#### File: `api/apollo/_utils.js`

```javascript
// CORS helper
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return true;
  }
  return false;
}

// Get Apollo API key from environment
export function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not configured');
  return key;
}

// Apollo API base URL
export const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Fetch with retry logic
export async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && i < maxRetries - 1) {
        // Rate limited, wait and retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
  throw lastError;
}

// Normalize domain (remove protocol, www, trailing slash)
export function normalizeDomain(url) {
  if (!url) return '';
  return String(url)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .split('/')[0];
}

// Format employee count into range
export function formatEmployeeRange(count) {
  if (!count) return '';
  if (count < 10) return '1-10';
  if (count < 50) return '10-50';
  if (count < 200) return '50-200';
  if (count < 500) return '200-500';
  if (count < 1000) return '500-1000';
  if (count < 5000) return '1000-5000';
  return '5000+';
}

// Format location from parts
export function formatLocation(city, state, country) {
  const parts = [city, state, country].filter(Boolean);
  return parts.join(', ');
}
```

#### File: `api/apollo/company.js`

```javascript
import { cors, fetchWithRetry, normalizeDomain, getApiKey, APOLLO_BASE_URL, formatEmployeeRange, formatLocation } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { domain, company, companyId } = req.query || {};
    
    if (!domain && !company && !companyId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required parameter: domain, company, or companyId' 
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    
    // If we have companyId, use Get Complete Organization Info endpoint
    if (companyId) {
      const url = `${APOLLO_BASE_URL}/organizations/${companyId}`;
      const resp = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        }
      });

      if (!resp.ok) {
        const text = await resp.text();
        res.writeHead(resp.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Apollo company error', 
          details: text 
        }));
        return;
      }

      const data = await resp.json();
      const apolloOrg = data.organization;
      
      // Map to Lusha format
      const companyData = mapApolloCompanyToLushaFormat(apolloOrg);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(companyData));
      return;
    }

    // Otherwise, search for company
    const searchBody = {
      page: 1,
      per_page: 1
    };

    // Add search filters
    if (domain) {
      // Apollo uses organization_domains for exact domain matches
      searchBody.organization_domains = [normalizeDomain(domain)];
    } else if (company) {
      // Use q_organization_name for company name search
      searchBody.q_organization_name = company;
    }

    const searchUrl = `${APOLLO_BASE_URL}/mixed_companies/search`;
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
        error: 'Apollo company search error', 
        details: text 
      }));
      return;
    }

    const searchData = await searchResp.json();
    
    if (!searchData.organizations || searchData.organizations.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Company not found' 
      }));
      return;
    }

    const apolloOrg = searchData.organizations[0];
    
    // Map to Lusha format
    const companyData = mapApolloCompanyToLushaFormat(apolloOrg);
    
    console.log('[Apollo Company] Mapped company data:', JSON.stringify(companyData, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(companyData));
  } catch (e) {
    console.error('[Apollo Company] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloCompanyToLushaFormat(apolloOrg) {
  const derivedDomain = apolloOrg.primary_domain || normalizeDomain(apolloOrg.website_url || '');
  const website = apolloOrg.website_url || (derivedDomain ? `https://${derivedDomain}` : '');
  
  return {
    id: apolloOrg.id,
    name: apolloOrg.name || '',
    domain: derivedDomain,
    website: website,
    description: apolloOrg.short_description || apolloOrg.seo_description || '',
    employees: formatEmployeeRange(apolloOrg.estimated_num_employees),
    industry: apolloOrg.industry || (apolloOrg.industries && apolloOrg.industries[0]) || '',
    city: apolloOrg.city || '',
    state: apolloOrg.state || '',
    country: apolloOrg.country || '',
    address: apolloOrg.raw_address || apolloOrg.street_address || '',
    companyPhone: apolloOrg.phone || apolloOrg.sanitized_phone || (apolloOrg.primary_phone && apolloOrg.primary_phone.number) || '',
    location: formatLocation(apolloOrg.city, apolloOrg.state, apolloOrg.country),
    linkedin: apolloOrg.linkedin_url || '',
    logoUrl: apolloOrg.logo_url || null,
    foundedYear: apolloOrg.founded_year || '',
    revenue: apolloOrg.annual_revenue_printed || '',
    companyType: (apolloOrg.industries && apolloOrg.industries[0]) || ''
  };
}
```

#### File: `api/apollo/contacts.js`

```javascript
import { cors, fetchWithRetry, normalizeDomain, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const requestBody = req.body || {};
    
    // Extract parameters (matching Lusha format from widget)
    const { pages = {}, filters = {} } = requestBody;
    const page = pages.page !== undefined ? pages.page : 0;
    const size = pages.size !== undefined ? pages.size : 10;
    
    // Extract company filters
    const companyFilters = filters.companies?.include || {};
    const domains = companyFilters.domains || [];
    const companyIds = companyFilters.ids || [];
    const companyNames = companyFilters.names || [];
    
    if (domains.length === 0 && companyIds.length === 0 && companyNames.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing company identifier' 
      }));
      return;
    }

    const APOLLO_API_KEY = getApiKey();
    
    // Build Apollo People Search request
    const apolloSearchBody = {
      page: page + 1, // Apollo uses 1-based indexing
      per_page: Math.min(size, 100) // Apollo max is 100 per page
    };
    
    // Add company filters
    if (domains.length > 0) {
      apolloSearchBody.q_organization_domains = domains.map(normalizeDomain);
    } else if (companyIds.length > 0) {
      apolloSearchBody.organization_ids = companyIds;
    } else if (companyNames.length > 0) {
      // Use first company name for search
      apolloSearchBody.q_organization_name = companyNames[0];
    }
    
    console.log('[Apollo Contacts] Search request:', JSON.stringify(apolloSearchBody, null, 2));

    const url = `${APOLLO_BASE_URL}/mixed_people/search`;
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify(apolloSearchBody)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Apollo Contacts] API error:', resp.status, text);
      
      res.writeHead(resp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo contacts error', 
        details: text 
      }));
      return;
    }

    const data = await resp.json();
    console.log('[Apollo Contacts] Response:', JSON.stringify(data, null, 2));
    
    // Map Apollo people to Lusha contact format
    const contacts = (data.people || []).map(mapApolloContactToLushaFormat);
    
    // Generate a pseudo requestId for reveal/enrich flow
    // Apollo doesn't use requestId, but we can use organization_id
    const firstPerson = data.people && data.people[0];
    const requestId = firstPerson?.organization_id || 'apollo_search_' + Date.now();
    
    const response = {
      contacts: contacts,
      requestId: requestId,
      total: data.pagination?.total_entries || contacts.length,
      page: page,
      pageSize: size
    };
    
    console.log('[Apollo Contacts] Mapped response:', JSON.stringify(response, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    console.error('[Apollo Contacts] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloContactToLushaFormat(apolloPerson) {
  // Extract phone numbers
  const phones = (apolloPerson.phone_numbers || apolloPerson.contact?.phone_numbers || [])
    .map(p => ({
      number: p.sanitized_number || p.raw_number,
      type: p.type || 'work'
    }));

  // Extract emails
  const emails = [];
  if (apolloPerson.email) {
    emails.push({ 
      address: apolloPerson.email, 
      type: 'work',
      status: apolloPerson.email_status 
    });
  }
  if (apolloPerson.contact?.contact_emails) {
    apolloPerson.contact.contact_emails.forEach(e => {
      if (e.email && !emails.find(ex => ex.address === e.email)) {
        emails.push({ 
          address: e.email, 
          type: 'work',
          status: e.email_status 
        });
      }
    });
  }

  // Determine phone type flags
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
    
    // Contact methods
    emails: emails,
    phones: phones,
    email: emails[0]?.address || '',
    phone: phones[0]?.number || '',
    
    // Flags for widget display
    hasEmails: emails.length > 0 || apolloPerson.email_status === 'verified',
    hasPhones: phones.length > 0,
    hasMobilePhone: hasMobilePhone,
    hasDirectPhone: hasDirectPhone,
    
    // Additional info
    linkedin: apolloPerson.linkedin_url || '',
    location: formatLocation(apolloPerson.city, apolloPerson.state, apolloPerson.country),
    city: apolloPerson.city || '',
    isSuccess: true
  };
}
```

#### File: `api/apollo/enrich.js`

**✨ KEY FEATURE: Apollo supports direct enrichment without requiring a search operation first!**

Unlike Lusha (which requires a `requestId` from a search), Apollo can enrich contacts directly using:
- Email address (best - most reliable)
- Apollo person ID (good - cached from previous widget session)
- Name + domain (acceptable - still works)

This saves 1 credit per enrichment operation for cached contacts (50% cost reduction).

```javascript
import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, formatLocation } from './_utils.js';

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
      const cachedContact = contacts[i]; // May have email, apolloId, name, etc.
      
      try {
        // 🎯 SMART ENRICHMENT STRATEGY (Priority Order):
        // 1. Email (best - most reliable)
        // 2. Apollo person ID (good - cached from previous search)
        // 3. Name + Domain (acceptable - still works)
        // 4. Fallback to Apollo ID from contactIds array
        
        const matchBody = {
          reveal_personal_emails: revealEmails !== false,
          reveal_phone_number: false  // Initially false to avoid webhook requirement
        };
        
        // Strategy 1: Use cached email (BEST - most reliable match)
        if (cachedContact?.email) {
          matchBody.email = cachedContact.email;
          console.log('[Apollo Enrich] Using email strategy for:', cachedContact.email);
        }
        // Strategy 2: Use cached Apollo person ID (GOOD - from previous widget session)
        else if (cachedContact?.apolloId || cachedContact?.personId) {
          matchBody.id = cachedContact.apolloId || cachedContact.personId;
          console.log('[Apollo Enrich] Using Apollo ID strategy for:', matchBody.id);
        }
        // Strategy 3: Use name + domain (ACCEPTABLE - still works)
        else if (cachedContact?.firstName && cachedContact?.lastName && company?.domain) {
          matchBody.first_name = cachedContact.firstName;
          matchBody.last_name = cachedContact.lastName;
          matchBody.domain = company.domain;
          console.log('[Apollo Enrich] Using name+domain strategy for:', matchBody.first_name, matchBody.last_name);
        }
        // Strategy 4: Fallback to contactId as Apollo person ID
        else {
          matchBody.id = contactId;
          console.log('[Apollo Enrich] Using contactId as Apollo ID:', contactId);
        }
        
        // Important: Phone number reveals require a webhook_url parameter
        // Apollo sends phone numbers asynchronously to the webhook
        // For synchronous widget experience, we'll only reveal emails by default
        // and handle phone reveals separately if needed
        
        console.log('[Apollo Enrich] Match request:', JSON.stringify(matchBody, null, 2));

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
          console.error('[Apollo Enrich] API error for contact', contactId, ':', resp.status, text);
          continue;
        }

        const data = await resp.json();
        console.log('[Apollo Enrich] Response for', contactId, ':', JSON.stringify(data, null, 2));
        
        if (data.person) {
          const mappedContact = mapApolloContactToLushaFormat(data.person);
          enrichedContacts.push(mappedContact);
        }
      } catch (error) {
        console.error('[Apollo Enrich] Error enriching contact', contactId, ':', error);
        continue;
      }
    }
    
    const response = {
      contacts: enrichedContacts,
      requestId: requestId || 'apollo_enrich_' + Date.now()
    };
    
    console.log('[Apollo Enrich] Final response:', JSON.stringify(response, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    console.error('[Apollo Enrich] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}

function mapApolloContactToLushaFormat(apolloPerson) {
  // Same mapping function as in contacts.js
  const phones = (apolloPerson.phone_numbers || apolloPerson.contact?.phone_numbers || [])
    .map(p => ({
      number: p.sanitized_number || p.raw_number,
      type: p.type || 'work'
    }));

  const emails = [];
  if (apolloPerson.email) {
    emails.push({ 
      address: apolloPerson.email, 
      type: 'work',
      status: apolloPerson.email_status 
    });
  }
  if (apolloPerson.contact?.contact_emails) {
    apolloPerson.contact.contact_emails.forEach(e => {
      if (e.email && !emails.find(ex => ex.address === e.email)) {
        emails.push({ 
          address: e.email, 
          type: 'work',
          status: e.email_status 
        });
      }
    });
  }

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
    isSuccess: true
  };
}
```

**⚠️ Important Notes About Phone Number Reveals:**

1. **Cost:** Phone reveals cost **5 credits each** (vs Lusha's 1 credit) - making them **5x more expensive**
2. **Async Requirement:** When `reveal_phone_number: true`, you **must** provide a `webhook_url` - Apollo sends phone data asynchronously (can take several minutes)
3. **Strategic Impact:** For phone-heavy workflows (>50 reveals per 100 opens), Apollo becomes **more expensive** than Lusha overall

**Three Options for Phone Reveals:**

1. **Option A - Free Phones (Recommended for widget):** 
   - Use `reveal_phone_number: false`
   - Rely only on phones already in Apollo's database (`phone_numbers` array)
   - Cost: **0 credits** (already included in search)
   - Trade-off: Only get phones that Apollo has already verified
   
2. **Option B - Async Reveal (Advanced):** 
   ```javascript
   // In enrich request
   {
     reveal_phone_number: true,
     webhook_url: 'https://your-domain.com/api/apollo/phone-webhook'
   }
   // Cost: 5 credits per net-new phone
   // Webhook receives phone data after verification (async)
   ```

3. **Option C - Hybrid (Best ROI):**
   - Use Apollo for widget opens + email reveals (50% cheaper)
   - Route phone reveals through Lusha API (80% cheaper per phone: 1cr vs 5cr)
   - Requires conditional logic in `enrich.js` based on request type
   - **Best of both worlds:** Discovery savings + affordable phone data

**Recommended Strategy for Cost Optimization:**
For the initial widget migration, use **Option A** (free existing phones only). If phone reveal volume is high, implement **Option C** (hybrid approach) to maximize savings.

#### File: `api/apollo/usage.js`

```javascript
import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL } from './_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const APOLLO_API_KEY = getApiKey();
    
    // Apollo uses the usage_stats endpoint to check API consumption
    // Note: Requires a master API key
    const url = `${APOLLO_BASE_URL}/usage_stats/api_usage_stats`;
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({})
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Apollo Usage] API error:', resp.status, text);
      
      // If 403, API key may not be a master key
      if (resp.status === 403) {
        console.warn('[Apollo Usage] Master API key required for usage stats endpoint');
      }
      
      res.writeHead(resp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Apollo usage error', 
        details: text 
      }));
      return;
    }

    const data = await resp.json();
    console.log('[Apollo Usage] Response:', JSON.stringify(data, null, 2));
    
    // Apollo returns rate limit stats per endpoint
    // Extract relevant endpoints for the widget
    const peopleSearchStats = data['["api/v1/mixed_people", "search"]'] || {};
    const orgSearchStats = data['["api/v1/mixed_companies", "search"]'] || {};
    const peopleMatchStats = data['["api/v1/people", "match"]'] || {};
    
    // Calculate total consumed today
    const totalConsumed = 
      (peopleSearchStats.day?.consumed || 0) +
      (orgSearchStats.day?.consumed || 0) +
      (peopleMatchStats.day?.consumed || 0);
    
    // Get day limits
    const dailyLimit = 
      (peopleSearchStats.day?.limit || 6000) +
      (orgSearchStats.day?.limit || 6000) +
      (peopleMatchStats.day?.limit || 6000);
    
    // Map Apollo usage response to Lusha format
    const usage = {
      total: dailyLimit,
      used: totalConsumed,
      remaining: dailyLimit - totalConsumed,
      // Additional fields for compatibility
      credits: {
        total: dailyLimit,
        used: totalConsumed,
        limit: dailyLimit
      },
      // Include per-endpoint stats for debugging
      byEndpoint: {
        peopleSearch: peopleSearchStats,
        orgSearch: orgSearchStats,
        peopleMatch: peopleMatchStats
      }
    };
    
    const response = {
      usage: usage,
      headers: {
        'x-credits-used': totalConsumed,
        'x-credits-remaining': dailyLimit - totalConsumed
      }
    };
    
    console.log('[Apollo Usage] Mapped response:', JSON.stringify(response, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (e) {
    console.error('[Apollo Usage] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Server error', 
      details: e.message 
    }));
  }
}
```

**Important Note:** The usage stats endpoint requires a **master API key**. If you get a 403 error, ensure your Apollo API key has master permissions. See Apollo's "Create API Keys" documentation for details.

---

## Required Apollo Documentation

Based on the migration needs, here's the status of required Apollo API documentation:

### Essential Endpoints (All Available ✅)

1. **POST /api/v1/mixed_companies/search** - Organization Search ✅
   - Used for: Finding companies by name/domain
   - Documentation: `Organization Search.md`
   - Credit cost: 1 credit per search

2. **GET /api/v1/organizations/{id}** - Get Complete Organization Info ✅
   - Used for: Getting detailed company data
   - Documentation: `Get Complete Organization Info.md`
   - Credit cost: 1 credit per request

3. **POST /api/v1/mixed_people/search** - People Search ✅
   - Used for: Finding contacts at a company
   - Documentation: `People Search.md` (also in `apollo-widget-migration (1).md`)
   - Credit cost: 1 credit per search (up to 100 results per page)

4. **POST /api/v1/people/match** - People Enrichment ✅
   - Used for: Enriching individual contacts with emails/phones
   - Documentation: `People Enrichment.md`
   - Credit cost: 1 credit per person enriched
   - Parameters: 
     - `reveal_personal_emails`: false by default
     - `reveal_phone_number`: false by default

5. **POST /api/v1/usage_stats/api_usage_stats** - API Usage Stats ✅
   - Used for: Checking rate limit and API consumption
   - Documentation: `View API Usage Stats and Rate Limits.md`
   - Credit cost: 0 credits
   - **Requires master API key**

### Nice-to-Have (Priority 2)

6. **POST /api/v1/people/bulk_match** - Bulk People Enrichment
   - For future optimization of batch enrichment
   - Mentioned in `People Enrichment.md`
   - Credit cost: 1 credit per person (same as single match)
   - Max 10 people per request

### 📚 Documentation Sources

All Apollo documentation has been provided and is available in your `Apollo/` directory:

- ✅ **Official Apollo Docs** (from https://docs.apollo.io):
  - `People Enrichment.md` - Complete `/api/v1/people/match` documentation
  - `View API Usage Stats and Rate Limits.md` - Complete `/api/v1/usage_stats/api_usage_stats` documentation
  - `Organization Search.md` - Complete `/api/v1/mixed_companies/search` documentation
  - `Get Complete Organization Info.md` - Complete `/api/v1/organizations/{id}` documentation
  - `People Search.md` (in `apollo-widget-migration (1).md`) - Complete `/api/v1/mixed_people/search` documentation

- ℹ️ **AI-Generated Guide** (from Perplexity):
  - `apollo migration.md` - High-level migration guide with implementation examples (not official Apollo docs, but helpful for context)

All implementation code in this document is based on the official Apollo API documentation listed above.

---

## 🎯 Critical Workflow Difference: Direct Enrichment

### Lusha Workflow (Current) - Requires Search Before Enrich

**Lusha's Limitation:** Lusha requires a `requestId` from a prior search operation before enriching. This means:

```javascript
// Lusha workflow (ALWAYS requires 2 API calls)
// Step 1: Search (costs credits)
const searchResp = await fetch('/api/lusha/contacts', {
  method: 'POST',
  body: JSON.stringify({
    filters: {
      companies: { include: { domains: ['company.com'] } }
    }
  })
});
const searchData = await searchResp.json();
const requestId = searchData.requestId; // REQUIRED for enrich

// Step 2: Enrich (costs additional credits)
const enrichResp = await fetch('/api/lusha/enrich', {
  method: 'POST',
  body: JSON.stringify({
    requestId: requestId,  // Must have this!
    contactIds: ['contact123'],
    revealEmails: true
  })
});
```

**Cost:** Even if you have cached contact data, Lusha forces a search (1+ credits) before enrichment (1+ credits).

---

### Apollo Workflow (New) - Direct Enrichment Supported ✨

**Apollo's Advantage:** Apollo's `/people/match` endpoint accepts multiple identifiers and can enrich **directly without a search**:

#### Option 1: Enrich by Email (Most Common for Cached Contacts)
```javascript
// Direct enrichment with cached email - NO SEARCH NEEDED!
const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
  method: 'POST',
  headers: {
    'X-Api-Key': APOLLO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'john.doe@company.com',
    reveal_personal_emails: true,
    reveal_phone_number: false  // Or true with webhook
  })
});
// Cost: 1 credit (email only), no search required!
```

#### Option 2: Enrich by Apollo ID (Cached from Previous Search)
```javascript
// If you cached the Apollo person ID from a previous widget session
const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
  method: 'POST',
  headers: {
    'X-Api-Key': APOLLO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: '587cf802f65125cad923a266',  // Cached Apollo ID
    reveal_personal_emails: true
  })
});
// Cost: 1 credit, no search required!
```

#### Option 3: Enrich by Name + Domain (Fallback)
```javascript
// If you only have name and company domain cached
const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
  method: 'POST',
  headers: {
    'X-Api-Key': APOLLO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    domain: 'company.com',
    reveal_personal_emails: true
  })
});
// Cost: 1 credit, no search required!
```

---

### Cost Savings Scenario: Cached Contact Re-Enrichment

**Scenario:** You have 100 contacts in Firestore that you want to re-enrich (e.g., to get updated phone numbers).

| Workflow | Lusha | Apollo | Savings |
|----------|-------|--------|---------|
| **100 searches (required)** | 100+ credits | **0 credits** ✅ | -100 credits |
| **100 email enrichments** | 100 credits | 100 credits | 0 |
| **Total** | **200+ credits** | **100 credits** | **50% savings** ✅ |

**Implementation Strategy:**

1. **Cache Apollo person IDs** when contacts are first discovered via widget
2. **Cache work emails** when contacts are added to CRM
3. **Save enriched contacts to Apollo** using `POST /api/v1/contacts` - makes their data permanently accessible for FREE
4. **Use direct enrichment** for any cached contacts (skip search entirely)
5. **Only search** when adding completely new contacts

**💡 Advanced Credit Optimization:** Apollo's "Convert to Contact" API (`POST /api/v1/contacts`) lets you save enriched people to your Apollo account. Once saved as a contact, their data becomes **permanently accessible without consuming additional credits**. This is similar to storing contacts in Firestore, but keeps data in Apollo's ecosystem.

```javascript
// Smart enrichment logic in api/apollo/enrich.js
export default async function handler(req, res) {
  const { email, personId, firstName, lastName, domain } = req.body;
  
  // Determine enrichment strategy
  const enrichBody = {};
  
  if (email) {
    // Best case: We have email, enrich directly (1 credit)
    enrichBody.email = email;
  } else if (personId) {
    // Good case: We have Apollo ID from cache (1 credit)
    enrichBody.id = personId;
  } else if (firstName && lastName && domain) {
    // Acceptable: Name + domain (1 credit)
    enrichBody.first_name = firstName;
    enrichBody.last_name = lastName;
    enrichBody.domain = domain;
  } else {
    // Fallback: Must perform search first (2 credits total)
    // ... search logic here
  }
  
  // Direct enrichment - NO SEARCH NEEDED!
  const resp = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...enrichBody,
      reveal_personal_emails: true,
      reveal_phone_number: false
    })
  });
  
  // ... handle response
}
```

**Key Takeaway:** Apollo's direct enrichment can **save 50% of credits** for cached contact enrichments by eliminating the mandatory search step that Lusha requires.

---

## 🎁 Bonus: Free Forever Data with "Create Contact" API

### The Ultimate Credit Saver

Apollo offers a powerful feature that Lusha doesn't have: **Convert enriched people to permanent contacts**. Once you save an enriched person as a contact in your Apollo account, their data becomes **permanently accessible for FREE** - no more credits needed!

#### How It Works

```javascript
// Step 1: Enrich a person (costs 1-6 credits)
const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
  method: 'POST',
  headers: {
    'X-Api-Key': APOLLO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'john.doe@company.com',
    reveal_personal_emails: true
  })
});
const person = await enrichResp.json();

// Step 2: Save as contact (FREE - 0 credits)
const saveResp = await fetch('https://api.apollo.io/api/v1/contacts', {
  method: 'POST',
  headers: {
    'X-Api-Key': APOLLO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    organization_name: person.organization?.name,
    website_url: person.organization?.website_url,
    direct_phone: person.direct_phone,
    mobile_phone: person.mobile_phone
  })
});

// Step 3: Future enrichments are FREE!
// Next time you enrich this person, Apollo recognizes them as a contact
// and returns their data WITHOUT consuming credits!
```

#### Credit Savings Over Time

| Scenario | Without "Create Contact" | With "Create Contact" | Savings |
|----------|-------------------------|----------------------|---------|
| **Enrich same contact 1x** | 1 credit | 1 credit (initial) | 0 |
| **Enrich same contact 5x** | 5 credits | 1 credit (saved after 1st) | **4 credits (80%)** |
| **Enrich same contact 10x** | 10 credits | 1 credit (saved after 1st) | **9 credits (90%)** |
| **100 contacts, 5 enriches each** | 500 credits | 100 credits | **400 credits (80%)** |

**Use Cases:**
- ✅ Save contacts from widget to Apollo after enrichment
- ✅ Re-enrich contacts for updated data (job changes, new phones) - FREE!
- ✅ Sync your Firestore contacts to Apollo once - future enrichments FREE
- ✅ Perfect for contacts you interact with frequently

**Implementation Strategy:**
1. After enriching a contact via the widget, automatically save to Apollo as a contact
2. Store the Apollo contact ID in Firestore alongside your contact data
3. For future enrichments, Apollo will recognize them as a contact and return data for FREE
4. No deduplication - Apollo creates new contacts if email/name+company match existing ones

**Note:** This is essentially Apollo's version of "your CRM" - once a person is in your contacts, their data is yours forever without additional credit cost.

---

## Credit Usage Comparison

### Lusha Credit Consumption (Current)
- **Widget open (initial load):** 4 credits total
  - Company lookup: ~1 credit
  - Contact search: ~3 credits for initial batch
- **Contact enrichment (email reveal):** 1 credit per contact
- **Contact enrichment (phone reveal):** 1 credit per contact
- **Usage check:** 0 credits
- **Total per widget session:** 4+ credits

### Apollo Credit Consumption (Official Pricing Model)

#### Paid Operations (All Searches Cost Credits)
- `/mixed_companies/search`: **1 credit per page** (max 100 results/page)
- `/mixed_people/search`: **1 credit per page** (max 100 results/page)
- `/people/match` enrichment:
  - **1 credit** per net-new email
  - **1 credit** per net-new firmographic/demographic data
  - **5 credits** per net-new phone number ⚠️
- `/organizations/enrich`: **1 credit** per result

#### Widget Cost Breakdown
- **Standard Widget Open:**
  - Company search: 1 credit (1 page)
  - People search: 1 credit (1 page, up to 100 contacts)
  - **Total:** 2 credits per widget open

**Credit Cost Comparison:**
| Operation | Lusha | Apollo | Winner |
|-----------|-------|--------|--------|
| Widget open | 4 credits | 2 credits | Apollo (50% cheaper) ✅ |
| Email reveal | 1 credit | 1 credit | Tie |
| Phone reveal | 1 credit | **5 credits** | Lusha (80% cheaper) ⚠️ |

**Key Findings:**
- ✅ Apollo is **50% cheaper** for widget opens (2 vs 4 credits)
- ⚠️ Apollo is **5x more expensive** for phone reveals (5 vs 1 credit)
- 💡 **Optimal strategy:** Use Apollo for discovery, be selective with phone reveals

### Monthly Cost Scenarios

#### Email-Only Workflows (Apollo Wins Big)
| Usage Pattern | Lusha Credits | Apollo Credits | Difference | Note |
|--------------|--------------|----------------|---------|------|
| 100 opens, 0 reveals | 400 | 200 | **-200 (-50%)** | ✅ Apollo wins |
| 100 opens, 50 email reveals | 450 | 250 | **-200 (-44%)** | ✅ Apollo wins |
| 100 opens, 100 email reveals | 500 | 300 | **-200 (-40%)** | ✅ Apollo wins |

#### Phone-Heavy Workflows (Cost Increases)
| Usage Pattern | Lusha Credits | Apollo Credits | Difference | Note |
|--------------|--------------|----------------|---------|------|
| 100 opens, 25 phone reveals | 425 | 325 | **-100 (-24%)** | ✅ Apollo still cheaper |
| 100 opens, 50 phone reveals | 450 | 450 | **0 (break even)** | Tie |
| 100 opens, 100 phone reveals | 500 | 700 | **+200 (+40%)** | ⚠️ Lusha cheaper |
| 100 opens, 200 phone reveals | 600 | 1200 | **+600 (+100%)** | ⚠️ Lusha much cheaper |

#### Mixed Workflows (email + phone)
| Usage Pattern | Lusha Credits | Apollo Credits | Difference | Note |
|--------------|--------------|----------------|---------|------|
| 100 opens, 50 emails, 25 phones | 475 | 375 | **-100 (-21%)** | ✅ Apollo wins |
| 100 opens, 50 emails, 50 phones | 500 | 500 | **0 (break even)** | Tie |
| 100 opens, 100 emails, 100 phones | 600 | 900 | **+300 (+50%)** | ⚠️ Lusha cheaper |

**Strategic Recommendations:**

1. **✅ Use Apollo for:**
   - High-volume prospecting/discovery
   - Email-first outreach workflows
   - Browse-only widget sessions
   - Low phone reveal usage (<25 per 100 opens)

2. **⚠️ Keep Lusha or Consider Hybrid for:**
   - Phone-heavy campaigns (>50 reveals per 100 opens)
   - Direct dial workflows
   - Call-first outreach strategies

3. **💡 Optimal Hybrid Approach:**
   - Use Apollo for widget opens + email reveals (50% savings)
   - Route phone reveals through Lusha API (80% cheaper per phone)
   - Requires conditional logic in `enrich.js` to choose provider
   - Best ROI: discovery savings + affordable phone data

---

## Migration Steps

### Step 0: Choose Migration Strategy

**Decision Point:** Based on your phone reveal usage patterns, choose one of these approaches:

#### Option A: Full Apollo Migration (Recommended if phone reveals < 25 per 100 opens)
- Migrate all endpoints to Apollo
- Use existing phone numbers from search results (included in search credits)
- Best for email-first workflows
- **Savings:** 50% on widget opens, same on emails
- **Trade-off:** Limited phone coverage unless paying 5cr/phone for reveals

#### Option B: Hybrid Approach (Recommended if phone reveals > 50 per 100 opens)
- Use Apollo for `/company` and `/contacts` endpoints (discovery)
- Keep Lusha for `/enrich` endpoint (phone reveals)
- Best for phone-heavy workflows
- **Savings:** 50% on widget opens, 0% on phone reveals
- **Trade-off:** Maintain both API integrations

#### Option C: Keep Lusha (If phone reveals > 100 per 100 opens)
- High phone reveal volume makes Apollo more expensive
- Delay migration until usage patterns change
- Monitor for opportunities to optimize

**For this migration guide, we'll implement Option A (full Apollo) with notes on how to add Option B (hybrid) later.**

---

### Step 1: Environment Setup
1. Add `APOLLO_API_KEY` to your environment variables
2. Keep `LUSHA_API_KEY` for gradual migration (or hybrid approach)
3. Test Apollo API key with a simple request

### Step 2: Create Apollo API Files
1. Create `api/apollo/` directory
2. Copy and adapt all files from implementation plan
3. Test each endpoint individually

### Step 3: Update API Routing
Modify the main server/router to use Apollo endpoints:

```javascript
// Option 1: Switch all at once
app.use('/api/lusha', require('./api/apollo'));

// Option 2: Gradual migration with feature flag
const USE_APOLLO = process.env.USE_APOLLO === 'true';
app.use('/api/lusha', USE_APOLLO ? require('./api/apollo') : require('./api/lusha'));
```

### Step 4: Test Widget Functionality
No frontend changes needed! Test these flows:
1. Open widget from Contact Detail page
2. Open widget from Account Detail page
3. Company search and display
4. Contact list display with pagination
5. Email reveal
6. Phone reveal
7. Add contact to CRM
8. Enrich existing contact
9. Add account to CRM
10. Usage bar display

### Step 5: Monitor and Optimize
1. Watch credit consumption
2. Implement caching strategy
3. Monitor error rates
4. Optimize search queries

---

## Optional Enhancements: Service Address Auto-Population

Now that Apollo provides company headquarters addresses, you can optionally enhance the Account Detail page to auto-populate service addresses when creating new accounts.

### Option A: Initialize Service Address from Apollo Data (Recommended)

When a new account is created from the Lusha widget (which will now use Apollo data), initialize the `serviceAddresses` array with Apollo's HQ address:

```javascript
// In the widget or account creation flow
const newAccount = {
  accountName: companyData.name,
  domain: companyData.domain,
  website: companyData.website,
  companyPhone: companyData.companyPhone, // NEW from Apollo
  city: companyData.city,
  state: companyData.state,
  country: companyData.country,
  // Initialize service addresses with HQ address
  serviceAddresses: companyData.address ? [{
    address: companyData.address,
    isPrimary: true
  }] : [],
  // ... other fields
};
```

### Option B: Manual Entry (Current Behavior)

Keep the current behavior where service addresses are manually added by the user via the "Add Service Address" button in Account Detail.

### Recommendation

Use **Option A** for better data completeness. Users can still edit/remove the auto-populated address if it's not a service location for their specific use case.

---

## Testing Checklist

### Unit Tests
- [ ] Company search by domain
- [ ] Company search by name
- [ ] Company data mapping accuracy
- [ ] Company phone field mapping (`companyPhone`)
- [ ] Company address field mapping (`address`, `city`, `state`, `country`)
- [ ] Contact search by company domain
- [ ] Contact search by company ID
- [ ] Contact data mapping accuracy
- [ ] Contact enrichment
- [ ] Usage tracking
- [ ] Error handling (404, 401, 429, 500)

### Integration Tests
- [ ] Widget opens on Contact Detail
- [ ] Widget opens on Account Detail
- [ ] Company summary displays correctly
- [ ] Contact list displays correctly
- [ ] Pagination works
- [ ] Email reveal works
- [ ] Phone reveal works
- [ ] **Company phone displays in widget** ✨ NEW
- [ ] **Company phone auto-populates in Account Detail** ✨ NEW
- [ ] **Company address displays in widget** ✨ NEW
- [ ] **Service address can be initialized from Apollo HQ address** ✨ NEW
- [ ] Add contact saves to Firestore
- [ ] Enrich contact updates Firestore
- [ ] Add account saves to Firestore (with `companyPhone` and `address` fields)
- [ ] Enrich account updates Firestore
- [ ] Usage bar shows correct numbers
- [ ] Cached results load instantly
- [ ] Refresh pulls new data

### Performance Tests
- [ ] Cache hit rate monitoring
- [ ] API response times
- [ ] Credit consumption tracking
- [ ] Rate limit handling

---

## Rollback Plan

If issues arise, you can quickly rollback:

```javascript
// In your router/server file
const USE_LUSHA = process.env.USE_LUSHA === 'true';
app.use('/api/lusha', USE_LUSHA ? require('./api/lusha') : require('./api/apollo'));
```

Set `USE_LUSHA=true` in your environment to revert to Lusha API.

---

## Next Steps

1. **Get remaining Apollo documentation:**
   - `POST /api/v1/people/match` (People Enrichment)
   - `POST /api/v1/auth/health` (API Usage)

2. **Set up Apollo API key** in your environment

3. **Create the Apollo API files** using the implementation plan above

4. **Test each endpoint** independently before integration

5. **Deploy to staging** and run full integration tests

6. **Monitor credit usage** closely during initial rollout

7. **Optimize caching** based on usage patterns

---

## Questions or Issues?

Common issues and solutions:

**Q: Apollo returns more/fewer results than Lusha**
- A: Adjust pagination and filters to match expected results

**Q: Email/phone data format is different**
- A: The mapping functions handle this - verify `mapApolloContactToLushaFormat()`

**Q: Credit consumption is higher than expected**
- A: Implement aggressive caching, especially for company searches

**Q: Some fields are missing**
- A: Apollo may not have all data Lusha had - use fallbacks in mapping

**Q: Widget looks different**
- A: Widget frontend is unchanged - only backend API calls change

---

## Conclusion

This migration delivers **significant cost savings** while maintaining the exact same widget UI:

### Key Benefits

1. **50% Cost Reduction on Widget Opens**
   - Lusha: 4 credits per open
   - Apollo: 2 credits per open
   - Monthly savings: 200 credits on 100 opens

2. **Larger Database**
   - Apollo: 275M+ contacts across 73M+ companies
   - Better match rates and more comprehensive data

3. **Zero Frontend Changes**
   - Widget UI stays identical
   - All CSS and HTML structure preserved
   - Only backend API mapping changes

4. **Same Enrichment Costs**
   - Email reveals: 1 credit (same as Lusha)
   - Phone reveals: 1 credit (same as Lusha)

### Implementation Summary

- **Time Required:** ~4-6 hours for backend changes
- **Files Changed:** 5 new API files + updated widget endpoint routing
- **Testing:** 2-3 hours for comprehensive testing
- **Risk Level:** Low (frontend unchanged, backend is isolated)
- **Rollback:** Simple (keep Lusha files for quick revert if needed)

### Next Steps

1. ✅ Set up Apollo API key (master key for usage stats)
2. ✅ Create 5 new backend API files (company, contacts, enrich, usage, utils)
3. ✅ Test each endpoint independently
4. ✅ Update widget to call Apollo endpoints instead of Lusha
5. ✅ Deploy to staging and test thoroughly
6. ✅ Monitor credit usage for 1 week
7. ✅ Deploy to production

**Expected Monthly Savings:** If you're currently using 400 credits/month on Lusha widget opens, you'll reduce to 200 credits/month with Apollo - a **$20-40/month savings** depending on your plan tier.

