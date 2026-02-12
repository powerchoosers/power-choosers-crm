/**
 * Delta Analysis: one-sentence tactical summary for a news headline.
 * Used by Target Signal Stream "Δ" button. Gemini produces a Market Architect-style impact sentence.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const geminiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: Gemini key missing' }));
      return;
    }

    const { headline, snippet } = req.body || {};
    if (!headline || typeof headline !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid headline' }));
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const context = snippet ? `Headline: ${headline}\nSnippet: ${snippet}` : `Headline: ${headline}`;
    const prompt = `You are a Market Architect in energy/utility sales. Given this company news, output exactly ONE sentence of tactical impact. Be specific and actionable (e.g. load change, 4CP risk, expansion, budget timing). No preamble, no quotes—just the sentence.

${context}`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    const summary = (text || '').trim().replace(/^["']|["']$/g, '');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary: summary || 'No tactical summary available.' }));
  } catch (e) {
    console.error('[Analyze Signal] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Analysis failed', summary: '' }));
  }
}
