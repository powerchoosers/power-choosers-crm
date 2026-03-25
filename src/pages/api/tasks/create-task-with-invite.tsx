import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';
import { render } from '@react-email/render';
import ForensicInvite from '../../../emails/ForensicInvite';
import React from 'react';
import { NextApiRequest, NextApiResponse } from 'next';
import { format, addHours, parseISO } from 'date-fns';
import { requireUser } from '@/lib/supabase';
import { cors } from '../_cors.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (cors(req, res)) return;

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
            manualIntro,
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
                reminders: taskData.reminders || [],
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

            // Fetch true account name
            let targetCompanyName = relatedTo || 'Your Organization';
            const trueAccountId = contact?.accountId || accountId;
            if (trueAccountId) {
                const { data: account } = await supabaseAdmin
                    .from('accounts')
                    .select('name')
                    .eq('id', trueAccountId)
                    .single();
                if (account?.name) {
                    targetCompanyName = account.name;
                }
            }

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

                // Convert UTC → America/Chicago for display + ICS timestamps
                const chicagoStr = apptDate.toLocaleString('en-US', { timeZone: 'America/Chicago' });
                const chicagoDate = new Date(chicagoStr);
                const apptDateStr = format(chicagoDate, 'EEEE, MMMM do, yyyy');
                const apptTimeStr = format(chicagoDate, 'h:mm a');

                // Generate Alarms
                const alarms = (taskData.reminders || []).map((mins: number) => [
                    'BEGIN:VALARM',
                    `TRIGGER:-PT${mins}M`,
                    'ACTION:DISPLAY',
                    'DESCRIPTION:Reminder',
                    'END:VALARM'
                ].join('\r\n')).join('\r\n');

                const nowStr = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
                // URL logic: Video Call uses user-entered link; phone Call uses no link; others fall back to agent settings
                const taskType = metadata?.taskType || '';
                let url = '';
                if (taskType === 'Video Call') {
                    url = metadata?.videoCallUrl || '';
                } else if (taskType !== 'Call') {
                    url = agentSettings.meetingLink || agentSettings.meeting_link || agentSettings.zoomLink || process.env.NEXT_PUBLIC_DEFAULT_MEETING_LINK || '';
                }
                const sequenceCount = metadata?.sequence || 0;
                
                // Format description for both plain text and HTML
                const cleanDesc = (description || '').replace(/\r?\n/g, '\\n');
                const htmlDescription = metadata?.htmlDescription || description || '';
                const cleanHtml = htmlDescription.replace(/\r?\n/g, '<br/>');

                const apptLoc = url ? url : 'Remote (Nodal Point Forensic Engine)';

                // Timezone structure enforcing CST/CDT rules
                const vtimezone = [
                    'BEGIN:VTIMEZONE',
                    'TZID:America/Chicago',
                    'BEGIN:DAYLIGHT',
                    'TZOFFSETFROM:-0600',
                    'TZOFFSETTO:-0500',
                    'DTSTART:19700308T020000',
                    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
                    'END:DAYLIGHT',
                    'BEGIN:STANDARD',
                    'TZOFFSETFROM:-0500',
                    'TZOFFSETTO:-0600',
                    'DTSTART:19701101T020000',
                    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
                    'END:STANDARD',
                    'END:VTIMEZONE'
                ].join('\r\n');

                // Generate ICS
                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'PRODID:-//Nodal Point//CRM//EN',
                    'VERSION:2.0',
                    'X-WR-TIMEZONE:America/Chicago',
                    'CALSCALE:GREGORIAN',
                    'METHOD:REQUEST',
                    vtimezone,
                    'BEGIN:VEVENT',
                    `SUMMARY:Energy Briefing: ${contactName}`,
                    `DESCRIPTION:${cleanDesc}`,
                    `X-ALT-DESC;FMTTYPE=text/html:<!DOCTYPE HTML><HTML><BODY>${cleanHtml}</BODY></HTML>`,
                    `DTSTART;TZID=America/Chicago:${format(chicagoDate, "yyyyMMdd'T'HHmmss")}`,
                    `DTEND;TZID=America/Chicago:${format(addHours(chicagoDate, 1), "yyyyMMdd'T'HHmmss")}`,
                    `LOCATION:${apptLoc || ''}`,
                    url ? `URL:${url}` : '',
                    `UID:${task.id}@nodalpoint.io`,
                    'IMPORTANT:0',
                    'CLASS:PUBLIC',
                    'STATUS:CONFIRMED',
                    'TRANSP:OPAQUE',
                    'PRIORITY:0',
                    `SEQUENCE:${sequenceCount}`,
                    `CREATED:${nowStr}`,
                    `LAST-MODIFIED:${nowStr}`,
                    `DTSTAMP:${nowStr}`,
                    `ORGANIZER;CN=${sender.name}:MAILTO:${sender.email.toLowerCase()}`,
                    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:MAILTO:${contact.email.toLowerCase()}`,
                    'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
                    alarms,
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].filter(Boolean).join('\r\n');

                const zohoService = new ZohoMailService();

                // 2. Upload the ICS attachment (Zoho requires pre-upload for sent items)
                let uploadedAttachments: any[] = [];
                try {
                    const uploadResult = await zohoService.uploadAttachment(
                        userEmail,
                        icsContent,
                        'invite.ics',
                        false // isInline - Zoho only supports images as inline
                    );
                    if (uploadResult) {
                        uploadedAttachments.push(uploadResult);
                    }
                } catch (uploadError: any) {
                    console.error('[Create Task Invite] Attachment upload failed:', uploadError);
                    throw new Error(`Signal Interrupted: Failed to uplink calendar payload. Orbit error: ${uploadError.message}`);
                }

                // Determine base URL for RSVP links
                const protocol = req.headers['x-forwarded-proto'] || 'http';
                const host = req.headers.host;
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

                const emailHtml = await render(
                    <ForensicInvite
                        contactName={contactName}
                        companyName={targetCompanyName}
                        appointmentDate={apptDateStr}
                        appointmentTime={apptTimeStr}
                        description={description}
                        manualIntro={manualIntro}
                        operationalVector={(metadata?.taskType || 'Meeting').toUpperCase()}
                        taskId={task.id}
                        prospectEmail={contact.email}
                        sender={sender}
                        baseUrl={baseUrl}
                        meetingUrl={url || undefined}
                    />
                );

                await zohoService.sendEmail({
                    to: contact.email,
                    fromName: sender.name,
                    subject: `Energy Briefing: ${contactName}`,
                    html: emailHtml,
                    userEmail: userEmail,
                    uploadedAttachments: uploadedAttachments
                });

                // Log the calendar invite email to the emails table
                try {
                    const emailId = `cal_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
                    const sentAt = new Date().toISOString();
                    await supabaseAdmin.from('emails').insert({
                        id: emailId,
                        contactId: contactId,
                        accountId: trueAccountId || null,
                        from: userEmail,
                        to: JSON.stringify([contact.email]),
                        subject: `Energy Briefing: ${contactName}`,
                        html: emailHtml,
                        text: description || '',
                        status: 'sent',
                        type: 'sent',
                        timestamp: sentAt,
                        sentAt,
                        createdAt: sentAt,
                        updatedAt: sentAt,
                        ownerId: userEmail,
                        metadata: {
                            calendarInvite: true,
                            taskId: task.id,
                            inviteContext: metadata?.inviteContext || 'forensic_diagnostic'
                        }
                    });
                } catch (logErr: any) {
                    console.warn('[Create Task Invite] Failed to log email:', logErr.message);
                }
            }
        }

        res.status(200).json({ success: true, task });
    } catch (error: any) {
        console.error('[Create Task Invite] Error:', error);
        res.status(500).json({ error: error.message });
    }
}
