# Vercel to Cloud Run Migration Rules

## Core Migration Principles

### 1. Express.js to Node.js HTTP Conversion
- **NEVER use Express.js syntax** in API handlers
- **ALWAYS use Node.js HTTP syntax** for responses
- **Convert all `res.status().json()`** to `res.writeHead() + res.end(JSON.stringify())`
- **Convert all `res.status().send()`** to `res.writeHead() + res.end()`
- **Convert all `res.json()`** to `res.writeHead() + res.end(JSON.stringify())`
- **Convert all `res.send()`** to `res.writeHead() + res.end()`

### 2. CORS Handling
- **ALWAYS use centralized CORS utility** from `api/_cors.js`
- **NEVER create custom CORS middleware** in individual files
- **Use `if (cors(req, res)) return;`** at the start of handlers
- **Handle OPTIONS requests** with `res.writeHead(200); res.end();`

### 3. ES Modules Requirements
- **ALWAYS use ES6 imports** instead of `require()`
- **ALWAYS use `export default`** for handler functions
- **ALWAYS add `.js` extension** to relative imports
- **NEVER use `module.exports`** or `exports.`

### 4. Response Patterns
```javascript
// ✅ CORRECT (Node.js HTTP)
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ success: true }));

// ✅ CORRECT (TwiML responses)
res.writeHead(200, { 'Content-Type': 'text/xml' });
res.end(xml);

// ❌ WRONG (Express.js - never use)
res.status(200).json({ success: true });
res.status(200).send(xml);
```

### 5. Error Handling
```javascript
// ✅ CORRECT
try {
  // ... logic
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
  return;
} catch (error) {
  console.error('[Handler] Error:', error);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Internal server error' }));
  return;
}
```

### 6. Method Validation
```javascript
// ✅ CORRECT
if (req.method !== 'POST') {
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
  return;
}
```

### 7. File Structure
- **API handlers** go in `api/` directory
- **Use descriptive filenames** (e.g., `call-status.js`, `sendgrid-webhook.js`)
- **Group related APIs** in subdirectories (e.g., `api/twilio/`, `api/email/`)
- **Export default handler function** from each API file

### 8. Environment Variables
- **Use `process.env.VARIABLE_NAME`** for configuration
- **Provide fallbacks** where appropriate
- **Validate required variables** before use
- **Log missing variables** for debugging

### 9. Firebase Integration
- **Import from `api/_firebase.js`** for database access
- **Handle missing database** gracefully with fallbacks
- **Use proper error handling** for Firestore operations

### 10. Twilio Integration
- **Use ES6 imports** for Twilio client
- **Handle missing credentials** gracefully
- **Use proper error handling** for Twilio API calls
- **Validate Twilio SIDs** before processing

## Migration Checklist

When converting files from Vercel to Cloud Run:

- [ ] Convert all `res.status().json()` to Node.js HTTP syntax
- [ ] Convert all `res.status().send()` to Node.js HTTP syntax
- [ ] Convert all `res.json()` to Node.js HTTP syntax
- [ ] Convert all `res.send()` to Node.js HTTP syntax
- [ ] Replace custom CORS with centralized utility
- [ ] Convert `require()` to ES6 imports
- [ ] Convert `module.exports` to `export default`
- [ ] Add `.js` extensions to relative imports
- [ ] Add proper error handling with try/catch
- [ ] Add method validation
- [ ] Test all endpoints after conversion

## Common Patterns

### API Handler Template
```javascript
import { cors } from '../_cors.js';
import { db } from '../_firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    // ... handler logic
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
    
  } catch (error) {
    console.error('[Handler] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }
}
```

### TwiML Response Template
```javascript
import twilio from 'twilio';
const VoiceResponse = twilio.twiml.VoiceResponse;

export default async function handler(req, res) {
  try {
    const twiml = new VoiceResponse();
    // ... TwiML logic
    
    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(200);
    res.end(xml);
    return;
    
  } catch (error) {
    console.error('[TwiML] Error:', error);
    const twiml = new VoiceResponse();
    twiml.say('Sorry, there was an error processing your call.');
    
    const xml = twiml.toString();
    res.setHeader('Content-Type', 'text/xml');
    res.writeHead(500);
    res.end(xml);
    return;
  }
}
```

## Testing Requirements

After migration, verify:
- [ ] All API endpoints respond correctly
- [ ] CORS headers are present
- [ ] Error responses are properly formatted
- [ ] TwiML responses have correct content-type
- [ ] Firebase operations work correctly
- [ ] Twilio webhooks process successfully
- [ ] Email functionality works end-to-end
- [ ] Phone calls can be placed and received
- [ ] All webhooks respond within timeout limits

