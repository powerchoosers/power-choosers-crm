# AGENTS.md

A fast briefing for coding agents working in the `crm-platform` repo. It should cut wasted exploration, not replace reading the code. If this file conflicts with the codebase, trust the code and update this file.

## What Nodal Point Does

Nodal Point is an energy broker for Texas businesses. We read a company's electricity bill, find the gaps in its plan (peak charges, fees passed through, the wrong kind of plan), and negotiate a better one with suppliers.

This repo holds two products that share one Next.js app:

1. **The public website** (`nodalpoint.io`) - explains what we do and collects bills and booked calls.
2. **The CRM** (`/network`) - the internal tool brokers use to spot cost leakage, read account risk, and act.

Apply the "CFO test" to both:
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
- Three.js with React Three Fiber (`three`, `@react-three/fiber`) - public website hero only

## Important Paths

- `src/app/` - App Router UI
- `src/app/page.tsx` - public home page
- `src/components/landing/` - public website components
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

## Public Website

The public site and the CRM look different on purpose. Do not carry CRM styling (glass panels, dense mono labels) into the public site, or public-site styling into the CRM.

### Pages

The public site is a small set of pages:

- `/` - home
- `/how-it-works` - the four-step process, what the customer gets back, and how we work
- `/who-we-serve`
- `/market-data` - live Texas grid numbers in plain English
- `/contact`
- `/bill-debugger` - shown to visitors as "Review my bill"; the primary call to action
- `/book` - "Book a call"
- `/portal` - client sign in. Split screen: dark brand panel, light sign-in form. Own layout, no `PublicShell`.
- `/client` - the signed-in client dashboard. Same fonts, colours, buttons and motion as the public site, on a light `bg-zinc-100` page with white panels and a dark welcome band. Own header (logo, account, sign out). It needs a signed-in Supabase user, so it cannot be opened in the `public-site-preview` setup without a real `.env.local`. The usage chart inside it (`UsageProfilePanel`) is shared with the CRM and stays dark; do not restyle it for the client dashboard without checking the CRM account dossier.
- `/privacy`, `/terms`

`/forensic-review`, `/philosophy`, and `/technical-docs` were merged into `/how-it-works`, and `/market-outlook` into `/market-data`. The old URLs redirect in `next.config.ts`. The redirects are temporary (307) for now; switch them to `permanent: true` once the new pages are confirmed live. `/forensic-review` was used as an ad landing page, so check running ad campaigns before changing where it points.

When a page is added or removed, also update `src/app/sitemap.xml/route.ts`, `public/robots.txt`, and `public/llms.txt`.

### Shared parts (use these, do not restyle per page)

All in `src/components/landing/`:

- `PublicShell` - wraps every public page: header, footer, headline font, base text styles.
- `PageHero` - the dark opening band for every page except home (home uses `HeroSection`).
- `ClosingCta` - the dark closing section. Every marketing page ends with it; the two tool pages (`/bill-debugger`, `/book`) do not.
- `ui.tsx` - `PrimaryLink`, `OutlineLink`, `TextLink`, and the matching class strings for real `<button>`s.
- `Reveal` - the scroll-in animation.
- `LegalPage` - layout for privacy and terms.
- `content.ts` - copy used on more than one page (the four steps, the industries). Edit facts there so pages cannot drift apart.

### Header

`LandingHeader` restyles itself for whatever is behind it. Any section with `data-header-tone="dark"` gets white header text and dark glass; everything else gets dark text and white glass. `PageHero`, `HeroSection`, `ClosingCta`, and the footer already carry the attribute. Add it to any new dark section, or the header text will be unreadable over it. Below `lg` the nav collapses into an animated full-screen menu.

### Design rules

- **Structure:** dark opening section (`bg-zinc-950`), light body (white and `bg-zinc-100`), dark closing section that runs into the footer.
- **Alignment:** left-aligned. Do not center headline blocks.
- **Type:** two families only. Headlines (h1, h2, and the one big figure on the sample bill) are Newsreader, a serif, through the `np-display` class defined at the end of `globals.css` (weight 400, tight tracking). Everything else is Inter: body copy, h3s, buttons, nav, labels, and numbers (`tabular-nums`). No monospace and no uppercase tracked labels on the public site. A page opts in by putting `displayFontClass` from `src/components/landing/fonts.ts` on its wrapper, as `src/app/page.tsx` does; without it `np-display` falls back to Inter.
- **Type scale:** h1 `lg:text-[5.25rem]`, section h2 `md:text-[3.25rem]`, closing h2 `lg:text-[4.25rem]`, h3 `text-xl font-semibold`, lead paragraph `text-lg leading-8`, body `text-base leading-7`, small `text-sm`.
- **Color:** Nodal blue `#002FA7` is for the one main action and the thing being pointed at. On dark backgrounds use `#5b7cff` for blue lines and marks, because `#002FA7` is unreadable on black.
- **Buttons:** `rounded-[10px]`. Primary is solid `#002FA7`. Secondary is an outline. Labels are sentence case and say what happens: "Review my bill", "Book a call".
- **Copy:** plain English a business owner would use. Say "peak charges", not "4CP exposure". Sentence case. No uppercase tracked-out labels above headings.
- **Claims:** do not invent numbers, savings figures, or statements about how we are paid. Reuse facts already in the repo or ask Lewis.
- **Motion:** small, quick, and tied to something the visitor does or sees. Under 0.5s, ease `[0.23, 1, 0.32, 1]`, and always respect reduced motion. The set in use:
  - hero text blurs in on load with the CSS `np-enter` class (staggered with `animationDelay`);
  - section blocks blur and rise in once with `Reveal` (a section's main block, or a few siblings with a 0.07s step; not every paragraph, and never above the fold);
  - links draw an underline with `np-link`; primary buttons nudge their arrow and press in slightly;
  - the mobile menu fades in with blur and staggers its items;
  - selected or highlighted rows change colour and lift slightly.
  The home page 3D hero is the only large animation. Nothing loops except a progress indicator while work is really happening.
- **Blur:** used for glass (header, mobile menu, sticky bars) and for the soft blue light in dark sections. Not as decoration in light sections.

### Hero 3D visual

- `LoadSurface.tsx` decides what shows. Normally: nothing at first, then the WebGL scene (`LoadSurfaceScene.tsx`) fades in while it rises from flat, so there is one intro and no swap. It runs at every screen size. Users with reduced motion or no WebGL get a static SVG instead.
- Layout: at `lg` and up the scene runs behind the right side of the hero. Below `lg` it sits under the buttons and fills the rest of the first screen. Test both, plus the in-app browser pane, which is usually narrower than `lg`.
- Both draw the same data from `loadProfile.ts`: one building's electricity use across a year, with the peak hours highlighted. Change the data there so the two stay matched.
- The scene is a solid lit surface drawn by one custom shader. A band of light sweeps across it; each peak it passes shoots up and gets a glowing marker. It rises from flat on load, leans slightly toward the cursor, and lifts away on scroll.
- The scene is loaded with `next/dynamic` and `ssr: false`. Keep it that way so Three.js never lands in the CRM bundle or blocks the headline.
- Keep 3D to this one visual. Do not add WebGL to the CRM.

### Sample bill on the home page

`BillGaps.tsx` shows an example bill. The total ($3,735.44), usage (20,250 kWh), and "delivery and demand were nearly half" come from a real anonymized warehouse review. The individual line items are illustrative and labeled as such on the page. Keep that label if the numbers change.

## CRM Routes

- `/network` - main dashboard / war room
- `/network/accounts/[id]` - account dossier
- `/network/contacts/[id]` - contact dossier
- `/network/calls`
- `/network/emails`
- `/network/tasks`
- `/network/telemetry`
- `/network/infrastructure`
- `/network/protocols/[id]/builder`

## Browser Access

When using the in-app browser, use the right URL for the job:

- CRM app work: `http://localhost:3000/network`
- Public website work (local): `http://localhost:3000`
- Live public website: `https://nodalpoint.io`

If the user asks to inspect the CRM, start with `/network`. If they ask to inspect the public site or customer-facing home page, use the local home page for work in progress and `nodalpoint.io` for what is live.

Use the in-app browser directly, not shell workarounds. In Codex, drive it through the Node REPL `js` tool with the browser runtime, then the `iab` browser:

- initialize the browser runtime
- get `agent.browsers.get('iab')`
- name the browser session
- open or reuse a tab
- navigate to the target URL

Do not use `Start-Process`, `open`, or any other shell command just to launch a browser page when the in-app browser is available. Do not fall back to generic web browsing for local CRM pages unless the browser runtime is actually unavailable.

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

The app will not boot without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and that includes the public pages, because the root layout loads the Supabase client. To preview only the public site on a machine with no `.env.local`, set placeholder values for those two variables in the dev server's environment (see the `public-site-preview` entry in `.claude/launch.json`). Backend calls will fail, which is expected.

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

Row-level security, as of the `20261126000100` migration:
- Admins are the emails hard-coded in the `is_admin()` database function. Admins see and change everything.
- `deals`: non-admin staff only reach deals they own (`ownerId` equal to their auth uid or email). Portal clients can read, not change, deals on their own account.
- `meters`: readable when the meter's account is visible to you; only admins and the account owner can change them.
- Portal clients are matched by sign-in email to `contacts.email`, then to that contact's `accountId`.
- The browser Supabase client is subject to these rules. Server routes using `supabaseAdmin` are not. If a CRM screen suddenly shows no deals or meters for a non-admin user, check these policies first.

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
- `process-sequence-step` is invoked by Supabase database cron/pg_net, not by a logged-in browser user. Deploy it with `--no-verify-jwt`; the function still protects itself with the cron secret header. If JWT verification is turned on, sequence jobs return 401 and protocols look frozen.

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

## CRM UI Rules

These apply to `/network` and other internal surfaces. For the public website, see "Public Website" above.

The CRM uses a dark forensic interface, not a generic SaaS style.

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
- Production deploys come from `main`, so a push to `main` puts public website changes live

## Supabase MCP Access

Agents can access the connected Supabase project through the configured MCP tools in this environment. That is the preferred way to inspect schema, run safe queries, check advisors, generate types, and manage migrations.

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

## Working Rules

- Read the existing code before assuming architecture.
- Prefer matching local patterns over introducing a "cleaner" but foreign approach.
- Do not replace existing design language with generic UI.
- When changing dossier, dashboard, telemetry, or protocol-builder UI, preserve the forensic command-center feel.
- Favor concise, understandable solutions over clever ones.
- If something looks inconsistent or wasteful, call it out clearly instead of working around it silently.
- Install a dependency only when the change in front of you uses it.

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
