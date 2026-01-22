# Email Generation Issues & Improvements

## Overview

This document catalogs all identified issues with AI-generated sequence emails and provides actionable improvements. The emails are generated correctly and send properly, but there are quality and display issues that need to be addressed.

---

## Critical Issues

### 1. Closing Signature Formatting

**Problem**: All emails show `Best regards,Lewis` (no space after comma, no line break) in the scheduled tab preview.

**Expected Format**:
```
Best regards,
Lewis
```

**Root Cause**: 
- The prompt includes `\n` in the closing field: `"Best regards,\\n${senderFirstName}"`
- The code joins parts with `\n\n` but the closing's internal `\n` may not be rendering properly in HTML
- The `email-detail.js` display logic may not be converting `\n` to `<br>` for scheduled emails

**Files Affected**:
- `api/generate-scheduled-emails.js` (lines 359-363, 1422-1428)
- `api/perplexity-email.js` (line 2814)
- `scripts/pages/email-detail.js` (display logic for scheduled emails)

**Fix Required**:
1. Ensure closing field in JSON response has proper `\n` character
2. When building HTML/text, explicitly convert `\n` in closing to `<br>` or proper paragraph break
3. Update `email-detail.js` to properly render line breaks in scheduled email previews

---

### 2. Company Description Dumping

**Problem**: AI is copying account descriptions verbatim instead of using them as context.

**Examples**:
- "Eno's Pizza Tavern being a family-owned restaurant chain specializing in thin-crust pizzas made with fresh, farm-to-table ingredients, alongside pastas, sandwiches, salads, and a pioneering selection of craft beers"
- "E-Z Line Pipe Support Co., LLC manufacturing specialized pipe support systems like your original E-Z Line® Adjustable Pipe Supports, pipe clamps, shim blocks, and base plate assemblies primarily serving the oil and gas sector"

**Why This Is Bad**:
- Sounds robotic and templated
- Reads like a copy-paste from company website
- Doesn't show genuine understanding or research
- Makes emails feel mass-produced

**Root Cause**:
- The prompt says "Use account description" but doesn't explicitly say "DON'T copy verbatim"
- The AI is interpreting "use" as "include the full text"
- No validation to detect description dumping

**Files Affected**:
- `api/perplexity-email.js` (system prompt around lines 2875, 2457)
- `api/generate-scheduled-emails.js` (content sanitization - missing description dump detection)

**Fix Required**:
1. **Update System Prompt**: Add explicit instruction:
   ```
   ✗ DO NOT copy the account description verbatim - use it as context to ask intelligent questions
   ✓ GOOD: "With [company] operating in [industry], how are you handling energy costs..."
   ✗ BAD: "With [company] being a [full description copy-paste], how are you..."
   ```
2. **Add Validation**: Detect when account description appears verbatim in email body
3. **Add Sanitization**: If detected, flag for regeneration or auto-rewrite

---

### 3. Repetitive Transition Phrasing

**Problem**: "The reason I ask is" appears in almost every email, making them feel templated.

**Examples**:
- "The reason I ask is restaurant chains like yours often see energy bills double..."
- "The reason I ask is usually when manufacturing companies like yours keep steady operations..."
- "The reason I ask is tradeshow firms like yours often see energy spend double..."

**Why This Is Bad**:
- Makes emails feel mass-produced
- Reduces personalization perception
- Shows lack of variation in AI output

**Root Cause**:
- The prompt may be suggesting this phrase as a transition
- No instruction to vary transition phrases
- No validation to detect repetitive phrasing

**Files Affected**:
- `api/perplexity-email.js` (system prompt - transition examples)
- `api/generate-scheduled-emails.js` (content sanitization - missing repetitive phrase detection)

**Fix Required**:
1. **Update System Prompt**: Add instruction to vary transition phrases:
   ```
   - Vary transition phrases: "The reason I ask is", "Here's what I've found", "What I'm seeing", "In my experience", "Typically", "Usually", etc.
   - DO NOT use the same transition phrase in every email
   ```
2. **Add Variation Examples**: Provide 5-7 alternative transition phrases in prompt
3. **Add Validation**: Detect if same transition phrase appears in multiple emails for same sequence

---

## Display Issues (Scheduled Tab)

### 4. Line Breaks Not Rendering in Scheduled Email Preview

**Problem**: Line breaks are correct when emails are sent (verified in sent tab), but don't display properly in scheduled tab preview.

**Root Cause**: 
- `email-detail.js` has complex logic for rendering different email types
- Scheduled emails may be using different rendering path than sent emails
- The `\n` characters in closing may not be converted to `<br>` for scheduled emails

**Files Affected**:
- `scripts/pages/email-detail.js` (lines 277-700 - email content rendering logic)

**Fix Required**:
1. Ensure scheduled emails use same line break conversion as sent emails
2. Add explicit `\n` to `<br>` conversion for closing signatures
3. Test that scheduled email preview matches sent email display

---

## Quality Improvements

### 5. More Natural Company Description Usage

**Current**: Full description copy-pasted
**Improved**: Use description to ask intelligent questions

**Examples**:
- ❌ "With Eno's Pizza Tavern being a family-owned restaurant chain specializing in thin-crust pizzas made with fresh, farm-to-table ingredients, alongside pastas, sandwiches, salads, and a pioneering selection of craft beers, how are you handling energy costs..."
- ✅ "With Eno's Pizza Tavern running multiple ovens and refrigeration units, how are you handling energy costs for those energy-intensive operations?"

**Implementation**:
- Update prompt to emphasize question-based usage
- Add examples of good vs bad description usage
- Add validation to detect verbatim copying

---

### 6. Vary Opening Hooks

**Current**: Most emails start with "Question for you—" followed by company description dump
**Improved**: Vary the opening while maintaining tone opener

**Examples**:
- "Question for you—with [company] running [specific operation], how are you..."
- "So here's the thing—[company] operates [specific equipment]. How are you handling..."
- "Real talk—I'm seeing [industry] companies with [specific setup] facing [challenge]. How is [company] handling this?"

**Implementation**:
- The tone opener system already supports variations (pattern-based detection)
- Ensure prompt encourages natural variations
- Add more tone opener examples to prompt

---

### 7. More Specific Industry Pain Points

**Current**: Generic pain points like "confusing riders" and "wrong contract structure"
**Improved**: Industry-specific pain points based on actual operations

**Examples**:
- Manufacturing: "production line uptime", "equipment reliability", "demand charges from peak loads"
- Hospitality: "HVAC for guest comfort", "kitchen equipment loads", "seasonal demand spikes"
- Healthcare: "24/7 operations", "life safety systems", "regulatory compliance"

**Implementation**:
- Enhance industry segmentation data with specific pain points
- Update prompt to use industry-specific pain points
- Add industry context to angle selection

---

### 8. Better Contract Timing References

**Current**: Generic "when does your contract renew?"
**Improved**: More specific timing questions based on urgency

**Examples**:
- If contract ends in 3 months: "With your contract ending in [Month], are you already seeing renewal quotes?"
- If contract ends in 6+ months: "When does your current contract expire? Most companies I work with lock in rates 6 months early to avoid the 10-20% premium that comes with last-minute renewals."
- If no contract data: "When does your current electricity contract renew?"

**Implementation**:
- Use `contractEndLabel` more intelligently in prompt
- Add urgency-based messaging variations
- Update CTA to match contract timing context

---

### 9. Reduce Generic Statistics

**Current**: "10-20% savings" appears in almost every email
**Improved**: Vary the value proposition based on angle and industry

**Examples**:
- Timing angle: "10-20% better rates when locking in 6 months early"
- Consolidation angle: "15-25% savings through contract consolidation"
- Exemption recovery: "$75K-$500K in unclaimed exemptions"

**Implementation**:
- Use angle-specific value propositions from `angleCtaMap`
- Ensure prompt uses angle's `primaryValue` field
- Add industry-specific savings ranges

---

### 10. More Conversational Flow

**Current**: Some emails feel choppy or overly structured
**Improved**: Natural conversation flow with smooth transitions

**Examples**:
- ❌ "Question for you—[description]. The reason I ask is [statistic]. We help [value]. When does your contract renew?"
- ✅ "Question for you—[specific question about their situation]. Here's what I'm seeing: [industry insight]. Most companies like yours save 10-20% by [specific action]. When does your current contract renew?"

**Implementation**:
- Update prompt to emphasize conversational flow
- Add examples of good conversational structure
- Ensure paragraphs flow naturally into each other

---

## Technical Improvements

### 11. Content Sanitization Enhancements

**Current**: Basic sanitization (removes "I noticed", normalizes percentages)
**Needed**: Additional sanitization for quality issues

**Add Detection For**:
- Verbatim account description copying (detect if 50+ character substring from description appears in email)
- Repetitive transition phrases (track phrases used across emails)
- Generic statistics (ensure angle-specific values are used)
- Missing line breaks in closing (detect "Best regards,Name" pattern)

**Files to Update**:
- `api/generate-scheduled-emails.js` (content sanitization section)

---

### 12. Prompt Engineering Improvements

**Current**: Prompt has good structure but could be more explicit about quality requirements

**Add to Prompt**:
1. **Explicit Description Usage Rule**:
   ```
   ✗ DO NOT copy account description verbatim
   ✓ Use description to understand their business, then ask intelligent questions
   ✓ Example: If description says "manufacturing company", ask "How are you handling energy costs for those production facilities?" NOT "With [company] being a manufacturing company that..."
   ```

2. **Transition Phrase Variation**:
   ```
   - Vary your transition phrases: "The reason I ask is", "Here's what I've found", "What I'm seeing", "In my experience", "Typically", "Usually", "Most companies I talk to", etc.
   - DO NOT use the same phrase in every email
   ```

3. **Closing Format Enforcement**:
   ```
   - Closing MUST be: "Best regards,\n[FirstName]" (with newline between comma and name)
   - This creates proper line break in email display
   ```

**Files to Update**:
- `api/perplexity-email.js` (system prompt sections)

---

### 13. Validation Enhancements

**Current**: NEPQ validation catches forbidden phrases, tone openers, questions
**Needed**: Additional validation for quality issues

**Add Validation For**:
1. **Description Dumping**: 
   - Extract account description (first 100 chars)
   - Check if 50+ char substring appears verbatim in email body
   - If found, flag as "description_dumped" and regenerate

2. **Repetitive Phrasing**:
   - Track transition phrases used in previous emails (same sequence)
   - If same phrase used 3+ times, flag for variation

3. **Closing Format**:
   - Check if closing has proper line break: `Best regards,\n` or `Best regards,<br>`
   - If missing, auto-fix by inserting line break

**Files to Update**:
- `api/generate-scheduled-emails.js` (validation section)

---

## Display Fixes (Scheduled Tab)

### 14. Fix Line Break Rendering in Scheduled Email Preview

**Problem**: Scheduled emails don't show line breaks properly in preview, but sent emails do.

**Root Cause Analysis**:
- Sent emails go through Gmail API which converts `\n` to proper HTML
- Scheduled emails are displayed directly from Firestore, may not have HTML conversion
- `email-detail.js` has different rendering paths for scheduled vs sent emails

**Fix Required**:
1. **Ensure Consistent Rendering**: Scheduled emails should use same HTML conversion as sent emails
2. **Explicit Line Break Conversion**: Convert `\n` in closing to `<br>` for scheduled emails
3. **Test Both Paths**: Verify scheduled preview matches sent email display

**Files to Update**:
- `scripts/pages/email-detail.js` (scheduled email rendering logic, lines 277-700)

**Specific Fix**:
- In `populateEmailDetails()`, ensure scheduled emails convert `\n` to `<br>` in closing
- Add explicit check for "Best regards," pattern and ensure line break after comma
- Use same HTML conversion logic for both scheduled and sent emails

---

## Priority Ranking

### High Priority (Fix Immediately)
1. ✅ Closing signature formatting (Issue #1)
2. ✅ Line break rendering in scheduled tab (Issue #4, #14)
3. ✅ Company description dumping (Issue #2)

### Medium Priority (Fix Soon)
4. Repetitive transition phrasing (Issue #3)
5. More natural description usage (Issue #5)
6. Content sanitization enhancements (Issue #11)

### Low Priority (Nice to Have)
7. Vary opening hooks (Issue #6)
8. Industry-specific pain points (Issue #7)
9. Better contract timing (Issue #8)
10. Reduce generic statistics (Issue #9)
11. More conversational flow (Issue #10)
12. Prompt engineering improvements (Issue #12)
13. Validation enhancements (Issue #13)

---

## Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Fix closing signature formatting (`\n` to `<br>` conversion)
- [ ] Fix line break rendering in scheduled email preview
- [ ] Add description dumping detection and prevention
- [ ] Update prompt to prevent verbatim description copying

### Phase 2: Quality Improvements
- [ ] Add transition phrase variation instruction to prompt
- [ ] Add validation for repetitive phrasing
- [ ] Enhance content sanitization with new detection rules
- [ ] Update prompt with explicit quality requirements

### Phase 3: Advanced Enhancements
- [ ] Add industry-specific pain point examples
- [ ] Improve contract timing messaging
- [ ] Enhance angle-specific value propositions
- [ ] Add conversational flow examples to prompt

---

## Testing Plan

### Test 1: Closing Format
1. Generate a scheduled email
2. Check scheduled tab preview - should show:
   ```
   Best regards,
   Lewis
   ```
3. Approve and send email
4. Check sent email - should match preview exactly

### Test 2: Description Usage
1. Generate email for contact with account description
2. Verify description is NOT copied verbatim
3. Verify email asks intelligent questions based on description
4. Check multiple emails - should all use description differently

### Test 3: Transition Phrase Variation
1. Generate 5 emails in same sequence
2. Check transition phrases - should vary (not all "The reason I ask is")
3. Verify emails still maintain quality and flow

### Test 4: Line Break Consistency
1. Generate scheduled email
2. Check preview in scheduled tab - line breaks should be correct
3. Approve and send
4. Check sent email - should match preview exactly
5. Both should show proper paragraph spacing and closing line breaks

---

## Notes

- **Email Sending Works Correctly**: The actual email sending via Gmail API works fine with proper line breaks. The issue is only in the scheduled tab preview display.
- **Display vs Generation**: Some issues are in generation (description dumping), others are in display (line breaks in preview).
- **User Feedback**: User confirmed emails send properly, so focus on preview display fixes and generation quality improvements.

