---
description: Guide for using Sequential Thinking and Supabase MCP servers in Windsurf
---

# MCP Server Usage Guide

This workflow explains how to use the two available MCP servers in Windsurf for optimal development workflow.

## Available MCP Servers

### 1. Sequential Thinking MCP Server
- **Purpose**: Dynamic and reflective problem-solving through structured thinking steps
- **Use Cases**: 
  - Breaking down complex problems into manageable steps
  - Planning and designing features with room for revision
  - Analysis that might need course correction
  - Multi-step solutions requiring context maintenance
  - Tasks where full scope isn't initially clear

### 2. Supabase MCP Server
- **Purpose**: Direct database operations for the Nodal Point CRM
- **Project ID**: `gfitvnkaevozbcyostez`
- **Database**: PostgreSQL 17.6.1.063
- **Use Cases**:
  - Database queries and data manipulation
  - Table schema inspection
  - Database migrations
  - Performance analysis
  - Data debugging and validation

## When to Use Each Server

### Use Sequential Thinking When:
- Planning complex feature implementations
- Debugging multi-layered issues
- Designing system architecture
- Analyzing requirements that might evolve
- Breaking down user stories into technical tasks
- Problem-solving where you need to revise previous assumptions

### Use Supabase When:
- Need to inspect actual data in the database
- Running queries to debug data-related issues
- Checking table schemas and relationships
- Creating or modifying database structures
- Validating data integrity
- Performance tuning database operations

## Common Workflow Patterns

### Pattern 1: Feature Development
1. **Sequential Thinking**: Plan the feature architecture and implementation steps
2. **Supabase**: Inspect relevant tables and understand data structure
3. **Sequential Thinking**: Refine implementation plan based on data insights
4. **Code Implementation**: Build the feature
5. **Supabase**: Verify data changes and test database interactions

### Pattern 2: Data Debugging
1. **Sequential Thinking**: Analyze the problem and formulate hypotheses
2. **Supabase**: Query relevant data to test hypotheses
3. **Sequential Thinking**: Refine analysis based on query results
4. **Repeat**: Continue iterative analysis until root cause is found

### Pattern 3: Database Schema Changes
1. **Sequential Thinking**: Plan schema modifications and impact analysis
2. **Supabase**: Inspect current schema and relationships
3. **Sequential Thinking**: Design migration strategy
4. **Supabase**: Apply migrations and verify results

## Key Database Tables Reference

### Core Tables
- `accounts` - CRM accounts (598 rows)
- `users` - User management (2 rows)  
- `contacts` - Contact information
- `deals` - Sales deals and opportunities

### Communication Tables
- `chat_sessions` - Chat sessions (373 rows)
- `chat_messages` - Chat messages (820 rows)

### Document Tables
- `documents` - Business documents (9 rows)
- `signature_requests` - Electronic signatures (10 rows)
- `signature_telemetry` - Signature tracking (58 rows)

### Energy/Market Tables
- `meters` - Energy meter data (5 rows)
- `market_intelligence` - Market data (318 rows)
- `market_telemetry` - Market telemetry (12 rows)

### Automation Tables
- `sequences` - Automation sequences
- `sequence_members` - Sequence participants
- `sequence_executions` - Execution tracking (2 rows)

## Best Practices

1. **Always use Sequential Thinking first** for complex problems to break them down
2. **Use Supabase for data validation** - never assume data structure without checking
3. **Combine both servers** - use Sequential Thinking to plan, Supabase to validate
4. **Document findings** - use Sequential Thinking to organize insights from database queries
5. **Test hypotheses** - use Supabase queries to validate assumptions from Sequential Thinking

## Example Commands

### Sequential Thinking Usage
```
Use Sequential Thinking to break down this complex feature into manageable steps
```

### Supabase Usage
```
Check the accounts table structure to understand the customer data model
Query recent chat sessions to analyze user engagement patterns
```

## Troubleshooting

- If MCP servers aren't available, restart Windsurf
- Sequential Thinking server supports thinking processes, not resources
- Supabase server requires correct project ID: `gfitvnkaevozbcyostez`
- Both servers should show as "Enabled" in Windsurf MCP settings
