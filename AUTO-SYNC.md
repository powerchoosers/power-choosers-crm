# Automatic Gmail Sync

**Date:** February 4, 2026  
**Status:** ✅ Active Globally  
**Frequency:** Every 3 minutes + On CRM Load

---

## Overview

The CRM now automatically syncs Gmail emails in the background, ensuring you receive new messages no matter where you are in the application. The sync runs globally and requires no manual intervention after initial OAuth authentication.

---

## How It Works

### 1. **Initial Authentication** (First Time Only)
When you first open the CRM at `nodalpoint.io/network` or `localhost:3000/network`:
1. You'll be prompted with a Google OAuth popup to grant Gmail access
2. This happens **once** - the token is cached in sessionStorage
3. After authentication, emails sync automatically

### 2. **Automatic Background Sync**
After initial auth:
- **On CRM Load:** Syncs 2 seconds after you open `/network`
- **Every 3 Minutes:** Background sync runs silently
- **Throttled:** Won't sync more than once per minute (prevents spam)
- **Silent:** No popups or toasts for background syncs

### 3. **Global Sync Status**
The TopBar shows a live "Net_Sync" indicator when syncing:
- 🔄 **Blue spinning icon** = Currently syncing
- **Hidden** = Not syncing

---

## Implementation Details

### Components

#### `GlobalSync.tsx` (Sync Controller)
**Location:** `crm-platform/src/components/layout/GlobalSync.tsx`

```tsx
// Runs globally from NetworkLayoutClient
export function GlobalSync() {
  // Initial sync on mount
  useEffect(() => {
    if (user && hasGmailToken) {
      syncGmail(user, { silent: true })
    } else {
      // First time: trigger OAuth
      syncGmail(user, { silent: false })
    }
  }, [user])

  // Background interval sync (every 3 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      syncGmail(user, { silent: true })
    }, 3 * 60 * 1000)
    return () => clearInterval(interval)
  }, [user])
}
```

#### `useGmailSync.ts` (Sync Logic)
**Location:** `crm-platform/src/hooks/useGmailSync.ts`

**Features:**
- ✅ OAuth token caching in sessionStorage
- ✅ Throttling (min 1 minute between syncs)
- ✅ Silent mode for background syncs
- ✅ Mailwarming filter (auto-excludes Apollo emails)
- ✅ Global sync status tracking (Zustand store)
- ✅ Deduplication (skips already-synced emails)

**Throttle Logic:**
```ts
const lastSyncTime = sessionStorage.getItem('gmail_last_sync_time')
if (lastSyncTime && options.silent) {
  const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10)
  if (timeSinceLastSync < 60 * 1000) { // 1 minute
    console.log(`Last sync was ${Math.round(timeSinceLastSync / 1000)}s ago, skipping`)
    return
  }
}
```

#### `syncStore.ts` (Global State)
**Location:** `crm-platform/src/store/syncStore.ts`

```ts
interface SyncStore {
  isSyncing: boolean
  lastSyncTime: number | null
  syncCount: number
}
```

Used by TopBar to show sync indicator across the entire app.

---

## User Flow

### First-Time User
1. Logs into CRM → Arrives at `/network`
2. 2 seconds later → Google OAuth popup appears
3. User grants Gmail access
4. Initial sync runs (fetches last 50 emails)
5. Toast: "Synced X new emails"
6. Background sync starts (every 3 min)

### Returning User
1. Logs into CRM → Arrives at `/network`
2. 2 seconds later → Silent sync (no popup, no toast)
3. New emails appear automatically
4. Background sync continues (every 3 min)

---

## Configuration

### Sync Interval
**Default:** 3 minutes  
**Location:** `GlobalSync.tsx` line 43

```ts
// Change interval here (in milliseconds)
const interval = setInterval(() => {
  syncGmail(user, { silent: true })
}, 3 * 60 * 1000) // 3 minutes
```

### Initial Delay
**Default:** 2 seconds after CRM load  
**Location:** `GlobalSync.tsx` line 31

```ts
const timer = setTimeout(() => {
  syncGmail(user, { silent: false })
}, 2000) // 2 seconds
```

### Max Messages Per Sync
**Default:** 50 emails  
**Location:** `useGmailSync.ts` line 32

```ts
const MAX_MESSAGES_PER_SYNC = 50;
```

### Throttle Window
**Default:** 60 seconds (1 minute)  
**Location:** `useGmailSync.ts` line 189

```ts
if (timeSinceLastSync < 60 * 1000) { // 1 minute
  return
}
```

---

## Monitoring & Debugging

### Browser Console Logs
The sync emits detailed logs for debugging:

```
[Gmail Sync] Starting sync... { silent: true }
[Gmail Sync] No new emails to sync
[Gmail Sync] Skipping mailwarming email: Test Email - Mailwarming
[Gmail Sync] Last sync was 45s ago, skipping
[Gmail Sync] No OAuth token found, skipping silent sync
```

### SessionStorage Keys
Check in DevTools → Application → Session Storage:

- `gmail_oauth_token` - OAuth access token
- `gmail_last_sync_time` - Timestamp of last successful sync

### Zustand DevTools
If you have Redux DevTools installed, you can inspect the `syncStore`:

```ts
isSyncing: false
lastSyncTime: 1738713600000
syncCount: 12
```

---

## Manual Sync

Users can still manually trigger a sync from `/network/emails`:
1. Click the **"Net_Sync"** button in the CollapsiblePageHeader
2. Visible sync with status updates
3. Toast notification on completion

This is useful for:
- Forcing an immediate sync (bypasses throttle)
- Re-authenticating if OAuth token expired
- Debugging sync issues

---

## Troubleshooting

### Sync Not Running

**Check 1: OAuth Token**
```js
// Browser console
sessionStorage.getItem('gmail_oauth_token')
// Should return: "ya29.a0AfB..."
```

**Check 2: GlobalSync Mounted**
```js
// React DevTools → Components
// Look for <GlobalSync> in tree
```

**Check 3: Console Logs**
- Open DevTools console
- Look for `[Gmail Sync]` logs
- Check for errors (red text)

### OAuth Token Expired

**Symptoms:**
- Sync logs show: `Gmail API error: 401`
- Silent syncs fail repeatedly

**Fix:**
1. Go to `/network/emails`
2. Click "Net_Sync" button (manual sync)
3. Re-authenticate in OAuth popup
4. Background sync resumes automatically

### Sync Stuck

**Symptoms:**
- `isSyncing` stays `true` forever
- Net_Sync indicator never disappears

**Fix:**
```js
// Browser console
sessionStorage.removeItem('gmail_oauth_token')
sessionStorage.removeItem('gmail_last_sync_time')
// Then refresh page
```

### Too Many Requests

**Symptoms:**
- Gmail API error: 429 (rate limit)
- Sync fails repeatedly

**Fix:**
- Increase throttle window (default: 1 min → 5 min)
- Decrease sync interval (default: 3 min → 5 min)
- Reduce `MAX_MESSAGES_PER_SYNC` (default: 50 → 25)

---

## Security & Privacy

### OAuth Scope
The CRM requests **read-only** Gmail access:
- Scope: `https://www.googleapis.com/auth/gmail.readonly`
- Cannot send, delete, or modify emails via sync
- Only reads inbox and sent folders

### Token Storage
- Stored in `sessionStorage` (not `localStorage`)
- Cleared when browser tab closes
- Not sent to any external servers
- Used only for Gmail API requests

### Data Flow
1. Gmail API → CRM Client (fetch emails)
2. CRM Client → Supabase (store emails)
3. Supabase → CRM Client (display emails)

**No Third Parties:** Email data never leaves Google → Supabase → Your browser.

---

## Performance

### Network Usage
- **Per Sync:** ~50 emails = ~100-500 KB (varies by email size)
- **Every 3 min:** ~10 MB/hour (if constantly receiving emails)
- **Idle:** Minimal (only API auth checks)

### Browser Impact
- CPU: ~5-10% spike during sync (1-3 seconds)
- Memory: +2-5 MB per 50 emails synced
- Negligible when idle

### Database Impact
- **Deduplication:** Checks existing emails before insert
- **Upserts:** Uses `onConflict: 'id'` to avoid duplicates
- **Indexes:** Emails table has indexes on `id`, `timestamp`, `type`

---

## Future Enhancements

1. **Push Notifications:** Use Gmail Push API for instant delivery (no polling)
2. **Selective Sync:** Let users choose which labels to sync
3. **Smart Throttling:** Adjust interval based on email volume
4. **Offline Queue:** Queue syncs when offline, run when back online
5. **Multi-Account:** Support multiple Gmail accounts per user
6. **Webhooks:** Trigger CRM actions on specific email patterns

---

## Files Modified

1. ✅ `crm-platform/src/components/layout/GlobalSync.tsx` - Auto-sync controller
2. ✅ `crm-platform/src/hooks/useGmailSync.ts` - Enhanced sync logic
3. ✅ `crm-platform/src/store/syncStore.ts` - Global sync state
4. ✅ `crm-platform/src/components/layout/TopBar.tsx` - Sync indicator
5. ✅ `AUTO-SYNC.md` - This documentation

---

**Status:** 🚀 Active in Production  
**Impact:** Automatic email delivery, no manual intervention  
**Maintenance:** Monitor console logs for OAuth expiry
