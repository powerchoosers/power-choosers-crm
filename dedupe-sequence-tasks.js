import { db } from './api/_firebase.js';

function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') {
      try { return value.toMillis(); } catch (_) { }
    }
    if (typeof value.toDate === 'function') {
      try { return value.toDate().getTime(); } catch (_) { }
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
  }
  return null;
}

function parseDateStrict(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  try {
    if (s.includes('/')) {
      const parts = s.split('/').map(n => parseInt(n, 10));
      if (parts.length === 3 && !parts.some(Number.isNaN)) return new Date(parts[2], parts[0] - 1, parts[1]);
    } else if (s.includes('-')) {
      const parts = s.split('-').map(n => parseInt(n, 10));
      if (parts.length === 3 && !parts.some(Number.isNaN)) return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } catch (_) { }
  return null;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (ap === 'PM') hour += 12;
  return hour * 60 + min;
}

function getScheduledMs(task) {
  const direct = toMillis(task.dueTimestamp) ?? toMillis(task.scheduledTime) ?? toMillis(task.scheduledAt);
  if (direct !== null) return direct;

  const d = parseDateStrict(task.dueDate);
  if (!d) return null;
  const t = parseTimeToMinutes(task.dueTime);
  const ms = d.getTime();
  if (t === null) return ms;
  return ms + t * 60 * 1000;
}

function isPending(task) {
  const status = String(task.status || 'pending').toLowerCase();
  return status !== 'completed' && status !== 'done' && status !== 'cancelled' && status !== 'canceled' && status !== 'deleted';
}

function looksLikeSequenceTask(task) {
  if (task.isSequenceTask === true) return true;
  if (task.sequenceId) return true;
  const p = String(task.priority || '').toLowerCase();
  if (p === 'sequence') return true;
  return false;
}

function fmt(ms) {
  if (!ms && ms !== 0) return '';
  try { return new Date(ms).toISOString(); } catch (_) { return String(ms); }
}

async function main() {
  if (!db) {
    console.error('Firestore is not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set.');
    process.exitCode = 1;
    return;
  }

  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const onlyFlagged = args.has('--only-flagged');
  const maxDeletesArg = process.argv.find(a => a.startsWith('--max-deletes='));
  const maxDeletes = maxDeletesArg ? Math.max(0, parseInt(maxDeletesArg.split('=')[1] || '0', 10) || 0) : 0;

  const snap = onlyFlagged
    ? await db.collection('tasks').where('isSequenceTask', '==', true).get()
    : await db.collection('tasks').get();

  const byContact = new Map();

  const normalize = (v) => String(v || '').trim().toLowerCase();
  snap.forEach(doc => {
    const task = doc.data() || {};
    if (!looksLikeSequenceTask(task)) return;
    if (!isPending(task)) return;
    const contactId = normalize(task.contactId || task.targetId);
    const contactName = normalize(task.contact || task.contactName);
    const company = normalize(task.account || task.contactCompany || task.company || task.companyName);
    const owner = normalize(task.ownerId || task.assignedTo || task.createdBy);
    const contactKey = contactId || [contactName, company, owner].filter(Boolean).join('|');
    if (!contactKey) return;

    const scheduledMs = getScheduledMs(task);
    const createdMs = toMillis(task.createdAt) ?? toMillis(task.timestamp) ?? 0;

    if (!byContact.has(contactKey)) byContact.set(contactKey, []);
    byContact.get(contactKey).push({
      ref: doc.ref,
      docId: doc.id,
      task,
      contactId: contactKey,
      scheduledMs: scheduledMs ?? Number.POSITIVE_INFINITY,
      createdMs
    });
  });

  const duplicates = [];

  for (const [contactId, items] of byContact.entries()) {
    if (items.length <= 1) continue;

    items.sort((a, b) => {
      if (a.scheduledMs !== b.scheduledMs) return a.scheduledMs - b.scheduledMs;
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      return String(a.docId).localeCompare(String(b.docId));
    });

    const keep = items[0];
    const toDelete = items.slice(1).filter(x => x.scheduledMs >= keep.scheduledMs);
    if (toDelete.length === 0) continue;

    duplicates.push({ contactId, keep, toDelete });
  }

  duplicates.sort((a, b) => b.toDelete.length - a.toDelete.length);

  const totalContacts = duplicates.length;
  const totalDeletes = duplicates.reduce((sum, d) => sum + d.toDelete.length, 0);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scannedDocs: snap.size,
    contactsWithDuplicates: totalContacts,
    tasksToDelete: totalDeletes
  }, null, 2));

  const preview = duplicates.slice(0, 40).map(d => ({
    contactId: d.contactId,
    keep: {
      docId: d.keep.docId,
      sequenceId: d.keep.task.sequenceId || '',
      stepIndex: d.keep.task.stepIndex ?? null,
      dueTimestamp: Number.isFinite(d.keep.scheduledMs) ? d.keep.scheduledMs : null,
      dueISO: Number.isFinite(d.keep.scheduledMs) ? fmt(d.keep.scheduledMs) : '',
      type: d.keep.task.type || '',
      title: d.keep.task.title || ''
    },
    delete: d.toDelete.slice(0, 10).map(x => ({
      docId: x.docId,
      sequenceId: x.task.sequenceId || '',
      stepIndex: x.task.stepIndex ?? null,
      dueTimestamp: Number.isFinite(x.scheduledMs) ? x.scheduledMs : null,
      dueISO: Number.isFinite(x.scheduledMs) ? fmt(x.scheduledMs) : '',
      type: x.task.type || '',
      title: x.task.title || ''
    }))
  }));
  console.log(JSON.stringify({ preview }, null, 2));

  if (!apply) return;

  let deletes = [];
  for (const d of duplicates) {
    for (const x of d.toDelete) {
      deletes.push(x);
    }
  }

  if (maxDeletes > 0) deletes = deletes.slice(0, maxDeletes);

  let committed = 0;
  while (deletes.length > 0) {
    const chunk = deletes.splice(0, 450);
    const batch = db.batch();
    chunk.forEach(x => batch.delete(x.ref));
    await batch.commit();
    committed += chunk.length;
    console.log(JSON.stringify({ deleted: committed }, null, 2));
  }
}

await main();
