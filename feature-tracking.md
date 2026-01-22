# Feature Tracking Log

## Active Features

### Load Balancer Setup (Nodal Point)
- **Status**: Completed (Pending DNS Propagation)
- **Description**: Global Application Load Balancer created (`nodalpoint-lb-final`) with automatic redirect.
- **Actions**:
  - [x] **Cleanup**: Deleted old/conflicting Load Balancers.
  - [x] **Provisioning**: Created LB with HTTPS frontend and automatic HTTP redirect.
  - [x] **Backend**: Connected to `nodalpoint-backend-srv` (Serverless NEG).
  - [x] **DNS**: User removed Squarespace defaults (including `_domainconnect`) and added Google Cloud LB A records.

### Next.js Deployment Setup
- **Status**: Ready
- **Description**: Configured the repository to deploy the new Next.js app (`crm-platform`) to Cloud Run via Cloud Build.
- **Actions**:
  - [x] Enabled `output: 'standalone'` in `next.config.ts`.
  - [x] Created optimized `crm-platform/Dockerfile` with build arguments for Firebase config.
  - [x] Updated `cloudbuild.yaml` to build the `crm-platform` directory and pass `NEXT_PUBLIC_` build args.
  - [x] Switched deployment port to 3000 (Next.js default).

### Favicon Fallback Replication (Next.js Migration)
- **Status**: Completed
- **Description**: Porting the `logoUrl`-prioritized favicon fallback system to the new `crm-platform` Next.js application.
- **Plan**:
  - [x] Create `CompanyIcon` component in `src/components/ui/CompanyIcon.tsx` with fallback logic.
  - [x] Update `src/hooks/useAccounts.ts` and `useContacts.ts` interfaces to support `logoUrl` and `companyDomain`.
  - [x] Integrate `CompanyIcon` into `src/app/accounts/page.tsx`.
  - [x] Integrate `CompanyIcon` into `src/app/people/page.tsx` using a new `CompanyCell` component.
  - [x] Verify implementation.

### Deployment Prep
- **Status**: Completed
- **Description**: Prepared the Nodal Point design for production deployment on `nodalpoint.io`.
- **Actions**:
  - [x] Swapped `landing-page-test.html` to `index.html` (and backed up legacy index to `index-legacy.html`) to ensure the new design loads at the root.
  - [x] Verified `bill-debugger.html` links.
  - [x] Confirmed `cloudbuild.yaml` configuration for Cloud Run.

### Nodal Dark Next.js Migration
- **Status**: In Progress
- **Description**: Migrating the legacy Vanilla JS CRM to a Next.js 14 App Router application with "Nodal Dark" aesthetic.
- **Plan**:
  - [x] Scaffold Next.js app (`crm-platform`).
  - [x] Configure Tailwind with Nodal colors (Deep Zinc & International Klein Blue).
  - [x] Install Dependencies (Framer Motion, Zustand, TanStack Query, Recharts).
  - [x] Create Root Layout with "Dynamic Island" header and Glass Sidebar.
  - [x] Build Dashboard Page with KPI cards and Activity Graph.
  - [x] Add Global Loading State (`loading.tsx`) for immediate visual feedback.
  - [x] Install Shadcn/ui components (Button, Input, Sheet, Table, DropdownMenu).
  - [x] Implement Auth (Firebase) - Setup complete, context provider ready.
  - [x] Build Data Layer (TanStack Query hooks) - `useContacts` hook connected to real Firebase data.
  - [x] Refactor People Page (formerly Contacts) to use Shadcn Table and TanStack Query.
  - [x] Rename page to "People".
  - [x] Implement Global Search in Top Bar.
  - [x] Enhance People Page (Scrollable Table, Sticky Footer, Real Data).
  - [x] Implement Persistent Caching (IndexedDB) to save Firestore reads (8hr stale time)
  - [x] Create Accounts Page (Real Data, Persistent Storage, Global Search Integration).
  - [ ] **Next Steps**:
    - [x] Fix Firestore permission & indexing issues in useContacts/useAccounts (removed orderBy to prevent missing index errors).
    - [x] Update Firestore rules to support @nodalpoint.io users.
    - [x] Add l.patterson@nodalpoint.io as Admin in Firestore rules.
    - [x] Implement Login Page (/login) in Next.js app.
    - [ ] Complete Shadcn/ui installation (Sheet).
    - [ ] Create Calls Page.
    - [ ] Create Scripts Page.
    - [ ] Create Energy Page.
    - [x] Create Settings Page.

### Index Page Scroll Optimization & Hero Refinement
- **Status**: Completed (Pending Verification)
- **Description**: Optimized index.html performance by moving inline styles to public.css, implementing GPU-accelerated animations, and refining the hero design. Addressed missing styles for key sections.
- **Updates**:
  - **Performance**:
    - Moved hero gradient to public.css and switched from `background-position` to `transform` animation (GPU accelerated) using a dedicated `.hero-bg` layer.
    - Removed massive inline styles from index.html sections and replaced with utility classes.
    - Added `will-change` hints to animated elements.
  - **Design**:
    - Enhanced hero with a subtle grid pattern overlay.
    - Implemented "Rising Energy Particles" animation.
    - Refined background gradient for better contrast.
    - **Added missing styles** for `.partners`, `.resource-grid`, and `.posts-slider` sections, including responsive layout fixes.
    - **Hero Background Refinement**: Replaced hard-edge linear gradient with a seamless **circular faded blue** radial gradient to eliminate "vertical blue line" visual artifacts.

### Why Section Redesign
   - **Status**: Completed
   - **Description**: Updated the "Your Trusted Partner" section with a textured background and sharper card styling.
   - **Updates**:
      - Added dot pattern texture to background.
      - Switched card accent to a solid left border to ensure perfect rounded corners.
      - Refined card transparency and shadows.
  
    ### Content Updates
    - **Status**: Completed
    - **Description**: Updated "Who We Are" and Value Cards in about.html with new brand messaging.

  - **Updates**:
    - Replacing the hero description with new messaging ("The Deregulated Energy Market...").
    - **Hero Headline Update**: Changed "Choose Wisely. Power Your Savings." to "Smart Energy Choices. Real Savings."
    - **Hero CTA Update**: Changed "Get Started" button text to "Fix The Flaw".
  - Updating the "How it works" section to a simpler 3-step process.

### Landing Page Redesign Test
- **Status**: Built (In Testing)
- **Description**: Experimental 5-Act landing page (`landing-page-test.html`) implementing "The Blueprint" design philosophy.
- **Features**:
  - [x] **Act 1 (Hero)**: "The Texas Grid is Designed to Confuse" with link to Bill Debugger.
  - [x] **Act 2 (Reality)**: Volatility chart animation and "Complexity is a Tax" copy.
  - [x] **Act 3 (Philosophy)**: 3-Column Core Values (Signal, Simplicity, Human).
  - [x] **Act 4 (Products)**: Glassmorphism product cards (Revealer, Engine, Minimalism).
  - [x] **Act 5 (Footer)**: Minimalist CTA.
  - [x] **Header (HUD)**: "Glass & Steel" Heads-Up Display with scroll-adaptive blur, Identity/Action hierarchy, and Full Screen Menu Overlay.
  - [x] **Nodal Point Design Audit**: Implemented "Signal Blue" (#002FA7) branding, "Terminal Aesthetic" chart refinements, glassmorphism updates, Bill Debugger drag interactions, and updated header branding to "Nodal Point" with logo.
  - [x] **Tech**: Vanilla JS + Tailwind CDN (adapted from React/Framer Motion request).

### Bill Debugger Page
- **Status**: Built (Ready for Review)
- **Description**: Creating a "Clean Room" diagnostic tool for bill analysis (`bill-debugger.html`) with Gemini AI integration.
- **Features**:
  - [x] Full-screen, distraction-free layout (100vh/100vw).
  - [x] Drag & Drop interface with "breathing" and "glow" animations.
  - [x] "Scanning Console" simulation with technical micro-copy.
  - [x] Minimalist email capture upon success.
  - [x] Tech Stack Adaptation: Using Tailwind CDN and Vanilla JS.
  - [x] **Gemini API Integration**: Implemented `/api/analyze-bill` endpoint in `server.js` (delegating to `api/analyze-bill.js`) to process PDF uploads via Google Generative AI.

### Email Builder Drag & Drop Refinement
- **Status**: Completed (Pending User Verification)
- **Description**: Restricted dragging to the block header only to prevent accidental drags when selecting text in the body.
- **Updates**:
  - Disabled `draggable="true"` by default on blocks.
  - Added event listeners to enable `draggable` only when hovering (or touching) the block header.
  - Reset `draggable` state on `dragend` to ensure text selection works reliably.

### Email Builder Hover Effects
- **Status**: Completed (Pending User Verification)
- **Description**: Refined hover interactions for email builder blocks.
- **Updates**:
  - Removed the border/background change on the main block container (`.pc-eb-block:hover`).
  - Added a modern hover effect to the draggable header (`.pc-eb-block-header:hover`) with a subtle lift, shadow, and lighter background.
  - Added `cursor: grab/grabbing` for better drag affordance.

### Email Builder Mobile Signature Layout
- **Status**: Completed (Pending User Verification)
- **Description**: Adjust signature layout to place contact info and links below the avatar/name block, aligned left.
- **Updates**:
    - Reduced gap between avatar column and sender info.
    - Rendered LinkedIn/Website/Schedule in a single horizontal row.
    - Prevented email address wrapping in signature.
    - Moving Phone/Email/Location and Links to a new row spanning full width to align under the avatar.
    - **Latest**: Reduced vertical gap between Company Name and Phone section (changed padding-top from 12px to 4px).

### Email Builder Scrolling & Drag-Drop Improvements
- **Status**: Completed (Pending User Verification)
- **Description**: Improve sidebar scrolling performance (fix SVG jitter) and implement auto-scrolling when dragging blocks to the top/bottom of the page.
- **Updates**:
  - CSS: Added `will-change: scroll-position`, `overscroll-behavior: contain` to sidebar.
  - CSS: Added `transform: translateZ(0)` and `backface-visibility: hidden` to block buttons and icons to prevent jitter.
  - JS: Added auto-scroll logic to `dragover` event in `email-builder.js` (scrolls `.pc-email-builder-canvas` when dragging near top/bottom).

### Prevent False Opens in Emails Redesigned
- **Status**: Completed (Pending User Verification)
- **Description**: Prevent false "opened" notifications when viewing the sent tab in `emails-redesigned.js`.
- **Updates**:
  - Implemented `stripTracking` logic inside `stripHtml` function in `emails-redesigned.js`.
  - This removes tracking pixels before they are rendered into a temporary DOM element for text extraction, preventing the network request that triggers the "opened" event.

### Email Builder Sender Spacing Tweak
- **Status**: In Progress
- **Description**: Tighten spacing so sender name/title/company sits closer to avatar.
- **Updates**:
    - Reduced left column width and padding to remove excess gap.
    - Restructured signature rows to keep sender info aligned with avatar.
    - Placed contact details and link row under location in a full-width row.
    - Re-reviewed signature table layout to confirm single-row alignment and link placement.

### Email Builder CTA + Footer Cleanup
- **Status**: Completed (Pending User Verification)
- **Description**: Match CTA button color to signature divider orange and remove NaN text below footer.
- **Updates**:
    - CTA button gradient now matches signature divider orange.
    - Removed extra string concatenation that produced NaN under footer.

### Email Font & Tracking Fixes
- **Status**: Completed (Pending User Verification)
- **Description**: Fix false "read" statuses for emails in Activity Manager and ensure consistent email styling.
- **Updates**:
    - **Tracking Fix**:
        - Implemented cache versioning (`1.3`) in `activity-manager.js` to force-clear old cached emails containing tracking pixels.
        - Validated `stripTracking` application in `getEmailActivities` and `processEmailBatch` to ensure `activity.data.html` is stripped.
        - Verified `renderActivityList` uses `escapeHtml` preventing pixel rendering in descriptions.
        - Confirmed `stripHtml` uses `DOMParser` to safely extract text without firing pixels.
    - **Font Alignment**:
        - Updated `email-builder.js` base font to 14px (from 15/16px) for headers and text blocks to match `settings.js`.
        - Aligned signature font sizes with `settings.js` (Name: 16px, Title: 13px, Company: 12px, Table: 12px).
    - **Validation**:
        - Regex unit tests passed for tracking pixel removal.
        - Code path analysis confirmed no unstripped HTML is rendered in Activity Manager list view.
    - **Bug Fix**: Resolved `SyntaxError` in `contact-detail.js`.

### KPI Widget
- **Status**: Completed
- **Description**: Added 'Weekly Call KPI' widget to dashboard.
- **Notes**: Fetches data from /api/calls.

## Completed Features
- **Apollo Widget**: UI preference updated to use '.lusha-placeholder'.
