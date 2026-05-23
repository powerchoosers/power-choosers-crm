const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function test() {
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

  console.log('Using key length:', key.length);
  const genAI = new GoogleGenerativeAI(key);
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Say hello and confirm you are online.');
    console.log('Gemini response:', result.response.text());
  } catch (err) {
    console.error('Gemini error:', err);
  }
}

test();
