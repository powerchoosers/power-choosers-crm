const accountId = 'fa3275da-0fd6-47a7-9d02-e48298e370fa'; // St. Andrew Methodist Church
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
