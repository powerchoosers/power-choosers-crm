Things That Should Stay Hardcoded:
1. Contact/Account Data Field Mapping
From emails.js lines 770-830, the system reads multiple possible field names for the same data:
// Account data field mapping (should stay hardcoded)
const acctEnergy = {
    supplier: acct.electricitySupplier || '',
    currentRate: acct.currentRate || '',
    usage: acct.annualUsage || '',
    contractEnd: acct.contractEndDate || ''
};

// Account object structure (should stay hardcoded)
enrichedRecipient.account = {
    id: acct.id,
    name: acct.accountName || acct.name || '',
    industry: acct.industry || '',
    domain: acct.domain || acct.website || '',
    city: acct.city || acct.billingCity || acct.locationCity || '',
    state: acct.state || acct.billingState || acct.region || '',
    shortDescription: acct.shortDescription || acct.short_desc || acct.descriptionShort || acct.description || '',
    // ... other fields
};
2. Template Type Detection Logic
From perplexity-email.js lines 111-151, the pattern matching should stay hardcoded:
. JSON Schema Structures
From perplexity-email.js lines 291-449, the JSON schemas should stay hardcoded:
const warmIntroSchema = {
    type: "json_schema",
    json_schema: {
        name: "warm_intro_template",
        strict: true,
        schema: {
            type: "object",
            properties: {
                subject: { type: "string", description: "Email subject under 50 chars" },
                greeting: { type: "string", description: "Hello {firstName}," },
                call_reference: { type: "string", description: "Reference to the call (day, topic)" },
                main_message: { type: "string", description: "What we discussed and next steps" },
                cta_text: { type: "string", description: "Time slot options question" }
            },
            required: ["subject", "greeting", "call_reference", "main_message", "cta_text"],
            additionalProperties: false
        }
    }
};
4. CTA Pattern System
From perplexity-email.js lines 153-200, the CTA patterns should stay hardcoded:
function getCTAPattern(recipient) {
    const patterns = [
        {
            type: 'qualifying_question',
            template: 'When does your current energy contract expire?',
            guidance: 'Qualifying question, low pressure, gets useful info'
        },
        {
            type: 'soft_ask_with_context',
            template: 'Would you be open to discussing your current energy setup?',
            guidance: 'Soft ask focused on their situation, not meeting'
        },
        // ... etc
    ];
    
    const weights = [0.30, 0.30, 0.20, 0.15, 0.04, 0.01];
    // ... selection logic
}
5. Opening Style Variations
From perplexity-email.js lines 202-229, the opening styles should stay hardcoded:
function getOpeningStyle(recipient) {
    const styles = [
        {
            type: 'problem_aware',
            prompt: 'Start with industry-specific problem or market condition affecting their business',
            example: '[Industry] operations are facing [specific challenge]. [Company] is likely seeing [specific impact]...'
        },
        // ... etc
    ];
    
    return styles[Math.floor(Math.random() * styles.length)];
}
6. Business Days Calculation
From perplexity-email.js lines 231-288, the date/time logic should stay hardcoded:
function addBusinessDays(startDate, days) {
    let count = 0;
    let current = new Date(startDate);
    
    while (count < days) {
        current.setDate(current.getDate() + 1);
        const dayOfWeek = current.getDay();
        // Skip Saturday (6) and Sunday (0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
    }
    
    return current;
}
7. Company Research Logic
From perplexity-email.js lines 36-108, the company research should stay hardcoded:
async function researchCompanyInfo(companyName, industry) {
    // Research logic, caching, API calls, etc.
}

async function saveAccountDescription(accountId, description) {
    // Save to Firestore logic
}
8. Data Validation and Context Building
From emails.js lines 854-863, the validation logic should stay hardcoded:
What Should Be Made Dynamic (Settings):
1. Template Instructions Only
The actual instructions for each template type:
// These should come from settings:
const templateInstructions = {
    warm_intro: `TEMPLATE: Warm Introduction After Call
Generate text for these fields:
- greeting: "Hello ${firstName}," 
- call_reference: Mention when you spoke and what you discussed
- main_message: Brief recap of conversation, value prop, urgency (2-3 sentences)
- cta_text: Use a qualifying question or soft ask that invites dialogue without requesting a meeting. Examples: "When does your current energy contract expire?", "Would you be open to discussing your energy setup?"`,

    follow_up: `TEMPLATE: Follow-Up with Value Props
Generate text for these fields:
- greeting: "Hello ${firstName},"
- progress_update: Brief status update on where things stand
- value_props: Array of 4-6 concise selling points (each 1 sentence)
- urgency_message: Market timing/urgency message (1-2 sentences)
- cta_text: Clear next step request`,
    
    // ... etc
};
2. Base System Prompt
The core identity and context rules:
// This could be made dynamic:
const identity = `You are ${senderName}, an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.

CONTEXT USAGE RULES:
${contractEndLabel ? `- The recipient's contract ends ${contractEndLabel} - YOU MUST REFERENCE THIS` : ''}
${notes || transcript ? `- Use call notes/transcript to add specific context from your conversation` : ''}
${job ? `- Acknowledge their role as ${job}` : ''}
- Personalize based on their industry and current situation
- Make it feel like you just spoke with them

KEY CONTEXT:
- Electricity rates rising 15-25% due to data center demand
- Companies with contracts ending 2025-2026 face higher renewal rates
- Early renewals save 20-30% vs. waiting`;