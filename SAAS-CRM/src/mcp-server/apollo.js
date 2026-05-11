#!/usr/bin/env node

/**
 * Apollo MCP Server
 * Exposes Apollo company and people search as MCP tools without leaking API keys to the browser.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';
const apiKey = process.env.APOLLO_API_KEY;

if (!apiKey) {
  console.error('Missing APOLLO_API_KEY');
  process.exit(1);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apollo API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }
  return response.json();
}

const server = new Server({ name: 'apollo-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(require('@modelcontextprotocol/sdk/types.js').ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_people',
      description: 'Search Apollo people by keywords, title, company, or location.',
      inputSchema: {
        type: 'object',
        properties: {
          q_keywords: { type: 'string' },
          q_organization_name: { type: 'string' },
          person_locations: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'search_organizations',
      description: 'Search Apollo organizations by company name or domain.',
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          domain: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'enrich_organization',
      description: 'Enrich an Apollo organization by domain.',
      inputSchema: {
        type: 'object',
        properties: { domain: { type: 'string' } },
        required: ['domain']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    if (name === 'search_people') {
      const body = {
        per_page: Math.min(Number(args?.limit) || 10, 100),
        q_keywords: args?.q_keywords,
        q_organization_name: args?.q_organization_name,
        person_locations: Array.isArray(args?.person_locations) ? args.person_locations : undefined
      };
      const data = await fetchJson(`${APOLLO_BASE_URL}/mixed_people/api_search`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return { content: [{ type: 'text', text: JSON.stringify(data.people || [], null, 2) }] };
    }

    if (name === 'search_organizations') {
      const payload = {
        page: 1,
        per_page: Math.min(Number(args?.limit) || 10, 100),
        q_organization_name: args?.company,
        q_organization_domains: args?.domain
      };
      const data = await fetchJson(`${APOLLO_BASE_URL}/organizations/search`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { content: [{ type: 'text', text: JSON.stringify(data.organizations || [], null, 2) }] };
    }

    if (name === 'enrich_organization') {
      const data = await fetchJson(`${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(String(args?.domain || '').trim())}`, {
        method: 'GET'
      });
      return { content: [{ type: 'text', text: JSON.stringify(data.organization || null, null, 2) }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Apollo MCP server running on stdio');
}

main().catch(console.error);
