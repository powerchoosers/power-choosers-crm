# Nodal Point Browser Extension Worklog

Last updated: 2026-03-27

This file is a plain-English record of the Nodal Point browser extension work done so far.
It is meant to help Lewis and future work sessions understand what exists, what changed, and
what still needs attention.

## Goal

Build a Chromium extension for Nodal Point that:

- matches CRM accounts and contacts from the current page
- saves page notes into the CRM transmission log
- shows the current company context in a minimal dossier view
- makes and receives calls through Twilio
- keeps the call engine alive in the background
- feels like Nodal Point, not a generic SaaS widget

## What Was Built

### Extension scaffold

Created a standalone Chromium extension package under `extension/` so the browser code stays
separate from the Next.js CRM app.

Main pieces:

- `extension/src/background.ts` for routing, state, badge rendering, notifications, and Twilio control
- `extension/src/offscreen.ts` for keeping the Twilio Voice client alive
- `extension/src/sidepanel/index.tsx` for the side-panel UI
- `extension/src/shared.ts` for shared state and helper functions
- `extension/manifest.json` for extension permissions and the toolbar icon
- `extension/build.mjs` for building the extension bundle and copying assets

### CRM bridge routes

Added API routes in the CRM app so the extension can use the logged-in session and CRM data:

- `src/pages/api/extension/bootstrap.js`
- `src/pages/api/extension/match.js`
- `src/pages/api/extension/refresh.js`
- `src/pages/api/extension/account-contacts.js`
- `src/pages/api/extension/org-contacts.js`

These routes let the extension:

- read the logged-in user session
- load the selected Twilio line from the user settings
- match the active page to CRM data
- load account contacts for the matched company
- refresh auth when the token expires
- merge cached Apollo search data with CRM contacts for the extension network view

### Twilio call flow

The call flow was wired to use the existing Twilio backend instead of inventing a second phone system.

What it does now:

- bootstraps Twilio automatically when the CRM session is available
- supports outbound dialing
- supports inbound ringing and answering
- keeps the live call state in the background
- shows a small live-call strip only when a call is actually active

Important note:

- the extension uses the phone number from settings as the **caller ID**
- that number is not the destination number you are calling
- the destination number must still come from the page record or be typed in manually

### Page capture and matching

The extension now captures the current page and tries to match it to the CRM using:

- URL / domain
- page title
- visible page hints
- detected phone numbers
- matched account contacts

Recent matching changes made this stricter:

- domain match now takes priority over fuzzy company-name guesses
- exact company-name matches are preferred over weak partial matches
- weak guesses are no longer allowed to override a better domain result
- `google.com` is blocked from ingest
- `nodalpoint.io` is blocked from capture/ingest so the extension does not overwrite its own CRM context when Lewis switches between windows

It also:

- keeps the company context updated when you switch tabs
- does that without ending an active call
- shows a small page-edge badge when an account is matched
- lets the page-edge badge stay rounded and draggable from the 6-dot handle
- opens the side panel first when ingest starts, then shows a Nodal loading state before content appears

### Minimal dossier UI

The side panel was simplified heavily so it feels closer to the CRM dossier pages and not like a
busy command widget.

Changes made:

- removed the large always-visible call deck from idle state
- removed cluttering chips and repeated status labels
- made the dossier section the main focus
- kept only the actions that matter for the current state
- added a compact contacts list for matched accounts
- added a manual dial input only when the page does not expose a phone number

The extension also got a minimal organization network view:

- a `CRM | Apollo` toggle in the network section
- a search box that filters the visible people
- a read-only first version that uses cached `apollo_searches` data
- Apollo-only contacts are labeled separately from CRM-linked contacts
- contact cards use the same CRM-style avatar/identity pattern instead of a separate extension-only visual language

### Icon and toolbar behavior

Updated the extension manifest so the Nodal Point web icon shows as the extension icon in the browser
toolbar.

Also added the small right-edge badge on matched pages so the extension can be reopened from the page
without hunting for the toolbar button.

## Important Data Check

I checked the admin user’s Supabase row for Lewis Patterson.

Found:

- `email`: `l.patterson@nodalpoint.io`
- `first_name`: `Lewis`
- `last_name`: `Patterson`
- `settings.selectedPhoneNumber`: `+1 (817)-809-3367`
- `settings.twilioNumbers[0].number`: `+1 (817)-809-3367`

Meaning:

- the line is present in the database
- the problem was not missing settings data
- the problem was the extension using the number in an unsafe format and the UI being too strict

## Fixes Applied Along the Way

### Caller ID normalization

The selected line in settings was normalized into Twilio-safe format before being used.

That matters because Twilio expects a real phone number format, not a formatted display string with
spaces and punctuation.

### Button logic

The Call button no longer depends only on a matched page phone number.

If the page does not have a number:

- the UI can show a manual dial field
- the Call button is still available when there is a valid caller ID

### Session stability

The extension no longer clears auth just because the current page does not look like the CRM.

That fixed the confusing behavior where one page looked connected and another looked disconnected.

### Offscreen message handling

The offscreen Twilio worker now ignores non-Twilio messages instead of throwing on them.

That fixed the `Unknown offscreen message type: CAPTURE_AND_MATCH` problem.

### Caller ID loading state

The side panel now distinguishes between "profile still loading" and "no number in settings." This fixed the false "Caller ID not selected" alarm that appeared for a few seconds when the extension first opened.

### Twilio initialization watchdog

Added a 15-second recovery watchdog. If the Twilio device stays in an "initializing" state for too long (due to a failed token fetch or blocked mic), the extension automatically retries once. If that fails, a "Retry calls" button appears in the UI with a suggestion to check microphone permissions.

### Microphone permission & Manifest improvements

Added `"microphone"` to the manifest permissions and expanded `host_permissions` to `"<all_urls>"`. This ensures the extension can actually access the mic for calls and can match accounts on any website you visit.

### Toolbar icon rendering

Generated dedicated 16/32/48/128px icons during the build process. This fixed the "broken" or generic icon in the Chrome toolbar that happened when using a single oversized 1024px image.

### Contextual mic requests

Removed the upfront microphone permission request during initialization. The extension now lets Twilio request the microphone naturally when a call is placed, which prevents users from dismissing a surprise prompt with no context. Encourages the "CFO Test" of only showing what is necessary when it's necessary.

### Badge UI and Side Panel Opening

Removed an incorrect CSS filter that was making the badge icon look like a solid white square. Also upgraded the "open side panel" logic to use the `sender.tab.id` when triggered from a website badge, which ensures Chrome honors the user-gesture requirement correctly.

### Offscreen Diagnostic Logging

Added detailed `[Twilio Offscreen]` console logging to the offscreen document. This allows us to see exactly where the Twilio SDK is hanging (Token, Registration, or Signaling) by inspecting the offscreen document's console in `chrome://extensions`.

### Extension network contact lookup

Added a new extension route:

- `src/pages/api/extension/org-contacts.js`

It reads the saved Apollo cache, resolves CRM-linked people, and returns two buckets:

- contacts already in CRM
- Apollo-only contacts that have not been mapped into CRM yet

The side panel uses this first-pass route so Lewis can search contacts without leaving the extension.

## Current Behavior

What should happen now:

- open Nodal Point once in the same browser profile
- the extension should sync the session
- the side panel should match the current page to an account or contact
- matched pages should show the right dossier data
- tab switching should update the company context
- active calls should stay alive while you move between tabs
- the selected Twilio line from settings should be used as caller ID

## Files Changed Most Often

- `extension/src/background.ts`
- `extension/src/offscreen.ts`
- `extension/src/sidepanel/index.tsx`
- `extension/src/shared.ts`
- `extension/manifest.json`
- `extension/build.mjs`
- `src/pages/api/extension/bootstrap.js`
- `src/pages/api/extension/match.js`
- `src/pages/api/extension/refresh.js`
- `src/pages/api/extension/account-contacts.js`

## Verification

Recent checks that passed:

- `npx tsc -p extension/tsconfig.json --noEmit`
- `npm run build:extension`
- `node --check src/pages/api/extension/bootstrap.js`
- `node --check src/pages/api/extension/account-contacts.js`
- `node --check src/pages/api/extension/org-contacts.js`

## What Still Matters

There are still a few design and flow choices worth watching:

- keep the extension minimal
- do not add buttons the user does not need
- do not show call controls unless a call is active or a number is actually available
- keep the CRM dashboard and the extension from drifting into two different design languages

## Plain-English Summary

The extension now does the core job:

- match the page to a CRM record
- show the correct company/contact context
- keep calls alive in the background
- use the admin’s selected Twilio line from settings
- stay much closer to the Nodal Point dossier style
- let Lewis search CRM and Apollo cached contacts directly in the side panel
- keep the extension from hijacking the CRM context when switching to Nodal Point tabs

The next work should focus on polishing the UI and tightening the call flow, not rebuilding the core plumbing.
