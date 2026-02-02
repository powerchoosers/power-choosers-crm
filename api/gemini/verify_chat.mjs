
import handler from './chat.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Mock Request/Response
class MockRes {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = '';
    this.finished = false;
  }
  
  setHeader(name, value) {
    this.headers[name] = value;
  }

  writeHead(code, headers) {
    this.statusCode = code;
    this.headers = { ...this.headers, ...headers };
  }
  
  end(body) {
    this.body = body;
    this.finished = true;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }
  
  json(data) {
    this.body = JSON.stringify(data);
    this.finished = true;
    return this;
  }
}

async function runTest(prompt, description) {
  console.log(`\n--- Testing: ${description} ---`);
  console.log(`Prompt: "${prompt}"`);
  
  const req = {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000'
    },
    body: {
      messages: [{ role: 'user', content: prompt }],
      userProfile: { firstName: 'Tester' }
    }
  };
  
  const res = new MockRes();
  
  try {
    await handler(req, res);
    
    if (res.statusCode !== 200) {
      console.error(`❌ Status ${res.statusCode}: ${res.body}`);
      return;
    }
    
    const data = JSON.parse(res.body);
    console.log(`Response Provider: ${data.provider}`);
    
    // Check content for JSON blocks
    if (data.content.includes('JSON_DATA:')) {
      const match = data.content.match(/JSON_DATA:(.*?)END_JSON/);
      if (match) {
        try {
          const json = JSON.parse(match[1]);
          console.log(`✅ Returned JSON Block Type: ${json.type}`);
          if (json.type === 'position_maturity') {
            console.log(`   Account: ${json.data.currentSupplier} | Expiration: ${json.data.expiration}`);
          } else if (json.type === 'forensic_grid') {
            console.log(`   Title: ${json.data.title}`);
            console.log(`   Rows: ${json.data.rows.length}`);
            if (json.data.rows.length > 0) {
                console.log(`   First Row: ${JSON.stringify(json.data.rows[0])}`);
            }
          }
        } catch (e) {
          console.error('❌ Failed to parse JSON block');
        }
      }
    } else {
      console.log('ℹ️ No JSON block in response (Text only)');
      console.log(`   Preview: ${data.content.slice(0, 100)}...`);
    }
    
  } catch (e) {
    console.error('❌ Error running handler:', e);
  }
}

async function main() {
  // Test 1: Location Search
  await runTest("List all accounts located in Humble, Texas", "Location Search");
  
  // Test 2: Contract Expiration (Fresh Query) -> Should promote to Position Maturity if single match
  await runTest("when does camp fire first texas expire?", "Contract Expiration (Single Match)");
  
  // Test 3: Direct Question for Contract Data
  await runTest("what is camp fire first texas contract end date?", "Direct Contract Question");

  // Test 4: General Search -> Should return Grid
  await runTest("Find accounts in the manufacturing industry", "General Industry Search");
}

main();
