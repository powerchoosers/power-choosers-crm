const accounts = [
  { id: '66002e57-ff2d-41a0-917e-19185c155d2d', name: 'Ravn Aerospace' },
  { id: '2ce36fd8-72c6-4cc2-a9fa-098f00cc582f', name: 'Remis America LLC' },
  { id: '1e90957f-8a0b-4981-a4e8-e835d6ce6ea0', name: 'Polk Mechanical Company' },
  { id: 'dbe46546-7111-40be-ba52-fe9c5ea31a48', name: 'United Way of Metropolitan Dallas' },
  { id: 'eede27a8-c942-4e7e-944b-5dd231f3b801', name: 'Hidalgo Cold Storage' }
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  for (const acc of accounts) {
    const url = `http://localhost:3000/api/accounts/${acc.id}/intelligence-brief`;
    console.log(`\nRegenerating brief for ${acc.name} (${acc.id})...`);
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev-bypass-token',
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      if (data.brief) {
        console.log('--- Brief Output ---');
        console.log(`Headline:    ${data.brief.signal_headline}`);
        console.log(`Detail:      ${data.brief.signal_detail}`);
        console.log(`Opener:      ${data.brief.opener}`);
        console.log(`Talk Track:  ${data.brief.talk_track}`);
        console.log(`Confidence:  ${data.brief.confidence_level}`);
        console.log(`Status:      ${data.brief.status}`);
      } else {
        console.log('Failed:', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error(`Request failed for ${acc.name}:`, err.message);
    }
    
    console.log('Sleeping 10 seconds to prevent RPM rate limit...');
    await delay(10000);
  }
}

run();
