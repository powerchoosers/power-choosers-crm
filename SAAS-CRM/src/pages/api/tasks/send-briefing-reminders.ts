import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';
import { render } from '@react-email/render';
import BriefingReminder from '../../../emails/BriefingReminder';
import React from 'react';
import { format, parseISO } from 'date-fns';

/**
 * POST /api/tasks/send-briefing-reminders
 *
 * Called by Supabase pg_cron every 5 minutes (Mon–Fri 13–23 UTC).
 * For each briefing task with `reminders` containing 60 or 15:
 *   - 60 min window: send reminder email to contact + UI notification to agent
 *   - 15 min window: UI notification to agent only
 * Deduplication: tracks sent intervals in metadata.sentReminderMinutes
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Auth: accept cron secret OR service role
    const secret = req.headers['x-cron-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    const validSecret = process.env.CRON_SECRET || 'nodal-cron-2026';
    if (secret !== validSecret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const results = { processed: 0, emailed: 0, notified: 0, errors: [] as string[] };

    try {
        const now = new Date();

        // Fetch all pending BRIEFING tasks with calendar invites that haven't fully fired reminders
        const { data: tasks, error } = await supabaseAdmin
            .from('tasks')
            .select('id, title, dueDate, ownerId, contactId, accountId, metadata, reminders')
            .eq('priority', 'BRIEFING')
            .eq('status', 'Pending')
            .gt('dueDate', now.toISOString())
            .lte('dueDate', new Date(now.getTime() + 70 * 60 * 1000).toISOString()); // max 70 min ahead

        if (error) throw error;
        if (!tasks?.length) {
            res.status(200).json({ ...results, message: 'No upcoming briefings' });
            return;
        }

        const zohoService = new ZohoMailService();

        for (const task of tasks) {
            if (!task.metadata?.syncCalendar) continue;

            const dueMs = new Date(task.dueDate).getTime();
            const nowMs = now.getTime();
            const minutesUntilDue = (dueMs - nowMs) / (1000 * 60);

            const taskReminders: number[] = Array.isArray(task.reminders) ? task.reminders : [15, 60];
            const sentReminders: number[] = Array.isArray(task.metadata?.sentReminderMinutes)
                ? task.metadata.sentReminderMinutes
                : [];

            // Determine which reminder windows fire now (±2.5 min tolerance on a 5-min cron)
            const windowsToFire = taskReminders.filter(mins => {
                if (sentReminders.includes(mins)) return false; // already sent
                return minutesUntilDue >= mins - 2.5 && minutesUntilDue <= mins + 2.5;
            });

            if (!windowsToFire.length) continue;
            results.processed++;

            // Fetch contact (including all phone fields + preferred field)
            const { data: contact } = await supabaseAdmin
                .from('contacts')
                .select('firstName, lastName, email, accountId, mobile, workDirectPhone, otherPhone, companyPhone, primaryPhoneField')
                .eq('id', task.contactId)
                .single();

            // Fetch agent
            const { data: agent } = await supabaseAdmin
                .from('users')
                .select('first_name, last_name, name, job_title, settings, hosted_photo_url')
                .eq('email', task.ownerId)
                .single();

            const agentSettings = agent?.settings || {};
            const sender = {
                name: (agent?.first_name && agent?.last_name)
                    ? `${agent.first_name} ${agent.last_name}`
                    : agent?.name || task.ownerId,
                title: agent?.job_title || agentSettings.jobTitle || 'Nodal Point Architect',
                phone: agentSettings.selectedPhoneNumber || agentSettings.twilioNumbers?.[0]?.number || '+1 (817) 754-0695',
                email: task.ownerId,
                city: agentSettings.city || 'Fort Worth',
                state: agentSettings.state || 'TX',
                avatarUrl: agent?.hosted_photo_url || agentSettings.avatar_url || 'https://nodalpoint.io/images/staff/lewis-patterson.png',
            };

            // Resolve company name
            let companyName = 'Your Organization';
            const accountId = contact?.accountId || task.accountId;
            if (accountId) {
                const { data: account } = await supabaseAdmin
                    .from('accounts')
                    .select('name')
                    .eq('id', accountId)
                    .single();
                if (account?.name) companyName = account.name;
            }

            const taskType = task.metadata?.taskType || 'Call';
            const videoCallUrl: string = task.metadata?.videoCallUrl || '';

            // Resolve contact's preferred phone number (starred in dossier uplink)
            const preferredField = (contact as any)?.primaryPhoneField || 'mobile';
            const contactPreferredPhone: string =
                (contact as any)?.[preferredField] ||
                (contact as any)?.mobile ||
                (contact as any)?.workDirectPhone ||
                (contact as any)?.companyPhone ||
                '';
            const contactName = contact
                ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Valued Contact'
                : 'Valued Contact';

            // Format display time in Chicago timezone
            const apptDate = parseISO(task.dueDate);
            const chicagoStr = apptDate.toLocaleString('en-US', { timeZone: 'America/Chicago' });
            const chicagoDate = new Date(chicagoStr);
            const apptDateStr = format(chicagoDate, 'EEEE, MMMM do, yyyy');
            const apptTimeStr = format(chicagoDate, 'h:mm a');

            const newSentReminders = [...sentReminders];

            for (const mins of windowsToFire) {
                try {
                    // 60-minute window: send reminder email to contact
                    if (mins === 60 && contact?.email) {
                        const emailHtml = await render(
                            React.createElement(BriefingReminder, {
                                contactName,
                                companyName,
                                appointmentDate: apptDateStr,
                                appointmentTime: apptTimeStr,
                                taskType,
                                meetingUrl: videoCallUrl || undefined,
                                contactPreferredPhone: contactPreferredPhone || undefined,
                                sender,
                            })
                        );

                        await zohoService.sendEmail({
                            to: contact.email,
                            fromName: sender.name,
                            subject: `Reminder: your meeting starts in 1 hour — ${apptTimeStr}`,
                            html: emailHtml,
                            userEmail: task.ownerId,
                            uploadedAttachments: [],
                        });
                        results.emailed++;

                        // Log to emails table
                        try {
                            const sentAt = new Date().toISOString();
                            await supabaseAdmin.from('emails').insert({
                                id: `reminder_60_${task.id}_${Date.now()}`,
                                contactId: task.contactId,
                                accountId: accountId || null,
                                from: task.ownerId,
                                to: JSON.stringify([contact.email]),
                                subject: `Reminder: your meeting starts in 1 hour — ${apptTimeStr}`,
                                html: emailHtml,
                                text: '',
                                status: 'sent',
                                type: 'sent',
                                timestamp: sentAt,
                                sentAt,
                                createdAt: sentAt,
                                updatedAt: sentAt,
                                ownerId: task.ownerId,
                                metadata: { reminderEmail: true, reminderMinutes: 60, taskId: task.id },
                            });
                        } catch { /* non-fatal */ }
                    }

                    // UI notification for agent (both 60 min and 15 min)
                    const label = mins === 60 ? '1 hour' : '15 minutes';
                    const notifTitle = mins === 60
                        ? `Meeting in 1 Hour — ${contactName}`
                        : `Meeting in 15 Minutes — ${contactName}`;
                    const notifMessage = `${taskType} with ${contactName} at ${companyName} starts at ${apptTimeStr}.`;

                    await supabaseAdmin.from('notifications').insert({
                        id: crypto.randomUUID(),
                        ownerId: task.ownerId,
                        title: notifTitle,
                        message: notifMessage,
                        type: 'reminder',
                        read: false,
                        data: {
                            taskId: task.id,
                            contactName,
                            companyName,
                            reminderMinutes: mins,
                            label,
                            taskType,
                            videoCallUrl: videoCallUrl || null,
                            appointmentTime: apptTimeStr,
                        },
                    });
                    results.notified++;

                    newSentReminders.push(mins);
                } catch (err: any) {
                    results.errors.push(`Task ${task.id} @ ${mins}min: ${err.message}`);
                }
            }

            // Update task metadata with sent reminder log
            if (newSentReminders.length > sentReminders.length) {
                await supabaseAdmin
                    .from('tasks')
                    .update({
                        metadata: { ...task.metadata, sentReminderMinutes: newSentReminders },
                        updatedAt: new Date().toISOString(),
                    })
                    .eq('id', task.id);
            }
        }

        res.status(200).json({ ...results, message: 'Reminder sweep complete' });
    } catch (err: any) {
        console.error('[send-briefing-reminders] Fatal:', err);
        res.status(500).json({ error: err.message });
    }
}
