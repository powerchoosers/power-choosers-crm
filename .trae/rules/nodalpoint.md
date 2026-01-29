# Nodal Point CRM Platform

Welcome to the **Nodal Point CRM Platform**, a modern, scalable, and high-performance Customer Relationship Management system built with Next.js 15. This platform is the evolution of the legacy "Power Choosers CRM".

## 🚀 Tech Stack

- **Framework:** [Next.js 15+](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **State Management:**
  - [Zustand](https://github.com/pmndrs/zustand) (Global Client State)
  - [TanStack Query](https://tanstack.com/query/latest) (Server State / Async Data)
- **Database:**
  - **Supabase** (PostgreSQL) - Primary Data & Vector Store
  - **Firestore** (Legacy/Deprecating) - Read-only reference
- **UI Components:**
  - [Radix UI](https://www.radix-ui.com/) (Headless Primitives)
  - [Lucide React](https://lucide.dev/) (Icons)
  - [Framer Motion](https://www.framer.com/motion/) (Animations)
- **Authentication:** Firebase Auth & Firestore
- **Backend/API:** Node.js (Legacy Server & API Proxy)

## 🛠️ Project Structure

The project is divided into two main parts:

1.  **`crm-platform/` (Frontend)**: The new Next.js application containing all UI, routing, and client-side logic.
2.  **Root Directory (Backend)**: Contains `server.js` and `api/` folders, serving as the backend API and legacy feature support.

```
Power Choosers CRM/
├── crm-platform/           # New Next.js Application (MAIN ENTRY POINT)
│   ├── src/
│   │   ├── app/            # App Router (Pages & Layouts)
│   │   ├── components/     # Reusable UI Components
│   │   ├── context/        # React Context Providers
│   │   ├── lib/            # Utilities & Firebase Config
│   │   └── store/          # Zustand Stores
│   ├── public/             # Static Assets (Images)
│   │   └── images/         # Image assets
│   └── package.json        # Frontend Dependencies
├── api/                    # Backend API Endpoints
├── backups/                # Legacy HTML Dashboard (Reference Only)
├── server.js               # Node.js Server (API & Legacy Support)
└── feature-tracking.md     # Migration Status Log
```

## 🗄️ Database & Migration

The platform has transitioned from **Firebase/Firestore** to **Supabase (PostgreSQL)**.

### 1. Supabase Schema Strategy
- **Relational Integrity**: We use foreign keys (e.g., `contacts.accountId` -> `accounts.id`) to maintain data consistency.
- **Metadata JSONB**: Every migrated record includes a `metadata` column containing the **original Firestore document**. This ensures no data is lost during the transition.
- **Unified Contacts**: The legacy `people` and `contacts` collections have been merged into a single `contacts` table in Supabase.
- **Location Data**: `city` and `state` are now top-level columns in the `contacts` table, indexed for performance.

### 2. Data Mapping & Normalization
Due to varying structures in legacy data, we use a normalization layer in our hooks (see `useContacts.ts`):
- **Name Resolution**: We prioritize `firstName`/`lastName` columns, then fall back to `first_name`/`last_name` (underscore format), and finally check nested paths in `metadata` (e.g., `metadata.general.firstName`).
- **Location Resolution**: We prioritize the specific `city`/`state` columns on the contact record. If absent, we fall back to the linked Account's location to ensure no "Unknown" gaps.
- **Metadata Parsing**: In some cases, Supabase returns the `metadata` column as a stringified JSON string. We use `normalizeMetadata` to safely parse these values.
- **Energy Data**: Account-level energy metrics (Strike Price, Annual Usage, etc.) are promoted to top-level columns in the `accounts` table for performance.

## ⚡ Quick Start & Architecture

The platform operates using a **Three-Server Architecture**:

### 1. Frontend (Next.js)
The modern UI for users.
- **Local**: `http://localhost:3000`
- **Command**: `cd crm-platform; npm run dev -- --port 3000`

### 2. Local Backend (Node.js)
Handles API requests and legacy logic during development.
- **Local**: `http://127.0.0.1:3001`
- **Command**: `node server.js` (Root Directory)

### 3. Production Environment (Cloud Run)
The live platform operates across two distinct Cloud Run services in the **`us-central1`** region (optimized for cost and custom domain mapping):
- **Frontend (UI)**: `https://power-choosers-crm-792458658491.us-central1.run.app` (Mapped to `https://nodalpoint.io`)
- **Backend (Network/API)**: `https://nodal-point-network-792458658491.us-central1.run.app`
- **Architecture**: The Frontend service handles the UI and routing, while the Network service handles Twilio webhooks, heavy API processing, and legacy backend logic.
- **Cost Optimization**: We use **Cloud Run Domain Mapping** instead of a Global Load Balancer to eliminate idle networking costs.

## 📍 Routing & Proxy Logic

We use **Next.js Rewrites** (`next.config.ts`) to handle seamless communication between the frontend and the correct backend:

- **In Development**: All `/api/*` requests are proxied to the **Local Backend** (`127.0.0.1:3001`).
- **In Production**: All `/api/*` requests are proxied to the **Network/API Service** in `us-central1`.

This ensures that code remains environment-agnostic while maintaining full functionality across `localhost` and `nodalpoint.io`.

## 🧠 Nodal Point Philosophy & Methodology

The Nodal Point platform is not just a CRM; it is an implementation of a specific market thesis. All public-facing pages and tools must align with this worldview.

### 1. The Core Concept: "The Physics of Pricing"
The Texas energy market is not a commodity market; it is a **volatility market**. Standard brokerage treats electricity like a fixed-rate subscription, which is a fundamental error. Nodal Point treats a client's load profile as a dynamic data set to be engineered.

### 2. The Three Vectors of Cost Leakage
We do not guess. We measure. Our software is designed to mitigate three specific "enemies" in the grid code:

1.  **Demand Ratchets ("Ghost Capacity")**:
    -   *Problem*: Spiking to 1,000 kW for 15 minutes sets a billing floor of 800 kW for 11 months.
    -   *Fix*: Real-time variance monitoring (Metered vs. Billed) to trigger load shedding.
2.  **4CP Coincident Peaks (Transmission Costs)**:
    -   *Problem*: Costs based on the 4 highest usage intervals in June, July, August, Sept.
    -   *Fix*: Predictive curtailment to "delete" transmission liability for the next year.
3.  **Scarcity Pricing (The Volatility)**:
    -   *Problem*: Real-time prices spiking to $5,000/MWh.
    -   *Fix*: Algorithmic avoidance based on Grid Reserve margins.

### 3. Public Design Ethos ("The Steve Jobs Touch")
-   **Tone**: Dense, intellectual, and intimidatingly smart. We filter out tire-kickers.
-   **Visuals**: Monochromatic diagrams, clean text, mathematical formulas. No stock photos of wind turbines or handshakes.
-   **Structure**:
    -   **Philosophy**: Abstract, high-level, "Data is Truth".
    -   **Methodology**: "Source Code of the Grid", pseudo-code blocks, technical specs.
    -   **Call to Action**: "You have seen the math. Now see your data." (Drive users to the Bill Debugger).

## 🔑 Authentication

The platform uses **Firebase Authentication**.
- **Login**: Users must authenticate via the `/login` page.
- **Protection**: Routes under `/network` are protected by Next.js Middleware.
- **Session**: A session cookie (`np_session`) is used to persist login state across the application.

## 📝 Development Workflow

1.  **Focus**: All new feature development happens in `crm-platform/`.
2.  **Reference**: Use `backups/crm-dashboard.html` **only** to understand legacy business logic. Do not edit legacy files for new features.
3.  **Migration**: When migrating a feature:
    - Analyze the legacy implementation.
    - Create/Update TypeScript interfaces in `src/types/`.
    - Build modular components in `src/components/`.
    - Use React Query for data fetching.
    - Verify against the legacy behavior.

## 🎨 Design Guidelines

- **Theme**: Dark/Light mode support (System default).
- **Brand**: "Nodal Point" - Clean, Enterprise, Modern.
- **Visual Style**: **Obsidian & Glass** (Frosted glass, high blur, subtle borders) over solid opaque backgrounds for floating elements.
  - **Forensic Instrument Aesthetic**: Components should feel like physical instruments (e.g., cockpit displays, high-end stereo receivers).
  - **Monolith Borders**: Use `bg-gradient-to-b from-white/5 to-transparent` on a `relative` container with a 1px border to simulate a top-down light source catching the edge.
  - **Tabular Data**: ALWAYS use `font-mono tabular-nums tracking-tight` for phone numbers, currency, dates, mathematical values, and IDs.
  - **Haptic Buttons**: Primary action buttons should use a "Bloom" effect on hover (`hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]`).
  - **Sync_Block Protocol**: All collection pages MUST feature a `Sync_Block` footer displaying the current range (e.g., `Sync_Block 01–50`) and `Total_Nodes` count.
  - **LED Status**: Use pulsing LED dots for status indicators (Active, Operational) instead of generic pills.
  - **Iconography**: All interface icons (Lucide/SVG) must be **White** (`text-white`) on dark backgrounds. Do not use Klein Blue (`#002FA7`) for icons; reserve it for text accents and interactive states.

### 🤖 Nodal Architect (Gemini Chat)
The cognitive core of the platform, featuring a **Stacked Command Deck** UI (v1.3):
- **Tier 1: Configuration Deck**: Houses the model selector and **Contextual Intel Pill**.
  - Displays `TARGET: [NAME]` for contacts/accounts or `ACTIVE_CONTEXT: GLOBAL_SCOPE`.
- **Tier 2: Action Deck**: Auto-expanding `textarea` (44px min, 112px max) with a Klein Blue Execute button.
- **Anti-Hallucination Protocol (v2)**: Strict logic ensuring zero data invention for contract dates and contact metrics.
- **Forensic HUD Components**:
  - `News_Ticker`: Real-time market volatility feed.
  - `Contact_Dossier`: Detailed node profiles with contract status.
  - `Position_Maturity`: Interactive contract expiration and revenue visualization.
  - `Forensic_Grid`: High-density tabular data for deep analysis.
- **Model Stack Fallback**: Autonomously routes through `gpt-oss-120b`, Gemini 2.0/1.5, and Perplexity (Sonar) for zero-downtime intelligence.

### 📞 Voice & Twilio Integration
The platform includes a native forensic dialer:
- **Dialer HUD**: Integrated into the `TopBar`, supporting manual entry and contact-linked dialing.
- **Active Call HUD**: Real-time duration tracking, mute, and hangup controls.
- **State Management**: Managed via `useCallStore` (Zustand) and `VoiceContext` (SDK integration).

### 📧 Email & Communication
- **Gmail Sync**: `useGmailSync.ts` handles real-time sync with Gmail API and Firestore deduplication.
- **Tracking**: Integrated Open/Click tracking statistics directly in the forensic list views.
- **Compose**: `ComposeModal` for secure, branded communication.

### 🔍 Forensic Dossier Features
- **Call Insights**: Replaces legacy Bill History with real-time AI-summarized call logs.
- **Forensic Log**: Direct access to neural history for specific contacts.
- **Context Lock**: Visual indicator in the header ensuring the agent is focused on the correct node.
- **Bill Debugger**: A standalone forensic tool (`/bill-debugger`) for analyzing energy invoices via Gemini.

- **AI Integration**: Use the "Sparkles" icon (`lucide-react/Sparkles`) for all AI-powered features.
- **Contact Avatars**: **STRICT RULE**: Use letter glyphs (initials) instead of company logos for contact avatars.
  - **Styles**: `rounded-2xl`, `nodal-glass`, `text-white/90`, `border-white/10`.
  - **Shadows**: Must use `shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)]` to match container shape.
  - Applies to both `PeoplePage` table rows and the `ContactDossierPage` header.
- **Layout**: Sidebar (Left), Top Bar (Header), Right Panel (Contextual Widgets).
- **Animations**:
  - **Page Entry**: Public pages use a standard "Blur In" effect (`filter: blur(10px)` → `blur(0px)`) combined with opacity fade.
  - **Staggered Elements**: Lists and grids should use staggered entry delays.
  - **Enter Transitions**: `animate-in fade-in slide-in-from-bottom-4 duration-500`.
  - **Haptic Transitions**: Use `framer-motion` `layout` and `spring` transitions (bounce: 0, duration: 0.4) for all UI expansions.

### 🔡 Typography & Branding Consistency
- **Public Pages (Landing, Philosophy, etc.)**:
  - **Headers**: `font-semibold`, `tracking-tighter`, `text-zinc-900`.
  - **Body Text**: `font-light` or `font-normal`, `text-zinc-500` or `text-zinc-600`.
  - **Accent**: `text-[#002FA7]` (International Klein Blue).
  - **Font Family**: System Default Sans (via Tailwind `font-sans`). Do NOT override with Inter unless globally applied.
- **Platform App**: Uses `Inter` (via `layout.tsx`).

## 📐 Standardized Page Layout

All main application pages (Accounts, People, Sequences, Lists, etc.) must follow this standardized layout structure to ensure a consistent UX:

1.  **Container**: Fixed height with entry animation.
    ```tsx
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
    ```
2.  **Primary Action Button**: White background, dark text (Klein Blue is for accents, not primary buttons).
    ```tsx
    <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium">
    ```
3.  **Search/Filter Bar**: Backdrop blur, zinc-900/50 background, input with `focus-visible:ring-indigo-500`.
    ```tsx
    <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
    ```
4.  **Data Container (Table/Grid)**: Rounded, bordered, backdrop blur.
    ```tsx
    <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
    ```
5.  **Sticky Header**: For tables, the header must be sticky with a subtle blur.
    ```tsx
    <TableHeader className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-sm border-b border-white/5">
    ```
6.  **Table Rows**: Hover effects and click-to-navigate.
    ```tsx
    <TableRow className="border-white/5 hover:bg-white/5 transition-colors group cursor-pointer">
    ```
7.  **Footer (Sync_Block)**:
    ```tsx
    <div className="p-4 border-t border-white/5 bg-black/20 flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
      <div>Sync_Block 01–50</div>
      <div className="flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        Total_Nodes: {count}
      </div>
    </div>
    ```

## 📚 Documentation Maintenance
- **Self-Update Rule**: Whenever significant features, architectural patterns, or new workflows are introduced:
  1. This file (`nodalpoint.md`) MUST be updated to reflect the current state.
  2. The `builder-agent-instructions.md` file MUST be updated if operational rules change.
  3. The root `README.md` should be checked for high-level summary updates.
- **Goal**: Zero drift between codebase and documentation.

## 📄 License

Private & Confidential - Nodal Point / Power Choosers CRM.
