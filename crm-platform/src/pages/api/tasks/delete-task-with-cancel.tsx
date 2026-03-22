import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';
import { render } from '@react-email/render';
import ForensicCancel from '../../../emails/ForensicCancel';
import React from 'react';
import { format, parseISO, addHours } from 'date-fns';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { taskId, userEmail } = req.body;
        if (!taskId || !userEmail) {
            return res.status(400).json({ error: 'Missing taskId or userEmail' });
        }

        // Fetch task
        const { data: task, error: taskError } = await supabaseAdmin
            .from('tasks')
            .select('*, contacts:contactId(firstName, lastName, email)')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const zohoService = new ZohoMailService();

        // Send Cancellation Email if this was synced
        let emailSent = false;
        if (task.metadata?.syncCalendar && task.contacts?.email) {
            try {
                const contactEmail = task.contacts.email;
                const contactName = `${task.contacts.firstName || ''} ${task.contacts.lastName || ''}`.trim() || 'Valued Contact';
                const apptDate = parseISO(task.dueDate || new Date().toISOString());
                const nowStr = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
                const sequenceCount = (task.metadata?.sequence || 0) + 1; // Increment sequence for cancel
                
                // Fetch agent info
                const { data: agent } = await supabaseAdmin.from('users').select('*').eq('email', userEmail).single();
                const agentSettings = agent?.settings || {};
                const senderName = (agent?.first_name && agent?.last_name) ? `${agent.first_name} ${agent.last_name}`.trim() : (agent?.name || userEmail);
                const sender = {
                    name: senderName,
                    title: agent?.job_title || agentSettings.jobTitle || 'Nodal Point Architect',
                    phone: agentSettings.selectedPhoneNumber || agentSettings.twilioNumbers?.[0]?.number || '+1 (817) 754-0695',
                    email: userEmail,
                    city: agentSettings.city || 'Fort Worth',
                    state: agentSettings.state || 'TX',
                    avatarUrl: agent?.hosted_photo_url || agentSettings.avatar_url || 'https://nodalpoint.io/images/staff/lewis-patterson.png'
                };

                // Build timezone array
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

                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//Nodal Point//CRM//EN',
                    'METHOD:CANCEL',
                    'CALSCALE:GREGORIAN',
                    vtimezone,
                    'BEGIN:VEVENT',
                    `UID:${task.id}@nodalpoint.io`,
                    `DTSTAMP:${nowStr}`,
                    `DTSTART;TZID=America/Chicago:${format(apptDate, "yyyyMMdd'T'HHmmss")}`,
                    `DTEND;TZID=America/Chicago:${format(addHours(apptDate, 1), "yyyyMMdd'T'HHmmss")}`,
                    `SUMMARY:CANCELED: Energy Briefing: ${contactName}`,
                    `ORGANIZER;CN="${senderName}":MAILTO:${userEmail}`,
                    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${contactName}":MAILTO:${contactEmail.toLowerCase()}`,
                    `SEQUENCE:${sequenceCount}`,
                    'STATUS:CANCELLED',
                    'TRANSP:TRANSPARENT',
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].join('\r\n');

                const uploadResult = await zohoService.uploadAttachment(userEmail, icsContent, 'cancel.ics', false);

                const apptDateStr = format(apptDate, 'EEEE, MMMM do, yyyy');
                const apptTimeStr = format(apptDate, 'h:mm a');
                const emailHtml = await render(
                    <ForensicCancel
                        contactName={contactName}
                        companyName={task.metadata?.relatedTo || 'Your Organization'}
                        appointmentDate={apptDateStr}
                        appointmentTime={apptTimeStr}
                        sender={sender}
                    />
                );

                await zohoService.sendEmail({
                    to: contactEmail.toLowerCase(),
                    fromName: sender.name,
                    subject: `Canceled: Energy Briefing - ${contactName}`,
                    html: emailHtml,
                    userEmail: userEmail,
                    uploadedAttachments: uploadResult ? [uploadResult] : []
                });

                emailSent = true;
                console.log(`[Cancellation] Dispatched METHOD:CANCEL ICS to ${contactEmail}`);
            } catch (err: any) {
                console.warn(`[Cancellation] Failed to send ICS cancellation: ${err.message}`);
            }
        }

        // Final Delete from Supabase
        const { error: deleteError } = await supabaseAdmin.from('tasks').delete().eq('id', taskId);
        if (deleteError) {
            throw deleteError;
        }

        return res.status(200).json({ success: true, emailSent });
    } catch (e: any) {
        console.error('[Delete Task Cancel] Error:', e);
        return res.status(500).json({ error: e.message || 'Internal error' });
    }
}
