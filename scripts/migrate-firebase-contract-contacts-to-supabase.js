/**
 * Migrate Firebase contacts that belong to the 76 accounts we migrated
 * (accounts with contract end date). Uses same account ID list logic as
 * migrate-firebase-contract-accounts-to-supabase.js.
 *
 * Run from repo root: node scripts/migrate-firebase-contract-contacts-to-supabase.js
 * Optional: --dry-run to list contacts without writing to Supabase.
 *
 * Requires .env: FIREBASE_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (!projectId || !clientEmail || !rawKey) {
  console.error('Missing Firebase credentials in .env');
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

const db = admin.firestore();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Same contract-end logic as account migration: get contract end from doc or null */
function getContractEnd(data) {
  const raw =
    data.contractEndDate ??
    data.contract_end_date ??
    data.contractEnd ??
    data.contract_end ??
    data.metadata?.contract_end_date ??
    data.metadata?.contractEndDate ??
    data.general?.contractEndDate ??
    data.general?.contract_end_date;
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Get the 76 account IDs (Firebase accounts that have a contract end date) */
async function getContractAccountIds() {
  const snapshot = await db.collection('accounts').get();
  const ids = [];
  for (const doc of snapshot.docs) {
    const contractEnd = getContractEnd(doc.data());
    if (contractEnd) ids.push(doc.id);
  }
  return ids;
}

/** Map Firestore contact doc to Supabase contacts row */
function mapContact(docId, data, accountId) {
  const firstName = data.firstName ?? data.first_name ?? '';
  const lastName = data.lastName ?? data.last_name ?? '';
  const name =
    data.name ??
    (firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null) ??
    data.email ??
    'Unknown';

  return {
    id: docId,
    accountId: accountId || null,
    firstName: firstName || null,
    lastName: lastName || null,
    name: name || 'Unknown',
    email: data.email ?? null,
    phone: data.phone ?? data.mobile ?? data.workDirectPhone ?? data.workPhone ?? null,
    mobile: data.mobile ?? null,
    workPhone: data.workDirectPhone ?? data.workPhone ?? data.workDirectPhone ?? null,
    title: data.title ?? null,
    linkedinUrl: data.linkedin ?? data.linkedinUrl ?? data.linkedin_url ?? null,
    status: data.status ?? 'active',
    ownerId: data.ownerId ?? data.owner_id ?? null,
    lastActivityAt: data.lastActivityAt?.toDate?.()?.toISOString?.() ?? null,
    lastContactedAt: data.lastContactedAt?.toDate?.()?.toISOString?.() ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    metadata: {
      ...(data.metadata || {}),
      migratedFromFirebase: true,
      firebaseAccountId: accountId || null,
    },
  };
}

/** Firestore 'in' queries are limited to 10 (or 30); use 10 to be safe */
const IN_LIMIT = 10;

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN – no Supabase writes.\n');

  console.log('Getting account IDs (accounts with contract end date)...');
  const accountIds = await getContractAccountIds();
  console.log(`Found ${accountIds.length} account IDs.\n`);

  if (accountIds.length === 0) {
    console.log('No contract accounts; nothing to migrate.');
    return;
  }

  const accountIdSet = new Set(accountIds);
  const allContacts = [];

  for (let i = 0; i < accountIds.length; i += IN_LIMIT) {
    const chunk = accountIds.slice(i, i + IN_LIMIT);
    const snapshot = await db.collection('contacts').where('accountId', 'in', chunk).get();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const accountId = data.accountId || null;
      if (accountIdSet.has(accountId)) {
        allContacts.push({ id: doc.id, data, accountId });
      }
    });
  }

  console.log(`Found ${allContacts.length} contacts belonging to those accounts.`);
  if (allContacts.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const rows = allContacts.map(({ id, data, accountId }) => mapContact(id, data, accountId));

  if (dryRun) {
    console.log('\nWould migrate (id, name, email, accountId):');
    rows.slice(0, 30).forEach((r) =>
      console.log(`  ${r.id}  ${r.name}  ${r.email || '—'}  ${r.accountId || '—'}`)
    );
    if (rows.length > 30) console.log(`  ... and ${rows.length - 30} more.`);
    console.log(`\nTotal: ${rows.length} contacts. Run without --dry-run to upsert to Supabase.`);
    return;
  }

  const BATCH = 25;
  let ok = 0;
  let err = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('contacts').upsert(batch, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });
    if (error) {
      console.error('Batch upsert error:', error.message);
      err += batch.length;
    } else {
      ok += batch.length;
      console.log(`Upserted ${ok}/${rows.length}...`);
    }
  }

  console.log('Done.');
  console.log(`Migrated: ${ok} contacts. Errors: ${err}.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
