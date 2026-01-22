[Email Cleanup] Starting DRY RUN of orphaned scheduled emails...
Promise {<pending>}
account-detail.js:16 [Email Cleanup] Found 40 scheduled emails to check...
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-7gi6fi3qx (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-c36wk4xzo (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-hkb81s8zh (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-mf1zzfwyl (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-oy560ntx7 (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-u10hvow0u (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763479810628-vhf75c7tp (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606524-defy9e8oa (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606524-sbmmfeu5o (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606524-tzmxc2mhk (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-a56zovpsn (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-cqz7ab6kz (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-g4cyx1lib (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-gxyiu44qr (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-lm2z150ef (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-oe8k8lrsn (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-pqf4vvfgm (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Would update: email-1763481606525-tjtnjql5t (error status - moving out of scheduled)
account-detail.js:16 [Email Cleanup] Cleanup complete!
account-detail.js:16   - Updated: 18 emails
account-detail.js:16   - Skipped: 22 valid scheduled emails
account-detail.js:16 [Email Cleanup] Refreshing emails page...
account-detail.js:16 [CacheManager] ✓ Invalidated cache for emails
account-detail.js:16 [BackgroundEmailsLoader] Cleared old email cache
account-detail.js:16 [BackgroundEmailsLoader] Loading from Firestore...
account-detail.js:16 [BackgroundEmailsLoader] Admin loaded, date range: 2025-11-04T15:37:23.239Z to 2025-11-18T23:14:51.575Z
main.js:21 [BackgroundEmailsLoader] Failed to load from Firestore: ReferenceError: _scheduledLoadedOnce is not defined
    at ensureAllScheduledEmailsLoaded (background-emails-loader.js:76:5)
    at Object.loadFromFirestore [as reload] (background-emails-loader.js:193:13)
window.console.error @ main.js:21
loadFromFirestore @ background-emails-loader.js:214
await in loadFromFirestore
reloadEmails @ emails-redesigned.js:2328
window.cleanupOrphanedScheduledEmails @ VM1372:196
await in window.cleanupOrphanedScheduledEmails
(anonymous) @ VM1376:1Understand this error
account-detail.js:16 [EmailsPage] Loading emails from BackgroundEmailsLoader...
account-detail.js:16 [EmailsPage] Got 200 emails from BackgroundEmailsLoader (more available)
account-detail.js:16 [EmailsPage] Processed 200 emails
account-detail.js:16 [EmailsPage] Email types breakdown: {received: 66, sent: 94, scheduled: 40}
account-detail.js:16 [EmailsPage] Filtering emails. Total: 200 Current folder: scheduled
account-detail.js:16 [EmailsPage] Email types: {received: 66, sent: 94, scheduled: 40}
account-detail.js:16 [EmailsPage] Scheduled filter applied. Filtered count: 21
account-detail.js:16 [EmailsPage] Filter check - filtered: 21 needed: 25 hasMore: true loader available: true
account-detail.js:16 [EmailsPage] Not enough results but cannot load more: {filtered: 21, needed: 25, hasMore: true, loaderExists: true, loadMoreExists: true}
account-detail.js:16 [Memory] 56MB / 97MB (limit: 2144MB)