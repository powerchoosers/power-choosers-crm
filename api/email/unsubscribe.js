import { db } from '../_firebase.js';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    console.log(`[Unsubscribe] Processing unsubscribe for: ${email}`);

    // Add to suppressions collection
    await db.collection('suppressions').doc(email).set({
      email: email,
      reason: 'unsubscribed',
      details: 'User unsubscribed via web form',
      suppressedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'web_form'
    });

    // Update contact status in people collection
    const peopleQuery = await db.collection('people')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!peopleQuery.empty) {
      const contactDoc = peopleQuery.docs[0];
      await contactDoc.ref.update({
        emailStatus: 'unsubscribed',
        emailSuppressed: true,
        suppressionReason: 'User unsubscribed via web form',
        suppressedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      console.log(`[Unsubscribe] Updated contact record for: ${email}`);
    }

    // Pause any active sequences for this contact
    const sequencesQuery = await db.collection('sequenceExecutions')
      .where('contact.email', '==', email)
      .where('status', '==', 'active')
      .get();

    let pausedSequences = 0;
    for (const sequenceDoc of sequencesQuery.docs) {
      await sequenceDoc.ref.update({
        status: 'paused',
        pauseReason: 'unsubscribed',
        pausedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      pausedSequences++;
    }

    console.log(`[Unsubscribe] Successfully unsubscribed ${email}, paused ${pausedSequences} sequences`);

    return res.status(200).json({
      success: true,
      message: 'Successfully unsubscribed',
      email: email,
      pausedSequences: pausedSequences
    });

  } catch (error) {
    console.error('[Unsubscribe] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process unsubscribe request',
      message: error.message 
    });
  }
}
