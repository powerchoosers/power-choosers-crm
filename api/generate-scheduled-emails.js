import { db } from './_firebase.js';

// ========== INDUSTRY DETECTION FUNCTIONS ==========

// Infer industry from company name
function inferIndustryFromCompanyName(companyName) {
  if (!companyName) return '';
  
  const name = String(companyName).toLowerCase();
  
  // Manufacturing
  if (/\b(manufacturing|manufacturer|industrial|factory|plant|fabrication|production|assembly)\b/i.test(name)) {
    return 'Manufacturing';
  }
  
  // Hospitality
  if (/\b(hotel|inn|motel|resort|lodge|restaurant|cafe|dining|hospitality)\b/i.test(name)) {
    return 'Hospitality';
  }
  
  // Healthcare
  if (/\b(hospital|clinic|medical|healthcare|health\s*care|physician|doctor|dental|pharmacy)\b/i.test(name)) {
    return 'Healthcare';
  }
  
  // Retail
  if (/\b(retail|store|shop|market|outlet|merchandise|boutique)\b/i.test(name)) {
    return 'Retail';
  }
  
  // Logistics/Transportation
  if (/\b(logistics|transportation|warehouse|shipping|freight|delivery|distribution|trucking)\b/i.test(name)) {
    return 'Logistics';
  }
  
  // Data Center
  if (/\b(data\s*center|datacenter|server|hosting|cloud|colo)\b/i.test(name)) {
    return 'DataCenter';
  }
  
  // Nonprofit
  if (/\b(nonprofit|non-profit|charity|foundation|501c3|501\(c\)\(3\))\b/i.test(name)) {
    return 'Nonprofit';
  }
  
  return '';
}

// Infer industry from account description
function inferIndustryFromDescription(description) {
  if (!description) return '';
  
  const desc = String(description).toLowerCase();
  
  // Hospitality
  if (/\b(hotel|inn|motel|resort|lodge|accommodation|hospitality|guest|room|booking|stay)\b/i.test(desc)) {
    return 'Hospitality';
  }
  
  // Restaurant/Food
  if (/\b(restaurant|cafe|dining|food|beverage|menu|cuisine|chef)\b/i.test(desc)) {
    return 'Hospitality';
  }
  
  // Manufacturing
  if (/\b(manufacturing|production|factory|plant|industrial|assembly|fabrication)\b/i.test(desc)) {
    return 'Manufacturing';
  }
  
  // Healthcare
  if (/\b(hospital|clinic|medical|healthcare|patient|treatment|diagnosis|surgery)\b/i.test(desc)) {
    return 'Healthcare';
  }
  
  // Retail
  if (/\b(retail|store|merchandise|shopping|customer|product|sale)\b/i.test(desc)) {
    return 'Retail';
  }
  
  // Logistics
  if (/\b(logistics|warehouse|shipping|distribution|freight|transportation|delivery)\b/i.test(desc)) {
    return 'Logistics';
  }
  
  // Data Center
  if (/\b(data\s*center|server|hosting|cloud|infrastructure|computing)\b/i.test(desc)) {
    return 'DataCenter';
  }
  
  // Nonprofit
  if (/\b(nonprofit|charity|foundation|mission|donation|volunteer)\b/i.test(desc)) {
    return 'Nonprofit';
  }
  
  return '';
}

// ========== ANGLE SELECTION SYSTEM ==========
// Simplified RANDOMIZED_ANGLES_BY_INDUSTRY (matches email-compose-global.js structure)
const RANDOMIZED_ANGLES_BY_INDUSTRY = {
  Manufacturing: {
    angles: [
      {
        id: 'exemption_recovery',
        weight: 0.30,
        primaryMessage: 'electricity tax exemption recovery',
        openingTemplate: 'Are you currently claiming electricity exemptions on your production facilities?',
        primaryValue: '$75K-$500K in unclaimed exemptions over 4 years',
        condition: (accountData) => accountData?.taxExemptStatus === 'Manufacturing'
      },
      {
        id: 'demand_efficiency',
        weight: 0.25,
        primaryMessage: 'consumption efficiency before renewal',
        openingTemplate: 'Are you optimizing consumption before you renew your contract?',
        primaryValue: '12-20% consumption reduction before rate shopping'
      },
      {
        id: 'timing_strategy',
        weight: 0.25,
        primaryMessage: 'early contract renewal timing',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early',
        situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.'
      },
      {
        id: 'consolidation',
        weight: 0.20,
        primaryMessage: 'multi-plant consolidation',
        openingTemplate: 'How many facilities are you managing energy for, and are they on different contracts?',
        primaryValue: '10-20% savings by consolidating all locations'
      }
    ]
  },
  Nonprofit: {
    angles: [
      {
        id: 'exemption_recovery',
        weight: 0.40,
        primaryMessage: 'tax exemption + refund recovery',
        openingTemplate: 'Is your organization filing electricity exemption certificates?',
        primaryValue: '$50K-$300K redirected to programs annually',
        condition: (accountData) => accountData?.taxExemptStatus === 'Nonprofit'
      },
      {
        id: 'mission_funding',
        weight: 0.35,
        primaryMessage: 'mission-focused budget optimization',
        openingTemplate: 'How are you making sure more funding goes to your mission, not vendors?',
        primaryValue: '10-20% savings redirected to programs'
      },
      {
        id: 'budget_stability',
        weight: 0.25,
        primaryMessage: 'budget predictability',
        openingTemplate: 'When budgeting for energy, are you locking in costs or dealing with volatility?',
        primaryValue: 'Fixed costs for better program planning'
      }
    ]
  },
  Retail: {
    angles: [
      {
        id: 'consolidation',
        weight: 0.40,
        primaryMessage: 'multi-location consolidation',
        openingTemplate: 'How many locations are you managing energy for?',
        primaryValue: '10-20% savings by consolidating all locations'
      },
      {
        id: 'timing_strategy',
        weight: 0.35,
        primaryMessage: 'early renewal timing',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early'
      },
      {
        id: 'operational_simplicity',
        weight: 0.25,
        primaryMessage: 'centralized operations',
        openingTemplate: 'How much time are you spending managing energy renewals across your network?',
        primaryValue: 'Single vendor, simplified management'
      }
    ]
  },
  Healthcare: {
    angles: [
      {
        id: 'exemption_recovery',
        weight: 0.35,
        primaryMessage: 'tax exemption',
        openingTemplate: 'Is your healthcare facility claiming electricity exemptions?',
        primaryValue: '$50K-$200K in unclaimed exemptions',
        condition: (accountData) => accountData?.taxExemptStatus === 'Nonprofit'
      },
      {
        id: 'consolidation',
        weight: 0.40,
        primaryMessage: 'multi-facility consolidation',
        openingTemplate: 'How many facilities are you managing energy for, and are they all renewing on different schedules?',
        primaryValue: '10-20% savings by consolidating all facilities'
      },
      {
        id: 'operational_continuity',
        weight: 0.25,
        primaryMessage: 'uptime guarantee',
        openingTemplate: 'What\'s more critical—energy savings or guaranteed uptime?',
        primaryValue: 'Predictable costs without operational disruption'
      }
    ]
  },
  DataCenter: {
    angles: [
      {
        id: 'demand_efficiency',
        weight: 0.45,
        primaryMessage: 'demand-side efficiency',
        openingTemplate: 'Are you optimizing consumption before you renew your contract?',
        primaryValue: '12-20% consumption reduction before rate shopping'
      },
      {
        id: 'timing_strategy',
        weight: 0.35,
        primaryMessage: 'AI-driven demand timing',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early'
      },
      {
        id: 'data_governance',
        weight: 0.20,
        primaryMessage: 'unified metering',
        openingTemplate: 'How are you managing energy across your data centers?',
        primaryValue: 'Unified metering and reporting'
      }
    ]
  },
  Logistics: {
    angles: [
      {
        id: 'consolidation',
        weight: 0.45,
        primaryMessage: 'multi-location volume leverage',
        openingTemplate: 'How many locations are you managing energy for?',
        primaryValue: '10-20% savings by consolidating all locations'
      },
      {
        id: 'timing_strategy',
        weight: 0.35,
        primaryMessage: 'strategic renewal timing',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early'
      },
      {
        id: 'operational_efficiency',
        weight: 0.20,
        primaryMessage: 'warehouse efficiency',
        openingTemplate: 'Are you optimizing consumption before you renew your contract?',
        primaryValue: '12-20% consumption reduction'
      }
    ]
  },
  Hospitality: {
    angles: [
      {
        id: 'consolidation',
        weight: 0.40,
        primaryMessage: 'multi-property consolidation',
        openingTemplate: 'How many properties are you managing energy for, and are they all on different renewal schedules?',
        primaryValue: '10-20% savings by consolidating all properties'
      },
      {
        id: 'timing_strategy',
        weight: 0.35,
        primaryMessage: 'seasonal planning',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early'
      },
      {
        id: 'operational_efficiency',
        weight: 0.25,
        primaryMessage: 'guest comfort + cost control',
        openingTemplate: 'Are you optimizing consumption before you renew your contract?',
        primaryValue: '12-20% consumption reduction'
      }
    ]
  },
  Default: {
    angles: [
      {
        id: 'timing_strategy',
        weight: 0.40,
        primaryMessage: 'strategic contract renewal',
        openingTemplate: 'When does your current electricity contract expire?',
        primaryValue: '10-20% better rates when locking in 6 months early'
      },
      {
        id: 'cost_control',
        weight: 0.35,
        primaryMessage: 'cost predictability',
        openingTemplate: 'Are rising electricity costs affecting your budget?',
        primaryValue: 'Predictable costs for better planning'
      },
      {
        id: 'operational_simplicity',
        weight: 0.25,
        primaryMessage: 'simplified procurement',
        openingTemplate: 'How much time are you spending managing energy procurement versus focusing on your core business?',
        primaryValue: 'Single vendor, simplified management'
      }
    ]
  }
};

// Select randomized angle based on industry
function selectRandomizedAngle(industry, manualAngleOverride, accountData) {
  // Normalize industry
  let normalizedIndustry = (industry || '').toString().trim();
  if (!normalizedIndustry) {
    normalizedIndustry = 'Default';
  }
  
  // Get angles for this industry
  const industryConfig = RANDOMIZED_ANGLES_BY_INDUSTRY[normalizedIndustry] || RANDOMIZED_ANGLES_BY_INDUSTRY.Default;
  let availableAngles = industryConfig.angles || [];
  
  // Filter angles by conditions if accountData provided
  if (accountData) {
    availableAngles = availableAngles.filter(angle => {
      if (angle.condition && typeof angle.condition === 'function') {
        return angle.condition(accountData);
      }
      return true;
    });
  }
  
  // If no angles available after filtering, use all angles
  if (availableAngles.length === 0) {
    availableAngles = industryConfig.angles || [];
  }
  
  // If still no angles, use Default
  if (availableAngles.length === 0) {
    availableAngles = RANDOMIZED_ANGLES_BY_INDUSTRY.Default.angles;
  }
  
  // Manual override takes precedence
  if (manualAngleOverride) {
    const overrideAngle = availableAngles.find(a => a.id === manualAngleOverride);
    if (overrideAngle) return overrideAngle;
  }
  
  // Weighted random selection
  const random = Math.random();
  let cumulative = 0;
  
  for (const angle of availableAngles) {
    cumulative += angle.weight || 0;
    if (random <= cumulative) {
      return angle;
    }
  }
  
  // Fallback to first angle
  return availableAngles[0] || RANDOMIZED_ANGLES_BY_INDUSTRY.Default.angles[0];
}

// Select random tone opener
function selectRandomToneOpener(angleId = null) {
  const openers = [
    "Genuine question—",
    "Let me ask you something—",
    "Been wondering—",
    "You ever considered—",
    "So here's the thing—",
    "This might sound random, but—",
    "Honestly—",
    "Looking at your situation—",
    "Question for you—",
    "Here's what I'm seeing—",
    "Most people I talk to—",
    "From what I'm hearing—",
    "I've found that teams like yours—"
  ];
  return openers[Math.floor(Math.random() * openers.length)];
}

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
      // For immediate generation, get all not_generated emails (including past-due, current, and future)
      // Look back 30 days to catch any emails that were scheduled in the past but not generated
      startTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days ago
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
        
        // Detect industry and select angle (same logic as sequence-builder.js)
        let recipientIndustry = accountData.industry || contactData.industry || '';
        
        // Infer industry from company name if not set
        if (!recipientIndustry && emailData.contactCompany) {
          recipientIndustry = inferIndustryFromCompanyName(emailData.contactCompany);
        }
        
        // Infer from account description if still not set
        if (!recipientIndustry && accountData) {
          const accountDesc = accountData.shortDescription || accountData.short_desc || 
                             accountData.descriptionShort || accountData.description || 
                             accountData.companyDescription || accountData.accountDescription || '';
          if (accountDesc) {
            recipientIndustry = inferIndustryFromDescription(accountDesc);
          }
        }
        
        // Default to 'Default' if no industry detected
        if (!recipientIndustry) {
          recipientIndustry = 'Default';
        }
        
        // Select angle based on industry/role/exemption status
        const recipient = {
          firstName: contactData.firstName || contactData.name || emailData.contactName || 'there',
          company: contactData.company || accountData.companyName || accountData.name || emailData.contactCompany || '',
          title: contactData.role || contactData.title || contactData.job || '',
          industry: recipientIndustry,
          account: accountData
        };
        
        const selectedAngle = selectRandomizedAngle(recipientIndustry, null, recipient);
        const toneOpener = selectRandomToneOpener(selectedAngle?.id);
        
        if (!isProduction) {
          console.log(`[GenerateScheduledEmails] Selected angle: ${selectedAngle?.id}, tone: ${toneOpener}, industry: ${recipientIndustry}`);
        }
        
        // Generate email content using /api/perplexity-email endpoint (which has full angle system)
        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const perplexityResponse = await fetch(`${baseUrl}/api/perplexity-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: emailData.aiPrompt || 'Write a professional follow-up email',
            mode: 'html',
            templateType: 'cold_email',
            recipient: recipient,
            selectedAngle: selectedAngle,
            toneOpener: toneOpener,
            senderName: 'Lewis Patterson'
          })
        });
        
        if (!perplexityResponse.ok) {
          throw new Error(`Perplexity email API error: ${perplexityResponse.status}`);
        }
        
        const perplexityResult = await perplexityResponse.json();
        
        if (!perplexityResult.ok) {
          throw new Error(`Perplexity email API failed: ${perplexityResult.error || 'Unknown error'}`);
        }
        
        // Build HTML template from structured JSON data (same as sequence-builder.js preview)
        const outputData = perplexityResult.output || {};
        const htmlContent = buildColdEmailHtmlTemplate(outputData, recipient);
        const textContent = buildTextVersionFromHtml(htmlContent);
        
        // Format the result to match expected structure
        const generatedContent = {
          subject: outputData.subject || 'Follow-up Email',
          html: htmlContent,
          text: textContent,
          angle_used: selectedAngle?.id || null,
          exemption_type: accountData?.taxExemptStatus || null
        };
        
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

// Build cold email HTML template (matches sequence-builder.js preview)
function buildColdEmailHtmlTemplate(data, recipient) {
  const company = recipient?.company || recipient?.accountName || 'Your Company';
  const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
  const industry = recipient?.industry || recipient?.account?.industry || '';
  
  // Default sender profile
  const senderName = 'Lewis Patterson';
  const senderTitle = 'Energy Strategist';
  const senderCompany = 'Power Choosers';
  
  // Clean data fields (remove citations)
  const cleanField = (field) => {
    if (!field) return '';
    return String(field).replace(/\[\d+\]/g, '').trim();
  };
  
  const greeting = cleanField(data.greeting) || `Hi ${firstName},`;
  const openingHook = cleanField(data.opening_hook) || `I tried reaching you earlier but couldn't connect. I wanted to share some important information about energy cost trends that could significantly impact ${company}.`;
  const valueProposition = cleanField(data.value_proposition) || (industry ? `Most ${industry} companies like ${company} see 10-20% savings through competitive procurement. The process is handled end-to-end—analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>` : 'Most businesses see 10-20% savings through competitive procurement and efficiency solutions. The process is handled end-to-end—analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>');
  const socialProof = cleanField(data.social_proof_optional) || '';
  const ctaText = cleanField(data.cta_text) || 'Explore Your Savings Potential';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#dc2626;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#fee2e2; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .solution-box { background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);
      border:1px solid #99f6e4; padding:18px 20px; margin:0 24px 18px 24px;
      border-radius:8px; box-shadow:0 2px 8px rgba(20,184,166,0.06);
    }
    .solution-box h3 { margin:0 0 10px 0; color:#0f766e; font-size:16px; }
    .solution-box p { margin:0; color:#1f2937; font-size:15px; line-height:1.5; }
    .social-proof { background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);
      padding:14px 18px; margin:0 24px 18px 24px; border-radius:8px;
    }
    .social-proof p { margin:0; color:#1e40af; font-size:14px; font-style:italic; line-height:1.5; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#fee2e2; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(239,68,68,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#ef4444; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(239,68,68,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#dc2626;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">⚠️ Energy Costs Rising Fast</div>
    <div class="intro">
      <p>${greeting}</p>
      <p>${openingHook}</p>
    </div>
    <div class="solution-box">
      <h3>✓ How Power Choosers Helps</h3>
      <p>${valueProposition}</p>
    </div>
    ${socialProof ? `<div class="social-proof"><p>${socialProof}</p></div>` : ''}
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${ctaText}</a>
      <div style="margin-top:8px;font-size:14px;color:#dc2626;opacity:0.83;">
        Quick 15-minute call to discuss your options—no obligation.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${senderName}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${senderTitle}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${senderCompany}</div>
      </div>
    </div>
    <div class="footer">
      Power Choosers &bull; Your Energy Partner<br>
      &copy; 2025 PowerChoosers.com. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}

// Build plain text version from HTML
function buildTextVersionFromHtml(html) {
  // Remove HTML tags and decode entities
  let text = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract main content (between intro and signature)
  const lines = text.split(/\s+/).filter(Boolean);
  return lines.join(' ').substring(0, 1000); // Limit length
}

// NOTE: Old generateEmailContent function removed - now using /api/perplexity-email endpoint directly
// This ensures consistent angle selection and HTML template formatting across all email generation paths
