import admin from 'firebase-admin';
import { db } from './_firebase.js';
import logger from './_logger.js';

/**
 * API endpoint to handle task completion and create next sequence step
 * Called when a user marks a sequence task as complete
 * Creates the next step (task or email) in the sequence
 */
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

    const logAlways = (msg) => logger.log(`[CompleteSequenceTask] [${new Date().toISOString()}] ${msg}`);

    try {
        if (!db) {
            logger.error('[CompleteSequenceTask] Firestore not initialized');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Firebase Admin not initialized'
            }));
            return;
        }

        const { taskId } = req.body || {};

        if (!taskId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'taskId is required' }));
            return;
        }

        logAlways(`Processing completed task: ${taskId}`);

        // Get the task document
        const taskDoc = await db.collection('tasks').doc(taskId).get();

        if (!taskDoc.exists) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
        }

        const task = taskDoc.data();

        // Only process if it's a sequence task
        if (!task.isSequenceTask || !task.sequenceId || task.stepIndex === undefined) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Not a sequence task, no next step to create'
            }));
            return;
        }

        logAlways(`Task is part of sequence ${task.sequenceId}, step ${task.stepIndex}`);

        // CRITICAL FIX: Check if contact is still a member of the sequence before creating next step
        // This prevents creating next steps for contacts that were removed from the sequence
        const contactId = task.contactId;
        if (contactId) {
            const memberQuery = await db.collection('sequenceMembers')
                .where('sequenceId', '==', task.sequenceId)
                .where('targetId', '==', contactId)
                .limit(1)
                .get();

            if (memberQuery.empty) {
                logAlways(`Contact ${contactId} is no longer a member of sequence ${task.sequenceId}, skipping next step creation`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Contact removed from sequence - no next step created'
                }));
                return;
            }
            logAlways(`Contact ${contactId} is still a member of sequence ${task.sequenceId}, proceeding with next step`);
        }

        // Load the sequence
        const sequenceDoc = await db.collection('sequences').doc(task.sequenceId).get();

        if (!sequenceDoc.exists) {
            throw new Error(`Sequence ${task.sequenceId} not found`);
        }

        const sequence = sequenceDoc.data();
        const currentStepIndex = task.stepIndex;

        // Find the next non-paused step after current step
        let nextStep = null;
        let nextStepIndex = -1;
        let cumulativeDelayMs = 0;

        for (let i = currentStepIndex + 1; i < (sequence.steps?.length || 0); i++) {
            const step = sequence.steps[i];

            // Skip paused steps
            if (step.paused) continue;

            // Add delay for this step
            cumulativeDelayMs += (step.delayMinutes || 0) * 60 * 1000;

            nextStep = step;
            nextStepIndex = i;
            break; // Found the next step
        }

        if (!nextStep) {
            logAlways(`No more steps in sequence for task ${taskId}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Sequence completed - no more steps'
            }));
            return;
        }

        logAlways(`Next step found: index ${nextStepIndex}, type: ${nextStep.type}, delay: ${cumulativeDelayMs}ms`);

        // Load contact data
        const contactDoc = await db.collection('people').doc(task.contactId).get();
        let contact = null;

        if (contactDoc.exists) {
            contact = { id: task.contactId, ...contactDoc.data() };
        } else {
            // Try contacts collection as fallback
            const contactDoc2 = await db.collection('contacts').doc(task.contactId).get();
            if (contactDoc2.exists) {
                contact = { id: task.contactId, ...contactDoc2.data() };
            }
        }

        if (!contact) {
            throw new Error(`Contact ${task.contactId} not found`);
        }

        const scheduledTime = Date.now() + cumulativeDelayMs;
        const dueDate = new Date(scheduledTime);

        // Create next step based on type
        if (nextStep.type === 'auto-email' || nextStep.type === 'manual-email') {
            // CREATE EMAIL
            if (!contact.email) {
                logAlways(`Contact ${task.contactId} has no email, skipping email step`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Contact has no email, email step skipped'
                }));
                return;
            }

            const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const defaultAiMode = nextStep.data?.aiMode || nextStep.emailSettings?.aiMode || 'standard';

            const emailData = {
                id: emailId,
                type: 'scheduled',
                status: 'not_generated',
                scheduledSendTime: scheduledTime,
                contactId: contact.id,
                contactName: contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : contact.name,
                contactCompany: contact.company || contact.companyName || '',
                to: contact.email,
                sequenceId: task.sequenceId,
                sequenceName: sequence.name,
                stepIndex: nextStepIndex,
                totalSteps: sequence.steps?.length || 1,
                aiPrompt: nextStep.emailSettings?.aiPrompt || nextStep.data?.aiPrompt || nextStep.aiPrompt || 'Write a professional email',
                aiMode: defaultAiMode,
                // CRITICAL: Set ownership fields for Firestore rules compliance
                // Fallback to admin if task.ownerId not provided
                ownerId: (task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                assignedTo: (task.assignedTo || task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                createdBy: (task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('emails').doc(emailId).set(emailData);

            logAlways(`Created email ${emailId} for next step (stepIndex: ${nextStepIndex})`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                nextStepType: 'email',
                emailId: emailId,
                scheduledTime: scheduledTime
            }));

        } else {
            // CREATE TASK (phone-call, LinkedIn, etc.)
            const newTaskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Determine task type and title
            let taskType = nextStep.type;
            let taskTitle = nextStep.data?.note || nextStep.name || nextStep.label || '';

            if (nextStep.type === 'phone-call') {
                taskType = 'phone-call';
                taskTitle = taskTitle || 'Call contact';
            } else if (nextStep.type === 'li-connect') {
                taskType = 'linkedin-connect';
                taskTitle = taskTitle || 'Connect on LinkedIn';
            } else if (nextStep.type === 'li-message') {
                taskType = 'linkedin-message';
                taskTitle = taskTitle || 'Send LinkedIn message';
            } else if (nextStep.type === 'li-view-profile') {
                taskType = 'linkedin-view';
                taskTitle = taskTitle || 'View LinkedIn profile';
            } else if (nextStep.type === 'li-interact-post') {
                taskType = 'linkedin-interact';
                taskTitle = taskTitle || 'Interact with LinkedIn post';
            } else {
                taskType = 'task';
                taskTitle = taskTitle || 'Complete task';
            }

            const newTaskData = {
                id: newTaskId,
                title: taskTitle,
                contact: contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : contact.name || '',
                contactId: contact.id,
                account: contact.company || contact.companyName || '',
                type: taskType,
                priority: nextStep.data?.priority || 'sequence',
                dueDate: dueDate.toLocaleDateString(),
                dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                dueTimestamp: scheduledTime,
                status: 'pending',
                sequenceId: task.sequenceId,
                sequenceName: sequence.name,
                stepId: nextStep.id,
                stepIndex: nextStepIndex,
                isSequenceTask: true,
                notes: nextStep.data?.note || '',
                // CRITICAL: Set ownership fields for Firestore rules compliance
                // Fallback to admin if task.ownerId not provided
                ownerId: (task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                assignedTo: (task.assignedTo || task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                createdBy: (task.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('tasks').doc(newTaskId).set(newTaskData);

            logAlways(`Created task ${newTaskId} for next step (stepIndex: ${nextStepIndex})`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                nextStepType: 'task',
                taskId: newTaskId,
                scheduledTime: scheduledTime
            }));
        }

    } catch (error) {
        logger.error('[CompleteSequenceTask] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: error.message
        }));
    }
}
