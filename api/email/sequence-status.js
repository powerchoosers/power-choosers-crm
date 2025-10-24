// API endpoint to get sequence execution status
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { executionId } = req.query;

    if (!executionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required parameter: executionId' 
      }));
      return;
    }

    const automation = new SequenceAutomation();
    const status = await automation.getSequenceStatus(executionId);

    if (!status) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Sequence execution not found' 
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      status 
    }));
    return;

  } catch (error) {
    console.error('[SequenceStatus] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to get sequence status', 
      message: error.message 
    }));
    return;
  }
}
