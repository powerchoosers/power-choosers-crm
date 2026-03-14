import { cors } from '../_cors.js';
import { ZohoMailService } from './zoho-service.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { userEmail, messageId, attachmentId, attachmentPath, folderId } = req.method === 'POST' ? (req.body || {}) : (req.query || {});

    if (!userEmail || !messageId || (!attachmentId && !attachmentPath)) {
        res.status(400).json({ error: 'Missing required fields: userEmail, messageId, attachmentId or attachmentPath' });
        return;
    }

    try {
        const zohoService = new ZohoMailService();
        const { fileBuffer, contentType } = await zohoService.downloadAttachment(
            String(userEmail),
            String(messageId),
            attachmentId ? String(attachmentId) : '',
            folderId ? String(folderId) : 'inbox',
            attachmentPath ? String(attachmentPath) : ''
        );

        if (contentType === 'application/octet-stream' && attachmentId) {
            const ext = String(attachmentId).split('.').pop()?.toLowerCase();
            if (ext === 'pdf') res.setHeader('Content-Type', 'application/pdf');
            else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        } else {
            res.setHeader('Content-Type', contentType || 'application/octet-stream');
        }

        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', 'inline');
        res.status(200).send(fileBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to download attachment' });
    }
}
