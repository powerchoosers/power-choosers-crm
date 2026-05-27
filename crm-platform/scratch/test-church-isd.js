const accounts = [
  { id: 'fa3275da-0fd6-47a7-9d02-e48298e370fa', name: 'St. Andrew Methodist Church' },
  { id: '0238b55e-a3fc-4f38-8472-12674cf17790', name: 'Galena Park ISD' },
];

async function tryBrief(acc) {
  const url = `http://localhost:3000/api/accounts/${acc.id}/intelligence-brief`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer dev-bypass-token',
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  for (const acc of accounts) {
    console.log(`\n=== ${acc.name} ===`);
    try {
      const { status, data } = await tryBrief(acc);
      if (status !== 200) {
        console.log(`HTTP ${status}:`, JSON.stringify(data, null, 2));
        continue;
      }
      const brief = data.brief || {};
      const profile = data.account?.metadata?.intelligenceProfile || {};
      console.log('Status:         ', status);
      console.log('usedFallback:   ', data.usedFallback);
      console.log('inferredCluster:', data.inferredCluster);
      console.log('industryCluster:', profile.industryCluster);
      console.log('companyType:    ', profile.companyType);
      console.log('facilityType:   ', profile.facilityType);
      console.log('operatingModel: ', profile.operatingModel);
      console.log('Headline:       ', brief.signal_headline);
      console.log('Opener:         ', brief.opener?.substring(0, 120));
      console.log('Talk track:     ', brief.talk_track?.substring(0, 150));
    } catch (err) {
      console.error(`Error for ${acc.name}:`, err.message);
    }
  }
}

run();
