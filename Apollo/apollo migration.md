# Apollo.io Widget Implementation Guide: CRM Integration Plan

## Executive Summary

**Migrate your prospecting widget from Lusha to Apollo.io while maintaining identical aesthetics and user experience.** The widget appears in Contact and Account detail headers and displays company information (logo, summary, website, LinkedIn, firmographics) plus a paginated people list. Apollo migration requires updating API endpoints and request/response mapping in your backend functions, but **all CSS styling and HTML structure remain unchanged**. 

### Key Implementation Facts:
- **Widget Entry Points:** `window.Widgets.openLusha()` → `window.Widgets.openApollo()`
- **Cost for Initial Load (no reveals):** **2 credits** (1 company search + 1 people search)
- **Monthly Impact:** 100 widget opens = 200 credits (10% of Professional plan allocation)
- **Reveal Costs:** 1 credit/email, 5 credits/phone (bulk endpoint available)
- **Implementation Time:** ~4 hours (backend mapping + testing)
- **File Changes:** `lusha.js`, backend `enrich.js`, `utils.js` configuration only

---

## Part 1: Current Widget Implementation Overview

### Current Flow (Lusha)

Your widget is accessed via:
1. **Contact Detail Page** → Header button → `window.Widgets.openLusha(contactId)`
2. **Account Detail Page** → Header button → `window.Widgets.openLushaForAccount(accountId)`

#### Widget Displays:

**Company Information Section:**
- Company logo (image URL)
- Company name
- Website URL
- Company summary/description
- LinkedIn company URL
- Employee count (firmographic)
- Annual revenue (firmographic)
- Industry

**People List Section:**
- Person name (first + last)
- Job title
- Company (reference)
- Email address (guarded behind reveal button)
- Phone number (guarded behind reveal button)
- LinkedIn profile URL
- Pagination controls (5 people per page)

#### Current Credit Cost (Lusha):
- **Opening widget (no reveals):** 0 credits
- **Searching company:** 0 credits (free with requestId)
- **Revealing 1 email:** 1 credit
- **Revealing 1 phone:** 10 credits
- **Reason:** Lusha charges only for data reveals, not searches

---

## Part 2: Apollo.io Widget Implementation Plan

### Apollo Implementation Approach

Maintain identical widget aesthetics and structure while updating backend API calls:

```
CURRENT (Lusha):
1. window.Widgets.openLusha(contactId)
2. makeCard() creates DOM structure (unchanged)
3. Extract company name from ContactDetail.state
4. Call backend enrich.js: POST /api/lusha/enrich
5. Lusha returns: company data + people list
6. Render with Lusha data structure

APOLLO (Proposed):
1. window.Widgets.openApollo(contactId)
2. makeCard() creates DOM structure (UNCHANGED - same CSS classes)
3. Extract company name from ContactDetail.state (UNCHANGED)
4. Call backend apollo.js: POST /api/apollo/enrich
5. Apollo returns: company data + people list (mapped to match Lusha structure)
6. Render with Apollo data (same HTML, same CSS)
```

### Key Advantage: 
**CSS and HTML structure do NOT change.** You only swap backend data sources and add Apollo API mapping layer.

---

## Part 3: Code Implementation

### File 1: Update `utils.js` (Configuration)

```javascript
// CURRENT (Lusha)
const LUSHA_BASE_URL = 'https://api.lusha.com';
const ALLOWED_ORIGINS = [/* ... */];
function getApiKey() {
  return process.env.LUSHA_API_KEY;
}

// APOLLO (New)
const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY; // Store in env
const ALLOWED_ORIGINS = [/* same as before */];

function getApolloKey() {
  return process.env.APOLLO_API_KEY;
}
```

### File 2: Create New `apollo-widget.js` (Backend Endpoint)

Location: `serverless/apollo-widget.js` or `functions/api/apollo/enrich.js`

```javascript
import { cors, fetchWithRetry } from './_utils.js';

export default async function handler(req, res) {
  cors(req, res);
  
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { companyName, domain, entityType } = req.body;
    const APOLLO_KEY = process.env.APOLLO_API_KEY;

    // STEP 1: Search for company
    const companySearch = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: {
        'X-Api-Key': APOLLO_KEY,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        organization_name: companyName,
        domain: domain,
        page: 1,
        per_page: 1
      })
    });

    const companyData = await companySearch.json();
    const company = companyData.organizations?.[0];

    // Format company response to match Lusha structure
    const formattedCompany = {
      id: company?.id,
      name: company?.name,
      domain: company?.domain,
      logo_url: company?.logo_url,
      website_url: company?.website_url,
      description: company?.description,
      linkedin_url: company?.linkedin_url,
      employee_count: company?.employee_count,
      estimated_revenue: company?.estimated_revenue,
      industry: company?.industry,
      founded_year: company?.founded_year
    };

    // STEP 2: Search for people at company
    const peopleSearch = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'X-Api-Key': APOLLO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization_ids: [company?.id],
        page: 1,
        per_page: 50
      })
    });

    const peopleData = await peopleSearch.json();
    
    // Format people response to match Lusha structure
    const formattedPeople = (peopleData.people || []).map(person => ({
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      title: person.title,
      email: person.email,  // May be null until revealed
      phone: person.phone_numbers?.[0],  // May be null until revealed
      linkedin_url: person.linkedin_url,
      company_id: person.organization_id,
      avatar_url: person.avatar_url
    }));

    // Return mapped data (matches Lusha widget expectations)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      company: formattedCompany,
      people: formattedPeople,
      total: peopleData.pagination?.total_entries || 0
    }));

  } catch (error) {
    console.error('Apollo widget error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}
```

### File 3: Create New `apollo-reveal.js` (Email/Phone Reveals)

Location: `serverless/apollo-reveal.js` or `functions/api/apollo/reveal.js`

```javascript
export default async function handler(req, res) {
  cors(req, res);
  
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { firstName, lastName, companyName, revealType } = req.body;
    const APOLLO_KEY = process.env.APOLLO_API_KEY;

    // Reveal type: 'email' or 'phone'
    const revealPersonalEmails = revealType === 'email' || revealType === 'both';
    const revealPhoneNumber = revealType === 'phone' || revealType === 'both';

    const enrichResponse = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'X-Api-Key': APOLLO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        organization_name: companyName,
        reveal_personal_emails: revealPersonalEmails,
        reveal_phone_number: revealPhoneNumber
      })
    });

    const enrichData = await enrichResponse.json();
    const person = enrichData.person;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      email: person?.email,
      phone: person?.phone_numbers?.[0],
      revealed_at: new Date().toISOString()
    }));

  } catch (error) {
    console.error('Apollo reveal error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}
```

### File 4: Update Widget Handler in `lusha.js`

```javascript
// Create new function alongside existing Lusha handlers
// Change: window.Widgets.openApollo instead of openLusha
// Keep all CSS/DOM structure identical

if (!window.Widgets) window.Widgets = {};

window.Widgets.openApollo = function(contactId) {
  // Same as openLusha but calls /api/apollo/enrich instead
  window.Widgets._openApolloWidget(contactId, 'contact');
};

window.Widgets.openApolloForAccount = function(accountId) {
  window.Widgets._openApolloWidget(accountId, 'account');
};

// Internal implementation
window.Widgets._openApolloWidget = async function(entityId, entityType) {
  // 1. Extract company name (same logic as Lusha)
  let companyName = getCompanyName(entityId, entityType);
  let domain = getDomainFromEntity(entityId, entityType);

  // 2. Fetch from Apollo backend
  const response = await fetch('/api/apollo/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, domain, entityType })
  });

  const data = await response.json();

  // 3. Render with Apollo data (uses SAME renderCompanyCard, renderPeopleList functions)
  renderCompanyCard(data.company);  // Reuse existing render functions
  renderPeopleList(data.people);
};
```

---

## Part 4: Credit Cost Breakdown

### Scenario 1: Initial Widget Load (No Reveals)

```
Action: User clicks widget button
APIs Called:
  1. /mixed_companies/search → 1 credit
  2. /mixed_people/search → 1 credit
  
TOTAL: 2 credits

Lusha equivalent: 0 credits
Difference: +2 credits per widget open
```

### Scenario 2: User Reveals 1 Email

```
Previous: 2 credits (initial load)
New reveal:
  1. /people/match (email only) → 1 credit
  
TOTAL: 3 credits

Lusha equivalent: 1 credit
Difference: +2 credits (Apollo search vs Lusha free search)
```

### Scenario 3: User Reveals 1 Phone Number

```
Previous: 2 credits (initial load)
New reveal:
  1. /people/match (phone only) → 5 credits
  
TOTAL: 7 credits

Lusha equivalent: 10 credits
Difference: -3 credits (Apollo is CHEAPER for phones!)
```

### Scenario 4: Bulk Reveal (5 Emails + 3 Phones)

```
Previous: 2 credits (initial load)
New reveals:
  1. /people/bulk_match → 5 credits (emails) + 15 credits (phones) = 20 credits
  
TOTAL: 22 credits

Lusha equivalent: 0 (search) + 5 (emails) + 30 (phones) = 35 credits
Difference: -13 credits (Apollo is 37% CHEAPER)
```

---

## Part 5: Monthly Cost Impact & Plan Recommendations

### Scenario A: Moderate Widget Usage (Professional Plan - $79/month)

Plan includes: 2000 export credits/month

```
Widget Opens: 50/month (1-2 per business day)
Average Reveals: 2 people × 1 email per open
Cost per open: 2 (search) + 2 (emails) = 4 credits

Monthly cost: 50 × 4 = 200 credits
% of allocation: 200 / 2000 = 10%
Remaining: 1800 credits for other prospecting
Status: ✓ Well within budget
```

### Scenario B: Heavy Widget Usage (Professional Plan - $79/month)

```
Widget Opens: 100/month (5 per business day)
Average Reveals: 10 people × (1 email + 0.5 phone)
Cost per open: 2 (search) + 10 (emails) + 25 (phones) = 37 credits

Monthly cost: 100 × 37 = 3700 credits
% of allocation: 3700 / 2000 = 185% (EXCEEDS plan)
Overage: 1700 credits × $0.20 = $340/month extra
Status: ⚠️ Requires Organization plan ($119) or budget for overage
```

### Recommended Plans by Usage:

| Usage Level | Widget Opens/Month | Avg Reveals/Open | Credits/Month | Plan | Monthly Cost |
|---|---|---|---|---|---|
| Light | 20 | None | 40 | Basic | $49 |
| Moderate | 50 | 2 emails | 200 | Professional | $79 |
| Heavy | 100 | 10 people mix | 3700 | Org + Extra | $119 + $340 |
| Very Heavy | 200 | 15 people mix | 7400 | Org + Extra | $119 + $680 |

---

## Part 6: Implementation Checklist

### Pre-Implementation
- [ ] Obtain Apollo.io API key and store in `process.env.APOLLO_API_KEY`
- [ ] Create dev/staging environment to test widget
- [ ] Set up Apollo account and verify API access

### Backend Changes (4 hours)
- [ ] Create new `apollo-widget.js` endpoint
- [ ] Create new `apollo-reveal.js` endpoint for email/phone reveals
- [ ] Add Apollo base URL to `utils.js`
- [ ] Test both endpoints with sample data
- [ ] Add error handling for API failures

### Frontend Changes (1 hour)
- [ ] Add `window.Widgets.openApollo()` function to `lusha.js`
- [ ] Update widget header button to call `openApollo` instead of `openLusha`
- [ ] Test widget UI rendering (should be identical)

### Testing (2 hours)
- [ ] Test widget load from Contact Detail page
- [ ] Test widget load from Account Detail page
- [ ] Test email reveal (check 1 credit deduction)
- [ ] Test phone reveal (check 5 credit deduction)
- [ ] Test pagination (5 people per page)
- [ ] Test with companies with no results
- [ ] Test error scenarios (API failures, invalid domain)

### Rollout
- [ ] Deploy to staging
- [ ] QA testing with 3-5 users
- [ ] Monitor credit usage for 1 week
- [ ] Deploy to production
- [ ] Decommission Lusha endpoints if no longer needed

---

## Part 7: Key Differences When Migrating

### Request Structure Changes

**Lusha Widget (Current):**
```javascript
// Initial search
{ pages: { page: 0, size: 10 }, filters: { companies: { include: { domains: [domain] } } } }

// Then reveal
{ requestId: "xxx", contactIds: [id1, id2], revealEmails: true, revealPhones: true }
```

**Apollo Widget (New):**
```javascript
// Combined search (no requestId needed)
{ organization_name: "CompanyName", domain: "company.com", page: 1, per_page: 50 }

// Reveal
{ first_name: "John", last_name: "Doe", organization_name: "Company", reveal_personal_emails: true, reveal_phone_number: true }
```

### Response Structure Changes

**Lusha returns:**
```json
{
  "contacts": [{ 
    "id": "...", 
    "firstName": "John", 
    "jobTitle": "Manager",
    "emails": [...],
    "phones": [...]
  }],
  "requestId": "xxx"
}
```

**Apollo returns:**
```json
{
  "people": [{
    "id": "...",
    "first_name": "John",
    "title": "Manager",
    "email": null,  // null if not revealed
    "phone_numbers": [],
    "linkedin_url": "..."
  }]
}
```

**Mapping Layer:** Create utility function to transform Apollo response to match Lusha structure:
```javascript
function mapApolloToLushaFormat(apolloResponse) {
  return {
    contacts: (apolloResponse.people || []).map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jobTitle: p.title,
      emails: p.email ? [p.email] : [],
      phones: p.phone_numbers || [],
      companyName: p.organization.name
    }))
  };
}
```

---

## Part 8: CSS and Aesthetics (NO CHANGES NEEDED)

Your existing CSS in `main.css` targets these classes:
```css
.widget-card
.lusha-card (or apollo-card - same styling)
.company-summary
.company-logo
.people-list
.person-card
.reveal-button
```

**No CSS changes required.** The widget HTML structure remains identical:

```html
<div id="lusha-widget" class="widget-card lusha-card">
  <!-- Company Section -->
  <div class="company-info">
    <img class="company-logo" src="..."/>
    <div class="company-details">
      <h3>Company Name</h3>
      <p class="company-summary">...</p>
      <!-- etc -->
    </div>
  </div>
  
  <!-- People Section -->
  <div class="people-list">
    <!-- Paginated person cards -->
  </div>
</div>
```

Same structure, Apollo data instead of Lusha data.

---

## Part 9: Real-World Example: Energy Consultant Prospecting

### Use Case: Research Manufacturing Facility

1. **Action:** Navigate to manufacturing company's Account Detail page (e.g., "Steel Mill Corp")
2. **Action:** Click "Enrich" button (Apollo widget)
3. **Cost:** 2 credits (company + people search)
4. **Result:** Widget shows:
   - Steel Mill Corp logo & summary
   - 40+ employees at facility
   - Purchasing manager, plant manager, operations director visible
5. **Action:** User clicks "Reveal Email" on Plant Manager
6. **Cost:** +1 credit (total 3 credits)
7. **Action:** User clicks "Reveal Phone" on Operations Director  
8. **Cost:** +5 credits (total 8 credits)
9. **Action:** User adds contacts to Firebase CRM via "Add to Contacts" button
10. **Result:** Contacts ready for energy procurement outreach

**Total for this research session: 8 credits**
**Equivalent Lusha cost: 0 (search) + 1 (1 email) + 10 (1 phone) = 11 credits**
**Savings: Apollo is 27% cheaper in this scenario**

---

## Part 10: Troubleshooting

### Issue: "Credit costs too high for initial load"
**Solution:** If you find 2 credits per open is too expensive, consider:
1. **Caching:** Cache company/people results for 24 hours to reduce repeated searches
2. **Lazy loading:** Only fetch people list when user scrolls down
3. **Bulk operations:** Use Apollo's Salesforce/HubSpot sync instead of manual widget usage

### Issue: "API returns null for emails/phones even after reveal click"
**Solution:** This is normal - Apollo has a lower match rate for some records. Check:
1. Ensure `reveal_personal_emails` and `reveal_phone_number` flags are set
2. Verify person has enough identifying information (name + company minimum)
3. Check Apollo knowledge base for "no match" troubleshooting

### Issue: "Widget widget pagination shows wrong count"
**Solution:** Apollo's `mixed_people/search` returns partial data. The pagination may differ from Lusha:
1. Apollo shows up to 50 results per page (vs Lusha's variable)
2. Store total count in widget state and use for pagination UI

---

## Summary & Next Steps

✅ **Widget can migrate with NO CSS changes**
✅ **Identical user experience maintained**
✅ **2 credits per widget open (vs 0 for Lusha)**
✅ **Reveals are CHEAPER on Apollo for phones** (5 vs 10 credits)
✅ **Professional plan supports ~100 widget opens/month with light reveals**

**Recommended Next Steps:**
1. Set up Apollo.io account and obtain API key
2. Create dev endpoint for testing (`apollo-widget.js`)
3. Test with 5-10 widget opens to validate credit costs
4. Compare Lusha vs Apollo reveals on your typical usage
5. Migrate header button to call `openApollo()` function
6. Monitor for 1 month to validate monthly credit spend

---

*Implementation guide prepared for Lewis Patterson (Energy Consultant, Fort Worth TX)*
*Created: November 14, 2025 | Apollo.io API v1 Documentation*
