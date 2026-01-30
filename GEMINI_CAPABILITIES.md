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
    - `list_account_documents`: Access the "Data Locker" to view filenames of bills, contracts, and LOAs.
    - `list_deals`: Monitor sales opportunities and deal stages for specific accounts.
- **Interaction Forensics (Deep Search)**:
    - `search_interactions`: Semantic search across ALL history. Scans call summaries, raw transcripts (call_details), and email content. 100% vector coverage.
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

### 🧠 Advanced Intelligence & Accuracy (Updated)
- **100% Semantic Coverage**: Every Account, Contact, Email, Call, and Transcript in the database is indexed with 768-dimensional vectors for semantic search.
- **Deep Transcript Retrieval**: The agent scans raw call transcripts (`call_details`) to find specific commitment events or technical details mentioned in calls.
- **Robust Date Resolution**: Automatically cross-references multiple metadata fields (`contract_end_date`, `contractEndDate`, `general.contractEndDate`) to find expiration data.
- **Date Normalization Engine**: Real-time conversion of legacy formats (e.g., `MM/DD/YYYY`) to forensic ISO standards (`YYYY-MM-DD`) during data retrieval.
- **Enhanced Industry Logic**: Intelligent search expansion for "Manufacturing" and other broad sectors to ensure complete node discovery across related sub-industries.
- **Expiration Year Filtering**: High-precision filtering using both date-range logic and year-suffix pattern matching (`ilike %/YYYY`) for inconsistent legacy records.

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
    - **JSON_DATA Wrapper**: `bg-black/20 border-white/5 rounded-lg` for rendering forensic components.
- **Stealth Command Block (User Input)**:
    - `bg-zinc-900/50 border-white/10 backdrop-blur-md rounded-lg`
    - Right-aligned with `gap-8` immersion spacing and `> COMMAND_INPUT` metadata.

### 2. Forensic Visualization Components
The Architect can inject specialized data modules directly into the chat stream:
- **News_Ticker**: Real-time scrolling grid intelligence.
- **Contact_Dossier**: Detailed node profile summaries.
- **Position_Maturity**: Visualization of contract and pricing status.
- **Forensic_Grid**: High-density tabular data for account analysis.
- **Data_Void**: Empty state placeholders for missing intelligence.
- **Forensic_Documents**: Visual list of files in the Data Locker.

### 3. Interaction Protocols
- **Contextual Awareness**: The agent automatically detects the user's current route (Contact, Account, Dashboard) and offers proactive insights upon opening without a single click.
- **Anti-Hallucination Protocol (v2)**: Strict enforcement against inventing names, metrics, or dates. If data is not in the CRM, the agent is hard-coded to report it as "Unknown" or "Data Void".
- **Neural Line Response**: Every AI transmission is anchored by a glowing vertical "Neural Line" spine in International Klein Blue.
- **Dynamic Scaling**: Header icons (Bot, Dialer, Refresh) are precision-scaled to `22px-24px` for professional visibility.
- **Haptic Animations**: `framer-motion` layout orchestration with `spring` transitions (bounce: 0, duration: 0.4) for organic UI movement.
- **Visual Status**: 
    - **Live Waveform**: A dynamic bar animation that visualizes the AI's "thinking" process.
    - **LED Pulsing**: A subtle emerald glow signifying active background monitoring.

---

## 🧠 Intelligence Philosophy: "The Physics of Pricing"

The Nodal Architect is trained to align with the **Nodal Point Thesis**. It doesn't just manage data; it understands the "Source Code of the Grid."

### 1. Intelligence Stack (Multi-Model Fallback)
The Architect utilizes a sophisticated **Model_Stack** protocol. If the primary node is overloaded or hits a quota, it autonomously falls back through a chain of high-precision models:
- **Primary Agent**: `gpt-oss-120b` (Deep logic and forensic reasoning).
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
- **Primary Node**: `gpt-oss-120b` via OpenRouter.
- **Intelligence Stack**: Gemini 2.0/1.5 (Google) & Sonar (Perplexity).
- **Backend**: Node.js Proxy on Port 3001 with custom `chat.js` routing logic.
- **Frontend**: Next.js 15 with Framer Motion "Obsidian & Glass" UI.
- **Security**: All tool calls are gated by Supabase RLS and server-side validation.

---
*Last Updated: 2026-01-29*
*Status: Nodal Architect v1.4 Operational (Full Semantic Sync)*
