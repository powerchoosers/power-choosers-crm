import { db } from './_firebase.js';

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

  const isProduction = process.env.NODE_ENV === 'production';

  // Ensure Firebase Admin is initialized with credentials
  if (!db) {
    console.error('[GenerateScheduledEmails] Firestore not initialized. Missing Firebase service account env vars.');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
    }));
    return;
  }

  // Check for Perplexity API key
  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('[GenerateScheduledEmails] CRITICAL: PERPLEXITY_API_KEY environment variable is not set!');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'PERPLEXITY_API_KEY environment variable is not set. Email generation cannot proceed.'
    }));
    return;
  }

  try {
    const { immediate = false } = req.body || {};
    
    if (!isProduction) {
    console.log('[GenerateScheduledEmails] Starting generation process, immediate:', immediate);
      console.log('[GenerateScheduledEmails] Perplexity API key present:', !!process.env.PERPLEXITY_API_KEY);
    }
    
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
    
    if (!isProduction) {
      console.log('[GenerateScheduledEmails] Time range:', { startTime, endTime, immediate, now });
    }
    
    // Query for scheduled emails that need generation
    // Use >= and <= to include boundary times
    // Limit to 40 emails per run to stay under 50 RPM rate limit (Tier 0)
    const scheduledEmailsQuery = db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'not_generated')
      .where('scheduledSendTime', '>=', startTime)
      .where('scheduledSendTime', '<=', endTime)
      .limit(40);
    
    const scheduledEmailsSnapshot = await scheduledEmailsQuery.get();
    
    if (scheduledEmailsSnapshot.empty) {
      if (!isProduction) {
      console.log('[GenerateScheduledEmails] No emails to generate');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No scheduled emails to generate' 
      }));
      return;
    }
    
    if (!isProduction) {
    console.log('[GenerateScheduledEmails] Found', scheduledEmailsSnapshot.size, 'emails to generate');
      console.log('[GenerateScheduledEmails] Rate limit: 50 RPM (Tier 0) - processing in batches');
    }
    
    let generatedCount = 0;
    const errors = [];
    
    // Process emails with rate limiting
    // Perplexity Tier 0: 50 RPM limit
    // Process in smaller batches of 10 with delays to avoid rate limiting
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 12000; // 12 seconds (allows 5 batches per minute = 50 requests)
    const docs = scheduledEmailsSnapshot.docs;
    
    for (let batchStart = 0; batchStart < docs.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, docs.length);
      const batch = docs.slice(batchStart, batchEnd);
      
      if (!isProduction) {
        console.log(`[GenerateScheduledEmails] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)} (${batch.length} emails)`);
      }
      
      // Process batch in parallel (10 at a time)
      await Promise.all(batch.map(async (emailDoc) => {
      try {
        const emailData = emailDoc.data();
        if (!isProduction) {
        console.log('[GenerateScheduledEmails] Processing email:', emailDoc.id);
        }
        
        // Get contact data for personalization
        let contactData = {};
        let accountData = {};
        if (emailData.contactId) {
          try {
            const contactDoc = await db.collection('people').doc(emailData.contactId).get();
            if (contactDoc.exists) {
              contactData = contactDoc.data();
              
              // Get account data for industry/exemption detection
              const accountId = contactData.accountId || contactData.account_id;
              if (accountId) {
                try {
                  const accountDoc = await db.collection('accounts').doc(accountId).get();
                  if (accountDoc.exists) {
                    accountData = accountDoc.data();
                  }
                } catch (error) {
                  console.warn('[GenerateScheduledEmails] Failed to get account data:', error);
                }
              }
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
          contactCompany: contactData.company || accountData.companyName || accountData.name || emailData.contactCompany || '',
          contactRole: contactData.role || contactData.title || contactData.job || '',
          accountIndustry: accountData.industry || contactData.industry || '',
          accountData: accountData,
          sequenceContext: {
            stepNumber: (emailData.stepIndex || 0) + 1,
            totalSteps: emailData.totalSteps || 1,
            previousInteractions: previousEmails
          }
        });
        
        // Update email with generated content
        // Ensure ownership fields are preserved/set
        const updateData = {
          subject: generatedContent.subject,
          html: generatedContent.html,
          text: generatedContent.text,
          status: 'pending_approval',
          generatedAt: Date.now(),
          generatedBy: 'scheduled_job',
          // Add angle metadata for tracking effectiveness
          angle_used: generatedContent.angle_used || null,
          exemption_type: generatedContent.exemption_type || null
        };
        
        // Add ownership fields if not already present
        if (emailData.ownerId) updateData.ownerId = emailData.ownerId;
        if (emailData.assignedTo) updateData.assignedTo = emailData.assignedTo;
        if (emailData.createdBy) updateData.createdBy = emailData.createdBy;
        
        await emailDoc.ref.update(updateData);
        
        generatedCount++;
        if (!isProduction) {
          console.log('[GenerateScheduledEmails] ✓ Generated email:', emailDoc.id);
        }
        
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
    })); // End Promise.all
      
      // Add delay between batches to respect rate limit (except after last batch)
      if (batchEnd < docs.length) {
        if (!isProduction) {
          console.log(`[GenerateScheduledEmails] Waiting ${DELAY_BETWEEN_BATCHES/1000}s before next batch to respect rate limit...`);
        }
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    } // End batch loop
    
    if (!isProduction) {
    console.log('[GenerateScheduledEmails] Generation complete. Generated:', generatedCount, 'Errors:', errors.length);
    }
    
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
async function generateEmailContent({ prompt, contactName, contactCompany, contactRole, accountIndustry, accountData, sequenceContext }) {
  try {
    // NEPQ ENHANCEMENT: Detect exemption status from industry
    let exemptionStatus = null;
    let exemptionDetails = null;
    
    if (accountIndustry) {
      // Industry to exemption mapping (same as email-compose-global.js)
      const industryExemptionMap = {
        'Manufacturing': 'Manufacturing',
        'Manufacturer': 'Manufacturing',
        'Industrial': 'Manufacturing',
        'Nonprofit': 'Nonprofit',
        'Non-Profit': 'Nonprofit',
        'Charity': 'Nonprofit',
        'Foundation': 'Nonprofit',
        '501(c)(3)': 'Nonprofit',
        'Government': 'Government',
        'Municipality': 'Government',
        'Public Sector': 'Government',
        'Healthcare': 'Nonprofit',
        'Hospital': 'Nonprofit',
        'RV Park': 'RVPark',
        'Mobile Home Park': 'RVPark',
        'Hospitality': 'RVPark',
        'Campground': 'RVPark'
      };
      
      const normalizedIndustry = String(accountIndustry).trim();
      exemptionStatus = industryExemptionMap[normalizedIndustry] || null;
      
      if (exemptionStatus) {
        // Exemption details (same as email-compose-global.js)
        const exemptionDetailsMap = {
          'Manufacturing': { typical_amount: '$75K–$200K', description: 'manufacturing facility electricity exemption' },
          'Nonprofit': { typical_amount: '$40K–$100K', description: '501(c)(3) tax-exempt organization electricity exemption' },
          'Government': { typical_amount: '$50K–$150K', description: 'government entity electricity exemption' },
          'RVPark': { typical_amount: '$75K–$300K', description: 'predominant use exemption (residential)' }
        };
        exemptionDetails = exemptionDetailsMap[exemptionStatus] || null;
        
        console.log('[NEPQ] Exemption detected for sequence email:', exemptionStatus, exemptionDetails?.typical_amount);
      }
    }
    
    // Build enhanced prompt with context
    let enhancedPrompt = prompt;
    
    if (contactName && contactName !== 'there') {
      enhancedPrompt = `Contact Name: ${contactName}\n` + enhancedPrompt;
    }
    
    if (contactCompany) {
      enhancedPrompt = `Company: ${contactCompany}\n` + enhancedPrompt;
    }
    
    if (contactRole) {
      enhancedPrompt = `Contact Role: ${contactRole}\n` + enhancedPrompt;
    }
    
    if (accountIndustry) {
      enhancedPrompt = `Industry: ${accountIndustry}\n` + enhancedPrompt;
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
    
    // Call Perplexity API with retry logic for rate limits
    let perplexityResponse;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds
    
    while (retryCount <= MAX_RETRIES) {
      try {
        perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
            model: 'sonar',
        messages: [
          {
            role: 'system',
                content: `You are an expert email writer for Power Choosers, an energy brokerage helping businesses secure lower electricity and natural gas rates. Follow ALL instructions in the prompt exactly.

${exemptionStatus && exemptionDetails ? `
🎯 NEPQ EXEMPTION-FIRST STRATEGY ACTIVE:
This is a ${exemptionStatus} organization - PRIORITIZE TAX EXEMPTION RECOVERY
- Exemption Type: ${exemptionDetails.description}
- Typical Refund Value: ${exemptionDetails.typical_amount} over 4 years
- Strategy: Lead with disarming question about exemption filing (not generic "10-20% savings")
- Example Hook: "Has your ${accountIndustry} facility filed for electricity sales tax exemption, or are you still paying sales tax on power?"
- Value Emphasis: "${exemptionDetails.typical_amount} in refunds + ongoing tax elimination" (2-5x more valuable than rate savings)
- CTA Format: Use yes/no questions (mobile-friendly, low friction)
- Position: Strategic tax consultant, not commodity broker
- AVOID: Repetitive "10-20% savings" messaging - exemption recovery is the priority
` : ''}

When writing emails:
1. ALWAYS use actual contact names and company information provided - NEVER use bracketed placeholders like {{name}} or [contact_first_name] in the final output
2. OUTPUT FORMAT: Write ONLY the email body and subject line - no metadata, no version labels, no markdown formatting, no statistics
3. Subject line should appear first as "Subject: [your subject]" followed by the email body${exemptionStatus ? ' (for exemption emails: "[FirstName], electricity tax exemption question")' : ''}
4. Use proper paragraph spacing (double line breaks between paragraphs)
5. End with "Best regards," followed by sender name
6. Do NOT include: **bold markdown**, # headers, \`\`\`code blocks\`\`\`, "HTML Version" labels, "Email Stats", "Word Count", or any metadata sections
7. Research proof: If the prompt asks you to research the company, do so and incorporate specific details naturally
8. NEPQ Principles: Use disarming questions (curious, not defensive), yes/no CTAs, angle variation (not repetitive messaging)${exemptionStatus ? '\n9. EXEMPTION PRIORITY: Start with exemption question, emphasize refund value, position as tax consultant' : ''}`
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
    
        // Check for rate limiting (429)
        if (perplexityResponse.status === 429) {
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const waitTime = RETRY_DELAY * retryCount; // Exponential backoff
            console.warn(`[GenerateScheduledEmails] Rate limited (429), retrying in ${waitTime/1000}s... (attempt ${retryCount}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw new Error(`Perplexity API rate limit exceeded after ${MAX_RETRIES} retries`);
        }
        
        // Check for other errors
    if (!perplexityResponse.ok) {
          const errorText = await perplexityResponse.text();
          throw new Error(`Perplexity API error ${perplexityResponse.status}: ${errorText}`);
        }
        
        // Success - break out of retry loop
        break;
        
      } catch (error) {
        if (retryCount >= MAX_RETRIES) {
          throw error;
        }
        retryCount++;
        const waitTime = RETRY_DELAY * retryCount;
        console.warn(`[GenerateScheduledEmails] API call failed, retrying in ${waitTime/1000}s... (attempt ${retryCount}/${MAX_RETRIES})`, error.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    const perplexityData = await perplexityResponse.json();
    const generatedText = perplexityData.choices[0].message.content;
    
    // Extract subject line (look for various patterns)
    let subject = 'Follow-up Email';
    const subjectPatterns = [
      /Subject[:\s]+(.+?)(?:\n|$)/i,
      /Subject Line[:\s]+(.+?)(?:\n|$)/i,
      /^#\s+(.+?)(?:\n|$)/m,
      /^\*\*Subject[:\s]*\*\*\s*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of subjectPatterns) {
      const match = generatedText.match(pattern);
      if (match && match[1]) {
        subject = match[1].trim()
          .replace(/^\*\*|\*\*$/g, '') // Remove markdown bold
          .replace(/^#+\s*/, '') // Remove markdown headers
          .trim();
        if (subject) break;
      }
    }
    
    // Extract clean email body - remove all metadata and formatting artifacts
    let bodyContent = generatedText;
    
    // Remove subject line and all its variations
    bodyContent = bodyContent.replace(/Subject[:\s]+.+?(?:\n|$)/gi, '');
    bodyContent = bodyContent.replace(/Subject Line[:\s]+.+?(?:\n|$)/gi, '');
    bodyContent = bodyContent.replace(/^\*\*Subject[:\s]*\*\*\s*.+?(?:\n|$)/gim, '');
    
    // Remove version markers (HTML Version, Plain Text Version, etc.)
    bodyContent = bodyContent.replace(/---[\s\S]*?---/g, '');
    bodyContent = bodyContent.replace(/HTML Version[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Plain Text Version[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/```html[\s\S]*?```/gi, '');
    bodyContent = bodyContent.replace(/```[\s\S]*?```/g, '');
    
    // Remove markdown headers and formatting
    bodyContent = bodyContent.replace(/^#+\s+.+?(?:\n|$)/gm, '');
    bodyContent = bodyContent.replace(/\*\*(.+?)\*\*/g, '$1'); // Remove bold markdown
    bodyContent = bodyContent.replace(/\*(.+?)\*/g, '$1'); // Remove italic markdown
    bodyContent = bodyContent.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Remove links, keep text
    
    // Remove email metadata sections
    bodyContent = bodyContent.replace(/Email Sequence[:\s]+.+?(?:\n|$)/gi, '');
    bodyContent = bodyContent.replace(/Step \d+ of \d+/gi, '');
    bodyContent = bodyContent.replace(/Email Breakdown[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Email Stats[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Email Specifications[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Research Proof[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Tone[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Word Count[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Paragraphs[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/CTA[:\s]*/gi, '');
    bodyContent = bodyContent.replace(/Personalization[:\s]*/gi, '');
    
    // Remove "Hi [Name]," if it appears multiple times (from examples)
    const lines = bodyContent.split('\n');
    let foundGreeting = false;
    bodyContent = lines.filter(line => {
      const trimmed = line.trim();
      if (/^Hi\s+\w+,?$/i.test(trimmed) || /^Hey\s+\w+,?$/i.test(trimmed)) {
        if (foundGreeting) return false; // Skip duplicate greetings
        foundGreeting = true;
      }
      return true;
    }).join('\n');
    
    // Clean up excessive whitespace
    bodyContent = bodyContent
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/^\s+|\s+$/gm, '') // Trim each line
      .replace(/^\s+|\s+$/g, '') // Trim entire content
      .replace(/\n\s*\n\s*\n/g, '\n\n'); // Clean up paragraph breaks
    
    // Remove any remaining HTML tags that shouldn't be there
    bodyContent = bodyContent.replace(/<[^>]+>/g, '');
    
    // Find the actual email content (usually starts with greeting)
    const greetingMatch = bodyContent.match(/(?:^|\n)(Hi|Hey|Hello|Dear)\s+\w+[,\n]/i);
    if (greetingMatch) {
      const startIndex = bodyContent.indexOf(greetingMatch[0]);
      bodyContent = bodyContent.substring(startIndex).trim();
    }
    
    // Remove signature placeholders and add proper signature
    bodyContent = bodyContent.replace(/—\s*\[Your Name\]/g, '');
    bodyContent = bodyContent.replace(/Thanks?,\s*\[Your Name\]/gi, '');
    bodyContent = bodyContent.replace(/\[Your Name\]/g, '');
    bodyContent = bodyContent.replace(/—\s*$/gm, '');
    
    // Add proper signature if not present
    const hasSignature = /(Best regards|Regards|Thanks|Thank you|Sincerely)/i.test(bodyContent);
    if (!hasSignature && bodyContent.trim()) {
      // Get sender name from settings or use default
      const senderName = 'Power Choosers Team'; // You can enhance this to get from settings
      bodyContent = bodyContent.trim() + '\n\nBest regards,\n' + senderName;
    }
    
    // Ensure proper paragraph spacing (double line breaks between paragraphs)
    bodyContent = bodyContent
      .replace(/\n\n\n+/g, '\n\n') // Max 2 newlines
      .trim();
    
    // Create HTML version with proper paragraph tags
    const htmlContent = bodyContent
      .split(/\n\n+/) // Split by double newlines (paragraphs)
      .map(para => para.trim().replace(/\n/g, '<br>')) // Convert single newlines to <br>
      .filter(para => para.length > 0) // Remove empty paragraphs
      .map(para => `<p>${para}</p>`) // Wrap in <p> tags
      .join('\n');
    
    // Create plain text version (clean, with proper spacing)
    const textContent = bodyContent
      .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
      .trim();
    
    return {
      subject: subject.trim() || 'Follow-up Email',
      html: htmlContent || `<p>${bodyContent.replace(/\n/g, '<br>')}</p>`,
      text: textContent || bodyContent,
      // Metadata for tracking angle effectiveness
      angle_used: exemptionStatus ? 'exemption_recovery' : 'timing_risk', // Default if not specified
      exemption_type: exemptionStatus || null,
      exemption_details: exemptionDetails || null
    };
    
  } catch (error) {
    console.error('[GenerateScheduledEmails] Perplexity API error:', error);
    console.error('[GenerateScheduledEmails] Error details:', {
      message: error.message,
      status: error.status,
      response: error.response
    });
    
    // Re-throw the error instead of silently failing with fallback content
    // This ensures the email stays in 'not_generated' status so we can retry
    throw new Error(`Perplexity API failed: ${error.message}`);
  }
}
