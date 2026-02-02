
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

### Nodal Architect Search Fixes
- **Status**: Completed
- **Description**: Resolved critical logic failures in the AI search system preventing fallback to keyword search when vector results were empty.
- **Actions**:
  - [x] **Logic Gate Repair**: Updated `list_contacts`, `list_accounts`, and `search_emails` in `api/gemini/chat.js` to strictly check for `vectorResults.length > 0` before declaring vector search successful.
  - [x] **Schema Alignment**: Corrected `firstName`/`lastName` (camelCase) to `first_name`/`last_name` (snake_case) in the `list_contacts` fallback SQL query to prevent "Column does not exist" crashes.

### Nodal Architect ID Generation
- **Status**: Completed
- **Description**: Implemented proactive UUID v4 generation for new Contacts and Tasks created via AI tools to support Supabase text-based primary keys.
- **Actions**:
  - [x] **ID Generation**: Updated `create_contact` and `create_task` in `api/gemini/chat.js` to assign `crypto.randomUUID()` if no ID is provided by the LLM.
  - [x] **Searchability Verification**: Confirmed existence of `embed_contacts_on_insert` triggers in `20260201_automatic_embeddings.sql`, ensuring new records are automatically indexed for vector search.

### Nodal Architect Anti-Hallucination Guard
- **Status**: Completed
- **Description**: Eliminated fabricated CRM responses by grounding account search and contract queries directly in Supabase.
- **Actions**:
  - [x] **Grounded Routing**: Added a deterministic CRM path in `api/gemini/chat.js` that intercepts account lookups, expiration-year queries, and contract detail requests.
  - [x] **Context Inference**: Implemented last-account inference from prior `forensic_grid` JSON blocks to support follow-up questions like "contract details".
  - [x] **No Fabrication**: Returns `Unknown` / `Data_Void` when key contract fields are missing instead of inventing values.

### Nodal Architect Account Search Hardening
- **Status**: Completed
- **Description**: Improved reliability for multi-word account lookups and reduced dependence on a brittle RPC search function.
- **Actions**:
  - [x] **Query Normalization**: Strips common “find/search/list account” preambles and trailing “account(s)” tokens before searching.
  - [x] **Exact Name Pass**: Adds a direct `name ILIKE <query>` check before hybrid/keyword search.
  - [x] **Tokenized Fallback**: Expands keyword fallback to search across multiple tokens (name/domain/industry/location) and ranks results in-memory for best match.
  - [x] **Hybrid Search Upgrade**: Updated `hybrid_search_accounts` SQL to guarantee exact-name matches are pinned above RRF fusion ordering.
  - [x] **Location Search**: Implemented dedicated location search path for city/state queries (e.g. "accounts in Houston") with `forensic_grid` response.
  - [x] **Single Match Promotion**: Added logic to automatically promote single or exact account matches to detailed `position_maturity` view instead of a generic grid.
  - [x] **RPC Fix**: Resolved `contractEndDate` column name mismatch in `hybrid_search_accounts` RPC function.
