import { render } from '@react-email/render';
import { ZohoMailService } from './zoho-service.js';
import CustomerDiagnostic from '../../../emails/CustomerDiagnostic';
import AdminIntelligence from '../../../emails/AdminIntelligence';
import { resolveIdentity } from '../../../actions/enrich-contact';
import logger from '../_logger.js';
import { cors } from '../_cors.js';
import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase'; // Use Admin client for API route operations
import React from 'react';

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { email, analysisData, fileData, fileName } = req.body;

    if (!email || !analysisData) {
        res.status(400).json({ error: 'Missing email or analysisData' });
        return;
    }

    try {
        logger.info(`[Analysis-Notification] Initializing protocol for: ${email}`, 'notify');

        // 1. Resolve Identity (Silent Handshake)
        const identity = await resolveIdentity(email);

        const stats = {
            grade: analysisData.analysis?.grade || 'N/A',
            savings: analysisData.analysis?.potentialSavings || '$0',
            risk: analysisData.analysis?.riskLevel || 'MEDIUM',
            location: analysisData.service_address || 'Texas Facility',
            zone: analysisData.analysis?.zone || 'ERCOT'
        };

        const companyInfo = {
            name: identity?.company || analysisData.customer_name || 'Prospect Entity',
            domain: email.split('@')[1],
        };

        const analysisDetails = {
            id: analysisData.id || `ANL_${Date.now()}`,
            provider: analysisData.providerName || analysisData.provider_name || 'Unknown',
            rate: analysisData.energy_rate_per_kwh || '0',
            usage: analysisData.total_usage_kwh || '0',
            grade: stats.grade
        };

        // Links
        const reportLink = `https://nodalpoint.io/bill-debugger?id=${analysisDetails.id}`;
        const crmLink = `https://nodalpoint.io/network/contacts/${email}`;
        const analysisLink = reportLink;

        // --- FILE HANDLING (Data Locker + Zoho Attachment) ---
        let uploadedAttachments: any[] = [];

        if (fileData && identity?.accountId) {
            try {
                logger.info('[Analysis-Notification] Processing bill attachment...', 'notify');

                // Decode Base64
                // base64Data comes as "data:application/pdf;base64,JVBER..." usually, need to strip prefix
                const base64Content = fileData.split(';base64,').pop();
                const fileBuffer = Buffer.from(base64Content, 'base64');
                const safeFileName = fileName || `bill_${Date.now()}.pdf`;

                // A. Upload to Supabase Storage (Vault)
                const storagePath = `accounts/${identity.accountId}/${Date.now()}_${safeFileName}`;

                const { error: uploadError } = await supabaseAdmin.storage
                    .from('vault')
                    .upload(storagePath, fileBuffer, {
                        contentType: 'application/pdf', // Best guess or pass mimeType from frontend
                        upsert: true
                    });

                if (uploadError) {
                    logger.error('[Analysis-Notification] Storage upload failed:', uploadError, 'notify');
                } else {
                    // B. Create Document Record
                    const { error: dbError } = await supabaseAdmin
                        .from('documents')
                        .insert({
                            account_id: identity.accountId,
                            name: safeFileName,
                            size: formatBytes(fileBuffer.length),
                            type: 'application/pdf',
                            storage_path: storagePath,
                            url: '' // Private file
                        });

                    if (dbError) logger.error('[Analysis-Notification] Document DB insert failed:', dbError, 'notify');
                    else logger.info('[Analysis-Notification] Bill saved to Data Locker.', 'notify');
                }

                // C. Upload to Zoho (for Email Attachment)
                const zohoService = new ZohoMailService() as any;
                const ADMIN_EMAIL = 'l.patterson@nodalpoint.io'; // Must be the sender or authorized user

                const zohoAttachment = await zohoService.uploadAttachment(ADMIN_EMAIL, fileBuffer, safeFileName);
                if (zohoAttachment) {
                    uploadedAttachments.push(zohoAttachment);
                }

            } catch (fileErr) {
                logger.error('[Analysis-Notification] File handling error:', fileErr, 'notify');
                // Continue sending email even if file handling fails
            }
        }


        // 2. Render Emails
        const customerHtml = await render(
            <CustomerDiagnostic
                name={identity?.firstName || 'Valued Client'}
                company={companyInfo.name}
                stats={stats}
                reportLink={reportLink}
            />
        );

        const adminHtml = await render(
            <AdminIntelligence
                person={{
                    fullName: identity?.name || 'Unknown Entity',
                    firstName: identity?.firstName || '',
                    lastName: identity?.lastName || '',
                    title: identity?.title || 'Professional',
                    email: email,
                    location: identity?.location,
                    linkedin: identity?.linkedinUrl
                }}
                company={companyInfo}
                analysis={analysisDetails}
                crmLink={crmLink}
                analysisLink={analysisLink}
            />
        );

        // 3. Send via Zoho
        const zohoService = new ZohoMailService() as any;
        const ADMIN_EMAIL = 'l.patterson@nodalpoint.io';
        const ALIAS_EMAIL = 'signal@nodalpoint.io';

        // Send to Visitor
        await zohoService.sendEmail({
            to: email,
            subject: `Signal Detected: ${companyInfo.name} // Forensic Snapshot`,
            html: customerHtml,
            from: ALIAS_EMAIL,
            fromName: 'Nodal Point',
            userEmail: ADMIN_EMAIL
        });

        // Send to Admin (With Attachment)
        await zohoService.sendEmail({
            to: ADMIN_EMAIL,
            subject: `[NEW_INTEL] ${companyInfo.name} // ${identity?.name || email}`,
            html: adminHtml,
            from: ALIAS_EMAIL,
            fromName: 'Nodal Intelligence',
            userEmail: ADMIN_EMAIL,
            uploadedAttachments: uploadedAttachments // Attach the bill here
        });

        logger.info(`[Analysis-Notification] Protocol complete for: ${email}`, 'notify');

        res.status(200).json({ success: true });
    } catch (error: any) {
        logger.error('[Analysis-Notification] Strategic failure:', error, 'notify');
        res.status(500).json({ error: error.message });
    }
}
