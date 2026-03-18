import { cors } from '../_cors.js';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '../_logger.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const WEBHOOK_SECRET = String(process.env.ZOHO_WEBHOOK_SECRET || '').trim();
const FALLBACK_SYNC_ALL = process.env.ZOHO_WEBHOOK_SYNC_ALL_ON_FALLBACK !== 'false';
const SYNC_TIMEOUT_MS = Number(process.env.ZOHO_WEBHOOK_SYNC_TIMEOUT_MS || 45000);

const EMAIL_KEYS = new Set([
  'email',
  'emailaddress',
  'mailbox',
  'mailboxemail',
  'owneremail',
  'recipient',
  'recipientemail',
  'sender',
  'senderemail',
  'to',
  'from',
  'useremail',
  'accountemail',
  'replyto',
]);

const ACCOUNT_KEYS = new Set([
  'accountid',
  'zohoaccountid',
  'zohoaccount',
]);

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function extractEmailsFromValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(extractEmailsFromValue);
  if (typeof value === 'object') return [];

  const raw = String(value).trim();
  if (!raw) return [];

  const matches = raw.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/gi) || [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase().trim()).filter(isLikelyEmail)));
}

function extractAccountsFromValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(extractAccountsFromValue);
  if (typeof value === 'object') return [];

  const raw = normalizeText(value);
  return raw ? [raw] : [];
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return { raw: body };
    }
  }
  return body;
}

function collectCandidates(node, acc, depth = 0) {
  if (depth > 4 || node == null) return;

  if (Array.isArray(node)) {
    node.forEach((item) => collectCandidates(item, acc, depth + 1));
    return;
  }

  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = normalizeKey(key);

    if (EMAIL_KEYS.has(normalizedKey)) {
      extractEmailsFromValue(value).forEach((email) => acc.emails.add(email));
    }

    if (ACCOUNT_KEYS.has(normalizedKey)) {
      extractAccountsFromValue(value).forEach((accountId) => acc.accountIds.add(accountId));
    }

    if (
      normalizedKey === 'data' ||
      normalizedKey === 'payload' ||
      normalizedKey === 'body' ||
      normalizedKey === 'event' ||
      normalizedKey === 'record' ||
      normalizedKey === 'records'
    ) {
      collectCandidates(value, acc, depth + 1);
    }
  }
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).filter(Boolean)));
}

function readWebhookSecret(req) {
  const headerSecret = [
    req.headers['x-zoho-webhook-secret'],
    req.headers['x-webhook-secret'],
    req.headers['x-zoho-mail-webhook-secret'],
    req.headers.authorization,
  ]
    .find((value) => typeof value === 'string' && value.trim()) || '';

  const querySecret = typeof req.query?.secret === 'string' ? req.query.secret : '';
  const bodySecret = typeof req.body?.secret === 'string' ? req.body.secret : '';

  const candidate = String(headerSecret || querySecret || bodySecret || '').trim();
  if (candidate.toLowerCase().startsWith('bearer ')) {
    return candidate.slice(7).trim();
  }
  return candidate;
}

async function getConnectedZohoEmails() {
  const [connectionsRes, usersRes] = await Promise.all([
    supabaseAdmin
      .from('zoho_connections')
      .select('email, account_id')
      .not('email', 'is', null),
    supabaseAdmin
      .from('users')
      .select('email, zoho_account_id, zoho_refresh_token, zoho_access_token'),
  ]);

  if (connectionsRes.error) {
    logger.warn('[ZohoWebhook] Failed to load zoho_connections:', connectionsRes.error.message || connectionsRes.error);
  }
  if (usersRes.error) {
    logger.warn('[ZohoWebhook] Failed to load users:', usersRes.error.message || usersRes.error);
  }

  const emailToAccount = new Map();
  const accountToEmails = new Map();
  const allEmails = new Set();

  for (const row of connectionsRes.data || []) {
    const email = String(row?.email || '').toLowerCase().trim();
    const accountId = String(row?.account_id || '').trim();
    if (!email) continue;
    allEmails.add(email);
    if (accountId) {
      emailToAccount.set(email, accountId);
      if (!accountToEmails.has(accountId)) accountToEmails.set(accountId, new Set());
      accountToEmails.get(accountId).add(email);
    }
  }

  for (const row of usersRes.data || []) {
    const email = String(row?.email || '').toLowerCase().trim();
    const accountId = String(row?.zoho_account_id || '').trim();
    const hasZohoTokens = Boolean(row?.zoho_refresh_token || row?.zoho_access_token);
    if (!email || !hasZohoTokens) continue;
    allEmails.add(email);
    if (accountId) {
      emailToAccount.set(email, accountId);
      if (!accountToEmails.has(accountId)) accountToEmails.set(accountId, new Set());
      accountToEmails.get(accountId).add(email);
    }
  }

  return {
    allEmails: Array.from(allEmails),
    emailToAccount,
    accountToEmails,
  };
}

async function triggerZohoSync(userEmail) {
  const syncUrl = `${APP_URL}/api/email/zoho-sync`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail }),
      signal: controller.signal,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    return {
      ok: response.ok,
      status: response.status,
      count: Number(payload?.count || 0),
      payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectTargetsFromPayload(payload, allEmails, emailToAccount, accountToEmails) {
  const candidates = {
    emails: new Set(),
    accountIds: new Set(),
  };

  collectCandidates(payload, candidates);

  const directEmails = Array.from(candidates.emails)
    .map((email) => email.toLowerCase().trim())
    .filter((email) => email && allEmails.has(email));

  const accountMatches = Array.from(candidates.accountIds).flatMap((accountId) => {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) return [];
    return Array.from(accountToEmails.get(normalizedAccountId) || []);
  });

  const explicitEmail = unique([
    ...directEmails,
    ...accountMatches,
    ...extractEmailsFromValue(payload?.userEmail),
    ...extractEmailsFromValue(payload?.email),
    ...extractEmailsFromValue(payload?.ownerEmail),
    ...extractEmailsFromValue(payload?.mailboxEmail),
  ]).filter((email) => allEmails.has(email.toLowerCase().trim()));

  return {
    explicitEmail,
    candidateEmails: Array.from(candidates.emails),
    candidateAccountIds: Array.from(candidates.accountIds),
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req.body);
  const providedSecret = readWebhookSecret({ ...req, body });

  if (WEBHOOK_SECRET && providedSecret !== WEBHOOK_SECRET) {
    logger.warn('[ZohoWebhook] Unauthorized webhook attempt blocked');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    logger.error('[ZohoWebhook] Supabase admin client unavailable');
    return res.status(500).json({ error: 'Database client unavailable' });
  }

  try {
    const { allEmails, emailToAccount, accountToEmails } = await getConnectedZohoEmails();
    const allEmailSet = new Set(allEmails.map((email) => String(email || '').toLowerCase().trim()).filter(Boolean));
    const eventType = normalizeText(body?.event || body?.eventType || body?.type || body?.category || body?.action || '');
    const extracted = collectTargetsFromPayload(body, allEmailSet, emailToAccount, accountToEmails);
    const targetEmails = unique(extracted.explicitEmail);
    const hasWebhookSignal = Boolean(
      eventType ||
      targetEmails.length > 0 ||
      extracted.candidateEmails.length > 0 ||
      extracted.candidateAccountIds.length > 0
    );

    if (!hasWebhookSignal) {
      logger.info('[ZohoWebhook] Handshake received, acknowledging without sync');
      return res.status(200).json({
        success: true,
        message: 'Webhook handshake acknowledged',
      });
    }

    let syncTargets = targetEmails;
    let syncMode = 'resolved';

    if (syncTargets.length === 0 && FALLBACK_SYNC_ALL) {
      syncTargets = unique(allEmails);
      syncMode = 'fallback-all';
    }

    if (syncTargets.length === 0) {
      logger.info('[ZohoWebhook] Received webhook but no connected mailbox could be resolved', {
        eventType,
        candidateEmails: extracted.candidateEmails,
        candidateAccountIds: extracted.candidateAccountIds,
      });

      return res.status(202).json({
        success: true,
        message: 'Webhook received but no mailbox could be resolved',
        eventType: eventType || null,
      });
    }

    const results = [];
    for (const userEmail of syncTargets) {
      try {
        const syncResult = await triggerZohoSync(userEmail);
        results.push({
          userEmail,
          ok: syncResult.ok,
          status: syncResult.status,
          count: syncResult.count || 0,
        });
      } catch (syncError) {
        const message = syncError?.name === 'AbortError'
          ? 'Sync request timed out'
          : (syncError?.message || String(syncError));
        results.push({
          userEmail,
          ok: false,
          error: message,
        });
      }
    }

    logger.info('[ZohoWebhook] Sync complete', {
      eventType,
      syncMode,
      targets: syncTargets,
      results,
    });

    return res.status(200).json({
      success: true,
      eventType: eventType || null,
      syncMode,
      targets: syncTargets,
      results,
    });
  } catch (error) {
    logger.error('[ZohoWebhook] Failed to process webhook:', error);
    return res.status(500).json({
      error: 'Failed to process Zoho webhook',
      details: error?.message || String(error),
    });
  }
}
