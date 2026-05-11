#!/usr/bin/env node

/**
 * Supabase MCP Server
 * Provides tools to execute SQL, manage database, and interact with Supabase
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, TextContent, Tool } = require('@modelcontextprotocol/sdk/types.js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const server = new Server({
  name: 'supabase-mcp',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {}
  }
});

// List available tools
server.setRequestHandler(require('@modelcontextprotocol/sdk/types.js').ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_sql',
        description: 'Execute raw SQL against the Supabase database',
        inputSchema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'The SQL query to execute',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'query_table',
        description: 'Query a specific table with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name',
            },
            select: {
              type: 'string',
              description: 'Columns to select (default: *)',
            },
            limit: {
              type: 'number',
              description: 'Limit results',
            },
          },
          required: ['table'],
        },
      },
      {
        name: 'update_record',
        description: 'Update records in a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name',
            },
            data: {
              type: 'object',
              description: 'Data to update',
            },
            filters: {
              type: 'object',
              description: 'WHERE conditions',
            },
          },
          required: ['table', 'data', 'filters'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    if (name === 'execute_sql') {
      const { sql } = args;

      const { data, error } = await supabase.rpc('execute_sql', { sql });

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'query_table') {
      const { table, select = '*', limit = 100 } = args;

      let query = supabase.from(table).select(select).limit(limit);
      const { data, error } = await query;

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'update_record') {
      const { table, data, filters } = args;

      let query = supabase.from(table).update(data);

      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { data: result, error } = await query.select();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Supabase MCP server running on stdio');
}

main().catch(console.error);
