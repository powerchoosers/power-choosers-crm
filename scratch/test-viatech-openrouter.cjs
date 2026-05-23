const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
let openrouterKey = '';
let supabaseUrl = '';
let supabaseServiceKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const getVal = (key) => {
    const match = envContent.match(new RegExp(`${key}=(.*)`));
    return match ? match[1].trim().replace(/['\"]/g, '') : '';
  };
  openrouterKey = getVal('OPEN_ROUTER_API_KEY') || getVal('OPENROUTER_API_KEY');
  supabaseUrl = getVal('NEXT_PUBLIC_SUPABASE_URL');
  supabaseServiceKey = getVal('SUPABASE_SERVICE_ROLE_KEY');
} catch (e) {
  console.error('Failed to read .env.local:', e.message);
}

if (!openrouterKey || !supabaseUrl || !supabaseServiceKey) {
  console.error('Missing credentials!');
  process.exit(1);
}

// We can call the API directly using a custom request or we can mock the values and make a fetch to OpenRouter
// Let's run a test by hitting the local endpoint with a special debug flag if we had one, or we can just fetch the account from Supabase and run the same prompts.
const { createClient: createSupabase } = require('@supabase/supabase-js');
const supabase = createSupabase(supabaseUrl, supabaseServiceKey);

async function test() {
  console.log('Fetching ViaTech account...');
  const { data: account, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', '7aa3adb1-8806-463b-a87b-13570e43a40f')
    .single();

  if (error || !account) {
    console.error('Failed to fetch account:', error?.message);
    return;
  }

  console.log('Account fetched:', account.name);
  console.log('Website:', account.website, 'Domain:', account.domain);

  // Let's mock a simple fallback candidate resembling the ViaTech Jina result
  const candidate = {
    priority: 8,
    label: 'Company Website',
    query: 'ViaTech company information',
    url: 'https://www.viatech.io/',
    title: 'ViaTech | Global Content Management & Print Solutions',
    snippet: 'ViaTech Publishing Solutions specializes in content automation, learning compliance, and print fulfillment for global multi-unit brands.',
    publishedAt: new Date().toISOString(),
    source: 'https://www.viatech.io/',
    sourceKind: 'web'
  };

  // Build the prompt using the same structure as runOpenRouterResearch
  const companyName = account.name || 'ViaTech';
  const industry = account.industry || 'print/content fulfillment';
  const location = 'Dallas, Texas';

  const prompt = `You are writing an Intelligence Brief for Nodal Point, a Texas commercial energy broker.
Use ONLY the research payload below. Do not invent facts.

Return JSON only with this shape:
{
  "usable_signal": true,
  "signal_headline": "",
  "signal_detail": "",
  "opener": "",
  "talk_track": "",
  "signal_date": "YYYY-MM-DD",
  "source_date": "YYYY-MM-DD",
  "source_url": "",
  "confidence_level": "High|Medium|Low",
  "selected_priority": 8,
  "source_title": "Company Website",
  "source_domain": "viatech.io"
}

RESEARCH PAYLOAD:
${JSON.stringify({
  current_date: new Date().toISOString().slice(0, 10),
  account: {
    name: companyName,
    industry: industry,
    domain: 'viatech.io',
    city: 'Dallas',
    state: 'TX',
    description: account.description || ''
  },
  research_results: [candidate]
}, null, 2)}`;

  console.log('Sending request to OpenRouter using google/gemini-2.5-flash or ~google/gemini-flash-latest...');
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
        'HTTP-Referer': 'https://powerchoosers.com',
        'X-Title': 'Power Choosers CRM Test',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    const status = response.status;
    const text = await response.text();
    console.log(`Status: ${status}`);
    console.log(`Raw Content:\n${text}`);
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

test();
