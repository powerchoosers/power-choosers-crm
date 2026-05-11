# Unsubscribe Feature Documentation

## Overview

The Unsubscribe feature allows prospects in Nodal Point sequences to manage their communication preferences with three options:

1. **Permanent removal** — Complete unsubscribe from all future outreach
2. **Pause for 90 days** — Temporary pause; sequences resume after 90 days
3. **Energy alerts only** — Receive only high-value, market-relevant signals (recovery play for prospects who are "not now" but may be "later")

All sequence emails include an unsubscribe footer link at the bottom, CAN-SPAM compliant and branded with Nodal Point's dark forensic theme.

---

## File Locations

### Frontend

**Unsubscribe Page** — `src/app/unsubscribe/page.tsx`
- Dark Nodal Point theme (zinc-950 background, Klein blue accents)
- Three radio-button preference options
- Confirmation state after submission
- LinkedIn recovery CTA for non-permanent choices
- Uses actual Nodal Point web icon (`/public/images/nodalpoint-webicon.png`)

### Backend APIs

**Unsubscribe Handler** — `src/pages/api/email/unsubscribe.js`
- Accepts POST with `{ email, type }`
- `type` can be: `'permanent'` | `'pause_90'` | `'spike_only'`
- Writes to `suppressions` table (permanent/pause_only only)
- Updates contact `metadata` with preference (pause date, spike flag, etc.)
- Pauses `sequence_members.skipEmailSteps` to prevent sends during pause period
- Logs all actions for audit trail

### Email Sending

**Sequence Email Sender** — `src/pages/api/email/zoho-send-sequence.js`
- Injects unsubscribe footer HTML before tracking injection (lines 143-160)
- Footer format: plain text + clickable unsubscribe link
- Link URL: `/unsubscribe?email=CONTACT_EMAIL`
- Footer location: "Nodal Point · Energy Intelligence · Fort Worth, TX" with unsubscribe CTA
- Skips footer injection for self-sends and internal testing

### Sequence Processing

**Edge Function** — `src/edge-functions/process-sequence-step.ts` (Version 43+)
- **Suppression pre-check** before `handleSend()` (lines 282-300)
- Queries `suppressions` table using lowercased email as key
- If found, marks execution as `skipped` with reason
- Prevents wasted API calls to Zoho Mail
- Does NOT skip `spike_only` contacts (they stay reachable for energy alerts)

---

## Database

### Suppressions Table

```sql
CREATE TABLE suppressions (
  id TEXT PRIMARY KEY,           -- email address (lowercase)
  reason TEXT,                   -- 'unsubscribed' | 'paused_90_days' | 'spike_only'
  details TEXT,                  -- human-readable reason
  source TEXT,                   -- 'web_form' | other sources
  suppressedAt TIMESTAMP,        -- when preference was set
  createdAt TIMESTAMP            -- row creation time
)
```

### Contact Metadata

Preference info stored in `contacts.metadata`:

```json
{
  "emailStatus": "unsubscribed|paused|spike_only",
  "emailSuppressed": true|false,
  "emailPausedUntil": "ISO timestamp (if paused)",
  "emailPreference": "spike_only (if spike-only)",
  "suppressionReason": "user unsubscribed via web form",
  "suppressedAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### Sequence Members

`sequence_members.skipEmailSteps = true` is set for all preference types to prevent sends during pause or after unsubscribe.

---

## Rate Limiting (Zoho Mail Protection)

### Database Function

**`util.process_sequence_steps()`** — `src/edge-functions/` migration
- Default parameters: `batch_size = 8`, `max_requests = 1`
- Limits to **8 emails per 5-minute cron tick** ≈ **96/hour max**
- Safely within Zoho Mail's dynamic 50–500/hour external limit
- Prevents burst-sending that could trigger spam filters or rate limits

### Cron Jobs

- **`process-sequence-steps-business-hours`** — Every 5 min, 13–22 UTC Mon–Fri
- **`process-sequence-steps-end-of-day`** — Every 5 min, 0–4 UTC (overnight)

Both call `util.process_sequence_steps()` with defaults, so 8/tick applies to all scheduled emails.

---

## User Flow

### Prospect Receives Email

1. Zoho Mail sends sequence email from Lewis Patterson or designated sender
2. Email footer appended: "Nodal Point · Energy Intelligence · Fort Worth, TX" + unsubscribe link
3. Footer click is tracked (click tracking wraps all links including unsubscribe)

### Prospect Clicks Unsubscribe

1. Browser navigates to `https://nodal-point-network.vercel.app/unsubscribe?email=CONTACT_EMAIL`
2. Page loads with three preference options
3. Prospect selects one and clicks "Confirm"
4. POST to `/api/email/unsubscribe` with `{ email, type }`

### Backend Processes Preference

1. **Permanent**: Added to `suppressions` (reason: `unsubscribed`), contact metadata updated, sequences paused
2. **Pause 90 days**: Added to `suppressions` (reason: `paused_90_days`) with expiry date in details, contact gets `emailPausedUntil` date, sequences paused
3. **Spike only**: NOT added to suppressions (stays reachable), contact metadata flagged with `emailPreference: 'spike_only'`, sequences paused (but can be re-engaged via spike-only emails)

### Next Sequence Send

1. Edge function fetches execution to send
2. **Pre-check**: queries `suppressions` table for contact's email
3. If found: marks execution `skipped`, logs reason, returns (no email sent)
4. If not found: proceeds with normal send flow

---

## Testing Checklist

- [ ] Unsubscribe page loads with Nodal Point icon (dark theme, Klein blue accents)
- [ ] All three preference options display correctly with radio buttons
- [ ] Selecting each option updates the radio state visually
- [ ] Submitting shows "Processing..." then confirmation screen
- [ ] Confirmation screen shows different messages for permanent vs. pause vs. spike-only
- [ ] LinkedIn CTA appears on confirmation (except for permanent removal)
- [ ] Email footer includes working unsubscribe link
- [ ] Clicking unsubscribe link navigates to page with correct email pre-filled
- [ ] Edge function skips send if contact in `suppressions` table
- [ ] Contact metadata reflects chosen preference
- [ ] Sequence members have `skipEmailSteps = true` after preference set
- [ ] Rate limiting holds at 8 emails per 5-minute tick

---

## Environment Variables

No new env vars required. The unsubscribe feature uses:
- `PUBLIC_BASE_URL` or `NEXT_PUBLIC_BASE_URL` for email footer link (defaults to `https://nodal-point-network.vercel.app`)
- `SUPABASE_SERVICE_ROLE_KEY` for unsubscribe API (writes to suppressions + contacts)

---

## Future Enhancements

- **Auto-resume after 90 days**: Cron job to remove `paused_90_days` suppressions after expiry date
- **Spike-only re-engagement**: Dedicated email template that bypasses `skipEmailSteps` for energy-alert-triggered sends
- **Preference management dashboard**: Allow prospects to change preferences later via web login
- **SMS/Phone alerts**: Extend preferences to other channels (SMS, calls) if supported
- **Recipient feedback**: Track why prospects chose each option for insights into messaging

---

## Related Files

| File | Purpose |
|------|---------|
| `src/app/unsubscribe/page.tsx` | Frontend unsubscribe page |
| `src/pages/api/email/unsubscribe.js` | Backend preference handler |
| `src/pages/api/email/zoho-send-sequence.js` | Injects unsubscribe footer into emails |
| `src/edge-functions/process-sequence-step.ts` | Suppression pre-check before send |
| `/public/images/nodalpoint-webicon.png` | Nodal Point web icon (40×40) |

---

**Last Updated**: 2026-03-13
**Version**: 1.0
**Status**: Production-ready (all four components deployed)
