# Email Reply Guide

## Purpose
This guide helps you craft professional, effective email replies that maintain proper context and achieve business objectives.

---

## Standard Reply Structure

### 1. **Greeting**
- Always start with `Hi [FirstName],` or `Hello [FirstName],`
- Use recipient's first name from contact data
- Add blank line after greeting

### 2. **Opening Paragraph (Context)**
- Reference the previous email or conversation
- Acknowledge their message/question
- Set the tone for your response
- Keep to 2-3 sentences

### 3. **Body Paragraphs (Value & Information)**
- Address their specific points
- Provide relevant information or solutions
- Use clear, concise language
- 3-4 sentences per paragraph maximum
- Break into multiple paragraphs if needed

### 4. **Call-to-Action (Next Steps)**
- Clear next steps or request
- Specific question or action item
- Make it easy to respond
- 1-2 sentences

### 5. **Signature**
- Always end with: `Best regards,`
- Single line break
- Sender's first name only
- Example:
  ```
  Best regards,
  Lewis
  ```

---

## Out-of-Office Replies

### Detection Patterns
Auto-detect OOO messages by looking for:
- "out of office" / "out-of-office" / "OOO"
- "away from" / "be back" / "returning"
- "won't be in" / "won't be available" / "unavailable"

### OOO Reply Rules
✅ **DO:**
- Keep it brief (under 40 words)
- Thank them for letting you know
- Acknowledge their return date if mentioned
- Express intention to reconnect
- Use warm, friendly tone

❌ **DON'T:**
- Pitch energy services
- Ask about contracts or rates
- Include any sales language
- Mention market statistics
- Ask business questions

### OOO Example
```
Hi Alexia,

Thanks for the heads up! Enjoy your time off—I'll catch up with you when you're back on Thursday, November 13th.

Best regards,
Lewis
```

---

## Standard Business Replies

### Key Principles
1. **Context-Aware**: Reference specific details from their email
2. **Professional**: Maintain business tone while being personable
3. **Actionable**: Clear next steps or questions
4. **Concise**: Respect their time—get to the point
5. **Personalized**: Use their name, company, and specific situation

### Example Structure
```
Hi Sarah,

Thank you for sending over your current invoice—I appreciate you taking the time to share that with me.

I'll review the details and conduct a quick analysis to identify any discrepancies and determine the best plan moving forward for ABC Manufacturing. I'll focus on your rate structure, delivery charges, and contract terms to see where we might find opportunities for savings.

Could you let me know when your current contract expires? This will help me provide more specific recommendations for your renewal timing.

Best regards,
Lewis
```

---

## Follow-Up Replies

### After Initial Contact
- Reference your previous conversation
- Provide value or new information
- Include specific next steps
- Keep momentum going

### After No Response
- Gentle reminder without pressure
- Provide additional value
- Simple question to re-engage
- Respect their time

### Example
```
Hi Michael,

Following up on our conversation about your energy contract timing. I wanted to share that rates are still trending upward in your area, so locking in now could save you 15-20% vs. waiting.

Does your contract renewal date of March 2025 still sound right?

Best regards,
Lewis
```

---

## Question Responses

### Answering Specific Questions
1. Directly answer their question first
2. Provide supporting context
3. Offer additional help if relevant
4. End with confirming question

### Example
```
Hi Tom,

Yes, we can definitely help with both your Dallas and Houston locations. We'll analyze both facilities together to find the best multi-site contract structure and maximize your savings across both properties.

I'll need current invoices from both locations to provide an accurate comparison. Can you send those over when you get a chance?

Best regards,
Lewis
```

---

## Tone Guidelines

### Professional Yet Personable
- Use contractions naturally ("we'll" not "we will")
- Write like you're speaking to them
- Avoid overly formal language
- No jargon unless industry-standard

### Confident But Not Pushy
- Make clear recommendations
- Don't oversell or exaggerate
- Let value speak for itself
- Respect their decision timeline

### Helpful & Solution-Focused
- Focus on solving their problems
- Provide specific next steps
- Make it easy to work with you
- Anticipate their questions

---

## Common Mistakes to Avoid

❌ **Don't:**
1. Start with "I hope this email finds you well" (overused)
2. Use multiple exclamation points
3. Write essay-length paragraphs
4. Include multiple unrelated topics
5. End without clear next step
6. Forget the signature format
7. Use generic templates that feel automated
8. Pitch to out-of-office messages
9. Include sales language in OOO acknowledgments
10. Display raw JSON code to recipients

✅ **Do:**
1. Reference specific details from their email
2. Keep paragraphs to 3-4 sentences max
3. Focus on one main topic per email
4. Always include clear call-to-action
5. Always end with "Best regards," + first name
6. Personalize every message
7. Detect and respect auto-replies
8. Parse AI-generated JSON before sending
9. Add proper line breaks in signature

---

## AI Generation Tips

### For Best Results
1. Provide context from the email thread
2. Include recipient details (name, company, role)
3. Specify tone (professional, casual, urgent)
4. Mention any previous conversations
5. Note any special circumstances (OOO, urgent, follow-up)

### Review Before Sending
- Check that JSON was parsed correctly
- Verify signature format (Best regards, + line break + name)
- Ensure tone matches situation
- Confirm all specific details are accurate
- Remove any template placeholders
- Verify no sales pitch in OOO replies

---

## Signature Requirements

### Format (MANDATORY)
```
Best regards,
[FirstName]
```

### Technical Implementation
- First name pulled from: `settings.general.firstName`
- Fallback to: `authManager.getCurrentUser().displayName.split(' ')[0]`
- Always include line break between "Best regards," and name
- No full name, no title, no company info
- Single blank line before signature

### Examples
✅ **Correct:**
```
Best regards,
Lewis
```

❌ **Incorrect:**
```
Best regards,
Lewis Patterson
Energy Strategist
Power Choosers
```

---

## Quick Reference

### Reply Checklist
- [ ] Greeting with first name
- [ ] Context from their email
- [ ] Clear, concise body
- [ ] Specific call-to-action
- [ ] Proper signature: "Best regards," + line break + first name
- [ ] Spell check
- [ ] Tone appropriate for situation
- [ ] No JSON code visible
- [ ] OOO detection applied if relevant

### When in Doubt
- Keep it simple and direct
- Focus on helping them
- Be specific, not generic
- End with clear next step
- Always proper signature format

---

## System Integration

### Automatic Features
1. **JSON Parsing**: AI responses automatically parsed from JSON to HTML
2. **OOO Detection**: Auto-detects out-of-office and adjusts tone
3. **Signature Insertion**: Automatically adds "Best regards," + first name
4. **Context Threading**: Includes previous email context
5. **Recipient Resolution**: Pulls correct contact name/details

### Manual Override
- Can write custom prompt for specific situation
- AI will still add proper signature
- OOO detection still applies
- JSON parsing still automatic

---

*Last Updated: November 2025*
*Power Choosers CRM - Email Reply System*

