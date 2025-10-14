// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    // This endpoint has been deprecated: Google STT removed; using Twilio native transcription elsewhere.
    res.status(410).json({
        error: 'Deprecated',
        message: 'Google STT-based /scripts/api/twilio/transcribe has been removed. Use Twilio native transcription handled by /api/twilio/recording.'
    });
}
