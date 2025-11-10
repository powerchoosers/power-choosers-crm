import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { immediate = false } = req.body || {};
    
    console.log('[GenerateScheduledEmails] Starting generation process, immediate:', immediate);
    
    // Calculate time range for emails to generate
    const now = Date.now();
    let startTime, endTime;
    
    if (immediate) {
      // For immediate generation, get all not_generated emails (including those scheduled for now or future)
      // Use a small buffer to include emails scheduled for "now" (within last minute)
      startTime = now - (60 * 1000); // 1 minute buffer to catch emails scheduled for "now"
      endTime = now + (365 * 24 * 60 * 60 * 1000); // 1 year from now
    } else {
      // For daily 8 AM job, get emails scheduled for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startTime = today.getTime();
      endTime = startTime + (24 * 60 * 60 * 1000); // 24 hours
    }
    
    console.log('[GenerateScheduledEmails] Time range:', { startTime, endTime, immediate, now });
    
    // Query for scheduled emails that need generation
    // Use >= and <= to include boundary times
    const scheduledEmailsQuery = db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'not_generated')
      .where('scheduledSendTime', '>=', startTime)
      .where('scheduledSendTime', '<=', endTime);
    
    const scheduledEmailsSnapshot = await scheduledEmailsQuery.get();
    
    if (scheduledEmailsSnapshot.empty) {
      console.log('[GenerateScheduledEmails] No emails to generate');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No scheduled emails to generate' 
      }));
      return;
    }
    
    console.log('[GenerateScheduledEmails] Found', scheduledEmailsSnapshot.size, 'emails to generate');
    
    let generatedCount = 0;
    const errors = [];
    
    // Process each email
    for (const emailDoc of scheduledEmailsSnapshot.docs) {
      try {
        const emailData = emailDoc.data();
        console.log('[GenerateScheduledEmails] Processing email:', emailDoc.id);
        
        // Get contact data for personalization
        let contactData = {};
        if (emailData.contactId) {
          try {
            const contactDoc = await db.collection('people').doc(emailData.contactId).get();
            if (contactDoc.exists) {
              contactData = contactDoc.data();
            }
          } catch (error) {
            console.warn('[GenerateScheduledEmails] Failed to get contact data:', error);
          }
        }
        
        // Get previous sequence emails for context
        let previousEmails = [];
        if (emailData.sequenceId && emailData.contactId) {
          try {
            const previousEmailsQuery = await db.collection('emails')
              .where('sequenceId', '==', emailData.sequenceId)
              .where('contactId', '==', emailData.contactId)
              .where('type', 'in', ['sent', 'scheduled'])
              .orderBy('createdAt', 'desc')
              .limit(3)
              .get();
            
            previousEmails = previousEmailsQuery.docs.map(doc => ({
              subject: doc.data().subject,
              content: doc.data().text || doc.data().html,
              sentAt: doc.data().sentAt || doc.data().createdAt
            }));
          } catch (error) {
            console.warn('[GenerateScheduledEmails] Failed to get previous emails:', error);
          }
        }
        
        // Generate email content using Perplexity API
        const generatedContent = await generateEmailContent({
          prompt: emailData.aiPrompt || 'Write a professional follow-up email',
          contactName: contactData.firstName || contactData.name || emailData.contactName || 'there',
          contactCompany: contactData.company || emailData.contactCompany || '',
          sequenceContext: {
            stepNumber: (emailData.stepIndex || 0) + 1,
            totalSteps: emailData.totalSteps || 1,
            previousInteractions: previousEmails
          }
        });
        
        // Update email with generated content
        await emailDoc.ref.update({
          subject: generatedContent.subject,
          html: generatedContent.html,
          text: generatedContent.text,
          status: 'pending_approval',
          generatedAt: Date.now(),
          generatedBy: 'scheduled_job'
        });
        
        generatedCount++;
        console.log('[GenerateScheduledEmails] Generated email:', emailDoc.id);
        
      } catch (error) {
        console.error('[GenerateScheduledEmails] Failed to generate email:', emailDoc.id, error);
        errors.push({
          emailId: emailDoc.id,
          error: error.message
        });
        
        // Update email status to error
        try {
          await emailDoc.ref.update({
            status: 'error',
            errorMessage: error.message,
            generatedAt: Date.now()
          });
        } catch (updateError) {
          console.error('[GenerateScheduledEmails] Failed to update error status:', updateError);
        }
      }
    }
    
    console.log('[GenerateScheduledEmails] Generation complete. Generated:', generatedCount, 'Errors:', errors.length);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: generatedCount,
      errors: errors.length,
      errorDetails: errors
    }));
    
  } catch (error) {
    console.error('[GenerateScheduledEmails] Fatal error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// Generate email content using Perplexity API
async function generateEmailContent({ prompt, contactName, contactCompany, sequenceContext }) {
  try {
    // Build enhanced prompt with context
    let enhancedPrompt = prompt;
    
    if (contactName && contactName !== 'there') {
      enhancedPrompt = `Contact Name: ${contactName}\n` + enhancedPrompt;
    }
    
    if (contactCompany) {
      enhancedPrompt = `Company: ${contactCompany}\n` + enhancedPrompt;
    }
    
    if (sequenceContext.stepNumber > 1) {
      enhancedPrompt = `This is step ${sequenceContext.stepNumber} of ${sequenceContext.totalSteps} in our email sequence.\n` + enhancedPrompt;
    }
    
    if (sequenceContext.previousInteractions.length > 0) {
      enhancedPrompt += `\n\nPrevious email interactions with this contact:\n`;
      sequenceContext.previousInteractions.forEach((email, index) => {
        enhancedPrompt += `${index + 1}. Subject: ${email.subject}\n`;
        if (email.content) {
          const preview = email.content.substring(0, 200) + '...';
          enhancedPrompt += `   Content: ${preview}\n`;
        }
      });
    }
    
    // Call Perplexity API
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are an expert email writer for business development and sales. Write professional, personalized emails that build relationships and drive engagement. Always use natural language personalization - never use bracketed placeholders like {{name}}. Instead, use actual contact names and company information provided. Generate both HTML and plain text versions of the email.'
          },
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });
    
    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }
    
    const perplexityData = await perplexityResponse.json();
    const generatedText = perplexityData.choices[0].message.content;
    
    // Parse the generated content to extract subject and body
    const subjectMatch = generatedText.match(/Subject:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : 'Follow-up Email';
    
    // Extract body content (everything after subject or first line)
    let bodyContent = generatedText;
    if (subjectMatch) {
      bodyContent = generatedText.replace(/Subject:\s*.+/i, '').trim();
    }
    
    // Clean up the body content
    bodyContent = bodyContent.replace(/^(Subject:|Email:|Message:)\s*/i, '').trim();
    
    // Create HTML version
    const htmlContent = bodyContent
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
    
    // Create plain text version
    const textContent = bodyContent
      .replace(/\n\n/g, '\n\n')
      .replace(/\n/g, '\n');
    
    return {
      subject,
      html: htmlContent,
      text: textContent
    };
    
  } catch (error) {
    console.error('[GenerateScheduledEmails] Perplexity API error:', error);
    
    // Fallback content
    return {
      subject: `Follow-up from ${contactCompany || 'our team'}`,
      html: `<p>Hi ${contactName},</p><p>I hope this email finds you well. I wanted to follow up on our recent conversation.</p><p>Best regards,<br>Your Team</p>`,
      text: `Hi ${contactName},\n\nI hope this email finds you well. I wanted to follow up on our recent conversation.\n\nBest regards,\nYour Team`
    };
  }
}
