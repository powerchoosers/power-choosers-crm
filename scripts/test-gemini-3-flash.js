#!/usr/bin/env node
/**
 * Test Gemini 3.0 Flash Preview endpoint.
 * Use this to verify if the model works or if billing/quota is blocking access.
 *
 * Usage: node scripts/test-gemini-3-flash.js
 * Requires: Backend running on port 3001 (npm run dev:all or PORT=3001 node server.js)
 */

import fetch from 'node-fetch';

const CHAT_URL = process.env.CHAT_URL || 'http://localhost:3001/api/gemini/chat';
const MODEL = 'gemini-3-flash-preview';

async function testGemini3Flash() {
  console.log('--- Gemini 3.0 Flash Preview Test ---\n');
  console.log(`Endpoint: ${CHAT_URL}`);
  console.log(`Model:    ${MODEL}\n`);

  const payload = {
    messages: [{ role: 'user', content: 'Reply with only the word OK.' }],
    model: MODEL,
    context: { type: 'general', label: 'GLOBAL_SCOPE' },
    userProfile: { firstName: 'Trey' },
  };

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.log('Response (raw):', raw.slice(0, 800));
      console.log('\nStatus:', res.status, res.statusText);
      return;
    }

    console.log('HTTP Status:', res.status, res.statusText);
    console.log('Response keys:', Object.keys(data));

    if (data.error) {
      console.log('\n--- ERROR (likely billing/quota) ---');
      console.log('error:   ', data.error);
      console.log('message: ', data.message || '(none)');
      if (data.diagnostics?.length) {
        console.log('\nDiagnostics:');
        data.diagnostics.forEach((d, i) => {
          console.log(`  [${i}] ${d.model} (${d.provider}): ${d.status}`);
          if (d.error) console.log(`      error: ${d.error}`);
          if (d.errorType) console.log(`      errorType: ${d.errorType}`);
        });
      }
      console.log('\nFull response:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('\n--- SUCCESS ---');
    console.log('provider:', data.provider);
    console.log('model:   ', data.model);
    console.log('content: ', String(data.content || '').trim().slice(0, 300));
    if (data.diagnostics?.length) {
      console.log('\nDiagnostics:', data.diagnostics.map(d => `${d.model}: ${d.status}`).join(', '));
    }
  } catch (err) {
    console.error('Request failed:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}

testGemini3Flash();
