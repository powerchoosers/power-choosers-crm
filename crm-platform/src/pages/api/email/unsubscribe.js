import { supabaseAdmin } from '../_supabase.js';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { email } = req.body;
    
    if (!email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email address is required' }));
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid email address' }));
      return;
    }

    logger.log(`[Unsubscribe] Processing unsubscribe for: ${email}`);

    if (!supabaseAdmin) {
      logger.error('[Unsubscribe] Supabase client not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }

    // 1. Add to suppressions table (Upsert to handle duplicates)
    // ID is the email address in this table design
    const { error: suppressionError } = await supabaseAdmin
      .from('suppressions')
      .upsert({
        id: email,
        reason: 'unsubscribed',
        details: 'User unsubscribed via web form',
        source: 'web_form',
        suppressedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

    if (suppressionError) {
      logger.error('[Unsubscribe] Error adding to suppressions:', suppressionError);
      // We continue to try updating the contact record even if suppression table fails
    }

    // 2. Update contact record(s) in contacts table
    // We update metadata to reflect the unsubscribe status
    let updatedContactsCount = 0;
    
    try {
      const { data: contacts, error: fetchError } = await supabaseAdmin
        .from('contacts')
        .select('id, metadata')
        .eq('email', email);

      if (fetchError) throw fetchError;

      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          const currentMeta = contact.metadata || {};
          const newMeta = {
            ...currentMeta,
            emailStatus: 'unsubscribed',
            emailSuppressed: true,
            suppressionReason: 'User unsubscribed via web form',
            suppressedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const { error: updateError } = await supabaseAdmin
            .from('contacts')
            .update({
              metadata: newMeta,
              updatedAt: new Date().toISOString()
            })
            .eq('id', contact.id);

          if (!updateError) {
            updatedContactsCount++;
          } else {
            logger.error(`[Unsubscribe] Failed to update contact ${contact.id}:`, updateError);
          }
        }
        logger.log(`[Unsubscribe] Updated ${updatedContactsCount} contact record(s) for: ${email}`);
      }
    } catch (err) {
      logger.error('[Unsubscribe] Error updating contacts:', err);
    }

    // 3. Pause active sequences
    // TODO: Implement sequence pausing for Supabase architecture.
    // The legacy code paused 'sequenceExecutions' in Firestore.
    // In the new architecture, we rely on the 'suppressions' table check during sending,
    // or need to update 'sequence_members' / 'sequence_activations'.
    // For now, we log this as a pending action.
    logger.warn(`[Unsubscribe] Sequence pausing skipped for ${email} - Logic pending migration to Supabase sequences`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Successfully unsubscribed',
      email: email,
      pausedSequences: 0 // Placeholder
    }));

  } catch (error) {
    logger.error('[Unsubscribe] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to process unsubscribe request',
      message: error.message 
    }));
    return;
  }
}
