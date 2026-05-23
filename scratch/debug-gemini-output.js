const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function debug() {
  let geminiKey = '';
  let supabaseUrl = '';
  let supabaseKey = '';

  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    geminiKey = env.match(/NEXT_PUBLIC_FREE_GEMINI_KEY=(.*)/)[1].trim().replace(/['\"]/g, '');
    supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim().replace(/['\"]/g, '');
    supabaseKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/['\"]/g, '');
  } catch (e) {
    console.error('Failed to read env:', e.message);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const accountId = '3e1bfc43-3a1e-48be-9f3f-8940d189777e'; // Game Nerdz
  
  const { data: account, error } = await supabase.from('accounts').select('*').eq('id', accountId).single();
  if (error) {
    console.error('Failed to fetch account:', error);
    process.exit(1);
  }

  console.log('Account Name:', account.name);
  console.log('Account Description:', account.description || account.metadata?.description);

  // Let's call Gemini using the direct prompt
  // We can construct a simple version of the prompt or mock the prompt building.
  // Actually, let's see if we can import the prompt builder from intelligence-brief.ts dynamically!
  // Wait, intelligence-brief.ts is a Next.js API route using ESM and TypeScript, importing it in a raw CommonJS script might be tricky due to TS/ESM.
  // So we can copy the fallbackPrompt template or just print it from our node script.
  // Let's just mock a direct call using the same prompt rules we wrote to see what Gemini generates for Game Nerdz!
  
  const description = account.description || account.metadata?.description || 'retailer of board games, card games, collectibles, and gaming accessories';
  const fullPrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.
Voice: plainspoken, Lewis Patterson Fort Worth Texas rep.
Signal Detail must be a dense, strategic sales-intelligence summary (exactly 3 to 4 sentences). Do NOT just write a generic company description or bullet points of what they do. Instead, describe:
  1. Their actual operational power-use profile (e.g. "operating 24/7 cleanrooms and refrigeration", "running high-volume CNC machinery", "running classroom HVAC across a school district").
  2. The specific commercial energy liabilities they face (e.g. "heavy demand ratchet exposure from starting up large motors", "high summer 4CP coincident peak liability from comfort cooling during ERCOT scarcity periods", "seasonal budget volatility from HVAC peak load").
  3. The strategic sales angle/pain point for Lewis to lead with (e.g. "leverage contract review to check for demand ratchet floors", "lead with active peak timing during summer 4CP hours to eliminate transmission liability", "discuss seasonal predictability and contract structuring").

Return JSON only with this shape:
{
  "usable_signal": true,
  "signal_headline": "Headline",
  "signal_detail": "Detail",
  "opener": "Opener",
  "talk_track": "Talk track"
}`;

  console.log('Calling Gemini...');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: fullPrompt,
  });

  const payload = `Company: Game Nerdz
Description: ${description}
Location: Richardson, Texas
Industry: Retail`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: payload }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    }
  });

  console.log('RAW GEMINI JSON OUTPUT:');
  console.log(result.response.text());
}

debug();
