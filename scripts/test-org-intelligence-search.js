/**
 * Test script for Org Intelligence widget search.
 * Verifies: (1) initial scan (no q_keywords) returns people;
 *           (2) search bar (q_keywords + same org) returns people (mixed people search).
 * Run from repo root with backend on 3001: node scripts/test-org-intelligence-search.js
 * Or with BASE_URL for Next.js proxy: BASE_URL=http://localhost:3000 node scripts/test-org-intelligence-search.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function run() {
  console.log('Base URL:', BASE_URL);
  console.log('');

  const domain = process.env.TEST_DOMAIN || 'apollo.io';
  const companyName = process.env.TEST_COMPANY || 'Apollo';

  // 1) Initial scan (no q_keywords) – same as opening the widget
  console.log('=== 1. Initial scan (no search term) ===');
  const initialResp = await fetch(`${BASE_URL}/api/apollo/search-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      per_page: 10,
      q_organization_domains: domain,
      q_organization_domains_list: [domain],
      q_organization_name: companyName,
      person_titles: ['owner', 'founder', 'c-level', 'vp', 'director', 'manager'],
    }),
  });
  const initialData = await initialResp.json();
  console.log('Status:', initialResp.status);
  if (initialData.error) {
    console.log('Error:', initialData.error);
    return;
  }
  const people = initialData.people || [];
  console.log('People count:', people.length);
  if (people.length > 0) {
    console.log('First person:', people[0].name, people[0].title);
  }
  console.log('');

  // 2) Search with a name (q_keywords) – same as typing in the widget search bar
  const searchName = people.length > 0 ? people[0].name?.split(' ')[0] : 'John';
  console.log('=== 2. Mixed people search with q_keywords (search bar) ===');
  console.log('Search term (q_keywords):', searchName);
  const searchResp = await fetch(`${BASE_URL}/api/apollo/search-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      per_page: 50,
      q_keywords: searchName,
      q_organization_domains: domain,
      q_organization_domains_list: [domain],
      q_organization_name: companyName,
      person_titles: ['owner', 'founder', 'c-level', 'vp', 'director', 'manager'],
    }),
  });
  const searchData = await searchResp.json();
  console.log('Status:', searchResp.status);
  if (searchData.error) {
    console.log('Error:', searchData.error);
    console.log('Details:', searchData.details || '');
    return;
  }
  const searchPeople = searchData.people || [];
  console.log('People count:', searchPeople.length);
  if (searchPeople.length > 0) {
    console.log('First 3:', searchPeople.slice(0, 3).map(p => p.name));
  } else {
    console.log('No people returned – Apollo may require both org filter and keyword; or try a different name.');
  }
  console.log('');
  console.log('Done. If initial scan has people but search returns 0, Apollo may be filtering keyword too strictly.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
