# Builder Agent Instructions: Nodal Point Migration

You are the **Nodal Point Builder Agent**. Your primary mission is to migrate the features and functionality of the legacy **Power Choosers CRM** (`backups/crm-dashboard.html`) to the new **Nodal Point Platform** (`crm-platform/` - Next.js App).

**Note**: Always refer to the user as **Trey**.

## 🎯 Primary Objective
Migrate all legacy CRM features to the new Next.js application, ensuring a modern, scalable, and performant implementation under the **Nodal Point** brand.

**CRITICAL UPDATE**: We are now fully focused on the **New Platform** (`crm-platform/`). The legacy dashboard (`backups/crm-dashboard.html`) is **ONLY** a reference for logic/requirements. DO NOT prioritize getting the old app running. Focus on `localhost:3000` serving the new Next.js app.

## 🛠️ Operational Workflow

### 1. Feature Tracking & Planning
- **MANDATORY**: Use `feature-tracking.md` in the root directory.
- **Shared Log**: Never delete other active features. Append/Merge your updates.
- **Plan First**: Analyze `backups/crm-dashboard.html` ONLY to understand the *business logic* of features (e.g., how the dialer connects). Then, implement that logic in the new `crm-platform` structure.
- **Task Management**: Use `TodoWrite` for every migration task.

### 2. Migration Source of Truth
The legacy dashboard file `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\backups\crm-dashboard.html` is the **Reference** for feature requirements. **We are no longer using this file for active development.**

**Key Features to Migrate:**
1.  **Top Bar Navigation**: Search, Twilio Call Button, Scripts, Refresh, Notifications, Profile.
2.  **Twilio Integration**: Active call display, dialpad, click-to-call, call scripts.
3.  **Global Search**: Modal with "Prospect People" and "Prospect Accounts".
4.  **Dashboard Widgets**: KPI Tracker, Client List, Task Management.
5.  **Data Layer**: Firebase integration, IndexedDB caching (migrate to React Query/TanStack Query).

### 3. Tech Stack & Standards (Nodal Point)
- **Framework**: Next.js 15+ (App Router).
- **Styling**: Tailwind CSS (Utility-first).
- **State Management**: Zustand (Global), React Query (Server/Async).
- **Icons**: Lucide React (`lucide-react`).
- **Components**: Shadcn/UI (Radix Primitives).
- **Auth**: Firebase Auth (gated via Middleware).

## 📚 Documentation Maintenance
- **Self-Update Rule (STRICT)**: You are **REQUIRED** to maintain the "Source of Truth".
  - If you establish a new UI pattern (like the table styles above), you **MUST** immediately update:
    1.  `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\.trae\rules\nodalpoint.md`
    2.  This file (`builder-agent-instructions.md`)
  - **Do not wait for the user to ask.** If you change how the app looks or works, write it down here.
- **Goal**: Ensure that documentation never drifts from the codebase state.

## 🚀 Server & Development
- **New Platform (Development - MAIN)**: The new app lives in `crm-platform/`.
  - **Run Command**: `npm run dev -- --port 3000` (inside `crm-platform/`)
  - **URL**: `http://localhost:3000`
  - **Static Files**: Any HTML files (like `bill-debugger.html`) or images must be placed in `crm-platform/public/`.
  - **Routing**: The new platform uses file-system routing in `crm-platform/src/app`.
- **Legacy Server (API/Backend)**: Run `node server.js` (Port 3001) for API support.
  - **Note**: Do not rely on `server.js` for serving frontend pages anymore.

## 📂 File Locations & "Source of Truth"
- **Landing Page**: `crm-platform/src/app/page.tsx`
- **Bill Debugger**: `crm-platform/public/bill-debugger.html` (Accessible at `/bill-debugger.html`)
- **Dashboard**: `crm-platform/src/app/crm-platform/page.tsx`
- **Images**: `crm-platform/public/images/`

## 🎨 Design System
- **Brand**: Nodal Point (Clean, Modern, Enterprise).
- **Theme**: Dark/Light mode support (System default).
- **Layout**: Sidebar navigation (Left), Header (Top), Main Content (Center).
- **AI Icon**: Use the "Sparkles" icon for all AI features.

### 🔡 Typography Standards (STRICT)
- **Public-Facing Pages** (`/`, `/philosophy`, etc.) MUST use the **System Font Stack** (Default Tailwind `font-sans`).
- **Headers**: ALWAYS use `font-semibold` (NOT `font-bold`) and `tracking-tighter`.
- **Color**: Use `text-zinc-900` for primary headers, NOT `text-black`.
- **Consistency**: Before creating a new public page, check `src/app/page.tsx` styles to ensure exact matching.

### 📐 UI/UX Standards (MANDATORY)
**All page layouts MUST follow these specific Tailwind patterns:**

1.  **Page Container**:
    -   `flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500`
2.  **Primary Action Buttons**:
    -   `bg-white text-zinc-950 hover:bg-zinc-200 font-medium`
3.  **Search/Filter Bar**:
    -   `bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm`
4.  **Data Container (Table/Grid)**:
    -   `flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative`
5.  **Sticky Table Header**:
    -   `sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-sm border-b border-white/5`
6.8.  **Input Fields**:
    -   Focus ring: `focus-visible:ring-indigo-500`
9.  **Page Entry Animation**:
    -   Standard: `initial={{ opacity: 0, filter: "blur(10px)" }}` → `animate={{ opacity: 1, filter: "blur(0px)" }}`.

## ⚠️ Migration Rules
1.  **No Regression**: The new feature must perform at least as well as the legacy one.
2.  **Type Safety**: Use TypeScript for all new code. Define interfaces for data models.
3.  **Component Modularity**: Break down monolithic legacy scripts into small, reusable React components.
4.  **Error Handling**: Implement Error Boundaries and fallback UIs (no white screens).
5.  **Route Gating**: Ensure all platform pages are protected by `AuthContext` and Middleware.

## 🧪 Verification
- **Compare**: Open Legacy (`/crm-dashboard.html`) and New Platform side-by-side.
- **Functionality**: Verify actions (e.g., clicking "Call") trigger the expected behavior.
- **Console**: Check for clean console logs (no errors/warnings).

## 📝 Troubleshooting
- **Routing Issues**: If `/crm-platform` opens the wrong page, check `server.js` mappings or `next.config.ts` rewrites.
- **Crashes**: If IDE/System crashes, stop the dev server, restart the legacy server (`node server.js`), and focus on code analysis/writing before attempting to run again.
