const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testModel(genAI, modelName) {
  console.log(`\n--- Testing model: ${modelName} ---`);
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: 'You are a helpful assistant. Reply with a short JSON.',
    });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Respond with {"ok": true}' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });
    console.log(`SUCCESS [${modelName}]:`, result.response.text().trim());
  } catch (err) {
    console.error(`FAILED [${modelName}]:`, err.message);
  }
}

async function run() {
  let key = '';
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const match = env.match(/NEXT_PUBLIC_FREE_GEMINI_KEY=(.*)/);
    if (match) {
      key = match[1].trim().replace(/['\"]/g, '');
    }
  } catch (e) {
    console.error('Failed to read env:', e.message);
  }

  if (!key) {
    console.error('No GEMINI key found');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(key);
  
  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash'
  ];

  for (const m of models) {
    await testModel(genAI, m);
  }
}

run();
