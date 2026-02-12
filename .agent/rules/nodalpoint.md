---
alwaysApply: false
description: when needing a refresher of certain features of Nodal Point CRM
---
# Nodal Point CRM Platform

**Modern CRM** built with Next.js 16 (App Router) for energy procurement. Evolution of legacy "Power Choosers CRM".

## Tech Stack

- **Framework:** Next.js 16.1.4 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **State:** Zustand (global), TanStack Query (server state, IndexedDB persistence)
- **Database:** Supabase (PostgreSQL + Vector), Firestore (legacy read-only)
- **UI:** Radix UI, Lucide Icons, Framer Motion
- **Auth:** Firebase Auth (login), Supabase users table (profile)
- **Backend:** Next.js API Routes at `crm-platform/src/pages/api/` (Twilio, ERCOT/EIA, Gemini AI)
- **Hosting:** Vercel (root: `crm-platform`), Domain: `nodalpoint.io`

## Project Structure

```
Power Choosers CRM/
├── crm-platform/         # Unified Next.js App
│   ├── src/
│   │   ├── app/          # App Router (UI)
│   │   ├── pages/api/    # 93+ API handlers
│   │   ├── components/   # Reusable UI
│   │   ├── hooks/        # Data hooks
│   │   ├── lib/          # supabase, firebase, utils
│   │   ├── store/        # Zustand states
│   │   └── types/        # TypeScript types
│   ├── package.json      # All dependencies
│   └── vercel.json       # Vercel config
└── backups/              # Legacy references
```

**Key Routes:** `/`, `/login`, `/network` (dashboard), `/network/accounts/[id]`, `/network/contacts/[id]`, `/network/calls`, `/network/emails`, `/network/tasks`, `/network/telemetry`, `/network/infrastructure`, `/network/protocols/[id]/builder`

## Database

**Supabase (PostgreSQL)** primary, Firestore legacy. Tables: `users`, `contacts`, `accounts`, `calls`, `emails`, `tasks`, `market_telemetry`, `apollo_news_articles`.

**Migration Notes:**
- `contacts.accountId` → `accounts.id` (FK)
- `metadata` JSONB preserves original Firestore docs
- Legacy `people`/`contacts` merged into `contacts`
- `city`/`state` indexed columns

**Data Resolution (hooks):** Prioritize top-level columns (`firstName`, `city`), fallback to underscored (`first_name`), then `metadata` nested paths.

## UI Design System

**Color Palette:**
- Primary: `#002FA7` (Nodal Blue)
- Background: `#0a0a0a`, `#0f0f0f`
- Surfaces: `bg-white/[0.02]`, `border-white/5`
- Text: `text-zinc-200` (primary), `text-zinc-500` (secondary)
- Signal: `#002FA7` (active), Emerald (success), Red (critical)

**Typography:** `font-mono` for data, uppercase `tracking-widest` for labels.

**Components:**
- Cards: `nodal-void-card`, `nodal-monolith-edge`, `nodal-module-glass`
- Buttons: `icon-button-forensic`
- Animations: Framer Motion, `animate-in fade-in`

## Development

**Commands:**
```bash
cd crm-platform
npm run dev          # Local dev (http://localhost:3000)
npm run build        # Production build
npm run typecheck    # TypeScript validation (MUST pass before deploy)
```

**Deployment (Vercel):**
1. Set Root Directory: `crm-platform` in project settings
2. Environment variables: `FREE_GEMINI_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Twilio creds
3. Auto-deploys from `main` branch on GitHub

**TypeScript:** Strict mode enabled. Use optional chaining for `useSearchParams()` (e.g., `searchParams?.get('taskId')`). Run `npm run typecheck` before commits.

## Key Features

**Contact Dossier:** `/network/contacts/[id]` - Unified contact view, Gemini AI chat, call history, tasks, Apollo news signals.

**Account Dossier:** `/network/accounts/[id]` - Company intel, energy metrics (contract end, load factor), Apollo signals, stakeholder map.

**Market Telemetry:** `/network/telemetry` - ERCOT real-time prices, grid reserves, Forensic Volatility Index, EIA retail data.

**Voice Platform:** Twilio integration, click-to-call, live transcription (AssemblyAI), voicemail inbox.

**Email System:** Gmail API, threaded conversations, draft templates, Apollo.io enrichment.

**Protocols (Email Builder):** `/network/protocols/[id]/builder` - Visual flowchart editor (ReactFlow), AI-powered email sequences.

**Tasks:** Global task engine, entity-linked (contacts/accounts), command bar navigation, auto-routing.

## API Routes

**Format:** `crm-platform/src/pages/api/[category]/[handler].js`

**Categories:**
- `/api/gemini/*` - AI chat, content generation
- `/api/twilio/*` - Voice, SMS, conferencing
- `/api/contacts/*`, `/api/accounts/*` - CRUD operations
- `/api/market/*` - ERCOT/EIA data
- `/api/apollo/*` - Company enrichment
- `/api/cron/*` - Scheduled jobs (Apollo refresh)

**Error Handling:** Return `res.status(code).json({ error })`, log to console, graceful fallbacks in UI.

## State Management

**Zustand Stores:**
- `callStore` - Active call state
- `geminiStore` - AI context
- `syncStore` - Sync status
- `uiStore` - Edit mode, panels

**TanStack Query:** Persistent cache (`lib/persister.ts`), query keys: `contacts`, `accounts-${id}`, `market-pulse`, `eia-retail-tx`.

## Best Practices

1. **TypeScript:** Run `npm run typecheck` before commits
2. **Null Safety:** Use `?.` for `useSearchParams()`, `pathname`, optional fields
3. **Data Normalization:** Check hooks for field resolution order
4. **Animations:** Keep under 0.5s, use `ease: [0.23, 1, 0.32, 1]`
5. **Icons:** Follow forensic aesthetic (mono, size-4, text-zinc-500)
6. **Testing:** Validate API `content-type` for JSON responses
7. **Deployment:** Vercel auto-deploys, check build logs for TS errors

## Critical Files

- `src/app/providers.tsx` - Query client, Auth, Voice
- `src/lib/supabase.ts` - DB client (anon + service role)
- `src/hooks/useContacts.ts` - Data normalization patterns
- `src/store/*.ts` - Global state
- `vercel.json` - Crons, rewrites, framework config
