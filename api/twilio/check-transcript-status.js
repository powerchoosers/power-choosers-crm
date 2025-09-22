import twilio from 'twilio';

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const transcriptSid = req.query.transcriptSid || req.body?.transcriptSid;
    const callSid = req.query.callSid || req.body?.callSid;
    
    if (!transcriptSid && !callSid) {
      res.statusCode = 400; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'transcriptSid or callSid is required' }));
      return;
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;

    let transcript = null;
    
    if (transcriptSid) {
      // Direct transcript lookup
      transcript = await client.intelligence.v2.transcripts(transcriptSid).fetch();
    } else if (callSid && serviceSid) {
      // Find transcript by callSid (customerKey)
      const transcripts = await client.intelligence.v2.transcripts.list({
        serviceSid: serviceSid,
        limit: 50
      });
      
      transcript = transcripts.find(t => t.customerKey === callSid);
      if (!transcript) {
        res.statusCode = 404; res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ 
          error: 'No transcript found for callSid',
          callSid,
          availableTranscripts: transcripts.length
        }));
        return;
      }
    }

    if (!transcript) {
      res.statusCode = 404; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'Transcript not found' }));
      return;
    }

    // Get detailed transcript information
    const result = {
      transcriptSid: transcript.sid,
      status: transcript.status,
      customerKey: transcript.customerKey,
      dateCreated: transcript.dateCreated,
      dateUpdated: transcript.dateUpdated,
      language: transcript.language,
      url: transcript.url,
      serviceSid: transcript.serviceSid
    };

    // If completed, get additional details
    if (transcript.status === 'completed') {
      try {
        const sentences = await client.intelligence.v2.transcripts(transcript.sid).sentences.list();
        result.sentenceCount = sentences.length;
        result.hasContent = sentences.length > 0;
        
        // Get summary if available
        try {
          const summary = await client.intelligence.v2.transcripts(transcript.sid).summary.fetch();
          result.summary = summary.summary;
        } catch (_) {
          // Summary might not be available
        }
      } catch (e) {
        console.warn('[Check Status] Error fetching transcript details:', e.message);
      }
    }

    res.statusCode = 200; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(result));
    
  } catch (e) {
    console.error('[Check Status] Error:', e);
    const twilioCode = e && (e.code || e.status || e.statusCode);
    let friendly = 'Failed to check transcript status';
    if (twilioCode === 20404) friendly = 'Transcript not found';
    else if (twilioCode === 20003) friendly = 'Authentication error';
    
    res.statusCode = (twilioCode && Number(twilioCode) >= 400 && Number(twilioCode) < 600) ? 400 : 500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error: friendly, details: e?.message, code: twilioCode }));
  }
}
