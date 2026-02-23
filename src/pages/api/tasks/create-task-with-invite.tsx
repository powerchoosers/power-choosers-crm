import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';
import { render } from '@react-email/render';
import ForensicInvite from '../../../emails/ForensicInvite';
import React from 'react';
import { NextApiRequest, NextApiResponse } from 'next';
import { format, addHours, parseISO } from 'date-fns';
import { requireUser } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let authData = await requireUser(req);
        let userEmail = authData.email;
        let userId = authData.id;

        // Fallback: If token-based auth fails, trust the provided userEmail from body 
        // (Consistent with zoho-send.js pattern in this codebase)
        if (!userEmail && req.body.userEmail) {
            userEmail = req.body.userEmail;
            console.log('[Create Task Invite] Falling back to provided email:', userEmail);

            // Verify user exists in DB
            const { data: dbUser } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', userEmail)
                .single();

            if (dbUser) {
                userId = dbUser.id;
            }
        }

        if (!userEmail) {
            res.status(401).json({ error: 'Unauthorized', details: 'No valid identity found' });
            return;
        }

        const taskData = req.body;
        const {
            title,
            description,
            priority,
            status,
            dueDate,
            contactId,
            accountId,
            relatedTo,
            relatedType,
            metadata
        } = taskData;

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        // 1. Create Task in Supabase
        const { data: task, error: taskError } = await supabaseAdmin
            .from('tasks')
            .insert([{
                id,
                title,
                description,
                priority,
                status,
                dueDate,
                contactId,
                accountId,
                ownerId: userEmail,
                metadata,
                createdAt: now,
                updatedAt: now
            }])
            .select()
            .single();

        if (taskError) {
            console.error('[Create Task Invite] Database error:', taskError);
            throw taskError;
        }

        // 2. If calendar invite requested, send email
        if (metadata?.syncCalendar && contactId) {
            // Fetch contact details
            const { data: contact } = await supabaseAdmin
                .from('contacts')
                .select('firstName, lastName, email, accountId')
                .eq('id', contactId)
                .single();

            if (contact && contact.email) {
                // Fetch sender (agent) details
                const { data: agent } = await supabaseAdmin
                    .from('users')
                    .select('*')
                    .eq('email', userEmail)
                    .single();

                const agentSettings = agent?.settings || {};
                const sender = {
                    name: (agent?.first_name && agent?.last_name) ? `${agent.first_name} ${agent.last_name}` : (agent?.name || agentSettings.name || userEmail),
                    title: agent?.job_title || agentSettings.jobTitle || 'Nodal Point Architect',
                    phone: agentSettings.selectedPhoneNumber || (agentSettings.twilioNumbers?.[0]?.number) || '+1 (817) 754-0695',
                    email: userEmail,
                    city: agentSettings.city || 'Fort Worth',
                    state: agentSettings.state || 'TX',
                    avatarUrl: agent?.hosted_photo_url || agentSettings.avatar_url || 'https://nodalpoint.io/images/staff/lewis-patterson.png'
                };

                const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Valued Contact';
                const apptDate = parseISO(dueDate);
                const apptDateStr = format(apptDate, 'EEEE, MMMM do, yyyy');
                const apptTimeStr = format(apptDate, 'h:mm a');

                // Generate ICS
                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//Nodal Point//CRM//EN',
                    'METHOD:REQUEST',
                    'CALSCALE:GREGORIAN',
                    'BEGIN:VEVENT',
                    `UID:${task.id}`,
                    `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
                    `DTSTART:${format(apptDate, "yyyyMMdd'T'HHmmss'Z'")}`,
                    `DTEND:${format(addHours(apptDate, 1), "yyyyMMdd'T'HHmmss'Z'")}`,
                    `SUMMARY:Energy Briefing // ${contactName}`,
                    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
                    'LOCATION:Remote (Nodal Point Forensic Engine)',
                    `ORGANIZER;CN="${sender.name}":MAILTO:${sender.email}`,
                    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${contactName}":MAILTO:${contact.email}`,
                    'SEQUENCE:0',
                    'STATUS:CONFIRMED',
                    'TRANSP:OPAQUE',
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].join('\r\n');

                const zohoService = new ZohoMailService();

                // 1. Upload the ICS attachment first (Zoho requires pre-upload for sent items)
                let uploadedAttachments: any[] = [];
                try {
                    const uploadResult = await zohoService.uploadAttachment(
                        userEmail,
                        Buffer.from(icsContent),
                        'invite.ics'
                    );
                    if (uploadResult) {
                        uploadedAttachments.push(uploadResult);
                    }
                } catch (uploadError) {
                    console.error('[Create Task Invite] Attachment upload failed:', uploadError);
                    // Continue without attachment if upload fails? Or fail? Probably fail to be safe.
                    throw new Error('Signal Interrupted: Failed to uplink calendar payload');
                }

                const emailHtml = await render(
                    <ForensicInvite
                        contactName={contactName}
                        companyName={relatedTo || 'Your Organization'}
                        appointmentDate={apptDateStr}
                        appointmentTime={apptTimeStr}
                        description={description}
                        operationalVector={(metadata?.taskType || 'Meeting').toUpperCase()}
                        sender={sender}
                    />
                );

                await zohoService.sendEmail({
                    to: contact.email,
                    subject: `Energy Briefing Invite // ${contactName}`,
                    html: emailHtml,
                    userEmail: userEmail,
                    uploadedAttachments: uploadedAttachments
                });
            }
        }

        res.status(200).json({ success: true, task });
    } catch (error: any) {
        console.error('[Create Task Invite] Error:', error);
        res.status(500).json({ error: error.message });
    }
}
