import fetch from 'node-fetch';

async function testChat() {
  console.log('--- Testing Nodal Architect Chat Endpoint ---');

  const models = [
    'openai/gpt-oss-120b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'gemini-2.0-flash',
    'gemini-2.0-flash-thinking-exp-01-21',
    'gemini-2.0-pro-exp-02-05',
    'sonar-pro',
    'sonar'
  ];

  const makePayload = ({ messages, model }) => ({
    messages,
    model,
    context: { type: 'global_dashboard' },
    userProfile: { firstName: 'Trey' }
  });

  const runTurn = async ({ model, messages }) => {
    const response = await fetch('http://localhost:3001/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(makePayload({ messages, model }))
    });

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Non-JSON response (${response.status}): ${raw.slice(0, 500)}`);
    }

    if (!response.ok || data.error) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }

    return data;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    for (const model of models) {
      console.log(`\n=== MODEL: ${model} ===`);

      let messages = [];

      const nonCrm = await runTurn({
        model,
        messages: [{ role: 'user', content: 'Return ONLY the string OK.' }]
      });
      console.log('\n[non-CRM] provider:', nonCrm.provider, 'model:', nonCrm.model);
      console.log('[non-CRM] content:', String(nonCrm.content || '').trim().slice(0, 200));

      messages = [{ role: 'user', content: 'can you find camp fire first texas in my database?' }];
      const camp = await runTurn({ model, messages });
      console.log('\n[CRM search] provider:', camp.provider, 'model:', camp.model);
      console.log('[CRM search] content:', String(camp.content || '').trim().slice(0, 500));
      messages.push({ role: 'assistant', content: camp.content || '' });

      messages.push({ role: 'user', content: 'integrated circuit solutions?' });
      const ics = await runTurn({ model, messages });
      console.log('\n[CRM search] provider:', ics.provider, 'model:', ics.model);
      console.log('[CRM search] content:', String(ics.content || '').trim().slice(0, 500));
      messages.push({ role: 'assistant', content: ics.content || '' });

      messages.push({ role: 'user', content: 'what contract details do you see on them?' });
      const contract = await runTurn({ model, messages });
      console.log('\n[contract] provider:', contract.provider, 'model:', contract.model);
      console.log('[contract] content:', String(contract.content || '').trim().slice(0, 700));

      await sleep(400);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testChat();
