# MCP Server Usage (Power Choosers CRM)

This project has a **Cursor MCP server** named **crm-debugger** that exposes tools for frontend debugging and Supabase migration management. Use this rule to understand when and how to use it.

**When Supabase queries fail** (e.g. "more than one relationship found", "could not find relationship"), **check the MCP debugger first**: use `supabase_execute_sql` to inspect the real schema (foreign key names, column names) and fix queries using the exact constraint names from the database—do not guess.

---

## Configuration

- **Server name:** `crm-debugger`
- **Config file:** `.cursor/mcp.json` (command: `node`, args: `mcp-server/index.js`, cwd: workspace root)
- **Code:** `mcp-server/index.js`

The AI can invoke MCP tools when they are relevant (e.g. "check migrations", "apply migration", "show frontend logs"). The agent should prefer these tools over running equivalent terminal commands when the tool exists and fits the task.

---

## Available Tools

### 1. `get_frontend_logs`

**When to use:** User or agent needs to see recent frontend/browser logs (e.g. debugging a UI bug, checking console output).

**Parameters:**
- `limit` (optional, number): Number of lines to return from the end of the log. Default: 20.

**Behavior:** Reads `.cursor/debug.log` and returns the latest N lines. If the file does not exist, returns a short message saying so.

**Example ask:** "What do the latest frontend logs say?" / "Show me the last 50 lines of the debug log."

---

### 2. `clear_logs`

**When to use:** User or agent wants to clear the debug log file (e.g. before reproducing an issue for a clean log).

**Parameters:** None.

**Behavior:** Overwrites `.cursor/debug.log` with an empty file.

**Example ask:** "Clear the debug logs." / "Reset the log file."

---

### 3. `supabase_migration_list`

**When to use:** Need to see which Supabase migrations are applied on the remote vs only present locally (e.g. before/after push, troubleshooting "remote not found" or sync issues).

**Parameters:** None.

**Behavior:** Runs `npx supabase migration list` from the project root and returns the table (Local | Remote | Time). Requires the project to be **linked** (`supabase link --project-ref gfitvnkaevozbcyostez`).

**Example ask:** "List Supabase migrations." / "Which migrations are pending?" / "Check migration status."

---

### 4. `supabase_db_push`

**When to use:** Need to **apply** pending Supabase migrations to the linked remote database, or **preview** what would be applied.

**Parameters:**
- `dry_run` (optional, boolean): If `true`, only prints what would be applied; does not apply. Default: `false`.

**Behavior:** Runs `npx supabase db push` (or `supabase db push --dry-run` when `dry_run: true`) from the project root. Requires project to be linked and CLI authenticated.

**Important:**
- **Always prefer `dry_run: true` first** when the user asks to "push" or "apply" migrations, so they (and the agent) can see the list of migrations that would run.
- If the tool returns "Remote migration versions not found in local migrations directory", the **migration history is out of sync**. Resolving this requires **repair** (and possibly manual SQL or pull) as documented in `SUPABASE DOCS/supabase-cli-migration-workflow.md`. The MCP server does **not** expose a repair tool; run `supabase migration repair` from the **integrated terminal** (where `supabase` is on PATH, e.g. after adding Scoop shims in `.vscode/settings.json`).

**Example ask:** "Apply pending migrations." / "Push migrations to Supabase." / "What would happen if we pushed? (dry run)."

---

### 5. `supabase_execute_sql`

**When to use:** Need to **inspect or change** the linked Supabase database directly (e.g. check schema, foreign keys, create tables, fix data). Use this **before guessing** when Supabase errors mention relationships, schema, or "could not find relationship."

**Parameters:**
- `sql` (optional, string): Raw SQL to execute (e.g. `SELECT ... FROM information_schema ...`).
- `file` (optional, string): Path to a `.sql` file relative to project root (alternative to `sql`).

**Behavior:** Runs the SQL against the linked remote database. Requires **SUPABASE_DB_URL** in project root `.env` (Dashboard → Database → Connection string URI). Returns result rows or execution status.

**Example asks:** "What foreign keys exist on `list_members`?" / "List all tables in public schema." / "Check the actual constraint names for lists and list_members."

---

## When Supabase Things Aren't Working — Use the MCP Debugger First

If you see errors like:

- **"Could not embed because more than one relationship was found for 'X' and 'Y'"**
- **"Could not find a relationship between 'X' and 'Y' in the schema cache"**
- **Queries failing with vague schema/relationship errors**

**Do this:**

1. **Inspect the real schema** with `supabase_execute_sql` so you're not guessing constraint names or column casing.
2. **Fix the query** using the **exact** foreign key constraint name and casing from the database (e.g. `list_members_listid_fkey` not `list_members_listId_fkey`).

### Inspecting schema via MCP

Use `supabase_execute_sql` with `sql` to run read-only queries against the linked DB. Examples:

**List foreign keys on a table:**
```sql
SELECT tc.constraint_name, tc.table_name, kcu.column_name,
       ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'list_members';
```

**List tables in public schema:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

**Describe columns of a table:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accounts'
ORDER BY ordinal_position;
```

### Fixing relationship / embed errors

1. Run the foreign-key query above for the table that is failing (e.g. `list_members`).
2. Note the **exact** `constraint_name` (Postgres often lowercases it, e.g. `list_members_listid_fkey`).
3. In your Supabase client query, **specify the relationship** using that name:
   - From parent table: `list_members!list_members_listid_fkey(count)`
   - From child table: `lists!list_members_listid_fkey(name)`
4. Use the **exact** casing returned by the schema query; do not assume camelCase.

### Creating tables and other schema changes

- **Preferred:** Add a new migration file under `supabase/migrations/` with your `CREATE TABLE` or `ALTER TABLE` SQL, then use `supabase_db_push` (dry run first) to apply it. This keeps schema in version control.
- **Direct SQL:** For one-off fixes or exploratory changes, use `supabase_execute_sql` with a `sql` string or a `file` path to a `.sql` script. Avoid using direct SQL for schema that should be tracked in migrations long-term.

### Other issues

- **RLS / permissions:** If inserts or selects fail with permission errors, check RLS policies in the Dashboard or via `information_schema` and adjust policies in a migration.
- **Migration history out of sync:** Use `supabase_migration_list` to see local vs remote state; use the **terminal** for `supabase migration repair` (see Limitations and References).

---

## Workflow Summary

| Goal | Action |
|------|--------|
| See migration status | Use `supabase_migration_list`. |
| Preview what would be applied | Use `supabase_db_push` with `dry_run: true`. |
| Apply pending migrations | Use `supabase_db_push` (after dry run if desired). |
| Fix "remote not in local" / history sync | Use **terminal**: `supabase migration repair --status reverted <versions...>` (see CLI output or `supabase-cli-migration-workflow.md`). |
| **Schema / relationship errors** | Use **MCP first**: `supabase_execute_sql` to inspect FK names and schema; fix queries with exact constraint names. |
| Inspect tables, FKs, or run SQL | Use `supabase_execute_sql` with `sql` or `file`. |
| Create tables / schema changes | Prefer migrations + `supabase_db_push`; one-off fixes via `supabase_execute_sql` if needed. |
| See frontend logs | Use `get_frontend_logs` (optional: pass `limit`). |
| Clear frontend logs | Use `clear_logs`. |

---

## Limitations

- **Supabase CLI in MCP:** The server runs `npx supabase` from the project root. If that fails (e.g. EPERM on Windows), run the same commands in the **integrated terminal** where Supabase CLI is installed (e.g. via Scoop) and PATH is set (see `.vscode/settings.json` for `terminal.integrated.env.windows`).
- **No repair tool:** Migration history repair is done via the terminal (`supabase migration repair`), not via MCP.
- **Log file:** Frontend tools read/write `.cursor/debug.log`; the app must write logs there for `get_frontend_logs` to be useful.
- **supabase_execute_sql:** Requires `SUPABASE_DB_URL` in project root `.env`. Use read-only queries for inspection; use migrations for tracked schema changes when possible.

---

## References

- **MCP server code & README:** `mcp-server/index.js`, `mcp-server/README.md`
- **Cursor MCP config:** `.cursor/mcp.json`
- **Supabase CLI workflow (repair, push, naming):** `SUPABASE DOCS/supabase-cli-migration-workflow.md`
