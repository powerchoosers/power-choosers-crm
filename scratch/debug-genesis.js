const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// We copy the essential parts of validateBriefResult and normalizeSignalDetail to check the output locally
function cleanText(text) {
  return String(text || '').trim();
}

function splitTalkTrackSentences(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
}

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
  const accountId = '7380ea11-7b0a-48e3-afa9-4fdac998e498'; // Genesis Women's Shelter
  
  const { data: account, error } = await supabase.from('accounts').select('*').eq('id', accountId).single();
  if (error) {
    console.error('Failed to fetch account:', error);
    process.exit(1);
  }

  const description = account.description || account.metadata?.description || '';

  const fullPrompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.
Use the Texas energy broker tone: Lewis Patterson is a real guy in Fort Worth. He calls out of the blue, speaks plain English, does not lecture.

Return JSON only with this shape:
{
  "usable_signal": true,
  "signal_headline": "Headline",
  "signal_detail": "Detail",
  "opener": "Opener",
  "talk_track": "Talk track"
}

OPENER RULES (Exactly two sentences):
- Must be structured EXACTLY like: "[Greeting], it's Lewis with Nodal Point, calling you out the blue here, so I'll be brief. [Signal/Research Hook], and had a curious question about y'alls electricity agreements and contracts."
- Greeting must be 'Hey there' or similar.
- If the brief is based on general company context, frame the research hook around researching their specific operational focus in their location (e.g. psychiatric care facility in Dallas, tire recycling operation in Fort Worth). For example: "I've been researching a psychiatric care facility in Dallas". Never use vague phrases like "a manufacturing operation".
- Must end the second sentence exactly with ", and had a curious question about y'alls electricity agreements and contracts."

TALK_TRACK_RULES (Exactly two sentences):
- Sentence 1: A specific, plain-English problem or situational struggle tied to the company's real operations. Customize to weave in specific details of their actual business (e.g. shelter beds, clinical operatories).
- Sentence 2: One short curiosity question. It MUST start with "I'm curious..." or "How do y'all..." and end exactly with one of these safety-valve phrases: ", or is that pretty much on autopilot?" or ", or is that side of things pretty much on autopilot?" or ", or is that pretty much handled?" or ", or is that side of things pretty much handled?".
- CRITICAL: The talk track MUST consist of exactly these two sentences. Not one, not three. Exactly two.
- CRITICAL: The word count of the talk track MUST be between 15 and 85 words.`;

  console.log('Calling Gemini...');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: fullPrompt,
  });

  const payload = `Company: Genesis Women's Shelter & Support
Description: ${description}
Location: Dallas, Texas
Industry: Non-Profit / Residential Care`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: payload }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    }
  });

  const raw = result.response.text();
  console.log('RAW GEMINI OUTPUT:');
  console.log(raw);

  const parsed = JSON.parse(raw);
  const talkTrack = parsed.talk_track;
  const opener = parsed.opener;

  // Let's validate the opener structure
  const hasValidOpenerStructure = opener.includes(", and had a curious question about y'alls electricity agreements and contracts.") && opener.includes(" Lewis with Nodal Point");
  console.log('Opener validation:', { opener, hasValidOpenerStructure });

  // Let's validate the talk track structure
  const talkTrackWordCount = talkTrack.split(/\s+/).filter(Boolean).length;
  const sentences = splitTalkTrackSentences(talkTrack);
  const talkTrackSentenceCount = sentences.length;
  const endsWithSafetyValve = /,\s*or\s+is\s+that\s+pretty\s+much\s+on\s+autopilot\?\s*$/i.test(talkTrack) ||
                             /,\s*or\s+is\s+that\s+side\s+of\s+things\s+pretty\s+much\s+on\s+autopilot\?\s*$/i.test(talkTrack) ||
                             /,\s*or\s+is\s+that\s+pretty\s+much\s+handled\?\s*$/i.test(talkTrack) ||
                             /,\s*or\s+is\s+that\s+side\s+of\s+things\s+pretty\s+much\s+handled\?\s*$/i.test(talkTrack);

  console.log('Talk Track validation:', {
    talkTrack,
    talkTrackSentenceCount,
    talkTrackWordCount,
    endsWithSafetyValve,
    isValid: (talkTrackSentenceCount === 2 && talkTrackWordCount >= 14 && talkTrackWordCount <= 95 && endsWithSafetyValve)
  });
}

debug();
