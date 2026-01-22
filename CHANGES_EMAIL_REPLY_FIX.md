# Email Reply System - JSON Parsing & Signature Fix

## Changes Summary

### Problem Solved
1. **JSON code displaying in emails**: AI responses were showing raw JSON instead of formatted text
2. **Missing signatures**: Replies didn't end with proper "Best regards," + name format
3. **Inappropriate OOO responses**: System was pitching energy services to out-of-office auto-replies

---

## Files Modified

### 1. `scripts/pages/email-detail.js`

#### `formatStandardReply()` Function (Lines 1829-1889)
**Changes:**
- Added JSON parsing logic to detect and parse ````json` blocks
- Extracts first JSON object and ignores trailing text
- Parses paragraph1, paragraph2, paragraph3 fields
- Pulls sender's first name from settings/auth
- Automatically adds signature: "Best regards,\n[FirstName]"
- Handles both JSON objects and plain text responses
- Graceful fallback if JSON parsing fails

**Code Flow:**
```javascript
1. Get sender's first name from settings.general.firstName
2. If output is string:
   - Try to parse as JSON (strip ```json markers)
   - Extract JSON object with regex
   - Format paragraphs with proper signature
   - Fallback to plain text if parsing fails
3. If output is object:
   - Format directly with signature
4. Always end with: <p>Best regards,<br>[FirstName]</p>
```

#### `generateReplyWithAI()` Function (Lines 1669-1715)
**Changes:**
- Added out-of-office (OOO) detection logic
- Checks email content and subject for OOO keywords
- Uses different prompts for OOO vs. standard replies
- OOO prompt emphasizes brief, friendly acknowledgment
- Prevents sales pitches in OOO responses

**OOO Detection Patterns:**
- "out of office" / "out-of-office" / "ooo"
- "away from" / "be back" / "returning"
- "won't be in" / "won't be available"

**OOO Reply Rules:**
- Keep under 40 words
- Thank them for letting you know
- Acknowledge return date if mentioned
- NO sales pitch
- NO energy services mention
- NO contract questions

---

### 2. `api/perplexity-email.js`

#### `buildSystemPrompt()` Function (Lines 2290-2334)
**Changes:**
- Added OOO detection before standard prompt building
- Returns special OOO prompt when detected
- OOO prompt instructs AI to generate brief acknowledgment
- Explicitly forbids sales language in OOO responses
- Ensures proper signature format in all modes

**OOO Prompt Structure:**
```javascript
OUTPUT FORMAT (JSON):
{
  "subject": "Re: [their subject]",
  "greeting": "Hi [firstName],",
  "paragraph1": "[Brief acknowledgment - 1 sentence]",
  "paragraph2": "[Thank them and note return date - 1 sentence]",
  "paragraph3": "[Simple closing - 1 sentence]",
  "closing": "Best regards,\\n[FirstName]"
}
```

**Forbidden in OOO:**
- ❌ Rate increases (e.g., "15-25%")
- ❌ Electricity costs
- ❌ Energy solutions
- ❌ Contract questions
- ❌ ANY sales language

#### Updated Output Format (Lines 2352-2364)
**Changes:**
- Added explicit closing field to JSON structure
- Ensures newline between "Best regards," and name
- Format: `"Best regards,\\n[FirstName]"`
- Applies to all standard replies

---

### 3. `.cursor/rules/email-reply-guide.md` (NEW FILE)

**Purpose:** Comprehensive guide for writing effective email replies

**Contents:**
- Standard reply structure (greeting → context → body → CTA → signature)
- Out-of-office reply rules and examples
- Business reply best practices
- Follow-up reply templates
- Question response guidelines
- Tone guidelines (professional yet personable)
- Common mistakes to avoid
- AI generation tips
- Mandatory signature requirements
- Quick reference checklist
- System integration notes

**Key Sections:**
1. **Standard Structure**: 5-part reply format
2. **OOO Detection**: Auto-detect and respond appropriately
3. **Signature Requirements**: "Best regards," + line break + first name
4. **Examples**: Real-world templates for common scenarios
5. **Integration**: How system automates JSON parsing and signatures

---

## Technical Implementation

### Signature Format
**Source Priority:**
1. `window.SettingsPage?.getSettings()?.general?.firstName`
2. `window.authManager?.getCurrentUser()?.displayName?.split(' ')[0]`
3. Fallback: `'Power Choosers Team'`

**HTML Format:**
```html
<p><br></p>
<p>Best regards,<br>[FirstName]</p>
```

**JSON Format:**
```json
"closing": "Best regards,\\n[FirstName]"
```

### JSON Parsing Logic
```javascript
1. Strip markdown code fences (```json and ```)
2. Extract first JSON object with regex: /\{[\s\S]*\}/
3. Parse with JSON.parse()
4. Extract fields: subject, greeting, paragraph1-3
5. Format as HTML with proper signature
6. Catch errors and fallback to plain text
```

### OOO Detection Logic
```javascript
// Client-side (email-detail.js)
const isOutOfOffice = /out of(?:[ -]the)?[ -]office|ooo|away from|be back|returning/i.test(contentLower) ||
                     /out of(?:[ -]the)?[ -]office|ooo|away from/i.test(subjectLower) ||
                     /won'?t be (?:in|available)|will be unavailable/i.test(contentLower);

// Server-side (perplexity-email.js)
const isOutOfOffice = /out of(?:[ -]the)?[ -]office|ooo|away from|be back|returning/i.test(String(prompt || '')) ||
                     /won'?t be (?:in|available)|will be unavailable/i.test(String(prompt || ''));
```

---

## Testing Scenarios

### Test Case 1: Standard Reply
**Input:** Regular business email
**Expected:**
- Full reply with context
- 3 paragraphs of content
- Clear call-to-action
- Signature: "Best regards,\n[FirstName]"

### Test Case 2: OOO Reply
**Input:** Out-of-office auto-reply from Alexia
**Expected:**
- Brief acknowledgment (under 40 words)
- Thank them for notice
- Mention return date (Nov 13)
- NO sales pitch
- Signature: "Best regards,\n[FirstName]"

### Test Case 3: JSON Response
**Input:** AI returns JSON with ```json markers
**Expected:**
- JSON properly parsed
- Paragraphs formatted as HTML
- No raw JSON visible
- Signature automatically added
- Format: "Best regards,\n[FirstName]"

### Test Case 4: Plain Text Response
**Input:** AI returns plain text (no JSON)
**Expected:**
- Text formatted with line breaks
- Signature appended
- Format: "Best regards,\n[FirstName]"

---

## Benefits

### User Experience
✅ No more raw JSON code in emails
✅ Professional signature on every reply
✅ Appropriate responses to out-of-office messages
✅ Consistent formatting across all replies
✅ Faster reply generation with proper context

### Business Impact
✅ Prevents awkward sales pitches to auto-replies
✅ Maintains professional image
✅ Saves time with automated formatting
✅ Reduces email mistakes
✅ Improves recipient perception

---

## Rollback Instructions

If issues arise, revert these changes:

```bash
git checkout HEAD~1 scripts/pages/email-detail.js
git checkout HEAD~1 api/perplexity-email.js
rm .cursor/rules/email-reply-guide.md
```

---

## Future Enhancements

### Potential Improvements
1. Add HTML email template support for replies
2. Include company signature image from settings
3. Support multiple signature formats (formal, casual)
4. Add A/B testing for reply effectiveness
5. Track reply rates and optimize prompts
6. Support attachments in replies
7. Add template library for common scenarios
8. Signature customization per user

### Known Limitations
- First name must be set in settings or auth
- OOO detection based on keywords (may miss some)
- JSON parsing requires valid JSON structure
- No support for rich formatting in standard mode

---

## Deployment Notes

### Pre-Deployment Checklist
- [x] JSON parsing logic tested
- [x] Signature format verified
- [x] OOO detection tested
- [x] Settings integration confirmed
- [x] Auth fallback working
- [x] No linter errors
- [x] Guide documentation created

### Monitoring
**Watch for:**
- Failed JSON parsing errors (check logs)
- Missing signatures (settings not loaded)
- OOO false positives/negatives
- Signature format issues (missing line break)

**Metrics to Track:**
- Reply success rate
- JSON parsing success rate
- OOO detection accuracy
- User satisfaction with replies

---

*Deployed: November 9, 2025*
*Author: AI Assistant*
*Reviewed by: User*

