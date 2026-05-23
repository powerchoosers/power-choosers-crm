const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function test() {
  const accountId = 'a0c44b32-4ac0-407e-80c2-c6b135d5641d'; // Shine Pediatrics
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
