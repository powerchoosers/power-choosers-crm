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

        if (request.status === 'signed' || request.status === 'completed') {
            return res.status(400).json({ error: 'Document has already been executed' });
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
                    // Draw Text input
                    const textContent = (textValues && textValues[index]) ? textValues[index] : '';
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

        let currentY = certHeight - 170;
        certPage.drawText('TELEMETRY TIMELINE:', { x: 50, y: currentY, size: 12, font: helveticaBold });
        currentY -= 20;

        if (telemetries) {
            telemetries.forEach((t) => {
                certPage.drawText(`[${new Date(t.created_at).toISOString()}] ACTION: ${t.action.toUpperCase()}`, { x: 50, y: currentY, size: 10, font: helveticaBold });
                currentY -= 15;
                certPage.drawText(`IP Address: ${t.ip_address || 'Unknown'}`, { x: 70, y: currentY, size: 9, font: helvetica });
                currentY -= 12;
                certPage.drawText(`Device/OS: ${t.user_agent ? t.user_agent.substring(0, 80) : 'Unknown'}`, { x: 70, y: currentY, size: 9, font: helvetica });
                currentY -= 25;
            });
        }

        certPage.drawText('This document is electronically signed and secured by Nodal Point.', {
            x: 50,
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
        const finalStoragePath = `accounts/${request.account_id}/${finalFileName}`;

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
            const zohoAuthEmail = request.metadata?.agentEmail || request.deal?.ownerId || request.account?.ownerId || 'noreply@nodalpoint.io';

            const zohoService = new ZohoMailService();
            await zohoService.initialize(zohoAuthEmail);

            const base64Attachment = Buffer.from(finalPdfBytes).toString('base64');

            // Upload attachment to Zoho first
            const zohoAttachment = await zohoService.uploadAttachment(
                zohoAuthEmail,
                Buffer.from(finalPdfBytes),
                finalFileName
            );

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

            await zohoService.sendEmail({
                to: [request.contact.email],
                bcc: [zohoAuthEmail], // directly BCC the sender
                subject: `Executed Contract: ${request.document.name}`,
                html: emailHtml,
                text: `The contract has been executed. See attached.`,
                uploadedAttachments: zohoAttachment ? [zohoAttachment] : undefined,
                userEmail: zohoAuthEmail,
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
