const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

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
  try {
    // The listModels method is available on the client/genAI object or via direct REST API
    // Let's use direct REST fetch to be sure we get the models from Google's endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log('Available models:');
    if (data.models) {
      data.models.forEach(m => {
        console.log(`- ${m.name} (${m.displayName}) - Supported: ${m.supportedGenerationMethods.join(', ')}`);
      });
    } else {
      console.log('No models returned. Response:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error listing models:', err.message);
  }
}

run();
