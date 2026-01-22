## Email Rendering Notes (latest fixes)

### Quick map: where to look
- `api/send-scheduled-emails.js`
  - Signature builder (custom + standard) with `data-signature="true"` and gradient divider.
  - `sentPayload` includes `isHtmlEmail`, `type/status = sent`, tracking fields.
- `scripts/pages/email-detail.js`
  - `renderOurHtmlEmail` dark-mode wrapper and contentEditable `<div>` → `<p>` handling.
  - Signature detection (data-signature or orange divider) and HTML-preserve path.
  - Greeting break insert; text fallbacks with `white-space: pre-line`.
- `styles/main.css`
  - `.sent-email-preview` forces white text; signature text override to white; links orange.
- `scripts/email-compose-global.js`
  - Signature attach/dedupe on send; `isHtmlEmail` detection (attribute or structure); uses `window.getEmailSignature`.
  - Fallback signature builder if settings missing custom HTML.

### Current fixes (Dec 5)
- Signatures always tagged `data-signature="true"` (send pipeline) so email-detail preserves HTML.
- Dark UI: sent-tab text forced to white; signature text forced to white; links stay orange (`styles/main.css`, `renderOurHtmlEmail` wrapper).
- Manual/contentEditable emails: detect `<div>...` blocks and convert to paragraphs to preserve line breaks without breaking AI HTML.
- Gradient divider restored (no solid border) for sequence signatures to match compose-global design.

### Line-break handling
- Manual emails (typed): email-detail detects contentEditable `<div>` structure; converts to `<p>` with spacing; keeps signature intact.
- AI/HTML emails: go through `renderOurHtmlEmail(rawHtml)`; we only add `<br>` for literal newlines when NOT contentEditable; greetings get `Hi/Hello/Hey/Dear ... ,` → `<br><br>`.
- Fallback text paths keep `white-space: pre-line` and escape text; paragraph synthesis is avoided for HTML emails to not break structure.

### Signature handling
- `api/send-scheduled-emails.js`: signatures have `data-signature="true"`; gradient divider (no solid border); avatar/fields from settings/general; `isHtmlEmail` set to ensure HTML rendering.
- `scripts/email-detail.js`: detects signature via data attribute or orange line; preserves signature HTML; dark-mode overrides force white text inside signatures; links stay orange.
- `scripts/email-compose-global.js`: builds/attaches signature from settings (or custom HTML) on send; detection sets `isHtmlEmail` based on attribute or structure; removes duplicate signatures before appending.

### Color handling
- Sent tab: `.sent-email-preview` and descendants force `color: var(--text-primary, #fff) !important`; signature colors overridden to white in the CRM view; links remain orange.
- Dark-mode wrapper in `renderOurHtmlEmail` enforces white text for body + signature, overrides common dark inline colors, keeps orange highlights.

### Still to watch
- Ensure settings cache (localStorage) has `hostedPhotoURL` so scheduled previews don’t show placeholder avatar; saving settings refreshes cache.
- If a new regression appears, capture a failing email doc (`html`, `text`, `isHtmlEmail`, signature presence) to adjust rendering without guessing.

