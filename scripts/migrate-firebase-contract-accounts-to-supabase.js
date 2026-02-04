/**
 * Migrate Firebase (Firestore) account records that have a contract end date
 * into Supabase accounts. Only records with contractEndDate / contract_end_date
 * (or metadata.contract_end_date) are migrated.
 *
 * Run from repo root: node scripts/migrate-firebase-contract-accounts-to-supabase.js
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

// Firebase
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

// Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Normalize contract end to YYYY-MM-DD for Supabase date column */
function toContractEndDate(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  // MM/DD/YYYY or M/D/YYYY
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try parsing as date
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Extract contract end from Firebase account doc (any common field name) */
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
  return toContractEndDate(raw);
}

/** Map Firestore account doc to Supabase accounts row */
function mapAccount(docId, data) {
  const contractEnd = getContractEnd(data);
  const name =
    data.accountName ?? data.name ?? data.companyName ?? data.account_name ?? 'Imported Account';

  return {
    id: docId,
    name: name || 'Imported Account',
    domain: data.domain ?? data.website ?? data.websiteUrl ?? null,
    industry: data.industry ?? null,
    status: data.status ?? 'active',
    employees: (() => {
      const n = data.employees ?? data.employeeCount ?? data.numEmployees;
      if (n == null || n === '') return null;
      const s = String(n).trim();
      const firstNum = s.match(/\d+/);
      const parsed = firstNum ? parseInt(firstNum[0], 10) : parseInt(s, 10);
      return Number.isNaN(parsed) ? null : parsed;
    })(),
    revenue: data.revenue != null ? String(data.revenue) : null,
    description: data.description ?? data.shortDescription ?? data.short_desc ?? null,
    logo_url: data.logoUrl ?? data.logo_url ?? null,
    phone: data.phone ?? data.companyPhone ?? data.company_phone ?? null,
    linkedin_url: data.linkedin ?? data.linkedinUrl ?? data.linkedin_url ?? null,
    address: data.address ?? null,
    city: data.city ?? data.locationCity ?? null,
    state: data.state ?? data.locationState ?? data.location_state ?? null,
    zip: data.zip ?? data.postalCode ?? null,
    country: data.country ?? null,
    electricity_supplier: data.electricitySupplier ?? data.electricity_supplier ?? null,
    annual_usage: data.annualUsage ?? data.annual_usage ?? null,
    current_rate: data.currentRate ?? data.current_rate ?? null,
    contract_end_date: contractEnd,
    service_addresses: Array.isArray(data.serviceAddresses)
      ? data.serviceAddresses
      : Array.isArray(data.service_addresses)
        ? data.service_addresses
        : [],
    ownerId: data.ownerId ?? data.owner_id ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    metadata: {
      ...(data.metadata || {}),
      migratedFromFirebase: true,
      firebaseContractEnd: contractEnd,
    },
  };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN – no Supabase writes.\n');

  console.log('Fetching all accounts from Firestore (accounts)...');
  const snapshot = await db.collection('accounts').get();
  const withContract = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const contractEnd = getContractEnd(data);
    if (contractEnd) {
      withContract.push({ id: doc.id, data });
    }
  }

  console.log(
    `Found ${snapshot.size} total accounts; ${withContract.length} have a contract end date.`
  );
  if (withContract.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const rows = withContract.map(({ id, data }) => mapAccount(id, data));

  if (dryRun) {
    console.log('\nWould migrate these accounts (id, name, contract_end_date):');
    rows.slice(0, 50).forEach((r) => console.log(`  ${r.id}  ${r.name}  ${r.contract_end_date}`));
    if (rows.length > 50) console.log(`  ... and ${rows.length - 50} more.`);
    console.log(`\nTotal: ${rows.length} accounts. Run without --dry-run to upsert to Supabase.`);
    return;
  }

  const BATCH = 25;
  let ok = 0;
  let err = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('accounts').upsert(batch, {
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
  console.log(`Migrated: ${ok} accounts with contract end date. Errors: ${err}.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
