# Power Choosers CRM MCP Server

Model Context Protocol server for Power Choosers CRM debugging and Supabase migration management.

## Features

### 1. Frontend Debugging
- **get_frontend_logs**: Retrieve the latest logs from the frontend JavaScript
- **clear_logs**: Clear the debug log file

### 2. Supabase Migration Management
- **supabase_migration_list**: List all migrations and their status (applied vs pending)
- **supabase_db_push**: Apply pending migrations to the remote Supabase database

## Setup

### 1. Install Dependencies
```bash
cd mcp-server
npm install
```

### 2. Configure Cursor
The MCP server is configured in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "crm-debugger": {
      "command": "node",
      "args": ["mcp-server/index.js"],
      "cwd": "${workspaceFolder}",
      "env": {},
      "disabled": false
    }
  }
}
```

### 3. Link Supabase Project
Before using migration tools, link your Supabase project:

```bash
npx supabase link --project-ref gfitvnkaevozbcyostez
```

## Usage in Cursor

Once configured, the MCP tools will be available in Cursor Composer. The AI can:

1. **Check Migration Status**: Use `supabase_migration_list` to see which migrations are pending
2. **Preview Migrations**: Use `supabase_db_push` with `dry_run: true` to see what would be applied
3. **Apply Migrations**: Use `supabase_db_push` to execute pending migrations

## Tool Reference

### supabase_migration_list
List all migrations with their status.

**Parameters**: None

**Returns**: List of migrations showing:
- Migration filename
- Applied status (✓ or ✗)
- Timestamp if applied

**Example**:
```
20240124103000_full_schema.sql ✓ (applied)
20250203_add_list_members_unique_constraint.sql ✗ (pending)
```

### supabase_db_push
Apply pending migrations to the remote database.

**Parameters**:
- `dry_run` (boolean, optional): If true, shows what would be applied without applying

**Returns**: 
- Success: List of applied migrations
- Error: Error message from Supabase CLI

**Example (Dry Run)**:
```
Would apply:
- 20250203_add_list_members_unique_constraint.sql
```

**Example (Actual)**:
```
Applied:
- 20250203_add_list_members_unique_constraint.sql
```

## Security Notes

- The MCP server runs locally and has access to your Supabase CLI configuration
- Migrations are applied to the linked remote database
- Always test migrations locally first: `npx supabase db reset`
- Use `dry_run: true` to preview changes before applying

## Troubleshooting

### "Not linked to a project"
Run: `npx supabase link --project-ref gfitvnkaevozbcyostez`

### "supabase: command not found"
The server uses `npx supabase` which should work if you have npm installed. If not, install the Supabase CLI globally:
```bash
npm install -g supabase
```

### MCP Server Not Showing in Cursor
1. Check that `.cursor/mcp.json` exists and is valid JSON
2. Restart Cursor
3. Check Cursor's MCP settings (Settings > Features > MCP)

## Development

The MCP server code is in `mcp-server/index.js`. To add new tools:

1. Add the tool definition in `ListToolsRequestSchema` handler
2. Add the tool execution logic in `CallToolRequestSchema` handler
3. Restart the MCP server (Cursor will handle this automatically)

## Related Documentation

- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Cursor MCP Documentation](https://docs.cursor.com/context/mcp)
