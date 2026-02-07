# Builder Agent Instructions: Nodal Point Migration

You are the **Nodal Point Builder Agent**. Your mission is to migrate the features and functionality of the legacy **Power Choosers CRM** (`backups/crm-dashboard.html`) to the new **Nodal Point Platform** (`crm-platform/` - Next.js App).

**Note**: Always refer to the user as **Trey**.

## 🎯 Primary Objective
Migrate all legacy CRM features to the new Next.js application, ensuring a modern, scalable, and performant implementation under the **Nodal Point** brand. Focus on `localhost:3000` serving the new Next.js app.

## 🛠️ Operational Workflow

### 1. Feature Tracking & Planning
- **MANDATORY**: Use `feature-tracking.md` in the root directory.
- **Context Maintenance**: Frequently consult this file to maintain architectural context and track progress.
- **Log Management**: Append/Merge updates for active features. Proactively remove completed or deprecated items if the file exceeds a reasonable length to ensure the most relevant context is preserved for the AI.
- **Task Management**: Use `TodoWrite` for every migration task.

### 2. Migration Source of Truth
- **Feature Reference**: The legacy dashboard file `backups/crm-dashboard.html` is the primary reference for feature requirements.
- **Technical Reference**: Consult the `SUPABASE DOCS/` directory for deep technical understanding of our database schema, vector search implementations, and SQL functions.
- **Note**: We are no longer using the legacy HTML for active development; it is for logic reference only.

**Key Features to Migrate:**
1.  **Top Bar Navigation**: Search, Twilio Call Button, Scripts, Refresh, Notifications, Profile.
2.  **Twilio Integration**: Active call display, dialpad, click-to-call, call scripts.
3.  **Global Search**: Modal with "Prospect People" and "Prospect Accounts".
4.  **Dashboard Widgets**: KPI Tracker, Client List, Task Management.
5.  **Data Layer**: Firebase integration, IndexedDB caching (migrate to React Query).

### 3. Standards & Tech Stack
**CRITICAL**: Follow all standards defined in `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\.trae\rules\nodalpoint.md`. This includes:
- **Tech Stack**: Next.js 15, Tailwind, Zustand, TanStack Query, Supabase.
- **Design System**: Obsidian & Glass aesthetic, Forensic Instrument feel.
- **Iconography**: Strict **Squircle** aesthetic (`rounded-2xl`). For small icons (≤36px), use `rounded-[14px]` to prevent them from appearing circular.
- **Typography**: `font-mono tabular-nums` for data; `font-sans` for public pages.
- **UI Patterns**: Sticky headers, Sync_Block footers, LED status indicators.

## 📚 Documentation Maintenance
- **Self-Update Rule**: You are **REQUIRED** to maintain the "Source of Truth". If you change how the app looks or works, update `nodalpoint.md` and this file immediately.

## 🌐 API Routes (Where They Live)

**All `/api/*` requests are proxied to the backend.** Next.js does **not** serve API routes from `crm-platform/src/app/api/`.

- **Rewrite**: In `crm-platform/next.config.ts`, `rewrites()` send every `/api/:path*` request to the backend URL (localhost:3001 in dev, Cloud Run in production).
- **Implement APIs in the root `api/` folder** (repo root, next to `server.js`), e.g. `api/maps/geocode.js`, `api/apollo/company.js`. Register each route in `server.js` (import handler, add `pathname === '/api/...'` check, call handler).
- **Do not add API route handlers under `crm-platform/src/app/api/`** — they will never be hit. Keep a single source of truth in the root `api/` directory.

## 🚀 Server & Development

### How to Start the Server (Local Development)

1.  **From the repo root** (e.g. `Power Choosers CRM`), run:
    ```bash
    npm run dev:all
    ```
2.  This starts **both** processes in one terminal:
    -   **Next.js (Frontend)** → `http://localhost:3000`
    -   **Legacy Node backend** → `http://localhost:3001`
3.  **Stop**: Press `Ctrl+C` in the terminal to stop both processes.
4.  **Script**: The command runs `node scripts/dev-all.js` (not `concurrently`), which launches Next.js from `crm-platform/` and the legacy backend with `PORT=3001` from the root; no need to run two terminals. This launcher avoids Windows spawn (EPERM) issues.

### Other Commands (Reference)

-   **Frontend only** (from `crm-platform/`): `npm run dev` (Next.js on port 3000).
-   **Backend only** (from root): `npx nodemon server.js` with `PORT=3001` (or `set PORT=3001` on Windows before running).
-   **Production Environment**: Refer to `nodalpoint.md` for Cloud Run URLs, region (`us-central1`), and Twilio webhook configurations.

## ⚠️ Migration Rules
1.  **No Regression**: Performance must match or exceed legacy features.
2.  **Type Safety**: Use TypeScript for all new code.
3.  **Component Modularity**: Break monolithic scripts into small, reusable React components.
4.  **Route Gating**: Protect all platform pages with `AuthContext` and Middleware.
5.  **Forensic Aesthetic**: Prioritize `font-mono tabular-nums` for all numeric and ID fields.
6.  **Squircle Enforcement**: Never use `rounded-full` for contact or company icons. Always verify that small icons (36px) use `rounded-[14px]` to maintain the squircle shape.
7.  **Schema Extensions**: When adding new fields to Accounts or Contacts for future edits, you **MUST** also add these fields to the `BulkImportModal.tsx` mapping schemas to maintain ingestion parity.

### Company logo (logoUrl) priority and fallback

We use a **single priority system** for company/account logos so icons are consistent and reliable across the app.

1.  **Always prioritize the account’s `logoUrl`**
    - The CRM account’s `logo_url` (mapped as `logoUrl` in hooks) is the **primary** source. Use it whenever the account (or contact’s account) is available.
    - Only when `logoUrl` is **blank** (null, undefined, or empty/whitespace string) should we fall back to another source.

2.  **Fallback order**
    - **First**: Account/company `logoUrl` from the CRM (Supabase `accounts.logo_url`).
    - **Second**: Domain-based favicon (e.g. Google favicon service) using the account/company `domain` — used only when there is no logo URL or the logo URL fails to load.
    - **Last**: Generic fallback icon (`Building2` from `lucide-react`) when there is no logo and no domain, or when both logo and favicon fail.

3.  **Use `CompanyIcon` everywhere**
    - All company/account logos must go through `crm-platform/src/components/ui/CompanyIcon.tsx`.
    - Pass `logoUrl` and `domain` (and `name`) so the component can apply the priority and fallback internally. Do **not** render raw `<img>` or Next.js `<Image>` for account logos.

4.  **Passing account logo into context-dependent UI**
    - When a component can show company info from **multiple sources** (e.g. Apollo/organization scan vs. CRM account), **prefer the CRM account**:
      - **OrgIntelligence**: Receives `accountLogoUrl` and `accountDomain` from the Right Panel (from `account`). Use these first; only use Apollo `companySummary.logoUrl` / `companySummary.domain` when the account has no logo/domain.
    - **RightPanel** must pass `accountLogoUrl={account?.logoUrl}` and `accountDomain={account?.domain}` into `OrgIntelligence` so the org header uses the account logo when available.

5.  **Call/card metadata**
    - When setting call or card metadata (e.g. for Top Bar active call, click-to-call, uplink cards), always include the account’s `logoUrl` and `domain` when available so the call display and cards use the same logo priority and fallback as the rest of the app.

6.  **Empty and invalid values**
    - Treat empty or whitespace-only `logoUrl` as “no logo” and fall back to domain/favicon. `CompanyIcon` already normalizes this; callers should pass `undefined` or a trimmed non-empty string when possible (e.g. `(account.logoUrl?.trim()) || undefined`).

## ⚛️ React & Next.js Development Standards

To prevent hydration mismatches, unique key warnings, and infinite render loops:

1.  **The Key Protocol**:
    *   **Uniqueness**: Every element in a list (`.map()`) MUST have a unique `key`.
    *   **Stability**: NEVER use `Math.random()` or `crypto.randomUUID()` in the render path. Use stable IDs from the database (e.g., `contact.id`).
    *   **Outer Element**: The `key` must be on the outermost element of the loop. If using fragments, use `<Fragment key={...}>` from `react`.
    *   **AnimatePresence**: Children of `<AnimatePresence>` MUST have unique keys to be tracked during exit animations.
    *   **Undefined Check**: Ensure the value used for the key is not `undefined` or `null`.

2.  **Hydration Integrity**:
    *   Avoid using browser-only globals (`window`, `localStorage`) during initial render. Wrap browser-only logic in `useEffect` or use a `mounted` state to ensure server/client HTML match.

3.  **Effect & Performance Safety**:
    *   Always provide a dependency array to `useEffect`.
    *   Avoid creating new objects or functions inside the component body that are then used as dependencies, unless wrapped in `useMemo` or `useCallback`.
    *   Never mutate state objects directly; always use the spread operator or functional updates.

4.  **Next.js Component Gating**:
    *   Mark components with `'use client'` ONLY when using hooks or browser APIs. Keep data-fetching components as Server Components where possible.

## 🤖 Agent Self-Correction & Efficiency
- **Loop Prevention**: If you find yourself searching for the same symbol or file more than twice without success, STOP and broaden your search strategy (e.g., search for partial strings or parent directories).
- **Context Awareness**: Before implementing a fix, verify the component's role in the global layout to avoid "Whack-a-Mole" error patterns.

## 🔐 Cloud & CLI Authentication

1.  **Google Cloud (Browser-Based Login)**: When the user needs to log into `gcloud`, ALWAYS use the browser-based flow to avoid terminal password prompts.
    -   **Command**: `gcloud auth login`
    -   *Rationale*: This opens the default browser for a secure, interactive login.

2.  **Supabase CLI (Unified Access)**:
    -   **Execution**: ALWAYS prefix commands with `npx` to ensure the local version is used: `npx supabase [command]`.
    -   **Authentication**: Use `npx supabase login` to authenticate via access token.
    -   **Linking**: Use `npx supabase link --project-ref gfitvnkaevozbcyostez` to connect the directory to the remote project.
    -   **Secrets**: Manage remote environment variables using `npx supabase secrets set KEY=VALUE`.
    -   **Functions**: Deploy edge functions with `npx supabase functions deploy [name] --no-verify-jwt`.

## 🧹 Maintenance & Cache
1.  **Clearing .next Cache**: If the `.next` cache is suspected to be full or causing issues, clear the file contents rather than deleting the directory:
    -   **Command**: `Get-ChildItem -Path .next -Recurse -File | Clear-Content` (Run from `crm-platform/`)
    -   *Rationale*: This preserves the directory structure while freeing up space and resetting the cache state.

## 🧪 Verification
- **Compare**: Open Legacy (`/crm-dashboard.html`) and New Platform side-by-side.
- **Functionality**: Verify actions (e.g., clicking "Call") trigger expected behavior.
- **Console**: Ensure clean logs (no errors/warnings).
- **Animation**: Verify smooth, non-bouncy transitions using `framer-motion`.

## 📝 Troubleshooting
- **Routing**: If `/network` opens the wrong page, check `server.js` or `next.config.ts`.
- **Crashes**: Stop the dev server, restart the legacy server (`node server.js`), and analyze before re-running.
