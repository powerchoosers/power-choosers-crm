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

                // Generate Alarms
                const alarms = (taskData.reminders || []).map((mins: number) => [
                    'BEGIN:VALARM',
                    `TRIGGER:-PT${mins}M`,
                    'ACTION:DISPLAY',
                    'DESCRIPTION:Reminder',
                    'END:VALARM'
                ].join('\r\n')).join('\r\n');

                const nowStr = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
                const url = metadata?.meetingLink || agentSettings.meetingLink || agentSettings.meeting_link || agentSettings.zoomLink || process.env.NEXT_PUBLIC_DEFAULT_MEETING_LINK || 'https://meet.google.com/nodal-point-secure';
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
                    'VERSION:2.0',
                    'PRODID:-//Nodal Point//CRM//EN',
                    'METHOD:REQUEST',
                    'CALSCALE:GREGORIAN',
                    vtimezone,
                    'BEGIN:VEVENT',
                    `UID:${task.id}@nodalpoint.io`,
                    `DTSTAMP:${nowStr}`,
                    `CREATED:${nowStr}`,
                    `LAST-MODIFIED:${nowStr}`,
                    `DTSTART;TZID=America/Chicago:${format(apptDate, "yyyyMMdd'T'HHmmss")}`,
                    `DTEND;TZID=America/Chicago:${format(addHours(apptDate, 1), "yyyyMMdd'T'HHmmss")}`,
                    `SUMMARY:Energy Briefing: ${contactName}`,
                    `DESCRIPTION:${cleanDesc}`,
                    `X-ALT-DESC;FMTTYPE=text/html:<!DOCTYPE HTML><HTML><BODY>${cleanHtml}</BODY></HTML>`,
                    `LOCATION:${apptLoc}`,
                    url ? `URL:${url}` : '',
                    'IMPORTANT:0',
                    'CLASS:PUBLIC',
                    `ORGANIZER;CN="${sender.name}":MAILTO:${sender.email.toLowerCase()}`,
                    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${contactName}":MAILTO:${contact.email.toLowerCase()}`,
                    `SEQUENCE:${sequenceCount}`,
                    'STATUS:CONFIRMED',
                    'TRANSP:OPAQUE',
                    'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
                    alarms,
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].filter(Boolean).join('\r\n');

                const zohoService = new ZohoMailService();

                // 1. Attempt Native Zoho Calendar Event Creation
                try {
                    const calendars = await zohoService.getCalendars(userEmail);
                    const defaultCalendar = calendars.find((c: any) => c.isdefault) || calendars[0];
                    if (defaultCalendar?.uid) {
                        const eventData = {
                            title: `Energy Briefing: ${contactName}`,
                            dateandtime: {
                                timezone: "America/Chicago",
                                start: format(apptDate, "yyyyMMdd'T'HHmmss'Z'"),
                                end: format(addHours(apptDate, 1), "yyyyMMdd'T'HHmmss'Z'")
                            },
                            location: apptLoc,
                            richtext_description: cleanHtml,
                            url: url,
                            attendees: [
                                { email: contact.email.toLowerCase(), permission: 1 }
                            ],
                            reminders: (taskData.reminders || []).map((mins: number) => ({ action: "email", minutes: mins })),
                            notify_attendee: 0 // CRITICAL: Stop Zoho from sending unbranded double-invites since we send ForensicInvite manually
                        };
                        if (metadata?.zohoEventId) {
                            // If it exists, update the native calendar event
                            const eventUid = metadata.zohoEventId;
                            // zohoCalendarUid might not be saved on older ones, fallback to defaultCalendar
                            const calendarUid = metadata.zohoCalendarUid || defaultCalendar.uid;
                            
                            await zohoService.updateEvent(userEmail, calendarUid, eventUid, eventData);
                            console.log(`[Zoho Calendar] Successfully updated native calendar event UID: ${eventUid}`);
                        } else {
                            // Otherwise, create new event
                            const result = await zohoService.createEvent(userEmail, defaultCalendar.uid, eventData);
                            console.log(`[Zoho Calendar] Successfully synchronized event to native calendar UID: ${result?.uid}`);
                            
                            // Save Native Calendar reference back to Task metadata
                            if (result?.uid) {
                                await supabaseAdmin.from('tasks').update({
                                    metadata: { ...metadata, zohoEventId: result.uid, zohoCalendarUid: defaultCalendar.uid }
                                }).eq('id', task.id);
                            }
                        }
                    }
                } catch (calError: any) {
                    console.warn(`[Zoho Calendar] Native event creation bypassed (missing scopes or unconnected). Defaulting strictly to ICS attachment email flow. Error: ${calError.message}`);
                }

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
                    fromName: sender.name,
                    subject: `Energy Briefing: ${contactName}`,
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
