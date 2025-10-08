/**
 * MCP Client Example for Power Choosers CRM
 * This demonstrates how to connect to and use an MCP server
 */

const axios = require('axios');

class MCPClient {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.sessionId = null;
  }

  async initialize() {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/initialize`, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        },
        clientInfo: {
          name: "Power Choosers CRM Client",
          version: "1.0.0"
        }
      });

      this.sessionId = response.data.sessionId;
      console.log('MCP Client initialized:', response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to initialize MCP client:', error.message);
      throw error;
    }
  }

  async listTools() {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/tools/list`);
      console.log('Available tools:', response.data.tools);
      return response.data.tools;
    } catch (error) {
      console.error('Failed to list tools:', error.message);
      throw error;
    }
  }

  async callTool(toolName, args) {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/tools/call`, {
        name: toolName,
        arguments: args
      });
      console.log(`Tool '${toolName}' result:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Failed to call tool '${toolName}':`, error.message);
      throw error;
    }
  }

  async listPrompts() {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/prompts/list`);
      console.log('Available prompts:', response.data.prompts);
      return response.data.prompts;
    } catch (error) {
      console.error('Failed to list prompts:', error.message);
      throw error;
    }
  }

  async getPrompt(promptName, args) {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/prompts/get`, {
        name: promptName,
        arguments: args
      });
      console.log(`Prompt '${promptName}' result:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Failed to get prompt '${promptName}':`, error.message);
      throw error;
    }
  }

  async listResources() {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/resources/list`);
      console.log('Available resources:', response.data.resources);
      return response.data.resources;
    } catch (error) {
      console.error('Failed to list resources:', error.message);
      throw error;
    }
  }

  async readResource(uri) {
    try {
      const response = await axios.post(`${this.serverUrl}/mcp/resources/read`, {
        uri: uri
      });
      console.log(`Resource '${uri}' content:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Failed to read resource '${uri}':`, error.message);
      throw error;
    }
  }

  // CRM-specific helper methods
  async searchContacts(query, limit = 10) {
    return await this.callTool('search_contacts', { query, limit });
  }

  async logCall(contactId, duration, outcome, notes = '') {
    return await this.callTool('log_call', { contactId, duration, outcome, notes });
  }

  async triggerEmailSequence(contactId, sequenceId) {
    return await this.callTool('trigger_email_sequence', { contactId, sequenceId });
  }

  async getAnalytics(timeframe = '30d', metrics = []) {
    return await this.callTool('get_crm_analytics', { timeframe, metrics });
  }

  async generateContactSummary(contactId) {
    return await this.getPrompt('contact_summary', { contactId });
  }

  async generateCallScript(contactName, industry) {
    return await this.getPrompt('call_script', { contactName, industry });
  }
}

// Usage Example
async function demonstrateMCPClient() {
  const client = new MCPClient();
  
  try {
    // Initialize the client
    await client.initialize();
    
    // List available tools
    await client.listTools();
    
    // Search for contacts
    const contacts = await client.searchContacts('John', 5);
    console.log('Found contacts:', contacts);
    
    // Log a call
    const callResult = await client.logCall('contact-123', 300, 'interested', 'Customer showed interest in premium plan');
    console.log('Call logged:', callResult);
    
    // Get analytics
    const analytics = await client.getAnalytics('7d');
    console.log('Analytics:', analytics);
    
    // Generate a call script
    const script = await client.generateCallScript('John Doe', 'Energy');
    console.log('Call script:', script);
    
  } catch (error) {
    console.error('MCP Client demonstration failed:', error.message);
  }
}

// Run demonstration if this file is executed directly
if (require.main === module) {
  demonstrateMCPClient();
}

module.exports = MCPClient;