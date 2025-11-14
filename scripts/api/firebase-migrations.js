'use strict';

// One-time cleanup script for Calls collection
// Normalizes fields and removes duplicates safely.

const admin = require('../../api/_firebase').admin;
const db = require('../../api/_firebase').db;

async function run() {
  if (!db) {
    console.log('[migrate] Firestore not configured in this environment. Skipping.');
    return;
  }
  const snap = await db.collection('calls').get();
  let updates = 0; let batch = db.batch(); let batchCount = 0;
  snap.forEach((doc) => {
    const c = doc.data() || {};
    // Compute normalized fields
    const contactName = c.contactName || c.contact_name || '';
    const contactTitle = c.contactTitle || c.contact_title || '';
    const company = c.company || c.accountName || c.companyName || '';
    const accountId = c.accountId || c.accountID || '';
    const durationSec = (c.durationSec != null) ? c.durationSec : (c.duration || 0);
    const ci = c.conversationalIntelligence || (c.aiInsights && c.aiInsights.conversationalIntelligence) || null;
    const formattedTranscript = c.formattedTranscript || '';
    const recordingChannels = c.recordingChannels != null ? String(c.recordingChannels) : (c.channels != null ? String(c.channels) : undefined);
    const recordingTrack = c.recordingTrack || c.track || undefined;
    const recordingSource = c.recordingSource || c.source || undefined;
    const targetPhone = c.targetPhone || '';
    // Only write when there is a change
    const next = {
      contactName,
      contactTitle,
      company,
      accountId,
      durationSec,
      formattedTranscript,
      conversationalIntelligence: ci,
      recordingChannels,
      recordingTrack,
      recordingSource,
      targetPhone
    };
    // Strip undefined keys to avoid overwriting with undefined
    Object.keys(next).forEach((k)=>{ if (next[k] === undefined) delete next[k]; });
    // Avoid empty no-op updates
    const hasChange = Object.keys(next).some((k) => {
      const a = c[k];
      const b = next[k];
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    if (hasChange) {
      batch.set(doc.ref, next, { merge: true });
      updates++;
      batchCount++;
      if (batchCount >= 400) { batch.commit(); batch = db.batch(); batchCount = 0; }
    }
  });
  if (batchCount) await batch.commit();
  console.log(`[migrate] Processed ${snap.size} docs, updated ${updates}.`);
}

if (require.main === module) {
  run().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
}

module.exports = { run };


