'use strict';

// Master CRM merge: Calls, People, Accounts
// Safe: only fills missing canonical fields; never deletes source fields.

const { db } = require('../../api/_firebase');

function norm10(v){ try{ return (v==null?'':String(v)).replace(/\D/g,'').slice(-10); }catch(_){ return ''; } }
function cleanDomain(d){ if(!d) return ''; let s=String(d).trim(); try{ if(!/^https?:\/\//i.test(s)) s='https://'+s; const u=new URL(s); return (u.hostname||'').replace(/^www\./i,''); }catch(_){ return s.replace(/^https?:\/\/(www\.)?/i,'').split('/')[0]; } }

async function mergeCalls(){
  if (!db) { console.log('[merge] Skipping Calls: Firestore not configured'); return; }
  const snap = await db.collection('calls').get();
  const docs = snap.docs || [];
  let updates = 0; let batch = db.batch(); let batchCount = 0;
  for (const doc of docs) {
    const c = doc.data() || {};
    const next = {};
    // Canonical fields
    next.contactName = c.contactName || c.contact_name || '';
    next.contactTitle = c.contactTitle || c.contact_title || '';
    next.company = c.company || c.accountName || c.companyName || '';
    next.accountId = c.accountId || c.accountID || '';
    next.durationSec = (c.durationSec != null) ? c.durationSec : (c.duration || 0);
    next.formattedTranscript = c.formattedTranscript || '';
    next.conversationalIntelligence = c.conversationalIntelligence || (c.aiInsights && c.aiInsights.conversationalIntelligence) || null;
    next.recordingChannels = (c.recordingChannels != null) ? String(c.recordingChannels) : (c.channels != null ? String(c.channels) : undefined);
    next.recordingTrack = c.recordingTrack || c.track || undefined;
    next.recordingSource = c.recordingSource || c.source || undefined;
    next.targetPhone = c.targetPhone || (function(){ const to=norm10(c.to); const from=norm10(c.from); return to||from||''; })();
    Object.keys(next).forEach(k=>{ if (next[k]===undefined) delete next[k]; });
    const hasChange = Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(c[k]));
    if (hasChange) {
      batch.set(doc.ref, next, { merge: true });
      updates++;
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }
  if (batchCount) await batch.commit();
  console.log(`[merge] Calls updated: ${updates}`);
}

async function mergePeople(){
  if (!db) { console.log('[merge] Skipping People: Firestore not configured'); return; }
  const col = db.collection('people');
  const snap = await col.get();
  const docs = snap.docs || [];
  let updates = 0; let batch = db.batch(); let batchCount=0;
  for (const doc of docs) {
    const p = doc.data() || {};
    const next = {};
    const first = p.firstName || p.first_name || '';
    const last = p.lastName || p.last_name || '';
    next.name = p.name || [first, last].filter(Boolean).join(' ');
    next.firstName = first; next.lastName = last;
    next.companyName = p.companyName || p.accountName || p.company || '';
    next.accountId = p.accountId || p.accountID || '';
    // phones: keep originals; just ensure workDirectPhone present
    next.workDirectPhone = p.workDirectPhone || p.directPhone || p.phone || '';
    Object.keys(next).forEach(k=>{ if (next[k]===undefined) delete next[k]; });
    const hasChange = Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(p[k]));
    if (hasChange){
      batch.set(doc.ref, next, { merge: true });
      updates++;
      batchCount++;
      if (batchCount>=400){
        await batch.commit();
        batch = db.batch();
        batchCount=0;
      }
    }
  }
  if (batchCount) await batch.commit();
  console.log(`[merge] People updated: ${updates}`);
}

async function mergeAccounts(){
  if (!db) { console.log('[merge] Skipping Accounts: Firestore not configured'); return; }
  const col = db.collection('accounts');
  const snap = await col.get();
  const docs = snap.docs || [];
  let updates = 0; let batch = db.batch(); let batchCount=0;
  for (const doc of docs) {
    const a = doc.data() || {};
    const next = {};
    next.accountName = a.accountName || a.name || a.companyName || '';
    next.name = a.accountName || a.name || a.companyName || '';
    const dom = a.domain || a.website || '';
    next.domain = dom ? cleanDomain(dom) : '';
    Object.keys(next).forEach(k=>{ if (next[k]===undefined) delete next[k]; });
    const hasChange = Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(a[k]));
    if (hasChange){
      batch.set(doc.ref, next, { merge: true });
      updates++;
      batchCount++;
      if (batchCount>=400){
        await batch.commit();
        batch = db.batch();
        batchCount=0;
      }
    }
  }
  if (batchCount) await batch.commit();
  console.log(`[merge] Accounts updated: ${updates}`);
}

async function run(){
  if (!db){ console.log('[merge] Firestore not configured'); return; }
  await mergeCalls();
  await mergePeople();
  await mergeAccounts();
}

if (require.main === module){
  run().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });
}

module.exports = { run };


