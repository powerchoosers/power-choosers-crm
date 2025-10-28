'use strict';
// Sequence Email Scheduler - Background job system for generating and sending scheduled emails

// Helper functions for user management (reused from background-emails-loader.js)
const getUserEmail = () => {
  try { 
    if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
      return window.DataManager.getCurrentUserEmail(); 
    }
    return (window.currentUserEmail || '').toLowerCase(); 
  } catch(_) { 
    return (window.currentUserEmail || '').toLowerCase(); 
  }
};

const isCurrentUserAdmin = () => {
  try { 
    if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
      return window.DataManager.isCurrentUserAdmin(); 
    }
    return window.currentUserRole === 'admin'; 
  } catch(_) { 
    return false; 
  }
};

class SequenceScheduler {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMs = 5 * 60 * 1000; // Check every 5 minutes
    this.maxBatchSize = 5; // Generate max 5 emails per batch
    this.generationBufferMs = 30 * 60 * 1000; // Generate 30 minutes before send
  }

  // Start the scheduler
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting sequence email scheduler');
    this.isRunning = true;
    
    // Initial check
    this.checkForScheduledEmails();
    
    // Set up interval
    this.checkInterval = setInterval(() => {
      this.checkForScheduledEmails();
    }, this.checkIntervalMs);
  }

  // Stop the scheduler
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[Scheduler] Stopping sequence email scheduler');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Main check function
  async checkForScheduledEmails() {
    try {
      console.log('[Scheduler] Checking for scheduled emails...');
      
      // Check for emails ready to generate
      await this.checkForGeneration();
      
      // Check for emails ready to send
      await this.checkForSending();
      
    } catch (error) {
      console.error('[Scheduler] Error in check cycle:', error);
    }
  }

  // Check for emails that need to be generated
  async checkForGeneration() {
    try {
      const now = Date.now();
      const generateTime = now + this.generationBufferMs;
      
      // Get current user info for ownership filtering
      const currentUserEmail = getUserEmail();
      const isAdmin = isCurrentUserAdmin();
      
      // Query Firestore for sequences with contacts that need email generation
      let sequencesSnapshot;
      
      if (isAdmin) {
        // Admin: get all active sequences
        sequencesSnapshot = await firebase.firestore()
          .collection('sequences')
          .where('status', '==', 'active')
          .get();
      } else {
        // Employee: get only sequences owned by or assigned to current user
        const sequencesQuery = firebase.firestore()
          .collection('sequences')
          .where('status', '==', 'active');
        
        // For employees, we need to check ownership/assignment
        // This is a simplified approach - in production you might want to add ownerId/assignedTo fields to sequences
        sequencesSnapshot = await sequencesQuery.get();
        
        // Filter sequences by ownership (if sequences have ownerId/assignedTo fields)
        const filteredSequences = [];
        sequencesSnapshot.forEach(doc => {
          const sequence = doc.data();
          if (sequence.ownerId === currentUserEmail || sequence.assignedTo === currentUserEmail) {
            filteredSequences.push({ id: doc.id, ...sequence });
          }
        });
        
        // Convert back to snapshot-like structure
        sequencesSnapshot = {
          docs: filteredSequences.map(seq => ({
            id: seq.id,
            data: () => seq
          }))
        };
      }
      
      const emailsToGenerate = [];
      
      for (const sequenceDoc of sequencesSnapshot.docs) {
        const sequence = sequenceDoc.data();
        const sequenceId = sequenceDoc.id;
        
        // Get contacts for this sequence with ownership filtering
        let contactsSnapshot;
        
        if (isAdmin) {
          contactsSnapshot = await firebase.firestore()
            .collection('sequenceContacts')
            .where('sequenceId', '==', sequenceId)
            .get();
        } else {
          // Employee: get contacts owned by or assigned to current user
          const contactsQuery = firebase.firestore()
            .collection('sequenceContacts')
            .where('sequenceId', '==', sequenceId);
          
          const allContacts = await contactsQuery.get();
          const filteredContacts = [];
          
          allContacts.forEach(doc => {
            const contactData = doc.data();
            if (contactData.ownerId === currentUserEmail || contactData.assignedTo === currentUserEmail) {
              filteredContacts.push({ id: doc.id, ...contactData });
            }
          });
          
          contactsSnapshot = {
            docs: filteredContacts.map(contact => ({
              id: contact.id,
              data: () => contact
            }))
          };
        }
        
        for (const contactDoc of contactsSnapshot.docs) {
          const contactData = contactDoc.data();
          const contactId = contactDoc.id;
          
          // Calculate when each step should generate
          const emailsForContact = this.calculateEmailTimes(sequence, contactData, generateTime, currentUserEmail);
          emailsToGenerate.push(...emailsForContact);
        }
      }
      
      // Filter to only emails that should generate now
      const readyToGenerate = emailsToGenerate.filter(email => 
        email.generateTime <= now && 
        !email.alreadyGenerated
      ).slice(0, this.maxBatchSize);
      
      console.log(`[Scheduler] Found ${readyToGenerate.length} emails ready to generate`);
      
      // Generate emails
      for (const emailData of readyToGenerate) {
        await this.generateScheduledEmail(emailData);
      }
      
    } catch (error) {
      console.error('[Scheduler] Error checking for generation:', error);
    }
  }

  // Calculate when each step should generate for a contact
  calculateEmailTimes(sequence, contactData, generateTime, currentUserEmail) {
    const emails = [];
    const contactAddedTime = contactData.addedAt?.toDate() || new Date();
    let cumulativeDelay = 0;
    
    for (let i = 0; i < sequence.steps.length; i++) {
      const step = sequence.steps[i];
      
      if (step.type === 'auto-email' || step.type === 'manual-email') {
        const sendTime = contactAddedTime.getTime() + cumulativeDelay;
        const generateTime = sendTime - this.generationBufferMs;
        
        emails.push({
          sequenceId: sequence.id,
          sequenceStepId: step.id,
          stepIndex: i,
          contactId: contactData.contactId,
          contactName: contactData.contactName,
          contactCompany: contactData.contactCompany,
          contactEmail: contactData.contactEmail,
          sendTime: sendTime,
          generateTime: generateTime,
          step: step,
          alreadyGenerated: false, // TODO: Check if already generated
          ownerId: currentUserEmail, // Set ownership
          assignedTo: currentUserEmail // Set assignment
        });
      }
      
      // Add delay for next step
      cumulativeDelay += (step.delayMinutes || 0) * 60 * 1000;
    }
    
    return emails;
  }

  // Generate a scheduled email
  async generateScheduledEmail(emailData) {
    try {
      console.log(`[Scheduler] Generating email for step ${emailData.stepIndex + 1} of sequence ${emailData.sequenceId}`);
      
      // Create scheduled email record
      const scheduledEmailId = `scheduled_${emailData.sequenceId}_${emailData.sequenceStepId}_${emailData.contactId}_${Date.now()}`;
      
      const scheduledEmail = {
        id: scheduledEmailId,
        type: 'scheduled',
        status: 'generating',
        scheduledSendTime: emailData.sendTime,
        generatedAt: Date.now(),
        sequenceId: emailData.sequenceId,
        sequenceStepId: emailData.sequenceStepId,
        stepIndex: emailData.stepIndex,
        contactId: emailData.contactId,
        contactName: emailData.contactName,
        contactCompany: emailData.contactCompany,
        from: 'Power Choosers Team', // TODO: Get from settings
        to: emailData.contactEmail,
        subject: emailData.step.data?.subject || 'Generated Email',
        html: emailData.step.data?.html || '',
        text: emailData.step.data?.text || '',
        aiPrompt: emailData.step.data?.aiPrompt || '',
        aiMode: emailData.step.data?.aiMode || 'standard',
        templateType: emailData.step.data?.templateType || 'general',
        createdAt: Date.now(),
        ownerId: emailData.ownerId, // Set ownership
        assignedTo: emailData.assignedTo // Set assignment
      };
      
      // Save to Firestore
      await firebase.firestore()
        .collection('emails')
        .doc(scheduledEmailId)
        .set(scheduledEmail);
      
      // Generate AI content if not already generated
      if (!emailData.step.data?.aiGenerated) {
        await this.generateAIContent(scheduledEmailId, emailData);
      }
      
      // Update status to pending approval
      await firebase.firestore()
        .collection('emails')
        .doc(scheduledEmailId)
        .update({
          status: 'pending_approval',
          generatedAt: Date.now()
        });
      
      console.log(`[Scheduler] Email generated successfully: ${scheduledEmailId}`);
      
    } catch (error) {
      console.error('[Scheduler] Error generating email:', error);
      
      // Update status to error
      try {
        await firebase.firestore()
          .collection('emails')
          .doc(scheduledEmailId)
          .update({
            status: 'error',
            error: error.message
          });
      } catch (updateError) {
        console.error('[Scheduler] Error updating email status:', updateError);
      }
    }
  }

  // Generate AI content for scheduled email
  async generateAIContent(scheduledEmailId, emailData) {
    try {
      // Get contact data for AI generation
      const contactSnapshot = await firebase.firestore()
        .collection('people')
        .doc(emailData.contactId)
        .get();
      
      if (!contactSnapshot.exists) {
        throw new Error('Contact not found');
      }
      
      const contact = contactSnapshot.data();
      
      // Create recipient object
      const recipient = {
        firstName: contact.firstName,
        fullName: contact.fullName,
        company: contact.company,
        title: contact.title,
        industry: contact.industry,
        email: contact.email,
        energy: contact.energy || {},
        notes: contact.notes,
        account: contact.account
      };
      
      // Get AI prompt from step data or use default
      const prompt = emailData.step.data?.aiPrompt || 
        `Write a ${emailData.step.type === 'auto-email' ? 'professional' : 'personal'} email for step ${emailData.stepIndex + 1} of our sequence`;
      
      // Get sender info from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
      
      // Get AI templates
      const aiTemplates = settings?.aiTemplates || {};
      const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';
      
      // Call AI generation API
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const genUrl = `${base}/api/perplexity-email`;
      
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          recipient: recipient,
          mode: emailData.step.data?.aiMode || 'standard',
          senderName: senderName,
          whoWeAre: whoWeAre,
          marketContext: aiTemplates.marketContext,
          meetingPreferences: aiTemplates.meetingPreferences,
          sequenceContext: {
            stepId: emailData.sequenceStepId,
            stepIndex: emailData.stepIndex,
            totalSteps: emailData.step.totalSteps || 1,
            sequenceName: emailData.sequenceName || 'Sequence'
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`AI generation failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update scheduled email with generated content
      await firebase.firestore()
        .collection('emails')
        .doc(scheduledEmailId)
        .update({
          subject: result.subject || 'Generated Email',
          html: result.html || '',
          text: result.text || result.body || '',
          aiGenerated: true,
          aiPrompt: prompt,
          aiMode: emailData.step.data?.aiMode || 'standard'
        });
      
      console.log(`[Scheduler] AI content generated for ${scheduledEmailId}`);
      
    } catch (error) {
      console.error('[Scheduler] Error generating AI content:', error);
      throw error;
    }
  }

  // Check for emails ready to send
  async checkForSending() {
    try {
      const now = Date.now();
      
      // Get current user info for ownership filtering
      const currentUserEmail = getUserEmail();
      const isAdmin = isCurrentUserAdmin();
      
      // Query for approved scheduled emails ready to send
      let scheduledSnapshot;
      
      if (isAdmin) {
        // Admin: get all approved scheduled emails ready to send
        scheduledSnapshot = await firebase.firestore()
          .collection('emails')
          .where('type', '==', 'scheduled')
          .where('status', '==', 'approved')
          .where('scheduledSendTime', '<=', now)
          .limit(10) // Process max 10 at a time
          .get();
      } else {
        // Employee: get only emails owned by or assigned to current user
        const scheduledQuery = firebase.firestore()
          .collection('emails')
          .where('type', '==', 'scheduled')
          .where('status', '==', 'approved')
          .where('scheduledSendTime', '<=', now);
        
        const allScheduled = await scheduledQuery.get();
        const filteredScheduled = [];
        
        allScheduled.forEach(doc => {
          const emailData = doc.data();
          if (emailData.ownerId === currentUserEmail || emailData.assignedTo === currentUserEmail) {
            filteredScheduled.push({ id: doc.id, ...emailData });
          }
        });
        
        // Convert back to snapshot-like structure
        scheduledSnapshot = {
          docs: filteredScheduled.slice(0, 10).map(email => ({
            id: email.id,
            data: () => email
          }))
        };
      }
      
      console.log(`[Scheduler] Found ${scheduledSnapshot.docs.length} emails ready to send`);
      
      for (const emailDoc of scheduledSnapshot.docs) {
        await this.sendScheduledEmail(emailDoc);
      }
      
    } catch (error) {
      console.error('[Scheduler] Error checking for sending:', error);
    }
  }

  // Send a scheduled email
  async sendScheduledEmail(emailDoc) {
    try {
      const emailData = emailDoc.data();
      const emailId = emailDoc.id;
      
      console.log(`[Scheduler] Sending scheduled email: ${emailId}`);
      
      // Update status to sending
      await firebase.firestore()
        .collection('emails')
        .doc(emailId)
        .update({
          status: 'sending',
          sentAt: Date.now()
        });
      
      // Call SendGrid API to send email
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const sendUrl = `${base}/api/send-email`;
      
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailData.to,
          from: emailData.from,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          scheduledEmailId: emailId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Send failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update status to sent
      await firebase.firestore()
        .collection('emails')
        .doc(emailId)
        .update({
          status: 'sent',
          sentAt: Date.now(),
          messageId: result.messageId,
          type: 'sent' // Change type to sent for proper filtering
        });
      
      console.log(`[Scheduler] Email sent successfully: ${emailId}`);
      
    } catch (error) {
      console.error('[Scheduler] Error sending email:', error);
      
      // Update status to error
      try {
        await firebase.firestore()
          .collection('emails')
          .doc(emailDoc.id)
          .update({
            status: 'error',
            error: error.message
          });
      } catch (updateError) {
        console.error('[Scheduler] Error updating email status:', updateError);
      }
    }
  }

  // Manual trigger for testing
  async triggerCheck() {
    console.log('[Scheduler] Manual trigger requested');
    await this.checkForScheduledEmails();
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      maxBatchSize: this.maxBatchSize,
      generationBufferMs: this.generationBufferMs
    };
  }
}

// Create global instance
window.SequenceScheduler = new SequenceScheduler();

// Auto-start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Scheduler] DOM ready, starting scheduler');
    window.SequenceScheduler.start();
  });
} else {
  console.log('[Scheduler] DOM already ready, starting scheduler');
  window.SequenceScheduler.start();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SequenceScheduler;
}
