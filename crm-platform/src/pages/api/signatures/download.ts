import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing secure token' });
    }

    try {
        // 1. Fetch request and validate
        const { data: request, error: fetchError } = await supabaseAdmin
            .from('signature_requests')
            .select('*, document:documents(*)')
            .eq('access_token', token)
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ error: 'Invalid or expired secure token' });
        }

        // 2. Download the original PDF from Supabase Storage
        const storagePath = request.document.storage_path;
        const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
            .from('vault')
            .download(storagePath);

        if (downloadError || !pdfData) {
            throw new Error(`Failed to download original document: ${downloadError?.message}`);
        }

        const pdfBuffer = await pdfData.arrayBuffer();

        // 3. Modify PDF with pdf-lib to add the "FOR REVIEW ONLY" banner
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const bannerHeight = 26;
        const bannerText = 'FOR REVIEW ONLY — DO NOT SIGN THIS COPY. PLEASE USE THE SECURE E-SIGN PORTAL.';

        pages.forEach((page) => {
            const { width, height } = page.getSize();

            // Draw red banner background
            page.drawRectangle({
                x: 0,
                y: height - bannerHeight,
                width: width,
                height: bannerHeight,
                color: rgb(0.8, 0, 0),
            });

            // Draw white text in banner
            const textWidth = boldFont.widthOfTextAtSize(bannerText, 10);
            page.drawText(bannerText, {
                x: (width - textWidth) / 2,
                y: height - (bannerHeight / 2) - 4,
                size: 10,
                font: boldFont,
                color: rgb(1, 1, 1),
            });
        });

        const modifiedPdfBytes = await pdfDoc.save();

        // 4. Send response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${request.document.name.replace('.pdf', '')}_Review_Only.pdf"`);
        return res.send(Buffer.from(modifiedPdfBytes));

    } catch (error: any) {
        console.error('[Signature Download API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
