# CLAUDE.md — Power Choosers CRM / Nodal Point

## Project Overview

**Nodal Point** is a commercial energy forensics & audit CRM platform. It helps energy brokers and advisors reverse-engineer supplier tariffs to expose hidden cost leakage in business energy contracts. The aesthetic is dark/forensic/military — think terminal interfaces and signal intelligence dashboards.

The company brand is **Nodal Point** (`nodalpoint.io`). The repo is named `crm-platform`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.4 (App Router + Pages Router hybrid) |
| Language | TypeScript 5 |
| UI Library | React 19 |
| Styling | Tailwind CSS v4, dark zinc theme |
| Components | shadcn/ui + Radix UI primitives |
| Animations | Framer Motion |
| Data Fetching | @tanstack/react-query v5 (with IDB persistence) |
| State | Zustand |
| Backend/DB | Supabase (Postgres + Auth + Realtime) |
| AI | Google Generative AI (Gemini), custom "Foundry" engine |
| Voice | Twilio Voice SDK |
| Email | SendGrid, @react-email |
| Search | Algolia |
| Maps | Mapbox + react-map-gl |
| Charts | Recharts |
| Toasts | Sonner |

---

## Routing Architecture (Hybrid)

This project uses **both** Next.js routing systems:

- **App Router** (`src/app/`) — all UI pages
- **Pages Router** (`src/pages/api/`) — all API routes (REST endpoints)

### Key App Routes

```
/                    → landing page
/login               → auth
/network             → dashboard (Forensic Command Deck)
/network/contacts    → contacts list
/network/targets     → sales targets
/network/accounts    → company accounts
/network/calls       → call log
/network/emails      → email threads
/network/tasks       → task management
/network/people      → people directory
/network/protocols   → outreach sequences
/network/scripts     → call scripts
/network/foundry     → AI content generation
/network/vault       → document vault
/network/telemetry   → telemetry data
/network/infrastructure → infrastructure view
/network/settings    → user/team settings
/market-data         → ERCOT market intelligence
/book                → booking page
/contact             → contact form
```

### Key API Directories

```
src/pages/api/
  ai/               → AI inference endpoints
  apollo/           → Apollo data enrichment
  auth/             → authentication
  calls/            → call handling
  email/            → email operations
  foundry/          → Foundry AI engine
  gemini/           → Gemini AI endpoints
  intelligence/     → signal intelligence
  market/           → ERCOT market data
  maps/             → Mapbox geocoding
  twilio/           → Twilio webhooks & voice
  cron/             → scheduled jobs
```

---

## Directory Structure

```
src/
  app/              → App Router pages + layouts
  pages/api/        → API routes (Pages Router)
  components/       → UI components by feature domain
    accounts/
    booking/
    calls/
    chat/
    crm/
    dashboard/
    dossier/
    emails/
    foundry/
    infrastructure/
    landing/
    layout/
    market/
    modals/
    network/
    right-panel/
    search/
    ui/             → shadcn/ui primitives
  context/
    AuthContext.tsx → Supabase user + profile
    VoiceContext.tsx → Twilio voice state
  hooks/            → Data hooks (useContacts, useCalls, etc.)
  lib/
    supabase.ts     → Supabase client + requireUser()
    foundry.ts      → Contact variable substitution engine
    foundry-prompt.ts → AI prompt construction
    foundry-variables.ts → Foundry variable definitions
    utils.ts        → cn() and common helpers
    market-mapping.ts → ERCOT/EIA data mappings
    industry-mapping.ts → Industry classifications
    url.ts          → URL utilities
    persister.ts    → IDB query cache persister
  types/            → Shared TypeScript types
  store/            → Zustand stores
  actions/          → Server actions
  emails/           → React Email templates
  edge-functions/   → Supabase edge functions
```

---

## Development Commands

```bash
npm run dev          # Dev server (webpack, preferred)
npm run dev:turbo    # Dev server (turbo — may be unstable)
npm run build        # Production build (webpack)
npm run typecheck    # tsc --noEmit (run before commits)
npm run lint         # ESLint
```

**Always use `npm run dev` (webpack), not turbo, unless specifically testing turbo.**

---

## Key Patterns & Conventions

### Data Fetching
All data fetching uses custom hooks in `src/hooks/`. Each hook wraps react-query and talks to Supabase directly or via API routes. Example: `useContacts`, `useCalls`, `useTargets`.

### Auth
`AuthContext` provides `user`, `role`, `profile`, and `refreshProfile`. API routes use `requireUser(req)` from `src/lib/supabase.ts` for server-side auth validation.

### React Query Persistence
Only these query keys are persisted to IndexedDB: `calls`, `market-pulse`, `eia-retail-tx`, `scripts`. The persister buster is `'v2'`.

### Component Naming
Feature components use descriptive names reflecting the forensic/intelligence theme (e.g., `ForensicLogStream`, `SignalMatrix`, `VelocityTrackerV3`, `KPIGrid`).

### Styling
- Background: `bg-zinc-950`, text: `text-zinc-100`
- Accent/selection: `bg-[#002FA7]` (Klein blue)
- Monospace font for terminal/forensic UI elements
- Tailwind CSS v4 — no `@apply` with v3 syntax
- Use `cn()` from `src/lib/utils.ts` for conditional classes

### API Routes
All API routes are in `src/pages/api/`. They use `_cors.js`, `_logger.js`, and `_form-parser.js` for shared middleware. Auth is checked via `requireUser(req)`.

### The "Foundry" Engine
Foundry is the AI content generation system. It uses `contactToVariableMap()` in `src/lib/foundry.ts` to build `{{variable}}` substitution maps for email/call templates. Variables are namespaced: `{{contact.firstName}}`, `{{account.name}}`, etc.

---

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENDGRID_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `NEXT_PUBLIC_ALGOLIA_APP_ID`, `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

---

## Deployment

- Deployed on **Vercel** (`vercel.json` present)
- Docker support (`Dockerfile` present) for self-hosted option
- Branch `main` is the production branch

---

## Admin Emails

Hardcoded admin emails in `src/lib/supabase.ts`:
- `l.patterson@nodalpoint.io`
- `admin@nodalpoint.io`

---

## Supabase MCP Access

The **official Supabase MCP server** is already connected and available in every session. Use it directly — no setup needed.

**Project ID:** `gfitvnkaevozbcyostez` (Nodal Point Data Engine, `us-east-1`)

### Available MCP tools

| Tool | Use for |
|---|---|
| `mcp__supabase__execute_sql` | Run raw SQL (DDL, queries, migrations) |
| `mcp__supabase__list_tables` | Inspect schema |
| `mcp__supabase__list_projects` | Confirm project ID |
| `mcp__supabase__apply_migration` | Apply named migrations |
| `mcp__supabase__get_logs` | Debug API/auth/postgres/edge logs |
| `mcp__supabase__get_advisors` | Security & performance advisories |

### Database notes

- Table columns use **camelCase** (e.g., `accountId`, `contactId`, `callSid`, `ownerId`)
- `calls` table FK constraints use `ON DELETE SET NULL` — deleting an account or contact nulls the reference but **does not delete the call record**
- No local Docker/psql — always use the MCP tools for database operations
