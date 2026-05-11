import { cors } from '../_cors.js';
import { ZohoMailService } from './zoho-service.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { userEmail, messageId, attachmentId, attachmentPath, folderId, filename: filenameParam } = req.method === 'POST' ? (req.body || {}) : (req.query || {});

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

        // Resolve the best guess at the filename from what was passed in
        const resolvedFilename = filenameParam
            || (attachmentPath ? String(attachmentPath).split('/').pop() : '')
            || (attachmentId ? String(attachmentId) : 'attachment');

        // Detect MIME type: prefer what Zoho returned, but if it's generic octet-stream
        // infer from the actual filename (not the attachment ID which is numeric)
        let resolvedContentType = contentType || 'application/octet-stream';
        if (resolvedContentType === 'application/octet-stream') {
            const ext = String(resolvedFilename).split('.').pop()?.toLowerCase();
            if (ext === 'pdf') resolvedContentType = 'application/pdf';
            else if (ext === 'jpg' || ext === 'jpeg') resolvedContentType = 'image/jpeg';
            else if (ext === 'png') resolvedContentType = 'image/png';
            else if (ext === 'gif') resolvedContentType = 'image/gif';
            else if (ext === 'webp') resolvedContentType = 'image/webp';
            else if (ext === 'docx') resolvedContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (ext === 'xlsx') resolvedContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            else if (ext === 'pptx') resolvedContentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        }

        // Sanitize filename for Content-Disposition header (strip quotes/newlines)
        const safeFilename = String(resolvedFilename).replace(/["\r\n]/g, '').trim() || 'attachment';

        res.setHeader('Content-Type', resolvedContentType);
        res.setHeader('Content-Length', fileBuffer.length);
        // inline = display in browser; filename ensures downloads get the correct extension
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
        res.status(200).send(fileBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to download attachment' });
    }
}
