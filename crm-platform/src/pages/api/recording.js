import https from 'https';
import logger from './_logger.js';

/**
 * Recording Proxy API
 * Allows browser <audio> tags to play Twilio recordings even when 
 * "Enforce HTTP Auth on Media" is enabled in the Twilio Console.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { url, sid } = req.query;

    let mediaUrl = url;
    if (sid && !mediaUrl) {
        mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${sid}.mp3`;
    }

    if (!mediaUrl) {
        return res.status(400).json({ error: 'Missing url or sid parameter' });
    }

    // Security check: Only allow Twilio URLs
    if (!mediaUrl.includes('twilio.com')) {
        return res.status(403).json({ error: 'Forbidden: Only Twilio media can be proxied' });
    }

    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            logger.error('[RecordingProxy] Missing Twilio credentials');
            return res.status(500).json({ error: 'Twilio credentials not configured' });
        }

        // Add MP3 extension if missing and not already there
        if (!mediaUrl.includes('.mp3') && !mediaUrl.includes('.wav') && mediaUrl.includes('/Recordings/')) {
            mediaUrl = mediaUrl.includes('?') ? mediaUrl.replace('?', '.mp3?') : `${mediaUrl}.mp3`;
        }

        // Ensure RequestedChannels=2 if it's a Twilio URL and we want dual playback
        if (mediaUrl.includes('api.twilio.com') && !mediaUrl.includes('RequestedChannels')) {
            mediaUrl += (mediaUrl.includes('?') ? '&' : '?') + 'RequestedChannels=2';
        }

        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const options = {
            headers: { 'Authorization': `Basic ${auth}` }
        };

        https.get(mediaUrl, options, (twilioRes) => {
            if (twilioRes.statusCode >= 400) {
                logger.error('[RecordingProxy] Twilio fetch failed', { status: twilioRes.statusCode, url: mediaUrl });
                res.status(twilioRes.statusCode).end();
                return;
            }

            // Forward relevant headers
            res.setHeader('Content-Type', twilioRes.headers['content-type'] || 'audio/mpeg');
            if (twilioRes.headers['content-length']) {
                res.setHeader('Content-Length', twilioRes.headers['content-length']);
            }
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');

            // Pipe the stream directly to the response
            twilioRes.pipe(res);
        }).on('error', (e) => {
            logger.error('[RecordingProxy] Network error', { message: e.message });
            if (!res.writableEnded) {
                res.status(500).end();
            }
        });

    } catch (err) {
        logger.error('[RecordingProxy] Exception', { message: err.message });
        if (!res.writableEnded) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
