# MCP Server Usage (Power Choosers CRM)

This project has a **Cursor MCP server** named **crm-debugger** that exposes tools for frontend debugging and Supabase migration management. Use this rule to understand when and how to use it.

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

## Workflow Summary

| Goal | Action |
|------|--------|
| See migration status | Use `supabase_migration_list`. |
| Preview what would be applied | Use `supabase_db_push` with `dry_run: true`. |
| Apply pending migrations | Use `supabase_db_push` (after dry run if desired). |
| Fix "remote not in local" / history sync | Use **terminal**: `supabase migration repair --status reverted <versions...>` (see CLI output or `supabase-cli-migration-workflow.md`). |
| See frontend logs | Use `get_frontend_logs` (optional: pass `limit`). |
| Clear frontend logs | Use `clear_logs`. |

---

## Limitations

- **Supabase CLI in MCP:** The server runs `npx supabase` from the project root. If that fails (e.g. EPERM on Windows), run the same commands in the **integrated terminal** where Supabase CLI is installed (e.g. via Scoop) and PATH is set (see `.vscode/settings.json` for `terminal.integrated.env.windows`).
- **No repair tool:** Migration history repair is done via the terminal (`supabase migration repair`), not via MCP.
- **Log file:** Frontend tools read/write `.cursor/debug.log`; the app must write logs there for `get_frontend_logs` to be useful.

---

## References

- **MCP server code & README:** `mcp-server/index.js`, `mcp-server/README.md`
- **Cursor MCP config:** `.cursor/mcp.json`
- **Supabase CLI workflow (repair, push, naming):** `SUPABASE DOCS/supabase-cli-migration-workflow.md`
