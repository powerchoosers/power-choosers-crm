import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { action, task, email } = req.query;

    const renderHtml = (status: 'success' | 'error', message: string, detail: string) => `
<!DOCTYPE html>
<html>
<head>
    <title>Nodal Point // Transmission Status</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            background-color: #050505; 
            color: #fff; 
            font-family: monospace; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0; 
            padding: 20px;
            box-sizing: border-box;
        }
        .container { 
            text-align: center; 
            border: 1px dashed ${status === 'success' ? '#002FA7' : '#ef4444'}; 
            padding: 40px; 
            border-radius: 4px; 
            max-width: 500px;
            width: 100%;
            background: #09090b;
        }
        .signal { 
            color: ${status === 'success' ? '#002FA7' : '#ef4444'}; 
            font-weight: bold; 
            letter-spacing: 2px; 
            margin-bottom: 20px; 
            font-size: 10px; 
        }
        h1 { 
            font-family: sans-serif; 
            letter-spacing: -1px; 
            margin: 0 0 16px; 
            font-size: 24px;
        }
        p { 
            color: #888; 
            font-size: 14px;
            line-height: 1.6;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="signal">● PROTOCOL_${status === 'success' ? 'SYNCED' : 'FAULT'}</div>
        <h1>${message}</h1>
        <p>${detail}</p>
    </div>
</body>
</html>
`;

    if (!action || !task || !email) {
        res.status(400).send(renderHtml('error', 'Invalid Parameters', 'The transmission link is malformed or incomplete.'));
        return;
    }

    const actionStr = String(action).toUpperCase();
    if (actionStr !== 'ACCEPT' && actionStr !== 'DECLINE') {
        res.status(400).send(renderHtml('error', 'Invalid Action', 'Only ACCEPT and DECLINE actions are permitted.'));
        return;
    }

    const rsvpStatus = actionStr === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';

    try {
        // 1. Fetch Task
        const { data: taskData, error: taskError } = await supabaseAdmin
            .from('tasks')
            .select('id, ownerId, metadata')
            .eq('id', String(task))
            .single();

        if (taskError || !taskData) {
            res.status(404).send(renderHtml('error', 'Task Not Found', 'The requested session could not be located in the secure ledger.'));
            return;
        }

        // 2. Update Supabase
        const currentMetadata = taskData.metadata || {};
        const updatedMetadata = {
            ...currentMetadata,
            rsvpStatus: rsvpStatus
        };

        const { error: updateError } = await supabaseAdmin
            .from('tasks')
            .update({ metadata: updatedMetadata })
            .eq('id', taskData.id);

        if (updateError) {
            throw new Error(`Failed to update DB: ${updateError.message}`);
        }

        // 3. Opportunistically update Zoho Native Calendar Attendees
        if (taskData.ownerId && updatedMetadata.zohoEventId && updatedMetadata.zohoCalendarUid) {
            try {
                const zohoService = new ZohoMailService();
                
                // Fetch the existing event to get full structure
                const currEvent = await zohoService.getEvent(
                    taskData.ownerId, 
                    updatedMetadata.zohoCalendarUid, 
                    updatedMetadata.zohoEventId
                );

                if (currEvent && currEvent.attendees) {
                    const attendees = currEvent.attendees;
                    const targetIdx = attendees.findIndex((a: any) => a.email.toLowerCase() === String(email).toLowerCase());
                    
                    if (targetIdx > -1) {
                        // Zoho accepts 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'NEEDS-ACTION' (often sent lowercase or titlecase in JSON but strictly uppercase in API is safe)
                        attendees[targetIdx].status = rsvpStatus;
                        
                        // We must reconstruct the basic payload. Zoho updateEvent only needs modified fields mostly, but requires dates and title.
                        const updatePayload = {
                            title: currEvent.title,
                            dateandtime: currEvent.dateandtime,
                            attendees: attendees
                        };

                        await zohoService.updateEvent(
                            taskData.ownerId, 
                            updatedMetadata.zohoCalendarUid, 
                            updatedMetadata.zohoEventId, 
                            updatePayload
                        );
                        console.log(`[RSVP Webhook] Successfully pushed native status ${rsvpStatus} to Zoho Calendar for ${email}`);
                    }
                }
            } catch (zohoError: any) {
                console.error(`[RSVP Webhook] Non-fatal fault updating Zoho Calendar natively: ${zohoError.message}`);
                // Proceed normally. Supabase holds the single source of truth for the War Room.
            }
        }

        res.status(200).send(renderHtml(
            'success', 
            actionStr === 'ACCEPT' ? 'Session Confirmed' : 'Session Declined', 
            actionStr === 'ACCEPT' 
                ? 'Your confirmation has been registered. You may securely close this window.'
                : 'Your response has been registered. You may securely close this window.'
        ));

    } catch (error: any) {
        console.error('[RSVP Webhook] Fatal Error:', error);
        res.status(500).send(renderHtml('error', 'System Fault', 'The synchronization engine experienced an error processing your response.'));
    }
}
