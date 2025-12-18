import { db } from './_firebase.js';
import * as IndustryDetection from './_industry-detection.js';
import { 
  getAngleCta, 
  getIndustryOpener,
  ANGLE_IDS,
  getAngleById,
  getIndustryProof
} from './_angle-definitions.js';

// ========== EM DASH REMOVAL ==========
// Remove em dashes and hyphens from email content and replace with commas or natural flow
function removeEmDashes(text) {
  if (!text) return text;
  const before = String(text);
  const hasEmDash = /[—–]/.test(before);
  const hasHyphens = /(\w+)-(\w+)-(\w+)/.test(before); // Compound adjectives like "higher-than-expected"
  const after = before
    // Replace em dash (—) and en dash (–) at end of phrases with comma or nothing
    .replace(/(\w+)\s*[—–]\s+/g, '$1, ')  // "Curious—" → "Curious, "
    .replace(/(\w+)\s*[—–]$/g, '$1')      // "Curious—" at end → "Curious"
    .replace(/\s*[—–]\s+/g, ', ')         // Any remaining dashes → comma
    // Replace compound adjectives with hyphens (e.g., "higher-than-expected" → "higher than expected")
    .replace(/(\w+)-(\w+)-(\w+)/g, '$1 $2 $3')  // "higher-than-expected" → "higher than expected"
    .replace(/(\w+)-(\w+)/g, (match, p1, p2) => {
      // Only replace if it's a compound adjective pattern, not regular hyphenated words
      const compoundPatterns = ['higher-than', 'lower-than', 'more-than', 'less-than', 'better-than', 'worse-than', 'longer-than', 'shorter-than'];
      if (compoundPatterns.some(p => match.toLowerCase().includes(p))) {
        return `${p1} ${p2}`;
      }
      return match; // Keep other hyphens (e.g., "energy-intensive", "24/7")
    });
  
  return after;
}

// ========== BAD GENERATION DETECTION ==========

/**
 * Detect malformed AI generations that should not be sent
 * Returns { isValid: boolean, reason: string }
 */
function validateGeneratedContent(html, text, subject) {
  const content = (html || '') + ' ' + (text || '') + ' ' + (subject || '');
  const contentLower = content.toLowerCase();
  
  // Patterns that indicate the AI returned a "meta" response instead of actual email
  const badPatterns = [
    // AI asking for more information
    { pattern: /i appreciate the detailed personalization/i, reason: 'AI asked for more information instead of generating' },
    { pattern: /i need to clarify/i, reason: 'AI asked for clarification' },
    { pattern: /what i need to proceed/i, reason: 'AI requested more details' },
    { pattern: /please share the recipient/i, reason: 'AI requested recipient info' },
    { pattern: /once you provide these details/i, reason: 'AI waiting for details' },
    { pattern: /to write this email following your/i, reason: 'AI explaining what it needs' },
    { pattern: /i'll generate.*once you/i, reason: 'AI conditional generation' },
    { pattern: /\*\*the issue:\*\*/i, reason: 'AI meta-response with issue header' },
    { pattern: /\*\*what i need:\*\*/i, reason: 'AI meta-response with needs header' },
    { pattern: /\*\*confirmation:\*\*/i, reason: 'AI asking for confirmation' },
    
    // Unfilled placeholders
    { pattern: /\[contact_first_name\]/i, reason: 'Unfilled placeholder: contact_first_name' },
    { pattern: /\[contact_company\]/i, reason: 'Unfilled placeholder: contact_company' },
    { pattern: /\[contact_job_title\]/i, reason: 'Unfilled placeholder: contact_job_title' },
    { pattern: /\[company_industry\]/i, reason: 'Unfilled placeholder: company_industry' },
    { pattern: /\[contact_linkedin_recent_activity\]/i, reason: 'Unfilled placeholder: linkedin_activity' },
    { pattern: /\[city\]|\[state\]/i, reason: 'Unfilled placeholder: location' },
    { pattern: /\{\{[a-z_]+\}\}/i, reason: 'Unfilled mustache placeholder' },
    
    // Invalid recent activity mentions (when no activity exists)
    { pattern: /no recent (public )?activity (showing up|available|found)/i, reason: 'Invalid mention of "no recent activity" - sounds like placeholder text' },
    { pattern: /with no recent (public )?activity/i, reason: 'Invalid mention of "no recent activity" - sounds like placeholder text' },
    { pattern: /no recent public activity showing up/i, reason: 'Invalid mention of "no recent public activity" - sounds like placeholder text' },
    
    // Other meta patterns
    { pattern: /recipient details:/i, reason: 'AI listing required details' },
    { pattern: /company information:/i, reason: 'AI listing required info' },
    { pattern: /i'll write the email immediately/i, reason: 'AI promising to write later' },
    { pattern: /personalization instructions/i, reason: 'AI referencing instructions' },
    // Raw JSON artifacts (means parsing failed)
    { pattern: /"subject"\s*:\s*"/i, reason: 'Raw JSON response detected' },
    { pattern: /"greeting"\s*:\s*"/i, reason: 'Raw JSON response detected' },
    { pattern: /\{\s*"subject"\s*:/i, reason: 'Raw JSON response detected' }
  ];
  
  for (const { pattern, reason } of badPatterns) {
    if (pattern.test(content)) {
      return { isValid: false, reason };
    }
  }
  
  // Check for suspiciously short content (less than 50 chars excluding HTML tags)
  const textOnly = (text || '').replace(/<[^>]+>/g, '').trim();
  if (textOnly.length < 50) {
    return { isValid: false, reason: 'Content too short (less than 50 characters)' };
  }
  
  // Check for missing subject
  if (!subject || subject.trim().length < 5) {
    return { isValid: false, reason: 'Missing or invalid subject line' };
  }
  
  return { isValid: true, reason: null };
}

// ========== NEPQ VALIDATION ==========
// Guardrails to keep generations aligned with NEPQ rules
function validateNepqContent(subject, text, toneOpener) {
  // CRITICAL: Remove em dashes from body text BEFORE validation
  let body = removeEmDashes((text || '').toString());
  // CRITICAL: Remove em dashes from tone opener if it has any (use local variable)
  const cleanToneOpener = toneOpener ? removeEmDashes(toneOpener) : null;
  const lower = body.toLowerCase();
  const errors = [];

  // Forbidden phrases that trigger "old model" sales tone
  // NOTE: Removed "I noticed/saw/read" ban - AI needs to be able to say "I noticed you opened a new facility"
  const forbidden = [
    /hope this email finds you well/i,
    /just following up/i,
    /\bmy name is\b/i,
    /wanted to (reach out|introduce)/i
  ];
  if (forbidden.some(rx => rx.test(body))) {
    errors.push('Contains forbidden salesy phrasing (hope this finds you well, just following up, my name is, wanted to reach out).');
  }

  // Check for weak/generic opening patterns that don't create friction
  const weakOpeningPatterns = [
    /quick question about/i,
    /wondering if/i,
    /curious if/i,
    /thought i'd reach out/i,
    /noticed you might be/i
  ];

  const hasWeakOpening = weakOpeningPatterns.some(pattern => {
    return pattern.test(body.substring(0, 200)); // Check first 200 chars
  });

  if (hasWeakOpening) {
    // Don't error, but log for analysis: this opener could be stronger
    console.log('[NEPQ] Weak opening detected - consider using industry-specific angle');
  }

  // Check for observable pain points (high friction CTAs)
  const observablePainPatterns = [
    /most.*we (audit|find|discover)/i,
    /\d+%.*overpay/i,
    /are you.*\?/i, // Questions that require admission
    /when was (the|your) last/i
  ];

  const hasObservablePain = observablePainPatterns.some(pattern => {
    return pattern.test(body);
  });

  // This is optional - just telemetry for now (check if it's a cold email by looking for cold email patterns)
  const isColdStep = body.toLowerCase().includes('hello') && (body.toLowerCase().includes('question') || body.toLowerCase().includes('how are you') || body.toLowerCase().includes('are you'));
  if (!hasObservablePain && isColdStep) {
    console.log('[NEPQ] No observable pain point detected in cold email - consider adding specific pain');
  }

  // Tone opener pattern check - CREATIVE FREEDOM APPROACH
  // The email should start with ANY conversational opener that sounds human
  // The tone opener is provided as INSPIRATION only - we check for natural conversational patterns, not exact matches
  // Use the already-sanitized cleanToneOpener
  if (cleanToneOpener) {
    // Helper function to check if text has a valid conversational opener pattern
    // This accepts ANY natural conversational opener, not just the selected tone opener
    const hasValidToneOpenerPattern = (text) => {
      if (!text || typeof text !== 'string') return false;
      
      const lower = text.toLowerCase().trim();
      // Remove any leading newlines/whitespace for cleaner matching
      const cleanText = lower.replace(/^\s+/, '');
      
      // Check for ANY conversational opener pattern (not a fixed list)
      // Valid patterns: soft curiosity, direct questions, peer observations
      const textStart = cleanText.substring(0, 100);
      
      // Soft curiosity starters
      const softCuriosityPattern = /^(curious|wondering|wonder if|not sure|quick question about|question:|are you|how are you|do you|when you)/i;
      
      // Peer/observation starters (without "I noticed/saw")
      const peerPattern = /^(usually|most teams|from what|ive found|tend to see)/i;
      
      // Known conversational openers (kept for compatibility, not required)
      // REMOVED "real talk" - not professional enough for corporate America
      const knownOpeners = [
        "let me ask", "so here's", "honestly", "looking at", "here's what", "most people",
        "from what", "quick question"
      ];
      
      // Check if any known opener appears near the start
      const hasKnownOpener = knownOpeners.some(opener => {
        const idx = textStart.indexOf(opener);
        return idx !== -1 && idx < 100; // Must be within first 100 chars
      });
      if (hasKnownOpener) return true;
      
      // Check for soft curiosity pattern
      if (softCuriosityPattern.test(textStart)) return true;
      
      // Check for peer/observation pattern
      if (peerPattern.test(textStart)) return true;
      
      // Pattern-based check: conversational opener (NO em dashes required)
      // Pattern: short phrase (2-6 words) followed by question or natural flow
      // Openers can flow naturally without punctuation separators
      // REMOVED "real talk" from pattern - not professional enough for corporate America
      const openerPattern = /^(so|here's|let me|question|honestly|curious|looking at|most people|from what|i've found|you ever|did you|ever think|quick|are you|how are you|do you|when you|wondering|wonder if|not sure|out of curiosity)\s+[^?]{0,60}\?/i;
      if (openerPattern.test(textStart)) return true;
      
      // Also check for simple conversational patterns (no dash required)
      const simplePatterns = [
        // REMOVED "real talk" from pattern - not professional enough for corporate America
        /^(so|here's|let me|question|honestly|curious|are you|how are you|do you|wondering|wonder if|out of curiosity)\s+/i,
        /^[a-z\s]{2,40}\?/i  // Direct question
      ];
      return simplePatterns.some(pattern => pattern.test(textStart));
    };
    
    // Check if body has a valid tone opener pattern (not just exact match)
    const greetingMatch = body.match(/^(Hi|Hello|Hey)\s+[^\n]*,?\n?/i);
    const bodyAfterGreeting = greetingMatch ? body.slice(greetingMatch[0].length).trim() : body;
    const hasValidOpener = hasValidToneOpenerPattern(bodyAfterGreeting);
    
    // Also check for exact match (for backward compatibility) - use already-sanitized cleanToneOpener
    const openerIdx = cleanToneOpener ? body.toLowerCase().indexOf(cleanToneOpener.toLowerCase()) : -1;

    // Tone opener validation - CREATIVE FREEDOM: We accept ANY natural conversational opener
    // The selected tone opener is inspiration only - we don't require exact matching
    // Only auto-insert if NO conversational opener detected at all
    if (!hasValidOpener && openerIdx === -1) {
      if (greetingMatch) {
        const greeting = greetingMatch[0];
        const restOfBody = body.slice(greeting.length).trim();
        
        // Check if a valid conversational opener pattern exists
        const hasValidOpenerPattern = hasValidToneOpenerPattern(restOfBody);
        
        if (hasValidOpenerPattern) {
          // Body already has a good opener - just ensure proper spacing
          if (!greeting.endsWith('\n\n') && !greeting.endsWith('\n')) {
            body = greeting.trim() + '\n\n' + restOfBody;
          } else if (greeting.endsWith('\n') && !greeting.endsWith('\n\n')) {
            body = greeting.trim() + '\n' + restOfBody;
          }
        } else {
          // No opener detected - auto-insert ONE conversational opener (any style)
          // We'll insert a simple version and let the AI's original phrasing take precedence
          const cleanGreeting = greeting.trim();
          // Only insert if body is too short or completely lacks any opener pattern
          if (restOfBody.length > 20 && !restOfBody.match(/^\w+\s+\w+\s*\?/i)) {
            // Body has content but no question - might need opener
            body = cleanGreeting + '\n\n' + restOfBody;
          } else if (restOfBody.length < 20) {
            // Body is empty or too short - definitely needs opener
            const bodyBefore = body;
            // CRITICAL: Use the already-sanitized cleanToneOpener (or sanitize fallback)
            const openerToInsert = cleanToneOpener || removeEmDashes('Quick question');
            body = cleanGreeting + '\n\n' + openerToInsert + ' ' + restOfBody;
          }
        }
      }
      // Removed error - tone opener is now optional
    } else if (!hasValidOpener && openerIdx > 200) {
      // Optional warning (not an error) - body should start with conversational element, but it's not mandatory
      // logger.warn(`Email may benefit from opening with a conversational question instead of a statement`);
    }
  }

  // Conversational questions: require at least two
  const questionCount = (body.match(/\?/g) || []).length;
  
  // Auto-fix: If only 1 question found, add a problem-awareness question to the hook
  if (questionCount === 1) {
    const greetingMatch = body.match(/^(Hi|Hello|Hey)\s+[^\n]+,?\n?\n?/i);
    if (greetingMatch) {
      const greeting = greetingMatch[0];
      const afterGreeting = body.slice(greeting.length).trim();
      
      // Check if first sentence after greeting is a statement (no question mark)
      const firstSentenceMatch = afterGreeting.match(/^([^.!?\n]+)([.!?])/);
      if (firstSentenceMatch && !firstSentenceMatch[0].includes('?')) {
        // Convert first sentence to a question
        const firstSentence = firstSentenceMatch[1].trim();
        const punctuation = firstSentenceMatch[2];
        const restOfBody = afterGreeting.slice(firstSentenceMatch[0].length).trim();
        
        // Smart conversion: add ERCOT context and convert to question
        let questionVersion = firstSentence;
        if (!questionVersion.toLowerCase().startsWith('how') && !questionVersion.toLowerCase().startsWith('are you') && !questionVersion.toLowerCase().startsWith('when')) {
          // Try to convert statement to question with ERCOT context
          questionVersion = 'Given the recent volatility in ERCOT, how are you handling ' + firstSentence.toLowerCase().replace(/^the\s+/, '').replace(/\.$/, '') + '?';
        } else {
          questionVersion = firstSentence + '?';
        }
        
        body = greeting + questionVersion + (restOfBody ? '\n\n' + restOfBody : '');
      }
    }
  }
  
  // Re-check question count after auto-fix
  const finalQuestionCount = (body.match(/\?/g) || []).length;
  if (finalQuestionCount === 0) {
    errors.push('Email must include at least one question (problem-awareness or qualifying CTA).');
  } else if (finalQuestionCount === 1) {
    // Warning only - allow 1 question for natural tone
  }

  // High-friction CTAs (avoid scheduling asks, but allow "worth a look")
  const highFriction = [
    /\b15\s*minutes?\b/i,
    /\b30\s*minutes?\b/i,
    /\bschedule\b.*\b(call|meeting)\b/i,
    /\bbook\b.*\b(call|meeting)\b/i,
    /\bcalendar\b/i,
    /\btime on (your|the) calendar\b/i
  ];
  if (highFriction.some(rx => rx.test(lower))) {
    errors.push('CTA appears high-friction (asks to schedule time). Use a simple qualifying question instead.');
  }

  // Subject spamminess (avoid pitchy words)
  const spammySubjects = [/save/i, /free/i, /% off/i, /deal/i];
  if (subject && spammySubjects.some(rx => rx.test(subject))) {
    errors.push('Subject sounds like a pitch (contains save/free/% off/deal).');
  }

  const result = {
    isValid: errors.length === 0,
    reason: errors.join(' '),
    modifiedBody: body // Return the potentially modified body
  };
  return result;
}

// ========== PREVIEW GENERATION (NO WRITES) ==========
async function generatePreviewEmail(emailData) {
  if (!emailData || typeof emailData !== 'object') {
    throw new Error('Missing emailData for preview');
  }

  // Pull contact/account data from payload (no Firestore lookups for preview)
  const contactData = emailData.contactData || {};
  const accountData = emailData.accountData || {};

  // Detect industry (same priority as main flow)
  let recipientIndustry = accountData.industry || contactData.industry || '';
  const industryDebug = {
    accountIndustry: accountData.industry || null,
    contactIndustry: contactData.industry || null,
    inferredFromCompany: null,
    inferredFromDescription: null
  };
  if (!recipientIndustry && (emailData.contactCompany || contactData.company)) {
    const companyName = emailData.contactCompany || contactData.company;
    industryDebug.inferredFromCompany = true;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:before-industry-inference',message:'Before inferring industry from company name',data:{companyName},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'INDUSTRY-DETECTION'})}).catch(()=>{});
    // #endregion
    recipientIndustry = IndustryDetection.inferIndustryFromCompanyName(companyName);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:after-industry-inference',message:'After inferring industry from company name',data:{companyName,inferredIndustry:recipientIndustry},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'INDUSTRY-DETECTION'})}).catch(()=>{});
    // #endregion
  }
  if (!recipientIndustry) {
    const accountDesc = accountData.shortDescription || accountData.short_desc ||
      accountData.descriptionShort || accountData.description ||
      accountData.companyDescription || accountData.accountDescription || '';
    if (accountDesc) {
      industryDebug.inferredFromDescription = true;
      recipientIndustry = IndustryDetection.inferIndustryFromDescription(accountDesc);
    }
  }
  if (!recipientIndustry) recipientIndustry = 'Default';

  // Build recipient object (mirrors production generation path)
  // Extract firstName - handle both firstName field and full name splitting
  let extractedFirstName = contactData.firstName || contactData.first_name || '';
  if (!extractedFirstName) {
    const nameSource = contactData.name || contactData.full_name || contactData.fullName || emailData.contactName || '';
    if (nameSource) {
      extractedFirstName = nameSource.split(' ')[0].trim();
    }
  }
  if (!extractedFirstName) extractedFirstName = 'there';
  
  // Extract company name - prioritize account data, then contact data, then emailData
  let extractedCompany = '';
  if (accountData && (accountData.companyName || accountData.name)) {
    extractedCompany = accountData.companyName || accountData.name || '';
  }
  if (!extractedCompany) {
    extractedCompany = contactData.company || contactData.companyName || contactData.accountName || '';
  }
  if (!extractedCompany) {
    extractedCompany = emailData.contactCompany || '';
  }
  
  const recipient = {
    firstName: extractedFirstName,
    company: extractedCompany,
    title: contactData.role || contactData.title || contactData.job || '',
    industry: recipientIndustry,
    account: accountData,
    energy: {
      supplier: accountData.electricitySupplier || accountData.electricity_supplier || '',
      currentRate: accountData.currentRate || accountData.current_rate || '',
      contractEnd: accountData.contractEndDate || accountData.contract_end_date || '',
      annualUsage: accountData.annualUsage || accountData.annual_usage || ''
    },
    notes: contactData.notes || ''
  };

  // Recent angles (optional, to avoid repeats)
  const usedAngles = Array.isArray(emailData.previousAngles) ? emailData.previousAngles.filter(Boolean) : [];

  // Select angle + tone opener
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:before-angle-selection',message:'Before angle selection - industry and recipient data',data:{recipientIndustry,recipientRole:recipient.title||recipient.role||'',recipientCompany:recipient.company||'',usedAnglesCount:Array.isArray(usedAngles)?usedAngles.length:0,usedAngles:usedAngles.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'ANGLE-SELECTION'})}).catch(()=>{});
  // #endregion
  
  const selectedAngle = selectRandomizedAngle(recipientIndustry, null, recipient, usedAngles);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:after-angle-selection',message:'After angle selection - selected angle details',data:{selectedAngleId:selectedAngle?.id||null,selectedAngleLabel:selectedAngle?.label||null,selectedAnglePrimaryMessage:selectedAngle?.primaryMessage||null,selectedAngleOpeningTemplate:selectedAngle?.openingTemplate||null,selectedAngleIndustryContext:selectedAngle?.industryContext||null,selectedAngleProof:selectedAngle?.proof||null,openingTemplateType:typeof selectedAngle?.openingTemplate},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'ANGLE-SELECTION'})}).catch(()=>{});
  // #endregion
  
  // CRITICAL: Remove any em dashes from tone opener immediately after selection
  const toneOpener = removeEmDashes(selectRandomToneOpener(selectedAngle?.id));

  // Get angle CTA data using new system (industry + role specific)
  const recipientRole = recipient.title || recipient.role || recipient.job || '';
  const angleCtaData = selectedAngle ? getAngleCta(selectedAngle, recipientIndustry.toLowerCase(), recipientRole, recipient.company || '') : null;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:angle-cta-data',message:'Angle CTA data from getAngleCta',data:{hasAngleCtaData:!!angleCtaData,angleCtaOpening:angleCtaData?.opening?.substring(0,100)||null,angleCtaValue:angleCtaData?.value?.substring(0,100)||null,angleCtaFull:angleCtaData?.full?.substring(0,100)||null,angleCtaContextWhy:angleCtaData?.contextWhy||null,angleCtaRoleInfo:angleCtaData?.roleInfo||null,recipientIndustry:recipientIndustry.toLowerCase(),recipientRole},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'ANGLE-CTA'})}).catch(()=>{});
  // #endregion

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:preview-angle-cta',message:'Preview angle + industry selection',data:{aiMode:(emailData.aiMode||'').toLowerCase()==='html'?'html':'standard',stepIndex:emailData.stepIndex,finalIndustry:recipientIndustry,industryDebug,usedAnglesCount:Array.isArray(usedAngles)?usedAngles.length:0,selectedAngleId:selectedAngle?.id||null,selectedAngleOpeningTemplate:selectedAngle?.openingTemplate||null,toneOpener,hasAngleCtaData:!!angleCtaData},timestamp:Date.now(),sessionId:'debug-session',runId:'cta-1',hypothesisId:'CTA-ANGLE'})}).catch(()=>{});
  // #endregion

  const aiMode = (emailData.aiMode || '').toLowerCase() === 'html' ? 'html' : 'standard';
  const isColdStep = (
    emailData.stepType === 'intro' ||
    emailData.template === 'first-email-intro' ||
    String(emailData.aiMode || '').toLowerCase() === 'cold-email' ||
    emailData.stepIndex === 0 ||
    emailData.stepIndex === undefined
  );
  const emailPosition = typeof emailData.stepIndex === 'number' ? emailData.stepIndex + 1 : 1;

  const baseUrl = (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.replace(/\/$/, ''))
    || 'http://localhost:3000';

  const perplexityPayload = {
    prompt: emailData.aiPrompt || 'Write a professional follow-up email',
    mode: aiMode,
    templateType: 'cold_email',
    recipient: recipient,
    selectedAngle: selectedAngle,
    toneOpener: toneOpener,
    senderName: 'Lewis Patterson',
    emailPosition: emailPosition,
    previousAngles: usedAngles
  };
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:before-perplexity-call',message:'Payload being sent to perplexity-email',data:{mode:perplexityPayload.mode,templateType:perplexityPayload.templateType,hasSelectedAngle:!!perplexityPayload.selectedAngle,selectedAngleId:perplexityPayload.selectedAngle?.id||null,recipientIndustry:perplexityPayload.recipient?.industry||null,recipientRole:perplexityPayload.recipient?.title||perplexityPayload.recipient?.role||'',recipientCompany:perplexityPayload.recipient?.company||'',hasToneOpener:!!perplexityPayload.toneOpener,emailPosition:perplexityPayload.emailPosition},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'PERPLEXITY-PAYLOAD'})}).catch(()=>{});
  // #endregion

  const perplexityResponse = await fetch(`${baseUrl}/api/perplexity-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(perplexityPayload)
  });

  if (!perplexityResponse.ok) {
    throw new Error(`Perplexity email API error: ${perplexityResponse.status}`);
  }

  const perplexityResult = await perplexityResponse.json();
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:perplexity-response',message:'Perplexity response received',data:{ok:perplexityResult.ok,hasSubject:!!perplexityResult.subject,subjectPreview:perplexityResult.subject?.substring(0,80)||null,hasHtml:!!perplexityResult.html,hasText:!!perplexityResult.text,textPreview:perplexityResult.text?.substring(0,200)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'PERPLEXITY-RESPONSE'})}).catch(()=>{});
  // #endregion
  
  if (!perplexityResult.ok) {
    throw new Error(`Perplexity email API failed: ${perplexityResult.error || 'Unknown error'}`);
  }

  let htmlContent = '';
  let textContent = '';

  if (aiMode === 'html') {
    const outputData = perplexityResult.output || {};
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:423',message:'HTML mode - JSON structure from AI',data:{hasOutput:!!outputData,outputKeys:Object.keys(outputData||{}),greeting:outputData?.greeting?.substring(0,50),openingHook:outputData?.opening_hook?.substring(0,50),valueProp:outputData?.value_proposition?.substring(0,50),ctaText:outputData?.cta_text?.substring(0,50),paragraph1:outputData?.paragraph1?.substring(0,50),paragraph2:outputData?.paragraph2?.substring(0,50),paragraph3:outputData?.paragraph3?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    htmlContent = buildColdEmailHtmlTemplate(outputData, recipient);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:426',message:'HTML mode - after template build',data:{htmlLength:htmlContent.length,htmlPreview:htmlContent.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    textContent = removeEmDashes(buildTextVersionFromHtml(htmlContent)); // Remove em dashes from text version
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:427',message:'HTML mode - final text content',data:{textLength:textContent.length,textPreview:textContent.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  } else {
    // Standard mode: reuse production logic
    const raw = String(perplexityResult.output || '').trim();
    let jsonData = null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) jsonData = JSON.parse(match[0]);
    } catch (e) {
      jsonData = null;
    }

    let subject = emailData.subject || 'Energy update';
    let bodyText = removeEmDashes(raw); // Remove em dashes from full body text
    
    // Clean up any trailing tone opener text that might have leaked into the output
    // Remove standalone "Curious", "Curious if", etc. at the end of the text
    bodyText = bodyText.replace(/\s+(Curious|Curious if|Curious,|Curious—)$/gi, '').trim();

    const enforceFirstNameOnly = (greeting) => {
      if (!greeting || typeof greeting !== 'string') return greeting;
      const firstName = recipient.firstName || '';
      if (!firstName) return greeting;
      const greetingPattern = /^(Hi|Hello|Hey|Dear)\s+([^,]+),/i;
      const match = greeting.match(greetingPattern);
      if (match) {
        const salutation = match[1];
        const namePart = match[2].trim();
        if (namePart !== firstName && namePart.toLowerCase().includes(firstName.toLowerCase())) {
          return `${salutation} ${firstName},`;
        }
        if (namePart !== firstName) return `${salutation} ${firstName},`;
      }
      return greeting;
    };

    if (jsonData && typeof jsonData === 'object') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:462',message:'Standard mode - JSON structure from AI',data:{hasJsonData:!!jsonData,jsonKeys:Object.keys(jsonData||{}),greeting:jsonData?.greeting?.substring(0,50),openingHook:jsonData?.opening_hook?.substring(0,50),valueProp:jsonData?.value_proposition?.substring(0,50),ctaText:jsonData?.cta_text?.substring(0,50),paragraph1:jsonData?.paragraph1?.substring(0,50),paragraph2:jsonData?.paragraph2?.substring(0,50),paragraph3:jsonData?.paragraph3?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (jsonData.subject) subject = jsonData.subject;
      const parts = [];
      if (jsonData.greeting) {
        const cleanedGreeting = enforceFirstNameOnly(jsonData.greeting);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:465',message:'Standard mode - greeting processing',data:{originalGreeting:jsonData.greeting?.substring(0,50),cleanedGreeting:cleanedGreeting?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        parts.push(cleanedGreeting);
      }
      
      // CRITICAL: Replace "Wondering how..." in paragraph1 if present (preview path)
      // Check for cold_email fields first (opening_hook, value_proposition, cta_text)
      let paragraph1 = jsonData.opening_hook || jsonData.paragraph1 || '';
      if (paragraph1 && toneOpener) {
        const paragraph1Lower = paragraph1.toLowerCase().trim();
        const hasWonderingHow = /^wondering how/i.test(paragraph1Lower);
        
        if (hasWonderingHow) {
          // Replace "Wondering how..." with tone opener style
          
          // Extract the question part after "Wondering how [company] is handling..."
          const wonderingMatch = paragraph1.match(/^wondering how [^?]+\?/i);
          const questionPart = wonderingMatch ? wonderingMatch[0].replace(/^wondering how /i, '') : '';
          
          // Convert tone opener to natural opener
          let naturalOpener = '';
          const toneOpenerLower = toneOpener.toLowerCase();
          // REMOVED "real talk" - not professional enough for corporate America
          if (toneOpenerLower.includes('honestly')) {
            naturalOpener = 'Honestly, ';
          } else if (toneOpenerLower.includes('curious')) {
            naturalOpener = 'Curious if ';
          } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
            naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
          } else if (toneOpenerLower.includes('out of curiosity')) {
            naturalOpener = 'Out of curiosity, ';
          } else if (toneOpenerLower.includes('question for you')) {
            naturalOpener = 'Question for you, ';
          } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
            naturalOpener = 'Most teams ';
          } else if (toneOpenerLower.includes('from what')) {
            naturalOpener = 'From what I\'m hearing, ';
          } else if (toneOpenerLower.includes('looking at')) {
            naturalOpener = 'Looking at your situation, ';
          } else if (toneOpenerLower.includes('so here')) {
            naturalOpener = 'So here\'s the thing, ';
          } else if (toneOpenerLower.includes('not sure')) {
            naturalOpener = 'Not sure if ';
          } else if (toneOpenerLower.includes('ive found') || toneOpenerLower.includes('teams like')) {
            naturalOpener = 'Most teams ';
          } else {
            naturalOpener = 'Curious if ';
          }
          
          // Rebuild paragraph1 with natural opener
          if (questionPart) {
            paragraph1 = naturalOpener + questionPart;
          } else {
            // Fallback: use tone opener directly
            const restOfParagraph = paragraph1.replace(/^wondering how [^?]+\?/i, '').trim();
            paragraph1 = naturalOpener + restOfParagraph;
          }
        }
      }
      
      if (paragraph1) parts.push(paragraph1);
      // Handle cold_email structure: value_proposition as paragraph2, cta_text as paragraph3
      const paragraph2 = jsonData.value_proposition || jsonData.paragraph2 || '';
      const paragraph3 = jsonData.cta_text || jsonData.paragraph3 || '';
      if (paragraph2) parts.push(paragraph2);
      if (paragraph3) parts.push(paragraph3);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:524',message:'Standard mode - parts assembly',data:{partsCount:parts.length,partsPreview:parts.map(p=>p?.substring(0,50)||'').join(' | ')},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (jsonData.closing) {
        parts.push(jsonData.closing);
      } else {
        const senderFirstName = 'Lewis';
        parts.push(`Best regards,\n${senderFirstName}`);
      }
      bodyText = parts.join('\n\n') || raw;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:533',message:'Standard mode - bodyText after join',data:{bodyTextLength:bodyText.length,bodyTextPreview:bodyText.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Clean up any trailing tone opener text that might have leaked into the output
      bodyText = bodyText.replace(/\s+(Curious|Curious if|Curious,|Curious—)$/gi, '').trim();
      
      // Fix capitalization issues: company names and sentence starts
      const companyName = recipient?.company || recipient?.accountName || '';
      if (companyName) {
        // Get properly capitalized company name (preserve original if it looks correct, otherwise capitalize)
        const companyWords = companyName.split(' ');
        const companyNameProper = companyWords.map(word => {
          // Preserve common business suffixes as-is (Inc, LLC, Ltd, Corp, Co, US)
          const cleanWord = word.replace(/[.,]/g, '').toLowerCase();
          if (['inc', 'llc', 'ltd', 'corp', 'co', 'us'].includes(cleanWord)) {
            return word.toUpperCase();
          }
          // Capitalize first letter of each word
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
        
        // Replace lowercase company name with properly capitalized version (case-insensitive match)
        const companyNameLower = companyName.toLowerCase();
        // Escape special regex characters in company name
        const escapedCompany = companyNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const companyNamePattern = new RegExp(`\\b${escapedCompany}\\b`, 'gi');
        bodyText = bodyText.replace(companyNamePattern, companyNameProper);
        
        // Also fix common patterns like "president of [company]" or "as [company]" where company is lowercase
        const roleCompanyPattern = /\b(president|ceo|cfo|director|manager|executive|administrator)\s+of\s+([a-z][^,.\n]+?)(?=[,.\n]|$)/gi;
        bodyText = bodyText.replace(roleCompanyPattern, (match, role, companyPart) => {
          // Check if this matches our company name (case-insensitive)
          if (companyPart.toLowerCase().includes(companyNameLower) || companyNameLower.includes(companyPart.toLowerCase())) {
            return `${role} of ${companyNameProper}`;
          }
          // Otherwise capitalize the company part
          const capitalizedCompany = companyPart.split(' ').map(w => {
            const cleanW = w.replace(/[.,]/g, '').toLowerCase();
            if (['inc', 'llc', 'ltd', 'corp', 'co', 'us'].includes(cleanW)) {
              return w.toUpperCase();
            }
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          }).join(' ');
          return `${role} of ${capitalizedCompany}`;
        });
      }
      
      // Fix sentence capitalization: ensure sentences start with uppercase after periods/question marks/exclamation
      bodyText = bodyText.replace(/([.!?]\s+)([a-z])/g, (match, punct, letter) => {
        return punct + letter.toUpperCase();
      });
      
      // Fix paragraph starts (after double newlines) - ensure they start with uppercase
      bodyText = bodyText.replace(/(\n\n)([a-z])/g, (match, newlines, letter) => {
        return newlines + letter.toUpperCase();
      });
      
      // Normalize non-breaking hyphens and other special characters
      bodyText = bodyText
        .replace(/\u2011/g, '-')  // Non-breaking hyphen → regular hyphen
        .replace(/\u2013/g, '-')  // En dash → hyphen
        .replace(/\u2014/g, ', ')  // Em dash → comma
        .replace(/\u00A0/g, ' '); // Non-breaking space → regular space
      
      // CRITICAL: Replace "Wondering how..." in bodyText if present (preview path, after joining)
      if (bodyText && toneOpener) {
        const bodyTextLower = bodyText.toLowerCase();
        const hasWonderingHow = /^wondering how/i.test(bodyTextLower.trim()) || /\n\nwondering how/i.test(bodyTextLower);
        
        if (hasWonderingHow) {
          // Replace "Wondering how..." with tone opener style
          
          // Extract the question part after "Wondering how [company] is handling..."
          const wonderingMatch = bodyText.match(/(?:^|\n\n)wondering how [^?]+\?/i);
          const questionPart = wonderingMatch ? wonderingMatch[0].replace(/(?:^|\n\n)wondering how /i, '') : '';
          
          // Convert tone opener to natural opener
          let naturalOpener = '';
          const toneOpenerLower = toneOpener.toLowerCase();
          // REMOVED "real talk" - not professional enough for corporate America
          if (toneOpenerLower.includes('honestly')) {
            naturalOpener = 'Honestly, ';
          } else if (toneOpenerLower.includes('curious')) {
            naturalOpener = 'Curious if ';
          } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
            naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
          } else if (toneOpenerLower.includes('out of curiosity')) {
            naturalOpener = 'Out of curiosity, ';
          } else if (toneOpenerLower.includes('question for you')) {
            naturalOpener = 'Question for you, ';
          } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
            naturalOpener = 'Most teams ';
          } else if (toneOpenerLower.includes('from what')) {
            naturalOpener = 'From what I\'m hearing, ';
          } else if (toneOpenerLower.includes('looking at')) {
            naturalOpener = 'Looking at your situation, ';
          } else if (toneOpenerLower.includes('so here')) {
            naturalOpener = 'So here\'s the thing, ';
          } else if (toneOpenerLower.includes('not sure')) {
            naturalOpener = 'Not sure if ';
          } else if (toneOpenerLower.includes('ive found') || toneOpenerLower.includes('teams like')) {
            naturalOpener = 'Most teams ';
          } else {
            naturalOpener = 'Curious if ';
          }
          
          // Rebuild bodyText with natural opener
          if (questionPart) {
            bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, (match) => {
              return match.replace(/wondering how /i, naturalOpener);
            });
          } else {
            // Fallback: replace the pattern directly
            bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, naturalOpener);
          }
        }
      }
    }

    if (isColdStep && selectedAngle) {
      const firstNameForSubject = recipient.firstName || contactData.firstName || emailData.contactName || '';
      const companyForSubject = recipient.company || emailData.contactCompany || '';
      const angleSubjects = {
        timing_strategy: [
          `${firstNameForSubject}, when does your contract expire?`,
          `${firstNameForSubject}, rate lock timing question`,
          `${companyForSubject} renewal timing question`,
          `${firstNameForSubject}, contract renewal window?`,
          `Contract planning for ${companyForSubject}?`,
          `${firstNameForSubject}, when's your renewal window?`,
          `${companyForSubject} contract timing question`,
          `${firstNameForSubject}, renewal planning for 2026?`
        ],
        exemption_recovery: [
          `${firstNameForSubject}, are you claiming exemptions?`,
          `${firstNameForSubject}, tax exemption question`,
          `${companyForSubject} exemption recovery question`,
          `${firstNameForSubject}, electricity exemptions?`,
          `Tax exemptions at ${companyForSubject}?`,
          `${firstNameForSubject}, unclaimed exemptions?`,
          `${companyForSubject} sales tax audit question`,
          `${firstNameForSubject}, exemption recovery opportunity?`
        ],
        consolidation: [
          `${firstNameForSubject}, how many locations are you managing?`,
          `${firstNameForSubject}, multi-site energy question`,
          `${companyForSubject} consolidation opportunity?`,
          `${firstNameForSubject}, multiple locations?`,
          `Multi-site energy at ${companyForSubject}?`,
          `${firstNameForSubject}, consolidating suppliers?`,
          `${companyForSubject} multiple locations question`,
          `${firstNameForSubject}, unified energy management?`
        ],
        demand_efficiency: [
          `${firstNameForSubject}, optimizing before renewal?`,
          `${firstNameForSubject}, consumption efficiency question`,
          `${companyForSubject} pre-renewal optimization?`,
          `${firstNameForSubject}, efficiency before renewal?`,
          `Pre-renewal optimization for ${companyForSubject}?`,
          `${firstNameForSubject}, consumption efficiency?`,
          `${companyForSubject} efficiency opportunity?`,
          `${firstNameForSubject}, optimizing energy usage?`
        ],
        operational_continuity: [
          `${firstNameForSubject}, peak demand handling?`,
          `${firstNameForSubject}, uptime vs savings?`,
          `${companyForSubject} operational continuity question`,
          `${firstNameForSubject}, demand charge question?`,
          `Peak demand at ${companyForSubject}?`,
          `${firstNameForSubject}, operational continuity?`,
          `${companyForSubject} uptime strategy question`,
          `${firstNameForSubject}, peak demand strategy?`
        ],
        mission_funding: [
          `${firstNameForSubject}, redirecting funds to mission?`,
          `${companyForSubject} mission funding question`,
          `${firstNameForSubject}, vendor cost question?`,
          `${firstNameForSubject}, program funding?`,
          `Mission funding at ${companyForSubject}?`,
          `${firstNameForSubject}, redirecting vendor costs?`,
          `${companyForSubject} vendor cost reduction?`,
          `${firstNameForSubject}, program funding opportunity?`
        ],
        budget_stability: [
          `${firstNameForSubject}, locking in energy costs?`,
          `${companyForSubject} budget stability question`,
          `${firstNameForSubject}, cost predictability?`,
          `${firstNameForSubject}, budget volatility?`,
          `Budget stability for ${companyForSubject}?`,
          `${firstNameForSubject}, locking in rates?`,
          `${companyForSubject} cost predictability question`,
          `${firstNameForSubject}, budget planning for 2026?`
        ],
        operational_simplicity: [
          `${firstNameForSubject}, managing multiple suppliers?`,
          `${companyForSubject} vendor consolidation question`,
          `${firstNameForSubject}, unified billing?`,
          `${firstNameForSubject}, supplier management?`,
          `Vendor consolidation at ${companyForSubject}?`,
          `${firstNameForSubject}, simplifying suppliers?`,
          `${companyForSubject} unified billing question`,
          `${firstNameForSubject}, supplier consolidation?`
        ],
        cost_control: [
          `${firstNameForSubject}, energy cost predictability?`,
          `${companyForSubject} budget planning question`,
          `${firstNameForSubject}, rate volatility?`,
          `${firstNameForSubject}, cost control?`,
          `Cost control at ${companyForSubject}?`,
          `${firstNameForSubject}, energy budget planning?`,
          `${companyForSubject} rate volatility question`,
          `${firstNameForSubject}, 2026 energy strategy?`
        ],
        operational_efficiency: [
          `${firstNameForSubject}, energy costs impacting efficiency?`,
          `${companyForSubject} operational efficiency question`,
          `${firstNameForSubject}, cost reduction opportunity?`,
          `Operational efficiency at ${companyForSubject}?`,
          `${firstNameForSubject}, energy efficiency?`,
          `${companyForSubject} cost reduction question`,
          `${firstNameForSubject}, efficiency opportunity?`
        ],
        data_governance: [
          `${firstNameForSubject}, visibility into energy usage?`,
          `${companyForSubject} energy reporting question`,
          `${firstNameForSubject}, centralized metering?`,
          `Energy reporting at ${companyForSubject}?`,
          `${firstNameForSubject}, energy visibility?`,
          `${companyForSubject} centralized metering question`,
          `${firstNameForSubject}, usage reporting?`
        ]
      };
      const angleId = selectedAngle.id || 'timing_strategy';
      const subjects = angleSubjects[angleId] || angleSubjects.timing_strategy;
      subject = subjects[Math.floor(Math.random() * subjects.length)];
    } else if (isColdStep) {
      const roleForSubject = recipient.title || '';
      const firstNameForSubject = recipient.firstName || contactData.firstName || emailData.contactName || '';
      const companyForSubject = recipient.company || emailData.contactCompany || '';
      subject = getRandomIntroSubject(roleForSubject, firstNameForSubject, companyForSubject);
    }

    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const paragraphs = bodyText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean);

    htmlContent = paragraphs
      .map(p => `<p style="margin:0 0 16px 0; color:#222;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

    textContent = removeEmDashes(bodyText); // Ensure em dashes are removed from final text
    
    // Final cleanup: Remove any trailing tone opener text and normalize special characters
    textContent = textContent
      .replace(/\s+(Curious|Curious if|Curious,|Curious—)$/gi, '')  // Remove trailing "Curious" variants
      .replace(/\u2011/g, '-')  // Non-breaking hyphen → regular hyphen
      .replace(/\u2013/g, '-')  // En dash → hyphen  
      .replace(/\u2014/g, ', ')  // Em dash → comma
      .replace(/\u00A0/g, ' ')   // Non-breaking space → regular space
      .trim();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:773',message:'Preview path - final textContent before return',data:{textContentLength:textContent.length,textContentPreview:textContent.substring(0,400),firstLines:textContent.split('\n').slice(0,5).join(' | ')},timestamp:Date.now(),sessionId:'debug-session',runId:'email-output-1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    emailData.generatedSubject = subject;
  }

  const generatedContent = {
    subject: emailData.generatedSubject || 'Follow-up Email',
    html: htmlContent,
    text: textContent,
    angle_used: selectedAngle?.id || null,
    exemption_type: accountData?.taxExemptStatus || null,
    tone_opener: toneOpener || null
  };

  // NEPQ + content validation
  const nepqValidation = validateNepqContent(
    generatedContent.subject,
    generatedContent.text,
    toneOpener
  );
  if (!nepqValidation.isValid) {
    throw new Error(nepqValidation.reason || 'Failed NEPQ validation');
  }

  // Use the potentially modified body from validation
  if (nepqValidation.modifiedBody && nepqValidation.modifiedBody !== generatedContent.text) {
    generatedContent.text = removeEmDashes(nepqValidation.modifiedBody); // Remove em dashes from modified body
    // Rebuild HTML completely from the modified text (avoid duplication)
    if (generatedContent.html) {
      const paragraphs = generatedContent.text.split('\n\n').filter(p => p.trim());
      generatedContent.html = paragraphs
        .map(p => `<p style="margin:0 0 16px 0; color:#222;">${p.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
        .join('');
    }
  }

  const validation = validateGeneratedContent(
    generatedContent.html,
    generatedContent.text,
    generatedContent.subject
  );
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Failed content validation');
  }

  return { ok: true, generatedContent, toneOpener };
}

// ========== INDUSTRY DETECTION ==========
// NOTE: Industry detection functions are now imported from _industry-detection.js
// to ensure consistency across all email generation flows (preview, scheduled, compose).
// The shared module includes comprehensive patterns for all industries.

// ========== ANGLE SELECTION SYSTEM ==========
// Helper function to check if account has evidence of multiple locations
function hasMultipleLocationsEvidence(accountData) {
  if (!accountData) return false;
  
  // Check 1: Multiple service addresses in CRM
  const serviceAddresses = accountData?.account?.serviceAddresses;
  const hasMultipleServiceAddresses = Array.isArray(serviceAddresses) && serviceAddresses.length > 1;
  
  // Check 2: Account description mentions multiple locations/facilities/sites
  const accountDesc = accountData?.account?.shortDescription || 
                     accountData?.account?.short_desc || 
                     accountData?.account?.descriptionShort || 
                     accountData?.account?.description || 
                     accountData?.account?.companyDescription || 
                     accountData?.account?.accountDescription || '';
  const descLower = String(accountDesc).toLowerCase();
  const mentionsMultipleLocations = /\b(multiple|several|various|locations|facilities|sites|plants|offices|branches|stores)\b/i.test(descLower);
  
  return hasMultipleServiceAddresses || mentionsMultipleLocations;
}

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
        primaryValue: '10-20% savings by consolidating all locations',
        condition: (accountData) => hasMultipleLocationsEvidence(accountData)
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
        primaryValue: '10-20% savings by consolidating all locations',
        condition: (accountData) => hasMultipleLocationsEvidence(accountData)
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
        primaryValue: '10-20% savings by consolidating all facilities',
        condition: (accountData) => hasMultipleLocationsEvidence(accountData)
      },
      {
        id: 'operational_continuity',
        weight: 0.25,
        primaryMessage: 'uptime guarantee',
        openingTemplate: 'What\'s more critical, energy savings or guaranteed uptime?',
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
        primaryValue: '10-20% savings by consolidating all locations',
        condition: (accountData) => hasMultipleLocationsEvidence(accountData)
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
        primaryValue: '10-20% savings by consolidating all properties',
        condition: (accountData) => hasMultipleLocationsEvidence(accountData)
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

// Optional news hooks that can temporarily boost specific angles
const ACTIVE_NEWS_HOOKS = [
  {
    id: 'ratespike11pct',
    headline: 'Electricity rates up 11% nationally in 2025',
    angleAffinity: ['timing_strategy'],
    weight: 1.5
  },
  {
    id: 'datacenterdemand',
    headline: 'AI demand driving 50% rate increases',
    angleAffinity: ['demand_efficiency'],
    weight: 1.3
  }
];

// Subject line variants for cold intro steps (short, question-based, role-aware)
const SUBJECT_LINE_VARIANTS = {
  intro: {
    operations: [
      '{firstName}, facility renewal timing?',
      '{firstName}, quick question on your energy contract',
      '{firstName}, how early do you lock in rates?',
      '{company} facility renewal timing',
      'Contract timing at {company}?'
    ],
    finance: [
      '{firstName}, budget question on energy renewal',
      '{firstName}, rate lock timing question',
      'Energy renewal timing at {company}',
      '{firstName}, cost predictability question',
      '{firstName}, 2025 energy budget timing?'
    ],
    executive: [
      '{firstName}, contract timing question',
      '{company} energy renewal timing',
      '{firstName}, quick question on 2025 energy strategy',
      '{company} rate lock timing?',
      'Energy contract timing at {company}'
    ],
    default: [
      '{firstName}, contract timing question',
      '{firstName}, quick energy renewal question',
      '{company} contract renewal timing',
      '{firstName}, rate lock timing',
      'Energy renewal timing at {company}'
    ]
  }
};

function getRoleCategoryForSubject(roleRaw = '') {
  const role = String(roleRaw || '').toLowerCase();
  if (/cfo|finance|controller|treasurer|accounting|vp finance/.test(role)) return 'finance';
  if (/operations|facilities|plant|gm|general manager|maintenance|operations manager/.test(role)) return 'operations';
  if (/ceo|president|owner|founder|executive|chief/.test(role)) return 'executive';
  return 'default';
}

function getRandomIntroSubject(roleRaw, firstName, company) {
  const roleCategory = getRoleCategoryForSubject(roleRaw);
  const variants =
    SUBJECT_LINE_VARIANTS.intro[roleCategory] ||
    SUBJECT_LINE_VARIANTS.intro.default;
  const chosen = variants[Math.floor(Math.random() * variants.length)];
  const safeFirst = (firstName || '').trim() || 'there';
  const safeCompany = (company || '').trim() || 'your company';
  return chosen
    .replace('{firstName}', safeFirst)
    .replace('{company}', safeCompany);
}

// Select randomized angle based on industry, with optional memory of recently used angles
// NEW: Industry-weighted angle selection using centralized angle definitions
function selectRandomizedAngle(industry, manualAngleOverride, accountData, usedAngles = []) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-entry',message:'selectRandomizedAngle function entry',data:{industry,hasManualOverride:!!manualAngleOverride,manualOverride:manualAngleOverride,usedAnglesCount:Array.isArray(usedAngles)?usedAngles.length:0,usedAngles:usedAngles.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  // Map database industry values to weight map keys
  // Order matters: more specific matches first, then generic ones
  const industryMap = {
    // Healthcare variations (most specific first)
    'hospital & health care': 'Healthcare',
    'healthcare': 'Healthcare',
    'health care': 'Healthcare',
    'hospital': 'Healthcare',
    'medical': 'Healthcare',
    
    // Education variations (most specific first)
    'primary/secondary education': 'Education',
    'education': 'Education',
    'school': 'Education',
    'university': 'Education',
    'college': 'Education',
    
    // Manufacturing variations (most specific first)
    'electrical/electronic manufacturing': 'Manufacturing',
    'oil & energy': 'Manufacturing',
    'manufacturing': 'Manufacturing',
    'industrial': 'Manufacturing',
    'aerospace': 'Manufacturing',
    'aviation': 'Manufacturing',
    
    // Retail
    'retail': 'Retail',
    
    // Hospitality
    'hospitality': 'Hospitality',
    'hotel': 'Hospitality',
    'restaurant': 'Hospitality',
    
    // Nonprofit variations (most specific first)
    'nonprofit organization management': 'Nonprofit',
    'nonprofit': 'Nonprofit',
    'non-profit': 'Nonprofit',
    'charity': 'Nonprofit',
    
    // DataCenter
    'datacenter': 'DataCenter',
    'data center': 'DataCenter',
    
    // Logistics
    'logistics': 'Logistics',
    'transportation': 'Logistics',
    
    // Government
    'government': 'Government',
    'municipal': 'Government',
    
    // Facilities Services / Janitorial Services (not tax-exempt, service-based)
    // Map to default weights - facilities services is service-based, not manufacturing
    // 'facilities services': Keep as-is, will use default weights
    // 'facilities': Keep as-is, will use default weights
    'janitorial services': 'default',
    'janitorial': 'default',
    'cleaning services': 'default',
    'facility management': 'default',
    
    // Marketing & Advertising (not tax-exempt)
    'marketing & advertising': 'Retail', // Map to Retail for angle weights
    'marketing': 'Retail',
    'advertising': 'Retail',
  };
  
  // Normalize industry to match weight map keys
  let normalizedIndustry = (industry || '').toString().trim().toLowerCase();
  let mappingMethod = 'none';
  let matchedKey = null;
  
  if (!normalizedIndustry || normalizedIndustry === 'default') {
    normalizedIndustry = 'default';
    mappingMethod = 'default';
  } else {
    // Check if we have a direct mapping for this industry value
    if (industryMap[normalizedIndustry]) {
      normalizedIndustry = industryMap[normalizedIndustry];
      mappingMethod = 'direct';
      matchedKey = normalizedIndustry;
    } else {
      // Try partial matches - check if any map key is contained in the industry string
      // e.g., "primary/secondary education" contains "education"
      // e.g., "electrical/electronic manufacturing" contains "manufacturing"
      // e.g., "nonprofit organization management" contains "nonprofit"
      matchedKey = Object.keys(industryMap).find(key => {
        // Check if industry string contains the map key (word boundary aware)
        // Use word boundaries to avoid false matches
        const keyPattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return keyPattern.test(normalizedIndustry);
      });
      
      if (matchedKey) {
        normalizedIndustry = industryMap[matchedKey];
        mappingMethod = 'partial';
      } else {
        // For unmapped industries (like "facilities services", janitorial services, etc.)
        // Use default weights instead of trying to capitalize and match
        // This ensures service-based industries get appropriate default angle weights
        normalizedIndustry = 'default';
        mappingMethod = 'fallback-default';
      }
    }
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-normalized',message:'Industry normalized for weight map',data:{originalIndustry:industry,normalizedIndustryLower:normalizedIndustry.toLowerCase(),normalizedIndustry,mappingMethod,matchedKey,hasDirectMatch:!!industryMap[(industry || '').toString().trim().toLowerCase()]},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  // Industry weight map - certain angles perform better for certain industries
  const industryAngleWeights = {
    Manufacturing: {
      demand_efficiency: 3,    // Highest for mfg (peak patterns)
      consolidation: 2,
      timing_strategy: 2,
      exemption_recovery: 1,
      default: 0.5
    },
    Healthcare: {
      demand_efficiency: 2.5,
      exemption_recovery: 3,   // Healthcare = strong exemption case
      consolidation: 2,
      timing_strategy: 1.5,
      default: 0.5
    },
    Education: {
      exemption_recovery: 3,    // Education = strongest exemption
      demand_efficiency: 2,
      consolidation: 1.5,
      timing_strategy: 1,
      default: 0.5
    },
    Retail: {
      consolidation: 3,         // Retail = multi-store + bulk discounts
      demand_efficiency: 2,
      timing_strategy: 1.5,
      default: 0.5
    },
    Hospitality: {
      consolidation: 2.5,
      demand_efficiency: 2,
      timing_strategy: 1.5,
      default: 0.5
    },
    Nonprofit: {
      exemption_recovery: 3,    // Nonprofit = tax-exempt focus
      consolidation: 2,
      demand_efficiency: 1.5,
      default: 0.5
    },
    DataCenter: {
      demand_efficiency: 3,     // Datacenters = load correlation
      consolidation: 2,
      timing_strategy: 1,
      default: 0.5
    },
    Logistics: {
      consolidation: 2.5,       // Logistics = multi-facility
      demand_efficiency: 1.5,
      timing_strategy: 1,
      default: 0.5
    },
    default: {
      demand_efficiency: 2,
      timing_strategy: 2,
      consolidation: 2,
      exemption_recovery: 1.5,
      operational_simplicity: 1.5,
      budget_stability: 1,
      default: 1
    }
  };
  
  // Get weight map for this industry
  const weights = industryAngleWeights[normalizedIndustry] || industryAngleWeights.default;
  
  // Define tax-exempt industries that CAN use exemption_recovery angle
  const taxExemptIndustries = ['Nonprofit', 'Education', 'Healthcare'];
  const isTaxExemptIndustry = taxExemptIndustries.includes(normalizedIndustry);
  
  // Also check accountData for explicit tax-exempt status
  const accountTaxExempt = accountData?.taxExemptStatus === 'Nonprofit' || 
                           accountData?.taxExemptStatus === 'Education' || 
                           accountData?.taxExemptStatus === 'Healthcare';
  const shouldAllowExemptionAngle = isTaxExemptIndustry || accountTaxExempt;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-weights',message:'Industry weight map selected',data:{normalizedIndustry,usingDefault:!industryAngleWeights[normalizedIndustry],weightKeys:Object.keys(weights).slice(0,5),isTaxExemptIndustry,accountTaxExempt,shouldAllowExemptionAngle},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  // Manual override takes precedence - check if override angle exists in new system
  if (manualAngleOverride) {
    const overrideAngle = getAngleById(manualAngleOverride);
    if (overrideAngle) {
      // Return in expected format
      const normalizedIndustryLower = normalizedIndustry.toLowerCase();
      const industryOpener = getIndustryOpener(manualAngleOverride, normalizedIndustryLower);
      const hookValue = industryOpener?.hook;
      // Handle hook as function or string
      const openingTemplate = typeof hookValue === 'function' 
        ? hookValue('your company') // Provide default company name
        : hookValue || '';
      
      return {
        id: overrideAngle.id,
        label: overrideAngle.label,
        primaryMessage: overrideAngle.primaryMessage,
        openingTemplate: openingTemplate,
        industryContext: normalizedIndustry,
        proof: getIndustryProof(overrideAngle.id, normalizedIndustryLower)
      };
    }
  }
  
  // Create weighted pool (avoid recently used angles)
  const availableAngles = [];
  const recentAngles = Array.isArray(usedAngles) ? usedAngles.filter(Boolean) : [];
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-before-pool',message:'Before creating weighted pool',data:{totalAngleIds:ANGLE_IDS.length,recentAnglesCount:recentAngles.length,recentAngles:recentAngles.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  ANGLE_IDS.forEach(angleId => {
    // Skip if recently used (avoid repetition)
    if (recentAngles.length > 0 && recentAngles.includes(angleId)) {
      return; // Skip this angle
    }
    
    const weight = weights[angleId] || weights.default || 1;
    const angle = getAngleById(angleId);
    
    if (!angle) return;
    
    // Apply news hook boosts if applicable
    let finalWeight = weight;
    if (ACTIVE_NEWS_HOOKS && ACTIVE_NEWS_HOOKS.length > 0) {
      const hook = ACTIVE_NEWS_HOOKS.find(h => Array.isArray(h.angleAffinity) && h.angleAffinity.includes(angleId));
      if (hook) {
        finalWeight = weight * (hook.weight || 1);
      }
    }
    
    // Add angle to pool multiple times based on weight
    for (let i = 0; i < Math.ceil(finalWeight); i++) {
      availableAngles.push(angle);
    }
  });
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-pool-created',message:'Weighted pool created',data:{availableAnglesCount:availableAngles.length,uniqueAngles:Array.from(new Set(availableAngles.map(a => a.id))).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  // Pick random weighted angle
  if (availableAngles.length === 0) {
    // Fallback if all angles recently used
    const fallbackAngle = getAngleById('demand_efficiency');
    if (fallbackAngle) {
      availableAngles.push(fallbackAngle);
    }
  }
  
  const selected = availableAngles[Math.floor(Math.random() * availableAngles.length)];
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-selected',message:'Angle selected from weighted pool',data:{selectedAngleId:selected?.id||null,selectedAngleLabel:selected?.label||null,poolSize:availableAngles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  if (!selected) {
    // Ultimate fallback
    const defaultAngle = getAngleById('demand_efficiency') || getAngleById(ANGLE_IDS[0]);
    if (!defaultAngle) {
      throw new Error('No angles available in angle definitions');
    }
    const normalizedIndustryLower = normalizedIndustry.toLowerCase();
    const industryOpener = getIndustryOpener(defaultAngle.id, normalizedIndustryLower);
    const hookValue = industryOpener?.hook;
    const openingTemplate = typeof hookValue === 'function' 
      ? hookValue('your company')
      : hookValue || '';
    
    return {
      id: defaultAngle.id,
      label: defaultAngle.label,
      primaryMessage: defaultAngle.primaryMessage,
      openingTemplate: openingTemplate,
      industryContext: normalizedIndustry,
      proof: getIndustryProof(defaultAngle.id, normalizedIndustryLower)
    };
  }
  
  // Return in expected format
  const normalizedIndustryLower = normalizedIndustry.toLowerCase();
  const industryOpener = getIndustryOpener(selected.id, normalizedIndustryLower);
  const hookValue = industryOpener?.hook;
  // Handle hook as function or string
  const openingTemplate = typeof hookValue === 'function' 
    ? hookValue('your company') // Provide default company name - caller can replace
    : hookValue || '';
  
  const proof = getIndustryProof(selected.id, normalizedIndustryLower);
  
  const result = {
    id: selected.id,
    label: selected.label,
    primaryMessage: selected.primaryMessage,
    openingTemplate: openingTemplate,
    industryContext: normalizedIndustry,
    proof: proof
  };
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:selectRandomizedAngle-result',message:'selectRandomizedAngle returning result',data:{resultAngleId:result.id,resultLabel:result.label,resultPrimaryMessage:result.primaryMessage,resultOpeningTemplate:result.openingTemplate.substring(0,100),resultProof:result.proof?.substring(0,100),resultIndustryContext:result.industryContext},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'SELECT-ANGLE'})}).catch(()=>{});
  // #endregion
  
  return result;
}

// Select random tone opener (angle-aware)
function selectRandomToneOpener(angleId = null) {
  // Universal openers (work for any angle) - NO em dashes, use natural flow
  // REMOVED "Wondering how you're handling" - it's forbidden and overused
  const universal = [
    "Let me ask you something",
    "So here's the thing",
    "Honestly",
    "Looking at your situation",
    "Question for you",
    "Here's what I'm seeing",
    "Most people I talk to",
    "From what I'm hearing",
    "I've found that teams like yours",
    "Curious",
    "Curious if you're seeing",
    "Wonder if you've noticed",
    "Are you currently handling",
    "How are you managing",
    "Not sure if you've already handled",
    "Quick question that might be off base",
    "Out of curiosity",
    "Real question",
    "Usually when I talk to",
    "Most teams I work with",
    "From what I'm seeing",
    "I was looking at",
    "Quick question",
    "Are you seeing",
    "How are you handling"
  ];

  // Angle-specific openers (for NEW concepts only) - NO em dashes
  const angleSpecific = {
    exemption_recovery: [
      "You ever considered",
      "Did you know",
      "Here's something most teams miss"
    ],
    mission_funding: [
      "You ever considered",
      "Ever think about"
    ],
    consolidation: [
      "Curious",
      "Quick question"
    ],
    timing_strategy: [
      "Quick question",
      "Real question"
    ]
  };

  let pool = angleSpecific[angleId] || [];
  const finalPool = pool.length > 0 ? [...pool, ...universal] : universal;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
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
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
    }));
    return;
  }

  // Check for Perplexity API key
  if (!process.env.PERPLEXITY_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'PERPLEXITY_API_KEY environment variable is not set. Email generation cannot proceed.'
    }));
    return;
  }

  try {
    const { immediate = false, emailId = null, preview = false, emailData: previewEmailData = null } = req.body || {};
    
    // Preview mode: reuse full generation logic but skip all Firestore reads/writes
    if (preview) {
      try {
        const result = await generatePreviewEmail(previewEmailData || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          preview: true,
          subject: result.generatedContent.subject,
          html: result.generatedContent.html,
          text: result.generatedContent.text,
          angle_used: result.generatedContent.angle_used,
          exemption_type: result.generatedContent.exemption_type,
          tone_opener: result.toneOpener || result.generatedContent.tone_opener || null
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          preview: true,
          error: error.message || 'Preview generation failed'
        }));
      }
      return;
    }
    
    let scheduledEmailsSnapshot;
    
    // If specific emailId provided, generate only that email
    if (emailId) {
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Email not found',
          emailId: emailId
        }));
        return;
      }
      
      const emailData = emailDoc.data();
      // Check if email is eligible for generation
      // Allow regeneration for emails that are pending_approval, generating, or not_generated
      const allowedStatuses = ['not_generated', 'generating', 'pending_approval'];
      if (emailData.type !== 'scheduled' || !allowedStatuses.includes(emailData.status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: `Email is not eligible for generation. Type: ${emailData.type}, Status: ${emailData.status}`,
          emailId: emailId
        }));
        return;
      }
      
      // If regenerating (status is not 'not_generated'), reset to 'not_generated' first
      if (emailData.status !== 'not_generated') {
        await db.collection('emails').doc(emailId).update({
          status: 'not_generated',
          updatedAt: new Date().toISOString()
        });
        // Reload the document to get updated data
        const updatedDoc = await db.collection('emails').doc(emailId).get();
        emailDoc = updatedDoc;
        emailData = updatedDoc.data();
      }
      
      // Create a snapshot-like structure with just this one email
      scheduledEmailsSnapshot = {
        docs: [emailDoc],
        empty: false,
        size: 1
      };
      
    } else {
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
      
      // Query for scheduled emails that need generation
      // Use >= and <= to include boundary times
      // Limit to 40 emails per run to stay under 50 RPM rate limit (Tier 0)
      const scheduledEmailsQuery = db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'not_generated')
        .where('scheduledSendTime', '>=', startTime)
        .where('scheduledSendTime', '<=', endTime)
        .limit(40);
      
      scheduledEmailsSnapshot = await scheduledEmailsQuery.get();
    }
    
    if (scheduledEmailsSnapshot.empty) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No scheduled emails to generate' 
      }));
      return;
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
      
      // Process batch in parallel (10 at a time)
      await Promise.all(batch.map(async (emailDoc) => {
      try {
        const emailData = emailDoc.data();
        
        // Helper to mark a generation as invalid and schedule retry/stop
        const markGenerationInvalid = async (reason) => {
          const attempts = (emailData.generationAttempts || 0) + 1;
          const maxAttempts = 3;
          
          if (attempts >= maxAttempts) {
            await emailDoc.ref.update({
              status: 'generation_failed',
              lastGenerationAttempt: Date.now(),
              generationFailureReason: `${reason} (failed ${attempts} times)`,
              generationAttempts: attempts,
              ownerId: emailData.ownerId || 'l.patterson@powerchoosers.com',
              assignedTo: emailData.assignedTo || emailData.ownerId || 'l.patterson@powerchoosers.com',
              createdBy: emailData.createdBy || emailData.ownerId || 'l.patterson@powerchoosers.com'
            });
            
            errors.push({
              emailId: emailDoc.id,
              error: `Permanent failure after ${attempts} attempts: ${reason}`,
              willRetry: false
            });
          } else {
            await emailDoc.ref.update({
              status: 'not_generated',
              lastGenerationAttempt: Date.now(),
              generationFailureReason: reason,
              generationAttempts: attempts,
              ownerId: emailData.ownerId || 'l.patterson@powerchoosers.com',
              assignedTo: emailData.assignedTo || emailData.ownerId || 'l.patterson@powerchoosers.com',
              createdBy: emailData.createdBy || emailData.ownerId || 'l.patterson@powerchoosers.com'
            });
            
            errors.push({
              emailId: emailDoc.id,
              error: `Bad generation (attempt ${attempts}/${maxAttempts}): ${reason}`,
              willRetry: true
            });
          }
        };
        
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
                  // Failed to get account data
                }
              }
            }
          } catch (error) {
          // Failed to get contact data
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
            
            previousEmails = previousEmailsQuery.docs.map(doc => {
              const data = doc.data();
              return {
                subject: data.subject,
                content: data.text || data.html,
                sentAt: data.sentAt || data.createdAt,
                angle_used: data.angle_used || data.angleUsed || null
              };
            });
          } catch (error) {
            // Failed to get previous emails
          }
        }
        
        // Detect industry and select angle (same logic as sequence-builder.js)
        // Check multiple sources for industry (same priority as preview path)
        let recipientIndustry = accountData.industry || contactData.industry || contactData.companyIndustry || '';
        const industryDebug = {
          accountIndustry: accountData.industry || null,
          contactIndustry: contactData.industry || null,
          contactCompanyIndustry: contactData.companyIndustry || null,
          inferredFromCompany: null,
          inferredFromDescription: null
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:live-industry-detection-start',message:'Live generation - industry detection start',data:{hasAccountData:!!accountData,hasContactData:!!contactData,accountIndustry:accountData.industry||null,contactIndustry:contactData.industry||null,contactCompanyIndustry:contactData.companyIndustry||null,initialRecipientIndustry:recipientIndustry,contactCompany:emailData.contactCompany||contactData.company||null},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'LIVE-INDUSTRY-DETECTION'})}).catch(()=>{});
        // #endregion
        
        // Infer industry from company name if not set
        if (!recipientIndustry && (emailData.contactCompany || contactData.company)) {
          const companyName = emailData.contactCompany || contactData.company;
          industryDebug.inferredFromCompany = true;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:live-before-industry-inference',message:'Live generation - before inferring industry from company name',data:{companyName},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'LIVE-INDUSTRY-DETECTION'})}).catch(()=>{});
          // #endregion
          recipientIndustry = IndustryDetection.inferIndustryFromCompanyName(companyName);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:live-after-industry-inference',message:'Live generation - after inferring industry from company name',data:{companyName,inferredIndustry:recipientIndustry},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'LIVE-INDUSTRY-DETECTION'})}).catch(()=>{});
          // #endregion
        }
        
        // Infer from account description if still not set
        if (!recipientIndustry && accountData) {
          const accountDesc = accountData.shortDescription || accountData.short_desc || 
                             accountData.descriptionShort || accountData.description || 
                             accountData.companyDescription || accountData.accountDescription || '';
          if (accountDesc) {
            industryDebug.inferredFromDescription = true;
            recipientIndustry = IndustryDetection.inferIndustryFromDescription(accountDesc);
          }
        }
        
        // Default to 'Default' if no industry detected
        if (!recipientIndustry) {
          recipientIndustry = 'Default';
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generate-scheduled-emails.js:live-industry-detection-final',message:'Live generation - final industry detection result',data:{finalIndustry:recipientIndustry,industryDebug},timestamp:Date.now(),sessionId:'debug-session',runId:'angle-test',hypothesisId:'LIVE-INDUSTRY-DETECTION'})}).catch(()=>{});
        // #endregion
        
        // Build recipient object used for angle selection + prompt context
        // Include energy supplier and other energy fields from account
        const recipient = {
          firstName: contactData.firstName || contactData.name || emailData.contactName || 'there',
          company: contactData.company || accountData.companyName || accountData.name || emailData.contactCompany || '',
          title: contactData.role || contactData.title || contactData.job || '',
          industry: recipientIndustry,
          account: accountData,
          // Build energy object for email personalization context
          energy: {
            supplier: accountData.electricitySupplier || accountData.electricity_supplier || '',
            currentRate: accountData.currentRate || accountData.current_rate || '',
            contractEnd: accountData.contractEndDate || accountData.contract_end_date || '',
            annualUsage: accountData.annualUsage || accountData.annual_usage || ''
          }
        };
        
        // Extract recently used angles for this contact within this sequence (avoid repeats)
        const usedAngles = [];
        if (Array.isArray(previousEmails)) {
          previousEmails.forEach(prev => {
            if (prev && prev.angle_used) {
              usedAngles.push(prev.angle_used);
            } else if (prev && prev.content) {
              const content = String(prev.content).toLowerCase();
              if (content.includes('6 months') || content.includes('renewal timing')) {
                usedAngles.push('timing_strategy');
              }
              if (content.includes('exemption') || content.includes('tax')) {
                usedAngles.push('exemption_recovery');
              }
              if (content.includes('consolidat') || content.includes('multiple')) {
                usedAngles.push('consolidation');
              }
            }
          });
        }
        
        // Select angle based on industry/role/exemption status with memory + news boosts
        const selectedAngle = selectRandomizedAngle(recipientIndustry, null, recipient, usedAngles);
        // CRITICAL: Remove any em dashes from tone opener immediately after selection
        const toneOpener = removeEmDashes(selectRandomToneOpener(selectedAngle?.id));
        
        // Decide AI mode for this email based on sequence configuration.
        // Default to "standard" so the body matches NEPQ-style plain emails
        // unless the step explicitly requested HTML generation.
        const aiMode = (emailData.aiMode || '').toLowerCase() === 'html' ? 'html' : 'standard';

        // Determine if this step should use the strict cold-email template
        // CRITICAL: All scheduled emails in sequences are cold emails, so default to cold_email template
        // This ensures angle-based CTAs, tone openers, and subject lines are always applied
        const isColdStep = (
          emailData.stepType === 'intro' ||
          emailData.template === 'first-email-intro' ||
          String(emailData.aiMode || '').toLowerCase() === 'cold-email' ||
          emailData.stepIndex === 0 || // First step in sequence is always a cold email
          emailData.stepIndex === undefined // If no stepIndex, assume it's a cold email
        );

        // Generate email content using /api/perplexity-email endpoint (which has full angle system)
        // Cloud Run deployment: always use PUBLIC_BASE_URL, fall back to localhost for local testing
        const baseUrl = (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.replace(/\/$/, '')) 
          || 'http://localhost:3000';

        // Calculate email position (1-based) for CTA escalation and subject progression
        const emailPosition = typeof emailData.stepIndex === 'number' ? emailData.stepIndex + 1 : 1;
        
        const perplexityResponse = await fetch(`${baseUrl}/api/perplexity-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: emailData.aiPrompt || 'Write a professional follow-up email',
            mode: aiMode,
            // CRITICAL: Always use cold_email template type for scheduled emails to ensure
            // angle-based CTAs, tone openers, and subject lines are applied
            // This ensures all sequence emails use the new angle-based system
            templateType: 'cold_email',
            recipient: recipient,
            selectedAngle: selectedAngle,
            toneOpener: toneOpener,
            senderName: 'Lewis Patterson',
            emailPosition: emailPosition, // 1, 2, or 3 for CTA escalation and subject progression
            previousAngles: usedAngles // Pass used angles for context
          })
        });
        
        if (!perplexityResponse.ok) {
          throw new Error(`Perplexity email API error: ${perplexityResponse.status}`);
        }
        
        const perplexityResult = await perplexityResponse.json();
        
        if (!perplexityResult.ok) {
          throw new Error(`Perplexity email API failed: ${perplexityResult.error || 'Unknown error'}`);
        }
        
        let htmlContent = '';
        let textContent = '';

        if (aiMode === 'html') {
          // HTML mode: use the same cold email HTML template as Cloud Run / preview
          const outputData = perplexityResult.output || {};
          htmlContent = buildColdEmailHtmlTemplate(outputData, recipient);
          textContent = removeEmDashes(buildTextVersionFromHtml(htmlContent)); // Remove em dashes from text version
        } else {
          // Standard mode: parse JSON-style output and build a simple NEPQ email body
          const raw = String(perplexityResult.output || '').trim();
          let jsonData = null;
          try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              jsonData = JSON.parse(match[0]);
            }
          } catch (e) {
            // Fallback to treating output as plain text
            jsonData = null;
          }

          let subject = emailData.subject || 'Energy update';
          let bodyText = removeEmDashes(raw); // Remove em dashes from full body text
          
          // Helper: Enforce first name only in greeting (not full name)
          // Matches real email rules: "Hello Kurt," NOT "Hello Kurt Lacoste,"
          const enforceFirstNameOnly = (greeting, contactData) => {
            if (!greeting || typeof greeting !== 'string') return greeting;
            
            // Get first name from contact data
            const firstName = contactData?.firstName || contactData?.first_name || 
                             (contactData?.name ? contactData.name.split(' ')[0] : '') ||
                             (emailData.contactName ? emailData.contactName.split(' ')[0] : '');
            
            if (!firstName) return greeting;
            
            // Pattern: "Hello [Full Name]," or "Hi [Full Name]," etc.
            // Replace with first name only
            const greetingPattern = /^(Hi|Hello|Hey|Dear)\s+([^,]+),/i;
            const match = greeting.match(greetingPattern);
            
            if (match) {
              const salutation = match[1]; // "Hi", "Hello", etc.
              const namePart = match[2].trim();
              
              // If namePart contains more than just the first name, replace with first name only
              if (namePart !== firstName && namePart.toLowerCase().includes(firstName.toLowerCase())) {
                return `${salutation} ${firstName},`;
              }
              // If it's already just first name, keep it
              if (namePart === firstName) {
                return greeting;
              }
              // If namePart doesn't match first name, replace with first name
              return `${salutation} ${firstName},`;
            }
            
            return greeting;
          };
          
          if (jsonData && typeof jsonData === 'object') {
            if (jsonData.subject) subject = jsonData.subject;
            const parts = [];
            // Enforce first name only in greeting (matches real email rules)
            if (jsonData.greeting) {
              const cleanedGreeting = enforceFirstNameOnly(jsonData.greeting, contactData);
              parts.push(cleanedGreeting);
            }
            
            // CRITICAL: Replace "Wondering how..." in paragraph1 if present
            let paragraph1 = jsonData.paragraph1 || '';
            if (paragraph1 && toneOpener) {
              const paragraph1Lower = paragraph1.toLowerCase().trim();
              const hasWonderingHow = /^wondering how/i.test(paragraph1Lower);
              
              if (hasWonderingHow) {
                // Replace "Wondering how..." with tone opener style
                
                // Extract the question part after "Wondering how [company] is handling..."
                const wonderingMatch = paragraph1.match(/^wondering how [^?]+\?/i);
                const questionPart = wonderingMatch ? wonderingMatch[0].replace(/^wondering how /i, '') : '';
                
                // Convert tone opener to natural opener
                let naturalOpener = '';
                const toneOpenerLower = toneOpener.toLowerCase();
                // REMOVED "real talk" - not professional enough for corporate America
                if (toneOpenerLower.includes('honestly')) {
                  naturalOpener = 'Honestly, ';
                } else if (toneOpenerLower.includes('curious')) {
                  naturalOpener = 'Curious if ';
                } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
                  naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
                } else if (toneOpenerLower.includes('out of curiosity')) {
                  naturalOpener = 'Out of curiosity, ';
                } else if (toneOpenerLower.includes('question for you')) {
                  naturalOpener = 'Question for you, ';
                } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
                  naturalOpener = 'Most teams ';
                } else if (toneOpenerLower.includes('from what')) {
                  naturalOpener = 'From what I\'m hearing, ';
                } else if (toneOpenerLower.includes('looking at')) {
                  naturalOpener = 'Looking at your situation, ';
                } else if (toneOpenerLower.includes('so here')) {
                  naturalOpener = 'So here\'s the thing, ';
                } else if (toneOpenerLower.includes('not sure')) {
                  naturalOpener = 'Not sure if ';
                } else if (toneOpenerLower.includes('ive found') || toneOpenerLower.includes('teams like')) {
                  naturalOpener = 'Most teams ';
                } else {
                  naturalOpener = 'Curious if ';
                }
                
                // Rebuild paragraph1 with natural opener
                if (questionPart) {
                  paragraph1 = naturalOpener + questionPart;
                } else {
                  // Fallback: use tone opener directly
                  const restOfParagraph = paragraph1.replace(/^wondering how [^?]+\?/i, '').trim();
                paragraph1 = naturalOpener + restOfParagraph;
              }
            }
            }
            
            if (paragraph1) parts.push(paragraph1);
            if (jsonData.paragraph2) parts.push(jsonData.paragraph2);
            if (jsonData.paragraph3) parts.push(jsonData.paragraph3);
            // Ensure closing is always added (Best regards, + sender name)
            if (jsonData.closing) {
              parts.push(jsonData.closing);
            } else {
              // Fallback: add default closing with sender name
              const senderFirstName = (emailData.senderName || 'Lewis').split(' ')[0];
              parts.push(`Best regards,\n${senderFirstName}`);
            }
            bodyText = parts.join('\n\n') || raw;
            
            // CRITICAL: Replace "Wondering how..." in bodyText if present (scheduled path, after joining)
            if (bodyText && toneOpener) {
              const bodyTextLower = bodyText.toLowerCase();
              const hasWonderingHow = /^wondering how/i.test(bodyTextLower.trim()) || /\n\nwondering how/i.test(bodyTextLower);
              
              if (hasWonderingHow) {
                // Replace "Wondering how..." with tone opener style
                
                // Extract the question part after "Wondering how [company] is handling..."
                const wonderingMatch = bodyText.match(/(?:^|\n\n)wondering how [^?]+\?/i);
                const questionPart = wonderingMatch ? wonderingMatch[0].replace(/(?:^|\n\n)wondering how /i, '') : '';
                
                // Convert tone opener to natural opener
                let naturalOpener = '';
                const toneOpenerLower = toneOpener.toLowerCase();
                // REMOVED "real talk" - not professional enough for corporate America
                if (toneOpenerLower.includes('honestly')) {
                  naturalOpener = 'Honestly, ';
                } else if (toneOpenerLower.includes('curious')) {
                  naturalOpener = 'Curious if ';
                } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
                  naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
                } else if (toneOpenerLower.includes('out of curiosity')) {
                  naturalOpener = 'Out of curiosity, ';
                } else if (toneOpenerLower.includes('question for you')) {
                  naturalOpener = 'Question for you, ';
                } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
                  naturalOpener = 'Most teams ';
                } else if (toneOpenerLower.includes('from what')) {
                  naturalOpener = 'From what I\'m hearing, ';
                } else if (toneOpenerLower.includes('looking at')) {
                  naturalOpener = 'Looking at your situation, ';
                } else if (toneOpenerLower.includes('so here')) {
                  naturalOpener = 'So here\'s the thing, ';
                } else if (toneOpenerLower.includes('not sure')) {
                  naturalOpener = 'Not sure if ';
                } else if (toneOpenerLower.includes('ive found') || toneOpenerLower.includes('teams like')) {
                  naturalOpener = 'Most teams ';
                } else {
                  naturalOpener = 'Curious if ';
                }
                
                // Rebuild bodyText with natural opener
                if (questionPart) {
                  bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, (match) => {
                    return match.replace(/wondering how /i, naturalOpener);
                  });
                } else {
                // Fallback: replace the pattern directly
                bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, naturalOpener);
              }
            }
            }
          }
          else {
            const looksLikeJson = /"subject"\s*:\s*/i.test(raw) || /"greeting"\s*:\s*/i.test(raw);
            if (looksLikeJson) {
              await markGenerationInvalid('Malformed JSON output (raw fields present)');
              return;
            }
            
            // CRITICAL: Replace "Wondering how..." in raw text if present (standard mode, non-JSON)
            if (bodyText && toneOpener) {
              const bodyTextLower = bodyText.toLowerCase().trim();
              const hasWonderingHow = /^wondering how/i.test(bodyTextLower) || /\n\nwondering how/i.test(bodyTextLower);
              
              if (hasWonderingHow) {
                // Replace "Wondering how..." with tone opener style
                
                // Extract the question part after "Wondering how [company] is handling..."
                const wonderingMatch = bodyText.match(/(?:^|\n\n)wondering how [^?]+\?/i);
                const questionPart = wonderingMatch ? wonderingMatch[0].replace(/(?:^|\n\n)wondering how /i, '') : '';
                
                // Convert tone opener to natural opener
                let naturalOpener = '';
                const toneOpenerLower = toneOpener.toLowerCase();
                // REMOVED "real talk" - not professional enough for corporate America
                if (toneOpenerLower.includes('honestly')) {
                  naturalOpener = 'Honestly, ';
                } else if (toneOpenerLower.includes('curious')) {
                  naturalOpener = 'Curious if ';
                } else if (toneOpenerLower.includes('are you') || toneOpenerLower.includes('how are you')) {
                  naturalOpener = questionPart ? 'Are you ' + questionPart.replace(/^[^ ]+ /, '') : 'Are you handling ';
                } else if (toneOpenerLower.includes('out of curiosity')) {
                  naturalOpener = 'Out of curiosity, ';
                } else if (toneOpenerLower.includes('question for you')) {
                  naturalOpener = 'Question for you, ';
                } else if (toneOpenerLower.includes('most teams') || toneOpenerLower.includes('usually')) {
                  naturalOpener = 'Most teams ';
                } else if (toneOpenerLower.includes('from what')) {
                  naturalOpener = 'From what I\'m hearing, ';
                } else if (toneOpenerLower.includes('looking at')) {
                  naturalOpener = 'Looking at your situation, ';
                } else if (toneOpenerLower.includes('so here')) {
                  naturalOpener = 'So here\'s the thing, ';
                } else if (toneOpenerLower.includes('not sure')) {
                  naturalOpener = 'Not sure if ';
                } else if (toneOpenerLower.includes('ive found') || toneOpenerLower.includes('teams like')) {
                  naturalOpener = 'Most teams ';
                } else {
                  naturalOpener = 'Curious if ';
                }
                
                // Rebuild bodyText with natural opener
                if (questionPart) {
                  bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, (match) => {
                    return match.replace(/wondering how /i, naturalOpener);
                  });
                } else {
                // Fallback: replace the pattern directly
                bodyText = bodyText.replace(/(?:^|\n\n)wondering how [^?]+\?/i, naturalOpener);
              }
            }
            }
          }

          // For true cold intro steps, use angle-based subject generation
          // This gives Perplexity creative control while ensuring angle-specific variation
          if (isColdStep && selectedAngle) {
            const firstNameForSubject = recipient.firstName || contactData.firstName || emailData.contactName || '';
            const companyForSubject = recipient.company || emailData.contactCompany || '';
            
            // Create angle-based subject variations
            const angleSubjects = {
              timing_strategy: [
                `${firstNameForSubject}, when does your contract expire?`,
                `${firstNameForSubject}, rate lock timing question`,
                `${companyForSubject} renewal timing question`,
                `${firstNameForSubject}, contract renewal window?`
              ],
              exemption_recovery: [
                `${firstNameForSubject}, are you claiming exemptions?`,
                `${firstNameForSubject}, tax exemption question`,
                `${companyForSubject} exemption recovery question`,
                `${firstNameForSubject}, electricity exemptions?`
              ],
              consolidation: [
                `${firstNameForSubject}, how many locations are you managing?`,
                `${firstNameForSubject}, multi-site energy question`,
                `${companyForSubject} consolidation opportunity?`,
                `${firstNameForSubject}, multiple locations?`
              ],
              demand_efficiency: [
                `${firstNameForSubject}, optimizing before renewal?`,
                `${firstNameForSubject}, consumption efficiency question`,
                `${companyForSubject} pre-renewal optimization?`,
                `${firstNameForSubject}, efficiency before renewal?`
              ],
              operational_continuity: [
                `${firstNameForSubject}, peak demand handling?`,
                `${firstNameForSubject}, uptime vs savings?`,
                `${companyForSubject} operational continuity question`,
                `${firstNameForSubject}, demand charge question?`
              ],
              mission_funding: [
                `${firstNameForSubject}, redirecting funds to mission?`,
                `${companyForSubject} mission funding question`,
                `${firstNameForSubject}, vendor cost question?`,
                `${firstNameForSubject}, program funding?`,
                `Mission funding at ${companyForSubject}?`,
                `${firstNameForSubject}, redirecting vendor costs?`,
                `${companyForSubject} vendor cost reduction?`,
                `${firstNameForSubject}, program funding opportunity?`
              ],
              budget_stability: [
                `${firstNameForSubject}, locking in energy costs?`,
                `${companyForSubject} budget stability question`,
                `${firstNameForSubject}, cost predictability?`,
                `${firstNameForSubject}, budget volatility?`,
                `Budget stability for ${companyForSubject}?`,
                `${firstNameForSubject}, locking in rates?`,
                `${companyForSubject} cost predictability question`,
                `${firstNameForSubject}, budget planning for 2026?`
              ],
              operational_simplicity: [
                `${firstNameForSubject}, managing multiple suppliers?`,
                `${companyForSubject} vendor consolidation question`,
                `${firstNameForSubject}, unified billing?`,
                `${firstNameForSubject}, supplier management?`,
                `Vendor consolidation at ${companyForSubject}?`,
                `${firstNameForSubject}, simplifying suppliers?`,
                `${companyForSubject} unified billing question`,
                `${firstNameForSubject}, supplier consolidation?`
              ],
              cost_control: [
                `${firstNameForSubject}, energy cost predictability?`,
                `${companyForSubject} budget planning question`,
                `${firstNameForSubject}, rate volatility?`,
                `${firstNameForSubject}, cost control?`,
                `Cost control at ${companyForSubject}?`,
                `${firstNameForSubject}, energy budget planning?`,
                `${companyForSubject} rate volatility question`,
                `${firstNameForSubject}, 2026 energy strategy?`
              ],
              operational_efficiency: [
                `${firstNameForSubject}, energy costs impacting efficiency?`,
                `${companyForSubject} operational efficiency question`,
                `${firstNameForSubject}, cost reduction opportunity?`,
                `Operational efficiency at ${companyForSubject}?`,
                `${firstNameForSubject}, energy efficiency?`,
                `${companyForSubject} cost reduction question`,
                `${firstNameForSubject}, efficiency opportunity?`
              ],
              data_governance: [
                `${firstNameForSubject}, visibility into energy usage?`,
                `${companyForSubject} energy reporting question`,
                `${firstNameForSubject}, centralized metering?`,
                `Energy reporting at ${companyForSubject}?`,
                `${firstNameForSubject}, energy visibility?`,
                `${companyForSubject} centralized metering question`,
                `${firstNameForSubject}, usage reporting?`
              ]
            };
            
            const angleId = selectedAngle.id || 'timing_strategy';
            const subjects = angleSubjects[angleId] || angleSubjects.timing_strategy;
            subject = subjects[Math.floor(Math.random() * subjects.length)];
          } else if (isColdStep) {
            // Fallback to role-based if no angle available
            const roleForSubject = recipient.title || '';
            const firstNameForSubject = recipient.firstName || contactData.firstName || emailData.contactName || '';
            const companyForSubject = recipient.company || emailData.contactCompany || '';
            subject = getRandomIntroSubject(roleForSubject, firstNameForSubject, companyForSubject);
          }

          const escapeHtml = (str) => String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          const paragraphs = bodyText
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(Boolean);

          htmlContent = paragraphs
            .map(p => `<p style="margin:0 0 16px 0; color:#222;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join('');

          textContent = removeEmDashes(bodyText); // Ensure em dashes are removed from final text
          
          // Replace subject in generatedContent below
          emailData.generatedSubject = subject;
        }
        
        // Format the result to match expected structure
        const generatedContent = {
          subject: emailData.generatedSubject || (perplexityResult.output?.subject) || 'Follow-up Email',
          html: htmlContent,
          text: textContent,
          angle_used: selectedAngle?.id || null,
          exemption_type: accountData?.taxExemptStatus || null
        };
        
        // NEPQ validation to enforce structure and tone opener usage
        const nepqValidation = validateNepqContent(
          generatedContent.subject,
          generatedContent.text,
          toneOpener
        );
        
        if (!nepqValidation.isValid) {
          await markGenerationInvalid(nepqValidation.reason);
          return;
        }

        // Use the potentially modified body from validation
        if (nepqValidation.modifiedBody && nepqValidation.modifiedBody !== generatedContent.text) {
          generatedContent.text = removeEmDashes(nepqValidation.modifiedBody); // Remove em dashes from modified body
          // Rebuild HTML content completely (avoid duplication)
          if (generatedContent.html) {
            const paragraphs = generatedContent.text.split('\n\n').filter(p => p.trim());
            generatedContent.html = paragraphs
              .map(p => `<p style="margin:0 0 16px 0; color:#222;">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
              .join('');
          }
        }
        
        // CRITICAL: Validate generated content before saving
        // Detect malformed AI generations that should not be sent
        
        // Calculate word count for improvement verification
        const calculateWordCount = (text) => {
          if (!text) return 0;
          const cleanText = text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
          return cleanText.split(/\s+/).filter(w => w.length > 0).length;
        };
        const bodyWordCount = calculateWordCount(generatedContent.text);
        const hasContractUrgency = generatedContent.text?.toLowerCase().includes('contract') && 
          (generatedContent.text?.toLowerCase().includes('expire') || 
           generatedContent.text?.toLowerCase().includes('renewal') ||
           generatedContent.text?.toLowerCase().includes('months'));
        const hasDynamicSavings = /(8-12%|10-15%|12-18%|12-20%|15-25%|8-15%)/.test(generatedContent.text || '');
        const hasAngleValueProp = selectedAngle?.id && generatedContent.text?.toLowerCase().includes(
          selectedAngle.id === 'timing_strategy' ? 'early' :
          selectedAngle.id === 'exemption_recovery' ? 'exemption' :
          selectedAngle.id === 'consolidation' ? 'consolidat' :
          selectedAngle.id === 'demand_efficiency' ? 'consumption' :
          selectedAngle.id === 'cost_control' ? 'volatility' :
          selectedAngle.id === 'operational_simplicity' ? 'simplif' : ''
        );
        const validation = validateGeneratedContent(
          generatedContent.html, 
          generatedContent.text, 
          generatedContent.subject
        );
        
        if (!validation.isValid) {
          await markGenerationInvalid(validation.reason);
          return;
        }
        
        // Update email with generated content
        // Ensure ownership fields are preserved/set
        const updateData = {
          subject: generatedContent.subject,
          html: generatedContent.html,
          text: generatedContent.text,
          status: 'pending_approval',
          generatedAt: Date.now(),
          generatedBy: 'scheduled_job',
          // Angle + context metadata for performance tracking
          angle_used: generatedContent.angle_used || null,
          exemption_type: generatedContent.exemption_type || null,
          angleUsed: generatedContent.angle_used || null,
          toneOpenersUsed: toneOpener || null,
          industryDetected: recipientIndustry || null,
          roleDetected: recipient.title || null,
          version: '2.0'
        };
        
        // CRITICAL: Ensure ownership fields are set for Firestore rules compliance
        // If missing, set to admin fallback (should not happen, but safety check)
        updateData.ownerId = emailData.ownerId || 'l.patterson@powerchoosers.com';
        updateData.assignedTo = emailData.assignedTo || emailData.ownerId || 'l.patterson@powerchoosers.com';
        updateData.createdBy = emailData.createdBy || emailData.ownerId || 'l.patterson@powerchoosers.com';
        
        await emailDoc.ref.update(updateData);
        
        generatedCount++;
        
      } catch (error) {
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
          // Failed to update error status
        }
      }
    })); // End Promise.all
      
      // Add delay between batches to respect rate limit (except after last batch)
      if (batchEnd < docs.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    } // End batch loop
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: generatedCount,
      errors: errors.length,
      errorDetails: errors
    }));
    
  } catch (error) {
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
  
  // Clean data fields (remove citations and em dashes)
  const cleanField = (field) => {
    if (!field) return '';
    return removeEmDashes(String(field).replace(/\[\d+\]/g, '').trim());
  };
  
  // Helper: Enforce first name only in greeting (not full name)
  const enforceFirstNameOnly = (greeting) => {
    if (!greeting || typeof greeting !== 'string') return greeting;
    
    if (!firstName) return greeting;
    
    // Pattern: "Hello [Full Name]," or "Hi [Full Name]," etc.
    // Replace with first name only
    const greetingPattern = /^(Hi|Hello|Hey|Dear)\s+([^,]+),/i;
    const match = greeting.match(greetingPattern);
    
    if (match) {
      const salutation = match[1]; // "Hi", "Hello", etc.
      const namePart = match[2].trim();
      
      // If namePart contains more than just the first name, replace with first name only
      if (namePart !== firstName && namePart.toLowerCase().includes(firstName.toLowerCase())) {
        return `${salutation} ${firstName},`;
      }
      // If it's already just first name, keep it
      if (namePart === firstName) {
        return greeting;
      }
      // If namePart doesn't match first name, replace with first name
      return `${salutation} ${firstName},`;
    }
    
    return greeting;
  };
  
  // Enforce first name only in greeting (matches real email rules)
  const rawGreeting = cleanField(data.greeting) || `Hi ${firstName},`;
  const greeting = enforceFirstNameOnly(rawGreeting);
  const openingHook = cleanField(data.opening_hook) || `I tried reaching you earlier but couldn't connect. I wanted to share some important information about energy cost trends that could significantly impact ${company}.`;
  const valueProposition = cleanField(data.value_proposition) || (industry ? `Most ${industry} companies like ${company} see 10-20% savings through competitive procurement. The process is handled end-to-end: analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>` : 'Most businesses see 10-20% savings through competitive procurement and efficiency solutions. The process is handled end-to-end: analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>');
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
        Quick 15-minute call to discuss your options, no obligation.
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
