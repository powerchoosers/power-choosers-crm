/**
 * POST /api/foundry/generate-text
 * Generates or rewrites copy for Foundry blocks using Perplexity Sonar.
 * Body: { prompt: string, context?: string, blockType?: 'narrative' | 'button' | 'subject' }
 * Returns: { text: string }
 */

import { cors } from '../_cors.js';
import logger from '../_logger.js';

const SYSTEM_PROMPT = `You are a Nodal Point copywriter. Output only the requested text, no preamble or explanation.
Tone: forensic, precise, intelligence-brief style. No marketing fluff.`;

function blockTypeInstruction(blockType) {
  if (blockType === 'button') {
    return ' Output a single tactical CTA label in brackets, e.g. [ VIEW_FORENSIC_DATA ] or [ INITIATE_AUDIT ].';
  }
  if (blockType === 'subject') {
    return ' Output a single email subject line, concise and technical.';
  }
  return '';
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PERPLEXITY_API_KEY not configured' }));
    return;
  }

  try {
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const context = typeof body.context === 'string' ? body.context.trim() : '';
    const blockType = ['narrative', 'button', 'subject'].includes(body.blockType) ? body.blockType : 'narrative';

    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'prompt is required' }));
      return;
    }

    const userMessage = context ? `${prompt}\n\nCurrent text:\n${context}` : prompt;
    const extra = blockTypeInstruction(blockType);
    const model = process.env.PERPLEXITY_MODEL || 'sonar';

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + extra },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('[Foundry Generate] Perplexity error', response.status, errText?.slice(0, 200));
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI service error', details: errText?.slice(0, 200) }));
      return;
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content.trim() : '';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text }));
  } catch (error) {
    logger.error('[Foundry Generate]', error?.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', details: error?.message }));
    }
  }
}
