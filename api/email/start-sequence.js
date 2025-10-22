// API endpoint to start a sequence for a contact
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { sequenceId, contactId, contactData } = req.body;

    if (!sequenceId || !contactId || !contactData) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required fields: sequenceId, contactId, contactData' 
      }));
      return;
    }

    if (!contactData.email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Contact email is required' 
      }));
      return;
    }

    console.log('[StartSequence] Starting sequence:', { sequenceId, contactId, contactData });

    const automation = new SequenceAutomation();
    const executionId = await automation.startSequence(sequenceId, contactId, contactData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      executionId,
      message: 'Sequence started successfully'
    }));

  } catch (error) {
    console.error('[StartSequence] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to start sequence', 
      message: error.message 
    }));
    return;
  }
}
