/**
 * Check Supabase data for infrastructure map: account statuses and contact counts.
 * Run from repo root: node scripts/check-supabase-map.cjs
 * Requires SUPABASE_DB_URL in .env (or crm-platform/.env).
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const roots = [process.cwd(), path.join(process.cwd(), 'crm-platform')];
  for (const root of roots) {
    const p = path.join(root, '.env');
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
      return root;
    }
  }
  return null;
}

loadEnv();
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set. Add it to .env or crm-platform/.env');
  process.exit(1);
}

const { Client } = require('pg');
const client = new Client({ connectionString: dbUrl });

async function main() {
  await client.connect();
  const statusList = ['ACTIVE_LOAD', 'CUSTOMER', 'active', 'customer', 'Customer'];

  console.log('--- Accounts by status (load/customer) ---');
  const r1 = await client.query(
    `SELECT status, COUNT(*) AS n FROM accounts WHERE status = ANY($1::text[]) GROUP BY status ORDER BY status`,
    [statusList]
  );
  console.log(r1.rows.length ? r1.rows : 'No rows');

  console.log('\n--- All distinct account statuses in DB ---');
  const r2 = await client.query('SELECT DISTINCT status FROM accounts ORDER BY status');
  console.log(r2.rows.map((x) => x.status).join(', '));

  console.log('\n--- Contacts linked to load/customer accounts ---');
  const r3 = await client.query(
    `SELECT COUNT(*) AS total FROM contacts c JOIN accounts a ON c."accountId" = a.id WHERE a.status = ANY($1::text[])`,
    [statusList]
  );
  console.log('Count:', r3.rows[0].total);

  console.log('\n--- Sample: accounts with status CUSTOMER or customer ---');
  const r4 = await client.query(
    `SELECT id, name, status, city, state FROM accounts WHERE status IN ('CUSTOMER', 'customer', 'Customer') LIMIT 5`
  );
  console.log(r4.rows.length ? r4.rows : 'None');

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
