import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const BATCH_SIZE = 25;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  try {
    const { immediate, activationId } = req.body || {};
    
    if (!isProduction) {
      console.log('[ProcessSequenceActivations] Starting, immediate:', immediate, 'activationId:', activationId);
    }
    
    // If specific activation ID provided (immediate trigger), process just that one
    if (immediate && activationId) {
      await processSingleActivation(activationId, isProduction);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Activation processed' }));
      return;
    }
    
    // Otherwise, process all pending activations (cron job)
    const activationsQuery = db.collection('sequenceActivations')
      .where('status', 'in', ['pending', 'processing'])
      .limit(5);
    
    const activationsSnapshot = await activationsQuery.get();
    
    if (activationsSnapshot.empty) {
      if (!isProduction) {
        console.log('[ProcessSequenceActivations] No pending activations found');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No activations to process' 
      }));
      return;
    }
    
    if (!isProduction) {
      console.log('[ProcessSequenceActivations] Found', activationsSnapshot.size, 'activations to process');
    }
    
    let processedCount = 0;
    const errors = [];
    
    for (const activationDoc of activationsSnapshot.docs) {
      try {
        await processSingleActivation(activationDoc.id, isProduction);
        processedCount++;
      } catch (error) {
        console.error('[ProcessSequenceActivations] Failed to process activation:', activationDoc.id, error);
        errors.push({
          activationId: activationDoc.id,
          error: error.message
        });
      }
    }
    
    if (!isProduction) {
      console.log('[ProcessSequenceActivations] Complete. Processed:', processedCount, 'Errors:', errors.length);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: processedCount,
      errors: errors.length,
      errorDetails: errors
    }));
    
  } catch (error) {
    console.error('[ProcessSequenceActivations] Fatal error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

async function processSingleActivation(activationId, isProduction) {
  const activationRef = db.collection('sequenceActivations').doc(activationId);
  
  try {
    // Use transaction to ensure idempotency
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(activationRef);
      
      if (!doc.exists) {
        throw new Error(`Sequence Activation ${activationId} not found.`);
      }
      
      const data = doc.data();
      const currentStatus = data.status;
      
      // Idempotency check
      if (currentStatus === 'processing') {
        // Check if it's stale
        const processingStartedAt = data.processingStartedAt?.toDate();
        const now = new Date();
        
        if (processingStartedAt && (now.getTime() - processingStartedAt.getTime() < STALE_THRESHOLD_MS)) {
          if (!isProduction) {
            console.log(`[ProcessSequenceActivations] Activation ${activationId} already being processed`);
          }
          // Don't throw error - just return success (idempotent behavior)
          return;
        } else {
          if (!isProduction) {
            console.warn(`[ProcessSequenceActivations] Activation ${activationId} is stale, re-claiming`);
          }
        }
      } else if (currentStatus === 'completed') {
        if (!isProduction) {
          console.log(`[ProcessSequenceActivations] Activation ${activationId} already completed`);
        }
        return;
      }
      
      // Claim the activation
      transaction.update(activationRef, {
        status: 'processing',
        processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: admin.firestore.FieldValue.increment(1)
      });
    });
    
    // Now process outside the transaction
    const doc = await activationRef.get();
    const data = doc.data();
    
    // Get sequence details
    const sequenceDoc = await db.collection('sequences').doc(data.sequenceId).get();
    if (!sequenceDoc.exists) {
      throw new Error(`Sequence ${data.sequenceId} not found`);
    }
    
    const sequence = sequenceDoc.data();
    const contactIds = data.contactIds || [];
    const processedContacts = data.processedContacts || 0;
    
    // Get contacts to process in this batch
    const remainingContacts = contactIds.slice(processedContacts, processedContacts + BATCH_SIZE);
    
    if (remainingContacts.length === 0) {
      // All contacts processed
      await activationRef.update({
        status: 'completed',
        processingStartedAt: admin.firestore.FieldValue.delete(),
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }
    
    if (!isProduction) {
      console.log(`[ProcessSequenceActivations] Processing ${remainingContacts.length} contacts for activation ${activationId}`);
    }
    
    // Load contact data
    const contactsData = await Promise.all(
      remainingContacts.map(async (contactId) => {
        try {
          const contactDoc = await db.collection('people').doc(contactId).get();
          if (contactDoc.exists) {
            return { id: contactId, ...contactDoc.data() };
          }
          // Try contacts collection as fallback
          const contactDoc2 = await db.collection('contacts').doc(contactId).get();
          if (contactDoc2.exists) {
            return { id: contactId, ...contactDoc2.data() };
          }
          return null;
        } catch (error) {
          console.error(`[ProcessSequenceActivations] Failed to load contact ${contactId}:`, error);
          return null;
        }
      })
    );
    
    // Filter out nulls
    const validContacts = contactsData.filter(c => c !== null);
    
    // Create scheduled emails for each step in the sequence
    const emailsToCreate = [];
    const failedContactIds = [];
    
    for (const contact of validContacts) {
      if (!contact.email) {
        failedContactIds.push(contact.id);
        continue;
      }
      
      // Create email for each auto-email step
      sequence.steps?.forEach((step, stepIndex) => {
        if (step.type === 'auto-email') {
          const delayMs = (step.delayMinutes || 0) * 60 * 1000;
          const scheduledSendTime = Date.now() + delayMs;
          
          const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          emailsToCreate.push({
            id: emailId,
            type: 'scheduled',
            status: 'not_generated',
            scheduledSendTime,
            contactId: contact.id,
            contactName: contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : contact.name,
            contactCompany: contact.company || contact.companyName || '',
            to: contact.email,
            sequenceId: data.sequenceId,
            sequenceName: sequence.name,
            stepIndex,
            totalSteps: sequence.steps?.length || 1,
            activationId,
            aiPrompt: step.emailSettings?.aiPrompt || step.data?.aiPrompt || step.aiPrompt || step.content || 'Write a professional email',
            ownerId: data.ownerId || data.userId,
            assignedTo: data.ownerId || data.userId,
            createdBy: data.ownerId || data.userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    }
    
    // Write emails in batches
    if (emailsToCreate.length > 0) {
      for (let i = 0; i < emailsToCreate.length; i += BATCH_SIZE) {
        const chunk = emailsToCreate.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        
        chunk.forEach(email => {
          const ref = db.collection('emails').doc(email.id);
          batch.set(ref, email);
        });
        
        await batch.commit();
        
        if (!isProduction) {
          console.log(`[ProcessSequenceActivations] Created ${chunk.length} emails (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        }
      }
    }
    
    // Update activation progress
    const newProcessedCount = processedContacts + remainingContacts.length;
    const isDone = newProcessedCount >= contactIds.length;
    
    await activationRef.update({
      processedContacts: newProcessedCount,
      status: isDone ? 'completed' : 'processing',
      processingStartedAt: isDone ? admin.firestore.FieldValue.delete() : data.processingStartedAt,
      completedAt: isDone ? admin.firestore.FieldValue.serverTimestamp() : null,
      'progress.emailsCreated': admin.firestore.FieldValue.increment(emailsToCreate.length),
      failedContactIds: failedContactIds.length > 0 ? admin.firestore.FieldValue.arrayUnion(...failedContactIds) : data.failedContactIds || []
    });
    
    if (!isProduction) {
      console.log(`[ProcessSequenceActivations] Updated activation ${activationId}: ${newProcessedCount}/${contactIds.length} contacts, ${emailsToCreate.length} emails created`);
    }
    
  } catch (error) {
    console.error(`[ProcessSequenceActivations] Error processing activation ${activationId}:`, error);
    
    // Update status to failed
    try {
      await activationRef.update({
        status: 'failed',
        errorMessage: error.message,
        processingStartedAt: admin.firestore.FieldValue.delete(),
        failedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (updateError) {
      console.error(`[ProcessSequenceActivations] Failed to update error status:`, updateError);
    }
    
    throw error;
  }
}

