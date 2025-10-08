/**
 * MCP Server Example for Power Choosers CRM
 * This demonstrates how to create an MCP server that exposes CRM functionality
 * to AI agents and assistants.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

class MCPServer {
  constructor() {
    this.app = express();
    this.tools = new Map();
    this.prompts = new Map();
    this.resources = new Map();
    this.setupMiddleware();
    this.registerDefaultTools();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // MCP protocol endpoints
    this.app.post('/mcp/initialize', this.handleInitialize.bind(this));
    this.app.post('/mcp/tools/list', this.handleToolsList.bind(this));
    this.app.post('/mcp/tools/call', this.handleToolsCall.bind(this));
    this.app.post('/mcp/prompts/list', this.handlePromptsList.bind(this));
    this.app.post('/mcp/prompts/get', this.handlePromptsGet.bind(this));
    this.app.post('/mcp/resources/list', this.handleResourcesList.bind(this));
    this.app.post('/mcp/resources/read', this.handleResourcesRead.bind(this));
  }

  // MCP Protocol Handlers
  handleInitialize(req, res) {
    const { protocolVersion, capabilities, clientInfo } = req.body;
    
    res.json({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}
      },
      serverInfo: {
        name: "Power Choosers CRM MCP Server",
        version: "1.0.0"
      }
    });
  }

  handleToolsList(req, res) {
    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    res.json({ tools });
  }

  handleToolsCall(req, res) {
    const { name, arguments: args } = req.body;
    const tool = this.tools.get(name);

    if (!tool) {
      return res.status(404).json({ error: `Tool '${name}' not found` });
    }

    try {
      const result = tool.handler(args);
      res.json({
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handlePromptsList(req, res) {
    const prompts = Array.from(this.prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description
    }));

    res.json({ prompts });
  }

  handlePromptsGet(req, res) {
    const { name, arguments: args } = req.body;
    const prompt = this.prompts.get(name);

    if (!prompt) {
      return res.status(404).json({ error: `Prompt '${name}' not found` });
    }

    try {
      const result = prompt.handler(args);
      res.json({
        description: prompt.description,
        messages: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handleResourcesList(req, res) {
    const resources = Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));

    res.json({ resources });
  }

  handleResourcesRead(req, res) {
    const { uri } = req.body;
    const resource = this.resources.get(uri);

    if (!resource) {
      return res.status(404).json({ error: `Resource '${uri}' not found` });
    }

    try {
      const result = resource.handler();
      res.json({
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: result
          }
        ]
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Tool Registration
  registerTool(name, description, inputSchema, handler) {
    this.tools.set(name, {
      name,
      description,
      inputSchema,
      handler
    });
  }

  // Prompt Registration
  registerPrompt(name, description, handler) {
    this.prompts.set(name, {
      name,
      description,
      handler
    });
  }

  // Resource Registration
  registerResource(uri, name, description, mimeType, handler) {
    this.resources.set(uri, {
      uri,
      name,
      description,
      mimeType,
      handler
    });
  }

  // Default CRM Tools
  registerDefaultTools() {
    // Contact Search Tool
    this.registerTool(
      'search_contacts',
      'Search for contacts in the CRM database',
      {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for contacts' },
          limit: { type: 'number', description: 'Maximum number of results', default: 10 }
        },
        required: ['query']
      },
      async (args) => {
        // This would integrate with your Firebase/Firestore
        return {
          contacts: [
            { id: '1', name: 'John Doe', email: 'john@example.com', phone: '+1234567890' },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com', phone: '+1234567891' }
          ],
          total: 2
        };
      }
    );

    // Call Log Tool
    this.registerTool(
      'log_call',
      'Log a call interaction in the CRM',
      {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
          duration: { type: 'number', description: 'Call duration in seconds' },
          outcome: { type: 'string', description: 'Call outcome' },
          notes: { type: 'string', description: 'Call notes' }
        },
        required: ['contactId', 'duration', 'outcome']
      },
      async (args) => {
        // This would integrate with your Twilio call logging
        const callId = uuidv4();
        return {
          callId,
          timestamp: new Date().toISOString(),
          status: 'logged'
        };
      }
    );

    // Email Sequence Tool
    this.registerTool(
      'trigger_email_sequence',
      'Trigger an email sequence for a contact',
      {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
          sequenceId: { type: 'string', description: 'Email sequence ID' }
        },
        required: ['contactId', 'sequenceId']
      },
      async (args) => {
        // This would integrate with your SendGrid email sequences
        return {
          sequenceTriggered: true,
          nextEmailScheduled: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
      }
    );

    // Analytics Tool
    this.registerTool(
      'get_crm_analytics',
      'Get CRM analytics and insights',
      {
        type: 'object',
        properties: {
          timeframe: { type: 'string', description: 'Timeframe for analytics', default: '30d' },
          metrics: { type: 'array', description: 'Specific metrics to retrieve' }
        }
      },
      async (args) => {
        return {
          totalContacts: 1250,
          activeCalls: 45,
          emailsSent: 320,
          conversionRate: 0.15
        };
      }
    );

    // Default Prompts
    this.registerPrompt(
      'contact_summary',
      'Generate a summary of contact information and recent interactions',
      (args) => {
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a comprehensive summary for contact ID: ${args.contactId}`
            }
          }
        ];
      }
    );

    this.registerPrompt(
      'call_script',
      'Generate a call script based on contact information and context',
      (args) => {
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Create a personalized call script for contact: ${args.contactName} in the ${args.industry} industry`
            }
          }
        ];
      }
    );

    // Default Resources
    this.registerResource(
      'crm://contacts',
      'All Contacts',
      'Complete list of CRM contacts',
      'application/json',
      () => {
        return JSON.stringify({
          contacts: [
            { id: '1', name: 'John Doe', email: 'john@example.com' },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
          ]
        });
      }
    );
  }

  start(port = 3001) {
    this.app.listen(port, () => {
      console.log(`MCP Server running on port ${port}`);
      console.log(`Available endpoints:`);
      console.log(`  POST /mcp/initialize`);
      console.log(`  POST /mcp/tools/list`);
      console.log(`  POST /mcp/tools/call`);
      console.log(`  POST /mcp/prompts/list`);
      console.log(`  POST /mcp/prompts/get`);
      console.log(`  POST /mcp/resources/list`);
      console.log(`  POST /mcp/resources/read`);
    });
  }
}

// Usage Example
if (require.main === module) {
  const mcpServer = new MCPServer();
  mcpServer.start(3001);
}

module.exports = MCPServer;