# Nodal Point: Protocol Builder Documentation (v2.0)

This document serves as the technical and conceptual source of truth for the **Protocol Builder**, a core component of the Nodal Point CRM. It is designed to provide comprehensive context for AI analysis and architectural suggestions.

---

## 🧩 1. Core Architecture
The Protocol Builder is a high-fidelity, node-based automation engine built with **React Flow** and **Next.js 15**. It allows users to design "Forensic Sequences"—automated workflows that simulate complex human interactions in the energy market.

### A. The Engine
- **Framework**: `@xyflow/react` (React Flow).
- **Implementation**: [page.tsx](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/crm-platform/src/app/network/protocols/[id]/builder/page.tsx).
- **Canvas (The Reactor)**: A custom-styled React Flow workspace with a dark, grid-based aesthetic (`BackgroundVariant.Dots`).
- **Nodes (Protocols)**: Custom React components representing individual steps:
    - `email`: AI-driven or manual email communication.
    - `call`: Forensic dialer steps with AI-generated PEACE scripts.
    - `linkedin`: Profile views and connection requests.
    - `recon`: Manual tasks (e.g., "Drop-in Packet").
    - `delay`: Latency nodes for timing control.
    - `trigger`: Behavioral event listeners.
    - `input`: The `Entry_Point` for the sequence.
- **Edges (Vectors)**: Visual connections representing behavioral triggers and routing logic. Handles are dynamically registered to prevent the "Connects to Center" bug using `useUpdateNodeInternals`.

### B. State Management
- **React Flow State**: Managed via `useNodesState` and `useEdgesState`.
- **Calibration State**: Local state tracking the `selectedNode`, `testContactId`, and `emailViewMode` (Payload vs. AI Prompt).
- **Two-Way Binding**: The `updateNodeData` helper ensures that changes in the Calibration Panel (Right Sidebar) are immediately reflected in the React Flow nodes on the canvas.
- **Debug Mode**: A "Slot Visualizer" toggle (`debugMode`) allows engineers to see handle registration and slot indices (`SLOT_0`, `SLOT_1`, etc.) for complex routing.

---

## 🤖 2. Nodal Architect (AI Integration)
The builder is powered by the **Nodal Architect**, an AI engine using the **ChatGPT-OSS** model via **OpenRouter** and **Gemini 1.5/2.0**.

### A. Optimization Modes
The AI logic is handled by [optimize.js](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/api/ai/optimize.js) and [generate-call-script.js](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/api/ai/generate-call-script.js):
1.  **`optimize_prompt`**: Instead of editing the email body directly, the AI improves the *Instruction Prompt*. It makes the instructions more specific, forensic, and aligned with Nodal Point philosophy (focusing on grid risk, 4CP peaks, and financial variance).
2.  **`generate_email`**: Uses the Instruction Prompt + Contact Data (Name, Company, Load Zone) to generate a personalized, high-fidelity email preview.
3.  **`PEACE_Script`**: For `call` nodes, the AI generates scripts using the **PEACE Framework**:
    - **P**re-call (Strategy/Angle)
    - **O**pener (Strong Hook)
    - **S**ituation (Discovery Hook)
    - **P**roblem (Risk Exposure)
    - **S**olution (Low-Friction Next Step)
    - **C**lose (Clear CTA)
    - **S**ettle (Wrap-up)
4.  **`Perplexity_Research`**: Automatically performs web research on companies to find news, leadership changes, and hiring signals to inject into scripts.

### B. Auto-Preview Logic
- When a user selects a contact in the **Test_Protocol** tab, a `useEffect` hook triggers `generateEmailPreview`.
- This calls the AI to generate a live preview of what the email would look like for that specific contact, providing immediate feedback on the prompt's effectiveness.
- **Preview UI**: Supports toggling between **Mobile** and **Desktop** viewports to ensure forensic clarity across devices.

---

## 🎨 3. Design Philosophy (Obsidian & Glass)
The UI follows a strict **Forensic Instrument Aesthetic** defined in [nodalpoint.md](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/.trae/rules/nodalpoint.md).

### A. Visual Standards
- **Aesthetic**: Frosted glass effects (`backdrop-blur-2xl`), subtle white borders (`border-white/5`), and monochromatic depth.
- **Typography**: `font-mono tabular-nums` for all technical data and metrics.
- **Color Palette**: International Klein Blue (`#002FA7`) for accents and primary vectors; Emerald for AI/Active states; Rose for critical risks.
- **Iconography**: Strict **Squircle** shapes (`rounded-2xl` for large, `rounded-[14px]` for small).

### B. Interactive Components
- **The Toolbar (Left)**: Houses "Protocol Templates" (Email, Call, etc.) and "Behavioral Vectors" (Opened, Positive, Booked).
- **The Calibration Panel (Right)**: Features a dual-mode editor for Email nodes:
    - **Payload Matrix**: Manual editor with variable insertion:
        - `{{first_name}}`, `{{last_name}}`
        - `{{company_name}}`
        - `{{load_zone}}`
        - `{{scarcity_risk}}` (High/Med/Low signal)
    - **AI Instruction Prompt**: The interface for the Nodal Architect.
- **Haptic Feedback**: Hover effects use "Bloom" shadows and subtle scale transitions.

---

## 📡 4. Data Structures & Connectivity
### A. Node Data Schema
Every node on the canvas contains a `data` object:
```typescript
{
  label: string;       // Visual name of the node
  type: string;        // 'email', 'call', 'linkedin', 'recon', 'delay', 'trigger', 'input'
  prompt?: string;     // AI Instructions (The "Brain")
  body?: string;       // The actual content (Generated or Manual)
  subject?: string;    // Email subject line
  delay?: string;      // Latency in days after previous step
  isTargeted?: boolean;// Visual highlight for active testing
  activeHandleId?: string; // Currently active outcome during simulation
  debugSlotIndex?: number; // Internal slot mapping index
  outcomes: Array<{    // Branching logic (Vectors)
    id: string;
    label: string;
  }>;
}
```

### B. Vector Routing (Edges)
- **Outcome Icons**: Vectors are visually categorized using specific icons:
    - `Opened`, `Clicked`: Emerald `ArrowUpRight`
    - `Positive`: Emerald `CheckCircle2`
    - `Negative`, `No Reply`: Rose `XCircle` / `ArrowUpRight`
    - `No Answer`: Zinc `PhoneMissed`
    - `Booked`, `Meeting`: Amber `CalendarCheck`
- **Handle Mapping**: Every outcome generates a unique source handle on the node, allowing for precise 1-to-1 routing. Handles are indexed and slotted at the bottom of the node.

---

## 🛠️ 5. Integration Points
- **Backend Proxy**: [server.js](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/server.js) handles API requests for AI optimization, ensuring seamless communication between the Next.js frontend and the OpenRouter API.
- **Contact Sync**: Uses `useContacts` hook to fetch real CRM data from Supabase for testing protocols.
- **Environment**: Relies on `OPEN_ROUTER_API_KEY` for AI services and `API_BASE_URL` for routing.

---

## 🎯 6. Strategic Intent
The Protocol Builder is not just an automation tool; it is an **Engineering Workbench**. It treats market communication as a quantitative problem. The goal is to "delete" customer energy liability through forensic analysis and perfectly timed, AI-driven interventions.
