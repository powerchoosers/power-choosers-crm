import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { format, addHours, parseISO } from 'date-fns';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { action, task, email } = req.query;

    const renderErrorHtml = (message: string, detail: string) => `
<!DOCTYPE html>
<html>
<head>
    <title>Nodal Point // Meeting Status</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background-color: #050505; color: #fff; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .container { text-align: center; border: 1px dashed #ef4444; padding: 40px; border-radius: 4px; max-width: 500px; width: 100%; background: #09090b; }
        .signal { color: #ef4444; font-weight: bold; letter-spacing: 2px; margin-bottom: 20px; font-size: 10px; }
        h1 { font-family: sans-serif; letter-spacing: -1px; margin: 0 0 16px; font-size: 24px; }
        p { color: #888; font-size: 14px; line-height: 1.6; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="signal">● MEETING_ERROR</div>
        <h1>${message}</h1>
        <p>${detail}</p>
    </div>
</body>
</html>`;

    const renderDeclineHtml = () => `
<!DOCTYPE html>
<html>
<head>
    <title>Nodal Point // Meeting Status</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background-color: #050505; color: #fff; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .container { text-align: center; border: 1px dashed #002FA7; padding: 40px; border-radius: 4px; max-width: 500px; width: 100%; background: #09090b; }
        .signal { color: #002FA7; font-weight: bold; letter-spacing: 2px; margin-bottom: 20px; font-size: 10px; }
        h1 { font-family: sans-serif; letter-spacing: -1px; margin: 0 0 16px; font-size: 24px; }
        p { color: #888; font-size: 14px; line-height: 1.6; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="signal">● RESPONSE_SAVED</div>
        <h1>Response saved.</h1>
        <p>Your response has been registered. You may close this window.</p>
    </div>
</body>
</html>`;

    const renderAcceptHtml = (
        icsDataUri: string,
        googleCalUrl: string,
        outlookUrl: string,
        eventTitle: string,
        eventDate: string,
        eventTime: string
    ) => `
<!DOCTYPE html>
<html>
<head>
    <title>Nodal Point // Meeting Confirmed</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { background-color: #050505; color: #fff; font-family: monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .container { text-align: center; border: 1px dashed #002FA7; padding: 40px; border-radius: 4px; max-width: 520px; width: 100%; background: #09090b; }
        .signal { color: #002FA7; font-weight: bold; letter-spacing: 2px; margin-bottom: 20px; font-size: 10px; }
        h1 { font-family: sans-serif; letter-spacing: -1px; margin: 0 0 8px; font-size: 24px; }
        .sub { color: #888; font-size: 13px; line-height: 1.6; margin: 0 0 28px; }
        .event-block { background: #111; border: 1px solid #1e1e1e; border-radius: 4px; padding: 16px 20px; margin-bottom: 28px; text-align: left; }
        .event-label { font-size: 9px; letter-spacing: 2px; color: #555; text-transform: uppercase; margin-bottom: 4px; }
        .event-value { font-size: 13px; color: #d4d4d8; margin-bottom: 10px; }
        .event-value:last-child { margin-bottom: 0; }
        .cal-label { font-size: 9px; letter-spacing: 2px; color: #555; text-transform: uppercase; margin-bottom: 12px; }
        .btn-group { display: flex; flex-direction: column; gap: 10px; }
        .btn { display: block; padding: 12px 20px; border-radius: 4px; font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 1.5px; text-decoration: none; text-align: center; cursor: pointer; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; }
        .btn-primary { background: #002FA7; color: #fff; border: none; }
        .btn-outline { background: transparent; color: #888; border: 1px solid #2a2a2a; }
        .btn-outline:hover { border-color: #555; color: #ccc; }
        .divider { border: none; border-top: 1px solid #1e1e1e; margin: 24px 0; }
        .close-note { font-size: 11px; color: #444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="signal">● MEETING_CONFIRMED</div>
        <h1>Meeting confirmed.</h1>
        <p class="sub">Your response has been saved.</p>

        <div class="event-block">
            <div class="event-label">Meeting</div>
            <div class="event-value">${eventTitle}</div>
            <div class="event-label">Date</div>
            <div class="event-value">${eventDate}</div>
            <div class="event-label">Time</div>
            <div class="event-value">${eventTime} CST</div>
        </div>

        <div class="cal-label">// Add to your calendar</div>
        <div class="btn-group">
            <a class="btn btn-primary" href="${icsDataUri}" download="nodal-point-invite.ics">
                Download calendar file (.ICS)
            </a>
            <a class="btn btn-outline" href="${googleCalUrl}" target="_blank" rel="noopener noreferrer">
                Open in Google Calendar
            </a>
            <a class="btn btn-outline" href="${outlookUrl}" target="_blank" rel="noopener noreferrer">
                Open in Outlook
            </a>
        </div>

        <hr class="divider" />
        <p class="close-note">You can close this window after adding the event to your calendar.</p>
    </div>
</body>
</html>`;

    if (!action || !task || !email) {
        res.status(400).send(renderErrorHtml('Invalid Parameters', 'The link is missing information or was copied incorrectly.'));
        return;
    }

    const actionStr = String(action).toUpperCase();
    if (actionStr !== 'ACCEPT' && actionStr !== 'DECLINE') {
        res.status(400).send(renderErrorHtml('Invalid Action', 'Use the original accept or decline link from the invitation.'));
        return;
    }

    const rsvpStatus = actionStr === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';

    try {
        // 1. Fetch Task (expanded for ICS generation)
        const { data: taskData, error: taskError } = await supabaseAdmin
            .from('tasks')
            .select('id, ownerId, metadata, title, dueDate, description, contactId')
            .eq('id', String(task))
            .single();

        if (taskError || !taskData) {
            res.status(404).send(renderErrorHtml('Task Not Found', 'We could not find that meeting.'));
            return;
        }

        const taskMetadata = (taskData.metadata || {}) as Record<string, any>;
        const meetingSummary = String(taskMetadata.manualIntro || 'Meeting with Nodal Point to review your bill and next steps.').trim();

        // 2. Update RSVP status
        const updatedMetadata = { ...(taskData.metadata || {}), rsvpStatus };
        const { error: updateError } = await supabaseAdmin
            .from('tasks')
            .update({ metadata: updatedMetadata })
            .eq('id', taskData.id);

        if (updateError) throw new Error(`Failed to update DB: ${updateError.message}`);

        console.log(`[RSVP] Status ${rsvpStatus} recorded for ${email}`);

        // 3. Fire RSVP notification for CRM toast + badge
        if (taskData.ownerId) {
            const notifTitle = actionStr === 'ACCEPT' ? 'Meeting Confirmed' : 'Meeting Declined';
            const notifMessage = `${email} has ${actionStr === 'ACCEPT' ? 'accepted' : 'declined'} the calendar invite.`;
            await supabaseAdmin.from('notifications').insert({
                id: crypto.randomUUID(),
                ownerId: taskData.ownerId,
                title: notifTitle,
                message: notifMessage,
                type: 'rsvp',
                read: false,
                data: {
                    contactName: String(email).split('@')[0],
                    subject: taskData.title || 'Unknown Event',
                    status: rsvpStatus,
                    taskId: taskData.id
                }
            });
        }

        // 4. For DECLINE — simple confirmation page
        if (actionStr === 'DECLINE') {
            res.status(200).send(renderDeclineHtml());
            return;
        }

        // 5. For ACCEPT — generate ICS + calendar deep links
        // Fetch agent details for organizer field
        const { data: agent } = await supabaseAdmin
            .from('users')
            .select('first_name, last_name, name, job_title, settings')
            .eq('email', taskData.ownerId)
            .single();

        const agentSettings = agent?.settings || {};
        const agentName = (agent?.first_name && agent?.last_name)
            ? `${agent.first_name} ${agent.last_name}`
            : agent?.name || taskData.ownerId;
        const meetingUrl = agentSettings.meetingLink || agentSettings.meeting_link || agentSettings.zoomLink || '';

        // Build Chicago-local timestamps
        const apptDate = parseISO(taskData.dueDate || new Date().toISOString());
        const chicagoStr = apptDate.toLocaleString('en-US', { timeZone: 'America/Chicago' });
        const chicagoDate = new Date(chicagoStr);
        const chicagoEnd = addHours(chicagoDate, 1);

        const displayDate = format(chicagoDate, 'EEEE, MMMM do, yyyy');
        const displayTime = format(chicagoDate, 'h:mm a');

        // ICS timestamps — local Chicago format for TZID-anchored fields
        const dtStart = format(chicagoDate, "yyyyMMdd'T'HHmmss");
        const dtEnd = format(chicagoEnd, "yyyyMMdd'T'HHmmss");
        // UTC stamps for DTSTAMP
        const nowUtc = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
        // UTC format for Google/Outlook deep links
        const dtStartUtc = format(apptDate, "yyyyMMdd'T'HHmmss'Z'");
        const dtEndUtc = format(addHours(apptDate, 1), "yyyyMMdd'T'HHmmss'Z'");

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

        const cleanDesc = meetingSummary.replace(/\r?\n/g, '\\n');

        const icsContent = [
            'BEGIN:VCALENDAR',
            'PRODID:-//Nodal Point//CRM//EN',
            'VERSION:2.0',
            'X-WR-TIMEZONE:America/Chicago',
            'CALSCALE:GREGORIAN',
            'METHOD:REQUEST',
            vtimezone,
            'BEGIN:VEVENT',
            `SUMMARY:${taskData.title || 'Meeting with Nodal Point'}`,
            `DESCRIPTION:${cleanDesc}`,
            `DTSTART;TZID=America/Chicago:${dtStart}`,
            `DTEND;TZID=America/Chicago:${dtEnd}`,
            meetingUrl ? `LOCATION:${meetingUrl}` : 'LOCATION:Remote (Nodal Point)',
            meetingUrl ? `URL:${meetingUrl}` : '',
            `UID:${taskData.id}@nodalpoint.io`,
            'CLASS:PUBLIC',
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE',
            `ORGANIZER;CN="${agentName}":MAILTO:${taskData.ownerId}`,
            `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=FALSE;PARTSTAT=ACCEPTED:MAILTO:${String(email).toLowerCase()}`,
            `CREATED:${nowUtc}`,
            `LAST-MODIFIED:${nowUtc}`,
            `DTSTAMP:${nowUtc}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].filter(Boolean).join('\r\n');

        // Embed ICS as data URI (universal — works on all calendar apps)
        const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;

        // Google Calendar deep link
        const gcTitle = encodeURIComponent(taskData.title || 'Meeting with Nodal Point');
        const gcDesc = encodeURIComponent(meetingSummary);
        const gcLoc = encodeURIComponent(meetingUrl || 'Remote');
        const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcTitle}&dates=${dtStartUtc.replace(/[-:]/g, '')}/${dtEndUtc.replace(/[-:]/g, '')}&details=${gcDesc}&location=${gcLoc}`;

        // Outlook Web deep link
        const olTitle = encodeURIComponent(taskData.title || 'Meeting with Nodal Point');
        const olBody = encodeURIComponent(meetingSummary);
        const olLoc = encodeURIComponent(meetingUrl || 'Remote');
        const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${olTitle}&startdt=${apptDate.toISOString()}&enddt=${addHours(apptDate, 1).toISOString()}&body=${olBody}&location=${olLoc}`;

        res.status(200).send(renderAcceptHtml(
            icsDataUri,
            googleCalUrl,
            outlookUrl,
            taskData.title || 'Meeting with Nodal Point',
            displayDate,
            displayTime
        ));

    } catch (error: any) {
        console.error('[RSVP Webhook] Fatal Error:', error);
        res.status(500).send(renderErrorHtml('System Fault', 'We had trouble saving your response. Please try the original link again.'));
    }
}
