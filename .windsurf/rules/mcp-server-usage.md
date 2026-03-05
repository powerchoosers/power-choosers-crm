# MCP Server Usage Rules

## Available MCP Servers

This workspace has two MCP servers that should be used appropriately:

### 1. Sequential Thinking MCP Server
**Always use for**: Complex problem-solving, planning, analysis, multi-step tasks
- Breaking down complex problems into manageable steps
- Planning and designing features with room for revision
- Analysis that might need course correction
- Multi-step solutions requiring context maintenance
- Tasks where full scope isn't initially clear

### 2. Supabase MCP Server
**Project ID**: `gfitvnkaevozbcyostez`
**Always use for**: Database operations, data validation, schema inspection
- Database queries and data manipulation
- Table schema inspection
- Understanding current data structure
- Validating assumptions about data
- Performance analysis and debugging

## Automatic Usage Patterns

### For Feature Development:
1. **First**: Use Sequential Thinking to plan the approach
2. **Then**: Use Supabase to understand relevant data structures
3. **Combine**: Refine plan using both insights

### For Data Debugging:
1. **First**: Use Sequential Thinking to analyze the problem
2. **Then**: Use Supabase to test hypotheses with actual data
3. **Iterate**: Continue until root cause is found

### For Database Operations:
1. **First**: Use Sequential Thinking to plan changes
2. **Then**: Use Supabase to inspect current state
3. **Finally**: Use Supabase to apply and verify changes

## Key Database Context

**Core Tables**: accounts (598 rows), users (2 rows), contacts, deals
**Communication**: chat_sessions (373 rows), chat_messages (820 rows)
**Documents**: documents (9 rows), signature_requests (10 rows)
**Energy Data**: meters (5 rows), market_intelligence (318 rows)
**Automation**: sequences, sequence_members, sequence_executions

## Mandatory Usage

- **Never assume data structure** - always use Supabase to verify
- **Always use Sequential Thinking** for complex or unclear tasks
- **Combine both servers** for optimal problem-solving
- **Check actual data** before making schema or code decisions

This rule is always active and should be applied automatically to relevant tasks.
