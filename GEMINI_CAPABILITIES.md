# 🤖 Nodal Architect: Capabilities & Intelligence Roadmap

The **Nodal Architect** (powered by Gemini) is the cognitive core of the Nodal Point platform. It is not just a chatbot; it is a **Function-Calling Agent** integrated directly into our Supabase backend, Gmail services, and market intelligence APIs.

## 🚀 Current Active Capabilities

The agent is currently equipped with the following "Tools" and UI protocols which it executes autonomously:

### 🗄️ CRM Operations (Supabase Integrated)
- **Contact Management**:
    - `list_contacts`: Semantic & Keyword search to retrieve contact lists. 100% vector coverage.
    - `get_contact_details`: Access full dossier information (including legacy metadata) for any specific contact.
    - `update_contact`: Modify contact details (email, phone, status, notes) in real-time.
    - `create_contact`: Add new nodes to the network directly from conversation.
- **Account Intelligence**:
    - `list_accounts`: Semantic & Keyword search for companies and organizations. 100% vector coverage.
    - `get_account_details`: Retrieve full firmographic data, energy metrics, and corporate hierarchy.
    - `list_account_documents`: Access the "Data Locker" (Evidence Locker) for a specific account—bills, contracts, LOAs.
    - `list_all_documents`: List documents across all accounts, newest first (optional limit). Use when the user asks for "recent bills" or "latest uploads" without naming an account.
    - `list_deals`: Monitor sales opportunities and deal stages for specific accounts.
- **Interaction Forensics (Deep Search)**:
    - `search_interactions`: Semantic search across ALL history. Scans call summaries, raw transcripts (call_details), and email content. 100% vector coverage.
    - `search_transcripts`: Hybrid search (FTS + vector) over call transcripts and summaries; use for "what did X say about Y?" or call-specific queries. Supports account_id, contact_id, limit.
    - `search_emails`: Dedicated semantic search for email history with contact/account joining.
- **Task Orchestration**:
    - `list_tasks`: Monitor pending actions and follow-ups.
    - `create_task`: Generate new reminders with priority levels and due dates.

### 📧 Communication Automation
- **Gmail Integration**:
    - `send_email`: Compose and send professional emails via the authorized `GmailService`. It can leverage contact data to personalize content.

### 🔍 Market Prospecting & Enrichment
- **Apollo.io Integration**:
    - `search_prospects`: Find new potential clients based on keywords (e.g., "Energy Manager"), locations, or specific company names.
    - `enrich_organization`: Retrieve deep firmographic data for a company using just their domain name.

### ⚡ Energy Market Intelligence
- **Real-time Awareness**:
    - `get_energy_news`: Fetches the latest Texas energy market and ERCOT news via RSS, providing the agent with current context on grid volatility.
    - `get_market_pulse`: Retrieves live ERCOT data: **all four zonal settlement prices** (LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST), hub average, and system grid metrics (Load, Capacity, Reserves, Scarcity). The agent is instructed to call this when the user asks about **market prices**, **volatility** (“is the market volatile?”), or conditions in a **specific load zone** (e.g. “how is LZ_WEST?”). When the tool is called, the **backend automatically appends the live telemetry card** to the response so the user sees the same zonal/volatility/grid UI as on the Telemetry page (colors aligned with Infrastructure). Data is logged to the `market_telemetry` table (throttled) for forensic analysis.

### 🧠 Advanced Intelligence & Accuracy (Updated)
- **100% Semantic Coverage**: Every Account, Contact, Email, Call, and Transcript in the database is indexed with 768-dimensional vectors for semantic search.
- **Guaranteed Exact Match Priority (v1.3.0)**: Hybrid search now uses a tiered pinning strategy to ensure exact-name matches (e.g., "Camp Fire First Texas") always rank #1, bypassing RRF scores.
- **Location-Aware Node Discovery**: The agent can now intelligently filter accounts by `city` and `state` using specialized query normalization that detects "in [location]" patterns.
- **Deep Transcript Retrieval**: The agent scans raw call transcripts (`call_details`) to find specific commitment events or technical details mentioned in calls.
- **Robust Date Resolution**: Automatically cross-references multiple metadata fields (`contract_end_date`, `contractEndDate`, `general.contractEndDate`) to find expiration data.
- **Contextual Contract Persistence**: Enhanced memory logic allows the agent to maintain account context during multi-turn contract inquiries (e.g., "Find Account X" followed by "When does it expire?").
- **Date Normalization Engine**: Real-time conversion of legacy formats (e.g., `MM/DD/YYYY`) to forensic ISO standards (`YYYY-MM-DD`) during data retrieval.
- **Enhanced Industry Logic**: Intelligent search expansion for "Manufacturing" and other broad sectors to ensure complete node discovery across related sub-industries.
- **Reliable Model Routing**: Strict pipeline separation between OpenRouter and Gemini providers to eliminate `404` errors and ensure seamless fallback.
- **Full LLM Routing (No Grounded Path)**: The previous "grounded" fast path is **disabled**. All queries go to the full LLM with tools so the agent can return **identity_card** components (clickable cards to dossiers), **forensic_grid** with contract end dates when relevant, and other rich components—not a backend-built table-only response.
- **List-of-Accounts / Contract Dates**: For lists (e.g. manufacturers, expiring in 2026, accounts with contract end dates), the system prompt instructs the model to prefer **identity_card** per item so the user gets clickable cards; when using **forensic_grid** for accounts, the grid **must** include an `expiration` or `contract_end_date` column when the user asked about contract end dates or expirations.
- **Person vs Company**: The system prompt instructs the agent to use `list_contacts` (with context `accountId` when on an account page) for finding people by name; use `get_account_details` and `list_contacts` for phone/contact info for "this company"; use `search_interactions` or `search_transcripts` for call-related questions; and use `search_emails` or `search_interactions` for email-related questions. The user is always addressed by their first name from auth (`firstName`).
- **"This Year" Expiration**: Expiration queries that say "this year" (e.g. "accounts that expire this year") are resolved to the current calendar year so the grounded path returns the same data as "expire in 2026" (when applicable).

---

## 🎨 UI/UX Protocol: "Glass Intelligence"

The Nodal Architect features a "Steve Jobs" inspired forensic interface designed for high-stakes energy trading:

### 1. Structural Containers (Forensic HUD)
The interface is built using a **Stacked Command Deck** architecture for maximum utility and zero visual clutter:

- **Root Panel**: `bg-zinc-950/80 backdrop-blur-3xl border-white/10 shadow-2xl`
    - A high-blur obsidian glass container that houses the entire intelligence stream.
- **Stacked Command Deck (Footer Control Module)**:
    - **Tier 1: Configuration Deck**: `h-9 bg-black/40 border-b border-white/5`
        - Houses the `Cpu` model selector and the **Contextual Intel Pill**.
        - Displays `TARGET: [NAME]` or `ACTIVE_CONTEXT: [SCOPE]` using `font-mono tabular-nums`.
    - **Tier 2: Action Deck**: `min-h-[44px] bg-zinc-950/60 border-white/10`
        - An auto-expanding forensic input field (`textarea`) with a `44px` baseline and `112px` ceiling.
        - Integrates the **Klein Blue Execute Button** (`bg-[#002FA7]`).
- **Intelligence Block (AI Transmission)**:
    - **Neural Spine**: Left-aligned gradient spine (`from-[#002FA7] via-blue-500/20 to-transparent`).
    - **Narrative Container**: `prose-invert prose-p:text-zinc-400` for conversational flow.
    - **JSON_DATA Wrapper**: No outer border; components (identity_card, forensic_grid, etc.) render with their own single border so there is no double-container look.
- **Stealth Command Block (User Input)**:
    - `bg-zinc-900/50 border-white/10 backdrop-blur-md rounded-lg`
    - Right-aligned with `gap-8` immersion spacing and `> COMMAND_INPUT` metadata.

### 2. Forensic Visualization Components
The Architect can inject specialized data modules directly into the chat stream. Components are rendered when the model (or backend) includes a `JSON_DATA:{ "type": "<component_type>", "data": {...} }END_JSON` block in the response. **The `type` value must be lowercase** (e.g. `contact_dossier`, `identity_card`). **Markdown `**text**`** in prose is rendered as High-Contrast Data Artifacts (glass-encased, font-mono, white on dark) instead of plain bold.
- **Identity_Card**: Clickable "Identity Node" for a single contact or account. Use when the user asks "Who is [name]?" or "Show me [company]." Data: type (`contact`|`account`), id, name, title?, company?, industry?, status? (`active`|`risk`), initials?, logoUrl?, domain?. Card shows letter glyph or company logo (squircle), status LED, name, subtitle; click navigates to `/network/people/{id}` or `/network/accounts/{id}`.
- **News_Ticker**: Real-time scrolling grid intelligence (Market_Volatility_Feed; items with title, source, trend, volatility).
- **Contact_Dossier**: Detailed node profile (name, title, company, initials, energyMaturity, contractStatus, contractExpiration, id) with INITIATE action and Data Locker void state.
- **Position_Maturity**: Visualization of contract and pricing status (expiration, daysRemaining, currentSupplier, strikePrice, annualUsage, estimatedRevenue, margin; optional isSimulation).
- **Market_Pulse**: Live ERCOT telemetry card—**all four zones** (LZ_NORTH, LZ_HOUSTON, LZ_WEST, LZ_SOUTH) with colors matching Telemetry/Infrastructure, volatility banner, HUB_AVG, scarcity %, and **Scarcity Gauge** (Voltage Bar: left=scarcity/red, right=stable/green, glowing needle = reserve margin). Injected by the **backend** when `get_market_pulse` is called.
- **Forensic_Grid**: High-density tabular data for account analysis (title, columns, rows, optional highlights).
- **Forensic_Documents (Evidence Locker)**: Grid of **glass tiles** per document: PDF icon (red/white), truncated filename, date; hover reveals Download, Open, and **Analyze** (links to `/bill-debugger` for bill analysis). Data: accountName, documents (id, name, type, size, url, created_at).
- **Flight_Check**: Protocol checklist (e.g. "1. Email the CFO. 2. Pull the 4CP report."). Data: items array with `label`, `status` (`pending`|`done`). Renders as slim glass bars: left = circle/check, center = instruction, **"+" button** (adds row as task via `create_task`), **[ QUEUED ]** when queued (row turns green), right = copy icon; click row copies label to clipboard.
- **Interaction_Snippet**: Call/search result snippet. Data: contactName?, callDate?, snippet (text), highlight? (phrase to highlight in Klein Blue). Renders as "Waveform Card" with audio-wave visual and context line (e.g. "Call with Billy Ragland · Oct 14, 2025"). Use when answering "Did [X] mention [Y]?" from search_interactions.
- **Data_Void**: Empty state placeholders for missing intelligence (field, action e.g. REQUIRE_BILL_UPLOAD).
- **Mini_Profile**: Compact list of prospects (profiles array: name, company?, title?).

### 3. Context & Session Handling
- **Contextual Awareness**: The agent receives **context** from the current page: `contact` (with id from `/people/[id]`), `account` (from `/accounts/[id]`), `dashboard`, or `general`. Context can also be overridden via the Gemini store (`activeContext`). The footer displays `TARGET: [label]` or `ACTIVE_CONTEXT: [scope]`. Context is sent with each request so the model can use `accountId` / `context_id` for `list_contacts`, `get_account_details`, etc.
- **Chat sessions**: Messages are persisted in Supabase (`chat_sessions`, `chat_messages`). Each session has `context_type` and `context_id`. History panel loads past sessions and restores message list for a selected session.

### 4. Interaction Protocols
- **Router HUD (Diagnostics)**: Toggling the Bot icon shows **AI_ROUTER_HUD // LIVE_DIAGNOSTICS** with model/provider status, tool names when tools are invoked, and buttons to copy the Supabase debug prompt or the AI troubleshooting prompt.
- **Proactive Situation Report ("Pre-Strike")**: When the chat opens on an **Account** or **Contact** page with **empty message history**, the agent automatically sends a synthetic request and posts a one-paragraph **Situation Report** as the first AI message (e.g. contract status, key risks, next steps). No user prompt required.
- **DecryptionText**: The first segment of the latest AI prose can render with a "decryption" effect (characters cycle through glyphs then lock). Optional `decryptFirstChars` limits animation length.
- **NeuralLoader (Neural Uplink)**: While the agent is loading, a horizontal Klein Blue line expands and oscillates (waveform); status messages cycle every 800ms: `ESTABLISHING_SECURE_UPLINK...`, `PARSING_GRID_TELEMETRY...`, `VERIFYING_SOURCE_INTEGRITY...`, `[ SIGNAL_LOCKED ]`.
- **Anti-Hallucination Protocol (v2)**: Strict enforcement against inventing names, metrics, or dates. If data is not in the CRM, the agent is hard-coded to report it as "Unknown" or "Data Void".
- **Neural Line Response**: Every AI transmission is anchored by a glowing vertical "Neural Line" spine in International Klein Blue.
- **Message parsing**: Assistant content is split on `JSON_DATA:`; each block is parsed as `{ type, data }` and rendered via `ComponentRenderer`. Trailing text after `END_JSON` is shown as prose.
- **Dynamic Scaling**: Header icons (Bot, History, Plus, etc.) use the forensic icon set; Bot icon shows an ambient pulse when diagnostics are open.
- **Haptic Animations**: `framer-motion` layout orchestration with `spring` transitions (bounce: 0, duration: 0.4) for organic UI movement.
- **Visual Status**:
    - **Live Waveform**: A dynamic bar animation that visualizes the AI's "thinking" process next to "Nodal Architect v1.3" and "LIVE_FEED".
    - **LED Pulsing**: A subtle emerald glow signifying active background monitoring.
- **File-reading models**: Only **Gemini** and **Sonar** can read uploaded documents. Any future "analyze this file" flow must be gated to those models; others show an upgrade message.

---

## 🧠 Intelligence Philosophy: "The Physics of Pricing"

The Nodal Architect is trained to align with the **Nodal Point Thesis**. It doesn't just manage data; it understands the "Source Code of the Grid."

### 1. Intelligence Stack (Multi-Model Fallback)
The Architect utilizes a sophisticated **Model_Stack** protocol. If the primary node is overloaded or hits a quota, it autonomously falls back through a chain of high-precision models:
- **Primary Agent**: `gpt-oss-120b:free` (Deep logic and forensic reasoning).
- **Secondary Node**: `nemotron-30b:free` (High-speed free intelligence layer).
- **Speed Layer**: `gemini-2.0-flash` & `gemini-1.5-flash`.
- **Reasoning Layer**: `gemini-1.5-pro`.
- **Search Layer**: `sonar-pro` & `sonar-standard` (Perplexity).

### 2. Deep Research Protocol (Perplexity)
In the event of a total Google Network saturation or when real-time web verification is required, the system initiates the **Perplexity Fallback** for uncompromised grid research.

### 3. Forensic Analysis
When discussing accounts, the agent prioritizes the "Three Vectors of Cost Leakage":
- Identifying **Demand Ratchets**.
- Monitoring **4CP Coincident Peaks**.
- Predicting **Scarcity Pricing** risks.

### 4. Data Locker Access
The agent now has direct access to the `documents` vault, allowing it to verify the existence of LOAs, Bills, and Contracts before advising on strategy. It can cross-reference these files with account metadata to detect missing critical information.

---

## 🔮 Roadmap: Future Capabilities (Coming Soon)

We are actively expanding the Architect's "Brain" to include these forensic energy tools:

- **AI Bill Debugger**: Direct integration with the Bill Debugger logic to analyze uploaded invoices and identify hidden billing errors.
- **Predictive Curtailment Alerts**: Proactive notification logic where the agent warns users of upcoming high-price intervals.
- **Sequence Orchestration**: The ability for Gemini to enroll contacts into automated multi-channel follow-up sequences.
- **Voice Intelligence**: Summarizing Twilio call transcripts to extract "Commitment Events" and sentiment via the Walkie-Talkie interface.

---

## 🛠️ Technical Implementation
- **Primary Node**: `gpt-oss-120b:free` via OpenRouter.
- **Intelligence Stack**: Gemini 2.0/1.5 (Google), Nemotron-30b (NVIDIA), & Sonar (Perplexity).
- **Backend**: Node.js Proxy on Port 3001 with custom `chat.js` routing logic.
- **Frontend**: Next.js 15 with Framer Motion "Obsidian & Glass" UI.
- **Security**: All tool calls are gated by Supabase RLS and server-side validation.

---
## 📋 Recommended Follow-Ups (Backlog)
- **Position Maturity card**: Add "Open account" link/button using account id when available so the user can jump to the account dossier.
- **ProseWithArtifacts**: Support multi-line or nested `**` (e.g. `**line1** **line2**`) more robustly if the model emits it.
- **Unknown component type**: Today unknown `type` returns `null`; optional dev-only fallback (e.g. "Unknown: {type}") could help when adding new components.
- **Streaming**: If the backend ever streams tool calls or partial content, the frontend would need to handle incremental JSON_DATA or append content.

---
## 🧪 Test Prompts & Expected Results

Use these to verify the Nodal Architect and Build Gemini v2 behavior. **Context** = where you open the chat (e.g. account page, contact page, or global).

| Prompt | Context | Expected behavior / result |
|--------|--------|----------------------------|
| *(Open chat, do nothing)* | Account or Contact page | **Proactive report**: First AI message is a one-paragraph situation report (contract status, risks, next steps). NeuralLoader shows during request. |
| **Find Camp Fire First Texas** | Any | `list_accounts` → Identity card or account details; exact name should rank #1 (hybrid search). |
| **Who works at this company?** / **Find a person named Louis** | Account page preferred | `list_contacts` with accountId; returns people, not company list. Identity cards for contacts. |
| **What's the phone number for this company?** | Account page | `get_account_details` + `list_contacts`; agent returns actual phone from CRM or says none found. |
| **Accounts expiring in 2026** | Any | Full LLM; `list_accounts({ expiration_year: 2026 })`; expect **identity_card**s (clickable to dossier) or **forensic_grid** with an **expiration** column. |
| **List accounts that are manufacturers** | Any | Full LLM; `list_accounts` (industry/search); expect **identity_card**s or grid; no plain id/name-only table. |
| **Accounts with contract end dates** | Any | Full LLM; `list_accounts`; response must show contract end dates—**forensic_grid** should have **expiration** or **contract_end_date** in columns and rows. |
| **Accounts in Houston, Texas** | Any | `list_accounts` with city/state; location-aware results; identity cards or grid. |
| **How's the market?** / **Is the market volatile?** | Any | `get_market_pulse` → **Market_Pulse** card with zones, scarcity gauge, volatility. |
| **Show me documents for [account name]** | Any | `list_account_documents` → **Forensic_Documents** (Evidence Locker) with Download, Open, **Analyze** (→ Bill Debugger). |
| **Give me a protocol checklist for closing this deal** | Account/Contact | Agent returns **Flight_Check** with items; each row has **+** button; click **+** → task created, row shows **[ QUEUED ]** and turns green; task appears in Right Panel / Tasks. |
| **What did [name] say about the contract?** | Any | **Intent lock**: full LLM; `search_transcripts` or `search_interactions`; **Interaction_Snippet** or prose with call/email snippets, not generic account info. |
| **Any important emails from this account?** | Account page | `search_emails` or `search_interactions`; email results, not account-only response. |
| **When does their contract expire?** (after "Find X") | Any | Uses memorized account id; `get_account_details`; returns date or **[ DATA_VOID ]** / unknown if not in CRM. |

**Key tables** (agent reads via tools): `accounts` (name, domain, industry, city, state, contract_end_date, metadata, etc.), `contacts` (name, email, phone, title, accountId, etc.), `documents`, `tasks`, `emails`, `call_details` / transcripts, `market_telemetry`.

---
*Last Updated: 2026-02-06*
*Status: Nodal Architect v2.0 — Grounded path disabled (full LLM for all queries); list responses use identity_card or forensic_grid with expiration when relevant; single-container UI (no outer wrapper border). DecryptionText, NeuralLoader, Proactive Situation Report, Flight Check → create_task, Evidence Locker Analyze → Bill Debugger; Identity Cards, Scarcity Gauge, Conversation Snippet, High-Contrast ** Artifacts.*
