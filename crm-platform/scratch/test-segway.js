const accountId = '1e6d1ed1-8c62-4b70-a571-a05f3dd74ad7'; // Segway Powersports US
const url = `http://localhost:3000/api/accounts/${accountId}/intelligence-brief`;

async function run() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer dev-bypass-token',
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
