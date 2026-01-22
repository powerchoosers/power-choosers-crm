I will port the full insights dropdown functionality from `contact-detail.js` to `task-detail.js` to ensure consistent behavior across the application.

### Plan
1.  **Port Helper Functions**:
    *   Copy UI helpers: `animateExpand`, `animateCollapse`.
    *   Copy rendering helpers: `insightsInlineHtml`, `renderTranscriptHtml`, `toMMSS`, `parseSpeakerTranscript`.
    *   Copy avatar helpers (renaming to `taskRc_` for safety): `taskRc_getAgentAvatar`, `taskRc_getContactAvatar`, `taskRc_normalizeSupplierTokens`.

2.  **Implement Toggle Logic**:
    *   Replace the current `toggleTaskRcDetails` stub with the full expansion logic.
    *   It will create/remove the `.rc-details` panel, animate it, and track open states in `state._rcOpenIds`.

3.  **Update List Rendering**:
    *   Modify `taskRcUpdateListAnimated` to restore open panels after re-rendering (so expanded items stay open when the list updates).

4.  **Fix Audio Player in Task View**:
    *   Ensure the ported audio player code includes the fix for local playback (`Range` header support) and `preload="metadata"`.

### Verification
*   You will be able to click the eye icon on the Task Detail page.
*   It will expand an inline panel showing the AI summary, transcript, and audio player.
*   The audio player will work correctly (showing duration and allowing seek).
