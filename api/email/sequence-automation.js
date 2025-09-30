// Sequence automation engine for automated email sequences
import { admin, db } from '../_firebase';
import SendGridService from './sendgrid-service.js';

export class SequenceAutomation {
  constructor() {
    this.sendGridService = new SendGridService();
    this.isProcessing = false;
  }

  /**
   * Start a sequence for a contact
   */
  async startSequence(sequenceId, contactId, contactData) {
    try {
      if (!db) throw new Error('Database not available');

      // Get sequence data
      const sequenceDoc = await db.collection('sequences').doc(sequenceId).get();
      if (!sequenceDoc.exists) {
        throw new Error('Sequence not found');
      }

      const sequence = sequenceDoc.data();
      if (!sequence.steps || sequence.steps.length === 0) {
        throw new Error('Sequence has no steps');
      }

      // Create sequence execution
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const execution = {
        id: executionId,
        sequenceId: sequenceId,
        contactId: contactId,
        contactData: contactData,
        currentStep: 0,
        totalSteps: sequence.steps.length,
        status: 'active',
        startedAt: new Date().toISOString(),
        nextSendDate: this.calculateNextSendDate(sequence.steps[0]),
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store execution in database
      await db.collection('sequence_executions').doc(executionId).set(execution);

      // Schedule first email
      await this.scheduleNextEmail(executionId, sequence.steps[0], contactData);

      console.log('[SequenceAutomation] Sequence started:', {
        sequenceId,
        contactId,
        executionId,
        nextSendDate: execution.nextSendDate
      });

      return executionId;

    } catch (error) {
      console.error('[SequenceAutomation] Start sequence error:', error);
      throw error;
    }
  }

  /**
   * Process pending sequence emails
   */
  async processPendingEmails() {
    if (this.isProcessing) {
      console.log('[SequenceAutomation] Already processing, skipping');
      return;
    }

    this.isProcessing = true;

    try {
      if (!db) {
        console.warn('[SequenceAutomation] Database not available');
        return;
      }

      const now = new Date().toISOString();
      
      // Get all active executions that are due
      const executionsQuery = await db.collection('sequence_executions')
        .where('status', '==', 'active')
        .where('nextSendDate', '<=', now)
        .limit(50)
        .get();

      if (executionsQuery.empty) {
        console.log('[SequenceAutomation] No pending emails to process');
        return;
      }

      console.log(`[SequenceAutomation] Processing ${executionsQuery.size} pending emails`);

      for (const doc of executionsQuery.docs) {
        try {
          await this.processSequenceExecution(doc.id, doc.data());
        } catch (error) {
          console.error(`[SequenceAutomation] Error processing execution ${doc.id}:`, error);
        }
      }

    } catch (error) {
      console.error('[SequenceAutomation] Process pending emails error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single sequence execution
   */
  async processSequenceExecution(executionId, execution) {
    try {
      const { sequenceId, currentStep, contactData, contactId } = execution;

      // Get sequence data
      const sequenceDoc = await db.collection('sequences').doc(sequenceId).get();
      if (!sequenceDoc.exists) {
        throw new Error('Sequence not found');
      }

      const sequence = sequenceDoc.data();
      const currentStepData = sequence.steps[currentStep];

      if (!currentStepData) {
        // Sequence completed
        await this.completeSequence(executionId);
        return;
      }

      // Prepare email data
      const emailData = await this.prepareEmailData(currentStepData, contactData, executionId);
      
      // Send email
      const result = await this.sendGridService.sendEmail(emailData);

      // Update execution
      const nextStep = currentStep + 1;
      const isCompleted = nextStep >= sequence.steps.length;

      await db.collection('sequence_executions').doc(executionId).update({
        currentStep: nextStep,
        status: isCompleted ? 'completed' : 'active',
        nextSendDate: isCompleted ? null : this.calculateNextSendDate(sequence.steps[nextStep]),
        completedAt: isCompleted ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        lastEmailSent: {
          stepIndex: currentStep,
          sentAt: new Date().toISOString(),
          messageId: result.messageId,
          trackingId: result.trackingId
        }
      });

      console.log(`[SequenceAutomation] Email sent for execution ${executionId}, step ${currentStep}`);

      if (isCompleted) {
        console.log(`[SequenceAutomation] Sequence completed for execution ${executionId}`);
      }

    } catch (error) {
      console.error(`[SequenceAutomation] Process execution error for ${executionId}:`, error);
      
      // Mark execution as failed
      await db.collection('sequence_executions').doc(executionId).update({
        status: 'failed',
        error: error.message,
        updatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Prepare email data from sequence step
   */
  async prepareEmailData(stepData, contactData, executionId) {
    const { type, subject, content, delayMinutes } = stepData;
    
    // Generate tracking ID
    const trackingId = `seq_${executionId}_${Date.now()}`;

    // Replace variables in content and subject
    const processedContent = this.replaceVariables(content, contactData);
    const processedSubject = this.replaceVariables(subject, contactData);

    return {
      to: contactData.email,
      subject: processedSubject,
      content: processedContent,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com',
      trackingId: trackingId,
      _deliverability: {
        enableTracking: true,
        includeBulkHeaders: false,
        includeListUnsubscribe: false,
        includePriorityHeaders: false,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: false,
        signatureImageEnabled: true
      }
    };
  }

  /**
   * Replace variables in text with contact data
   */
  replaceVariables(text, contactData) {
    if (!text || !contactData) return text;

    return text
      .replace(/\{\{firstName\}\}/g, contactData.firstName || '')
      .replace(/\{\{lastName\}\}/g, contactData.lastName || '')
      .replace(/\{\{name\}\}/g, contactData.name || `${contactData.firstName || ''} ${contactData.lastName || ''}`.trim())
      .replace(/\{\{email\}\}/g, contactData.email || '')
      .replace(/\{\{company\}\}/g, contactData.company || '')
      .replace(/\{\{title\}\}/g, contactData.title || '')
      .replace(/\{\{phone\}\}/g, contactData.phone || '');
  }

  /**
   * Calculate next send date based on step delay
   */
  calculateNextSendDate(stepData) {
    const delayMinutes = stepData.delayMinutes || 0;
    const nextDate = new Date();
    nextDate.setMinutes(nextDate.getMinutes() + delayMinutes);
    return nextDate.toISOString();
  }

  /**
   * Complete a sequence
   */
  async completeSequence(executionId) {
    await db.collection('sequence_executions').doc(executionId).update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[SequenceAutomation] Sequence completed: ${executionId}`);
  }

  /**
   * Pause a sequence execution
   */
  async pauseSequence(executionId) {
    await db.collection('sequence_executions').doc(executionId).update({
      status: 'paused',
      updatedAt: new Date().toISOString()
    });

    console.log(`[SequenceAutomation] Sequence paused: ${executionId}`);
  }

  /**
   * Resume a paused sequence
   */
  async resumeSequence(executionId) {
    const executionDoc = await db.collection('sequence_executions').doc(executionId).get();
    if (!executionDoc.exists) {
      throw new Error('Sequence execution not found');
    }

    const execution = executionDoc.data();
    const now = new Date();
    const nextSendDate = new Date(execution.nextSendDate);

    // If next send date is in the past, set it to now
    const adjustedNextSendDate = nextSendDate < now ? now : nextSendDate;

    await db.collection('sequence_executions').doc(executionId).update({
      status: 'active',
      nextSendDate: adjustedNextSendDate.toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`[SequenceAutomation] Sequence resumed: ${executionId}`);
  }

  /**
   * Get sequence execution status
   */
  async getSequenceStatus(executionId) {
    try {
      if (!db) return null;

      const executionDoc = await db.collection('sequence_executions').doc(executionId).get();
      if (!executionDoc.exists) return null;

      return executionDoc.data();
    } catch (error) {
      console.error('[SequenceAutomation] Get status error:', error);
      return null;
    }
  }
}

export default SequenceAutomation;
