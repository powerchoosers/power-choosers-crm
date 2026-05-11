# Nodal Point: The Apollo for Energy

Nodal Point is a high-fidelity prospecting and forensic intelligence platform built specifically for commercial energy consultants. It provides a "command center" for brokers to identify high-value targets, analyze energy load profiles, and automate hyper-personalized outreach.

## Core Pillars

### 1. Forensic Intelligence
Go beyond basic contact data. Nodal Point provides energy-specific "Forensic Sound Profiles," highlighting thermal liabilities, load factor anomalies, and hidden cost leakage.

### 2. Industry-Specific Prospecting
Built for energy markets (ERCOT, PJM, etc.), our database is enriched with EIA data, nodal pricing, and retail market signals to help you find accounts that actually need your help.

### 3. Automated Sequences
Automate your outreach with hyper-personalized sequences that leverage our forensic data. Built-in burners and reputation management ensure your emails land in the inbox.

### 4. Forensic Command Center
A dark, high-density interface designed for experts. No generic SaaS dashboards—just the data you need to make decisions fast.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Database**: Supabase (PostgreSQL + RLS)
- **State**: Zustand + TanStack Query
- **Styling**: Tailwind CSS v4 + Framer Motion
- **Desktop**: Electron Shell for Windows/macOS

## Getting Started

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev:turbo
   ```

3. Open [http://localhost:3000](http://localhost:3000)

### Desktop Shell

- `npm run desktop:dev` - Starts the Next app locally and opens it in Electron.
- `npm run desktop:dist` - Packages an installer into `release/`.

## Architecture & Workflows

For detailed implementation rules, see [AGENTS.md](AGENTS.md).

- `/src/app` - Main UI routes
- `/src/lib` - Core utilities and data clients
- `/supabase` - Database migrations and edge functions
