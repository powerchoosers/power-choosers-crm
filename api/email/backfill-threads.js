// Backfill threadId and threads collection for existing emails
// Safe to run multiple times; dedupes and upserts threads

import { admin, db } from '../_firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!db) return res.status(500).json({ error: 'Firestore not initialized' });

    const batchSize = Math.min(Number(req.query.limit || 500), 1000);
    const startAfterId = req.query.startAfter || null;

    let q = db.collection('emails').orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
    if (startAfterId) q = q.startAfter(startAfterId);

    const snap = await q.get();
    if (snap.empty) return res.status(200).json({ success: true, processed: 0, message: 'No emails to backfill' });

    const toUpdate = [];

    const normalizeSubject = (s = '') => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').trim().toLowerCase();
    const extractEmails = (t = '') => (String(t||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e=>e.toLowerCase());
    const uniq = (arr) => Array.from(new Set(arr));
    const stripHtml = (html='') => String(html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      let { threadId, messageId, inReplyTo, references, subject, from, to, cc, text, html } = data;
      if (threadId && messageId && references !== undefined && inReplyTo !== undefined) continue; // already processed

      // Compute threadId similar to inbound logic
      const subjectNorm = normalizeSubject(subject);
      const participants = uniq([...(extractEmails(from)), ...(extractEmails(to||'')), ...(extractEmails(cc||''))]).sort();
      let computedThreadId = '';
      if (Array.isArray(references) && references.length) computedThreadId = references[0];
      else if (inReplyTo) computedThreadId = inReplyTo;
      else if (messageId) computedThreadId = messageId;
      else computedThreadId = 'thr_' + crypto.createHash('sha1').update(subjectNorm + '|' + participants.join(','), 'utf8').digest('hex');

      const snippetSource = text || stripHtml(html || '');
      const snippet = snippetSource ? (snippetSource.length > 140 ? snippetSource.slice(0,140)+'…' : snippetSource) : '';

      toUpdate.push({ id: doc.id, data, computedThreadId, subjectNorm, participants, snippet });
    }

    const batch = db.batch();
    for (const item of toUpdate) {
      const emailRef = db.collection('emails').doc(item.id);
      batch.set(emailRef, { threadId: item.computedThreadId }, { merge: true });

      const tRef = db.collection('threads').doc(item.computedThreadId);
      batch.set(tRef, {
        id: item.computedThreadId,
        subjectNormalized: item.subjectNorm,
        participants: admin.firestore.FieldValue.arrayUnion(...item.participants),
        lastSnippet: item.snippet,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();

    return res.status(200).json({ success: true, processed: toUpdate.length, lastId: snap.docs[snap.docs.length-1].id });
  } catch (err) {
    console.error('[BackfillThreads] Error:', err);
    return res.status(500).json({ error: 'Backfill failed', message: err.message });
  }
}


