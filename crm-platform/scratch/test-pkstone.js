const accountId = '79e97c39-9ced-45a2-b427-b3f606174c8c'; // P&K Stone LLC
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
