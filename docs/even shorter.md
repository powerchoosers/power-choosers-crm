Power Choosers CRM: Personalization & Variety Boost

Objective: Break the "robotic template" feel by prioritizing verified research (News, Hiring, Expansion) over generic angles, and relaxing structural constraints to allow for human-like variety.

Phase 1: Unleash the Research (perplexity-email.js)

Problem: The AI has research data but is "afraid" to use it because the "Angle" instructions are too strict.
Fix: Invert the priority. Research > Angle.

1. Update buildSystemPrompt - The "Research-First" Directive

Location: Inside buildSystemPrompt (approx line 2100+).
Action: Replace the "Personalization Priority" section with this stronger instruction.

// REPLACE the existing "Personalization Priority" section with this:

PERSONALIZATION PRIORITY (ABSOLUTE RULE):
1. **TRIGGER EVENTS (GOLD STANDARD):** If `researchData` contains specific news (Expansion, New Facility, Funding, Acquisition, New Hire, Project Launch), YOU MUST OPEN WITH THIS.
   - *Example:* "I saw Texas Aero just opened the new hangar in San Marcos."
   - *Connect it:* "New square footage usually means a significant jump in peak demand charges."
   - *Ignore the 'Angle' if it doesn't fit the news.* The news IS the angle.

2. **COMPANY SPECIFICS (SILVER STANDARD):** If no news, use specific operational details found in `researchData` (Fleet size, specific locations, shift schedules).
   - *Example:* "With your fleet of 50+ trucks operating out of the DFW hub..."

3. **ROLE/INDUSTRY (BRONZE STANDARD):** Only if NO research is available, fall back to the Role/Industry angle.

**CREATIVE FREEDOM INSTRUCTION:**
- **Vary Your Structure:** Do not always use "Greeting -> Question -> Value -> CTA."
- **Blend Sections:** It is okay to combine the observation and the question.
- **Be Conversational:** Write like you are texting a colleague, not writing a press release.
- **Word Count:** Target **75-115 words**. Use the extra space to explain *why* the research matters.



2. Update buildColdEmailHtmlTemplate - Research Data Injection

Location: Inside buildSystemPrompt.
Action: Ensure researchData is actually being passed effectively.

Check: Ensure the recipientContext string includes this block:

// Ensure this block is robust:
RESEARCH HIGHLIGHTS:
${recentActivityContext ? `- RECENT NEWS: ${recentActivityContext}` : ''}
${linkedinContext ? `- LINKEDIN: ${linkedinContext}` : ''}
${websiteContext ? `- WEBSITE: ${websiteContext}` : ''}
${locationContextData ? `- LOCAL MARKET: ${locationContextData}` : ''}



Phase 2: Relax Structure & Word Counts (generate-scheduled-emails.js)

Problem: "Paragraph 1 must be 20 words" forces robotic chopping of complex ideas.
Fix: Set a Total word count limit, not per-paragraph limits.

1. Update Word Count Logic

Location: generate-scheduled-emails.js (validation logic).
Action: Remove section-specific limits.

Find: Logic checking hookCount > 20, valueCount > 30.
Replace with:

// RELAXED WORD COUNT POLICY
// Allow natural flow. Only check total length.
const totalWords = (jsonData.opening_hook + ' ' + jsonData.value_proposition + ' ' + jsonData.cta_text).split(/\s+/).length;

if (totalWords > 125) { // Increased from 90 to 125
  // Only truncate if it's truly rambling (over ~125 words)
  // ... truncation logic ...
}



2. Remove "Paragraph" Constraints

Location: perplexity-email.js -> outputFormat variable.
Action: Tell the AI it can merge paragraphs if natural.

Find: Paragraph 1... Paragraph 2...
Replace with:

OUTPUT FORMAT (JSON):
{
  "subject": "...",
  "greeting": "Hi [Name],",
  "body_content": "The full email body. You may use 1-3 paragraphs. Focus on natural flow. Connect the research hook directly to the value proposition without forced breaks.",
  "cta_text": "The final question.",
  "closing": "Best regards,\nLewis"
}



(Note: You will need to update the parser in generate-scheduled-emails.js to handle body_content instead of separate paragraphs, or instruct the AI to split it intelligently into paragraph1/2 if you want to keep the JSON structure intact. Keeping paragraph1 etc. but relaxing the content rules for them is safer for code stability.)

Revised Instruction for outputFormat (Safer):
"You have freedom to distribute text between paragraph1 and paragraph2. paragraph1 can be the research hook AND the problem statement. paragraph2 can be the solution."

Phase 3: The "Contract Date" Question

Question: Is "When does your contract expire?" high friction?
Answer: No, it is Low Friction but High Boring.

Why it works: It requires zero "emotional labor" to answer. It's a fact.

Why it fails: It sounds like a commodity broker.

The Fix: Wrap it in value.

Don't say: "When does your contract expire?"
Say: "If your contract expires before Summer 2026, you might be exposed to rising delivery costs. When is your renewal?"

Action: Update angleCtaMap in perplexity-email.js (again) to allow these "Context-Wrapped CTAs."

// Example update for Timing Angle
full: 'Given rising delivery costs, does your current contract cover you through next summer?',



Summary of Changes for Agent

perplexity-email.js:

Inject "Research-First" priority rules.

Relax structural rigidity (allow blending hook/problem).

Context-wrap the CTAs.

generate-scheduled-emails.js:

Switch to Total Word Count check (limit 125).

Remove per-paragraph word limits.

This gives the AI the "breathing room" to be smart