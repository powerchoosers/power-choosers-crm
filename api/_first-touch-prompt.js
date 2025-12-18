// _first-touch-prompt.js
// Dedicated prompt templates for first-touch cold emails vs. follow-ups
// Allows easy swapping of strategies per stage

import { 
  getIndustryOpener, 
  getRoleCta, 
  getIndustryProof 
} from './_angle-definitions.js';

export function buildFirstTouchPrompt({
  firstName,
  company,
  industry,
  role,
  selectedAngle,
  recentActivity,
  accountDescription
}) {
  
  if (!selectedAngle || !selectedAngle.id) {
    return buildGenericFirstTouchPrompt({ firstName, company, industry, role });
  }
  
  const opener = getIndustryOpener(selectedAngle.id, industry);
  const cta = getRoleCta(selectedAngle.id, role);
  const proof = getIndustryProof(selectedAngle.id, industry);
  
  return `
You are an expert energy procurement consultant in deregulated Texas energy markets.

RECIPIENT: ${firstName} (${role}) at ${company} (${industry})

ANGLE: ${selectedAngle.primaryMessage}

===== OPENING HOOK (CRITICAL) =====
Your hook: "${opener?.hook || 'Question about your energy strategy'}"

Guidelines:
- This is NOT a template - feel free to rephrase naturally
- But preserve the core message and pain point
- Example: Change "Most manufacturers we audit" to "From what I'm seeing with manufacturers"
- The key is: OBSERVABLE PAIN that they can't dismiss

===== CREDIBILITY LAYER =====
Use this proof point naturally: "${proof}"
- Include in paragraph 2 or 3
- Make it specific to them (not generic "clients")
- Example: "Most ${industry.toLowerCase()} we work with find..."

===== CALL-TO-ACTION =====
Use this high-friction CTA: "${cta?.cta || 'Worth a quick audit?'}"

Why high-friction:
- ${cta?.why || 'Forces admission of problem'}
- Must NOT be answerable with "we're fine"
- Example of weak CTA: "Want to discuss energy?" (too easy to decline)
- Example of strong CTA: "Are you on 4CP or peak-based rates?" (requires admission)

===== EMAIL STRUCTURE =====
1. Greeting: "Hello ${firstName},"
2. Opening Hook (1 sentence with observable pain)
3. Credibility Paragraph (include proof point + context)
4. CTA Paragraph (use high-friction CTA above)
5. Closing: "Best regards,\\nLewis"

===== FORBIDDEN =====
- "Hope this email finds you well"
- "Just following up" (this is FIRST touch, not follow-up)
- "My name is" (assumed)
- "Wondering how..." (overused, weak)
- "I help companies like yours" (generic)

===== TONE =====
Consultative, confident, peer-to-peer
Lead with insight, not self-promotion
Direct about problems, not euphemistic

Generate email as JSON with keys:
subject, greeting, opening_hook, paragraph2, paragraph3, closing
`;
}

export function buildGenericFirstTouchPrompt({
  firstName,
  company,
  industry,
  role
}) {
  
  return `
You are an energy procurement consultant. Generate a first-touch cold email.

Recipient: ${firstName} (${role}) at ${company}

Rules:
1. Lead with OBSERVABLE PAIN (not generic greeting)
2. Include numbers/proof
3. Use high-friction CTA (not "want to talk?")
4. 3-4 short paragraphs max
5. NO "hope this finds you well", NO "just following up", NO "my name is"

Generate as JSON: subject, greeting, opening_hook, paragraph2, paragraph3, closing
`;
}

export function buildFollowUpPrompt({
  firstName,
  company,
  industry,
  role,
  dayNumber,
  previousOpener
}) {
  
  return `
You are an energy consultant. This is a FOLLOW-UP email (day ${dayNumber}).

Original angle was: "${previousOpener}"

For follow-ups:
1. Add social proof (other companies)
2. Introduce new angle or data point
3. Use slightly softer CTA ("worth a quick call?")
4. Reference previous email implicitly (not "checking in")

Generate as JSON: subject, greeting, hook, body, cta, closing
`;
}
