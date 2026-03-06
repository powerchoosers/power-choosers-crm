import { cors } from '../_cors.js';
import { ZohoMailService } from './zoho-service.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { userEmail, messageId, attachmentId, folderId } = req.body || {};

    if (!userEmail || !messageId || !attachmentId) {
        res.status(400).json({ error: 'Missing required fields: userEmail, messageId, attachmentId' });
        return;
    }

    try {
        const zohoService = new ZohoMailService();
        const { fileBuffer, contentType } = await zohoService.downloadAttachment(
            String(userEmail),
            String(messageId),
            String(attachmentId),
            folderId ? String(folderId) : 'inbox'
        );

        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.setHeader('Content-Length', fileBuffer.length);
        res.status(200).send(fileBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to download attachment' });
    }
}
