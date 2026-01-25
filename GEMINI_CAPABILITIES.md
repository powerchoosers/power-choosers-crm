# 🤖 Gemini Agent: Capabilities & Intelligence Roadmap

The **Gemini AI Assistant** is the cognitive core of the Nodal Point platform. It is not just a chatbot; it is a **Function-Calling Agent** integrated directly into our Supabase backend, Gmail services, and market intelligence APIs.

## 🚀 Current Active Capabilities

The agent is currently equipped with the following "Tools" which it can execute autonomously based on natural language commands:

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

## 🧠 Intelligence Philosophy: "The Physics of Pricing"

The Gemini Agent is being trained to align with the **Nodal Point Thesis**. It doesn't just manage data; it understands the "Source Code of the Grid."

### 1. Data Normalization
The agent understands our Supabase schema, including the complex `metadata` mapping from legacy Firestore data. It can bridge the gap between "Old CRM" and "New Platform" data structures seamlessly.

### 2. Forensic Analysis
When discussing accounts, the agent is designed to prioritize the "Three Vectors of Cost Leakage":
- Identifying **Demand Ratchets**.
- Monitoring **4CP Coincident Peaks**.
- Predicting **Scarcity Pricing** risks.

---

## 🔮 Roadmap: Future Capabilities (Coming Soon)

We are actively expanding the agent's "Brain" to include these forensic energy tools:

- **AI Bill Debugger**: (Planned) Direct integration with the Bill Debugger logic to analyze uploaded invoices and identify hidden billing errors.
- **Predictive Curtailment Alerts**: (Planned) Proactive notification logic where the agent warns users of upcoming high-price intervals.
- **Sequence Orchestration**: (Planned) The ability for Gemini to enroll contacts into automated multi-channel follow-up sequences.
- **Voice Intelligence**: (Planned) Summarizing Twilio call transcripts to extract "Commitment Events" and sentiment.

## 🛠️ Technical Implementation
- **Model**: `gemini-3-flash-preview` (Next-generation intelligence for high-precision tool calling).
- **Backend**: Node.js Proxy on Port 3001.
- **Frontend**: Next.js 15 with Framer Motion "Obsidian & Glass" UI.
- **Security**: All tool calls are gated by Supabase RLS and server-side validation.

---
*Last Updated: 2026-01-25*
*Status: Operational / Evolving*
