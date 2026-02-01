import fetch from 'node-fetch';

async function testChat() {
  console.log('--- Testing Nodal Architect Chat Endpoint ---');
  
  const payload = {
    messages: [
      { role: 'user', content: 'Trey here. Can you find the account "Camp Fire First Texas" in our database and tell me its annual usage and current provider?' }
    ],
    model: 'google/gemini-2.0-flash', // Requesting 2.0-flash directly to see if OpenRouter can route it properly
    context: { type: 'global_dashboard' }
  };

  try {
    const response = await fetch('http://localhost:3001/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('\n--- AI Response ---');
    console.log(data.content);
    console.log('\n--- Diagnostics ---');
    console.log(JSON.stringify(data.diagnostics, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testChat();
