// Track email performance metrics for AI optimization
// Expects POST { emailId, recipientEmail, subjectStyle, ctaType, openingStyle, timestamp, event }
import logger from './_logger.js';
import { supabaseAdmin } from '@/lib/supabase';

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://nodalpoint.io',
    'https://nodal-point-network.vercel.app'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const {
      emailId,
      recipientEmail,
      subjectStyle,
      ctaType,
      openingStyle,
      timestamp,
      event // 'sent', 'opened', 'replied', 'bounced'
    } = req.body;

    if (!emailId || !event) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'emailId and event are required' }));
      return;
    }

    const now = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    // Fetch existing email record to merge tracking data
    const { data: existing } = await supabaseAdmin
      .from('emails')
      .select('openCount, clickCount, opens, clicks, metadata')
      .eq('id', emailId)
      .maybeSingle();

    if (existing) {
      const updates = { updatedAt: now };

      if (event === 'opened') {
        const prevOpens = Array.isArray(existing.opens) ? existing.opens : [];
        updates.openCount = (existing.openCount || 0) + 1;
        updates.opens = [...prevOpens, { at: now, email: recipientEmail }];
      } else if (event === 'clicked') {
        const prevClicks = Array.isArray(existing.clicks) ? existing.clicks : [];
        updates.clickCount = (existing.clickCount || 0) + 1;
        updates.clicks = [...prevClicks, { at: now, email: recipientEmail }];
      }

      // Persist style metadata for AI optimization if provided
      if (subjectStyle || ctaType || openingStyle) {
        const prevMeta = existing.metadata || {};
        updates.metadata = {
          ...prevMeta,
          subjectStyle: subjectStyle || prevMeta.subjectStyle,
          ctaType: ctaType || prevMeta.ctaType,
          openingStyle: openingStyle || prevMeta.openingStyle,
        };
      }

      if (Object.keys(updates).length > 1) {
        const { error: updateError } = await supabaseAdmin
          .from('emails')
          .update(updates)
          .eq('id', emailId);

        if (updateError) {
          logger.error('[Tracking] Failed to update email record:', updateError);
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tracked: true }));
    return;
  } catch (e) {
    logger.error('[Tracking Error]', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to track event' }));
    return;
  }
}


