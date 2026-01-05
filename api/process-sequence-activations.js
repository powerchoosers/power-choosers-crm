import admin from 'firebase-admin';
import { db } from './_firebase.js';
import logger from './_logger.js';
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
  // Always log key events (even in production, but keep detailed logs conditional)
  const logAlways = (msg) => logger.log(`[ProcessSequenceActivations] [${new Date().toISOString()}] ${msg}`);

  try {
    if (!db) {
      logger.error('[ProcessSequenceActivations] Firestore not initialized. Missing Firebase service account env vars.');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
      }));
      return;
    }
    const { immediate, activationId } = req.body || {};

    logAlways(`Starting - immediate: ${immediate}, activationId: ${activationId || 'none'}`);

    // If specific activation ID provided (immediate trigger), process just that one
    if (immediate && activationId) {
      await processSingleActivation(activationId, isProduction);
      logAlways(`Processed immediate activation: ${activationId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Activation processed' }));
      return;
    }

    // Otherwise, process all pending activations (cron job)
    // Query pending first (most common case), then processing (stale ones)
    let activationsSnapshot;
    try {
      // Try pending first
      activationsSnapshot = await db.collection('sequenceActivations')
        .where('status', '==', 'pending')
        .limit(5)
        .get();

      // If no pending, check for stale processing ones
      if (activationsSnapshot.empty) {
        activationsSnapshot = await db.collection('sequenceActivations')
          .where('status', '==', 'processing')
          .limit(5)
          .get();
      }
    } catch (queryError) {
      // If query fails (e.g., missing index), log and return error
      logAlways(`Query error: ${queryError.message}`);
      logger.error('[ProcessSequenceActivations] Query failed:', queryError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: queryError.message,
        hint: 'Check if Firestore composite index is required'
      }));
      return;
    }

    if (activationsSnapshot.empty) {
      logAlways('No pending or processing activations found');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: 0,
        message: 'No activations to process'
      }));
      return;
    }

    logAlways(`Found ${activationsSnapshot.size} activations to process`);

    let processedCount = 0;
    const errors = [];

    for (const activationDoc of activationsSnapshot.docs) {
      try {
        await processSingleActivation(activationDoc.id, isProduction);
        processedCount++;
      } catch (error) {
        logger.error('[ProcessSequenceActivations] Failed to process activation:', activationDoc.id, error);
        errors.push({
          activationId: activationDoc.id,
          error: error.message
        });
      }
    }

    logAlways(`Complete. Processed: ${processedCount}, Errors: ${errors.length}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: processedCount,
      errors: errors.length,
      errorDetails: errors
    }));

  } catch (error) {
    logger.error('[ProcessSequenceActivations] Fatal error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

async function processSingleActivation(activationId, isProduction) {
  const activationRef = db.collection('sequenceActivations').doc(activationId);
  const logAlways = (msg) => logger.log(`[ProcessSequenceActivations] [${new Date().toISOString()}] ${msg}`);

  logAlways(`Processing activation: ${activationId}`);

  try {
    const claimResult = await db.runTransaction(async (transaction) => {
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
            logger.log(`[ProcessSequenceActivations] Activation ${activationId} already being processed`);
          }
          return { shouldProcess: false, reason: 'already_processing' };
        } else {
          if (!isProduction) {
            logger.warn(`[ProcessSequenceActivations] Activation ${activationId} is stale, re-claiming`);
          }
        }
      } else if (currentStatus === 'completed') {
        if (!isProduction) {
          logger.log(`[ProcessSequenceActivations] Activation ${activationId} already completed`);
        }
        return { shouldProcess: false, reason: 'already_completed' };
      }

      // Claim the activation
      transaction.update(activationRef, {
        status: 'processing',
        processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: admin.firestore.FieldValue.increment(1)
      });

      return { shouldProcess: true, reason: 'claimed' };
    });

    if (!claimResult || claimResult.shouldProcess === false) {
      if (!isProduction) {
        logger.log(`[ProcessSequenceActivations] Skipping activation ${activationId}: ${claimResult?.reason || 'unknown'}`);
      }
      return;
    }

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
      logger.log(`[ProcessSequenceActivations] Processing ${remainingContacts.length} contacts for activation ${activationId}`);
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
          logger.error(`[ProcessSequenceActivations] Failed to load contact ${contactId}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls
    const validContacts = contactsData.filter(c => c !== null);

    // Create scheduled emails ONLY for the FIRST step (step 0)
    // Future steps will be created after previous steps are sent
    const emailsToCreate = [];
    const failedContactIds = [];

    // Find the first auto-email step
    let firstAutoEmailStep = null;
    let firstAutoEmailStepIndex = -1;

    for (let i = 0; i < (sequence.steps?.length || 0); i++) {
      if (sequence.steps[i].type === 'auto-email') {
        firstAutoEmailStep = sequence.steps[i];
        firstAutoEmailStepIndex = i;
        break;
      }
    }

    if (!firstAutoEmailStep) {
      logAlways(`[ProcessSequenceActivations] No auto-email steps found in sequence ${data.sequenceId} - checking for tasks`);
      // Do not return early, proceed to task creation
    }

    if (firstAutoEmailStep) {
      // Determine default AI mode for this step (Standard vs HTML).
      // We look at step.data.aiMode first (set by sequence-builder preview),
      // then fall back to standard so emails default to NEPQ-style plain emails.
      const defaultAiMode =
        firstAutoEmailStep.data?.aiMode ||
        firstAutoEmailStep.emailSettings?.aiMode ||
        'standard';

      for (const contact of validContacts) {
        if (!contact.email) {
          failedContactIds.push(contact.id);
          continue;
        }

        // Create email ONLY for the first auto-email step
        const step = firstAutoEmailStep;
        const stepIndex = firstAutoEmailStepIndex;

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
          aiMode: defaultAiMode,
          // CRITICAL: Set ownership fields for Firestore rules compliance
          // Fallback to unassigned if ownerId/userId not provided
          ownerId: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          assignedTo: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          createdBy: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Write emails in batches
      if (emailsToCreate.length > 0) {
        logAlways(`Creating ${emailsToCreate.length} emails for activation ${activationId}`);
        for (let i = 0; i < emailsToCreate.length; i += BATCH_SIZE) {
          const chunk = emailsToCreate.slice(i, i + BATCH_SIZE);
          const batch = db.batch();

          chunk.forEach(email => {
            const ref = db.collection('emails').doc(email.id);
            batch.set(ref, email);
          });

          await batch.commit();
          logAlways(`Created ${chunk.length} emails (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        }
      } else {
        logAlways(`No emails to create for activation ${activationId} (all contacts missing email or no email steps)`);
      }
    }

    // CREATE TASKS for FIRST non-email step only (progressive task creation like emails)
    const tasksToCreate = [];

    // Find the first task-type step (non-email)
    let firstTaskStep = null;
    let firstTaskStepIndex = -1;
    let cumulativeDelayMs = 0;

    for (let stepIndex = 0; stepIndex < (sequence.steps?.length || 0); stepIndex++) {
      const step = sequence.steps[stepIndex];

      // Skip paused steps
      if (step.paused) continue;

      // Calculate cumulative delay
      cumulativeDelayMs += (step.delayMinutes || 0) * 60 * 1000;

      // Check if this is a task-type step
      const isTaskStep = ['phone-call', 'li-connect', 'li-message', 'li-view-profile', 'li-interact-post', 'task'].includes(step.type);

      if (isTaskStep) {
        firstTaskStep = step;
        firstTaskStepIndex = stepIndex;
        break; // Only create the FIRST task
      }
    }

    // Create the first task for each contact
    if (firstTaskStep) {
      for (const contact of validContacts) {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dueTimestamp = Date.now() + cumulativeDelayMs;
        const dueDate = new Date(dueTimestamp);

        // Determine task type and title
        let taskType = firstTaskStep.type;
        let taskTitle = firstTaskStep.data?.note || firstTaskStep.name || firstTaskStep.label || '';

        if (firstTaskStep.type === 'phone-call') {
          taskType = 'phone-call';
          taskTitle = taskTitle || 'Call contact';
        } else if (firstTaskStep.type === 'li-connect') {
          taskType = 'linkedin-connect';
          taskTitle = taskTitle || 'Connect on LinkedIn';
        } else if (firstTaskStep.type === 'li-message') {
          taskType = 'linkedin-message';
          taskTitle = taskTitle || 'Send LinkedIn message';
        } else if (firstTaskStep.type === 'li-view-profile') {
          taskType = 'linkedin-view';
          taskTitle = taskTitle || 'View LinkedIn profile';
        } else if (firstTaskStep.type === 'li-interact-post') {
          taskType = 'linkedin-interact';
          taskTitle = taskTitle || 'Interact with LinkedIn post';
        } else {
          taskType = 'task';
          taskTitle = taskTitle || 'Complete task';
        }

        tasksToCreate.push({
          id: taskId,
          title: taskTitle,
          contact: contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : contact.name || '',
          contactId: contact.id,
          account: contact.company || contact.companyName || '',
          type: taskType,
          priority: firstTaskStep.data?.priority || 'sequence',
          dueDate: dueDate.toLocaleDateString(),
          dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          dueTimestamp: dueTimestamp,
          status: 'pending',
          sequenceId: data.sequenceId,
          sequenceName: sequence.name,
          stepId: firstTaskStep.id,
          stepIndex: firstTaskStepIndex,
          isSequenceTask: true,
          notes: firstTaskStep.data?.note || '',
          // CRITICAL: Set ownership fields for Firestore rules compliance
          // Fallback to unassigned if ownerId/userId not provided
          ownerId: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          assignedTo: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          createdBy: (data.ownerId || data.userId || 'unassigned').toLowerCase().trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // Write tasks in batches
    if (tasksToCreate.length > 0) {
      logAlways(`Creating ${tasksToCreate.length} first-step tasks for activation ${activationId}`);
      for (let i = 0; i < tasksToCreate.length; i += BATCH_SIZE) {
        const chunk = tasksToCreate.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        chunk.forEach(task => {
          const ref = db.collection('tasks').doc(task.id);
          batch.set(ref, task);
        });

        await batch.commit();
        logAlways(`Created ${chunk.length} first-step tasks (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
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

    logAlways(`Updated activation ${activationId}: ${newProcessedCount}/${contactIds.length} contacts, ${emailsToCreate.length} emails created, status: ${isDone ? 'completed' : 'processing'}`);

  } catch (error) {
    logger.error(`[ProcessSequenceActivations] Error processing activation ${activationId}:`, error);

    // Update status to failed
    try {
      await activationRef.update({
        status: 'failed',
        errorMessage: error.message,
        processingStartedAt: admin.firestore.FieldValue.delete(),
        failedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (updateError) {
      logger.error(`[ProcessSequenceActivations] Failed to update error status:`, updateError);
    }

    throw error;
  }
}
