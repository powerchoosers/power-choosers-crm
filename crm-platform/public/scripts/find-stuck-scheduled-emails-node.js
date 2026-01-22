import { admin, db } from '../api/_firebase.js';

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const [k, ...rest] = raw.slice(2).split('=');
    const v = rest.join('=');
    out[k] = v === '' ? true : v;
  }
  return out;
}

function normalizeMillis(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') {
      try {
        const t = value.toMillis();
        return (typeof t === 'number' && Number.isFinite(t)) ? t : null;
      } catch {
        return null;
      }
    }
    if (typeof value.seconds === 'number') {
      return Math.floor(value.seconds * 1000);
    }
  }
  return null;
}

function maskEmail(value) {
  if (!value) return '';
  const s = String(value);
  const at = s.indexOf('@');
  if (at <= 1) return s;
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  return `${name.slice(0, 2)}***@${domain}`;
}

function pickTo(email) {
  const to = email.to;
  if (Array.isArray(to)) return to[0] || '';
  return to || '';
}

async function fetchAllDocs(query, { maxDocs }) {
  const FieldPath = admin.firestore.FieldPath;
  const pageSize = 500;
  const out = [];
  let q = query.orderBy(FieldPath.documentId()).limit(pageSize);

  while (out.length < maxDocs) {
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach(doc => out.push(doc));
    const last = snap.docs[snap.docs.length - 1];
    if (!last) break;
    q = query.orderBy(FieldPath.documentId()).startAfter(last).limit(pageSize);
    if (snap.size < pageSize) break;
  }

  return out.slice(0, maxDocs);
}

async function main() {
  if (!db) {
    throw new Error('Firestore not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set.');
  }

  const args = parseArgs(process.argv.slice(2));

  const now = Date.now();
  const graceMinutes = Number.isFinite(Number(args.graceMinutes)) ? Number(args.graceMinutes) : 10;
  const olderThanDays = Number.isFinite(Number(args.olderThanDays)) ? Number(args.olderThanDays) : 30;
  const maxPerStatus = Number.isFinite(Number(args.maxPerStatus)) ? Number(args.maxPerStatus) : 5000;
  const maxDocs = Number.isFinite(Number(args.maxDocs)) ? Number(args.maxDocs) : 20000;
  const statuses = (typeof args.statuses === 'string' && args.statuses.trim())
    ? args.statuses.split(',').map(s => s.trim()).filter(Boolean)
    : ['approved', 'pending_approval', 'not_generated', 'generating', 'sending', 'scheduled'];
  const scanAll = args.scanAll === true || String(args.scanAll || '').toLowerCase() === 'true';

  const graceMs = graceMinutes * 60 * 1000;
  const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;
  const cutoff = now - Math.max(graceMs, olderThanMs);

  const excludedStatuses = new Set(['sent', 'delivered', 'rejected', 'error']);

  console.log('[FindStuckScheduledEmailsNode] Starting', {
    scanAll,
    statuses,
    olderThanDays,
    graceMinutes,
    maxPerStatus,
    maxDocs,
    cutoffIso: new Date(cutoff).toISOString()
  });

  const docs = [];
  if (scanAll) {
    const q = db.collection('emails').where('type', '==', 'scheduled');
    const batch = await fetchAllDocs(q, { maxDocs });
    docs.push(...batch);
    console.log('[FindStuckScheduledEmailsNode] Fetched scheduled batch', { count: batch.length });
  } else {
    for (const status of statuses) {
      const q = db.collection('emails').where('type', '==', 'scheduled').where('status', '==', status);
      const batch = await fetchAllDocs(q, { maxDocs: maxPerStatus });
      docs.push(...batch);
      console.log('[FindStuckScheduledEmailsNode] Fetched batch', { status, count: batch.length });
    }
  }

  const unique = new Map();
  docs.forEach(doc => {
    if (!unique.has(doc.id)) unique.set(doc.id, doc);
  });

  const stuck = [];
  for (const doc of unique.values()) {
    const data = doc.data();
    const status = String(data.status || '').toLowerCase();
    if (excludedStatuses.has(status)) continue;
    if (data.type !== 'scheduled') continue;

    const sendAtMs = normalizeMillis(data.scheduledSendTime);
    if (!sendAtMs) continue;
    if (sendAtMs > cutoff) continue;

    stuck.push({
      id: doc.id,
      status: status || '(missing)',
      scheduledSendTime: new Date(sendAtMs).toISOString(),
      ageDays: Math.floor((now - sendAtMs) / (24 * 60 * 60 * 1000)),
      subject: String(data.subject || '').slice(0, 80),
      to: maskEmail(pickTo(data)),
      ownerId: data.ownerId || '',
      contactId: data.contactId || data.contact_id || '',
      sequenceId: data.sequenceId || '',
      stepIndex: (typeof data.stepIndex === 'number') ? data.stepIndex : null
    });
  }

  stuck.sort((a, b) => a.ageDays - b.ageDays);

  const counts = {};
  for (const e of stuck) counts[e.status] = (counts[e.status] || 0) + 1;

  console.log('[FindStuckScheduledEmailsNode] Done', {
    scannedUniqueDocs: unique.size,
    stuckCount: stuck.length,
    stuckByStatus: counts
  });

  if (stuck.length) {
    console.table(stuck);
    console.log('[FindStuckScheduledEmailsNode] Stuck email IDs (copy/paste):', stuck.map(e => e.id));
  }
}

main().catch(err => {
  console.error('[FindStuckScheduledEmailsNode] Failed', err && err.message ? err.message : err);
  process.exitCode = 1;
});
