// const fetch = require('node-fetch'); // Built-in fetch in Node 22

const BASE_URL = 'http://localhost:3001';

async function testFlow() {
  console.log('=== 1. Testing Company Search (to get Domain) ===');
  // Usually the frontend uses company name to find domain if not provided.
  // Let's try to search for people by company name to see what domain is returned.
  
  // Note: OrgIntelligence calls /api/apollo/search-people with q_organization_name
  const searchResp = await fetch(`${BASE_URL}/api/apollo/search-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      per_page: 5,
      q_organization_name: 'Integrated Circuit Solutions USA'
    })
  });

  const searchData = await searchResp.json();
  console.log('Search Status:', searchResp.status);
  
  if (!searchData.people || searchData.people.length === 0) {
    console.log('No people found. Cannot proceed with enrichment test.');
    console.log('Search Response:', JSON.stringify(searchData, null, 2));
    return;
  }

  const person = searchData.people[0];
  console.log('Found Person:', person.name, person.id);
  
  // Try to find the organization domain from the person record
  // Apollo person records usually have organization object or organization_id
  const org = person.organization;
  const domain = org ? org.primary_domain : null;
  const companyName = org ? org.name : 'Integrated Circuit Solutions USA';
  
  console.log('Organization Domain:', domain);
  console.log('Organization Name:', companyName);

  if (domain) {
    console.log('\n=== 2. Testing Company Enrichment (Domain) ===');
    const companyUrl = `${BASE_URL}/api/apollo/company?domain=${domain}`;
    const companyResp = await fetch(companyUrl);
    const companyData = await companyResp.json();
    console.log('Company Enrichment Status:', companyResp.status);
    console.log('Company Name:', companyData.name);
  } else {
    console.log('\n=== 2. Testing Company Enrichment (Fallback Name) ===');
    // Test the new fallback logic
    const companyUrl = `${BASE_URL}/api/apollo/company?company=${encodeURIComponent(companyName)}`;
    const companyResp = await fetch(companyUrl);
    const companyData = await companyResp.json();
    console.log('Company Enrichment Status:', companyResp.status);
    console.log('Company Name:', companyData.name);
    console.log('Company Domain (Found):', companyData.domain);
  }

  console.log('\n=== 3. Testing Contact Reveal (Enrichment) ===');
  // Test Email Reveal
  console.log('--- Revealing Email ---');
  const enrichEmailResp = await fetch(`${BASE_URL}/api/apollo/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contactIds: [person.id],
      revealEmails: true,
      revealPhones: false,
      company: { name: companyName, domain: domain }
    })
  });
  const enrichEmailData = await enrichEmailResp.json();
  console.log('Email Reveal Status:', enrichEmailResp.status);
  console.log('Email Reveal Data:', JSON.stringify(enrichEmailData.contacts?.[0] || enrichEmailData, null, 2));

  // Test Phone Reveal
  console.log('\n--- Revealing Phone ---');
  const enrichPhoneResp = await fetch(`${BASE_URL}/api/apollo/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contactIds: [person.id],
      revealEmails: false,
      revealPhones: true, // Only phone
      company: { name: companyName, domain: domain }
    })
  });
  const enrichPhoneData = await enrichPhoneResp.json();
  console.log('Phone Reveal Status:', enrichPhoneResp.status);
  console.log('Phone Reveal Data:', JSON.stringify(enrichPhoneData.contacts?.[0] || enrichPhoneData, null, 2));
}

testFlow().catch(console.error);
