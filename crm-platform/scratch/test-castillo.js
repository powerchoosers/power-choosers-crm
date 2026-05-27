const accountId = '6018351d-4108-47bd-b3db-37bdf4f67e8e'; // Castillo's Produce Inc.
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
