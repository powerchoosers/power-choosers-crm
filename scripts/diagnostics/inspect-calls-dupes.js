#!/usr/bin/env node
const http = require('http');
const https = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
      }).on('error', reject);
    } catch (e) { reject(e); }
  });
}

function norm(s) {
  return (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
}
function isClient(s) { return typeof s === 'string' && s.startsWith('client:'); }

async function main() {
  const base = (process.argv[2] || process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const callSid = (process.argv[3] || '').trim();
  const url = callSid ? `${base}/api/calls?callSid=${encodeURIComponent(callSid)}` : `${base}/api/calls`;
  const { status, text } = await fetchText(url);
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (_) {}
  if (!j || !j.ok || !Array.isArray(j.calls)) {
    console.log('BAD_RESPONSE status=' + status);
    console.log(text.slice(0, 500));
    process.exit(0);
  }
  const calls = j.calls;
  if (callSid) {
    console.log('FILTER_CALL_SID=' + callSid);
    console.log('MATCHES=' + calls.length);
    calls.forEach((c,i)=>{
      const turns = Array.isArray(c?.aiInsights?.speakerTurns) ? c.aiInsights.speakerTurns.length : 0;
      const dur = c.durationSec || c.duration || 0;
      const hasRec = c.audioUrl || c.recordingUrl ? 'rec' : 'norec';
      console.log(`[#${i+1}] id=${c.id} sid=${c.twilioSid||''} status=${c.status||''} dur=${dur} ts=${c.timestamp||c.callTime||''} ${hasRec} turns=${turns} to=${c.to||''} from=${c.from||''}`);
    });
  }
  const groups = new Map();
  for (const c of calls) {
    const to = norm(isClient(c.to) ? '' : c.to);
    const from = norm(isClient(c.from) ? '' : c.from);
    const pair = [to, from].filter(Boolean).sort().join('~');
    const ts = new Date(c.timestamp || c.callTime || 0).getTime() || 0;
    const bucket = ts ? Math.floor(ts / (5 * 60 * 1000)) : 0;
    const key = c.twilioSid ? `sid:${c.twilioSid}` : (pair ? `pair:${pair}:b:${bucket}` : `na:${bucket}`);
    const list = groups.get(key) || [];
    list.push(c);
    groups.set(key, list);
  }
  const dupEntries = [...groups.entries()].filter(([, v]) => v.length > 1);
  console.log('TOTAL_CALLS=' + calls.length);
  console.log('GROUPS=' + groups.size);
  console.log('DUP_GROUPS=' + dupEntries.length);
  for (const [k, v] of dupEntries.slice(0, 12)) {
    console.log('GROUP ' + v.length + ' ' + k);
    for (const c of v) {
      const turns = Array.isArray(c?.aiInsights?.speakerTurns) ? c.aiInsights.speakerTurns.length : 0;
      const dur = c.durationSec || c.duration || 0;
      const hasRec = c.audioUrl || c.recordingUrl ? 'rec' : 'norec';
      console.log(` - id=${c.id} sid=${c.twilioSid||''} status=${c.status||''} dur=${dur} ts=${c.timestamp||c.callTime||''} ${hasRec} turns=${turns} to=${c.to||''} from=${c.from||''}`);
    }
  }
}

main().catch((e) => { console.error('ERR', e && e.message || e); process.exit(1); });
