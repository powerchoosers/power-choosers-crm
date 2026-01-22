import { db } from './api/_firebase.js';

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const hit = args.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const userEmail = (getArgValue('user') || '').trim().toLowerCase();
const isAdmin = hasFlag('admin');
const limitArg = parseInt(getArgValue('limit') || '', 10);
const limit = Number.isFinite(limitArg) ? Math.max(0, limitArg) : (isAdmin ? 1000 : 500);

const toMillis = (value) => {
  if (!value && value !== 0) return null;
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
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  if (s.includes('/')) {
    const parts = s.split('/').map(n => parseInt(n, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) return new Date(parts[2], parts[0] - 1, parts[1]);
  }
  if (s.includes('-')) {
    const parts = s.split('-').map(n => parseInt(n, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const parseTimeToMinutes = (timeStr) => {
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
};

const getDueMs = (task) => {
  const direct = toMillis(task.dueTimestamp) ?? toMillis(task.scheduledTime) ?? toMillis(task.scheduledAt);
  if (direct !== null) return direct;
  const d = parseDate(task.dueDate);
  if (!d) return null;
  const minutes = parseTimeToMinutes(task.dueTime);
  const base = d.getTime();
  if (minutes === null) return base;
  return base + minutes * 60 * 1000;
};

const normalizeStatus = (task) => {
  const raw = String(task.status || 'pending').trim().toLowerCase();
  if (!raw) return 'pending';
  if (raw === 'done') return 'completed';
  return raw;
};

const getOwnerKey = (task) => {
  return String(task.ownerId || task.assignedTo || task.createdBy || '').trim().toLowerCase();
};

const summarizeCounts = (items, getKey) => {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item) || 'unknown';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Object.fromEntries(Array.from(map.entries()).sort((a, b) => b[1] - a[1]));
};

async function fetchTasks() {
  if (!db) {
    console.error('Firestore is not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set.');
    process.exitCode = 1;
    return [];
  }

  if (isAdmin) {
    const snap = await db.collection('tasks').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  if (!userEmail) {
    console.error('Provide --user=email or pass --admin.');
    process.exitCode = 1;
    return [];
  }

  const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
    db.collection('tasks').where('ownerId', '==', userEmail).get(),
    db.collection('tasks').where('assignedTo', '==', userEmail).get(),
    db.collection('tasks').where('createdBy', '==', userEmail).get()
  ]);

  const map = new Map();
  ownedSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  assignedSnap.forEach(doc => { if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() }); });
  createdSnap.forEach(doc => { if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() }); });
  return Array.from(map.values());
}

async function main() {
  const tasks = await fetchTasks();
  const sorted = tasks.slice().sort((a, b) => {
    const aMs = toMillis(a.updatedAt) ?? toMillis(a.timestamp) ?? toMillis(a.createdAt) ?? 0;
    const bMs = toMillis(b.updatedAt) ?? toMillis(b.timestamp) ?? toMillis(b.createdAt) ?? 0;
    return bMs - aMs;
  });
  const limited = limit > 0 ? sorted.slice(0, limit) : sorted;

  const now = Date.now();
  const statusCounts = summarizeCounts(limited, t => normalizeStatus(t));
  const typeCounts = summarizeCounts(limited, t => String(t.type || 'task').trim().toLowerCase());
  const ownerCounts = summarizeCounts(limited, t => getOwnerKey(t));

  const completed = limited.filter(t => normalizeStatus(t) === 'completed');
  const pending = limited.filter(t => normalizeStatus(t) !== 'completed' && normalizeStatus(t) !== 'deleted' && normalizeStatus(t) !== 'cancelled' && normalizeStatus(t) !== 'canceled');

  const completedRecently = completed.filter(t => {
    const ms = toMillis(t.updatedAt) ?? toMillis(t.timestamp) ?? toMillis(t.createdAt) ?? 0;
    return ms > 0 && (now - ms) <= 30 * 24 * 60 * 60 * 1000;
  });

  const futureCompleted = completed.filter(t => {
    const due = getDueMs(t);
    return due !== null && due > now;
  });

  const missingOwner = limited.filter(t => !getOwnerKey(t));

  const preview = limited.slice(0, 50).map(t => ({
    id: t.id,
    title: t.title || '',
    type: t.type || '',
    status: normalizeStatus(t),
    ownerId: t.ownerId || '',
    assignedTo: t.assignedTo || '',
    createdBy: t.createdBy || '',
    dueDate: t.dueDate || '',
    dueTime: t.dueTime || '',
    dueTimestamp: getDueMs(t),
    updatedAt: toMillis(t.updatedAt) ?? null,
    timestamp: toMillis(t.timestamp) ?? null,
    createdAt: toMillis(t.createdAt) ?? null
  }));

  const output = {
    mode: isAdmin ? 'admin' : 'user',
    userEmail: userEmail || null,
    limit,
    totalFetched: tasks.length,
    totalReported: limited.length,
    statusCounts,
    typeCounts,
    ownerCounts: isAdmin ? ownerCounts : undefined,
    pendingCount: pending.length,
    completedCount: completed.length,
    completedRecentlyCount: completedRecently.length,
    futureCompletedCount: futureCompleted.length,
    missingOwnerCount: missingOwner.length,
    preview
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
