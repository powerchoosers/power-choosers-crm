import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ZohoMailService } from '../email/zoho-service';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb'
        }
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token, signatureBase64, textValues } = req.body;

    if (!token || !signatureBase64) {
        return res.status(400).json({ error: 'Missing required parameters: token, signatureBase64' });
    }

    try {
        // 1. Fetch request and validate
        const { data: request, error: fetchError } = await supabaseAdmin
            .from('signature_requests')
            .select('*, document:documents(*), contact:contacts(*), account:accounts(*), deal:deals(*)')
            .eq('access_token', token)
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ error: 'Invalid or expired secure token' });
        }

        if (request.expires_at && new Date(request.expires_at) < new Date()) {
            return res.status(410).json({ error: 'This signing link has expired. Please contact your representative to request a new one.' });
        }

        if (request.status === 'signed' || request.status === 'completed' || request.status === 'declined') {
            return res.status(400).json({ error: 'Document has already been executed or was declined' });
        }

        // 2. Log signing telemetry
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || req.socket.remoteAddress || 'Unknown IP');
        const userAgent = req.headers['user-agent'] || 'Unknown Device';

        await supabaseAdmin
            .from('signature_telemetry')
            .insert({
                request_id: request.id,
                action: 'signed',
                ip_address: ipAddress,
                user_agent: userAgent
            });

        // Fetch all telemetries for the certificate
        const { data: telemetries } = await supabaseAdmin
            .from('signature_telemetry')
            .select('*')
            .eq('request_id', request.id)
            .order('created_at', { ascending: true });

        // 3. Download the original PDF from Supabase Storage
        const storagePath = request.document.storage_path;
        const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
            .from('vault')
            .download(storagePath);

        if (downloadError || !pdfData) {
            throw new Error(`Failed to download original document: ${downloadError?.message}`);
        }

        const pdfBuffer = await pdfData.arrayBuffer();
        const originalHash = crypto.createHash('sha256').update(Buffer.from(pdfBuffer)).digest('hex');

        // 4. Modify PDF with pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];

        // File naming — hoisted early so customerFileName is available before cert pages are added
        const originalExt = request.document.name.split('.').pop();
        const originalNameNoExt = request.document.name.replace(`.${originalExt}`, '');
        const finalFileName = `${originalNameNoExt}_Signed_${Date.now()}.${originalExt}`;
        const customerFileName = `${originalNameNoExt}_Executed.${originalExt}`;

        // 4a. Embed the signature image
        const base64Data = signatureBase64.replace(/^data:image\/(png|jpeg);base64,/, "");
        const signatureImageBytes = Buffer.from(base64Data, 'base64');
        let signatureImage;
        if (signatureBase64.includes('image/jpeg')) {
            signatureImage = await pdfDoc.embedJpg(signatureImageBytes);
        } else {
            signatureImage = await pdfDoc.embedPng(signatureImageBytes);
        }

        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Render signature according to all signature_fields if they exist, otherwise fallback to last page default
        if (request.signature_fields && request.signature_fields.length > 0) {
            request.signature_fields.forEach((field: any, index: number) => {
                const targetPage = pages[field.pageIndex];
                if (!targetPage) return;

                const pdfWidth = targetPage.getWidth();
                const pdfHeight = targetPage.getHeight();
                const scale = pdfWidth / 800;

                const scaledWidth = field.width * scale;
                const scaledHeight = field.height * scale;
                const scaledX = field.x * scale;
                const scaledY = field.y * scale;
                const pdfY = pdfHeight - scaledY - scaledHeight;

                if (field.type === 'text') {
                    const textKey = field.fieldId ?? String(index);
                    const textContent = (textValues && textValues[textKey]) ? textValues[textKey] : '';
                    targetPage.drawText(textContent, {
                        x: scaledX + 5,
                        y: pdfY + (scaledHeight / 3),
                        size: 11,
                        font: helvetica,
                        color: rgb(0, 0, 0)
                    });
                } else {
                    try {
                        targetPage.drawImage(signatureImage, {
                            x: scaledX,
                            y: pdfY,
                            width: scaledWidth,
                            height: scaledHeight,
                        });
                    } catch (err) {
                        console.error('Failed to draw image field', err);
                    }
                }
            });
        } else {
            // Fallback for requests made before Phase 2
            const sigDims = signatureImage.scaleToFit(200, 100);
            lastPage.drawImage(signatureImage, {
                x: 50,
                y: 50,
                width: sigDims.width,
                height: sigDims.height,
            });
            lastPage.drawText(`Signed by: ${request.contact?.firstName || ''} ${request.contact?.lastName || request.contact?.name || ''}`, {
                x: 50,
                y: 40,
                size: 10,
                font: helvetica,
                color: rgb(0, 0, 0)
            });
            lastPage.drawText(`Date: ${new Date().toUTCString()}`, {
                x: 50,
                y: 28,
                size: 10,
                font: helvetica,
                color: rgb(0, 0, 0)
            });
        }

        // 4b. Save customer copy BEFORE appending cert pages.
        //     Customer receives a clean signed PDF — no forensic audit trail.
        const customerPdfBytes = await pdfDoc.save();

        // 4c. Create the Forensic Audit Certificate (internal copy only)
        const certPage = pdfDoc.addPage([595.28, 841.89]);
        const certWidth = certPage.getWidth();
        const certHeight = certPage.getHeight();

        certPage.drawText('NODAL POINT | FORENSIC AUDIT CERTIFICATE', {
            x: 50,
            y: certHeight - 50,
            size: 16,
            font: helveticaBold,
            color: rgb(0, 0.184, 0.655)
        });

        certPage.drawText(`Document ID: ${request.document.id}`, { x: 50, y: certHeight - 90, size: 10, font: helvetica });
        certPage.drawText(`Original SHA-256 Hash: ${originalHash}`, { x: 50, y: certHeight - 110, size: 10, font: helvetica });
        certPage.drawText(`Signer: ${request.contact?.email || 'Unknown'}`, { x: 50, y: certHeight - 130, size: 10, font: helvetica });

        let activeCertPage = certPage;
        const CERT_LEFT = 50;
        const CERT_MIN_Y = 80;
        const CERT_ENTRY_HEIGHT = 52;

        let currentY = certHeight - 170;
        activeCertPage.drawText('TELEMETRY TIMELINE:', { x: CERT_LEFT, y: currentY, size: 12, font: helveticaBold });
        currentY -= 20;

        if (telemetries) {
            telemetries.forEach((t) => {
                if (currentY < CERT_MIN_Y + CERT_ENTRY_HEIGHT) {
                    activeCertPage = pdfDoc.addPage([595.28, 841.89]);
                    const contHeight = activeCertPage.getHeight();
                    activeCertPage.drawText('NODAL POINT | FORENSIC AUDIT CERTIFICATE (continued)', {
                        x: CERT_LEFT,
                        y: contHeight - 50,
                        size: 10,
                        font: helveticaBold,
                        color: rgb(0, 0.184, 0.655)
                    });
                    currentY = contHeight - 80;
                }

                activeCertPage.drawText(`[${new Date(t.created_at).toISOString()}] ACTION: ${t.action.toUpperCase()}`, { x: CERT_LEFT, y: currentY, size: 10, font: helveticaBold });
                currentY -= 15;
                activeCertPage.drawText(`IP Address: ${t.ip_address || 'Unknown'}`, { x: CERT_LEFT + 20, y: currentY, size: 9, font: helvetica });
                currentY -= 12;
                activeCertPage.drawText(`Device/OS: ${t.user_agent ? t.user_agent.substring(0, 80) : 'Unknown'}`, { x: CERT_LEFT + 20, y: currentY, size: 9, font: helvetica });
                currentY -= 25;
            });
        }

        activeCertPage.drawText('This document is electronically signed and secured by Nodal Point.', {
            x: CERT_LEFT,
            y: 50,
            size: 9,
            font: helvetica,
            color: rgb(0.4, 0.4, 0.4)
        });

        // 5. Save final PDF (with cert) — this is the authoritative vault record
        const finalPdfBytes = await pdfDoc.save();

        // 6. Upload final PDF (with cert) to Supabase Storage
        const accountFolder = request.account_id ?? 'unassigned';
        const finalStoragePath = `accounts/${accountFolder}/${finalFileName}`;

        const { error: finalUploadError } = await supabaseAdmin.storage
            .from('vault')
            .upload(finalStoragePath, finalPdfBytes, { contentType: 'application/pdf' });

        if (finalUploadError) {
            throw new Error(`Failed to save executed document: ${finalUploadError.message}`);
        }

        // Insert new document record
        const { data: newDoc, error: docError } = await supabaseAdmin
            .from('documents')
            .insert({
                account_id: request.account_id,
                name: finalFileName,
                size: `${(finalPdfBytes.length / 1024 / 1024).toFixed(2)} MB`,
                type: 'application/pdf',
                storage_path: finalStoragePath,
                url: ''
            })
            .select()
            .single();

        if (docError) {
            console.error('[Signature Express] Error adding document to library:', docError);
        }

        // 7. Update status
        await supabaseAdmin
            .from('signature_requests')
            .update({
                status: 'completed',
                signed_document_path: finalStoragePath,
                updated_at: new Date().toISOString()
            })
            .eq('id', request.id);

        if (request.deal_id) {
            await supabaseAdmin.from('deals').update({ stage: 'SECURED' }).eq('id', request.deal_id);
        }

        // Advance account lifecycle: Active Load → Customer on contract execution
        if (request.account_id) {
            const extracted = request.document?.metadata?.ai_extraction?.data || null;
            const accountUpdates: Record<string, any> = { status: 'Customer' };

            // Apply contract economics only at execution time.
            if (extracted?.contract_end_date) accountUpdates.contract_end_date = extracted.contract_end_date;
            if (extracted?.strike_price) accountUpdates.current_rate = String(extracted.strike_price);
            if (extracted?.supplier) accountUpdates.electricity_supplier = extracted.supplier;
            if (extracted?.annual_usage) accountUpdates.annual_usage = String(extracted.annual_usage);

            await supabaseAdmin.from('accounts').update(accountUpdates).eq('id', request.account_id);
            await supabaseAdmin.from('contacts').update({ status: 'Customer' }).eq('accountId', request.account_id);
        }

        // 8. Email Delivery
        try {
            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nodalpoint.io';
            const logoUrl = `${appBaseUrl}/images/nodalpoint-webicon.png`;

            // authEmail: Zoho OAuth token lookup (l.patterson@nodalpoint.io — has stored tokens).
            // fromEmail:  display from address shown to recipients (signal@nodalpoint.io alias).
            const authEmail = 'l.patterson@nodalpoint.io';
            const fromEmail = 'signal@nodalpoint.io';

            // Resolve agent email from dispatch metadata, deal owner, or account owner
            const resolvedAgentEmail: string =
                request.metadata?.agentEmail ||
                request.deal?.ownerId ||
                request.account?.ownerId ||
                fromEmail;

            if (!request.metadata?.agentEmail && !request.deal?.ownerId && !request.account?.ownerId) {
                console.warn('[Execution Email] agentEmail could not be resolved for request', request.id, '— falling back to fromEmail.');
            }

            // Look up agent's first name for email personalization
            const { data: agentUser } = await supabaseAdmin
                .from('users')
                .select('first_name, last_name')
                .eq('email', resolvedAgentEmail)
                .maybeSingle();

            const agentFirstName = agentUser?.first_name || 'your advisor';
            const contactFirstName = request.contact?.firstName || request.contact?.name?.split(' ')[0] || 'there';
            const contactLastName = request.contact?.lastName || '';
            const contactFullName = [contactFirstName, contactLastName].filter(Boolean).join(' ') || request.contact?.email || 'Contact';
            const accountName = request.account?.name || '';

            const customerSubject = `Your Energy Agreement Has Been Executed`;
            const internalSubject = `EXECUTED — ${contactFullName}${accountName ? ` · ${accountName}` : ''}`;

            // Shared email header with logo
            const emailHeader = `
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #27272a; width:100%;">
                <tr>
                  <td style="width:44px; vertical-align:middle; padding-right:12px;">
                    <img src="${logoUrl}" alt="Nodal Point" width="36" height="36" style="display:block; border-radius:6px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:monospace; font-size:12px; letter-spacing:0.15em; color:#a1a1aa; text-transform:uppercase;">Nodal Point</span>
                  </td>
                </tr>
              </table>
            `;

            // Customer email — clean signed PDF, no audit trail
            const customerEmailHtml = `
              <div style="font-family:monospace; background-color:#09090b; color:#f4f4f5; padding:40px; border:1px solid #27272a; max-width:600px; margin:0 auto;">
                ${emailHeader}
                <h2 style="text-transform:uppercase; letter-spacing:0.1em; color:#10b981; font-size:13px; margin-top:0; margin-bottom:24px;">Contract Executed</h2>
                <p style="font-family:sans-serif; font-size:15px; line-height:1.6; margin-bottom:16px; color:#f4f4f5;">Hi ${contactFirstName},</p>
                <p style="font-family:sans-serif; font-size:15px; line-height:1.6; margin-bottom:20px; color:#f4f4f5;">
                  Your energy services agreement has been fully executed and cryptographically sealed. A signed copy is attached for your records.
                </p>
                <p style="font-family:sans-serif; font-size:15px; line-height:1.6; margin-bottom:0; color:#a1a1aa;">
                  If you have any questions, please don't hesitate to reach out to your advisor, ${agentFirstName}.
                </p>
                <div style="margin-top:40px; font-size:11px; color:#52525b; border-top:1px solid #27272a; padding-top:16px; font-family:monospace;">
                  Nodal Point Compliance &middot; nodalpoint.io
                </div>
              </div>
            `;

            // Internal email — full PDF with forensic audit certificate
            const internalEmailHtml = `
              <div style="font-family:monospace; background-color:#09090b; color:#f4f4f5; padding:40px; border:1px solid #27272a; max-width:600px; margin:0 auto;">
                ${emailHeader}
                <h2 style="text-transform:uppercase; letter-spacing:0.1em; color:#10b981; font-size:13px; margin-top:0; margin-bottom:24px;">Contract Executed</h2>
                <div style="background-color:#18181b; padding:16px; border:1px solid #27272a; border-radius:4px; margin-bottom:24px;">
                  <div style="font-size:10px; color:#71717a; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:6px; font-family:monospace;">Signatory</div>
                  <div style="font-size:15px; color:#f4f4f5; font-family:sans-serif; margin-bottom:2px;">${contactFullName}</div>
                  <div style="font-size:12px; color:#71717a; font-family:sans-serif;">${request.contact?.email || ''}</div>
                  ${accountName ? `<div style="font-size:11px; color:#52525b; font-family:monospace; margin-top:6px; text-transform:uppercase; letter-spacing:0.05em;">${accountName}</div>` : ''}
                </div>
                <p style="font-family:sans-serif; font-size:14px; line-height:1.6; color:#a1a1aa; margin-bottom:0;">
                  The executed document and Forensic Audit Certificate are attached. The signed record has been archived in the secure vault.
                </p>
                <div style="margin-top:40px; font-size:11px; color:#52525b; border-top:1px solid #27272a; padding-top:16px; font-family:monospace;">
                  Nodal Point Forensic Systems &middot; Signal Intelligence
                </div>
              </div>
            `;

            const zohoService = new ZohoMailService();
            await zohoService.initialize(authEmail);

            // Upload customer copy (no cert) for customer email
            let customerZohoAttachment = null;
            try {
                customerZohoAttachment = await zohoService.uploadAttachment(
                    authEmail,
                    Buffer.from(customerPdfBytes),
                    customerFileName
                );
            } catch (attachErr: any) {
                console.error('[Execution Email] Customer attachment upload failed — sending without attachment:', attachErr.message);
            }

            // Upload internal copy (with cert) for agent email
            let internalZohoAttachment = null;
            try {
                internalZohoAttachment = await zohoService.uploadAttachment(
                    authEmail,
                    Buffer.from(finalPdfBytes),
                    finalFileName
                );
            } catch (attachErr: any) {
                console.error('[Execution Email] Internal attachment upload failed — sending without attachment:', attachErr.message);
            }

            // Log customer email to CRM emails table
            const execEmailId = `sig_exec_${Date.now()}_${request.id.substring(0, 8)}`;
            const { error: emailInsertError } = await supabaseAdmin.from('emails').insert({
                id: execEmailId,
                contactId: request.contact_id,
                accountId: request.account_id || null,
                ownerId: fromEmail,
                from: fromEmail,
                to: [request.contact.email],
                subject: customerSubject,
                html: customerEmailHtml,
                text: `Your energy services agreement has been fully executed. A signed copy is attached.`,
                status: 'sent',
                type: 'sent',
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                    isSignatureExecution: true,
                    documentId: request.document.id,
                    dealId: request.deal_id,
                    signedDocumentPath: finalStoragePath
                }
            });
            if (emailInsertError) {
                console.error('[Execution Email] Failed to log email to CRM:', emailInsertError.message);
            }

            // Send customer email — clean signed copy, no audit trail
            await zohoService.sendEmail({
                to: [request.contact.email],
                subject: customerSubject,
                html: customerEmailHtml,
                text: `Your energy services agreement has been fully executed. A signed copy is attached.`,
                uploadedAttachments: customerZohoAttachment ? [customerZohoAttachment] : undefined,
                userEmail: authEmail,
                from: fromEmail,
                fromName: 'Nodal Point Compliance'
            });

            // Send internal email to agent — full PDF with forensic audit certificate
            await zohoService.sendEmail({
                to: [resolvedAgentEmail],
                subject: internalSubject,
                html: internalEmailHtml,
                text: `${contactFullName} has executed their energy agreement. Full document and Forensic Audit Certificate attached.`,
                uploadedAttachments: internalZohoAttachment ? [internalZohoAttachment] : undefined,
                userEmail: authEmail,
                from: fromEmail,
                fromName: 'Nodal Point Compliance'
            });

        } catch (emailError: any) {
            console.error('[Execution Email Failed]', emailError.message);
            // Contract is legally executed and stored in vault — email failure is non-fatal
        }

        return res.status(200).json({ success: true, finalStoragePath });
    } catch (error: any) {
        console.error('[Signature Execution API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
