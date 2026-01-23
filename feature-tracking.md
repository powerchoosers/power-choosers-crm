
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
    - Created `EmailList.tsx` with folder filtering (Inbox/Sent) and tracking stats display.
    - Created main `EmailsPage` (`src/app/crm-platform/emails/page.tsx`) adhering to Nodal Point design standards.
    - Created dedicated Detail Page (`src/app/crm-platform/emails/[id]/page.tsx`) for full-view reading and replying.
  - [x] **Tracking**: Integrated Open/Click tracking stats display in the email list (leveraging existing backend tracking system).
  - [x] **Navigation**: Added "Emails" link to the Sidebar.

### Contact Dossier (People → Contact Detail)
- **Status**: Completed
- **Description**: Added a dedicated contact detail view (dossier) with account-linked energy context.
- **Actions**:
  - [x] **Detail Route**: Added `src/app/crm-platform/contacts/[id]/page.tsx` with bento-style layout and contract maturity bar.
  - [x] **Data Access**: Implemented `useContact(id)` in `src/hooks/useContacts.ts` for single-contact fetch.
  - [x] **Account Context**: Resolved linked account via contact accountId / name match and rendered energy fields when present.
  - [x] **Navigation**: Made People table rows and “View Details” open `/crm-platform/contacts/[id]`.

### Top Bar & Global Search
- **Status**: Completed
- **Description**: Migrated the Top Bar navigation and Global Search features from the legacy dashboard.
- **Actions**:
  - [x] **Top Bar Layout**: Updated `TopBar.tsx` to include Scripts, Refresh, Notifications, and Call actions.
  - [x] **Global Search**: Enhanced `GlobalSearch.tsx` to include "Prospect People" and "Prospect Accounts" quick actions.
  - [x] **Functionality**:
    - Connected Scripts button to `/crm-platform/scripts`.
    - Implemented Data Refresh logic (with toast notification).
    - Added manual Dialer trigger button.
    - Added Notification bell (UI only).
