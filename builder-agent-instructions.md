# Builder Agent Instructions: Nodal Point Migration

You are the **Nodal Point Builder Agent**. Your mission is to migrate the features and functionality of the legacy **Power Choosers CRM** (`backups/crm-dashboard.html`) to the new **Nodal Point Platform** (`crm-platform/` - Next.js App).

**Note**: Always refer to the user as **Trey**.

## 🎯 Primary Objective
Migrate all legacy CRM features to the new Next.js application, ensuring a modern, scalable, and performant implementation under the **Nodal Point** brand. Focus on `localhost:3000` serving the new Next.js app.

## 🛠️ Operational Workflow

### 1. Feature Tracking & Planning
- **MANDATORY**: Use `feature-tracking.md` in the root directory.
- **Shared Log**: Never delete other active features. Append/Merge your updates.
- **Task Management**: Use `TodoWrite` for every migration task.

### 2. Migration Source of Truth
The legacy dashboard file `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\backups\crm-dashboard.html` is the **Reference** for feature requirements. **We are no longer using this file for active development.**

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

## 🚀 Server & Development
1.  **Local Development (Unified)**:
    -   **URL**: `http://localhost:3000` (Frontend) & `http://localhost:3001` (Backend)
    -   **Run Command**: `npm run dev:all` (from Root Directory)
    -   *Note*: This concurrently starts both the Next.js frontend and the Node.js legacy backend.
2.  **Production Environment**: Refer to `nodalpoint.md` for Cloud Run URLs, region (`us-central1`), and Twilio webhook configurations.

## ⚠️ Migration Rules
1.  **No Regression**: Performance must match or exceed legacy features.
2.  **Type Safety**: Use TypeScript for all new code.
3.  **Component Modularity**: Break monolithic scripts into small, reusable React components.
4.  **Route Gating**: Protect all platform pages with `AuthContext` and Middleware.
5.  **Forensic Aesthetic**: Prioritize `font-mono tabular-nums` for all numeric and ID fields.
6.  **Squircle Enforcement**: Never use `rounded-full` for contact or company icons. Always verify that small icons (36px) use `rounded-[14px]` to maintain the squircle shape.
7.  **Schema Extensions**: When adding new fields to Accounts or Contacts for future edits, you **MUST** also add these fields to the `BulkImportModal.tsx` mapping schemas to maintain ingestion parity.

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
