// CORS middleware
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.end();
return;
return;
return;
return;
return;
return;
return;
        return;
    }
    next();
}

export default async function handler(req, res) {
    corsMiddleware(req, res, () => {});
    // This endpoint has been deprecated: Google STT removed; using Twilio native transcription elsewhere.
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Deprecated',
        message: 'Google STT-based /api/twilio/transcribe has been removed. Use Twilio native transcription handled by /api/twilio/recording.'
    }));
    return;
}
