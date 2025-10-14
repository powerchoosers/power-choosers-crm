// Client-side sequence automation manager
class SequenceAutomationManager {
  constructor() {
    this.apiBaseUrl = window.API_BASE_URL || window.location.origin;
  }

  /**
   * Start a sequence for a contact
   */
  async startSequence(sequenceId, contactData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/email/start-sequence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sequenceId,
          contactId: contactData.id || contactData.email,
          contactData: {
            email: contactData.email,
            firstName: contactData.firstName || '',
            lastName: contactData.lastName || '',
            name: contactData.name || `${contactData.firstName || ''} ${contactData.lastName || ''}`.trim(),
            company: contactData.company || '',
            title: contactData.title || '',
            phone: contactData.phone || ''
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start sequence');
      }

      const result = await response.json();
      console.log('[SequenceAutomation] Sequence started:', result);
      
      return result;

    } catch (error) {
      console.error('[SequenceAutomation] Start sequence error:', error);
      throw error;
    }
  }

  /**
   * Get sequence execution status
   */
  async getSequenceStatus(executionId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/email/sequence-status?executionId=${executionId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get sequence status');
      }

      const result = await response.json();
      return result.status;

    } catch (error) {
      console.error('[SequenceAutomation] Get status error:', error);
      throw error;
    }
  }

  /**
   * Send email via SendGrid (replaces Gmail API)
   */
  async sendEmail(emailData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/email/sendgrid-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send email');
      }

      const result = await response.json();
      console.log('[SequenceAutomation] Email sent via SendGrid:', result);
      
      return result;

    } catch (error) {
      console.error('[SequenceAutomation] Send email error:', error);
      throw error;
    }
  }

  /**
   * Create a sequence in the database
   */
  async createSequence(sequenceData) {
    try {
      // This would typically be handled by your existing sequence builder
      // For now, we'll assume sequences are created through the UI
      console.log('[SequenceAutomation] Sequence creation handled by UI');
      return sequenceData;

    } catch (error) {
      console.error('[SequenceAutomation] Create sequence error:', error);
      throw error;
    }
  }

  /**
   * Get all sequences
   */
  async getSequences() {
    try {
      // This would fetch from your database
      // For now, return empty array
      return [];

    } catch (error) {
      console.error('[SequenceAutomation] Get sequences error:', error);
      throw error;
    }
  }

  /**
   * Pause a sequence execution
   */
  async pauseSequence(executionId) {
    try {
      // This would call your pause API endpoint
      console.log('[SequenceAutomation] Pause sequence:', executionId);
      return { success: true };

    } catch (error) {
      console.error('[SequenceAutomation] Pause sequence error:', error);
      throw error;
    }
  }

  /**
   * Resume a paused sequence
   */
  async resumeSequence(executionId) {
    try {
      // This would call your resume API endpoint
      console.log('[SequenceAutomation] Resume sequence:', executionId);
      return { success: true };

    } catch (error) {
      console.error('[SequenceAutomation] Resume sequence error:', error);
      throw error;
    }
  }
}

// Initialize global sequence automation manager
window.sequenceAutomationManager = new SequenceAutomationManager();

export default SequenceAutomationManager;
