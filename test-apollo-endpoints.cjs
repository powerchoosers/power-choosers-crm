
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load env vars
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/APOLLO_API_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

if (!apiKey) {
  console.error('No API key found');
  process.exit(1);
}

const fetch = (url, options) => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        statusText: res.statusMessage,
        json: () => {
             try { return Promise.resolve(JSON.parse(data)); }
             catch(e) { return Promise.resolve({ error: 'Invalid JSON', raw: data }); }
        },
        text: () => Promise.resolve(data)
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
};

async function testEndpoint(name, endpoint, body) {
  console.log(`\nTesting ${name} (${endpoint})...`);
  try {
    const res = await fetch(`https://api.apollo.io/api/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(body)
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    
    if (data.people && data.people.length > 0) {
      const p = data.people[0];
      console.log('First result:', {
        id: p.id,
        name: p.name || `${p.first_name} ${p.last_name}`,
        obfuscated: p.last_name_obfuscated,
        email: p.email,
        linkedin: p.linkedin_url
      });
    } else {
      console.log('No people found or error structure:', JSON.stringify(data).substring(0, 200));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function run() {
  const searchBody = {
    page: 1,
    per_page: 5,
    q_keywords: "manager" // Simple keyword search
  };

  // 1. Old Endpoint (mixed_people/search)
  await testEndpoint('Old Endpoint', 'mixed_people/search', searchBody);

  // 2. New Endpoint (mixed_people/api_search)
  await testEndpoint('New Endpoint', 'mixed_people/api_search', searchBody);
  
  // 3. Standard Search (people/search)
  await testEndpoint('Standard Search', 'people/search', searchBody);
}

run();
