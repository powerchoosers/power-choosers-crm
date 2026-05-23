const accounts = [
  { id: '2900702f-d6d7-42c8-bcae-46a0467759c2', name: 'Cars and Credit Master' },
  { id: 'bf157428-4221-487e-8ff3-b59070e94a2e', name: 'AOG Living' },
  { id: '881fcc7f-5400-4b18-b8fd-3cd13c1da132', name: 'Christ For The Nations' },
  { id: '5317cdf7-cd9e-46b8-92fe-98d1169fb19c', name: '48forty Solutions' }
];

async function run() {
  const results = [];
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
      } else {
        console.log('Failed:', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error(`Request failed for ${acc.name}:`, err.message);
    }
  }
}

run();
