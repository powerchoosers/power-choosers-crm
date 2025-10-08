# MCP Server Integration Guide for Power Choosers CRM

## Overview

This guide explains how to integrate Model Context Protocol (MCP) servers with your Power Choosers CRM system. MCP enables AI agents to securely interact with your CRM data and functionality.

## What is MCP?

Model Context Protocol (MCP) is a standardized framework that allows AI agents to:
- Access external tools and services
- Interact with data sources securely
- Use standardized APIs for tool discovery and execution
- Manage prompts and resources

## Integration Options

### 1. Custom MCP Server (Recommended for your CRM)

**Benefits:**
- Full control over exposed functionality
- Optimized for your specific CRM needs
- Secure integration with existing systems

**Implementation:**
```bash
# Start the MCP server
node mcp-server-example.js

# In another terminal, test the client
node mcp-client-example.js
```

### 2. Third-Party MCP Servers

**Available Options:**
- **HubSpot MCP Server**: For CRM data integration
- **GitHub MCP Server**: For code repository access
- **Splunk MCP Server**: For analytics and monitoring

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install cors express uuid axios
```

### Step 2: Start the MCP Server

```bash
# Run the MCP server
node mcp-server-example.js
```

The server will start on port 3001 and expose the following endpoints:
- `POST /mcp/initialize` - Initialize MCP connection
- `POST /mcp/tools/list` - List available tools
- `POST /mcp/tools/call` - Execute a tool
- `POST /mcp/prompts/list` - List available prompts
- `POST /mcp/prompts/get` - Get a prompt
- `POST /mcp/resources/list` - List available resources
- `POST /mcp/resources/read` - Read a resource

### Step 3: Connect AI Agents

#### For Cursor/VS Code:
1. Open Command Palette (`Ctrl+Shift+P`)
2. Select "MCP: Add Server"
3. Enter server URL: `http://localhost:3001`
4. Configure authentication if needed

#### For Custom AI Applications:
```javascript
const MCPClient = require('./mcp-client-example');
const client = new MCPClient('http://localhost:3001');

// Initialize and use
await client.initialize();
const contacts = await client.searchContacts('John');
```

## Available CRM Tools

### Contact Management
- `search_contacts` - Search for contacts in the CRM
- `get_contact_details` - Get detailed contact information
- `update_contact` - Update contact information

### Call Management
- `log_call` - Log call interactions
- `get_call_history` - Retrieve call history
- `schedule_callback` - Schedule follow-up calls

### Email Sequences
- `trigger_email_sequence` - Start an email sequence
- `pause_sequence` - Pause an email sequence
- `get_sequence_status` - Check sequence progress

### Analytics
- `get_crm_analytics` - Retrieve CRM metrics
- `get_conversion_rates` - Get conversion statistics
- `get_activity_summary` - Get activity summaries

## Security Considerations

### Authentication
```javascript
// Add authentication middleware
app.use('/mcp', authenticateToken);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.sendStatus(401);
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/mcp', mcpLimiter);
```

## Integration with Existing Systems

### Firebase Integration
```javascript
// In your MCP server, integrate with Firebase
const admin = require('firebase-admin');

this.registerTool('search_contacts', 'Search contacts in Firebase', schema, async (args) => {
  const db = admin.firestore();
  const contactsRef = db.collection('contacts');
  const snapshot = await contactsRef.where('name', '>=', args.query).get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
});
```

### Twilio Integration
```javascript
// Integrate with Twilio for call logging
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

this.registerTool('log_call', 'Log call with Twilio', schema, async (args) => {
  // Log call details to Twilio
  const call = await client.calls.create({
    to: args.phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    // ... other options
  });
  
  return { callSid: call.sid, status: 'initiated' };
});
```

### SendGrid Integration
```javascript
// Integrate with SendGrid for email sequences
const sgMail = require('@sendgrid/mail');

this.registerTool('trigger_email_sequence', 'Start email sequence', schema, async (args) => {
  const msg = {
    to: args.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: args.subject,
    html: args.template
  };
  
  await sgMail.send(msg);
  return { status: 'sent', timestamp: new Date().toISOString() };
});
```

## Testing Your MCP Server

### Manual Testing
```bash
# Test server initialization
curl -X POST http://localhost:3001/mcp/initialize \
  -H "Content-Type: application/json" \
  -d '{"protocolVersion": "2024-11-05", "capabilities": {}}'

# Test tool listing
curl -X POST http://localhost:3001/mcp/tools/list

# Test tool execution
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "search_contacts", "arguments": {"query": "John", "limit": 5}}'
```

### Automated Testing
```javascript
// Create test suite
const assert = require('assert');
const MCPClient = require('./mcp-client-example');

async function runTests() {
  const client = new MCPClient();
  
  try {
    await client.initialize();
    console.log('✓ Initialization successful');
    
    const tools = await client.listTools();
    assert(tools.length > 0, 'Should have tools available');
    console.log('✓ Tools listing successful');
    
    const contacts = await client.searchContacts('test');
    assert(Array.isArray(contacts.contacts), 'Should return contacts array');
    console.log('✓ Contact search successful');
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

runTests();
```

## Deployment

### Environment Variables
```bash
# .env file
MCP_SERVER_PORT=3001
JWT_SECRET=your-secret-key
FIREBASE_PROJECT_ID=your-project-id
TWILIO_ACCOUNT_SID=your-twilio-sid
SENDGRID_API_KEY=your-sendgrid-key
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "mcp-server-example.js"]
```

### Production Considerations
- Use HTTPS in production
- Implement proper authentication
- Set up monitoring and logging
- Configure rate limiting
- Use environment variables for secrets

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure MCP server is running
   - Check port configuration
   - Verify firewall settings

2. **Authentication Errors**
   - Verify JWT tokens
   - Check API keys
   - Ensure proper headers

3. **Tool Execution Failures**
   - Check tool schemas
   - Verify required parameters
   - Review error logs

### Debug Mode
```javascript
// Enable debug logging
const debug = require('debug')('mcp-server');
debug('Tool called:', toolName, args);
```

## Next Steps

1. **Customize Tools**: Add more CRM-specific tools
2. **Enhance Security**: Implement OAuth or API key authentication
3. **Add Monitoring**: Set up logging and metrics
4. **Scale**: Consider load balancing for multiple instances
5. **Documentation**: Create API documentation for your tools

## Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol)
- [Cursor MCP Integration](https://cursor.sh/docs/mcp)
- [VS Code MCP Extension](https://marketplace.visualstudio.com/items?itemName=modelcontextprotocol.mcp)