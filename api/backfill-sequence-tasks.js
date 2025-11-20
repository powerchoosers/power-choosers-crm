import admin from 'firebase-admin';
import { db } from './_firebase.js';

/**
 * Backfill script to create next tasks for existing sequence members
 * Run this once after deploying the progressive task creation feature
 * 
 * This script:
 * 1. Finds all active sequence members
 * 2. Checks their current progress (based on sent emails)
 * 3. Creates the next task if they're waiting for one
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

    const logAlways = (msg) => console.log(`[BackfillSequenceTasks] [${new Date().toISOString()}] ${msg}`);

    try {
        if (!db) {
            console.error('[BackfillSequenceTasks] Firestore not initialized');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Firebase Admin not initialized'
            }));
            return;
        }

        const { dryRun } = req.body || {};
        const isDryRun = dryRun === true;

        logAlways(`Starting backfill - Dry run: ${isDryRun}`);

        // Get all sequences
        const sequencesSnapshot = await db.collection('sequences').get();
        const sequences = [];
        sequencesSnapshot.forEach(doc => {
            sequences.push({ id: doc.id, ...doc.data() });
        });

        logAlways(`Found ${sequences.length} sequences`);

        // Get all sequence members
        const membersSnapshot = await db.collection('sequenceMembers').get();
        const members = [];
        membersSnapshot.forEach(doc => {
            members.push({ id: doc.id, ...doc.data() });
        });

        logAlways(`Found ${members.length} sequence members`);

        // Get all emails to determine current progress
        const emailsSnapshot = await db.collection('emails')
            .where('type', '==', 'scheduled')
            .get();

        const emailsBySequenceAndContact = new Map();
        emailsSnapshot.forEach(doc => {
            const email = { id: doc.id, ...doc.data() };
            if (email.sequenceId && email.contactId) {
                const key = `${email.sequenceId}_${email.contactId}`;
                if (!emailsBySequenceAndContact.has(key)) {
                    emailsBySequenceAndContact.set(key, []);
                }
                emailsBySequenceAndContact.get(key).push(email);
            }
        });

        logAlways(`Found ${emailsSnapshot.size} sequence emails`);

        // Get all existing tasks to avoid duplicates
        const tasksSnapshot = await db.collection('tasks')
            .where('isSequenceTask', '==', true)
            .get();

        const existingTaskKeys = new Set();
        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            if (task.sequenceId && task.contactId && task.stepIndex !== undefined) {
                const key = `${task.sequenceId}_${task.contactId}_${task.stepIndex}`;
                existingTaskKeys.add(key);
            }
        });

        logAlways(`Found ${existingTaskKeys.size} existing sequence tasks`);

        const tasksToCreate = [];
        const skipped = [];

        // Process each sequence member
        for (const member of members) {
            const sequence = sequences.find(s => s.id === member.sequenceId);
            if (!sequence || !sequence.steps || sequence.steps.length === 0) {
                skipped.push({ memberId: member.id, reason: 'Sequence not found or has no steps' });
                continue;
            }

            // Get emails for this member
            const memberKey = `${member.sequenceId}_${member.targetId}`;
            const memberEmails = emailsBySequenceAndContact.get(memberKey) || [];

            // Determine current step based on highest sent email
            let currentStepIndex = -1;
            const now = Date.now();

            memberEmails.forEach(email => {
                const stepIndex = email.stepIndex || 0;
                const status = email.status || '';
                const scheduledTime = email.scheduledSendTime || 0;

                let scheduledTimeMs = scheduledTime;
                if (scheduledTime && typeof scheduledTime.toDate === 'function') {
                    scheduledTimeMs = scheduledTime.toDate().getTime();
                } else if (typeof scheduledTime === 'object' && scheduledTime.seconds) {
                    scheduledTimeMs = scheduledTime.seconds * 1000;
                }

                // Step is "reached" if email was sent or is due now
                if (status === 'sent' || (scheduledTimeMs <= now && status !== 'rejected' && status !== 'cancelled')) {
                    if (stepIndex > currentStepIndex) {
                        currentStepIndex = stepIndex;
                    }
                }
            });

            // Find the next step that should have a task
            let nextTaskStepIndex = -1;
            let nextTaskStep = null;
            let cumulativeDelayMs = 0;

            for (let i = currentStepIndex + 1; i < sequence.steps.length; i++) {
                const step = sequence.steps[i];

                // Skip paused steps
                if (step.paused) continue;

                // Calculate cumulative delay
                cumulativeDelayMs += (step.delayMinutes || 0) * 60 * 1000;

                // Check if this is a task step
                const isTaskStep = ['phone-call', 'li-connect', 'li-message', 'li-view-profile', 'li-interact-post', 'task'].includes(step.type);

                if (isTaskStep) {
                    nextTaskStepIndex = i;
                    nextTaskStep = step;
                    break; // Found the next task
                } else if (step.type === 'auto-email' || step.type === 'manual-email') {
                    // If next step is an email, check if it exists
                    const nextEmailExists = memberEmails.some(e => (e.stepIndex || 0) === i);
                    if (!nextEmailExists) {
                        // Email step exists but no email created - sequence is stuck, skip
                        skipped.push({
                            memberId: member.id,
                            contactId: member.targetId,
                            sequenceId: member.sequenceId,
                            reason: `Waiting for email step ${i} to be created`
                        });
                        break;
                    }
                    // Email exists, continue to next step
                    continue;
                }
            }

            // If no task step found, skip
            if (!nextTaskStep) {
                skipped.push({
                    memberId: member.id,
                    contactId: member.targetId,
                    sequenceId: member.sequenceId,
                    reason: 'No pending task steps'
                });
                continue;
            }

            // Check if task already exists
            const taskKey = `${member.sequenceId}_${member.targetId}_${nextTaskStepIndex}`;
            if (existingTaskKeys.has(taskKey)) {
                skipped.push({
                    memberId: member.id,
                    contactId: member.targetId,
                    sequenceId: member.sequenceId,
                    reason: 'Task already exists'
                });
                continue;
            }

            // Get contact data
            let contact = null;
            try {
                const contactDoc = await db.collection('people').doc(member.targetId).get();
                if (contactDoc.exists) {
                    contact = { id: member.targetId, ...contactDoc.data() };
                } else {
                    const contactDoc2 = await db.collection('contacts').doc(member.targetId).get();
                    if (contactDoc2.exists) {
                        contact = { id: member.targetId, ...contactDoc2.data() };
                    }
                }
            } catch (err) {
                logAlways(`Failed to load contact ${member.targetId}: ${err.message}`);
            }

            if (!contact) {
                skipped.push({
                    memberId: member.id,
                    contactId: member.targetId,
                    sequenceId: member.sequenceId,
                    reason: 'Contact not found'
                });
                continue;
            }

            // Calculate due time
            const memberStartTime = member.createdAt && member.createdAt.toDate ?
                member.createdAt.toDate().getTime() : Date.now();
            const dueTimestamp = memberStartTime + cumulativeDelayMs;
            const dueDate = new Date(dueTimestamp);

            // Determine task type and title
            let taskType = nextTaskStep.type;
            let taskTitle = nextTaskStep.data?.note || nextTaskStep.name || nextTaskStep.label || '';

            if (nextTaskStep.type === 'phone-call') {
                taskType = 'phone-call';
                taskTitle = taskTitle || 'Call contact';
            } else if (nextTaskStep.type === 'li-connect') {
                taskType = 'linkedin-connect';
                taskTitle = taskTitle || 'Connect on LinkedIn';
            } else if (nextTaskStep.type === 'li-message') {
                taskType = 'linkedin-message';
                taskTitle = taskTitle || 'Send LinkedIn message';
            } else if (nextTaskStep.type === 'li-view-profile') {
                taskType = 'linkedin-view';
                taskTitle = taskTitle || 'View LinkedIn profile';
            } else if (nextTaskStep.type === 'li-interact-post') {
                taskType = 'linkedin-interact';
                taskTitle = taskTitle || 'Interact with LinkedIn post';
            } else {
                taskType = 'task';
                taskTitle = taskTitle || 'Complete task';
            }

            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            tasksToCreate.push({
                id: taskId,
                title: taskTitle,
                contact: contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : contact.name || '',
                contactId: contact.id,
                account: contact.company || contact.companyName || '',
                type: taskType,
                priority: nextTaskStep.data?.priority || 'normal',
                dueDate: dueDate.toLocaleDateString(),
                dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                dueTimestamp: dueTimestamp,
                status: 'pending',
                sequenceId: member.sequenceId,
                sequenceName: sequence.name,
                stepId: nextTaskStep.id,
                stepIndex: nextTaskStepIndex,
                isSequenceTask: true,
                notes: nextTaskStep.data?.note || '',
                ownerId: member.ownerId,
                assignedTo: member.ownerId,
                createdBy: member.ownerId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                backfilled: true // Mark as backfilled for tracking
            });
        }

        logAlways(`Tasks to create: ${tasksToCreate.length}, Skipped: ${skipped.length}`);

        // Create tasks if not dry run
        if (!isDryRun && tasksToCreate.length > 0) {
            const BATCH_SIZE = 25;
            for (let i = 0; i < tasksToCreate.length; i += BATCH_SIZE) {
                const chunk = tasksToCreate.slice(i, i + BATCH_SIZE);
                const batch = db.batch();

                chunk.forEach(task => {
                    const ref = db.collection('tasks').doc(task.id);
                    batch.set(ref, task);
                });

                await batch.commit();
                logAlways(`Created batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} tasks)`);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            dryRun: isDryRun,
            tasksToCreate: tasksToCreate.length,
            skipped: skipped.length,
            skippedReasons: skipped.slice(0, 10), // Show first 10 skipped for debugging
            message: isDryRun ?
                `Dry run complete. Would create ${tasksToCreate.length} tasks.` :
                `Backfill complete. Created ${tasksToCreate.length} tasks.`
        }));

    } catch (error) {
        console.error('[BackfillSequenceTasks] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: error.message
        }));
    }
}
