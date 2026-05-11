/**
 * Delta Analysis: one-sentence tactical summary for a news headline.
 * Used by Target Signal Stream "Δ" button. Gemini produces a Market Architect-style impact sentence.
 */

import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: OpenRouter key missing' }));
      return;
    }

    const { headline, snippet } = req.body || {};
    if (!headline || typeof headline !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid headline' }));
      return;
    }

    const context = snippet ? `Headline: ${headline}\nSnippet: ${snippet}` : `Headline: ${headline}`;
    const prompt = `You are a Market Architect in energy/utility sales. Given this company news, output exactly ONE sentence of tactical impact. Be specific and actionable (e.g. load change, 4CP risk, expansion, budget timing). No preamble, no quotes—just the sentence.

${context}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nodalpoint.io',
        'X-Title': 'Nodal Point CRM Analyst',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    const summary = (text || '').trim().replace(/^["']|["']$/g, '');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary: summary || 'No tactical summary available.' }));
  } catch (e) {
    console.error('[Analyze Signal] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Analysis failed', summary: '' }));
  }
}
