#!/usr/bin/env node
/**
 * Test which Gemini models work with the current API key.
 * Run from repo root: node scripts/test-gemini-models.js
 * Uses GEMINI_API_KEY or FREE_GEMINI_KEY from .env.
 *
 * Only tests Gemini models (same list as api/gemini/chat.js and GeminiChat dropdown).
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { GoogleGenerativeAI } = await import('@google/generative-ai');

// Same list as api/gemini/chat.js ALLOWED_GEMINI_MODELS (only verified-working models).
const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY and FREE_GEMINI_KEY in .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelId) {
  try {
    const model = genAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent('Reply with exactly: OK');
    const text = result?.response?.text?.()?.trim() ?? '';
    return { ok: true, text: text.slice(0, 80) };
  } catch (err) {
    const msg = err?.message ?? String(err);
    const notFound = /not found|404|invalid.*model/i.test(msg);
    return { ok: false, error: msg.slice(0, 120), notFound };
  }
}

console.log('Testing Gemini models (same list as chat backend & UI)...\n');

const results = [];
for (const modelId of GEMINI_MODELS) {
  process.stderr.write(`  ${modelId} ... `);
  const r = await testModel(modelId);
  results.push({ model: modelId, ...r });
  process.stderr.write(r.ok ? 'OK\n' : 'FAIL\n');
}

console.log('\n--- Results ---');
console.table(
  results.map(({ model, ok, error, notFound, text }) => ({
    model,
    status: ok ? 'OK' : (notFound ? 'NOT_FOUND' : 'ERROR'),
    detail: ok ? (text || '—') : (error || '—'),
  }))
);

const working = results.filter((r) => r.ok).map((r) => r.model);
const failed = results.filter((r) => !r.ok).map((r) => r.model);
console.log('\nWorking:', working.length ? working.join(', ') : 'none');
console.log('Failed:', failed.length ? failed.join(', ') : 'none');

if (failed.length > 0) {
  console.log('\nFailed details:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ${r.model}: ${r.error}`));
}

process.exit(failed.length === GEMINI_MODELS.length ? 1 : 0);
