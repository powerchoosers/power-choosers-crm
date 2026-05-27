const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function test() {
  const accountId = '2e23e350-fa3a-4fd7-9874-d1a0f69949af'; // Hobby Lobby
  const url = `http://localhost:3000/api/accounts/${accountId}/intelligence-brief`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer dev-bypass-token',
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    console.log('API RESPONSE:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

test();
