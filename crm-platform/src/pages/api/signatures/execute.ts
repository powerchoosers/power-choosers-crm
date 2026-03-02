import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ZohoMailService } from '../email/zoho-service';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb' // Signatures and PDF buffers can be large
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

        // Calculate hash of original document
        const originalHash = crypto.createHash('sha256').update(Buffer.from(pdfBuffer)).digest('hex');

        // 4. Modify PDF with pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];

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

                // HTML coordinate system used by react-pdf (800px width based)
                const pdfWidth = targetPage.getWidth();
                const pdfHeight = targetPage.getHeight();
                const scale = pdfWidth / 800; // HTML rendered at 800px Fixed Width

                const scaledWidth = field.width * scale;
                const scaledHeight = field.height * scale;
                const scaledX = field.x * scale;
                const scaledY = field.y * scale;

                // Cartesian Flip for PDF-lib Y axis
                const pdfY = pdfHeight - scaledY - scaledHeight;

                if (field.type === 'text') {
                    // Draw Text input — use stable fieldId as key; fall back to index for legacy requests
                    const textKey = field.fieldId ?? String(index);
                    const textContent = (textValues && textValues[textKey]) ? textValues[textKey] : '';
                    targetPage.drawText(textContent, {
                        x: scaledX + 5,
                        y: pdfY + (scaledHeight / 3), // approximate vertical centering
                        size: 11,
                        font: helvetica,
                        color: rgb(0, 0, 0)
                    });
                } else {
                    // Draw Signature Image
                    try {
                        targetPage.drawImage(signatureImage, {
                            x: scaledX,
                            y: pdfY,
                            width: scaledWidth,
                            height: scaledHeight,
                        });

                        // Add tiny signature metadata under the box
                        targetPage.drawText(`Signed: ${new Date().toISOString().split('T')[0]}`, {
                            x: scaledX,
                            y: pdfY - 10,
                            size: 8,
                            font: helvetica,
                            color: rgb(0, 0, 0)
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

        // 4b. Create the Forensic Audit Certificate
        const certPage = pdfDoc.addPage([595.28, 841.89]); // A4 Size
        const certWidth = certPage.getWidth();
        const certHeight = certPage.getHeight();

        certPage.drawText('NODAL POINT | FORENSIC AUDIT CERTIFICATE', {
            x: 50,
            y: certHeight - 50,
            size: 16,
            font: helveticaBold,
            color: rgb(0, 0.184, 0.655) // #002FA7
        });

        certPage.drawText(`Document ID: ${request.document.id}`, { x: 50, y: certHeight - 90, size: 10, font: helvetica });
        certPage.drawText(`Original SHA-256 Hash: ${originalHash}`, { x: 50, y: certHeight - 110, size: 10, font: helvetica });
        certPage.drawText(`Signer: ${request.contact?.email || 'Unknown'}`, { x: 50, y: certHeight - 130, size: 10, font: helvetica });

        // Track the active cert page — overflow adds a labelled continuation page automatically
        let activeCertPage = certPage;
        const CERT_LEFT = 50;
        const CERT_MIN_Y = 80;    // reserve bottom 80pt for the footer line
        const CERT_ENTRY_HEIGHT = 52; // approx height consumed per telemetry entry (15 + 12 + 25)

        let currentY = certHeight - 170;
        activeCertPage.drawText('TELEMETRY TIMELINE:', { x: CERT_LEFT, y: currentY, size: 12, font: helveticaBold });
        currentY -= 20;

        if (telemetries) {
            telemetries.forEach((t) => {
                // If the next entry would bleed off the bottom of the current page, start a new one
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

        // Draw footer on whichever cert page was last written to
        activeCertPage.drawText('This document is electronically signed and secured by Nodal Point.', {
            x: CERT_LEFT,
            y: 50,
            size: 9,
            font: helvetica,
            color: rgb(0.4, 0.4, 0.4)
        });

        // 5. Save final PDF
        const finalPdfBytes = await pdfDoc.save();

        // 6. Upload final PDF to Supabase Storage
        const originalExt = request.document.name.split('.').pop();
        const originalNameNoExt = request.document.name.replace(`.${originalExt}`, '');
        const finalFileName = `${originalNameNoExt}_Signed_${Date.now()}.${originalExt}`;
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
                url: '' // private vault
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
            // Optionally update the deal stage to SECURED
            await supabaseAdmin.from('deals').update({ stage: 'SECURED' }).eq('id', request.deal_id);
        }

        // 8. Email Delivery
        try {
            const adminEmail = 'signal@nodalpoint.io';
            // Resolve agent email from the request metadata (set at dispatch time), then deal owner, then account owner.
            // Fall back to adminEmail so the notification inbox always receives a copy even when the chain is incomplete.
            const resolvedAgentEmail: string =
                request.metadata?.agentEmail ||
                request.deal?.ownerId ||
                request.account?.ownerId ||
                adminEmail;

            if (!request.metadata?.agentEmail && !request.deal?.ownerId && !request.account?.ownerId) {
                console.warn('[Execution Email] agentEmail could not be resolved for request', request.id, '— falling back to adminEmail for BCC.');
            }

            const zohoService = new ZohoMailService();
            await zohoService.initialize(adminEmail);

            // Upload attachment to Zoho first — non-fatal if it fails
            // (email still sends without attachment rather than silently dropping)
            let zohoAttachment = null;
            try {
                zohoAttachment = await zohoService.uploadAttachment(
                    adminEmail,
                    Buffer.from(finalPdfBytes),
                    finalFileName
                );
            } catch (attachErr: any) {
                console.error('[Execution Email] Attachment upload failed — sending without attachment:', attachErr.message);
            }

            const emailSubject = `Executed Contract: ${request.document.name}`;
            const emailHtml = `
          <div style="font-family: monospace; background-color: #09090b; color: #f4f4f5; padding: 40px; border: 1px solid #27272a; max-width: 600px; margin: 0 auto;">
            <h2 style="text-transform: uppercase; letter-spacing: 0.1em; color: #10b981; font-size: 14px; margin-bottom: 24px;">
              CONTRACT EXECUTED
            </h2>

            <p style="font-family: sans-serif; font-size: 15px; margin-bottom: 20px;">
              The contract <strong>${request.document.name}</strong> has been successfully executed.
            </p>

            <p style="font-family: sans-serif; font-size: 15px; margin-bottom: 24px;">
              A copy of the fully executed document with the attached Forensic Audit Certificate is attached for your records.
            </p>

            <div style="margin-top: 40px; font-size: 11px; color: #52525b; border-top: 1px solid #27272a; padding-top: 16px;">
              Nodal Point Forensic Systems
            </div>
          </div>
        `;

            // Log execution email in the CRM emails table for CRM visibility
            const execEmailId = `sig_exec_${Date.now()}_${request.id.substring(0, 8)}`;
            const { error: emailInsertError } = await supabaseAdmin.from('emails').insert({
                id: execEmailId,
                contactId: request.contact_id,
                accountId: request.account_id || null,
                ownerId: adminEmail,
                from: adminEmail,
                to: [request.contact.email],
                subject: emailSubject,
                html: emailHtml,
                text: `The contract has been executed. See attached.`,
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

            // BCC always resolves — agent inbox guaranteed a copy even when metadata chain is incomplete
            await zohoService.sendEmail({
                to: [request.contact.email],
                bcc: [resolvedAgentEmail],
                subject: emailSubject,
                html: emailHtml,
                text: `The contract has been executed. See attached.`,
                uploadedAttachments: zohoAttachment ? [zohoAttachment] : undefined,
                userEmail: adminEmail,
                fromName: 'Nodal Point Compliance'
            });
        } catch (emailError: any) {
            console.error('[Execution Email Failed]', emailError.message);
            // We do NOT fail the response, contract is legally executed and stored in vault
        }

        return res.status(200).json({ success: true, finalStoragePath });
    } catch (error: any) {
        console.error('[Signature Execution API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
