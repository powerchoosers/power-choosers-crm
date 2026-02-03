# MCP Server: CRM Debugger + Supabase

This project's MCP server (`mcp-server/index.js`) is configured in `.cursor/mcp.json` and provides:

- **get_frontend_logs** – Read latest frontend debug logs
- **clear_logs** – Clear the debug log file
- **supabase_migration_list** – List applied and pending Supabase migrations
- **supabase_db_push** – Apply pending migrations to the linked remote database (optional `dry_run: true` to preview)

## Enabling the MCP in Cursor

1. **Confirm config**  
   Cursor can load MCP from:
   - **Project**: `.cursor/mcp.json` in this repo (preferred)
   - **User**: `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`)

2. **If using project config**  
   Ensure `.cursor/mcp.json` exists and points to the server:
   ```json
   {
     "mcpServers": {
       "crm-debugger": {
         "command": "node",
         "args": ["mcp-server/index.js"],
         "cwd": "<absolute-path-to-Power Choosers CRM>",
         "disabled": false
       }
     }
   }
   ```
   If `cwd` or paths fail, set `cwd` to the **absolute** path of this repo (e.g. `C:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM`).

3. **Restart Cursor** (or reload window) after changing MCP config so the server and tools are picked up.

## Using Supabase migration tools

- **Prerequisites**
  - Supabase CLI: `npx supabase` (or global `supabase`) from the project root.
  - Project linked: `npx supabase link --project-ref <your-project-ref>`.
  - Authenticated: `npx supabase login` if needed.

- **List migrations**  
  Ask the AI to use **supabase_migration_list** to see which migrations are applied and which are pending.

- **Apply migrations**  
  Ask the AI to use **supabase_db_push** to apply pending migrations. Use **supabase_db_push** with `dry_run: true` first to see what would be applied without changing the database.

## Applying the list_members unique constraint migration

1. Ensure the MCP server is enabled and Cursor has restarted.
2. Ask the AI to run **supabase_migration_list** and confirm `20250203_add_list_members_unique_constraint.sql` is pending.
3. Optionally ask for **supabase_db_push** with `dry_run: true` to preview.
4. Ask the AI to run **supabase_db_push** (without dry run) to apply the migration.

If there are duplicate rows in `list_members`, the unique constraint will fail. In that case, clean duplicates first (see `.fixes/bulk-import-future-optimization.md`) or remove the constraint from the migration and re-apply after cleanup.
