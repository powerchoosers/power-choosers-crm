# 🤖 Nodal Architect: Capabilities & Intelligence Roadmap

The **Nodal Architect** (powered by Gemini) is the cognitive core of the Nodal Point platform. It is not just a chatbot; it is a **Function-Calling Agent** integrated directly into our Supabase backend, Gmail services, and market intelligence APIs.

## 🚀 Current Active Capabilities

The agent is currently equipped with the following "Tools" and UI protocols which it executes autonomously:

### 🗄️ CRM Operations (Supabase Integrated)
- **Contact Management**:
    - `list_contacts`: Search and retrieve contact lists.
    - `get_contact_details`: Access full dossier information for any specific contact.
    - `update_contact`: Modify contact details (email, phone, status, notes) in real-time.
    - `create_contact`: Add new nodes to the network directly from conversation.
- **Account Intelligence**:
    - `list_accounts`: Search for companies and organizations within our database.
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

---

## 🎨 UI/UX Protocol: "Glass Intelligence"

The Nodal Architect features a "Steve Jobs" inspired forensic interface designed for high-stakes energy trading:

- **Contextual Awareness**: The agent automatically detects the user's current route (Contact, Account, Dashboard) and offers proactive insights upon opening without a single click.
- **Neural Line Response**: Every AI transmission is anchored by a glowing vertical "Neural Line" spine in International Klein Blue, signifying a secure data uplink.
- **Forensic HUD Buttons**: 
    - **Dynamic Scaling**: Header icons (Bot, Dialer, Refresh) are precision-scaled to `22px-24px` for professional visibility.
    - **Haptic Animations**: `AnimatePresence` toggle transitions between the Architect icon and the "X" Close command.
- **Stealth User Commands**: User inputs are rendered as right-aligned `COMMAND_INPUT` blocks with increased immersion spacing (`gap-8`) to separate human intent from AI execution.
- **Visual Status**: 
    - **Live Waveform**: A dynamic bar animation that visualizes the AI's "thinking" process.
    - **Ambient Hum**: A subtle pulsing glow signifying active background monitoring.
- **Forensic Aesthetic**: Backdrop-blur-3xl glass containers, monospace typography, and an **International Klein Blue (#002FA7)** Execute button with haptic glow.

---

## 🧠 Intelligence Philosophy: "The Physics of Pricing"

The Nodal Architect is trained to align with the **Nodal Point Thesis**. It doesn't just manage data; it understands the "Source Code of the Grid."

### 1. Intelligence Stack (Multi-Model Fallback)
The Architect utilizes a sophisticated **Model_Stack** protocol. If the primary node is overloaded or hits a quota, it autonomously falls back through a chain of 14+ high-precision models (Gemini 3.0 Pro, Flash, 2.5, 2.0) to ensure zero downtime.

### 2. Deep Research Protocol (Perplexity)
In the event of a total Google Network saturation, the system initiates the **Perplexity Fallback**, leveraging real-time web-crawling intelligence for uncompromised grid research.

### 3. Forensic Analysis
When discussing accounts, the agent prioritizes the "Three Vectors of Cost Leakage":
- Identifying **Demand Ratchets**.
- Monitoring **4CP Coincident Peaks**.
- Predicting **Scarcity Pricing** risks.

---

## 🔮 Roadmap: Future Capabilities (Coming Soon)

We are actively expanding the Architect's "Brain" to include these forensic energy tools:

- **AI Bill Debugger**: Direct integration with the Bill Debugger logic to analyze uploaded invoices and identify hidden billing errors.
- **Predictive Curtailment Alerts**: Proactive notification logic where the agent warns users of upcoming high-price intervals.
- **Sequence Orchestration**: The ability for Gemini to enroll contacts into automated multi-channel follow-up sequences.
- **Voice Intelligence**: Summarizing Twilio call transcripts to extract "Commitment Events" and sentiment via the Walkie-Talkie interface.

---

## 🛠️ Technical Implementation
- **Primary Model**: `gemini-3-pro-preview` (The highest precision node for complex reasoning).
- **Intelligence Stack**: 14+ candidate models including `gemini-3-flash`, `gemini-2.5-pro`, and `gemini-2.0-flash`.
- **Final Fallback**: `perplexity-sonar-reasoning` (Real-time web-intelligence).
- **Backend**: Node.js Proxy on Port 3001.
- **Frontend**: Next.js 15 with Framer Motion "Obsidian & Glass" UI.
- **Security**: All tool calls are gated by Supabase RLS and server-side validation.

---
*Last Updated: 2026-01-25*
*Status: Nodal Architect v1.0 Operational*
