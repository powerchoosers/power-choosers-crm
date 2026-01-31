
### Sitewide Layout Consistency
- **Status**: Completed
- **Description**: Standardized the layout across all pages by resolving uneven padding issues caused by scrollbar reservation.
- **Actions**:
  - [x] **Scrollbar Refinement**: 
    - [x] Removed `scrollbar-gutter: stable` from the `np-scroll` class in `globals.css` to eliminate the phantom right padding.
    - [x] Implemented hidden scrollbars while maintaining full scrolling functionality using `scrollbar-width: none` and `display: none`.
  - [x] **Layout Balancing**: Verified that the main content container is perfectly centered and balanced across all forensic dashboard views.
  - [x] **Consistency**: Applied the fix globally via the shared `np-scroll` utility class used in `layout.tsx`.

### Bulk Selection & Tactical Actions
- **Status**: Completed
- **Description**: Implemented a "Ghost Protocol" bulk selection system with a levitating command deck for tactical operations on People and Accounts pages.
- **Actions**:
  - [x] **Ghost Selection Logic**:
    - [x] Implemented row numbers that fade out on hover/selection in the People and Accounts tables.
    - [x] Created "Ghost Checkboxes" (glass style) that appear on hover and lock in when selected.
    - [x] Applied International Klein Blue (#002FA7) highlight and background to selected rows.
    - [x] Refined "Select All" toggle in table headers to explicitly target the **Whole Page** (50 nodes) using `getToggleAllPageRowsSelectedHandler`.
  - [x] **Levitating Command Deck**:
    - [x] Built `BulkActionDeck.tsx` component that levitates from the bottom when nodes are selected.
    - [x] Integrated real-time node counter (`[ X NODES SELECTED ]`) with one-line layout.
    - [x] Added click-to-edit count functionality for custom selection amounts.
    - [x] Standardized typography: Changed counter and AI (Enrich) icon colors to white.
    - [x] Refined counter interaction: Added `framer-motion` scale animation (zoom-in) and maintained white color on hover to signify clickability.
    - [x] Synced Icons: Updated `ADD_TO_TARGET` to use the `Radar` icon and `INITIATE_PROTOCOL` to use the `GitMerge` icon to match the sidebar.
    - [x] Added tactical action buttons: `ADD_TO_TARGET`, `INITIATE_PROTOCOL` (Play), and `ENRICH_DATA` (Sparkles).
    - [x] Implemented a distinct "Nuclear Option" (Trash icon) with red glow hover state.
  - [x] **Lazy Loading Selection**:
    - [x] Implemented logic to automatically fetch missing records when a custom count exceeds currently loaded data.
    - [x] Added "Execute-time" lazy loading to ensure all selected nodes are loaded before bulk actions are processed.
  - [x] **Nuclear Protocol (Purge)**:
    - [x] Built `DestructModal.tsx` for high-stakes deletion confirmation.
    - [x] Implemented a "Hold to Execute" mechanism requiring a 1.5-second hold to authorize the purge, preventing accidental deletions.
    - [x] Applied forensic "Obsidian" styling to the destruction interface.
  - [x] **Integration**: Fully integrated the selection system into `PeoplePage` and `AccountsPage` with TanStack Table state synchronization.

### Target Array Detail & List Filtering
- **Status**: Completed
- **Description**: Implemented dedicated detail views for target lists with automated filtering for People and Accounts.
- **Actions**:
  - [x] **Data Layer Enhancement**: 
    - [x] Modified `useContacts.ts` and `useAccounts.ts` to support optional `listId` filtering using a two-step `list_members` lookup (resolving polymorphic join limitations).
    - [x] Added `useTarget(id)` hook to `useTargets.ts` for single-list intelligence fetching.
  - [x] **Target Detail View**:
    - [x] Created `src/app/network/targets/[id]/page.tsx` with robust conditional rendering for `Human_Intel` (People) and `Asset_Intel` (Accounts).
    - [x] Optimized query execution to prevent invalid requests before target metadata is resolved.
    - [x] Integrated `ForensicTableSkeleton` and `FilterCommandDeck` for consistent UX.
    - [x] Implemented standardized `Sync_Block` footer and navigation controls.
  - [x] **UI/UX Refinement**:
    - [x] Applied `font-mono tabular-nums` to all ID and count fields.
    - [x] Integrated `ClickToCallButton` and action menus within list rows.
    - [x] Verified navigation flow from main Targets grid to specific list sectors.

### Call Data & Schema Migration
- **Status**: Completed
- **Description**: Synchronized call data fetching with the new snake_case Supabase schema and resolved search-related join errors.
- **Actions**:
  - [x] **Schema Sync**: Updated `useCalls.ts` and `useContactCalls` hooks to use snake_case columns (`contact_id`, `owner_id`, `ai_summary`, etc.) matching the production database.
  - [x] **Search Fix**: Resolved "Search calls error: {}" by switching to direct `owner_id` filtering on the `calls` table and removing strict inner join requirements in `GlobalSearch`.
  - [x] **Error Handling**: Enhanced logging in search hooks to capture structured Supabase error details (message, hint, code) for faster debugging.
  - [x] **Reliability**: Updated `useCallsCount` and infinite query hooks to ensure data consistency across the platform.

### Dossier Intelligence & Call Insights
- **Status**: Completed
- **Description**: Replaced legacy Bill History with real-time Call Insights and refined the Dossier header with Forensic Log and Context Lock controls.
- **Actions**:
  - [x] **Bill History Removal**: Removed the static/placeholder Bill History section from `ContactDossierPage`.
  - [x] **Call Integration**: Implemented `useContactCalls` hook to fetch real-time call logs from Supabase.
  - [x] **Forensic Log**: Added a "Forensic Log" (History) button to the header linked to the Gemini neural history.
  - [x] **Context Lock**: Implemented a "Context Lock" chip in the header for visual verification of target entity focus.
  - [x] **AI Summaries**: Integrated AI-generated call summaries and voice data insights into the dossier view.
  - [x] **Nodal Aesthetic**: Applied build.md design principles (Monolith borders, International Klein Blue accents, Monospaced data).
  - [x] **Gemini Chat Enhancement**: Converted "Reset Session" to "Add Chat" (+) button with global state synchronization and added access to History and New Chat in both chat header and TopBar.

### Editable Fields & UI Standardization
- **Status**: Completed
- **Description**: Implemented interactive editable fields on Dossier pages and standardized identity iconography across the platform.
- **Actions**:
  - [x] **Editable Dossier Fields**:
    - [x] Added padlock-triggered editing for Logo URL, Website, and LinkedIn fields on Account and Contact Dossiers.
    - [x] Implemented "Obsidian & Glass" slide-open input containers with Framer Motion animations.
    - [x] Integrated CRM persistence via Supabase mutations (`useUpdateAccount`, `useUpdateContact`).
  - [x] **Icon Standardization**:
    - [x] Standardized all contact letter glyphs and company icons to `rounded-2xl` (Squircle) across Accounts, People, Target ID, and Global Search pages.
    - [x] **Hardcoded Consistency**: Removed `variant` prop from `CompanyIcon` and `ContactAvatar` components, hardcoding `rounded-2xl` to prevent accidental circle overrides.
    - [x] **Deep Audit**: Identified and replaced hardcoded `rounded-full` instances with `rounded-2xl` in `GeminiChat`, `EmailList`, `SatelliteUplink`, `BulkImportModal`, `OrgIntelligence`, `DataIngestionCard`, `TaskManagement`, and all Dossier empty/error states.
    - [x] Preserved `rounded-full` ONLY for decorative status indicators, signal dots, and pulsing animations per forensic aesthetic requirements.

### Emails Page & Integration
- **Status**: Completed
- **Description**: Migrated legacy email features (Inbox Sync, Composition, Tracking) to the new Next.js platform.
- **Actions**:
  - [x] **Backend Integration**: Verified `sendgrid-send.js` API proxy via `next.config.ts`.
  - [x] **Logic Porting**:
    - Created `useGmailSync.ts` to handle client-side Gmail API sync and Firestore deduplication (ported from `gmail-inbox-sync.js`).
    - Created `useEmails.ts` with TanStack Query for real-time email list management (ported from `emails-redesigned.js`).
  - [x] **UI Implementation**:
    - Created `ComposeModal.tsx` for sending emails (replacing `email-compose-global.js`).
    - [x] Created `EmailList.tsx` with folder filtering (Inbox/Sent) and tracking stats display.

### Identity Styling & Forensic Iconography
- **Status**: Completed
- **Description**: Refined the visual identity system for logos and avatars to align with the "Forensic Instrument" aesthetic, specifically correcting drop shadow geometry and background consistency.
- **Actions**:
  - [x] **Drop Shadow Correction**:
    - [x] Corrected `CompanyIcon` to use a high-position, high-opacity circular drop shadow (`shadow-[0_0_15px_rgba(0,0,0,0.8)]`) instead of the low-positioned offset shadow.
    - [x] Increased border opacity to `white/20` for sharper edge definition in high-blur environments.
  - [x] **Background Standardization**:
    - [x] Integrated `bg-zinc-900/80` directly into the `CompanyIcon` component to ensure consistent backdrop density regardless of the parent container.
    - [x] Removed legacy `p-1` padding from icon instances to maximize logo visibility and maintain a clean `nodal-glass` edge.
  - [x] **Component Cleanup**:
    - [x] Stripped hardcoded styling from `CompanyIcon` instances across `AccountsPage`, `AccountDossier`, `PeoplePage`, `GlobalSearch`, `TargetDetail`, and `OrgIntelligence`.
    - [x] Centralized identity styling within the base UI components for sitewide design consistency.
  - [x] **Email UI Implementation**:
    - [x] Created main `EmailsPage` (`src/app/network/emails/page.tsx`) adhering to Nodal Point design standards.
    - [x] Created dedicated Detail Page (`src/app/network/emails/[id]/page.tsx`) for full-view reading and replying.
  - [x] **Tracking**: Integrated Open/Click tracking stats display in the email list (leveraging existing backend tracking system).
  - [x] **Navigation**: Added "Emails" link to the Sidebar.
  - [x] **Sender Name**: Ensured outgoing emails use user's first/last name (Auth + Gmail service lookup) instead of email prefix.

### Contact Dossier (People → Contact Detail)
- **Status**: Completed
- **Description**: Added a dedicated contact detail view (dossier) with account-linked energy context.
- **Actions**:
  - [x] **Detail Route**: Added `src/app/network/contacts/[id]/page.tsx` with bento-style layout and contract maturity bar.
  - [x] **Data Access**: Implemented `useContact(id)` in `src/hooks/useContacts.ts` for single-contact fetch.
  - [x] **Account Context**: Resolved linked account via contact accountId / name match and rendered energy fields when present.
  - [x] **Navigation**: Made People table rows and “View Details” open `/network/contacts/[id]`.
  - [x] **Bug Fix**: Resolved "Unknown" name rendering by implementing legacy name construction logic (firstName + lastName) in `useContacts.ts`.
  - [x] **Aesthetic Refinement**:
    - [x] Removed duplicate environment widgets (Time, Weather, Volatility) from Center Column.
    - [x] Updated Contract Maturity card with explicit Expiration Date row.
    - [x] Brightened Terminal text color to Phosphor Green (#22c55e).
    - [x] Grouped social icons in a Pill container in the header.
    - [x] Added Bill History section to fill empty space.
  - [x] **Org Intelligence**:
    - [x] Integrated Apollo scan logic (gated).
    - [x] Implemented "Acquire" button to import contacts directly into Supabase.
    - [x] Added "MONITORED" status check for existing contacts.

### Twilio Integration & Voice
- **Status**: Completed
- **Description**: Migrated legacy Twilio voice dialer to the new Next.js platform with full real-time status tracking.
- **Actions**:
  - [x] **SDK Integration**: Integrated `@twilio/voice-sdk` into `VoiceContext.tsx`.
  - [x] **State Management**: Created `useCallStore` (Zustand) for global call status and duration tracking.
  - [x] **UI Implementation**: 
    - Built interactive Dialer widget in `TopBar.tsx` with manual dial and contact-integrated calling.
    - Added "Active Call" HUD with duration tracking, mute, and hangup controls.
  - [x] **Deployment**: Resolved TypeScript type errors in Voice SDK initialization for successful Cloud Build.

### UI & Layout Polishing
- **Status**: Ongoing
- **Description**: Refining component layouts and fixing UX regressions.
- **Actions**:
  - [x] **Sticky Sidebar**: Fixed scrolling constraints on `TechnicalDocs` page to ensure documentation navigation remains visible.
  - [x] **Clean Up**: Removed redundant "Using: Nodal Point" indicators in TopBar to simplify the UI hierarchy.

### Bill Debugger & Analysis
- **Status**: Completed
- **Description**: Migrated and fixed the bill analysis API and frontend logic for the new platform.
- **Actions**:
  - [x] **Backend Integration**: Implemented `/api/analyze-bill` with Gemini 2.5 Flash-Lite fallback chain.
  - [x] **Frontend Logic**: Built `BillDebuggerPage` with forensic console UI and real-time extraction feedback.

### Nodal Architect Intelligence & Accuracy
- **Status**: Completed
- **Description**: Fixed contract end date hallucinations and enhanced CRM data resolution logic.
- **Actions**:
  - [x] **Date Resolution**: Implemented robust date resolution in `list_accounts`, `get_account_details`, and `get_contact_details` to check multiple metadata fields (`contract_end_date`, `contractEndDate`).
  - [x] **Normalization**: Added automatic conversion of legacy date formats (MM/DD/YYYY) to ISO (YYYY-MM-DD) within tool handlers.
  - [x] **Anti-Hallucination**: Strengthened `ANTI_HALLUCINATION_PROTOCOL` with explicit rules against inventing contract dates or changing existing dates to match queries.
  - [x] **Query Optimization**: Enhanced Supabase queries to filter by expiration year across both top-level columns and nested metadata strings using year-suffix matching (`ilike %/2026`).
  - [x] **Context Awareness**: Verified frontend `GeminiChat.tsx` correctly transmits page context (account/contact IDs) for zero-click intelligence.
  - [x] **Reliability**: Updated `next.config.ts` proxying and enhanced server-side error handling to ensure consistent JSON responses.
  - [x] **Design**: Applied Nodal Point "Obsidian & Glass" aesthetic to the analysis interface.

## 🚧 Active Development (Nodal Point Migration)

### Account Dossier Migration & Refinement
- **Status**: Completed
- **Description**: Migrated and refined the Account Dossier page with full Supabase integration, forensic styling, and fixed type safety.
- **Actions**:
  - [x] **Data Integration**: Implemented `useAccount`, `useUpdateAccount`, and `useAccountContacts` hooks for real-time Supabase sync.
  - [x] **Forensic Styling**: Applied "Obsidian & Glass" aesthetic, including position maturity bars and forensic log terminals.
  - [x] **Type Safety**:
    - [x] Optimized `Account` interface by removing index signature and using targeted type assertions for context passing.
    - [x] Standardized `useAccountContacts` return type to `Contact[]` with default values for required fields.
    - [x] Fixed React attribute type errors (`rows={1}`).
  - [x] **Dossier Header**: Integrated lock/unlock controls and status indicators (Active Load, Active Intelligence).

### AI Router & OpenRouter Integration
- **Status**: Ongoing
- **Description**: Enhancing the AI fallback system with OpenRouter and real-time routing diagnostics.
- **Actions**:
  - [x] **Fallback Fix**: Resolved issue in `chat.js` where Gemini quota errors would skip remaining free models. Replaced `break` with `continue` in the model loop.
  - [x] **Diagnostics HUD**: Implemented real-time "Neural Trace" in `GeminiChat.tsx` to visualize model selection, latency, and error states.
  - [x] **OpenRouter E2E**: Integrated `OPEN_ROUTER_API_KEY` across `.env.local`, `cloudbuild.yaml`, and `server.js` for production-ready access to diverse LLM providers.
  - [ ] **Model Implementation**: Configure specific OpenRouter models in `chat.js` and `analyze-bill.js` (Pending user selection).

### Call Processing & Background Intelligence
- **Status**: Completed
- **Description**: Ported legacy call processing features to the new platform, including background loading, real-time insights, and two-channel transcripts.
- **Actions**:
  - [x] **Background Loading**: Integrated cache-heavy loading strategy in `useCalls.ts` using TanStack Query `staleTime` and `gcTime` to reduce API overhead.
  - [x] **Real-time Updates**: Implemented Supabase real-time listeners in `useContactCalls` and `useCallProcessor` to update call insights instantly when processing completes.
  - [x] **Manual Processing**: Added the "Eyeball" button to `CallListItem.tsx` with a pulsing AI processing state and direct integration with Twilio Voice Intelligence (V2).
  - [x] **Two-Channel Transcripts**: Enhanced transcript rendering with robust speaker detection (Agent vs. External) and forensic typography.
  - [x] **Cost Optimization**: Replaced legacy polling logic with real-time push notifications, significantly reducing Cloud Run execution costs.
  - [x] **Ungated Access**: Enabled recording playback and analysis for all call records, removing legacy feature gating.

### Click-to-Call with Context
- **Status**: Completed
- **Description**: Implemented Twilio-powered click-to-call across the platform with automatic context detection and passing.
- **Actions**:
  - [x] **Store Enhancement**: Updated `useCallStore` to support cross-component call triggers and context metadata (Name, Account, Title, Logo).
  - [x] **Header Dialer**: Modified `TopBar.tsx` to display context metadata in the dialer panel and auto-initiate calls triggered from other components.
  - [x] **Dossier Integration**: Implemented `handleCallClick` in `UplinkCard.tsx` with logic to differentiate between Company context (for company phones) and Contact context (for personal phones).
  - [x] **Global Availability**: Created `ClickToCallButton.tsx` and integrated it into the People and Accounts tables for consistent click-to-call behavior platform-wide.
  - [x] **Legacy Logic**: Replicated legacy phone parsing and context handling behavior while maintaining the Nodal Point "Obsidian & Glass" aesthetic.

### Forensic Instrumentation (UI/UX Refinement)
- **Status**: Completed
- **Description**: Refined the platform into a "Forensic Instrument" by standardizing time, search, status, and typography.
- **Actions**:
  - [x] **Human Time Protocol**: Implemented `date-fns` relative time formatting (3-month threshold) across all tables (Accounts, People, Calls, Emails).
  - [x] **Command Palette**: Transformed Global Search into a ⌘K Command Palette with "Query Database..." functionality and visual cues.
  - [x] **Live Signals**: Standardized pulsing LED dots for status indicators, replacing generic pills.
  - [x] **Typography Enforcement**: Applied `font-mono tabular-nums` to all numerical data (IDs, Prices, Phone Numbers, Counts) for vertical alignment.
  - [x] **Context Sidebar**: Enhanced the Right Sidebar with context-aware widgets (Volatility Index, Local Time, Weather) and entity-specific task filtering.
  - [x] **Forensic Terminal**: Upgraded the `ContactDossierPage` terminal with persistent notes (Supabase), click-to-type, system commands (/clear, /status), and command prompts.
  - [x] **Obsidian & Glass**: Standardized `nodal-glass` system and `space-y-8` grid gaps across core pages (People, Accounts, Emails, Settings).
  - [x] **Collection Standardization**: Mirrored Emails page header/footer styles (Sync_Block, Total_Nodes) across all list pages (People, Accounts, Tasks, Protocols, Calls, Energy, Scripts).

### Nodal Architect (Glass Intelligence Overhaul)
- **Status**: Completed
- **Description**: Transformed the Gemini assistant into the "Nodal Architect," a contextual, high-agency intelligence layer with a forensic instrument aesthetic.
- **Actions**:
  - [x] **UI Overhaul**: Implemented "Glass Intelligence" design (backdrop-blur-2xl, frosted glass, monospace typography).
  - [x] **Kill the Candy**: Eliminated consumer-grade aesthetics in favor of a stealth terminal look.
  - [x] **Stealth User Command**: Implemented dark glass message blocks with right-aligned `COMMAND_INPUT` indicators.
  - [x] **Neural Line Response**: Added a vertical blue spine to AI responses with `NODAL_ARCHITECT // v1.0` branding.
  - [x] **Execute Protocol**: Upgraded the message submission button to International Klein Blue (#002FA7) with a forensic glow effect.
  - [x] **Ambient Hum**: Added `Waveform` component and ambient animations for system status feedback.
  - [x] **Zero-Click Start**: Implemented contextual awareness (route-specific greetings and proactive insights for Contacts/Accounts).
  - [x] **Adaptive UI (Rich Media)**: Built `ComponentRenderer` to handle structured JSON data for `news_ticker` and `mini_profile` cards.
  - [x] **Voice Command Mode**: Integrated hold-to-speak functionality with visual feedback.
  - [x] **API Protocol**: Standardized `JSON_DATA:END_JSON` delimiters for structured backend communication.
  - [x] **History Fix**: Resolved Gemini API role-alternation errors by implementing robust history filtering in `api/gemini/chat.js`.
  - [x] **Fallback Reliability**: Fixed the Gemini fallback system to ensure all Gemini model candidates are tried before falling back to Perplexity (Sonar). Resolved the issue where a single quota error would trigger an immediate jump to the paid provider.
  - [x] **AI Router Diagnostics**: Added AI Router Diagnostics HUD to visualize model selection.
  - [x] **Model Optimization**: Optimized Gemini model list and removed redundant code blocks in `api/gemini/chat.js`.

### Nodal Point Directive Implementation
- **Status**: Completed
- **Description**: Aligned the platform with the mission-focused "Nodal Point" philosophy by updating terminology, icons, and navigation logic.
- **Actions**:
  - [x] **Terminology Migration**:
    - [x] Renamed "Lists" to "Targets" (Passive Admin -> Active Mission).
    - [x] Renamed "Sequences" to "Protocols" (Linear Task -> Weaponized Workflow).
    - [x] Updated task priorities from "Sequence" to "Protocol".
    - [x] Updated organizational scanning to "Target_Pool".
  - [x] **Navigation & Logic Refactoring**:
    - [x] Refactored `useLists` hook to `useTargets` and `useSequences` to `useProtocols`.
    - [x] Updated Sidebar icons to `Radar` (Targets) and `GitMerge` (Protocols).
    - [x] Aligned all route directories and internal links (`/network/targets`, `/network/protocols`).
    - [x] Updated Global Search (⌘K) to include Targets and Protocols with mission-focused identifiers.
  - [x] **Type Safety**:
    - [x] Created `src/types/targets.ts` and updated all references to use the `Target` interface.
    - [x] Purged legacy `lists.ts` and `useLists.ts` files.

### Unified Global Search & Server-Side Search
- **Status**: Completed
- **Description**: Implemented high-performance, server-side search across all platform entities (Supabase) and a centralized Command Palette (⌘K).
- **Actions**:
  - [x] **Global Search Modal (⌘K)**: Updated `GlobalSearch.tsx` to search across Contacts, Accounts, Protocols, Tasks, Calls, and Emails using Supabase server-side queries.
  - [x] **Page-Specific Search**: Migrated all page-level search functions (People, Accounts, Protocols, Tasks, Calls, Emails, Scripts, Energy) from client-side filtering to 400ms debounced server-side Supabase `ilike` queries.
  - [x] **Supabase Integration**:
    - Implemented `useSearchContacts`, `useSearchAccounts`, `useSearchProtocols`, `useSearchTasks`, `useSearchCalls`, and `useSearchEmails` hooks.
    - Added total record counting (`useTasksCount`, `useCallsCount`, etc.) for accurate pagination during search.
  - [x] **Ownership Filtering**: Ensured all search queries respect user roles (admin vs. non-admin) and `ownerId` metadata.
  - [x] **Performance**: Optimized API calls using `useInfiniteQuery` and range-based pagination, reducing client-side memory load.

### Nodal Architect Refinements & Metadata Intelligence
- **Status**: Completed
- **Description**: Enhanced the Nodal Architect's precision by implementing metadata deep-scanning, temporal context awareness, and industry-specific intelligence mapping.
- **Actions**:
  - [x] **Temporal Context**: Hard-coded current date awareness (2026-01-27) to prevent legacy model drift.
  - [x] **Deep Metadata Scanning**: Updated `list_accounts` tool in `chat.js` to search both top-level columns and `metadata` JSONB for expiration dates and industry tags.
  - [x] **Normalization Layer**: Implemented on-the-fly field promotion in `chat.js` to ensure AI sees legacy data as first-class citizens.
  - [x] **Industry Intelligence**: Mapped "Manufacturing" to broad sub-sectors (Building Materials, Electrical, Fabrication) within the AI's system prompt and search logic.
  - [x] **Linter Stability**: Resolved template literal nesting issues by escaping backticks in system prompt strings.
  - [x] **Forensic Transparency**: Added `list_all_documents` tool to allow full database audits of bills and contracts.
  - [x] **Anti-Hallucination**: Reinforced system prompt with explicit bans on demo data and verification protocols for CRM records.

### 1. Data Layer Migration (Supabase)
- **Status**: 🏗️ In Progress
- **Priority**: Critical (Cost Reduction)
- **Owner**: Nodal Point Builder
- **Description**: Migrating from Firestore to Supabase (PostgreSQL) to eliminate read costs and enable vector search.
- **Tasks**:
  - [x] Install `@supabase/supabase-js`
  - [x] Initialize Client (`src/lib/supabase.ts`)
  - [ ] Create Database Tables (Accounts, Contacts, Calls)
  - [ ] Migrate `api/calls` logic to SQL queries
  - [ ] Migrate `api/search` logic to SQL queries

### 2. Dashboard Widgets
- [x] **Organizational Intelligence Migration** (Relocated to Sidebar, Search, Pagination, Company Summary)
- [x] **Recent Calls Pagination** (4 calls per page on Contact Dossier)
- [x] **Click-to-Call Context Integration** (Company/Contact context passing)
