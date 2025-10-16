// API endpoint to get sequence execution status
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { executionId } = req.query;

    if (!executionId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: executionId' 
      });
    }

    const automation = new SequenceAutomation();
    const status = await automation.getSequenceStatus(executionId);

    if (!status) {
      return res.status(404).json({ 
        error: 'Sequence execution not found' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      status 
    });

  } catch (error) {
    console.error('[SequenceStatus] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to get sequence status', 
      message: error.message 
    });
  }
}
