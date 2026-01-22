# Sequence Machine Documentation

## Overview

The Sequence Machine is an automated email system that sends personalized emails to contacts over time based on a predefined sequence of steps. It handles:
- **Sequence Creation**: Building multi-step email sequences with delays
- **Activation**: Starting sequences for contacts
- **Email Generation**: Creating personalized emails using AI (Perplexity)
- **Email Sending**: Automatically sending approved emails via Gmail API
- **Chain Creation**: Creating next step emails after previous ones are sent

---

## System Architecture

### Key Components

1. **`scripts/pages/sequence-builder.js`** - UI for creating/editing sequences, adding contacts, and starting them. Includes "Sequence Contacts" modal with bulk actions.
2. **`scripts/pages/list-detail.js`** - Bulk add contacts to sequences from list detail page with email validation and progress toast system.
3. **`scripts/pages/contact-detail.js`** - Add individual contacts to sequences from contact detail page.
4. **`api/process-sequence-activations.js`** - Processes sequence activations and creates first step emails
5. **`api/generate-scheduled-emails.js`** - Generates email content using AI for pending emails
6. **`api/send-scheduled-emails.js`** - Sends approved emails via Gmail API and creates next step emails
7. **`api/email/gmail-service.js`** - Gmail API service for sending emails (replaces SendGrid)
8. **`scripts/pages/emails-redesigned.js`** - UI for viewing/managing scheduled emails
9. **`api/_angle-definitions.js`** - Centralized angle definitions with industry-specific opening hooks, proof points, and role-based CTAs
10. **`api/_industry-detection.js`** - Shared industry detection helpers for consistent industry classification

### Data Flow

```
1. User creates sequence → Firestore 'sequences' collection
2. User starts sequence → Firestore 'sequenceActivations' collection
3. process-sequence-activations.js → Creates first step emails in 'emails' collection
4. generate-scheduled-emails.js → Generates email content (status: pending_approval)
5. User approves email → Status changes to 'approved'
6. send-scheduled-emails.js → Sends email and creates next step email
7. Repeat steps 4-6 for each step
```

---

## Data Structures

### Sequence Document (`sequences` collection)

```javascript
{
  id: "seq-1234567890",
  name: "Cold Outreach Sequence",
  steps: [
    {
      type: "auto-email",  // or "phone-call", "linkedin", "task"
      order: 0,
      delayMinutes: 0,  // Delay from previous step
      aiMode: "html",  // "html" (branded template) or "standard" (NEPQ-style plain text)
      emailSettings: {
        aiPrompt: "Write a cold introduction email...",
        subject: "Energy Cost Question",
        // ... other email settings
      },
      data: {
        aiMode: "html"  // Also stored in data.aiMode for backward compatibility
      }
    },
    {
      type: "auto-email",
      order: 1,
      delayMinutes: 1440,  // 24 hours later
      emailSettings: {
        aiPrompt: "Write a follow-up email...",
        // ...
      }
    }
  ],
  ownerId: "user@example.com",
  createdAt: Timestamp
}
```

### Sequence Activation Document (`sequenceActivations` collection)

```javascript
{
  id: "activation-1234567890",
  sequenceId: "seq-1234567890",
  contactIds: ["contact-1", "contact-2"],  // Array of contact IDs (max 25 per activation)
  status: "pending" | "processing" | "completed" | "failed",
  processedContacts: 0,  // How many contacts processed so far
  totalContacts: 2,
  ownerId: "user@example.com",
  assignedTo: "user@example.com",
  createdBy: "user@example.com",
  createdAt: Timestamp,
  processingStartedAt: Timestamp,  // When processing began
  completedAt: Timestamp,  // When all contacts processed
  progress: {
    emailsCreated: 0
  },
  failedContactIds: []  // Contacts without email addresses
}
```

**Note**: Activations are created in batches of up to 25 contacts. When adding many contacts at once (e.g., from list-detail.js), multiple activation documents are created automatically.

### Sequence Member Document (`sequenceMembers` collection)

```javascript
{
  id: "member-1234567890",
  sequenceId: "seq-1234567890",
  targetId: "contact-1",  // Contact or account ID
  targetType: "people" | "accounts",
  hasEmail: true,  // Boolean: whether contact has email address
  skipEmailSteps: false,  // Boolean: flag to skip email steps if no email
  ownerId: "user@example.com",
  userId: "firebase-user-id",  // Optional: Firebase auth UID
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Important**: The `hasEmail` and `skipEmailSteps` fields are set when the member is added. Contacts without emails are still added to sequences but will skip email steps automatically.

### Email Document (`emails` collection)

```javascript
{
  id: "email-1234567890-abc123",
  type: "scheduled",
  status: "not_generated" | "pending_approval" | "approved" | "sending" | "sent" | "error",
  scheduledSendTime: 1234567890000,  // Unix timestamp in milliseconds
  contactId: "contact-1",
  contactName: "John Doe",
  contactCompany: "Acme Corp",
  to: "john@acme.com",
  sequenceId: "seq-1234567890",
  sequenceName: "Cold Outreach Sequence",
  stepIndex: 0,  // Which step in the sequence (0 = first)
  totalSteps: 3,
  activationId: "activation-1234567890",
  aiMode: "html",  // "html" (branded template) or "standard" (NEPQ-style plain text)
  aiPrompt: "Write a cold introduction email...",
  subject: "Energy Cost Question",  // Generated after AI generation
  html: "<html>...</html>",  // Generated after AI generation (HTML mode) or simple HTML wrapper (standard mode)
  text: "Plain text version...",  // Generated after AI generation
  ownerId: "user@example.com",
  assignedTo: "user@example.com",
  createdBy: "user@example.com",
  createdAt: Timestamp,
  generatedAt: Timestamp,  // When AI generation completed
  generatedBy: "scheduled_job",
  sentAt: Timestamp,  // When email was sent
  angle_used: "timing_strategy",  // Which angle was selected
  tone_opener: "Question for you",  // Tone opener used in the email (if provided, no em dashes)
  exemption_type: null  // Tax exemption type if applicable
}
```

---

## Step-by-Step Flow

### Phase 1: Sequence Creation

1. **User creates sequence** in `sequence-builder.js`:
   - Adds steps (auto-email, phone-call, linkedin, task)
   - Sets delays between steps
   - Configures email prompts and settings
   - Saves to Firestore `sequences` collection

2. **User adds contacts** to sequence (multiple entry points):
   - **From Sequence Builder** (`sequence-builder.js`):
     - Search and add contacts via search bar
     - View all contacts in "Sequence Contacts" modal
     - Bulk actions: select multiple contacts, remove from sequence
     - Uses progress toast system for bulk operations
   - **From List Detail Page** (`list-detail.js`):
     - Select multiple contacts/accounts from list
     - Click "Add to sequence" in bulk actions bar
     - Email validation modal shows contacts without emails
     - Options: Add all, or add only contacts with emails
     - Uses progress toast system (3-step: load data, check duplicates, add members)
     - Auto-starts sequence if sequence is active (creates `sequenceActivations`)
   - **From Contact Detail Page** (`contact-detail.js`):
     - Click "Add to Sequence" button on contact detail page
     - Select sequence from dropdown
     - Confirmation dialog if contact has no email
     - Auto-starts sequence if sequence is active
   - **Common behavior**:
     - Contacts stored in `sequenceMembers` collection
     - Links contacts to sequence
     - Sets `hasEmail` and `skipEmailSteps` flags based on email availability
     - Updates sequence `stats.active` count
     - **Auto-start**: If sequence already has active members or existing activations, automatically creates `sequenceActivations` for new contacts with emails
     - Creates activations in batches of 25 contacts (API limit)
     - Immediately triggers `/api/process-sequence-activations` for instant processing

### Phase 2: Sequence Activation

1. **Sequence activation can be triggered in multiple ways**:
   - **Manual start** in `sequence-builder.js`:
     - User clicks "Start Sequence" button
     - Calls `startSequenceForContact()` function
     - Creates `sequenceActivations` document with status `pending`
     - Immediately calls `/api/process-sequence-activations` with `immediate: true`
   - **Automatic start** (when adding contacts to active sequences):
     - When contacts are added via `list-detail.js` or `contact-detail.js`
     - System checks if sequence has active members or existing activations
     - If active, automatically creates `sequenceActivations` for new contacts with emails
     - Batches contacts into groups of 25 (API processing limit)
     - Immediately triggers `/api/process-sequence-activations` for each batch
     - **Note**: Contacts without emails are still added to sequence but skipped in activation (email steps will be skipped)

2. **`process-sequence-activations.js` processes activation**:
   - Changes status from `pending` → `processing`
   - Loads sequence from Firestore
   - Loads contact data from `people` collection
   - Finds **first auto-email step** (stepIndex = 0)
   - Creates email documents for each contact:
     - Status: `not_generated`
     - `scheduledSendTime`: `Date.now() + (delayMinutes * 60 * 1000)`
     - `aiMode`: `step.data?.aiMode || step.aiMode || 'standard'` (defaults to 'standard' if not specified)
     - Includes all metadata (sequenceId, stepIndex, activationId, etc.)
   - Updates activation: `processedContacts++`, status → `completed` if all done

**Important**: Only creates emails for the **first auto-email step**. Subsequent steps are created after previous emails are sent. The `aiMode` from the sequence step is preserved on the email document for use during generation.

### Phase 3: Email Generation

1. **User clicks "Generate Now"** in `emails-redesigned.js` OR cron job runs:
   - Calls `/api/generate-scheduled-emails` with `immediate: true`

2. **`generate-scheduled-emails.js` generates emails**:
   - Queries `emails` collection:
     - `type == 'scheduled'`
     - `status == 'not_generated'`
     - `scheduledSendTime >= now - 1 minute` (buffer for "now")
     - `scheduledSendTime <= now + 1 year` (for immediate mode)
     - Limit: 40 emails per run (rate limit: 50 RPM)
   - For each email:
     - Loads contact data from `people` collection
       - Loads account data from `accounts` collection (for industry/exemption/energy supplier)
       - **Energy Supplier Context**: Extracts `electricitySupplier`, `currentRate`, `contractEndDate`, `annualUsage` from account and includes in `recipient.energy` object for AI personalization
     - **Industry Detection** (Priority Order):
       1. **CRM Data First**: `accountData.industry` or `contactData.industry` (highest priority)
       2. **Company Name Inference**: `inferIndustryFromCompanyName(companyName)` (if CRM data missing)
       3. **Description Inference**: `inferIndustryFromDescription(accountDescription)` (if name inference fails)
       4. **Default**: `'Default'` if none found
       - **Note**: CRM industry data is always prioritized to prevent misclassification (e.g., "Construction" companies incorrectly identified as "Nonprofit")
     - **Angle Selection**:
       - Calls `selectRandomizedAngle(industry, null, recipient, usedAngles)` with industry-weighted selection
       - Uses centralized angle definitions from `api/_angle-definitions.js`
       - **Industry-Weighted Selection**: Certain angles perform better for certain industries (e.g., Manufacturing: demand_efficiency=3, Healthcare: exemption_recovery=3)
       - Returns angle object with: `id`, `label`, `primaryMessage`, `openingTemplate`, `industryContext`, `proof`
       - **Industry-Specific Openers**: Each angle has industry-specific opening hooks with observable pain points (e.g., "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+")
       - **Role-Based CTAs**: CTAs vary by recipient role (CEO, CFO, Operations, Controller, Facilities) - each requires admission of problem, not dismissible
       - Selects `toneOpener` based on angle using `selectRandomToneOpener(angleId)`
       - **Angle Enforcement**: Angle is **injected as critical instruction** into the AI prompt to ensure it is actually used
       - **Tone Opener Guidance**: Tone opener is provided as **INSPIRATION** (stylistic guide, not template) - AI has creative freedom to craft natural openers while matching the style. Explicitly forbids defaulting to "Quick question" every time.
       - **Angle-Based CTAs**: System uses `getAngleCta(selectedAngle, industry, role, company)` to get industry-specific and role-specific CTA structure from angle definitions
       - **Angle-Based Subjects**: Observable pain statements in subject lines (e.g., "[company] – likely overpaying on demand charges") instead of generic questions
     - **AI Generation**:
       - Reads `emailData.aiMode` from the email document (`'html'` or `'standard'`)
       - Calls `/api/perplexity-email` with:
         - `prompt`: email's `aiPrompt` (user instruction from sequence step)
         - `mode`: `'html'` (if `aiMode === 'html'`) or `'standard'` (if `aiMode === 'standard'`)
         - `templateType`: `'cold_email'` (only for HTML mode)
         - `recipient`: contact/account data (includes CRM industry, shortDescription, energy supplier, etc.)
         - `recipient.energy`: object with `supplier`, `currentRate`, `contractEnd`, `annualUsage` from account data
         - `selectedAngle`: selected angle object with `openingTemplate`, `primaryValue`, `primaryMessage` (injected into system prompt)
         - `toneOpener`: selected tone opener (provided as INSPIRATION - stylistic guide, not template. AI has creative freedom to match the style but should NOT default to "Quick question")
       - **System Prompt Enhancement**: The user's `aiPrompt` is wrapped with comprehensive system instructions:
         - Angle context block (angle ID, focus, opening template, value proposition)
         - Tone opener guidance (optional, varied conversational styles encouraged)
         - Angle-based CTA instructions (uses angle's opening question as foundation)
         - Angle-based subject line instructions (creative control with angle variations)
         - Research data integration
         - Industry-specific context
       - Receives structured JSON response with angle-specific CTAs and subjects
     - **Content Sanitization** (Post-Generation):
       - **Greeting Enforcement**: Enforces first name only (not full name) - "Hello Kurt," NOT "Hello Kurt Lacoste,"
       - **Closing Enforcement**: Always adds "Best regards, [SenderFirstName]" if not present in AI output
       - Removes unwanted phrases: "I noticed", "I saw", "Quick question,", "Real question,", "Out of curiosity," (note: "Quick question that might be off base" is allowed as a specific variation, but generic "Quick question" is removed. No em dashes used)
       - Normalizes percentages: "15-20%", "15-25%" → "10-20%"
       - Replaces industry placeholders: "Default companies" → "companies like yours"
       - Fixes nonprofit phrasing: "nonprofit companies" → "organizations" (if industry is not nonprofit)
       - Prevents description dumping: Ensures company description is used as context, not copied verbatim
     - **Subject Line Generation**:
       - **HTML Mode**: Perplexity generates subject line with angle-based creative control (unique variations per angle)
       - **Standard Mode**: Uses angle-based subject array (3-4 variations per angle) if angle available, falls back to role-based if not
       - Both modes ensure subject lines vary and are angle-specific (not repetitive)
     - **Template Building**:
       - **HTML Mode** (`aiMode === 'html'`):
         - Calls `buildColdEmailHtmlTemplate(outputData, recipient)` for branded HTML template
         - Calls `buildTextVersionFromHtml(htmlContent)` for plain text version
       - **Standard Mode** (`aiMode === 'standard'`):
         - Builds simple NEPQ-style HTML wrapper from JSON response
         - No branded template, plain text formatting
         - Subject line generated from angle-based variations (not hardcoded role-based)
     - **Update Email**:
       - Sets `subject`, `html`, `text`
       - Changes status: `not_generated` → `pending_approval`
       - Sets `generatedAt`, `generatedBy: 'scheduled_job'`
       - Stores `angle_used`, `tone_opener`, `exemption_type` for analytics
   - Processes in batches of 10 with 12-second delays (rate limiting)

---

## Perplexity/Sonar API Email Generation System

### Overview

The Sequence Machine uses **Perplexity Sonar API** (via `/api/perplexity-email`) to generate highly personalized email content. The system gathers comprehensive context from multiple data sources and constructs a detailed system prompt that guides the AI to create contextually relevant, angle-based emails.

### API Call Flow

1. **`generate-scheduled-emails.js`** prepares the email generation request:
   - Loads contact and account data from Firestore
   - Detects industry and selects email angle
   - Builds recipient object with all available context
   - Calls `/api/perplexity-email` with structured data

2. **`perplexity-email.js`** processes the request:
   - Receives recipient data, angle, tone opener, and user prompt
   - Executes `buildSystemPrompt()` to construct comprehensive system instructions
   - Performs parallel research (company info, LinkedIn, website, recent activity, location)
   - Extracts and formats all context data
   - Calls Perplexity Sonar API with the complete system prompt
   - Returns structured JSON response with email content

3. **Response Processing**:
   - `generate-scheduled-emails.js` receives structured JSON
   - Applies content sanitization (removes unwanted phrases, normalizes percentages)
   - Builds HTML template (HTML mode) or simple wrapper (Standard mode)
   - Updates email document with generated content

### Context Data Sources

The system gathers context from multiple sources to create highly personalized emails:

#### 1. **Contact Data** (`people` collection)
- **Basic Info**: `firstName`, `lastName`, `name`, `fullName`
- **Role**: `title`, `job`, `role`
- **Contact Info**: `email`, `phone`
- **LinkedIn**: `linkedin`, `linkedinUrl` (for personal profile research)
- **Notes**: `notes` field (extracted and included in system prompt)
- **Account Link**: `accountId` or `account_id` (used to fetch account data)

#### 2. **Account Data** (`accounts` collection)
- **Company Info**: `companyName`, `name`, `domain`, `website`
- **Industry**: `industry` (highest priority for angle selection)
- **Description**: `shortDescription`, `short_desc`, `descriptionShort`, `description`, `companyDescription`, `accountDescription` (cleaned and sanitized)
- **Location**: `city`, `state` (for regional energy market context)
- **LinkedIn**: `linkedin`, `linkedinUrl` (for company profile research)
- **Notes**: `notes` field (extracted and included in system prompt)
- **Energy Data**:
  - `electricitySupplier` / `electricity_supplier` → `recipient.energy.supplier`
  - `currentRate` / `current_rate` → `recipient.energy.currentRate`
  - `contractEndDate` / `contract_end_date` → `recipient.energy.contractEnd`
  - `annualUsage` / `annual_usage` → `recipient.energy.annualUsage`
- **Operational Details**:
  - `employees` (facility scale)
  - `squareFootage` / `square_footage` (facility size)
  - `occupancyPct` / `occupancy_pct` (occupancy percentage)
- **Tax Exemption**: `taxExemptStatus` (for exemption_recovery angle)

#### 3. **Previous Sequence Emails** (for context and angle avoidance)
- Queries last 3 emails in same sequence for same contact
- Extracts: `subject`, `content` (text or HTML), `sentAt`, `angle_used`
- Used to:
  - Avoid repeating recently used angles
  - Provide context for follow-up emails
  - Track sequence progression

#### 4. **Real-Time Research** (performed in parallel by `buildSystemPrompt()`)

**Company Research** (`researchCompanyInfo()`):
- Uses Perplexity API to research company information
- Only runs if no account description exists
- Results saved to account document for future use
- Provides company background, operations, and industry context

**Company LinkedIn Research** (`researchLinkedInCompany()`):
- Scrapes company LinkedIn page if URL available
- Extracts: company updates, recent posts, employee count, industry info
- Provides recent company activity and engagement context

**Company Website Research** (`scrapeCompanyWebsite()`):
- Scrapes company website if domain available
- Extracts: company description, services, about page content
- Provides additional company context and positioning

**Contact LinkedIn Research** (`researchContactLinkedIn()`):
- Researches contact's personal LinkedIn profile if URL available
- Extracts: tenure, career background, recent posts, activity
- Provides personal context for role-specific messaging

**Recent Company Activity Research** (`researchRecentCompanyActivity()`):
- Uses Perplexity API to find recent news, press releases, announcements
- Searches by: company name, industry, city, state
- Provides timely context for email personalization (e.g., "I noticed your recent expansion...")

**Location Context Research** (`researchLocationContext()`):
- Researches regional energy market conditions
- Searches by: city, state, industry
- Provides location-specific energy market context (e.g., "Texas energy market volatility...")

#### 5. **Notes Extraction** (from contact and account)

**Source**: Both `contactData.notes` and `accountData.notes` are extracted and combined:
```javascript
const notes = [r.notes, r.account?.notes].filter(Boolean).join('\n').slice(0, 500);
```

**Usage in System Prompt**:
- Included in `HISTORICAL CONTEXT` section
- Provides guidance: "Use these notes to personalize the email. If notes mention 'spoke with [name]', reference that conversation. If notes mention 'tried to reach out' or 'no answer', you can reference previous attempts to connect."
- Examples of useful note patterns:
  - "spoke with [name]" → Reference the conversation
  - "tried to reach out" / "no answer" → Reference previous attempts
  - Current activities, challenges, interests → Weave naturally into email
  - Contract details, renewal dates → Use for timing context

**Note**: Notes are limited to 500 characters to keep prompts manageable.

### System Prompt Structure

The `buildSystemPrompt()` function in `api/perplexity-email.js` constructs a comprehensive system prompt with the following sections:

#### 1. **Recipient Information**
- Name, role, tenure (if available)
- Industry, company description
- Location (city, state)
- Seniority level, department (if available)

#### 2. **Operational Details**
- Facility scale (employees)
- Facility size (square footage)
- Occupancy percentage
- Annual energy usage (kWh)

#### 3. **Research Data**
- Company LinkedIn activity
- Company website content
- Contact LinkedIn profile (tenure, background, recent posts)
- Recent company activity (news, announcements)
- Regional energy market context

#### 4. **Energy Data**
- Current supplier
- Current rate ($/kWh)
- Contract end date (formatted as "Month Year")
- **Contract Renewal Context**: Detailed calculation of months/days until expiry, urgency level, and ideal renewal window messaging

#### 5. **Historical Context**
- Call transcripts (if available, limited to 1000 chars)
- **CRM Notes** (from contact and account, limited to 500 chars)
  - Includes guidance on how to use notes for personalization
  - Examples: "spoke with [name]", "tried to reach out", "no answer"

#### 6. **Industry-Specific Context**
- Industry focus language
- Key pain points
- **Dynamic Savings by Industry/Role**: Savings percentages selected dynamically based on recipient's industry and role category (e.g., Manufacturing-Finance: 15-25%, Manufacturing-Operations: 12-20%)
- Key benefits
- Urgency drivers

#### 7. **Company Size Context**
- Focus area, pain points, approach, language style
- **Critical**: Never say "small company" - always phrase as industry-based

#### 8. **Contract Urgency Level & Renewal Context**
- Calculated from contract end date
- **Detailed Renewal Context Block**:
  - Calculates `daysUntilExpiry` and `monthsUntilExpiry`
  - Determines urgency level: `CRITICAL` (< 60 days), `HIGH` (< 180 days), `MEDIUM` (< 12 months), `LOW` (≥ 12 months)
  - Identifies ideal renewal window: 4-8 months out
  - Provides urgency-specific messaging:
    - **< 4 months**: "URGENT - emphasize cost lock-in before rate increases"
    - **4-8 months**: "IDEAL renewal window - perfect timing for early renewal"
    - **> 8 months**: "Reference timing advantage and planning benefits"
- Urgency level, messaging tone, focus, language

#### 9. **Trigger Events**
- Detected from company data and research
- Recent expansions, leadership changes, funding, etc.

#### 10. **Deep Personalization**
- Company achievements
- Recent activity
- Identified pain points
- Opportunities
- Role-specific focus

#### 11. **Primary Angle Context** (for cold emails)
- Angle ID, focus, industry-specific opening hook, industry-specific proof point, role-based CTA
- **Critical instruction**: Structure entire email around this angle
- **Industry-Specific Opening Hooks**: Each angle provides industry-specific hooks with observable pain points:
  - Manufacturing: "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+"
  - Healthcare: "Quick observation: most hospitals we work with overpay 15-20% on demand charges because their rate structure doesn't match their shift-change pattern"
  - Retail: "Quick question: are your energy peaks aligned with shopping hours, or are you paying demand charges for times you don't actually spike?"
  - And more for each industry (DataCenter, Hospitality, Nonprofit, Education, etc.)
- **Industry-Specific Proof Points**: Social proof tailored to industry (e.g., "70% of manufacturing ops we audit find 15-25% savings")
- **Role-Based CTAs**: High-friction CTAs that require admission of problem:
  - CEO: "Are you aware how much of your margin is hidden in misaligned energy rates?"
  - CFO: "When was the last time someone audited your demand charges? (Most CFOs we talk to are shocked by what they find.)"
  - Operations: "How are you optimizing consumption before renewal without impacting production?"
  - Controller: "Are you optimizing all available rate reductions before contract renewal?"
- **Observable Pain**: Openers create cognitive friction - something they can't easily dismiss
- **Critical Instruction**: "DO NOT deviate from this message. Every sentence should reinforce it."
- Example: "timing_strategy" → Focus on contract renewal timing with industry-specific context

#### 12. **Tone Opener Guidance** (for cold emails)
- **Creative Freedom**: Tone opener is provided as INSPIRATION - use it as a stylistic guide, not a template. AI has creative freedom to craft natural, human-sounding openers.
- **FORBIDDEN REPETITION**: Do NOT default to "Quick question" every time. This is overused and makes all emails sound the same. Vary your opener style.
- **Variety**: System provides 4 style options (Soft curiosity, Confused/disarmed, Peer/observational, Direct)
- **No Em Dashes**: Openers flow naturally without em dashes (use commas or natural flow)
- **Examples**: "Curious if you're seeing...", "How are you managing...", "Most teams I work with...", "Are you currently handling...", "Most people I talk to..."
- **Variation Required**: Openers should vary across emails to avoid template sameness. Do NOT repeat "Quick question" or any other opener pattern.

#### 13. **Angle-Based CTA Instructions**
- Uses `getAngleCta(selectedAngle, industry, role, company)` from `api/_angle-definitions.js` to provide industry-specific and role-specific CTA foundation
- **Industry-Specific Opening**: Uses industry-specific opener hook (e.g., "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+")
- **Industry-Specific Proof**: Includes industry-specific proof point (e.g., "70% of manufacturing ops we audit find 15-25% savings")
- **Role-Based CTA**: High-friction CTA tailored to recipient role that requires admission of problem:
  - Not answerable with "we're fine" or "not needed"
  - Requires them to admit lack of action or audit
  - Examples: "Are you on peak-based or 4CP?" (Both imply problems), "When was your last demand audit?" (Implies they haven't done one)
- Structure: [Industry-Specific Opening Hook] + [Industry-Specific Proof] + [Role-Based High-Friction CTA]
- **CTA Escalation System**: CTA strength varies based on email position in sequence:
  - **Email 1 (First Contact)**: SOFT - Discovery question ("Worth a 10-minute look?")
  - **Email 2 (Follow-up)**: MEDIUM - Reference previous + Value ask ("Can I pull a quick analysis for you?")
  - **Email 3+ (Final Attempt)**: HARD - Specific time options ("Can you do Thursday 2-3pm or Friday 10-11am? If not, when works better?")
- Perplexity has creative control but must include all components and use the provided industry/role-specific elements

#### 14. **Angle-Based Subject Instructions**
- **Observable Pain Statements**: Subject lines use observable pain instead of generic questions
- **Role-Specific Variants**: Different subject lines for different roles:
  - CEO: "[company] – likely overpaying on demand charges", "[contact_name], margin-hidden energy opportunity?"
  - Finance: "[company] – potential $50K+ recovery opportunity", "Budget variance alert: [company] energy exposure"
  - Operations: "[company] – peak demand structure question", "[contact_name], optimizing before renewal?"
  - Controller: "[company] – sales tax exemption recovery?", "Compliance check: [company] tax exemptions"
- HTML Mode: Perplexity generates unique subject lines with observable pain inspired by angle
- Standard Mode: Randomly selects from role-specific subject array with observable pain statements
- Ensures variation, angle-specific messaging, and creates friction (not dismissible)

#### 15. **Company-Specific Data Usage Examples**
- Provides example phrases for using energy data, company description, industry context
- Guides AI on how to naturally reference available data

#### 16. **Role-Specific Opening Hook Examples**
- Provides examples for different roles (CFO, Facilities, Procurement, Operations, Executive)
- Guides AI on role-appropriate messaging

#### 17. **Adaptive Mental Model** (Role/Industry-Based Vocabulary)
- **Persona 1: Hospitality / Retail / Office (Owner, GM, Office Manager)**
  - Tone: Business-savvy but accessible. Helpful peer.
  - Focus: Bottom line, "getting this off your plate," budget certainty, protecting margins.
  - Avoid: Heavy jargon (Heat rates, spark spreads, 4CP) - Use "Peak Demand" instead.
  - Keywords: "Operating expenses," "Budget protection," "Bill audit," "Simplicity," "Peak charges."
- **Persona 2: Industrial / Manufacturing / Data Center (Facility Dir, Plant Mgr)**
  - Tone: Technical authority. Insider.
  - Focus: Operational impact, load profiles, demand response, efficiency.
  - Use: Technical terms correctly (Load Factor, Demand Ratchets, kVA). Use "Peak Demand" or "Peak Demand Charges" instead of "4CP" for clarity.
  - **CRITICAL - NEVER use "4CP" or "Four Coincident Peaks"**: Always use "Peak Demand" or "Peak Demand Charges" instead. Even technical recipients benefit from clear, accessible language. Food production, manufacturing, and industrial facilities should see "Peak Demand" terminology.
  - Keywords: "Uptime," "Peak Demand," "Peak Demand Charges," "Load profile," "TDU charges."
- **Persona 3: Finance (CFO, Controller)**
  - Tone: Financial risk manager. Direct.
  - Focus: Risk mitigation, variance, EBITDA impact, forecasting.
  - Keywords: "Forward curves," "Futures," "Risk mitigation," "Fixed vs Float."

#### 18. **4CP to Peak Demand Terminology Replacement**
- **Forbidden Terms**: "4CP", "Four Coincident Peaks", any variation of the technical term
- **Required Terminology**: "Peak Demand" (preferred) or "Peak Demand Charges" (when referring to costs)
- **Application**: All industries and roles, including technical/industrial recipients
- **System Prompt Instructions**: Explicitly forbids "4CP" and requires "Peak Demand" terminology for clarity
- **Subject Line Updates**: Uses "Peak demand strategy" instead of "4CP analysis"
- **CTA Examples**: Updated to use "Peak demand strategy" instead of "4CP handling"

#### 19. **User's Original Prompt**
- The user's `aiPrompt` from the sequence step
- Included at the end as the actual instruction
- Provides general guidance on email structure, tone, and requirements

### Perplexity API Call

**Endpoint**: Perplexity Sonar API (via internal `/api/perplexity-email` wrapper)

**Request Structure**:
```javascript
{
  prompt: "Write a cold introduction email...",  // User's aiPrompt from sequence step
  mode: "html" | "standard",  // From emailData.aiMode
  templateType: "cold_email",  // Always 'cold_email' for sequence emails
  recipient: {
    firstName: "John",
    company: "Acme Corp",
    title: "CFO",
    industry: "Manufacturing",
    account: { /* full account data */ },
    energy: {
      supplier: "TXU",
      currentRate: "0.12",
      contractEnd: "2025-06-30",
      annualUsage: "500000"
    },
    notes: "Spoke with John about contract renewal. No answer on first call.",
    // ... all other context fields
  },
  selectedAngle: {
    id: "timing_strategy",
    openingTemplate: "When does your current contract expire?",
    primaryValue: "10-20% better rates when locking in 6 months early",
    primaryMessage: "early contract renewal timing"
  },
  toneOpener: "Question for you",  // Optional - AI can use this or choose natural variation
  senderName: "Lewis Patterson",
  emailPosition: 1,  // 1, 2, or 3 for CTA escalation
  previousAngles: ["consolidation"]  // Avoid repeating angles
}
```

**Response Structure**:
```javascript
{
  ok: true,
  output: {
    subject: "John, when does your contract expire?",
    greeting: "Hi John,",
    opening_hook: "Question for you, with Acme Corp's contract ending in June 2025...",  // Note: uses comma, not em dash
    value_proposition: "Most manufacturing companies see 10-20% savings...",
    cta_text: "When does your current contract expire?\n\nWorth a 10-minute look?",
    closing: "Best regards,\nLewis"
  },
  metadata: {
    angle_used: "timing_strategy",
    cta_type: "angle_based"
  }
}
```

### Word Count Requirements (Current State)

**Cold Email Format (50-70 words total):**
- **Greeting**: 2 words MAX ("Hi [Name],")
- **Opening Hook**: 15-20 words EXACTLY (must include problem-awareness question)
- **Value Proposition**: 20-30 words EXACTLY (one sentence solution + outcome)
- **CTA**: 8-12 words EXACTLY (must include low-friction qualifying question)
- **Total Email**: 50-70 words MAXIMUM (greeting + hook + value + CTA)

**Enforcement:**
- **Post-Generation Aggressive Truncation**: If any section exceeds its limit, system aggressively truncates word-by-word:
  - **Opening Hook** (> 22 words):
    - Splits into words array
    - Takes first 20 words
    - Removes trailing commas/semicolons
    - Adds period if needed (unless already ends with ?)
  - **Value Proposition** (> 32 words):
    - Splits into words array
    - Takes first 30 words
    - Removes trailing commas/semicolons
    - Adds period
  - **CTA** (> 14 words):
    - Splits into words array
    - Takes first 12 words
    - Removes trailing commas/semicolons
    - Adds question mark if needed (unless already ends with ?)
- **Final Check**: Total word count calculated after truncation; if still over 75 words:
  - Removes "Most clients save X%" clauses if present
  - Removes "Clients typically..." clauses if present
  - Trims trailing whitespace
- **Visual Structure**: Each section separated by double line breaks for scannable, text-message-like format

**Two-Question Requirement (MANDATORY):**
- **Question 1**: Must be in Opening Hook (15-20 words) - problem-awareness question
  - Example: "Noticed Cypress is navigating shifting rates in Leander. How are you handling that?"
- **Question 2**: Must be in CTA (8-12 words) - low-friction qualifying question
  - Example: "Is this something you're currently looking into?"
- **Auto-Fix Logic**: If only 1 question detected, system automatically converts first sentence after greeting to a question:
  - Extracts first sentence after greeting
  - Checks if it's a statement (no question mark)
  - Converts to question format:
    - If doesn't start with "how", "are you", or "when": Adds ERCOT context: "Given the recent volatility in ERCOT, how are you handling [first sentence]?"
    - Otherwise: Simply adds question mark: "[first sentence]?"
  - Example: "Cypress is navigating shifting rates in Leander." → "Given the recent volatility in ERCOT, how are you handling Cypress navigating shifting rates in Leander?"
- **Validation**: Emails with 0 questions are rejected with error message. Emails with 1 question are allowed (warning only) for natural tone.
- **Logging**: Question count tracked in debug logs (`questionCount`, `questionsFound`)

### Content Sanitization (Post-Generation)

After receiving the AI response, `generate-scheduled-emails.js` applies sanitization:

1. **Greeting Enforcement**: Ensures first name only ("Hello Kurt," not "Hello Kurt Lacoste,")
2. **Closing Enforcement**: Always adds "Best regards, [SenderFirstName]" if missing
3. **Phrase Removal**: Removes "I noticed", "I saw", "Quick question,", "Real question,", "Out of curiosity," (note: "Quick question that might be off base" is allowed as a specific variation, but generic "Quick question" is removed. No em dashes used)
4. **Percentage Normalization**: Converts "15-20%", "15-25%" → "10-20%"
5. **Industry Placeholder Fix**: Replaces "Default companies" → "companies like yours"
6. **Nonprofit Phrasing Fix**: Replaces "nonprofit companies" → "organizations" (if industry is not nonprofit)
7. **Description Dumping Prevention**: Ensures company description is used as context, not copied verbatim
   - **Process**: Extracts only business type keywords (e.g., "contract manufacturing", "restaurant chain") instead of full sentences
   - **System Prompt Instructions**: Explicitly forbids copying description text verbatim
   - **Good vs Bad**: 
     - BAD: "Safety Vision is a leading provider of..." (copying description)
     - GOOD: "Most manufacturing companies I work with..." (using industry language)

**Note**: NEPQ validation runs BEFORE sanitization to catch and block non-compliant content early. Sanitization then cleans up any remaining issues in validated content.

### Em Dash Removal System

The system includes comprehensive em dash removal to ensure natural, professional email flow:

**Function**: `removeEmDashes(text)` in `api/generate-scheduled-emails.js` and `api/perplexity-email.js`

**Removal Patterns**:
- Em dashes (—) and en dashes (–) at end of phrases → replaced with comma or removed
- Compound adjectives with hyphens → converted to natural flow (e.g., "higher-than-expected" → "higher than expected")
- Specific compound patterns: "higher-than", "lower-than", "more-than", "less-than", "better-than", "worse-than", "longer-than", "shorter-than"
- Regular hyphenated words (e.g., "energy-intensive", "24/7") are preserved

**Application**:
- Applied to tone openers immediately after selection
- Applied to all email content before NEPQ validation
- Applied during content sanitization

### Dynamic Savings by Industry/Role

The system selects savings percentages dynamically based on recipient's industry and role category to provide concrete, role-appropriate value claims:

**Function**: `getDynamicSavingsRange(industry, roleCategory)` in `api/perplexity-email.js`

**Savings Matrix**:
- **Manufacturing**:
  - Finance: 15-25% (budget-focused, high impact)
  - Operations: 12-20% (efficiency-focused)
  - Executive: 10-20%
  - Default: 12-20%
- **Retail**:
  - Finance: 12-20%
  - Operations: 10-18%
  - Executive: 12-18%
  - Default: 10-18%
- **Healthcare**:
  - Finance: 10-15% (constrained budgets)
  - Operations: 8-12% (uptime priority over cost)
  - Executive: 10-15%
  - Default: 10-15%
- **Nonprofit**:
  - Finance: 8-15% (smaller margins but material)
  - Operations: 8-12%
  - Executive: 8-15%
  - Default: 8-15%
- **Hospitality**:
  - Finance: 12-18%
  - Operations: 10-15%
  - Executive: 12-18%
  - Default: 12-18%
- **Education**:
  - Finance: 10-15%
  - Operations: 8-12%
  - Executive: 10-15%
  - Default: 10-15%
- **Default** (all roles): 10-20%

**Role Category Detection**:
- Extracted from `recipient.title` or `recipient.job`
- Categories: `Finance`, `Operations`, `Executive`, `Default`
- Used to select appropriate savings range from matrix

**Integration**: Injected into system prompt as "TYPICAL SAVINGS FOR THEIR ROLE" section, providing concrete value claims instead of generic "10-20%" percentages. Example: "Companies in similar roles and industries (Manufacturing - Finance role) typically see 15-25% savings."

### Template Building

**HTML Mode** (`aiMode === 'html'`):
- Calls `buildColdEmailHtmlTemplate(outputData, recipient)`
- Creates branded HTML template with Power Choosers styling
- Includes: header, subject blurb, greeting, opening hook, value proposition, CTA button, signature
- Calls `buildTextVersionFromHtml(htmlContent)` for plain text version

**Standard Mode** (`aiMode === 'standard'`):
- Builds simple NEPQ-style HTML wrapper from JSON response
- Paragraphs wrapped in `<p>` tags with minimal styling
- No branded template, plain text formatting
- Subject line generated from angle-based variations

### Rate Limiting & Performance

- **Perplexity Tier 0**: 50 RPM (requests per minute)
- **Batch Processing**: 10 emails per batch with 12-second delays
- **Parallel Research**: All research queries run in parallel for speed
- **Caching**: Research results cached in Firestore to avoid duplicate API calls
- **Error Handling**: Failed generations marked with error status, retry logic for transient failures

### Preview Generation

**Sequence Builder Preview** (`scripts/pages/sequence-builder.js`):
- **Endpoint**: Uses `/api/generate-scheduled-emails` with `preview: true` parameter
- **Purpose**: Provides live preview of generated email before saving to sequence
- **Benefits**:
  - Uses exact same logic as production email generation (angle selection, AI call, NEPQ validation, sanitization)
  - Ensures preview accurately reflects final product
  - Shows NEPQ validation errors immediately if content doesn't comply
- **Flow**:
  1. User clicks "Generate Standard" button
  2. Calls `/api/generate-scheduled-emails` with `preview: true`
  3. Endpoint skips Firestore writes, returns generated content directly
  4. Preview displayed in UI with validation feedback
  5. User can adjust prompt and regenerate if needed
- **NEPQ Validation**: Preview shows validation errors if:
  - Forbidden phrases detected
  - Tone opener missing or invalid
  - Insufficient questions
  - High-friction CTA detected
  - Spammy subject line

### Validation & Quality Control

**Pre-Generation**:
- Validates email has required fields (contactId, aiPrompt, etc.)
- Checks scheduledSendTime is in valid range

**Post-Generation**:
- `validateGeneratedContent()` detects malformed AI responses:
  - AI asking for more information instead of generating
  - Unfilled placeholders (`[contact_first_name]`, etc.)
  - Content too short (< 50 characters)
  - Missing subject line
- Bad generations reset to `not_generated` for retry (max 3 attempts)

**NEPQ Validation** (in `generate-scheduled-emails.js`):
- **Purpose**: Enforces NEPQ (Neuro-Emotional Persuasion Questioning) methodology to ensure emails follow dialogue-based, problem-discovery approach rather than "Old Model" selling
- **Function**: `validateNepqContent(subject, text, toneOpener)` performs comprehensive validation:
  1. **Forbidden Phrases Detection**: Blocks salesy language:
     - "I saw/noticed/read/came across"
     - "Hope this email finds you well"
     - "Just following up"
     - "My name is"
     - "Wanted to reach out/introduce"
  2. **Tone Opener Validation** (Hybrid Approach - Option 3):
     - **Pattern-Based Detection**: Uses `hasValidToneOpenerPattern()` to recognize conversational openers:
       - Checks for known openers: "Question for you", "So here's the thing", "Honestly", "Let me ask you something", etc.
       - Pattern matching: Recognizes conversational patterns (no em dash required - natural flow)
       - Searches first 100 characters after greeting
     - **Auto-Insertion Fallback**: Only if body is very short (< 20 chars):
       - Automatically inserts a simple conversational opener
       - Ensures proper paragraph spacing (`\n\n` after greeting)
       - Prevents double tone openers by checking for existing valid patterns first
     - **Flexibility**: AI can generate any conversational opener style (not mandatory to use system-provided one)
     - **No Errors**: Missing tone opener does not cause validation errors (optional but recommended)
     - **Variation Encouraged**: System encourages varying openers across emails to avoid template sameness
  3. **Question Count Requirement**: 
     - **MANDATORY**: Requires exactly 2 questions (problem-awareness + low-friction CTA)
     - **Question 1**: Must be in the Opening Hook (15-20 words) - asks about a specific challenge/problem
     - **Question 2**: Must be in the CTA (8-12 words) - simple qualifying question
     - Counts question marks in email body
     - **Auto-Fix**: If only 1 question is found, system automatically converts first sentence after greeting to a question by adding "How are you handling" prefix or converting statement to question format
     - **Rejection**: Emails with fewer than 2 questions are rejected with error: "Email must include at least two questions (problem-awareness + low-friction CTA)."
  4. **CTA Friction Check**: 
     - Blocks high-friction CTAs (scheduling asks):
       - "15 minutes", "30 minutes"
       - "Schedule a call/meeting"
       - "Book a call/meeting"
     - Requires low-friction qualifying questions instead
  5. **Subject Spamminess Check**: 
     - Blocks pitchy words: "save", "free", "% off", "deal"
     - Ensures subject lines are conversational, not promotional
- **Result**: 
  - Returns `{ isValid, reason, modifiedBody }`
  - If invalid: Email generation is blocked, error returned to user
  - If valid but modified: Returns modified body with auto-inserted tone opener and proper spacing
- **Integration**: 
  - Called after AI generation, before content sanitization
  - Blocks non-compliant emails from being saved
  - Provides immediate feedback in sequence builder preview

**Pre-Send** (in `send-scheduled-emails.js`):
- `validateEmailBeforeSending()` provides safety net
- Blocks bad emails from being sent
- Resets for regeneration if issues detected

---

### Phase 4: Email Approval

1. **User reviews email** in `emails-redesigned.js`:
   - Sees email with status `pending_approval`
   - Can edit subject/content if needed
   - Clicks "Approve" → Status changes to `approved`

### Phase 5: Email Sending

1. **Cron job calls `/api/send-scheduled-emails`** (every few minutes):
   - Queries `emails` collection:
     - `type == 'scheduled'`
     - `status == 'approved'`
     - `scheduledSendTime <= now`
     - Limit: 50 emails per run
   - For each email:
     - Uses transaction to claim email (idempotency):
       - Checks if status is still `approved`
       - Changes status: `approved` → `sending`
     - Sends via Gmail API:
       - Uses `GmailService` class with domain-wide delegation
       - Automatically looks up sender name/email from Firestore user profile (using `ownerId`)
       - **Signature Addition**: Fetches user signature from Firestore `settings` collection:
         - If `emailSignature.customHtmlEnabled` is true: Uses premium HTML signature with profile data
         - Otherwise: Includes text signature (from `emailSignature.text`) + image (from `emailSignature.image`) if enabled
         - Appends to both HTML and plain text versions
         - Respects `emailSettings.content.includeSignature` flag (per-step setting)
       - **Pre-send Validation**: Validates email content before sending:
         - Detects malformed AI generations (AI asking for more information, unfilled placeholders)
         - Blocks bad emails from being sent and resets them for regeneration
         - Logs blocked emails with reasons for debugging
       - Includes both HTML and plain text versions (multipart email)
       - Sets thread tracking (threadId, inReplyTo, references) for conversation threading
     - Updates email:
       - Status: `sending` → `sent`
       - Sets `sentAt`, `gmailMessageId`, `messageId`
       - Sets `provider: 'gmail'` for tracking
    - **Creates Next Step (Email or Task)**:
      - If `sequenceId` and `stepIndex` exist:
        - Loads sequence from Firestore
        - Finds next non-paused step after current `stepIndex`
        - If next step is an email (`auto-email`):
          - Calculates `nextScheduledSendTime = now + (delayMinutes * 60 * 1000)`
          - Creates new email document:
            - Status: `not_generated`
            - `stepIndex`: next step index
            - `scheduledSendTime`: calculated time
            - Includes all metadata (aiMode, aiPrompt, etc.)
          - This email will be generated in Phase 3
        - If next step is a task (`phone-call`, `li-connect`, `li-message`, `li-view-profile`, `li-interact-post`, `task`):
          - Calculates due time based on cumulative delays
          - Creates task document in `tasks` collection:
            - Status: `pending`
            - `stepIndex`: next step index
            - `isSequenceTask: true`
            - Includes all metadata (title, contact, account, priority, etc.)
          - Task appears immediately in Tasks page

2. **Repeat Phases 3-5** for each step until sequence completes

---

## Progressive Task Creation System

### Overview

The Sequence Machine supports **progressive task creation** - tasks are created one at a time as each step completes, not all at once. This keeps the tasks list clean and organized, showing users only what they need to do next.

### Supported Task Types

- `phone-call` - Call the contact
- `li-connect` - Connect on LinkedIn
- `li-message` - Send LinkedIn message
- `li-view-profile` - View LinkedIn profile
- `li-interact-post` - Interact with LinkedIn post
- `task` - Generic task

### How It Works

#### Phase 1: Sequence Activation (First Task Creation)

When a sequence is activated via `/api/process-sequence-activations`:

1. **Creates first email** (if sequence starts with email)
2. **Creates first task** (if sequence starts with task step):
   - Finds first non-paused task-type step
   - Calculates due time based on cumulative delays
   - Creates task in Firestore `tasks` collection
   - Marks with `isSequenceTask: true`

#### Phase 2: Task Completion (Next Step Creation)

When a user completes a sequence task in `scripts/pages/tasks.js`:

1. **Task marked complete**:
   - User clicks "Complete" button
   - Task removed from state, localStorage, and Firestore
   
2. **API call to `/api/complete-sequence-task`**:
   - Sends `{ taskId: "task-xxx" }`
   - API loads the task to get sequence info
   
3. **Next step determined**:
   - Loads sequence from Firestore
   - Finds next non-paused step after current `stepIndex`
   - Calculates due time based on step delay
   
4. **Next step created**:
   - **If next step is email**: Creates email in `emails` collection (status: `not_generated`)
   - **If next step is task**: Creates task in `tasks` collection
   - **If no more steps**: Sequence complete

5. **UI updates**:
   - If next step is task: Tasks page auto-reloads to show new task
   - If next step is email: Email appears in Emails page

### Task Data Structure

```javascript
{
  id: "task-1234567890-abc123",
  title: "Call contact",  // Or custom title from step settings
  contact: "John Doe",
  contactId: "contact-123",
  account: "Acme Corp",
  type: "phone-call",  // or linkedin-connect, etc.
  priority: "normal",  // from step.data.priority
  dueDate: "11/20/2025",  // Calculated from delays
  dueTime: "2:30 PM",
  dueTimestamp: 1732137000000,  // Unix timestamp
  status: "pending",
  sequenceId: "seq-1234567890",
  sequenceName: "Cold Outreach Sequence",
  stepId: "step-abc",
  stepIndex: 2,  // Which step in sequence
  isSequenceTask: true,  // Flag for identification
  notes: "Follow up on email",  // from step.data.note
  ownerId: "user@example.com",
  assignedTo: "user@example.com",
  createdBy: "user@example.com",
  createdAt: Timestamp,
  backfilled: false  // true if created via backfill script
}
```

### Example Flow

**Sequence with phone call:**
```
Step 0: Auto email (0 min delay) → Email created
Step 1: Phone call (60 min delay) → Task created after email sent
Step 2: Follow-up email (1440 min delay) → Email created after task completed
```

**Timeline:**
1. **Now**: Email created for Step 0, status: `not_generated`
2. **5 min later**: Email generated, status: `pending_approval`
3. **User approves**: Status: `approved`
4. **Cron job sends**: Email sent, Step 1 task created (due in 60 min)
5. **60 min later**: Phone call task visible in tasks list
6. **User completes call**: Task removed, Step 2 email created
7. **Follow-up email flow**: Same as Step 0

### Benefits

✅ **Clean UI**: Only shows next task, not all future tasks
✅ **Proper Timing**: Tasks appear exactly when due
✅ **Flexible**: Handles both email and task steps
✅ **Automatic**: No manual intervention needed
✅ **Progressive**: Mirrors email system behavior

---

## API Endpoints

### `/api/process-sequence-activations`

**Purpose**: Processes sequence activations and creates first step emails

**Method**: POST

**Request Body**:
```javascript
{
  immediate: true,  // Process immediately (not cron)
  activationId: "activation-123"  // Optional: specific activation to process
}
```

**Response**:
```javascript
{
  success: true,
  count: 1,  // Number of activations processed
  errors: 0,
  errorDetails: []
}
```

**What it does**:
1. Finds pending or stale processing activations
2. For each activation:
   - Loads sequence and contacts
   - Creates email documents for first auto-email step only
   - Updates activation progress

**Rate Limits**: None (but processes in batches of 25 contacts)

---

### `/api/generate-scheduled-emails`

**Purpose**: Generates email content using AI for pending emails (or preview mode for sequence builder)

**Method**: POST

**Request Body**:
```javascript
{
  immediate: true,  // Generate immediately (not cron)
  preview: true,    // Optional: Preview mode (skips Firestore writes, returns content directly)
  emailData: {      // Required for preview mode
    contactId: "contact-123",
    aiPrompt: "Write a cold introduction email...",
    aiMode: "html",  // or "standard"
    // ... other email settings
  },
  recipient: {       // Required for preview mode
    firstName: "John",
    company: "Acme Corp",
    // ... contact/account data
  }
}
```

**Response** (Normal Mode):
```javascript
{
  success: true,
  count: 5,  // Number of emails generated
  errors: 0,
  errorDetails: []
}
```

**Response** (Preview Mode):
```javascript
{
  success: true,
  preview: true,
  content: {
    subject: "John, when does your contract expire?",
    html: "<html>...</html>",
    text: "Plain text version...",
    angle_used: "timing_strategy",
    tone_opener: "Question for you"  // Optional - AI can use this or choose natural variation
  },
  validation: {
    isValid: true,
    errors: []  // Empty if valid, contains error messages if invalid
  }
}
```

**What it does**:
1. **Normal Mode** (`preview: false` or omitted):
   - Finds emails with `status == 'not_generated'` and `scheduledSendTime` in range
   - For each email:
   - Loads contact and account data
   - **Industry Detection**: Prioritizes CRM `industry` field, falls back to inference
   - **Angle Selection**: Selects randomized angle and tone opener based on industry
   - **AI Generation**: Calls `/api/perplexity-email` with:
     - `mode`: `'html'` or `'standard'` (from `emailData.aiMode`)
     - `templateType`: `'cold_email'` (only for HTML mode)
     - `selectedAngle` (injected as critical instruction) and `toneOpener` (provided as INSPIRATION with creative freedom)
     - **NEPQ Validation**: Validates content against NEPQ rules (forbidden phrases, tone opener, questions, CTA friction, subject spamminess)
   - **Content Sanitization**: Removes unwanted phrases, normalizes percentages (10-20%), fixes industry phrasing
   - **Template Building**: 
     - HTML mode: Branded template via `buildColdEmailHtmlTemplate()`
     - Standard mode: Simple NEPQ-style HTML wrapper
   - Updates email with generated content
   - Changes status to `pending_approval`
   - Stores `angle_used`, `tone_opener` for analytics

2. **Preview Mode** (`preview: true`):
   - Uses same generation logic as normal mode
   - **Skips Firestore writes**: Does not create or update email documents
   - **Returns content directly**: Returns generated email content with validation results
   - **Used by**: Sequence builder for live preview generation
   - **Benefits**: 
     - Preview uses exact same logic as production (angle selection, AI call, NEPQ validation, sanitization)
     - Shows validation errors immediately if content doesn't comply
     - Ensures preview accurately reflects final product

**Rate Limits**: 
- Perplexity Tier 0: 50 RPM
- Processes in batches of 10 with 12-second delays

---

### `/api/send-scheduled-emails`

**Purpose**: Sends approved emails and creates next step emails

**Method**: POST

**Request Body**: None (called by cron)

**Response**:
```javascript
{
  success: true,
  count: 3,  // Number of emails sent
  errors: 0,
  errorDetails: []
}
```

**What it does**:
1. Finds emails with `status == 'approved'` and `scheduledSendTime <= now`
2. For each email:
   - Claims email using transaction (idempotency)
   - Fetches user signature from Firestore settings (if enabled)
   - Appends signature (HTML + plain text) to email content
   - Sends via Gmail API using `GmailService`:
     - Uses service account with domain-wide delegation
     - Automatically resolves sender name/email from user profile
     - Sends multipart email (HTML + plain text)
     - Includes thread tracking for conversation threading
   - Updates status to `sent`
   - Sets `gmailMessageId`, `provider: 'gmail'`
   - Creates next step email if sequence continues

**Rate Limits**: 
- Gmail API: 1 billion quota units/day (very high limit)
- Processes max 50 emails per run

---

### `/api/email/track/{emailId}`

**Purpose**: Email open tracking pixel endpoint (replaces SendGrid tracking)

**Method**: GET

**URL Parameters**:
- `emailId`: Firestore document ID of the email (required)
- `r`: Random cache-buster parameter (optional, prevents email client caching)

**Response**: 
- **Content-Type**: `image/png`
- **Body**: 1x1 transparent PNG pixel (43 bytes)
- **Headers**: `Cache-Control: no-store, no-cache, must-revalidate` (prevents caching)

**What it does**:
1. Receives request when email client loads the tracking pixel (email opened)
2. Records open event in Firestore `emails` collection:
   - Increments `openCount`
   - Adds event to `opens[]` array with: `openedAt`, `userAgent`, `ip` (masked), `deviceType`, `referer`
   - Updates `lastOpened` timestamp
3. **Deduplication**: Ignores opens from same user/IP within 5-second window
4. **Device Detection**: Automatically detects desktop/mobile/tablet/bot from user agent
5. **Bot Filtering**: Detects Gmail Image Proxy and other bots (marked but still recorded)
6. Always returns pixel (even if tracking fails) to prevent broken images

**Production Logging**: Uses `logger.debug()` - only logs in development, not production (reduces Cloud Run costs)

---

### `/api/email/click/{emailId}`

**Purpose**: Email click tracking endpoint (replaces SendGrid click tracking)

**Method**: GET

**URL Parameters**:
- `emailId`: Firestore document ID of the email (required)
- `url`: Original destination URL (URL-encoded, required)
- `idx`: Link index in email (optional, for analytics)

**Response**: 
- **Status**: 302 (Temporary Redirect)
- **Location**: Original destination URL
- **Headers**: `Cache-Control: no-cache` (allows repeat tracking)

**What it does**:
1. Receives request when recipient clicks a tracked link
2. Records click event in Firestore `emails` collection:
   - Increments `clickCount`
   - Adds event to `clicks[]` array with: `clickedAt`, `url`, `linkIndex`, `userAgent`, `ip` (masked), `deviceType`, `referer`
   - Updates `lastClicked` timestamp
3. Redirects (302) to original URL after recording
4. Always redirects (even if tracking fails) to ensure links work

**Production Logging**: Uses `logger.debug()` - only logs in development, not production (reduces Cloud Run costs)

**Note**: Links are automatically wrapped with tracking URLs by `injectTracking()` function in `api/email/tracking-helper.js`

---

### `/api/complete-sequence-task`

**Purpose**: Handles task completion and creates the next sequence step (task or email)

**Method**: POST

**Request Body**:
```javascript
{
  taskId: "task-1234567890-abc123"
}
```

**Response**:
```javascript
{
  success: true,
  nextStepType: "task",  // or "email"
  taskId: "task-new-123",  // if task created
  emailId: "email-new-123",  // if email created
  scheduledTime: 1732140600000,  // when next step is due
  message: "Next step created"
}
```

**What it does**:
1. Loads the completed task from Firestore
2. Checks if it's a sequence task (`isSequenceTask: true`)
3. Loads the sequence to find next non-paused step
4. Calculates due time: `now + (step.delayMinutes * 60 * 1000)`
5. Creates next step:
   - **If task**: Creates in `tasks` collection
   - **If email**: Creates in `emails` collection (status: `not_generated`)
6. Returns info about created step

**Called by**: `scripts/pages/tasks.js` when user completes a task

---

### `/api/backfill-sequence-tasks`

**Purpose**: Backfills missing tasks for existing sequence members (one-time use after deploying progressive task system)

**Method**: POST

**Request Body**:
```javascript
{
  dryRun: true,  // Preview without creating
  forceCreate: false  // Force create even if email records missing
}
```

**Response**:
```javascript
{
  success: true,
  dryRun: true,
  tasksToCreate: 15,
  skipped: 3,
  skippedReasons: [
    {
      memberId: "member-123",
      contactId: "contact-456",
      sequenceId: "seq-789",
      reason: "Task already exists"
    }
  ],
  message: "Dry run complete. Would create 15 tasks."
}
```

**What it does**:
1. **Normal mode** (`forceCreate: false`):
   - Gets all sequence members
   - Gets all emails to determine current progress
   - For each member, finds highest sent email step
   - Creates task for next task-type step if needed
   - Skips if task already exists or waiting for email step

2. **Force mode** (`forceCreate: true`):
   - For members with NO email records:
     - Assumes all leading email steps were sent (outside system)
     - Creates task for first task-type step
   - Useful for backfilling sequences activated before email tracking was implemented

**Skip Reasons**:
- `"Task already exists"` - Task was already created
- `"No pending task steps"` - Sequence complete or only has email steps
- `"Waiting for email step X"` - Next step is email that needs to be created
- `"Contact not found"` - Contact was deleted
- `"Sequence not found"` - Sequence was deleted

**Usage**:
```bash
# Dry run to preview
curl -X POST http://localhost:3000/api/backfill-sequence-tasks \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Actual run
curl -X POST http://localhost:3000/api/backfill-sequence-tasks \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Force mode for sequences with missing email records
curl -X POST http://localhost:3000/api/backfill-sequence-tasks \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "forceCreate": true}'
```

---

## Testing Guide

### Test 1: Create and Start Sequence

1. **Create a test sequence**:
   - Go to Sequence Builder
   - Create new sequence: "Test Sequence"
   - Add first step: Auto-email, delay 0 minutes
   - Add second step: Auto-email, delay 5 minutes (for quick testing)
   - Save sequence

2. **Add a test contact** (multiple methods):
   - **Method 1: From Sequence Builder**:
     - Use search bar to find and add contact
     - Click "Sequence Contacts" button to view all contacts
     - Verify contact appears in modal
   - **Method 2: From List Detail Page**:
     - Go to a list with contacts
     - Select one or more contacts
     - Click "Add to sequence" in bulk actions bar
     - Select sequence from dropdown
     - If contacts without emails, verify email validation modal appears
     - Verify progress toast shows 3-step process
   - **Method 3: From Contact Detail Page**:
     - Open a contact detail page
     - Click "Add to Sequence" button
     - Select sequence from dropdown
     - If contact has no email, verify confirmation dialog
   - Ensure contact has valid email address and company name (for industry detection)

3. **Start sequence**:
   - **Manual start**: Click "Start Sequence" button in sequence builder
   - **Auto-start**: If sequence already has active members, adding new contacts automatically creates activations
   - Check console for: `[SequenceBuilder] Created sequenceActivation: ...` or `[ListDetail] Created auto-sequenceActivation: ...`
   - Check Firestore:
     - `sequenceMembers` collection should have document with `hasEmail` and `skipEmailSteps` flags
     - `sequenceActivations` collection should have new document with `status: 'pending'`
     - Should immediately change to `status: 'processing'` then `'completed'`
     - `emails` collection should have new email with:
       - `status: 'not_generated'`
       - `stepIndex: 0`
       - `scheduledSendTime`: should be near current time (delay 0)

### Test 2: Generate Email Content

1. **Trigger generation**:
   - Go to Emails page
   - Click "Generate Now" button
   - OR wait for cron job (if configured)

2. **Check results**:
   - Check console for: `[GenerateScheduledEmails] Generated email: ...`
   - Check Firestore `emails` collection:
     - Email status should be `pending_approval`
     - `subject`, `html`, `text` should be populated
     - `generatedAt` should be set
     - `angle_used` should be set (e.g., "timing_strategy")
   - View email in Emails page:
     - Should show generated subject and preview
     - Should show "Pending Approval" status

3. **Verify industry detection**:
   - Check console logs for: `Selected angle: timing_strategy, industry: Manufacturing`
   - If company name contains "Hotel", "Restaurant", etc., should detect correct industry

### Test 3: Approve and Send Email

1. **Approve email**:
   - Go to Emails page
   - Find email with status "Pending Approval"
   - Click "Approve"
   - Check Firestore: status should be `approved`

2. **Trigger sending**:
   - Wait for cron job OR manually call `/api/send-scheduled-emails`
   - Check console for: `[SendScheduledEmails] Email sent successfully: ...`

3. **Check results**:
   - Check Firestore `emails` collection:
     - Email status should be `sent`
     - `sentAt` should be set
     - `gmailMessageId` and `messageId` should be set
     - `provider` should be `'gmail'`
   - **Check for next step email**:
     - Should see new email document with:
       - `status: 'not_generated'`
       - `stepIndex: 1` (next step)
       - `scheduledSendTime`: should be 5 minutes from now (if delay was 5 minutes)

### Test 4: Full Sequence Flow

1. **Create 3-step sequence**:
   - Step 1: Auto-email, delay 0 minutes
   - Step 2: Auto-email, delay 2 minutes
   - Step 3: Auto-email, delay 2 minutes

2. **Start sequence** for test contact (can use any entry point)

3. **Generate Step 1**:
   - Click "Generate Now"
   - Approve email
   - Wait for send (or trigger manually)

4. **Verify Step 2 created**:
   - Check Firestore: should see email with `stepIndex: 1`
   - `scheduledSendTime` should be ~2 minutes from Step 1 send time

5. **Generate Step 2**:
   - Wait 2 minutes OR manually trigger generation
   - Approve and send

6. **Verify Step 3 created**:
   - Check Firestore: should see email with `stepIndex: 2`
   - `scheduledSendTime` should be ~2 minutes from Step 2 send time

7. **Complete sequence**:
   - Generate, approve, and send Step 3
   - No new emails should be created (sequence complete)

### Test 5: Bulk Operations and Progress Toast

1. **Test bulk removal from sequence**:
   - Go to Sequence Builder
   - Open "Sequence Contacts" modal
   - Select multiple contacts using checkboxes
   - Click "Remove from sequence"
   - Verify progress toast appears: "Removing X contacts from sequence..."
   - Verify progress updates after each removal
   - Verify completion message with checkmark

2. **Test bulk add from list**:
   - Go to List Detail page
   - Select multiple contacts
   - Click "Add to sequence" in bulk actions bar
   - Select sequence
   - Verify email validation modal if contacts without emails
   - Verify progress toast with 3-step process
   - Verify completion message shows added count

3. **Test auto-start**:
   - Add contacts to an already-active sequence (one that has sent emails)
   - Verify that `sequenceActivations` are automatically created
   - Verify that emails are created without manual "Start Sequence" click
   - Check console for: `[ListDetail] Sequence is active, auto-starting for X new contacts`

---

## Common Issues & Troubleshooting

### Issue 1: Emails Not Being Created

**Symptoms**: Sequence activation completes but no emails in `emails` collection

**Check**:
1. Check `sequenceActivations` document:
   - Is `status: 'completed'`?
   - Is `progress.emailsCreated > 0`?
   - Are there `failedContactIds`? (contacts without email addresses)

2. Check sequence:
   - Does sequence have at least one `auto-email` step?
   - Are step types correct? (should be `'auto-email'`, not `'email'`)

3. Check console logs:
   - Look for: `[ProcessSequenceActivations] No auto-email steps found`
   - Look for: `[ProcessSequenceActivations] Failed to load contact`

**Fix**:
- Ensure contacts have valid email addresses
- Ensure sequence has `auto-email` steps (not just `phone-call` or `task`)

---

### Issue 2: Emails Not Being Generated

**Symptoms**: Emails exist with `status: 'not_generated'` but content not generated

**Check**:
1. Check email `scheduledSendTime`:
   - Is it in the future? (generation only processes emails scheduled for today or immediate)
   - For immediate generation: should be `>= now - 1 minute`

2. Check API endpoint:
   - Is `/api/generate-scheduled-emails` being called?
   - Check console for errors

3. Check Perplexity API:
   - Is `PERPLEXITY_API_KEY` set?
   - Check rate limits (50 RPM)

**Fix**:
- Manually trigger generation: Click "Generate Now" in Emails page
- Check `scheduledSendTime` - if far in future, generation won't process it
- Check API logs for Perplexity errors

---

### Issue 3: Emails Not Being Sent

**Symptoms**: Emails with `status: 'approved'` not being sent

**Check**:
1. Check `scheduledSendTime`:
   - Is it `<= now`? (emails only sent if time has passed)

2. Check Gmail API:
   - Is `GOOGLE_SERVICE_ACCOUNT_KEY` set?
   - Is domain-wide delegation configured in Google Workspace Admin?
   - Check Gmail API quota in Google Cloud Console
   - Verify service account has `gmail.send` scope

3. Check API endpoint:
   - Is `/api/send-scheduled-emails` being called by cron?
   - Check console for errors

**Fix**:
- Manually trigger sending: Call `/api/send-scheduled-emails` endpoint
- Check `scheduledSendTime` - if in future, wait or adjust time
- Verify `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable is set
- Check Google Workspace Admin for domain-wide delegation settings
- Verify service account email has `gmail.send` scope enabled

---

### Issue 4: Next Step Not Being Created (Email or Task)

**Symptoms**: Step 1 email sent but Step 2 (email or task) not created

**Check**:
1. Check sequence:
   - Does sequence have a Step 2?
   - Is Step 2 paused? (paused steps are skipped)
   - Is `stepIndex` correct in sent email?

2. Check `send-scheduled-emails.js` logs:
   - Look for: `[SendScheduledEmails] Created next step email` or `[SendScheduledEmails] Created next step task`
   - Check for errors in next step creation

3. Check Firestore:
   - For email steps: Look for new email with `stepIndex: 1` in `emails` collection
   - For task steps: Look for new task with `stepIndex: 1` and `isSequenceTask: true` in `tasks` collection
   - Check `scheduledSendTime` (for emails) or `dueTimestamp` (for tasks) calculation

**Fix**:
- Ensure sequence has next step and it's not paused
- For email steps: Ensure next step has `type: 'auto-email'`
- For task steps: Ensure next step has `type: 'phone-call'`, `'li-connect'`, etc.
- Check console logs for errors during next step creation
- Verify `delayMinutes` is set correctly on next step
- Check that tasks appear in Tasks page (may need to refresh)

---

### Issue 5: Wrong Industry Detected

**Symptoms**: Email uses wrong angle (e.g., tax exemption for non-exempt company, "Construction" identified as "Nonprofit")

**Check**:
1. Check account data (HIGHEST PRIORITY):
   - Does account have `industry` field set? (This is checked FIRST, before any inference)
   - Does account have `taxExemptStatus` field?

2. Check company name (FALLBACK):
   - Does company name contain industry keywords? (e.g., "Hotel", "Manufacturing")
   - Only used if CRM `industry` field is missing
   - Check `inferIndustryFromCompanyName()` function

3. Check account description (FALLBACK):
   - Does account have `shortDescription` or similar field?
   - Only used if both CRM industry and name inference fail
   - Check `inferIndustryFromDescription()` function

**Fix**:
- **Set `industry` field on account document** (This is the most reliable fix - CRM data is always prioritized)
- Update company name to include industry keywords (if CRM data unavailable)
- Update account description with industry context (if CRM data unavailable)
- Check angle selection logic in `selectRandomizedAngle()` - uses industry-weighted selection (certain angles favored per industry)
- Verify angle definitions in `api/_angle-definitions.js` have appropriate industry-specific hooks

**Note**: The system now prioritizes CRM `industry` data over all inference methods to prevent misclassification. Always set the `industry` field in the CRM for accurate angle selection. Industry-weighted selection is intentional - certain angles perform better for certain industries (e.g., Manufacturing favors `demand_efficiency`, Healthcare favors `exemption_recovery`).

---

### Issue 6: Malformed AI Generation (Meta-Response)

**Symptoms**: AI returns a "meta" response asking for more information instead of generating actual email content. Example output:
- "I appreciate the detailed personalization instructions, but I need to clarify..."
- "The issue: You've asked me to write a cold email, but you've provided placeholders..."
- Contains unfilled placeholders like `[contact_first_name]`, `[contact_company]`

**Root Cause**: Perplexity AI sometimes interprets the prompt as a request for clarification rather than generation

**Automatic Handling**:
1. **During Generation** (`generate-scheduled-emails.js`):
   - `validateGeneratedContent()` detects bad patterns
   - Email is reset to `status: 'not_generated'` for auto-retry
   - Max 3 retry attempts before marking as `generation_failed`
   - Logged with `generationFailureReason` for debugging

2. **Before Sending** (`send-scheduled-emails.js`):
   - `validateEmailBeforeSending()` provides safety net
   - Bad emails are blocked and reset for regeneration
   - Marked with `blockedFromSending: true` and `blockedReason`

**Detected Patterns**:
- "I appreciate the detailed personalization"
- "I need to clarify" / "What I need to proceed"
- "Please share the recipient" / "Once you provide these details"
- Unfilled placeholders: `[contact_first_name]`, `[contact_company]`, etc.
- Content shorter than 50 characters
- Missing subject line

**Manual Resolution**:
- Check emails with `status: 'generation_failed'` in Firestore
- Update `status` back to `not_generated` and reset `generationAttempts` to retry
- Or manually edit the email content and approve

---

### Issue 7: Email Content Quality Issues

**Symptoms**: Generated emails don't match expected tone/format, contain unwanted phrases, wrong percentages, or don't use selected angle

**Check**:
1. Check angle selection and enforcement:
   - Is correct angle being selected? (check `angle_used` field in email document)
   - Is industry-weighted selection working? (certain angles favored per industry - this is intentional)
   - Are industry-specific openers being used? (check for observable pain in opening hook)
   - Is role-based CTA being used? (check CTA matches recipient role - CEO, CFO, Operations, etc.)
   - Is `tone_opener` being used? (check `tone_opener` field)
   - **Note**: Angles are **injected as critical instructions** into the AI prompt to ensure they are actually used. Industry-specific openers and role-based CTAs come from `api/_angle-definitions.js`. Tone openers are provided as **INSPIRATION** (stylistic guide) with creative freedom - AI should match the style but not default to "Quick question".

2. Check content sanitization:
   - Are unwanted phrases appearing? ("I noticed", "I saw", "Quick question," - note: "Quick question that might be off base" is allowed as a specific variation, but generic "Quick question" is removed. No em dashes used)
   - Are percentages correct? (Should be "10-20%", not "15-25%")
   - Are industry placeholders appearing? ("Default companies" should be replaced)
   - Check `/api/perplexity-email` sanitization functions

3. Check prompt:
   - Is `aiPrompt` correct in sequence step?
   - Is prompt being passed to `/api/perplexity-email`?
   - Are `selectedAngle` and `toneOpener` being passed?

4. Check template building:
   - Is `buildColdEmailHtmlTemplate()` being called? (HTML mode)
   - Is simple HTML wrapper being built? (Standard mode)
   - Are HTML templates matching preview?

5. Check AI mode:
   - Is `aiMode` set correctly in sequence step? (`'html'` or `'standard'`)
   - Is `aiMode` preserved on email document?

**Fix**:
- Update `aiPrompt` in sequence step
- Check `/api/perplexity-email` prompt generation and sanitization
- Verify template building functions match preview logic
- Ensure `aiMode` is set correctly in sequence step
- Check that `selectedAngle` and `toneOpener` are being passed to `/api/perplexity-email`

**Note**: The system now includes automatic content sanitization to remove unwanted phrases, normalize percentages to "10-20%", and fix industry-specific phrasing. Angles are enforced via prompt injection as critical instructions. Tone openers are provided as INSPIRATION (stylistic guide) with creative freedom - AI should match the style but explicitly forbids defaulting to "Quick question" every time.

---

### Issue 8: Email Tracking Badges Not Showing (Opens/Clicks)

**Symptoms**: Sequence emails don't show "read" (eye icon) or "click" (hand icon) badges in the Actions column of the Emails page, even though the email was opened/clicked

**Root Cause**: 
The UI logic in `emails-redesigned.js` was only showing tracking badges for emails with `type === 'sent'` or `isSentEmail === true`. However, sequence emails often retain the `type: 'scheduled'` classification in the local UI state even after being sent, especially:
- Before a full page refresh
- When the type update from `send-scheduled-emails.js` hasn't propagated to the UI yet
- When viewing emails in real-time as they're being sent

This created a timing issue where:
1. Email is sent → type updates to 'sent' in Firestore
2. Email tracking updates → `openCount` and `clickCount` update in Firestore (Gmail API doesn't have webhooks, tracking uses other methods)
3. UI shows email with stale `type: 'scheduled'` → badges hidden because type check fails
4. Only after refresh would badges appear (once type syncs to 'sent')

**Check**:
1. Send a sequence email and open it
2. Check Firestore `emails` collection:
   - Does the email have `openCount > 0` or `clickCount > 0`?
   - What is the `type` field? (`'scheduled'` or `'sent'`)
   - Does it have `contactName` populated?
3. Check the Emails page:
   - Are the eye icon (opens) and hand icon (clicks) showing in the Actions column?
   - Do the badges show the correct counts?
4. Check browser console:
   - Look for: `[EmailTracking] Recorded open by trackingId: ...`
   - Look for notification: `"[Contact Name] opened '[Subject]'"`

**The Fix**:

**File**: `scripts/pages/emails-redesigned.js`

**Change**: Updated the tracking badge logic to include `type === 'scheduled'` emails:

```javascript
// Before (only showed badges for 'sent' emails)
const openCount = (email.isSentEmail || email.type === 'sent') ? (email.openCount || 0) : 0;
const clickCount = (email.isSentEmail || email.type === 'sent') ? (email.clickCount || 0) : 0;

// After (shows badges for 'scheduled' emails too)
const isSentEmail = email.isSentEmail || email.type === 'sent' || email.type === 'scheduled';
const openCount = (isSentEmail) ? (email.openCount || 0) : 0;
const clickCount = (isSentEmail) ? (email.clickCount || 0) : 0;
```

**Why This Works**:
- Sequence emails are created with `type: 'scheduled'`
- When sent, `send-scheduled-emails.js` updates the type to `'sent'`
- But the UI might still have the email cached as `'scheduled'`
- By checking for BOTH `'sent'` AND `'scheduled'` types, badges appear immediately when tracking data arrives, regardless of the local type state
- Works for both **opens** (eye icon) and **clicks** (hand icon)

**Notification Name Fix**:

**File**: `scripts/email-tracking.js`

**Issue**: Notifications were showing the email address (e.g., "l.patterson@example.com") instead of the contact name (e.g., "Lewis Patterson")

**Root Cause**: The notification logic was parsing the `to` field, which for sequence emails often contains just the raw email address without a formatted name like "Name <email@example.com>"

**Fix**: Updated `showEmailOpenNotification` and `showEmailClickNotification` to prioritize the `contactName` field:

```javascript
// Now checks contactName first (populated for sequence emails)
let recipient = emailData.contactName;

if (!recipient) {
    const to = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;
    recipient = to ? (to.includes('<') ? to.match(/<(.+)>/)?.[1] || to : to) : 'recipient';
}
```

**Result**:
- ✅ Read badges (opens) appear immediately when email is opened
- ✅ Click badges appear immediately when links are clicked
- ✅ Badge counts are accurate (`openCount`, `clickCount`)
- ✅ Works for sequence emails even if type is still 'scheduled' in UI
- ✅ Notifications show correct contact name instead of email address
- ✅ Both manual and sequence emails display tracking consistently

**Verification**:
1. Send a sequence email
2. Open the email (or click a link)
3. Check Emails page immediately (no refresh needed)
4. Eye icon should show with count badge
5. Hand icon should show with count badge for clicks
6. Notification should show: "[Contact Name] opened '[Subject]'"

---

## Manual Testing Commands

### Check Sequence Activation Status

```javascript
// In browser console
const db = window.firebaseDB;
const activationId = 'activation-1234567890'; // Replace with actual ID
const activationDoc = await db.collection('sequenceActivations').doc(activationId).get();
console.log('Activation:', activationDoc.data());
```

### Check Emails for Sequence

```javascript
// In browser console
const db = window.firebaseDB;
const sequenceId = 'seq-1234567890'; // Replace with actual ID
const emailsQuery = await db.collection('emails')
  .where('sequenceId', '==', sequenceId)
  .orderBy('createdAt', 'desc')
  .get();
emailsQuery.docs.forEach(doc => {
  const data = doc.data();
  console.log(`Email ${doc.id}:`, {
    status: data.status,
    stepIndex: data.stepIndex,
    scheduledSendTime: new Date(data.scheduledSendTime),
    subject: data.subject
  });
});
```

### Manually Trigger Generation

```javascript
// In browser console
const baseUrl = window.API_BASE_URL || window.location.origin;
const response = await fetch(`${baseUrl}/api/generate-scheduled-emails`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ immediate: true })
});
const result = await response.json();
console.log('Generation result:', result);
```

### Manually Trigger Sending

```javascript
// In browser console
const baseUrl = window.API_BASE_URL || window.location.origin;
const response = await fetch(`${baseUrl}/api/send-scheduled-emails`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
const result = await response.json();
console.log('Send result:', result);
```

### Manually Process Activation

```javascript
// In browser console
const baseUrl = window.API_BASE_URL || window.location.origin;
const activationId = 'activation-1234567890'; // Replace with actual ID
const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ immediate: true, activationId: activationId })
});
const result = await response.json();
console.log('Activation result:', result);
```

### Run Backfill Sequence Tasks

**Purpose**: Create tasks for contacts that already have emails sent in sequence steps (one-time backfill after deploying progressive task system).

**Option 1: Use the console script** (recommended):
```javascript
// Load the script first (if not already loaded)
// Then run:
await runBackfill({ dryRun: true });  // Preview what would be created
await runBackfill({ dryRun: false }); // Actually create tasks
await runBackfill({ dryRun: false, forceCreate: true }); // Force mode for missing email records
```

**Option 2: Direct API call**:
```javascript
// In browser console
const baseUrl = window.API_BASE_URL || window.location.origin;
const response = await fetch(`${baseUrl}/api/backfill-sequence-tasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    dryRun: true,  // Set to false to actually create tasks
    forceCreate: false  // Set to true to force create even if email records missing
  })
});
const result = await response.json();
console.log('Backfill result:', result);
```

**What it does**:
- Finds all sequence members
- Checks their current progress (based on sent emails)
- Creates the next task if they're waiting for one
- Skips tasks that already exist

**Response**:
```javascript
{
  success: true,
  dryRun: true,
  tasksToCreate: 15,
  skipped: 3,
  skippedReasons: [
    { memberId: "...", contactId: "...", sequenceId: "...", reason: "Task already exists" }
  ],
  message: "Dry run complete. Would create 15 tasks."
}
```

**Skip Reasons**:
- `"Task already exists"` - Task was already created
- `"No pending task steps"` - Sequence complete or only has email steps
- `"Waiting for email step X"` - Next step is email that needs to be created
- `"Contact not found"` - Contact was deleted
- `"Sequence not found"` - Sequence was deleted

---

## Gmail API Configuration

The system uses **Gmail API** for sending all sequence emails. This requires Google Cloud setup with domain-wide delegation.

### Required Setup

1. **Service Account**:
   - **Service Account Name**: `gmail-sender`
   - **Service Account Email**: `gmail-sender@power-choosers-crm.iam.gserviceaccount.com`
   - **Project ID**: `power-choosers-crm`
   - **Description**: "Gmail Sender Service Account for sending emails via Gmail API"
   - **Status**: Must be **Enabled** in Google Cloud Console
   - **Location**: Google Cloud Console → IAM & Admin → Service Accounts
   - **Key Format**: JSON key file containing:
     - `type`: `"service_account"`
     - `project_id`: `"power-choosers-crm"`
     - `private_key_id`: Unique identifier (e.g., `"0f540f0332de9c2b0a988f8f014797f48d435ce4"`)
     - `private_key`: RSA private key (PEM format)
     - `client_email`: `"gmail-sender@power-choosers-crm.iam.gserviceaccount.com"`
     - `client_id`: OAuth 2.0 client ID
     - `auth_uri`: `"https://accounts.google.com/o/oauth2/auth"`
     - `token_uri`: `"https://oauth2.googleapis.com/token"`
   - **Environment Variable**: 
     - Name: `GOOGLE_SERVICE_ACCOUNT_KEY`
     - Value: Base64-encoded JSON key (entire JSON file encoded as base64)
     - Set in Cloud Run service environment variables or `cloudbuild.yaml`

2. **Domain-Wide Delegation**:
   - **Location**: Google Workspace Admin Console
   - **Path**: Security → Access and data control → API controls → Manage Domain Wide Delegation
   - **Service Account Client ID**: Found in Google Cloud Console (IAM & Admin → Service Accounts → gmail-sender → Details)
   - **Required Scopes**:
     - `https://www.googleapis.com/auth/gmail.send` (required for sending emails)
     - `https://www.googleapis.com/auth/gmail.readonly` (optional, for inbox sync)
   - **How to Add**:
     1. Copy the Client ID from the service account details page
     2. In Google Workspace Admin, click "Add new"
     3. Paste the Client ID
     4. Add the scopes (one per line or comma-separated)
     5. Click "Authorize"

3. **User Profile Lookup**:
   - Sender name/email automatically resolved from Firestore `users` collection
   - Uses `ownerId` field from email document to look up user profile
   - **No manual configuration needed**: System automatically uses the correct sender for each email based on the `ownerId`
   - **Benefits**: No need to set environment variables per agent - all agents can send emails using their own Gmail accounts

4. **Verification**:
   - **Service Account Status**: Check Google Cloud Console → IAM & Admin → Service Accounts → `gmail-sender@power-choosers-crm.iam.gserviceaccount.com` → Should show "Enabled" status
   - **Domain-Wide Delegation**: Check Google Workspace Admin → Security → API controls → Should list the service account with authorized scopes
   - **Environment Variable**: Verify `GOOGLE_SERVICE_ACCOUNT_KEY` is set in Cloud Run service environment variables
   - **Test**: Send a test sequence email and verify it arrives from the correct sender

### Signature Configuration

User signatures are stored in Firestore `settings` collection with doc ID `user-settings` (admin) or `user-settings-{email}` (employees).

**Standard Signature Fields**:
- `emailSignature.text` - Plain text signature content
- `emailSignature.image` - Hosted image URL (Imgur)
- `emailSignature.imageSize` - `{ width, height }` for sizing

**Custom HTML Signature** (Premium):
- `emailSignature.customHtmlEnabled` - Toggle to use premium HTML signature
- When enabled, the system uses `buildCustomHtmlSignature()` which:
  - Uses profile data from `settings.general` (firstName, lastName, jobTitle, companyName, phone, email, location, linkedIn, hostedPhotoURL)
  - Generates email-client compatible HTML (table-based layout, inline styles)
  - Includes: Avatar, name, title, company, contact details, social links (LinkedIn, Website, Schedule)
  - **Spacing & Alignment**:
    - Reduced padding above orange separator: `margin-top: 8px; padding-top: 8px` (16px total, was 36px)
    - Icon/text alignment: Uses nested tables with `vertical-align: middle` for perfect centering
    - Consistent 8px gap between icon and text labels
  - Works in both regular emails (`email-compose-global.js`) and sequence emails (`send-scheduled-emails.js`)

**How to Enable Custom HTML Signature**:
1. Go to Settings → Email Signature section
2. Toggle "Use Premium HTML Signature" ON
3. Ensure your profile information is filled in (Settings → Profile Information)
4. Save settings
5. All new emails (regular and sequence) will use the premium signature

**Sequence Email Signature Behavior**:
- Automatically appended when `emailSettings.content.includeSignature` is enabled (default: true)
- Image signature respects `emailDeliverability.signatureImageEnabled` setting
- HTML template emails (with `<!DOCTYPE html>`) skip appending signature (they have built-in signatures)

---

## Cron Job Configuration

The system uses **Google Cloud Scheduler** to run three cron jobs automatically. All jobs run during business hours only (Monday-Friday, 8am-5pm CST) and use OIDC authentication with a service account.

### 1. `process-activations-cron`
- **Schedule**: Every 30 minutes (`*/30 8-17 * * 1-5`)
- **Endpoint**: `/api/process-sequence-activations`
- **Purpose**: Processes pending sequence activations and creates first step emails
- **Configuration**:
  - Time zone: `America/Chicago`
  - Attempt deadline: 600s (10 minutes)
  - Retry attempts: 3
  - HTTP method: POST

### 2. `generate-emails-cron`
- **Schedule**: Every 30 minutes (`*/30 8-17 * * 1-5`)
- **Endpoint**: `/api/generate-scheduled-emails`
- **Purpose**: Generates email content using AI for pending emails
- **Configuration**:
  - Time zone: `America/Chicago`
  - Attempt deadline: 600s (10 minutes)
  - Retry attempts: 3
  - HTTP method: POST

### 3. `send-scheduled-emails-cron`
- **Schedule**: Every 15 minutes (`*/15 8-17 * * 1-5`)
- **Endpoint**: `/api/send-scheduled-emails`
- **Purpose**: Sends approved emails that are ready and creates next step emails
- **Configuration**:
  - Time zone: `America/Chicago`
  - Attempt deadline: 300s (5 minutes)
  - Retry attempts: 3
  - HTTP method: POST

### Manual Testing
All endpoints can be called manually with `immediate: true` for testing, bypassing the scheduled cron jobs.

### Cloud Scheduler Setup
The cron jobs are configured in Google Cloud Scheduler with:
- **Location**: `us-central1`
- **Authentication**: OIDC service account (`cloud-scheduler-invoker@PROJECT_ID.iam.gserviceaccount.com`)
- **Token audience**: Set to the Cloud Run service URL

**Note**: The `vercel.json` cron configuration (`/api/email/automation-cron`) is separate and used for different automation tasks, not for sequence machine operations.

---

## Key Functions Reference

### Centralized Angle Definitions System

The system uses a centralized angle definitions module (`api/_angle-definitions.js`) that provides:

- **Industry-Specific Opening Hooks**: Each angle has industry-specific hooks with observable pain points
  - Manufacturing: "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+"
  - Healthcare: "Quick observation: most hospitals we work with overpay 15-20% on demand charges..."
  - Retail: "Quick question: are your energy peaks aligned with shopping hours, or are you paying demand charges for times you don't actually spike?"
  - And more for each industry (DataCenter, Hospitality, Nonprofit, Education, Government, Logistics)
- **Industry-Specific Proof Points**: Social proof tailored to industry (e.g., "70% of manufacturing ops we audit find 15-25% savings")
- **Role-Based CTAs**: High-friction CTAs tailored to recipient role:
  - CEO: "Are you aware how much of your margin is hidden in misaligned energy rates?"
  - CFO: "When was the last time someone audited your demand charges? (Most CFOs we talk to are shocked by what they find.)"
  - Operations: "How are you optimizing consumption before renewal without impacting production?"
  - Controller: "Are you optimizing all available rate reductions before contract renewal?"
  - Facilities: "Do you have visibility into which hours are driving your demand charges?"
- **Available Angles**: `demand_efficiency`, `exemption_recovery`, `consolidation`, `timing_strategy`, `budget_stability`, `operational_simplicity`
- **Helper Functions**: `getAngleById()`, `getIndustryOpener()`, `getRoleCta()`, `getIndustryProof()`

### `selectRandomizedAngle(industry, manualAngleOverride, accountData, usedAngles)`
- Selects email angle using industry-weighted selection from centralized angle definitions
- **Source**: Uses `ANGLE_IDS` and `getAngleById()` from `api/_angle-definitions.js`
- **Industry-Weighted Selection**: Certain angles perform better for certain industries:
  - Manufacturing: `demand_efficiency` (weight 3), `consolidation` (2), `timing_strategy` (2)
  - Healthcare: `exemption_recovery` (weight 3), `demand_efficiency` (2.5), `consolidation` (2)
  - Education: `exemption_recovery` (weight 3), `demand_efficiency` (2)
  - Retail: `consolidation` (weight 3), `demand_efficiency` (2)
  - Nonprofit: `exemption_recovery` (weight 3), `consolidation` (2)
  - DataCenter: `demand_efficiency` (weight 3), `consolidation` (2)
  - Logistics: `consolidation` (weight 2.5), `demand_efficiency` (1.5)
  - Default: Balanced weights for all angles
- **Industry Priority**: Uses CRM `industry` field first (from `accountData.industry` or `recipient.industry`)
- Returns angle object with:
  - `id`: angle identifier (e.g., 'timing_strategy', 'exemption_recovery', 'demand_efficiency')
  - `label`: human-readable angle name (e.g., 'Peak Demand Optimization')
  - `primaryMessage`: angle focus description
  - `openingTemplate`: industry-specific opening hook (function that takes company name, returns string with observable pain)
  - `industryContext`: normalized industry name
  - `proof`: industry-specific proof point from `getIndustryProof()`
- Avoids repeating recently used angles (via `usedAngles` parameter)
- Preserves manual override functionality (if `manualAngleOverride` provided, returns that angle)
- Applies news hook boosts if `ACTIVE_NEWS_HOOKS` exist
- Falls back to `Default` industry if no match
- **Note**: Industry should come from CRM data (prioritized) rather than inference for best results


### `inferIndustryFromCompanyName(companyName)`
- Detects industry from company name keywords
- Returns industry string (e.g., "Manufacturing", "Hospitality")

### `inferIndustryFromDescription(description)`
- Detects industry from account description keywords
- Returns industry string

### `buildColdEmailHtmlTemplate(data, recipient)`
- Builds HTML email template from structured JSON
- Matches preview format in sequence-builder.js
- Returns HTML string

### `buildTextVersionFromHtml(html)`
- Converts HTML to plain text
- Removes HTML tags and decodes entities
- Returns plain text string

### `sanitizeColdEmailText(text)`
- Removes unwanted phrases: "I noticed", "I saw", "Quick question,", etc. (note: "Quick question that might be off base" is allowed as a specific variation, but generic "Quick question" is removed. No em dashes used)
- Normalizes percentages: "15-20%", "15-25%" → "10-20%"
- Softens language: "We help" → "Most teams I talk to..."
- Applied to all generated email content (greeting, opening_hook, value_proposition, etc.)

### `personalizeIndustryAndOtherLanguage(text, industry)`
- Replaces "Default companies" → "companies like yours"
- Replaces "nonprofit companies" → "organizations" (if industry is not nonprofit)
- Ensures industry-specific phrasing is correct


---

## Recent Improvements & Enhancements

### Multiple Entry Points for Adding Contacts

1. **Sequence Builder** (`sequence-builder.js`):
   - Search and add contacts via search bar
   - "Sequence Contacts" modal shows all contacts in sequence
   - **Bulk actions**:
     - Checkboxes to select multiple contacts
     - Bulk action bar with "Clear selected" and "Remove from sequence" buttons
     - Uses progress toast system for removal operations
     - Shows progress bar: "Removing X contacts from sequence..."
     - Updates progress after each contact is removed
     - Completion message with checkmark when done
   - Navigation: Clicking contact opens contact detail with back button returning to sequence builder with modal still open

2. **List Detail Page** (`list-detail.js`):
   - Bulk selection of contacts/accounts from list
   - "Add to sequence" button in bulk actions bar
   - **Email validation modal**:
     - Shows count of contacts with/without emails
     - Lists contacts without emails (up to 5, then "+ X more")
     - Options: "Cancel", "Add X with Emails Only", "Add All X"
     - Note explains that contacts without emails will skip email steps
   - **Progress toast system** (3-step process):
     - Step 1: Loading contact data (progress: 1/3)
     - Step 2: Checking for duplicates (progress: 2/3)
     - Step 3: Adding members and auto-starting (progress: 3/3)
     - Completion message shows added count and any skipped contacts
   - **Auto-start**: If sequence is active, automatically creates `sequenceActivations` in batches of 25

3. **Contact Detail Page** (`contact-detail.js`):
   - "Add to Sequence" button opens sequence selection dropdown
   - Confirmation dialog if contact has no email
   - Auto-starts sequence if sequence is active
   - Uses same activation flow as other entry points

### Progress Toast System

The system now uses a unified progress toast system across all bulk operations:

- **Visual feedback**: Progress bar shows current progress (e.g., "Removing 5 contacts... 3/5")
- **Real-time updates**: Progress updates after each item is processed
- **Completion states**:
  - Success: Green checkmark with completion message
  - Partial success: Shows count of successful vs total
  - Error: Red error state with error message
- **Used in**:
  - Removing contacts from sequence (`sequence-builder.js`)
  - Adding contacts to sequence from list (`list-detail.js`)
  - Deleting contacts/accounts (`people.js`, `accounts.js`, `list-detail.js`)

### Navigation Source Tracking

- **Back button navigation**: When navigating from sequence contacts modal to contact detail, the back button returns to sequence builder with the modal still open
- **Navigation variables**:
  - `window._contactNavigationSource = 'sequence-builder'`
  - `window._sequenceBuilderReturn = { sequenceId, sequenceName, timestamp }`
- **Restoration**: On back button click, system:
  1. Navigates to sequence builder page
  2. Opens the sequence
  3. Automatically clicks "Sequence Contacts" button to reopen modal

### AI Email Generation Improvements

1. **Industry Detection Priority**:
   - CRM `industry` field is now **always checked first** before any inference
   - Prevents misclassification (e.g., "Construction" companies incorrectly identified as "Nonprofit")
   - Falls back to company name inference, then description inference, then "Default"

2. **Centralized Angle Definitions System**:
   - **New Module**: `api/_angle-definitions.js` centralizes all angle definitions for easy maintenance
   - **Industry-Specific Openers**: Each angle provides industry-specific opening hooks with observable pain points
     - Manufacturing: "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+"
     - Healthcare: "Quick observation: most hospitals we work with overpay 15-20% on demand charges..."
     - Retail: "Quick question: are your energy peaks aligned with shopping hours, or are you paying demand charges for times you don't actually spike?"
     - And more for each industry (DataCenter, Hospitality, Nonprofit, Education, Government, Logistics)
   - **Industry-Specific Proof Points**: Social proof tailored to industry (e.g., "70% of manufacturing ops we audit find 15-25% savings")
   - **Role-Based CTAs**: High-friction CTAs tailored to recipient role (CEO, CFO, Operations, Controller, Facilities)
     - CEO: "Are you aware how much of your margin is hidden in misaligned energy rates?"
     - CFO: "When was the last time someone audited your demand charges? (Most CFOs we talk to are shocked by what they find.)"
     - Operations: "How are you optimizing consumption before renewal without impacting production?"
   - **Industry-Weighted Selection**: Angles selected based on industry performance (Manufacturing: demand_efficiency=3, Healthcare: exemption_recovery=3, etc.)
   - **Observable Pain in Subjects**: Subject lines use observable pain statements instead of generic questions
     - Good: "[company] – likely overpaying on demand charges"
     - Bad: "[contact_name], question about energy?" (too generic)

3. **Angle & Tone Opener System**:
   - `selectedAngle` is **injected as critical instruction** into the AI system prompt to ensure it is actually used
   - Industry-specific openers and role-based CTAs come from centralized angle definitions
   - `toneOpener` is provided as **INSPIRATION** (stylistic guide, not template) - AI has creative freedom to craft natural openers while matching the style
  - **Tone Opener** (Creative Freedom - Varied Styles):
    - **Creative Freedom**: Tone opener is provided as INSPIRATION - use it as a stylistic guide, not a template. AI has creative freedom to craft natural openers.
    - **FORBIDDEN REPETITION**: Do NOT default to "Quick question" every time. This is overused and makes all emails sound the same. Vary your opener style.
    - **USE THE TONE OPENER STYLE**: The tone opener suggests a style (curiosity, direct/honest, peer observation, etc.). Try to match this style rather than defaulting to "Quick question".
    - **Variety**: System provides 4 style options (Soft curiosity, Confused/disarmed, Peer/observational, Direct)
    - **Pattern-Based Validation**: Uses `hasValidToneOpenerPattern()` to recognize valid conversational openers:
      - Known openers: "Question for you", "So here's the thing", "Honestly", "Let me ask you something", etc.
      - Soft curiosity: "Curious if", "Wonder if", "Are you", "How are you" (REMOVED "Wondering how" - overused)
      - Peer/observation: "Usually when", "Most teams", "From what", "I've found", "Most people I talk to"
      - Pattern matching: Recognizes conversational patterns (no em dash required - natural flow)
      - Searches first 100 characters after greeting
    - **Auto-Insertion Fallback**: Only if body is very short (< 20 chars), automatically inserts simple opener
    - **No Em Dashes**: All examples and openers use commas or natural flow (no em dashes)
    - **Variation Required**: System requires varying openers across emails. Do NOT repeat "Quick question" or any other opener pattern.
    - **No Errors**: Missing tone opener does not cause validation errors (optional but recommended)
   - **Angle Context**: Full angle object (id, openingTemplate, primaryValue, primaryMessage) injected into system prompt
   - **Angle-Based CTAs**: System automatically uses industry-specific and role-specific CTAs from `getAngleCta()` function (using centralized angle definitions from `api/_angle-definitions.js`)
   - **Angle-Based Subjects**: Perplexity has creative control to generate unique, angle-specific subject lines (not hardcoded patterns)

3. **NEPQ Validation System**:
   - **Purpose**: Enforces NEPQ (Neuro-Emotional Persuasion Questioning) methodology across all email types (cold, follow-up, nurture)
   - **Server-Side Validation** (`validateNepqContent()` in `generate-scheduled-emails.js`):
     - **Forbidden Phrases**: Blocks "Old Model" sales language:
     - **Weak Opener Detection**: Logs weak/generic opening patterns for analysis:
       - Detects patterns like "quick question about", "wondering if", "curious if", "thought i'd reach out"
       - Logs telemetry (doesn't block) to identify emails that could use stronger industry-specific openers
     - **Observable Pain Pattern Detection**: Logs missing observable pain in cold emails:
       - Detects patterns like "most.*we (audit|find|discover)", "\\d+%.*overpay", "are you.*\\?", "when was (the|your) last"
       - Logs telemetry for cold emails that lack observable pain points (encourages use of industry-specific angles)
       - "I saw/noticed/read/came across"
       - "Hope this email finds you well"
       - "Just following up"
       - "My name is"
       - "Wanted to reach out/introduce"
     - **Tone Opener Validation**: Optional pattern-based detection (no errors if missing, only auto-inserts for very short bodies)
     - **Question Count**: Requires at least 2 questions (problem-awareness + low-friction CTA)
     - **CTA Friction Check**: Blocks high-friction CTAs (scheduling asks), requires low-friction qualifying questions
     - **Subject Spamminess**: Blocks pitchy words ("save", "free", "% off", "deal")
     - **Result**: Blocks non-compliant emails from being saved, provides error feedback
   - **Client-Side UI Guidance**:
     - **Sequence Builder** (`sequence-builder.js`):
       - Updated placeholder text with NEPQ best practices
       - Helper tooltip next to AI prompt field with NEPQ tips
       - All prompt builder functions aligned with NEPQ principles
     - **Email Compose Global** (`email-compose-global.js`):
       - Updated placeholder text with NEPQ guidance for cold and follow-up emails
       - Helper tooltip with NEPQ tips
       - Maintains flexibility for manual prompts
   - **System Prompt Alignment** (`perplexity-email.js`):
     - Removed all contradictory "I noticed"/"I saw" instructions
     - Updated to emphasize questions over observations
     - Tone opener rule updated to be optional with varied style options (no mandatory requirement)
     - Fixed `opening_hook` and `cta_text` field descriptions to align with NEPQ
   - **HTML Rebuilding Fix**:
     - Fixed duplication bug where HTML wasn't properly rebuilt from modified text
     - Complete HTML reconstruction from paragraphs after NEPQ validation
     - Prevents double tone openers and formatting issues

4. **Content Sanitization**:
   - **Greeting Enforcement**: Enforces first name only in greetings - "Hello Kurt," NOT "Hello Kurt Lacoste," (applied in both standard and HTML modes)
   - **Closing Enforcement**: Always ensures "Best regards, [SenderFirstName]" is included (adds if AI doesn't generate it)
   - **Phrase Removal**: Automatically removes "I noticed", "I saw", "Quick question,", "Real question,", "Out of curiosity," (note: "Quick question that might be off base" is allowed as a specific variation, but generic "Quick question" is removed. No em dashes used)
   - **Percentage Normalization**: Converts "15-20%", "15-25%" → "10-20%" (standardized savings claims)
   - **Industry Placeholder Fix**: Replaces "Default companies" → "companies like yours"
   - **Nonprofit Phrasing Fix**: Replaces "nonprofit companies" → "organizations" (if industry is not nonprofit)
   - **Description Dumping Prevention**: Ensures company description is used as context, not copied verbatim

5. **AI Mode Support**:
   - **HTML Mode** (`aiMode: 'html'`): Generates branded HTML template with full styling
   - **Standard Mode** (`aiMode: 'standard'`): Generates simple NEPQ-style plain text email
   - Mode is set in sequence step and preserved on email document
   - Different template building logic for each mode

6. **Enhanced Email Document**:
   - Added `aiMode` field to track generation mode
   - Added `tone_opener` field to track which tone opener was used
   - Both fields stored for analytics and debugging

7. **Email Formatting & Signature**:
   - **Greeting Format**: Enforced to use first name only (not full name) in all generated emails
   - **Closing Format**: Always includes "Best regards, [SenderFirstName]" for consistency
   - **Signature Addition**: Automatically appends user signature (text + image) when sending:
     - Fetched from Firestore `crm-settings` collection
     - Respects `emailSettings.content.includeSignature` flag
     - Includes both HTML and plain text versions
     - Image signature respects `signatureImageEnabled` setting

8. **Energy Supplier Context**:
   - **Account Data Integration**: Extracts energy supplier information from account records:
     - `electricitySupplier` → `recipient.energy.supplier`
     - `currentRate` → `recipient.energy.currentRate`
     - `contractEndDate` → `recipient.energy.contractEnd`
     - `annualUsage` → `recipient.energy.annualUsage`
   - **AI Personalization**: Energy supplier data is passed to Perplexity API for context-aware email generation
   - **Usage Examples**: AI can reference supplier in emails (e.g., "With TXU as your current supplier...")

9. **Gmail API Migration**:
   - **Replaced SendGrid**: All email sending now uses Gmail API via `GmailService` class
   - **Domain-Wide Delegation**: Uses Google service account with domain-wide delegation for impersonation
   - **Sender Resolution**: Automatically looks up sender name/email from Firestore user profiles (no manual env vars per agent)
   - **Multipart Emails**: Sends both HTML and plain text versions for better compatibility
   - **Thread Tracking**: Includes `threadId`, `inReplyTo`, `references` for conversation threading
   - **Message IDs**: Uses `gmailMessageId` instead of `sendgridMessageId`
   - **Provider Tagging**: Emails marked with `provider: 'gmail'` for tracking

10. **Custom Email Tracking System** (Replaces SendGrid Tracking):
   - **Open Tracking**: Custom 1x1 transparent PNG pixel injected into all emails
   - **Click Tracking**: All links automatically wrapped with tracking URLs that redirect after recording
   - **Implementation**: 
     - **Helper Module**: `api/email/tracking-helper.js` - Provides `injectTracking()` function
     - **Open Endpoint**: `/api/email/track/{emailId}` - Records opens in Firestore, returns pixel
     - **Click Endpoint**: `/api/email/click/{emailId}?url=...` - Records clicks, redirects to original URL
   - **Features**:
     - **Deduplication**: 5-second window prevents rapid duplicate opens from same user/IP
     - **Device Detection**: Automatically detects desktop/mobile/tablet/bot from user agent
     - **IP Masking**: IP addresses masked for privacy (keeps first 2 octets for geolocation)
     - **Bot Filtering**: Detects Gmail Image Proxy and other bots (marked but still recorded)
     - **Cache-Busting**: Random query parameter prevents email client caching
   - **Integration**:
     - **Manual Emails**: `api/email/sendgrid-send.js` automatically injects tracking before sending
     - **Sequence Emails**: `api/send-scheduled-emails.js` injects tracking using email document ID
     - **Settings**: Respects `emailSettings.deliverability.openTracking` and `clickTracking` flags
   - **Firestore Storage**:
     - Opens stored in `opens[]` array with timestamp, userAgent, IP, deviceType, referer
     - Clicks stored in `clicks[]` array with timestamp, URL, linkIndex, userAgent, IP, deviceType
     - Counts: `openCount` and `clickCount` for quick queries
     - Timestamps: `lastOpened` and `lastClicked` for recent activity
   - **UI Display**: Tracking badges in `emails-redesigned.js` automatically show open/click counts
   - **Production Logging**: Uses `logger.debug()` for tracking events (only logs in development, not production) to reduce Cloud Run costs

### Task Completion Reliability

- **Unified API base resolution**: Both `scripts/pages/task-detail.js` and `scripts/pages/tasks.js` now share a `getApiBaseUrl()` helper that prioritizes `PUBLIC_BASE_URL`, then `API_BASE_URL`, and finally the Vercel fallback. This guarantees every completion call hits the live server even if the UI has been running on an older cache for days.
- **Consistent next-step creation**: The “Log call & complete task” button on Task Detail and the “Complete” button on the Tasks list both post to `/api/complete-sequence-task` using the unified helper, so progressive sequences always advance to the next step (task or email) regardless of where the user completes the task.
- **Offline-safe fallback**: If neither public/env URL is available, the helper falls back to `window.location.origin`, ensuring completions still resolve during local development but never override production URLs in deployed builds.

### Prompt System Architecture

The email generation system uses a two-layer prompt architecture:

1. **User Prompt** (from sequence step):
   - Stored in `step.data.aiPrompt` or `step.emailSettings.aiPrompt`
   - This is the instruction the user writes/selects in sequence-builder.js
   - Examples: "Write a cold introduction email..." or custom instructions
   - Provides general guidance on email structure, tone, and requirements
   - **Note**: The prompt shown in sequence-builder.js is the user instruction, not the final prompt sent to Perplexity

2. **System Prompt** (generated by `buildSystemPrompt()` in `api/perplexity-email.js`):
   - Wraps and enhances the user prompt with comprehensive system instructions
   - Includes:
     - **Angle Context Block**: Selected angle's ID, focus, opening template, value proposition
     - **Tone Opener Guidance**: Optional instruction to use conversational opener (any style, varied across emails)
     - **Angle-Based CTA Instructions**: Uses `getAngleCta(selectedAngle)` to provide CTA foundation with creative control
     - **Angle-Based Subject Instructions**: Creative control with angle-specific variations (ensures uniqueness)
     - **Research Data**: Company info, LinkedIn activity, recent news, location context
     - **Industry Context**: Industry-specific pain points, role-specific language
     - **Template Rules**: HTML template structure, field requirements, formatting rules
   - The user prompt is included at the end as the actual instruction

**Flow Example**:
```
User Prompt: "Write a cold introduction email..."
↓
System adds:
  - Angle: timing_strategy (openingTemplate: "When does your contract expire?")
  - Tone Opener: "Question for you" (provided as INSPIRATION - AI has creative freedom to match the style, but should not default to "Quick question")
  - CTA Foundation: Angle's opening question + value + low-friction question
  - Subject Inspiration: Angle-based variations
  - Research: Company data, LinkedIn, location context
↓
Final System Prompt sent to Perplexity (much more comprehensive)
```

### Angle-Based CTA System

- **Source**: `getAngleCta()` function in `api/perplexity-email.js` using centralized angle definitions from `api/_angle-definitions.js`
- **Industry-Specific Opening**: Uses industry-specific opening hook with observable pain (e.g., "Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+")
- **Industry-Specific Proof**: Includes industry-specific proof point (e.g., "70% of manufacturing ops we audit find 15-25% savings")
- **Role-Based CTA**: High-friction CTA tailored to recipient role (CEO, CFO, Operations, Controller, Facilities)
- **Structure**: [Industry-Specific Opening Hook] + [Industry-Specific Proof] + [Role-Based High-Friction CTA]
- **High-Friction CTAs**: Require admission of problem, not dismissible with "we're fine"
  - Examples: "Are you on peak-based or 4CP?" (Both imply problems), "When was your last demand audit?" (Implies they haven't done one)
- **Creative Control**: Perplexity can rephrase naturally but must include all components and use the provided industry/role-specific elements
- **Fallback**: If no angle available, uses existing `ctaPattern` or generic qualifying question

### Angle-Based Subject Lines

- **HTML Mode**: Perplexity generates unique subject lines inspired by the selected angle (creative control)
- **Standard Mode**: Randomly selects from angle-specific subject array (3-4 variations per angle)
- **Variation**: Each email gets a unique subject line (no repetition)
- **Angle Inspiration**: Subject variations based on angle's core question

### CTA Escalation System

The system varies CTA strength based on email position in sequence to progressively increase engagement:

**Function**: CTA escalation logic in `buildSystemPrompt()` in `api/perplexity-email.js`

**Email Position Parameter**: `emailPosition` (1, 2, or 3+) passed from `generate-scheduled-emails.js` based on `stepIndex + 1`

**Escalation Levels**:

**Email 1 (First Contact)**:
- **Strength**: SOFT - Discovery question
- **Structure**: [Opening Question] + [Value/Statistic] + [Low-friction closing question]
- **Example**: "When does your current contract expire?\n\nWorth a 10-minute look?"
- **Purpose**: Low-friction discovery to gauge interest

**Email 2 (Follow-up)**:
- **Strength**: MEDIUM - Reference previous + Value ask
- **Structure**: [Reference Email 1] + [New Angle Insight] + [Medium-strength ask]
- **Example**: "On that contract expiration question, locking in 6 months early typically yields better terms.\n\nCan I pull a quick analysis for you?"
- **Purpose**: Builds on previous email with concrete value offer

**Email 3+ (Final Attempt)**:
- **Strength**: HARD - Specific time options
- **Structure**: [Urgency] + [Time Options] + [Alternative close]
- **Example**: "Rate lock windows are tightening. Can you do Thursday 2-3pm or Friday 10-11am? If not, when works better?"
- **Purpose**: Creates urgency with specific scheduling options

**Integration**: Injected into system prompt as "CTA Escalation" section, providing specific instructions for each email position. The escalation ensures CTAs become progressively more direct while maintaining professional tone.

### Performance Optimizations

1. **Scheduled Tab Loading**:
   - Optimized filter logic with early returns and pre-computed date calculations
   - Lazy sorting (only sorts when displaying, not on every filter)
   - Eliminated double filtering (uses already-filtered count)
   - In-memory folder count caching (30-second expiry)

2. **Cost Efficiency**:
   - In-memory filtering for folder counts (zero Firestore reads)
   - Removed aggressive preloading for scheduled tab
   - Smart pagination that only loads what's needed

---

## Summary

The Sequence Machine is a multi-phase system:

1. **Activation** → Creates first step emails
2. **Generation** → Creates email content using AI (with industry detection, angle enforcement, and sanitization)
3. **Approval** → User reviews and approves
4. **Sending** → Sends email and creates next step
5. **Repeat** → Steps 2-4 repeat for each step

Each phase is independent and can be triggered manually or via cron jobs. The system is designed to be fault-tolerant with idempotency checks and error handling at each step.

**Key Features**:
- **Gmail API Integration**: All emails sent via Gmail API with domain-wide delegation (replaces SendGrid)
- **Custom Email Tracking**: Custom tracking pixel system replaces disabled SendGrid tracking (open & click tracking with deduplication, device detection, IP masking)
- **Strict Word Count Enforcement**: Cold emails limited to 50-70 words total with section-specific limits:
  - Greeting: 2 words MAX, Opening Hook: 15-20 words EXACTLY, Value Prop: 20-30 words EXACTLY, CTA: 8-12 words EXACTLY
  - Aggressive post-generation truncation if any section exceeds limits
  - Scannable, text-message-like visual structure with double line breaks between sections
- **Mandatory Two-Question Requirement**: All cold emails must include exactly 2 questions:
  - Question 1 in Opening Hook (15-20 words) - problem-awareness question
  - Question 2 in CTA (8-12 words) - low-friction qualifying question
  - Auto-fix logic converts statements to questions if only 1 question detected
  - Validation rejects emails with fewer than 2 questions
- **NEPQ Validation System**: Comprehensive server-side validation enforcing Neuro-Emotional Persuasion Questioning methodology:
  - Blocks "Old Model" sales language (forbidden phrases)
  - **Weak Opener Detection**: Logs weak/generic opening patterns (telemetry only, doesn't block)
  - **Observable Pain Pattern Detection**: Logs missing observable pain in cold emails (telemetry only, encourages industry-specific angles)
  - Optional tone opener validation (pattern-based, no errors if missing, only auto-inserts for very short bodies)
  - Requires exactly 2 questions (problem-awareness + low-friction CTA) - MANDATORY
  - Blocks high-friction CTAs (scheduling asks)
  - Prevents spammy subject lines
  - Provides immediate feedback in preview generation
- **Tone Opener Optional System**: Optional pattern-based validation allows AI to generate varied conversational openers (no mandatory requirement, encourages variety)
- **Preview Generation**: Sequence builder uses production endpoint (`preview: true`) to show accurate email previews with NEPQ validation feedback
- **Automatic Signature**: User signatures automatically appended to all sequence emails:
  - **Standard**: Text + optional image signature
  - **Premium HTML**: Table-based professional signature with avatar, contact details, and social links (toggle in Settings)
- **Greeting Format**: Enforced first name only ("Hello Kurt," not "Hello Kurt Lacoste,")
- **Closing Format**: Always includes "Best regards, [SenderFirstName]"
- **Energy Supplier Context**: Account energy supplier data included in AI context for personalization
- CRM-first industry detection for accuracy
- **Industry-weighted angle selection**: Angles selected based on industry performance (Manufacturing: demand_efficiency=3, Healthcare: exemption_recovery=3, etc.)
- **Industry-specific openers**: Each angle provides industry-specific opening hooks with observable pain points
- **Role-based CTAs**: High-friction CTAs tailored to recipient role (CEO, CFO, Operations, Controller, Facilities) that require admission of problem
- Enforced angle usage (angles are critical instructions). Tone opener is provided as INSPIRATION with creative freedom (not mandatory, but should match style and avoid "Quick question" repetition)
- **Observable pain in subjects**: Subject lines use observable pain statements instead of generic questions
- **Centralized angle definitions**: All angle definitions in `api/_angle-definitions.js` for easy maintenance and updates
- **Perplexity creative control**: Subject lines and CTAs are angle-inspired with creative variation (not hardcoded)
- Automatic content sanitization
- Dual-mode email generation (HTML/Standard)
- Optimized performance and cost efficiency
- **Production-Optimized Logging**: Tracking events use `logger.debug()` (only logs in development, reduces Cloud Run costs)
- Multiple entry points for adding contacts (Sequence Builder, List Detail, Contact Detail)
- Progress toast system for all bulk operations
- Auto-start sequences when adding contacts to active sequences
- Email validation before adding contacts
- Bulk actions in sequence contacts modal
- Smart navigation with back button restoration

## Prompt System Architecture

### User Prompt vs System Prompt

The email generation system uses a two-layer prompt architecture:

1. **User Prompt** (from sequence step):
   - Stored in `step.data.aiPrompt` or `step.emailSettings.aiPrompt`
   - This is the instruction the user writes/selects in sequence-builder.js
   - Examples: "Write a cold introduction email..." or custom instructions
   - Provides general guidance on email structure, tone, and requirements

2. **System Prompt** (generated by `buildSystemPrompt()` in `api/perplexity-email.js`):
   - Wraps and enhances the user prompt with comprehensive system instructions
   - Includes:
     - **Angle Context Block**: Selected angle's ID, focus, opening template, value proposition
     - **Tone Opener Guidance**: Optional instruction to use conversational opener (any style, varied across emails)
     - **Angle-Based CTA Instructions**: Uses `getAngleCta(selectedAngle)` to provide CTA foundation
     - **Angle-Based Subject Instructions**: Creative control with angle-specific variations
     - **Research Data**: Company info, LinkedIn activity, recent news, location context
     - **Industry Context**: Industry-specific pain points, role-specific language
     - **Template Rules**: HTML template structure, field requirements, formatting rules
   - The user prompt is included at the end as the actual instruction

### How It Works

```
User creates sequence step:
  aiPrompt: "Write a cold introduction email..."

↓ Email generation starts

↓ System selects:
  - Industry → Angle (timing_strategy)
  - Angle → Tone Opener (provided as INSPIRATION - "Question for you" suggests a style, AI has creative freedom to match it, but should NOT default to "Quick question")
  - Research data (company info, LinkedIn, etc.)

↓ buildSystemPrompt() creates:

[System Context]
[Angle Context: timing_strategy, openingTemplate, primaryValue]
[Tone Opener: Creative Freedom - use tone opener as INSPIRATION, match the style, vary across emails, DO NOT default to "Quick question"]
[CTA Instructions: Use angle opening question as foundation]
[Subject Instructions: Create unique angle-specific subject]
[Research Data: Company info, LinkedIn activity]
[Industry Context: Manufacturing pain points]
[Template Rules: HTML structure, field requirements]

[User's Original Prompt: "Write a cold introduction email..."]

↓ Sent to Perplexity Sonar

↓ Returns structured JSON with:
  - subject: "Terry, when does your contract expire?" (angle-based)
  - cta_text: "When does your current contract expire?\n\nWorth a 10-minute look?" (angle-based)
  - opening_hook: "Question for you, with [company] running..." or "Curious if you're seeing..." or "Most people I talk to..." (varied conversational opener, no em dash, NOT "Quick question")
```

### Angle-Based CTA System

The system automatically uses industry-specific and role-specific CTAs based on the selected angle:

- **Source**: `getAngleCta()` function in `api/perplexity-email.js` using centralized angle definitions from `api/_angle-definitions.js`
- **Industry-Specific Opening**: Uses industry-specific opening hook with observable pain
- **Industry-Specific Proof**: Includes industry-specific proof point
- **Role-Based CTA**: High-friction CTA tailored to recipient role (CEO, CFO, Operations, Controller, Facilities)
- **Structure**: [Industry-Specific Opening Hook] + [Industry-Specific Proof] + [Role-Based High-Friction CTA]
- **High-Friction CTAs**: Require admission of problem, not dismissible
- **Creative Control**: Perplexity can rephrase naturally but must include all components and use the provided industry/role-specific elements
- **Fallback**: If no angle available, uses existing `ctaPattern` or generic qualifying question

### Angle-Based Subject Lines

Subject lines use observable pain statements instead of generic questions:

- **Observable Pain Statements**: Create friction and can't be easily dismissed
  - Good: "[company] – likely overpaying on demand charges"
  - Good: "[company] – potential $50K+ recovery opportunity"
  - Bad: "[contact_name], question about energy?" (too generic)
- **Role-Specific Variants**: Different subject lines for different roles:
  - CEO: "[company] – likely overpaying on demand charges", "[contact_name], margin-hidden energy opportunity?"
  - Finance: "[company] – potential $50K+ recovery opportunity", "Budget variance alert: [company] energy exposure"
  - Operations: "[company] – peak demand structure question", "[contact_name], optimizing before renewal?"
  - Controller: "[company] – sales tax exemption recovery?", "Compliance check: [company] tax exemptions"
- **HTML Mode**: Perplexity generates unique subject lines with observable pain inspired by the selected angle
- **Standard Mode**: Randomly selects from role-specific subject array with observable pain statements
- **Variation**: Each email gets a unique subject line (no repetition)
- **Angle Inspiration**: Subject variations based on angle's core question with observable pain (e.g., timing_strategy → "[company] energy cost review – ERCOT 2026 risk")

### Tone Opener System (Creative Freedom - Varied Styles)

Tone openers use a creative freedom approach with pattern-based validation:

- **Enforcement Level**: CREATIVE FREEDOM - Tone opener is provided as INSPIRATION, not a mandatory template. AI has creative freedom to craft natural openers while matching the style.
- **FORBIDDEN REPETITION**: Do NOT default to "Quick question" every time. This is overused and makes all emails sound the same. The system explicitly forbids repeating "Quick question" across emails.
- **USE THE TONE OPENER STYLE**: The tone opener suggests a style (curiosity, direct/honest, peer observation, etc.). Try to match this style rather than defaulting to "Quick question".
- **Style Options**: System provides 4 conversational opener styles:
  - **Soft curiosity**: "Curious if you're seeing...", "Wonder if you've noticed...", "Curious, " (REMOVED "Wondering how" - overused and forbidden)
  - **Confused/disarmed**: "I was looking at your site and wasn't sure...", "Not sure if you've already handled...", "Quick question that might be off base..." (only this specific variation, not generic "Quick question")
  - **Peer/observational**: "Usually when I talk to [role], they mention...", "Most teams I work with are dealing with...", "From what I'm seeing with [industry] companies...", "Most people I talk to..."
  - **Direct**: "Are you currently handling [X]?", "How are you managing [specific challenge]?", "When you renew, do you..."
  - **Honest/direct**: "Honestly, ", "So here's the thing, " (REMOVED "Real talk" - not professional enough for corporate America)
- **Pattern Detection** (`hasValidToneOpenerPattern()`):
  - **Known Openers**: Checks for recognized phrases in first 100 characters after greeting:
    - "Question for you", "So here's the thing", "Honestly", "Let me ask you something"
    - "Most people I talk to", "Curious", "Looking at your situation" (REMOVED "Real talk")
    - Soft curiosity: "Curious if", "Wonder if", "Are you", "How are you", "Do you" (REMOVED "Wondering how" - forbidden)
    - Peer/observation: "Usually when", "Most teams", "From what", "I've found"
  - **Pattern Matching**: Recognizes conversational patterns:
    - Natural flow without em dashes (uses commas or direct questions)
    - Short phrases (2-6 words) with conversational structure
    - Examples: "Curious if you're seeing", "How are you managing", "Most teams I work with", "Most people I talk to"
  - **Validation**: Accepts any valid conversational opener pattern, not just predefined list
  - **No Em Dashes**: All examples and validation patterns avoid em dashes (use commas or natural flow)
- **Auto-Insertion Fallback**: 
  - Only triggers if email body is very short (< 20 characters)
  - Automatically inserts simple conversational opener (NOT "Quick question")
  - Prevents duplication by checking for existing valid openers first
  - Ensures proper paragraph spacing (`\n\n` after greeting)
- **No Errors**: Missing tone opener does not cause validation errors (optional but recommended)
- **Variation Required**: System requires varying openers across emails. Do NOT repeat "Quick question" or any other opener pattern every time.
- **Example**: 
  - AI can generate "Curious if you're seeing..." or "How are you managing..." or "Most teams I work with..." or "Most people I talk to..."
  - System accepts any conversational opener style
  - AI should NOT default to "Quick question" when a different tone opener style is provided
  - If AI generates "With your company..." (no opener) and body is short, system auto-inserts simple opener (NOT "Quick question")
- **Result**: Natural, varied emails that don't look templated while maintaining quality standards and professional tone

