# AGENTS.md

This file gives Codex a fast, reliable briefing for the `crm-platform` repo. It should reduce wasted exploration, not replace reading the code. If this file conflicts with the codebase, trust the code and update this file.

## Who This Project Is For

Nodal Point CRM is a modern CRM for commercial energy procurement and forensic tariff intelligence. The core goal is to help brokers and sales users spot hidden cost leakage, understand account risk quickly, and act fast.

When making product decisions, apply the "CFO test":
- Could a CFO understand the screen in 3 seconds?
- Would they trust the data?
- Would they know what action to take next?

If the answer is no, simplify.

## How To Work With Lewis

- Speak plainly. Avoid unexplained jargon.
- Do not just agree with ideas. Push back when there is a better path.
- Explain tradeoffs in simple terms.
- Be direct and useful, not flattering.

## Stack

- Next.js 16.1.4 with App Router
- React 19
- TypeScript with strict mode
- Tailwind CSS v4
- Zustand for client state
- TanStack Query for server state and persistence
- Supabase for primary data
- Firestore as legacy read-only reference
- Radix UI, Lucide, Framer Motion for UI

## Important Paths

- `src/app/` - App Router UI
- `src/app/api/` - App Router route handlers for a few auth/webhook endpoints
- `src/pages/api/` - legacy API routes
- `public/images/nodalpoint-webicon.png` - official Nodal Point web icon used in headers, print sheets, and small brand marks
- `src/components/` - reusable UI
- `src/hooks/` - data hooks and normalization
- `src/lib/` - utilities, Supabase, Firebase
- `src/store/` - Zustand stores
- `src/types/` - shared TypeScript types
- `src/app/providers.tsx` - global providers
- `src/lib/supabase.ts` - Supabase client setup
- `src/hooks/useContacts.ts` - key example of normalization rules
- `vercel.json` - deploy config, rewrites, cron setup

## Important Routes

- `/network` - main dashboard / war room
- `/network/accounts/[id]` - account dossier
- `/network/contacts/[id]` - contact dossier
- `/network/calls`
- `/network/emails`
- `/network/tasks`
- `/network/telemetry`
- `/network/infrastructure`
- `/network/protocols/[id]/builder`

## Local Commands

Run from repo root:

```bash
npm run dev:turbo
npm run dev
npm run build
npm run typecheck
```

Turbo dev is fine here and often preferred. Only use `npm run dev` if you are specifically checking webpack-only behavior.

TypeScript must stay clean before shipping changes. Run `npm run typecheck` after code edits. Only run `npm run build` when Lewis explicitly asks for deploy-level verification or when you are chasing a build-only problem that typecheck cannot catch.

## Image Renders

- `playwright` is already in `devDependencies` and is the default tool for crisp LinkedIn-style screenshots and HTML renders.
- When capturing images, use a 2x render scale or `deviceScaleFactor: 2` so text stays sharp on mobile and feed previews.
- `sharp` is also available if an image needs a resize, crop, or cleanup pass after capture.

## Data Rules

- Supabase is the main database.
- Firestore is legacy reference data, not the primary write target.
- Favor normalized top-level fields first.
- In hooks, resolve fields in this order when applicable:
  1. top-level camelCase
  2. underscored legacy fields
  3. nested values inside `metadata`
- `/network` access is gated by the `np_session=1` cookie. If you touch auth, update `middleware.ts`, the login page, the Zoho callback routes, and `src/app/network/layout.tsx` together.
- Zoho and Twilio auth/webhook flows assume the canonical production host is `www.nodalpoint.io`. Do not simplify redirect or cookie-domain logic without checking the login and callback paths.

Important relationship:
- `contacts.accountId` links to `accounts.id`
- Do not assume `ownerId` means the same thing everywhere. `calls.ownerId` must stay aligned with the Supabase auth UUID for RLS, while other tables may still use email-based ownership. Check the table before copying ownership logic.

## Supabase Jobs

Supabase is doing more than storage in this repo.

- Cron jobs live both in `vercel.json` and in Supabase `cron.job`, so check both before changing any background flow.
- Current scheduled jobs cover embeddings processing, Apollo/news refresh, sequence processing and timeout/requeue, intelligence scrapes, prospect discovery, Zoho refresh, calendar reply polling, and briefing reminders.
- Background queues use `pgmq`, especially `embedding_jobs` and `sequence_jobs`.
- Semantic search is automated. Tables with embedding or search plumbing include `accounts`, `contacts`, `calls`, `emails`, `apollo_news_articles`, `market_telemetry`, and `meters`. If you change the content that should be searchable, update the matching `*_embedding_input` function and make sure `util.process_embeddings()` still covers it.
- Supabase edge functions include `embed`, `process-sequence-step`, `scrape-intelligence`, and `discover-apollo-prospects`.
- `process-sequence-step` exists in two places: `src/edge-functions/process-sequence-step.ts` and `supabase/functions/process-sequence-step/index.ts`. Keep them in sync.

## Email Sender Domain Rules

**CRITICAL: Sequence emails MUST use the burner domain `getnodalpoint.com`, NOT `nodalpoint.io`**

This has been a recurring issue. The system uses two domains:
- `nodalpoint.io` - Real domain for manual/personal outreach and internal operations
- `getnodalpoint.com` - Burner domain for automated sequence/cold emails

### Why This Matters
- Deliverability: The burner domain protects the primary domain's reputation
- Tracking: Separates automated vs. manual outreach in analytics
- Compliance: Keeps cold outreach isolated from warm relationships

### Implementation Rules
1. **Edge Functions**: Always use `getBurnerFromEmail()` utility when sending sequence emails
2. **Email Records**: The `emails.from` field must show `@getnodalpoint.com` for sequence sends
3. **Owner Tracking**: The `emails.ownerId` field should use the real `@nodalpoint.io` email for ownership
4. **API Handlers**: Map burner domain back to real domain for profile/token lookups

### Key Files
- `src/lib/burner-email.ts` - Utility functions for domain conversion
- `supabase/functions/process-sequence-step/index.ts` - Edge function that sends sequence emails
- `src/pages/api/email/zoho-send-sequence.js` - API handler for sequence sends

### Common Mistake
Directly using `owner.email` from the database without converting to burner domain. Always call `getBurnerFromEmail(owner.email)` for sequence sends.

Another recurring failure mode is shipping sequence copy with raw template markers like `{{contact.firstName}}` or `{{account.name}}`. The send path must render those variables from the live contact/account record first, and if any placeholders are still present after rendering, the send should fail and retry instead of going out broken.

### Verification Query
```sql
-- Check for incorrectly stored sequence emails
SELECT COUNT(*) FROM emails 
WHERE "from" LIKE '%@nodalpoint.io' 
AND (id LIKE 'seq_exec_%' OR id LIKE 'zoho_seq_%');
-- Should return 0
```

## UI Rules

The product uses a dark forensic interface, not a generic SaaS style.

Primary visual rules:
- Use the Nodal blue `#002FA7` as a signal color, not decoration.
- Prefer existing glass classes over inventing new panel styles:
  - `nodal-void-card`
  - `nodal-monolith-edge`
  - `nodal-module-glass`
  - `nodal-glass`
  - `glass-panel`
- Primary text is typically zinc-based neutral text, not bright white everywhere.
- Metrics and measured values should lean monospace.
- Labels and descriptive copy should stay easy to scan.

Avoid:
- Tooltips as a substitute for unclear UI
- Random new colors
- Decorative motion with no meaning
- Generic default-dashboard patterns when editing core Nodal Point surfaces

## Animation Rules

- Keep most animations under `0.5s`
- Preferred ease: `[0.23, 1, 0.32, 1]`
- Motion should support hierarchy or state change, not decoration

## API Conventions

API handlers live under both `src/pages/api/[category]/[handler].js` and `src/app/api/[category]/route.ts`

Expected patterns:
- Return JSON using `res.status(code).json({ error })` for failures
- Log useful errors to the console
- Keep graceful fallbacks in the UI when backend calls fail
- Validate response `content-type` when working with JSON endpoints

## React And TypeScript Guardrails

- Strict TypeScript is on. Do not weaken types unless there is a strong reason.
- Use optional chaining for nullable routing/search values like `searchParams?.get(...)`
- Follow existing app patterns before introducing new abstractions
- Prefer small focused edits over broad rewrites unless the task requires structural cleanup

## State And Query Notes

Main Zustand stores:
- `callStore`
- `geminiStore`
- `syncStore`
- `uiStore`

Common TanStack Query key patterns include:
- `contacts`
- `accounts-${id}`
- `market-pulse`
- `eia-retail-tx`

## Deployment Notes

- Hosted on Vercel
- Root directory must be `crm-platform`
- Main required environment values include Supabase, Gemini, Twilio, and Zoho-related secrets
- Production deploys come from `main`

## Supabase MCP Access

Codex can access the connected Supabase project through the configured MCP tools in this environment. That is the preferred way to inspect schema, run safe queries, check advisors, generate types, and manage migrations.

Use MCP Supabase tools for:
- listing tables, migrations, branches, extensions, and edge functions
- running read queries or targeted SQL checks
- applying schema migrations
- checking security or performance advisors
- searching current Supabase docs before making database-specific assumptions
- checking live cron jobs, queue-backed jobs, triggers, and edge-function versions before changing background behavior

Rules:
- Do not store secrets, keys, or raw credentials in this file.
- Prefer MCP access over guessing database structure from app code alone.
- Before saving data into Supabase, or when building/editing any page, form, or API work that depends on database-backed fields, relationships, or record layouts, check the Supabase MCP first so you are working from the live table shape instead of assumptions.
- This includes features that only read database data, like pages that list related calls, contacts, accounts, tasks, or other linked records. Validate the actual table and field names in MCP before writing the edit.
- Use `apply_migration` for DDL changes like creating or altering tables.
- Use raw SQL execution for data checks or non-DDL queries.
- If a database change is risky, inspect schema and advisors first.
- After schema changes, rerun the advisors. This project already has warnings around mutable `search_path`, permissive RLS on some tables, and unindexed foreign keys, so do not assume an old warning is harmless.

## Working Rules For Codex

- Read the existing code before assuming architecture.
- Prefer matching local patterns over introducing a "cleaner" but foreign approach.
- Do not replace existing design language with generic UI.
- When changing dossier, dashboard, telemetry, or protocol-builder UI, preserve the forensic command-center feel.
- Favor concise, understandable solutions over clever ones.
- If something looks inconsistent or wasteful, call it out clearly instead of working around it silently.

## Desktop Electron App

The project includes a desktop Electron shell for Windows (with potential for macOS/Linux).

### Key Files
- `desktop/main.cjs` - Main process with auto-updater, tray, and window management
- `desktop/preload.cjs` - Preload script exposing `window.nodalDesktop` API
- `desktop/folder-sync.cjs` - Folder sync feature for local file management

### Auto-Update System
- Uses `electron-updater` with GitHub Releases as the publish target
- Auto-downloads updates in background (`autoUpdater.autoDownload = true`)
- Does NOT auto-install on quit (`autoUpdater.autoInstallOnAppQuit = false`)
- User must manually trigger install via tray menu or UI button
- Update check interval: every 6 hours
- Publish config: GitHub releases under `powerchoosers/power-choosers-crm`

### Update State Phases
`idle` → `checking` → `available` → `downloading` → `downloaded` → `error`

### Desktop API (`window.nodalDesktop`)
```typescript
interface NodalDesktop {
  isDesktop: boolean
  getUpdateState(): Promise<UpdateState>
  checkForUpdatesNow(): Promise<{ ok: boolean; state: UpdateState }>
  installUpdate(): Promise<{ ok: boolean }>
  showNotification(payload: { title: string; body: string; link?: string }): Promise<{ ok: boolean }>
  onUpdateEvent(listener: (state: UpdateState) => void): () => void
  onUiEvent(listener: (payload: any) => void): () => void
}
```

### Build Commands
```bash
npm run desktop:dev      # Dev mode with hot reload
npm run desktop:prod     # Run packaged app locally
npm run desktop:pack     # Build unpacked (--dir)
npm run desktop:dist     # Build installer
npm run desktop:publish  # Build and publish to GitHub Releases
```

### Tray Features
- Open Nodal Point
- Quick Search (Ctrl+Shift+K)
- Sync Now
- Import CSV
- Attach Files
- Check for Updates
- Install Update Now
- Quit

## When Updating This File

Keep this document short and operational.

Add to it when:
- a repeated repo-specific pitfall appears
- build or deploy requirements change
- a major architectural convention becomes stable

Do not add:
- temporary task notes
- vague style opinions
- long explanations better kept in code comments or project docs
