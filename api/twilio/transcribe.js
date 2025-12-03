import { cors } from '../_cors.js';

export default async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS centrally
    // This endpoint has been deprecated: Google STT removed; using Twilio native transcription elsewhere.
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Deprecated',
        message: 'Google STT-based /api/twilio/transcribe has been removed. Use Twilio native transcription handled by /api/twilio/recording.'
    }));
    return;
}
