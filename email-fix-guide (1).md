# Cold Email System Fix Guide

## Overview
Your email generation system has sophisticated features built in (angle rotation, subject line variation, research integration, tone variation) but they're not being activated. This guide helps you fix the code to enable these features in your IDE.

---

## 1. Fix Angle Selection Bug

### The Problem
Every email uses `timing_strategy` angle instead of rotating through 8+ available angles.

### Where to Check
**File**: `perplexity-email.js` or `generate-scheduled-emails.js`

**Look for these functions**:
```javascript
selectRandomizedAngle()
getRandomAngle()
chooseAngleByIndustry()
```

### The Fix

**Check 1**: Verify angle selection is being called
```javascript
// LOOK FOR THIS - should exist in email generation function
const selectedAngle = selectRandomizedAngle(industryType, angleWeights);

// If you only see hardcoded:
const selectedAngle = 'timing_strategy'; // ❌ DELETE THIS
```

**Check 2**: Ensure angle weights are applied
```javascript
// Should have weights like this in ANGLES_DOCUMENTATION.md or your angles object:
Manufacturing: {
  exemption_recovery: 35,      // 35% chance
  timing_strategy: 30,         // 30% chance
  demand_efficiency: 20,       // 20% chance
  operational_continuity: 15   // 15% chance
}

// Verify selectRandomizedAngle() uses these weights:
function selectRandomizedAngle(industry, weights) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (const [angle, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) return angle; // ✓ CORRECT
  }
}
```

**Check 3**: Verify angle is passed to email template
```javascript
// In your email generation flow, should look like:
const emailBody = generateEmailBody({
  contact: contactData,
  selectedAngle: selectedAngle,  // ✓ Angle must be passed
  research: researchData,
  tone: randomTone
});
```

### How to Test
Add console logging temporarily:
```javascript
console.log('Selected Angle:', selectedAngle);
console.log('Contact Email:', emailBody);
// Generate 5-10 emails and verify angles vary
```

---

## 2. Fix Subject Line Variation

### The Problem
All emails have subject: `[Name], contract timing question`

### Where to Check
**File**: `perplexity-email.js`

**Look for**:
```javascript
SUBJECT_LINE_VARIANTS = {
  'cold-email': {
    ceo: [...],
    finance: [...],
    operations: [...]
  }
}
```

### The Fix

**Check 1**: Verify SUBJECT_LINE_VARIANTS is populated
```javascript
// Should look like this:
const SUBJECT_LINE_VARIANTS = {
  'cold-email': {
    ceo: [
      '[contact_name], energy renewal strategy',
      '[contact_name], rate lock opportunity',
      '[contact_name], energy budget question'
    ],
    finance: [
      '[contact_name], budget question about energy renewal',
      '[contact_name], cost predictability question'
    ],
    operations: [
      '[contact_name], facility renewal timing?',
      '[contact_name], contract status check'
    ]
  }
};

// If you only see:
subject: '[contact_name], contract timing question' // ❌ Hardcoded
```

**Check 2**: Verify role detection is working
```javascript
// Should have function like this:
function detectRoleFromTitle(title, email) {
  if (title.toLowerCase().includes('ceo') || 
      title.toLowerCase().includes('president')) {
    return 'ceo';
  } else if (title.toLowerCase().includes('finance') || 
             title.toLowerCase().includes('controller')) {
    return 'finance';
  } else if (title.toLowerCase().includes('operations') || 
             title.toLowerCase().includes('director of operations')) {
    return 'operations';
  }
  return 'default'; // Fallback role
}
```

**Check 3**: Subject line selection function
```javascript
// Should look like this:
function getRandomSubjectLine(role, contactName) {
  const variants = SUBJECT_LINE_VARIANTS['cold-email'][role] || 
                   SUBJECT_LINE_VARIANTS['cold-email']['default'];
  const randomSubject = variants[Math.floor(Math.random() * variants.length)];
  return randomSubject.replace('[contact_name]', contactName);
}
```

### How to Test
```javascript
// Generate subject line for different roles
console.log(getRandomSubjectLine('ceo', 'Terry')); // Should vary
console.log(getRandomSubjectLine('finance', 'Colleen')); // Should vary
console.log(getRandomSubjectLine('operations', 'Lewis')); // Should vary
```

---

## 3. Fix Research Integration

### The Problem
Company descriptions are generic—no specific news, expansions, or recent activities referenced.

### Where to Check
**File**: `generate-scheduled-emails.js` or `perplexity-email.js`

**Look for**:
```javascript
researchCompanyInfo()
researchRecentCompanyActivity()
researchLocationContext()
researchLinkedInCompany()
```

### The Fix

**Check 1**: Research function is called before email generation
```javascript
// Should have something like:
async function generateEmailWithResearch(contact) {
  // 1. Get research data
  const researchData = await researchCompanyInfo(contact.company);
  
  // 2. Pass to email generation
  const emailBody = generateEmailBody({
    contact: contact,
    research: researchData,
    selectedAngle: angle
  });
  
  return emailBody;
}
```

**Check 2**: API keys are configured
```javascript
// Check your environment variables or config:
process.env.PERPLEXITY_API_KEY  // Must be set
// If missing, research calls will fail silently or return null
```

**Check 3**: Research data is used in template
```javascript
// BAD - ignores research:
const emailBody = `Hi ${contact.firstName},
  I noticed ${contact.company} is a company. ...`

// GOOD - uses research:
const emailBody = `Hi ${contact.firstName},
  I noticed ${contact.company} recently ${researchData.recentActivity}. ...`
```

### How to Test
```javascript
// Check if research data is available
const research = await researchCompanyInfo('Geophysical Supply Company');
console.log('Research Result:', research);
// Should return: {recentActivity, locationContext, linkedInUpdates, etc}

// If empty or null, check:
// 1. API key is configured
// 2. Network request is successful
// 3. Cache isn't returning empty values
```

---

## 4. Fix CTA (Call-to-Action)

### The Problem
Every email ends with passive: `If you ever want a second opinion on your setup, I can spend 10 minutes looking at your situation.`

### Where to Check
**File**: `perplexity-email.js` or email template sections

**Look for**:
```javascript
generateCTA()
getClosingQuestion()
buildCallToAction()
```

### The Fix

**Check 1**: CTA should match the selected angle
```javascript
// BAD - same CTA for all angles:
const cta = 'If you ever want a second opinion on your setup, I can spend 10 minutes looking at your situation.';

// GOOD - CTA varies by angle:
const angleCtaMap = {
  'timing_strategy': 'When does your current contract expire?',
  'exemption_recovery': 'Are you currently claiming electricity exemptions on your production facilities?',
  'consolidation': 'How many locations are you managing energy for?',
  'demand_efficiency': 'Are you optimizing consumption before you renew your contract?',
  'operational_continuity': 'How do you currently handle energy during peak demand periods?'
};

const cta = angleCtaMap[selectedAngle];
```

**Check 2**: Add follow-up question
```javascript
// Complete CTA structure:
const cta = `${angleCtaMap[selectedAngle]}

Worth a 10-minute look?`;
```

**Check 3**: For angle-specific, use pre-built questions from ANGLES_DOCUMENTATION.md
```javascript
// Your angles already have "Opening" fields:
exemption_recovery: {
  Opening: "Are you currently claiming electricity exemptions on your production facilities?",
  Value: "$75K-$500K in unclaimed exemptions over 4 years"
}

// Use these! Don't invent new CTAs.
```

### How to Test
```javascript
// Generate emails with different angles
console.log(getCtaForAngle('exemption_recovery'));
console.log(getCtaForAngle('consolidation'));
console.log(getCtaForAngle('timing_strategy'));
// Each should be different
```

---

## 5. Fix Tone Variation

### The Problem
All emails have identical tone - they sound like templates.

### Where to Check
**File**: `perplexity-email.js`

**Look for**:
```javascript
TONE_OPENERS
generateTone()
selectRandomTone()
```

### The Fix

**Check 1**: Tone openers exist and rotate
```javascript
// Should have:
const TONE_OPENERS = [
  'Been wondering—',
  'Question for you—',
  'Here\'s what I\'m seeing—',
  'Let me ask you something—',
  'From what I\'m hearing—'
];

// In email generation:
const toneOpener = TONE_OPENERS[Math.floor(Math.random() * TONE_OPENERS.length)];
```

**Check 2**: Verify generation modes are applied
```javascript
// Should have 3 modes:
const generationModes = ['consultative', 'direct', 'balanced'];

// In email generation:
const mode = generationModes[Math.floor(Math.random() * generationModes.length)];
const emailBody = generateEmailByMode(mode, contact, angle);
```

**Check 3**: Different modes produce different tones
```javascript
// CONSULTATIVE mode (asking more questions):
"Here's what I'm seeing: companies locking rates 6 months out are avoiding premiums. 
When does your current contract expire?"

// DIRECT mode (stating benefits):
"You could save 10-20% by locking rates 6 months out instead of 90 days.
Let's see if that applies to your situation."

// BALANCED mode (mix of both):
"I'm seeing companies save 10-20% with early rate locks. 
When does your renewal happen?"
```

### How to Test
```javascript
// Generate 5 emails for same contact, verify tone varies
for (let i = 0; i < 5; i++) {
  const email = generateEmail(contact);
  console.log(`Email ${i}:`, email.body.substring(0, 50));
}
// Should see different openers and tone
```

---

## 6. Code Structure Checklist

### In `perplexity-email.js`:
- [ ] SUBJECT_LINE_VARIANTS object is populated (not hardcoded)
- [ ] `getRandomSubjectLine()` function exists and rotates variants
- [ ] `roleForSubject` or role detection is working
- [ ] `selectRandomizedAngle()` function applies weights
- [ ] Angle is passed to email template
- [ ] Research data is requested before email generation
- [ ] PERPLEXITY_API_KEY is configured in environment
- [ ] CTA varies by angle using angleCtaMap
- [ ] TONE_OPENERS array exists and rotates
- [ ] Generation mode selection is active

### In `generate-scheduled-emails.js`:
- [ ] `researchCompanyInfo()` is called before email generation
- [ ] Research results are passed to email template
- [ ] Angle selection happens for each email (not just once)
- [ ] Subject line is regenerated for each email

### In `sequence-builder.js`:
- [ ] Each email in sequence has different angle/subject/tone
- [ ] No hardcoded email templates bypass angle selection
- [ ] Scheduling logic doesn't interfere with variation

---

## 7. Quick Debugging Script

Add this to your code to verify systems are working:

```javascript
async function debugEmailGeneration(contact) {
  console.log('\n=== EMAIL GENERATION DEBUG ===\n');
  
  // 1. Test role detection
  const role = detectRoleFromTitle(contact.jobTitle);
  console.log('✓ Detected Role:', role);
  
  // 2. Test subject line variation
  const subject = getRandomSubjectLine(role, contact.firstName);
  console.log('✓ Generated Subject:', subject);
  
  // 3. Test angle selection
  const angle = selectRandomizedAngle(contact.industry);
  console.log('✓ Selected Angle:', angle);
  
  // 4. Test research (if API available)
  if (process.env.PERPLEXITY_API_KEY) {
    const research = await researchCompanyInfo(contact.company);
    console.log('✓ Research Data:', research ? 'Retrieved' : 'No data');
  }
  
  // 5. Test CTA
  const cta = angleCtaMap[angle];
  console.log('✓ Generated CTA:', cta);
  
  // 6. Test tone
  const tone = TONE_OPENERS[Math.floor(Math.random() * TONE_OPENERS.length)];
  console.log('✓ Selected Tone:', tone);
  
  console.log('\n=== END DEBUG ===\n');
}

// Run it:
debugEmailGeneration(testContact);
```

---

## 8. Step-by-Step Fix Order

**Priority 1 (Critical)**:
1. Fix angle selection - verify `selectRandomizedAngle()` is called
2. Fix CTA - use angle-based questions from angleCtaMap
3. Fix subject line - enable SUBJECT_LINE_VARIANTS rotation

**Priority 2 (High)**:
4. Fix research integration - ensure API key + research data passed to template
5. Fix tone variation - activate TONE_OPENERS rotation

**Priority 3 (Nice to have)**:
6. Add debugging script to verify systems work
7. Test A/B variations and track reply rates

---

## 9. Expected Results After Fixes

### Before
- All emails identical structure/content
- Subject: "[Name], contract timing question" (every email)
- Angle: always `timing_strategy`
- CTA: same passive statement
- Reply rate: ~2-3% (generic template level)

### After
- Each email has 3-5 variations of each component
- Subjects vary: "facility renewal timing?", "rate lock opportunity", "energy budget question"
- Angles rotate: exemption_recovery, consolidation, demand_efficiency, operational_continuity
- CTAs are questions: "When does your contract expire?", "Are you claiming exemptions?"
- Reply rate: 5-15% (personalized, researched emails)

---

## 10. Testing Spreadsheet

Track what you're testing:

| Date | Issue Fixed | Test Method | Result | Status |
|------|------------|-------------|--------|--------|
| 11/25 | Angle rotation | Generate 10 emails, check angles | Varied ✓ / All same ✗ | Testing |
| 11/25 | Subject lines | Generate 10 emails, check subjects | Varied ✓ / All same ✗ | Testing |
| 11/25 | Role detection | Log role for each title | Correct ✓ / Wrong ✗ | Testing |
| 11/25 | Research integration | Check API key + log research data | Found ✓ / Null ✗ | Testing |
| 11/25 | CTA variation | Check 5 emails for different CTAs | Varied ✓ / All same ✗ | Testing |

---

## 11. Common Fixes Summary

**If emails are still identical after fixes**:
- [ ] Check for hardcoded email templates overriding logic
- [ ] Verify API keys are set (PERPLEXITY_API_KEY for research)
- [ ] Look for caching that returns same result
- [ ] Confirm `Math.random()` isn't seeded (deterministic)
- [ ] Check if email being sent uses old cached version

**If research data isn't showing**:
- [ ] Verify PERPLEXITY_API_KEY is in environment
- [ ] Check network requests in browser console
- [ ] Ensure research is called BEFORE template generation
- [ ] Look for try-catch blocks silently failing

**If angles aren't rotating**:
- [ ] Verify selectRandomizedAngle() is defined and called
- [ ] Check angle weights sum to 100 (or proportional)
- [ ] Look for hardcoded angle='timing_strategy'
- [ ] Confirm angle is passed to template rendering

---

## Files to Review in Your IDE

1. **perplexity-email.js** - Main email generation logic
2. **generate-scheduled-emails.js** - Batch email creation
3. **sequence-builder.js** - Multi-email sequences
4. **ANGLES-DOCUMENTATION.md** - Angle definitions and CTAs
5. **industry-detection.js** - Role/industry detection

---

## Next Steps

1. Open each file in your IDE
2. Search for the functions listed in Section 6
3. Compare against the "GOOD" examples in this guide
4. Apply fixes section by section
5. Use the debugging script (Section 8) to verify
6. Track results in the testing spreadsheet (Section 10)

Good luck! Your system has all the capabilities—you just need to activate them. 🚀
