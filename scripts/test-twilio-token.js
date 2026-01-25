
async function testToken() {
  try {
    console.log('Testing /api/twilio/token endpoint...');
    // Native fetch is available in Node.js 18+
    const response = await fetch('http://127.0.0.1:3001/api/twilio/token?identity=test-agent');
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      console.log('Response JSON:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response Text:', text);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

testToken();
