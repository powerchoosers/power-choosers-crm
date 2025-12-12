import { db } from './_firebase.js';
import * as IndustryDetection from './_industry-detection.js';
import logger from './_logger.js';

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
  const body = (text || '').toString();
  const lower = body.toLowerCase();
  const errors = [];

  // Forbidden phrases that trigger “old model” sales tone
  const forbidden = [
    /\bi\s+(saw|noticed|read|came across)\b/i,
    /hope this email finds you well/i,
    /just following up/i,
    /\bmy name is\b/i,
    /wanted to (reach out|introduce)/i
  ];
  if (forbidden.some(rx => rx.test(body))) {
    errors.push('Contains forbidden salesy phrasing (I saw/noticed/read, hope this finds you well, just following up, my name is, wanted to reach out).');
  }

  // Tone opener must appear near the start
  if (toneOpener) {
    const openerIdx = body.indexOf(toneOpener);
    if (openerIdx === -1) {
      errors.push(`Tone opener missing: "${toneOpener}" must be the first line after the greeting.`);
    } else if (openerIdx > 160) {
      errors.push(`Tone opener is too far down the email. It must start immediately after the greeting: "${toneOpener}".`);
    }
  }

  // Conversational questions: require at least two
  const questionCount = (body.match(/\?/g) || []).length;
  if (questionCount < 2) {
    errors.push('Email must include at least two questions (problem-awareness + low-friction CTA).');
  }

  // High-friction CTAs (avoid scheduling asks)
  const highFriction = [
    /\b15\s*minutes?\b/i,
    /\b30\s*minutes?\b/i,
    /schedule (a )?(call|meeting)/i,
    /book (a )?(call|meeting)/i
  ];
  if (highFriction.some(rx => rx.test(lower))) {
    errors.push('CTA appears high-friction (asks to schedule time). Use a simple qualifying question instead.');
  }

  // Subject spamminess (avoid pitchy words)
  const spammySubjects = [/save/i, /free/i, /% off/i, /deal/i];
  if (subject && spammySubjects.some(rx => rx.test(subject))) {
    errors.push('Subject sounds like a pitch (contains save/free/% off/deal).');
  }

  return {
    isValid: errors.length === 0,
    reason: errors.join(' ')
  };
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
  if (!recipientIndustry && (emailData.contactCompany || contactData.company)) {
    recipientIndustry = inferIndustryFromCompanyName(emailData.contactCompany || contactData.company);
  }
  if (!recipientIndustry) {
    const accountDesc = accountData.shortDescription || accountData.short_desc ||
      accountData.descriptionShort || accountData.description ||
      accountData.companyDescription || accountData.accountDescription || '';
    if (accountDesc) {
      recipientIndustry = inferIndustryFromDescription(accountDesc);
    }
  }
  if (!recipientIndustry) recipientIndustry = 'Default';

  // Build recipient object (mirrors production generation path)
  const recipient = {
    firstName: contactData.firstName || contactData.first_name || contactData.name || emailData.contactName || 'there',
    company: contactData.company || accountData.companyName || accountData.name || emailData.contactCompany || '',
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
  const selectedAngle = selectRandomizedAngle(recipientIndustry, null, recipient, usedAngles);
  const toneOpener = selectRandomToneOpener(selectedAngle?.id);

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

  const perplexityResponse = await fetch(`${baseUrl}/api/perplexity-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: emailData.aiPrompt || 'Write a professional follow-up email',
      mode: aiMode,
      templateType: 'cold_email',
      recipient: recipient,
      selectedAngle: selectedAngle,
      toneOpener: toneOpener,
      senderName: 'Lewis Patterson',
      emailPosition: emailPosition,
      previousAngles: usedAngles
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
    const outputData = perplexityResult.output || {};
    htmlContent = buildColdEmailHtmlTemplate(outputData, recipient);
    textContent = buildTextVersionFromHtml(htmlContent);
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
    let bodyText = raw;

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
      if (jsonData.subject) subject = jsonData.subject;
      const parts = [];
      if (jsonData.greeting) {
        const cleanedGreeting = enforceFirstNameOnly(jsonData.greeting);
        parts.push(cleanedGreeting);
      }
      if (jsonData.paragraph1) parts.push(jsonData.paragraph1);
      if (jsonData.paragraph2) parts.push(jsonData.paragraph2);
      if (jsonData.paragraph3) parts.push(jsonData.paragraph3);
      if (jsonData.closing) {
        parts.push(jsonData.closing);
      } else {
        const senderFirstName = 'Lewis';
        parts.push(`Best regards,\n${senderFirstName}`);
      }
      bodyText = parts.join('\n\n') || raw;
    }

    if (isColdStep && selectedAngle) {
      const firstNameForSubject = recipient.firstName || contactData.firstName || emailData.contactName || '';
      const companyForSubject = recipient.company || emailData.contactCompany || '';
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
          `${firstNameForSubject}, program funding?`
        ],
        budget_stability: [
          `${firstNameForSubject}, locking in energy costs?`,
          `${companyForSubject} budget stability question`,
          `${firstNameForSubject}, cost predictability?`,
          `${firstNameForSubject}, budget volatility?`
        ],
        operational_simplicity: [
          `${firstNameForSubject}, managing multiple suppliers?`,
          `${companyForSubject} vendor consolidation question`,
          `${firstNameForSubject}, unified billing?`,
          `${firstNameForSubject}, supplier management?`
        ],
        cost_control: [
          `${firstNameForSubject}, energy cost predictability?`,
          `${companyForSubject} budget planning question`,
          `${firstNameForSubject}, rate volatility?`,
          `${firstNameForSubject}, cost control?`
        ],
        operational_efficiency: [
          `${firstNameForSubject}, energy costs impacting efficiency?`,
          `${companyForSubject} operational efficiency question`,
          `${firstNameForSubject}, cost reduction opportunity?`
        ],
        data_governance: [
          `${firstNameForSubject}, visibility into energy usage?`,
          `${companyForSubject} energy reporting question`,
          `${firstNameForSubject}, centralized metering?`
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

    textContent = bodyText;
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
function selectRandomizedAngle(industry, manualAngleOverride, accountData, usedAngles = []) {
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

  // Avoid repeating angles that were just used in this sequence for this contact
  const recentAngles = Array.isArray(usedAngles) ? usedAngles.filter(Boolean) : [];
  if (recentAngles.length > 0) {
    const freshAngles = availableAngles.filter(a => !recentAngles.includes(a.id));
    if (freshAngles.length > 0) {
      availableAngles = freshAngles;
    }
  }

  // Apply optional news hook boosts to angle weights
  if (ACTIVE_NEWS_HOOKS.length > 0) {
    const boosted = [];
    for (const angle of availableAngles) {
      const hook = ACTIVE_NEWS_HOOKS.find(h => Array.isArray(h.angleAffinity) && h.angleAffinity.includes(angle.id));
      if (hook) {
        boosted.push({
          ...angle,
          weight: (angle.weight || 0) * (hook.weight || 1)
        });
      } else {
        boosted.push(angle);
      }
    }
    availableAngles = boosted;
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

// Select random tone opener (angle-aware)
function selectRandomToneOpener(angleId = null) {
  // Universal openers (work for any angle)
  const universal = [
    "Let me ask you something—",
    "So here's the thing—",
    "Honestly—",
    "Looking at your situation—",
    "Question for you—",
    "Here's what I'm seeing—",
    "Most people I talk to—",
    "From what I'm hearing—",
    "I've found that teams like yours—",
    "Curious—",
    "Real talk—"
  ];

  // Angle-specific openers (for NEW concepts only)
  const angleSpecific = {
    exemption_recovery: [
      "You ever considered—",
      "Did you know—",
      "Here's something most teams miss—"
    ],
    mission_funding: [
      "You ever considered—",
      "Ever think about—"
    ],
    consolidation: [
      "Curious—",
      "Quick question—"
    ],
    timing_strategy: [
      "Quick question—",
      "Real question—"
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
    logger.error('[GenerateScheduledEmails] Firestore not initialized. Missing Firebase service account env vars.');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
    }));
    return;
  }

  // Check for Perplexity API key
  if (!process.env.PERPLEXITY_API_KEY) {
    logger.error('[GenerateScheduledEmails] CRITICAL: PERPLEXITY_API_KEY environment variable is not set!');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'PERPLEXITY_API_KEY environment variable is not set. Email generation cannot proceed.'
    }));
    return;
  }

  try {
    const { immediate = false, emailId = null, preview = false, emailData: previewEmailData = null } = req.body || {};
    
    logger.debug('[GenerateScheduledEmails] Starting generation process, immediate:', immediate, 'emailId:', emailId);
    logger.debug('[GenerateScheduledEmails] Perplexity API key present:', !!process.env.PERPLEXITY_API_KEY);
    
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
      
      logger.debug('[GenerateScheduledEmails] Generating specific email:', emailId);
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
      
      logger.debug('[GenerateScheduledEmails] Time range:', { startTime, endTime, immediate, now });
      
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
      logger.debug('[GenerateScheduledEmails] No emails to generate');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No scheduled emails to generate' 
      }));
      return;
    }
    
    logger.debug('[GenerateScheduledEmails] Found', scheduledEmailsSnapshot.size, 'emails to generate');
    logger.debug('[GenerateScheduledEmails] Rate limit: 50 RPM (Tier 0) - processing in batches');
    
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
      
      logger.debug(`[GenerateScheduledEmails] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)} (${batch.length} emails)`);
      
      // Process batch in parallel (10 at a time)
      await Promise.all(batch.map(async (emailDoc) => {
      try {
        const emailData = emailDoc.data();
        logger.debug('[GenerateScheduledEmails] Processing email:', emailDoc.id);
        
        // Helper to mark a generation as invalid and schedule retry/stop
        const markGenerationInvalid = async (reason) => {
          logger.warn(`[GenerateScheduledEmails] ⚠️ BAD GENERATION for ${emailDoc.id}: ${reason}`);
          const attempts = (emailData.generationAttempts || 0) + 1;
          const maxAttempts = 3;
          
          if (attempts >= maxAttempts) {
            logger.error(`[GenerateScheduledEmails] ❌ Email ${emailDoc.id} failed ${attempts} times, marking as permanent error`);
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
                  logger.warn('[GenerateScheduledEmails] Failed to get account data:', error);
                }
              }
            }
          } catch (error) {
            logger.warn('[GenerateScheduledEmails] Failed to get contact data:', error);
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
            logger.warn('[GenerateScheduledEmails] Failed to get previous emails:', error);
          }
        }
        
        // Detect industry and select angle (same logic as sequence-builder.js)
        let recipientIndustry = accountData.industry || contactData.industry || '';
        
        // Infer industry from company name if not set
        if (!recipientIndustry && emailData.contactCompany) {
          recipientIndustry = IndustryDetection.inferIndustryFromCompanyName(emailData.contactCompany);
        }
        
        // Infer from account description if still not set
        if (!recipientIndustry && accountData) {
          const accountDesc = accountData.shortDescription || accountData.short_desc || 
                             accountData.descriptionShort || accountData.description || 
                             accountData.companyDescription || accountData.accountDescription || '';
          if (accountDesc) {
            recipientIndustry = IndustryDetection.inferIndustryFromDescription(accountDesc);
          }
        }
        
        // Default to 'Default' if no industry detected
        if (!recipientIndustry) {
          recipientIndustry = 'Default';
        }
        
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
        const toneOpener = selectRandomToneOpener(selectedAngle?.id);
        
        logger.debug(`[GenerateScheduledEmails] Selected angle: ${selectedAngle?.id}, tone: ${toneOpener}, industry: ${recipientIndustry}`);
        logger.debug(`[GenerateScheduledEmails] Angle details:`, {
            id: selectedAngle?.id,
            openingTemplate: selectedAngle?.openingTemplate,
            primaryValue: selectedAngle?.primaryValue,
            primaryMessage: selectedAngle?.primaryMessage
          });
        
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
          textContent = buildTextVersionFromHtml(htmlContent);
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
          let bodyText = raw;
          
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
            if (jsonData.paragraph1) parts.push(jsonData.paragraph1);
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
          }
          else {
            const looksLikeJson = /"subject"\s*:\s*/i.test(raw) || /"greeting"\s*:\s*/i.test(raw);
            if (looksLikeJson) {
              await markGenerationInvalid('Malformed JSON output (raw fields present)');
              return;
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
                `${firstNameForSubject}, program funding?`
              ],
              budget_stability: [
                `${firstNameForSubject}, locking in energy costs?`,
                `${companyForSubject} budget stability question`,
                `${firstNameForSubject}, cost predictability?`,
                `${firstNameForSubject}, budget volatility?`
              ],
              operational_simplicity: [
                `${firstNameForSubject}, managing multiple suppliers?`,
                `${companyForSubject} vendor consolidation question`,
                `${firstNameForSubject}, unified billing?`,
                `${firstNameForSubject}, supplier management?`
              ],
              cost_control: [
                `${firstNameForSubject}, energy cost predictability?`,
                `${companyForSubject} budget planning question`,
                `${firstNameForSubject}, rate volatility?`,
                `${firstNameForSubject}, cost control?`
              ],
              operational_efficiency: [
                `${firstNameForSubject}, energy costs impacting efficiency?`,
                `${companyForSubject} operational efficiency question`,
                `${firstNameForSubject}, cost reduction opportunity?`
              ],
              data_governance: [
                `${firstNameForSubject}, visibility into energy usage?`,
                `${companyForSubject} energy reporting question`,
                `${firstNameForSubject}, centralized metering?`
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

          textContent = bodyText;
          
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

        // CRITICAL: Validate generated content before saving
        // Detect malformed AI generations that should not be sent
        const validation = validateGeneratedContent(
          generatedContent.html, 
          generatedContent.text, 
          generatedContent.subject
        );
        
        if (!validation.isValid) {
          await markGenerationInvalid(validation.reason);
          return;
        }
        
        // Enhanced debug logging
          const ctaType = perplexityResult.output?.cta_type || perplexityResult.metadata?.cta_type || 'unknown';
        logger.debug(`[GenerateScheduledEmails] Generated email details:`, {
            subject: generatedContent.subject,
            angleUsed: generatedContent.angle_used,
            toneOpener: toneOpener,
            ctaType: ctaType,
            aiMode: aiMode
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
        logger.debug('[GenerateScheduledEmails] ✓ Generated email:', emailDoc.id);
        
      } catch (error) {
        logger.error('[GenerateScheduledEmails] Failed to generate email:', emailDoc.id, error);
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
          logger.error('[GenerateScheduledEmails] Failed to update error status:', updateError);
        }
      }
    })); // End Promise.all
      
      // Add delay between batches to respect rate limit (except after last batch)
      if (batchEnd < docs.length) {
        logger.debug(`[GenerateScheduledEmails] Waiting ${DELAY_BETWEEN_BATCHES/1000}s before next batch to respect rate limit...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    } // End batch loop
    
    logger.debug('[GenerateScheduledEmails] Generation complete. Generated:', generatedCount, 'Errors:', errors.length);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: generatedCount,
      errors: errors.length,
      errorDetails: errors
    }));
    
  } catch (error) {
    logger.error('[GenerateScheduledEmails] Fatal error:', error);
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
