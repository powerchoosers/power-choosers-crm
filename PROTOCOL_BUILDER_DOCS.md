# Nodal Point: Protocol Builder Documentation (v2.0.4)

This document serves as the technical and conceptual source of truth for the **Protocol Builder**, a core component of the Nodal Point CRM. It is designed to provide comprehensive context for AI analysis and architectural suggestions.

---

## 🧩 1. Core Architecture
The Protocol Builder is a high-fidelity, node-based automation engine built with **React Flow** and **Next.js 15**. It allows users to design "Forensic Sequences"—automated workflows that simulate complex human interactions in the energy market.

### A. The Engine
- **Framework**: `@xyflow/react` (React Flow).
- **Implementation**: `crm-platform/src/app/network/protocols/[id]/builder/page.tsx`.
- **Data Layer**: Protocols are stored as **sequences** in Supabase. The builder reads/writes via `useProtocolBuilder(id)`, which persists the graph as `bgvector: { nodes, edges }` on the `sequences` table. See **Integration Points** below.
- **Canvas (The Reactor)**: A custom-styled React Flow workspace with a dark, grid-based aesthetic (`BackgroundVariant.Dots`), using Void-standard utility classes (`nodal-void-card`, `nodal-module-glass`, `nodal-monolith-edge`, `nodal-recessed`).
- **Nodes (Protocols)**: Custom React components (`protocolNode` type) representing individual steps:
    - `input`: The **Entry_Point** for the sequence (single per flow).
    - `email`: AI-driven or manual email communication.
    - `call`: Forensic dialer steps with script templates (Gatekeeper Bypass, CFO Direct, Follow-up/Voicemail).
    - `linkedin`: Profile views and connection requests (Signal_Type: VIEW, INTERACT, CONNECT, MESSAGE).
    - `recon`: Manual tasks (e.g., "Drop-in Packet").
    - `delay`: Latency nodes for timing control (delay in days after previous node).
    - `trigger`: Behavioral event listeners.
    - `split`: **Interaction Split**—branching node with configurable outcomes (e.g. Opened, No Reply); max 3 outcomes per node.
- **Edges (Vectors)**: Visual connections representing behavioral triggers and routing logic. Handles are dynamically registered to prevent the "Connects to Center" bug using `useUpdateNodeInternals`. Each outcome has a dedicated source handle; drag-and-drop uses slot calculation for correct handle targeting.

### B. State Management
- **React Flow State**: Managed via `useNodesState` and `useEdgesState`. Initial load populates from `protocol?.bgvector.nodes` / `protocol?.bgvector.edges` when present.
- **Dirty State**: `isDirty` is set on node/edge changes; exit and `beforeunload` warn when there are unsaved changes.
- **Calibration State**: Local state tracks `selectedNode`, `testContactId`, `emailViewMode` (Payload vs. AI), `hoveredNodeId`, `activeHandleId`, and `debugMode`.
- **Two-Way Binding**: The `updateNodeData(nodeId, newData)` helper updates both the nodes array and `selectedNode`, so the Calibration Panel and canvas stay in sync.
- **Debug Mode**: A "Debug_On" / "Debug_Off" toggle enables the **Slot Visualizer** (slot indices overlaid on outcome handles) and the **Canvas_Metrics** debug panel (hover node, active handle, slot index, drop position, closest node, edge count, etc.).

---

## 🤖 2. Nodal Architect (AI Integration)
The builder is powered by the **Nodal Architect**, an AI engine using **OpenRouter** and **Gemini** (via `api/ai/optimize.js`).

### A. Optimization Modes (Single Endpoint)
All AI flows use **`POST /api/ai/optimize`** (proxied via Next.js to the backend). The `mode` parameter selects behavior:
1. **`optimize_prompt`**: Improves the *Instruction Prompt* (Architect Role, Liability Objective, Forensic Constraints). Used by "Calibrate_Strategy_AI"; does not edit the email body directly.
2. **`generate_email`**: Uses the Instruction Prompt plus contact data (name, company, industry, load_zone, contractEndDate, metadata) to generate a personalized email preview. Returns `optimized` (body), `subject`, and `logic` (rationale). Used for the Test_Protocol live preview.

Call scripts (PEACE Framework) and Perplexity research are referenced in design; the builder UI currently uses the single optimize endpoint for email optimization and generation.

### B. Calibration Panel – AI Strategy View
For **email** nodes, the right panel offers two modes (Payload Matrix vs. Context Matrix):
- **Payload Matrix**: Manual body with variable dropdown (`first_name`, `last_name`, `company_name`, `load_zone`, `scarcity_risk`).
- **Context Matrix (AI)**: Structured prompt builder with **Architect_Role**, **Liability_Objective**, **Forensic_Constraints**; **Data_Vector_Injection** checkboxes (Firmographics, Energy Metrics, Recent News, Contract Expiry); and **Calibrate_Strategy_AI** button that calls `optimize_prompt` and optionally regenerates preview for the selected test contact.

### C. Auto-Preview Logic
- When a user selects a contact in the **Test_Protocol** tab and the selected node is an email with a prompt, a `useEffect` triggers `generateEmailPreview()`.
- Preview replaces variables (`{{first_name}}`, `{{last_name}}`, `{{company_name}}`, `{{load_zone}}`, `{{scarcity_risk}}`) with contact data and shows **Neural_Logic** (AI rationale) and **Deliverability Forecast** (Spam_Score, Sentiment placeholders).
- **Preview UI**: Toggle between **Mobile** and **Desktop** viewports; loading overlay while simulation runs.

---

## 🎨 3. Design Philosophy (Obsidian & Glass)
The UI follows the **Forensic Instrument Aesthetic** and **Void** standard defined in `.trae/rules/nodalpoint.md` and `build.md`.

### A. Visual Standards
- **Aesthetic**: Frosted glass (`backdrop-blur-2xl`), thin monolith borders (`border-white/5`), Void utility classes: `nodal-void-card`, `nodal-module-glass`, `nodal-monolith-edge`, `nodal-recessed`.
- **Typography**: `font-mono tabular-nums` for technical data and metrics.
- **Color Palette**: International Klein Blue (`#002FA7`) for accents and primary vectors; Emerald for AI/active states; Rose for negative/critical; Amber for booked/meeting; Zinc for neutral (e.g. No Answer).
- **Iconography**: **Squircle** shapes—`rounded-2xl` for large elements, `rounded-[14px]` for small icons (per nodalpoint.md).

### B. Page Header
- **Back** (ChevronLeft) triggers exit with unsaved-changes dialog when `isDirty`.
- **Status**: LED indicator (amber = Unsaved_Changes, emerald = Synced) and protocol ID snippet.
- **Sequence emails send from**: Displays `{First Name | Nodal Point} <{localPart}@getnodalpoint.com>` using `getBurnerSenderName(profile?.firstName)` and `getBurnerFromEmail(user?.email)` from `@/lib/burner-email`. This reflects the authenticated user and burner domain for sequence sends.
- **Debug_On/Off**, **Save_Draft**, **Deploy_Protocol** (Deploy_Protocol is present but not yet wired).

### C. Interactive Components
- **The Armory (Left Sidebar)**: Draggable **Protocol Templates**—Email, Voice (call), Signal (linkedin), Recon, Delay, Trigger—and **Vectors**: Opened, No_Reply, Clicked, Positive, Negative, Booked, No_Answer. Dragging a vector onto a node adds an outcome to that node (max 3 outcomes per node).
- **The Reactor (Canvas)**: React Flow canvas with Controls, **Canvas_Metrics** panel (Nodes/Vectors count, version v2.0.4; when debug on: hover node, active handle, slot index, drop coordinates, etc.).
- **The Calibration Panel (Right)**: Contextual; visible when a node is selected. Tabs: **Calibration**, **Test_Protocol**. Includes Protocol Label, Type, **Interaction_Branches** (outcome labels, add/remove, presets: Opened, Clicked, Positive Call, Meeting Booked, No Answer, Negative Call), LinkedIn **Signal_Type**, Call **Script_Template**, Email **Subject_Matrix**, **Latency_Delay** (days), and the dual-mode email editor (Payload Matrix with variable dropdown vs. AI Context Matrix with role/objective/constraints and Data_Vector_Injection). Duplicate and Delete node actions in the header.
- **Sync_Block Footer**: Standardized footer with Sync_Block label, Total_Nodes, Operational_Link, version v2.0.4-NP.
- **Exit Dialog**: On exit with unsaved changes—Cancel, Discard Changes, or Save & Exit.

---

## 📡 4. Data Structures & Connectivity
### A. Persistence
- **Table**: `sequences` (Supabase). Each protocol is a row keyed by `id` (route param `[id]`).
- **Stored shape**: `bgvector: { nodes: Node[], edges: Edge[] }`. Full React Flow nodes/edges are persisted.
- **Hook**: `useProtocolBuilder(id)` in `@/hooks/useProtocolBuilder.ts`—fetches the sequence by `id`, exposes `protocol`, `saveProtocol({ nodes, edges })`, `isSaving`. Save updates `sequences.bgvector` and `updatedAt`. Query key: `['protocol', id]`. Disabled when `id === '123'` (test protocol).
- **Test Protocol**: When `id === '123'`, the builder loads mock nodes/edges (TEST_PROTOCOL_ID). Save is disabled (toast: "Cannot save test protocol (Read Only)").

### B. Node Data Schema
Every node has `type: 'protocolNode'` and a `data` object. New nodes (on drop) receive:
```typescript
{
  label: string;           // Visual name
  type: string;            // 'email' | 'call' | 'linkedin' | 'recon' | 'delay' | 'trigger' | 'input' | 'split'
  subject?: string;        // Email subject
  body?: string;           // Email/body content (manual or AI-generated)
  delay?: string;          // Latency in days after previous node (default '1')
  signalType?: string;     // LinkedIn: 'VIEW' | 'INTERACT' | 'CONNECT' | 'MESSAGE'
  templateId?: string;     // Call: 'gatekeeper' | 'cfo_direct' | 'follow_up'
  condition?: string;      // e.g. 'opened'
  prompt?: string;         // Concatenated AI instructions (role + objective + constraints)
  promptConfig?: { role?: string; objective?: string; constraints?: string };
  vectors?: string[];      // Data_Vector_Injection: 'firmographics' | 'energy_metrics' | 'recent_news' | 'contract_expiry'
  outcomes: Array<{ id: string; label: string }>;  // Max 3; empty for non-split, or e.g. [{ id, label: 'Opened' }, { id, label: 'No Reply' }]
  isTargeted?: boolean;    // Set during drag-over for magnet targeting
  activeHandleId?: string | null;
  debugSlotIndex?: number; // Shown in debug mode
}
```

### C. Vector Routing (Edges)
- **Outcome Icons** (by outcome label): Opened/Clicked—Emerald ArrowUpRight; Positive—CheckCircle2; Negative/No Reply—Rose XCircle/ArrowUpRight; No Answer—PhoneMissed; Booked/Meeting—CalendarCheck.
- **Handle Mapping**: Each outcome has a source handle with `id === outcome.id`, positioned at the bottom of the node with slot-based layout. Edges store `sourceHandle` for correct routing. On connect, edge gets `label`, `labelStyle`, and `style` from the outcome.
- **Drag-and-Drop**: Dropping a new node near an existing node with outcomes uses distance-based slot calculation (`nodeWidth`, `relativeX`, `slotWidth`) to pick the correct `sourceHandle`. Magnet threshold 250px; vector-add threshold 150px.

---

## 🛠️ 5. Integration Points
- **Backend Proxy**: `server.js` routes `/api/ai/optimize` to `api/ai/optimize.js`. Next.js rewrites `/api/*` to the backend, so the builder calls `fetch('/api/ai/optimize', { method: 'POST', body: JSON.stringify({ prompt, provider: 'openrouter', type, mode, context: 'sequence_step', contact? }) })`.
- **Protocol CRUD**: `useProtocolBuilder(id)` reads/writes `sequences` via Supabase client; `saveProtocol({ nodes, edges })` updates `bgvector` and `updatedAt`.
- **Contact Sync**: `useContacts()` (TanStack Query) supplies paginated contacts for the Test_Protocol contact dropdown.
- **Auth & Sender Display**: `useAuth()` provides `user` and `profile`; `getBurnerFromEmail(user?.email)` and `getBurnerSenderName(profile?.firstName)` from `@/lib/burner-email` power the "Sequence emails send from" line (burner domain: getnodalpoint.com).
- **Environment**: AI uses `OPEN_ROUTER_API_KEY`; app uses `API_BASE_URL` for backend routing where applicable.

---

## 🎯 6. Strategic Intent
The Protocol Builder is not just an automation tool; it is an **Engineering Workbench**. It treats market communication as a quantitative problem. The goal is to "delete" customer energy liability through forensic analysis and perfectly timed, AI-driven interventions.

---

## 📋 7. Quick Reference (Current Implementation)
- **Route**: `/network/protocols/[id]/builder`
- **Version**: v2.0.4 (Canvas_Metrics panel, Sync_Block footer)
- **Test protocol ID**: `123` (read-only mock data)
- **Save**: Persists `nodes` and `edges` to `sequences.bgvector`; unsaved changes trigger exit dialog and `beforeunload`
- **Test_Protocol tab**: Select contact → preview pane (Desktop/Mobile) with variable substitution, optional Neural_Logic block, and Deliverability Forecast (Spam_Score / Sentiment placeholders)
- **Files**: `crm-platform/src/app/network/protocols/[id]/builder/page.tsx`, `crm-platform/src/hooks/useProtocolBuilder.ts`, `api/ai/optimize.js`
