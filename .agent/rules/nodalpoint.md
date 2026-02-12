---
alwaysApply: false
description: when needing a refresher of certain features of Nodal Point CRM
---
# Nodal Point CRM Platform

Welcome to the **Nodal Point CRM Platform**, a modern, scalable, and high-performance Customer Relationship Management system built with Next.js 16. This platform is the evolution of the legacy "Power Choosers CRM".

## 🚀 Tech Stack

- **Framework:** [Next.js 16+](https://nextjs.org/) (App Router, Turbopack) — current: 16.1.4
- **Runtime:** React 19
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) v4
- **State Management:**
  - [Zustand](https://github.com/pmndrs/zustand) (Global Client State: callStore, geminiStore, syncStore, uiStore)
  - [TanStack Query](https://tanstack.com/query/latest) (Server State / Async Data), persisted to IndexedDB via `lib/persister.ts` for calls, market-pulse, eia-retail-tx, scripts
- **Database:**
  - **Supabase** (PostgreSQL) — Primary Data & Vector Store
  - **Firestore** (Legacy/Deprecating) — Read-only reference
- **UI Components:**
  - [Radix UI](https://www.radix-ui.com/) (Headless Primitives)
  - [Lucide React](https://lucide.dev/) (Icons)
  - [Framer Motion](https://www.framer.com/motion/) (Animations)
- **Authentication:** Firebase Auth (login); Supabase `users` table (profile: role, name, Twilio settings, etc.)
- **Backend/API:** Node.js (Legacy Server & API Proxy at root). Key API routes include `/api/market/ercot`, `/api/market/eia`, `/api/weather` (Google Weather API; lat/lng or geocode from address/city+state), `/api/maps/geocode`.

## 🛠️ Project Structure

The project is divided into two main parts:

1.  **`crm-platform/` (Frontend)**: The new Next.js application containing all UI, routing, and client-side logic.
2.  **Root Directory (Backend)**: Contains `server.js` and `api/` folders, serving as the backend API and legacy feature support.

```
Power Choosers CRM/
├── crm-platform/           # New Next.js Application (MAIN ENTRY POINT)
│   ├── src/
│   │   ├── app/            # App Router (Pages & Layouts)
│   │   ├── components/     # Reusable UI (modals, layout, ui, crm, calls, etc.)
│   │   ├── context/        # AuthContext, VoiceContext
│   │   ├── hooks/          # Data & UI hooks (useContacts, useCalls, useAccounts, etc.)
│   │   ├── lib/            # supabase, firebase, persister, market-mapping, utils
│   │   ├── store/          # Zustand: callStore, geminiStore, syncStore, uiStore
│   │   └── types/          # TypeScript interfaces
│   ├── public/             # Static Assets (images, scripts)
│   └── package.json        # Frontend Dependencies
├── api/                    # Backend API Endpoints (Twilio, etc.)
├── backups/                # Legacy HTML Dashboard (Reference Only)
├── server.js               # Node.js Backend (API & Legacy Support)
├── scripts/dev-all.js      # Starts Next.js + backend (npm run dev:all)
└── feature-tracking.md    # Migration Status Log
```

### Key Routes (App Router)

- **Public**: `/`, `/login`, `/philosophy`, `/technical-docs`
- **Protected** (`/network`): `/network` (dashboard), `/network/accounts`, `/network/accounts/[id]`, `/network/people`, `/network/contacts/[id]` (contact dossier), `/network/calls`, `/network/emails`, `/network/emails/[id]`, `/network/tasks`, `/network/targets`, `/network/targets/[id]` (list detail), `/network/protocols`, `/network/protocols/[id]/builder`, `/network/scripts`, `/network/settings`, `/network/infrastructure`, `/network/telemetry` (Market Telemetry), `/network/vault`
- **Other**: `/bill-debugger`, `/market-data`, `/contact`, `/debug/connectivity`

Providers (`src/app/providers.tsx`): `PersistQueryClientProvider` (TanStack Query + IndexedDB), `AuthProvider`, `VoiceProvider`, `ChunkLoadErrorHandler`.

## 🗄️ Database & Migration

The platform has transitioned from **Firebase/Firestore** to **Supabase (PostgreSQL)**. For relationship or schema errors (e.g. "more than one relationship found"), inspect the live schema (foreign key names, column casing) and use **exact** constraint names in queries—see `SUPABASE DOCS/` and the project MCP tools for `supabase_execute_sql` when debugging.

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

### 3. Bulk Data Ingestion (BulkImportModal)
The platform features a high-performance CSV ingestion system with intelligent field mapping:
- **Persistent Mapping Caching**: Field mappings are cached in `localStorage` using vector-specific keys (`nodal_import_mapping_CONTACTS` vs. `nodal_import_mapping_ACCOUNTS`). This ensures that re-uploading similar CSV structures requires zero reconfiguration.
- **Forensic Log Integration**: The `description` field for accounts is mapped as "Forensic Log / Description" to align with the `FORENSIC_LOG_STREAM` component on Account Dossier pages.
- **Automated Mapping Recovery**: The system prioritizes user-defined cached mappings over automated field detection to maintain consistency across batches.
- **Schema Parity Rule**: When adding new fields to the CRM (Accounts or Contacts), they **MUST** be added to the `ACCOUNT_FIELDS` or `CONTACT_FIELDS` arrays in `src/components/modals/BulkImportModal.tsx` and the corresponding ingestion logic to maintain parity.

### 4. Apollo News (Target Signal Stream) & Telemetry
- **Apollo News Storage**: Company news/signals per domain live in `apollo_news_refresh` (last refresh time) and `apollo_news_articles` (title, url, snippet, published_at, event_categories, `embedding` vector(768)). The dossier **never** triggers a refresh; only first-time load (no data) or the daily cron refreshes. See **Target Signal Stream** under Market Telemetry below.
- **Telemetry Storage**: We store real-time ERCOT market data in the `market_telemetry` table, throttled to 2x daily (AM/PM) to preserve storage.
- **Vector Search**: The table includes a `vector(768)` embedding column (`embedding`) generated from the market summary string.
- **Market Zone Resolution**: We use `market-mapping.ts` to resolve a contact or account's physical location (City/State) to its respective ERCOT Load Zone (North, Houston, West, South). This allows for context-aware market analysis.
- **Forensic Volatility Index**: A live metric (0-100) calculated from three weighted vectors:
  - **Real-Time Price (40%)**: Current LZ price vs. historical norms.
  - **Grid Reserves (40%)**: Available capacity vs. critical thresholds (e.g., < 3000 MW).
  - **Scarcity Risk (20%)**: Weighted by DAM/RTM spreads and extreme weather events.
- **Data Resilience**: Frontend widgets (`MarketPulseWidget`, `TelemetryWidget`) and the Infrastructure Map MUST validate API responses for `content-type: application/json` to handle non-JSON error pages (e.g., ERCOT 500 Internal Server Error) gracefully.

#### Market Telemetry Page (`/network/telemetry`)
- **Route**: Replaced the former `/network/energy` (Energy Plans table) with a single **Market Telemetry** dashboard at `/network/telemetry`. Sidebar "Telemetry" link points here.
- **Data Sources**: `useMarketPulse()` (ERCOT prices + grid via `/api/market/ercot`), `useEIARetailTexas()` (EIA Texas retail sales via `/api/market/eia`; COM/IND sectors, 12 months). Persisted query keys: `market-pulse`, `eia-retail-tx`.
- **UI Layers** (per build.md):
  - **Zonal Settlement Array**: Four cards (LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST) + HUB_AVG; conditional styling (e.g. <$50 white, >$100 amber, >$1000 rose).
  - **Grid Physics Monitor**: LOAD_VELOCITY (actual load vs capacity), RESERVE_GAP (reserves MW; rose if <3000), RENEWABLE_VECTOR (wind + PV).
  - **Macro Trend Log**: EIA table (PERIOD | SECTOR | RATE | VARIANCE vs prior month); shows "CONNECTION_LOST" on EIA failure.
- **Design**: Obsidian & Glass; no generic charts; data blocks and table only.

#### Weather in Active Context (Right Panel)
- **API**: Backend `/api/weather` (Google Maps Platform Weather API). Accepts `lat`/`lng` or `address` or `city`+`state`; geocodes via `/api/maps/geocode` when needed. Uses `GOOGLE_MAPS_API_KEY` (or equivalent env).
- **Location Rule**: Weather is **always** driven by the **account** location, not the contact. On a contact dossier (e.g. contact in Plano, account in Dallas), the Right Panel shows weather for the account's city (Dallas).
- **Implementation**: `useWeather(location)` hook; `account` from `useAccount()` provides `latitude`, `longitude`, `address`, `city`, `state`. `TelemetryWidget` receives optional `weather` and `weatherLocationLabel`; when present, displays live temp + condition and location label. Account type and `useAccount` include `latitude`/`longitude` for map and weather.

#### Target Signal Stream (Apollo News) — Right Panel
- **Purpose**: Company news/signals per account (funding, hiring, general) for the **Target Signal Stream** in Active Context (below Telemetry). Data is stored in Supabase with pgvector so AI has full access.
- **Tables**: `apollo_news_refresh` (one row per domain: `key`, `last_refreshed_at`); `apollo_news_articles` (per-article rows with `title`, `url`, `snippet`, `published_at`, `event_categories`, `embedding` vector(768)). Embeddings are queued via existing `util.queue_embeddings` and the `embed` Edge Function.
- **No refresh on dossier visit**: The page **only** shows Supabase-saved data. We do **not** trigger an Apollo request when the user opens or returns to an account/contact dossier. Refreshes happen only:
  1. **First time**: No saved data for that domain → one-time fetch from Apollo, persist, then serve from Supabase.
  2. **Cron**: Daily job (e.g. 2:00 AM UTC) calls backend `/api/cron/refresh-apollo-news`; backend finds domains where `last_refreshed_at` is older than 7 days, fetches from Apollo, and updates Supabase.
- **API**: `GET /api/apollo/news?domain=...` returns signals from `apollo_news_articles` when any exist; otherwise (first time only) fetches from Apollo, persists, and returns. Delta (Δ) button uses `POST /api/ai/analyze-signal` (Gemini one-sentence tactical summary toast). See `SUPABASE DOCS/apollo-news-storage-and-cron.md` for cron vault setup (`apollo_news_cron_url`, `apollo_news_cron_secret`).

## 🗺️ Infrastructure & Asset Mapping

The platform features a "Stealth" geometry map (`InfrastructureMap.tsx`) for grid asset visualization:
- **Design Skin**: Stripped-down Zinc-950 geometry with Zinc-400 labels and Zinc-700 highways. POIs (schools, parks) are disabled to focus on grid logic.
- **Live Telemetry HUD**: A floating backdrop-blur overlay displaying real-time prices for all major ERCOT Load Zones (LZ_NORTH, LZ_HOUSTON, LZ_WEST, LZ_SOUTH).
- **Node Visualization**:
  - **Protected Nodes**: Klein Blue (`#002FA7`) markers for active clients.
  - **Risk Nodes**: Rose (`#ef4444`) markers with a subtle pulse effect for targets with high volatility exposure.
  - **Prospect Nodes**: White markers for potential targets.

## ⚡ Quick Start & Architecture

The platform operates using a **Three-Server Architecture**:

### 1. Frontend (Next.js)
The modern UI for users.
- **Local**: `http://localhost:3000`
- **Command (frontend only)**: `cd crm-platform && npm run dev` (Next.js with Turbopack; port 3000 default)
- **Command (both)**: From repo root, `npm run dev:all` — starts Next.js and backend in one terminal via `scripts/dev-all.js`

### 2. Local Backend (Node.js)
Handles API requests and legacy logic during development.
- **Local**: `http://127.0.0.1:3001`
- **Command**: From repo root, `node server.js` or `npm run dev` (nodemon). Use `npm run dev:all` to run both.

### 3. Production Environment (Cloud Run)
The live platform operates across two distinct Cloud Run services in the **`us-central1`** region (optimized for cost and custom domain mapping):
- **Frontend (UI)**: `https://power-choosers-crm-792458658491.us-central1.run.app` (Mapped to `https://nodalpoint.io`)
- **Backend (Network/API)**: `https://nodal-point-network-792458658491.us-central1.run.app`
- **Architecture**: The Frontend service handles the UI and routing, while the Network service handles Twilio webhooks, heavy API processing, and legacy backend logic.
- **Cost Optimization**:
  - **Domain Mapping**: We use native Cloud Run Domain Mapping (Free) instead of a Global Load Balancer ($18+/mo).
  - **Storage**: Artifact Registry uses a cleanup policy (`policy.json`) to delete images older than 30 days and keep only the 5 most recent versions.
- **Deployment Strategy (Docker)**:
  - **Frontend image** (`crm-platform/Dockerfile`): Build context is repo root (`.` in Cloud Build). Next.js standalone output is copied to `/app`; **`server.js` is at `/app/server.js`** (Next.js standalone places it at the root of the output). No separate `node_modules` at runtime; dependencies are bundled.
  - **Backend image** (root `Dockerfile`): `server.js` at `/app/server.js`; port 8080. Used for the `nodal-point-network` Cloud Run service.
- **Deploying to Cloud Run (no auto-deploy on push)**:
  - **Pushing to Git does NOT trigger a build.** There is no GitHub Actions or automatic Cloud Build trigger in this repo. Cloud Run only updates when a build is run.
  - **To deploy after pushing changes:** From the repo root run `gcloud builds submit --config cloudbuild.yaml`. This uploads your local source and builds both frontend and backend images, then deploys them to Cloud Run. Ensure you have the Cloud Build substitution variables set (e.g. in a trigger or via `--substitutions`) for the frontend `NEXT_PUBLIC_*` build args—see `cloudbuild.yaml` comments.
  - **Optional:** In Google Cloud Console → Cloud Build → Triggers, you can create a trigger that runs `cloudbuild.yaml` on push to `main` (connect your repo and set the substitution variables there). Then every push to `main` would deploy automatically.

### 📞 Twilio Webhook Configuration
When configuring Twilio phone numbers or TwiML Apps, ALWAYS use the canonical domain to ensure reliability and valid SSL verification:
- **Voice Webhook**: `https://nodalpoint.io/api/twilio/voice`
- **Status Callback**: `https://nodalpoint.io/api/twilio/status`
- **Fallback URL**: `https://nodalpoint.io/api/twilio/voice` (Optional)

## 📍 Routing & Proxy Logic

We use **Next.js Rewrites** (`next.config.ts`) to handle seamless communication between the frontend and the correct backend:

- **In Development**: `/api/*` is proxied to the **Local Backend** (`127.0.0.1:3001`); `/crm-dashboard.html` is also proxied to the backend.
- **In Production**: `/api/*` is proxied to the **Network/API Service** (`nodal-point-network-792458658491.us-central1.run.app`).

Redirects: `www.nodalpoint.io` → `https://nodalpoint.io/:path*` (permanent). Code remains environment-agnostic across `localhost` and `nodalpoint.io`.

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

The platform uses **Firebase Authentication** for sign-in and **Supabase** for user profile data.
- **Login**: Users authenticate via the `/login` page (Firebase Auth).
- **Profile**: Role, name, Twilio numbers, and settings are stored in the Supabase `users` table; `AuthContext` fetches via `supabase.from('users').select('*').eq('email', ...)` after auth.
- **Protection**: Routes under `/network` are protected by Next.js Middleware (matcher: `/network/:path*`). Unauthenticated requests redirect to `/login`.
- **Session**: A session cookie (`np_session=1`) persists login state. In development, the presence of this cookie can bypass Firebase for a mock user.

## 📝 Development Workflow

1.  **Focus**: All new feature development happens in `crm-platform/`.
2.  **Reference**: Use `backups/crm-dashboard.html` **only** to understand legacy business logic. Do not edit legacy files for new features.
3.  **Migration**: When migrating a feature:
    - Analyze the legacy implementation.
    - Create/Update TypeScript interfaces in `src/types/`.
    - Build modular components in `src/components/`.
    - Use React Query for data fetching.
    - Verify against the legacy behavior.
4.  **Schema Parity**: When adding new fields to Account or Contact models for future edits, you **MUST** also update the field mapping schemas in `src/components/modals/BulkImportModal.tsx` (ACCOUNT_FIELDS / CONTACT_FIELDS and ingestion logic) to ensure new data can be ingested via CSV.

## ⚛️ React & Next.js Development Standards

To prevent hydration mismatches, unique key warnings, and infinite render loops:

### 1. The Key Protocol
- **Uniqueness**: Every element in a list (`.map()`) MUST have a unique `key`.
- **Stability**: NEVER use `Math.random()` or `crypto.randomUUID()` in the render path. Use stable IDs from the database (e.g., `contact.id`).
- **Outer Element**: The `key` must be on the outermost element of the loop. If using fragments, use `<Fragment key={...}>` from `react`.
- **AnimatePresence**: Children of `<AnimatePresence>` MUST have unique keys to be tracked during exit animations.
- **Undefined Check**: Ensure the value used for the key is not `undefined` or `null`.

### 2. Hydration Integrity
- Avoid using browser-only globals (`window`, `localStorage`) during initial render.
- Wrap browser-only logic in `useEffect` or use a `mounted` state to ensure server/client HTML match.
- **Sidebar**: The sidebar root uses `suppressHydrationWarning` because browser extensions (e.g. Cursor) can inject attributes such as `data-cursor-ref` onto `<a>` tags after SSR, causing server/client attribute mismatch. Do not rely on this for app logic; use only to silence extension-induced warnings in that subtree.

### 3. Effect & Performance Safety
- Always provide a dependency array to `useEffect`.
- Avoid creating new objects or functions inside the component body that are then used as dependencies, unless wrapped in `useMemo` or `useCallback`.
- Never mutate state objects directly; always use the spread operator or functional updates.

### 4. Next.js Component Gating
- Mark components with `'use client'` ONLY when using hooks or browser APIs.
- Keep data-fetching components as Server Components where possible.

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
  - **Styles**: `rounded-2xl` or `rounded-[14px]` (Squircle), `nodal-glass`, `text-white/90`, `border-white/20`, `shadow-[0_0_10px_rgba(0,0,0,0.5)]`.
  - **Squircle Logic**: Use `rounded-[14px]` for small sizes (e.g., ≤36px) to avoid circular appearance; `rounded-2xl` for larger sizes. **Never** use `rounded-full` for contact or company icons.
  - **Shadows**: Must use `shadow-[0_0_10px_rgba(0,0,0,0.5)]` to match container shape.
  - Applies to both `PeoplePage` table rows and the Contact Dossier header. Use `ContactAvatar` and `CompanyIcon` (`src/components/ui/`) for consistency.
- **Company Icons**: Standardized to `rounded-2xl` or `rounded-[14px]` (Squircle) across Accounts, People, Target ID, and Global Search pages to match the forensic instrument aesthetic.
  - **Shadows**: Must use `shadow-[0_0_10px_rgba(0,0,0,0.5)]` (Subtle Centered Glow).
- **Layout**: Sidebar (Left), Top Bar (Header), Right Panel (Contextual Widgets).
- **CollapsiblePageHeader**: `globalFilter` and `onSearchChange` are optional. Pages that do not need search (e.g. Telemetry) may pass only `title` and `description`; the search icon and expandable search bar render only when `onSearchChange` is provided.
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

All main application pages (Accounts, People, Protocols, Targets, Calls, Emails, etc.) must follow this standardized layout structure to ensure a consistent UX:

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
