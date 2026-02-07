/**
 * One-off: check Supabase for infrastructure map (accounts/contacts).
 * Run from repo root: node mcp-server/check-map-data.cjs
 * Uses mcp-server's pg; loads .env from repo root. Same logic as MCP supabase_execute_sql.
 */
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
require('dotenv').config({ path: path.join(root, 'crm-platform', '.env') });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set in .env or crm-platform/.env');
  process.exit(1);
}

const { Client } = require('pg');
const client = new Client({ connectionString: dbUrl });

const STATUS_LIST = ['ACTIVE_LOAD', 'CUSTOMER', 'active', 'customer', 'Customer'];

async function main() {
  await client.connect();

  console.log('--- Accounts by status (load/customer) ---');
  const r1 = await client.query(
    `SELECT status, COUNT(*) AS n FROM accounts WHERE status = ANY($1::text[]) GROUP BY status ORDER BY status`,
    [STATUS_LIST]
  );
  console.log(r1.rows.length ? r1.rows : 'No rows');

  console.log('\n--- All distinct account statuses in DB ---');
  const r2 = await client.query('SELECT DISTINCT status FROM accounts ORDER BY status');
  console.log(r2.rows.map((x) => x.status).join(', '));

  console.log('\n--- Contacts linked to load/customer accounts ---');
  const r3 = await client.query(
    `SELECT COUNT(*) AS total FROM contacts c JOIN accounts a ON c."accountId" = a.id WHERE a.status = ANY($1::text[])`,
    [STATUS_LIST]
  );
  console.log('Count:', r3.rows[0].total);

  console.log('\n--- Sample: CUSTOMER/customer accounts ---');
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
