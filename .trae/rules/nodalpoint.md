# Nodal Point CRM Platform

Welcome to the **Nodal Point CRM Platform**, a modern, scalable, and high-performance Customer Relationship Management system built with Next.js 15. This platform is the evolution of the legacy "Power Choosers CRM".

## 🚀 Tech Stack

- **Framework:** [Next.js 15+](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **State Management:**
  - [Zustand](https://github.com/pmndrs/zustand) (Global Client State)
  - [TanStack Query](https://tanstack.com/query/latest) (Server State / Async Data)
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
├── crm-platform/           # New Next.js Application
│   ├── src/
│   │   ├── app/            # App Router (Pages & Layouts)
│   │   ├── components/     # Reusable UI Components
│   │   ├── context/        # React Context Providers
│   │   ├── lib/            # Utilities & Firebase Config
│   │   └── store/          # Zustand Stores
│   ├── public/             # Static Assets
│   └── package.json        # Frontend Dependencies
├── api/                    # Backend API Endpoints
├── backups/                # Legacy HTML Dashboard (Reference Only)
├── server.js               # Node.js Server (API & Legacy Support)
└── feature-tracking.md     # Migration Status Log
```

## ⚡ Quick Start

To run the full platform, you need to start both the **Frontend** and **Backend** servers.

### 1. Start the Backend API (Legacy Server)
This handles API requests and legacy routing.

Open a terminal in the root directory:
```powershell
node server.js
```
*Runs on Port 3001 (or configured port).*

### 2. Start the Frontend (Next.js)
This serves the modern user interface.

Open a **new** terminal, navigate to `crm-platform`, and run the dev server:
```powershell
cd crm-platform
npm run dev -- --port 3000
```
*Runs on [http://localhost:3000](http://localhost:3000)*

## 🔑 Authentication

The platform uses **Firebase Authentication**.
- **Login**: Users must authenticate via the `/login` page.
- **Protection**: Routes under `/crm-platform` are protected by Next.js Middleware.
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
- **AI Integration**: Use the "Sparkles" icon for AI-powered features.
- **Layout**: Sidebar (Left), Top Bar (Header), Right Panel (Contextual Widgets).

## 📐 Standardized Page Layout

All main application pages (Accounts, People, Sequences, etc.) must follow this standardized layout structure:

1.  **Container**: Fixed height with entry animation.
    ```tsx
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
    ```
2.  **Primary Button**: White background, dark text.
    ```tsx
    <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium">
    ```
3.  **Search Bar**: Backdrop blur, zinc-900/50 background.
    ```tsx
    <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
    ```
4.  **Data Table/Grid Container**: Rounded, bordered, backdrop blur.
    ```tsx
    <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
    ```
5.  **Sticky Header**: For tables, the header must be sticky.
    ```tsx
    <TableHeader className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-sm border-b border-white/5">
    ```

## 📚 Documentation Maintenance
- **Self-Update Rule**: Whenever significant features, architectural patterns, or new workflows are introduced:
  1. This file (`nodalpoint.md`) MUST be updated to reflect the current state.
  2. The `builder-agent-instructions.md` file MUST be updated if operational rules change.
  3. The root `README.md` should be checked for high-level summary updates.
- **Goal**: Zero drift between codebase and documentation.

## 📄 License

Private & Confidential - Nodal Point / Power Choosers CRM.
