// API endpoint to start a sequence for a contact
import SequenceAutomation from './sequence-automation.js';

export default async function handler(req, res) {
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sequenceId, contactId, contactData } = req.body;

    if (!sequenceId || !contactId || !contactData) {
      return res.status(400).json({ 
        error: 'Missing required fields: sequenceId, contactId, contactData' 
      });
    }

    if (!contactData.email) {
      return res.status(400).json({ 
        error: 'Contact email is required' 
      });
    }

    console.log('[StartSequence] Starting sequence:', { sequenceId, contactId, contactData });

    const automation = new SequenceAutomation();
    const executionId = await automation.startSequence(sequenceId, contactId, contactData);

    return res.status(200).json({ 
      success: true, 
      executionId,
      message: 'Sequence started successfully'
    });

  } catch (error) {
    console.error('[StartSequence] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to start sequence', 
      message: error.message 
    });
  }
}
