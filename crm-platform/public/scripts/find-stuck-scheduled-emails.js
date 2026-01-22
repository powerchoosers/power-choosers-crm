(async function () {
  function getDb() {
    return window.firebaseDB || (window.firebase && window.firebase.firestore && window.firebase.firestore());
  }

  function isAdminUser() {
    try {
      if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
        return !!window.DataManager.isCurrentUserAdmin();
      }
    } catch (_) {}
    return window.currentUserRole === 'admin';
  }

  function getCurrentUserEmail() {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return String(window.DataManager.getCurrentUserEmail() || '').toLowerCase();
      }
    } catch (_) {}
    return String(window.currentUserEmail || '').toLowerCase();
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
        } catch (_) {
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

  async function fetchAllDocs(query, { maxDocs, label }) {
    const FieldPath = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldPath;
    const canOrderById = FieldPath && typeof FieldPath.documentId === 'function';
    const pageSize = 500;
    const out = [];

    if (!canOrderById) {
      const snap = await query.limit(Math.min(pageSize, maxDocs)).get();
      snap.forEach(doc => out.push(doc));
      console.warn('[FindStuckScheduledEmails] Paging disabled (FieldPath missing). Returning limited results.', { label, returned: out.length });
      return out;
    }

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

  async function findStuckScheduledEmails(options = {}) {
    const db = getDb();
    if (!db) {
      throw new Error('Firestore not available (window.firebaseDB missing)');
    }

    const now = Date.now();
    const graceMinutes = Number.isFinite(options.graceMinutes) ? options.graceMinutes : 10;
    const olderThanDays = Number.isFinite(options.olderThanDays) ? options.olderThanDays : 30;
    const maxPerStatus = Number.isFinite(options.maxPerStatus) ? options.maxPerStatus : 5000;
    const maxDocs = Number.isFinite(options.maxDocs) ? options.maxDocs : 20000;
    const statuses = Array.isArray(options.statuses) && options.statuses.length
      ? options.statuses
      : ['approved', 'pending_approval', 'not_generated', 'generating', 'sending', 'scheduled'];
    const scanAll = options.scanAll === true;

    const graceMs = graceMinutes * 60 * 1000;
    const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;
    const cutoff = now - Math.max(graceMs, olderThanMs);

    const admin = isAdminUser();
    const userEmail = getCurrentUserEmail();

    const excludedStatuses = new Set(['sent', 'delivered', 'rejected', 'error']);

    const docsByStatus = new Map();

    console.log('[FindStuckScheduledEmails] Starting scan', {
      admin,
      userEmail: admin ? undefined : userEmail,
      scanAll,
      statuses,
      olderThanDays,
      graceMinutes,
      cutoffIso: new Date(cutoff).toISOString()
    });

    if (scanAll) {
      if (!admin) {
        console.warn('[FindStuckScheduledEmails] scanAll is only supported for admin in-browser');
      } else {
        const q = db.collection('emails').where('type', '==', 'scheduled');
        const docs = await fetchAllDocs(q, { maxDocs, label: 'scheduled:all' });
        docsByStatus.set('scheduled:all', docs);
        console.log('[FindStuckScheduledEmails] Fetched scheduled batch', { count: docs.length });
      }
    } else {
      for (const status of statuses) {
        let docs = [];
        if (admin) {
          const q = db.collection('emails').where('type', '==', 'scheduled').where('status', '==', status);
          docs = await fetchAllDocs(q, { maxDocs: maxPerStatus, label: status });
        } else {
          if (!userEmail) {
            console.warn('[FindStuckScheduledEmails] No current user email; skipping non-admin scan');
            continue;
          }
          const [ownedDocs, assignedDocs] = await Promise.all([
            fetchAllDocs(
              db.collection('emails')
                .where('ownerId', '==', userEmail)
                .where('type', '==', 'scheduled')
                .where('status', '==', status),
              { maxDocs: maxPerStatus, label: `${status}:owned` }
            ),
            fetchAllDocs(
              db.collection('emails')
                .where('assignedTo', '==', userEmail)
                .where('type', '==', 'scheduled')
                .where('status', '==', status),
              { maxDocs: maxPerStatus, label: `${status}:assigned` }
            )
          ]);
          const map = new Map();
          ownedDocs.forEach(d => map.set(d.id, d));
          assignedDocs.forEach(d => map.set(d.id, d));
          docs = Array.from(map.values());
        }
        docsByStatus.set(status, docs);
        console.log('[FindStuckScheduledEmails] Fetched status batch', { status, count: docs.length });
      }
    }

    const allDocs = [];
    docsByStatus.forEach(arr => allDocs.push(...arr));
    const unique = new Map();
    allDocs.forEach(doc => {
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
        scheduledSendTimeMs: sendAtMs,
        ownerId: data.ownerId || '',
        assignedTo: data.assignedTo || '',
        contactId: data.contactId || data.contact_id || '',
        subject: String(data.subject || '').slice(0, 80),
        to: maskEmail(pickTo(data)),
        sequenceId: data.sequenceId || '',
        stepIndex: (typeof data.stepIndex === 'number') ? data.stepIndex : null
      });
    }

    stuck.sort((a, b) => a.scheduledSendTimeMs - b.scheduledSendTimeMs);

    const counts = {};
    stuck.forEach(e => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });

    console.log('[FindStuckScheduledEmails] Done', {
      scannedUniqueDocs: unique.size,
      stuckCount: stuck.length,
      stuckByStatus: counts
    });

    const table = stuck.map(e => ({
      id: e.id,
      status: e.status,
      scheduledSendTime: new Date(e.scheduledSendTimeMs).toISOString(),
      ageDays: Math.floor((now - e.scheduledSendTimeMs) / (24 * 60 * 60 * 1000)),
      subject: e.subject,
      to: e.to,
      contactId: e.contactId,
      ownerId: e.ownerId,
      sequenceId: e.sequenceId,
      stepIndex: e.stepIndex
    }));

    try {
      console.table(table);
    } catch (_) {
      console.log(table);
    }

    const ids = stuck.map(e => e.id);
    console.log('[FindStuckScheduledEmails] Stuck email IDs (copy/paste):', ids);

    return { stuck, ids, counts, cutoff };
  }

  window.findStuckScheduledEmails = findStuckScheduledEmails;

  const result = await findStuckScheduledEmails();
  console.log('[FindStuckScheduledEmails] Ready. Re-run with options like:', {
    olderThanDays: 60,
    graceMinutes: 10,
    statuses: ['approved', 'pending_approval'],
    maxPerStatus: 5000,
    scanAll: true,
    maxDocs: 20000
  });
  return result;
})();
