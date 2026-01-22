---
inclusion: always
---

# Avatars & Favicons

## Contacts avatar (letter glyphs)
- Always render a 1–2 letter initials avatar to the left of contact names
- Size: 28px circle in tables; 40px circle in page headers
- Style: background `var(--orange-subtle)`, text `#fff`, `font-weight: 600`, `letter-spacing: .5px`
- Accessibility: decorative only → `aria-hidden="true"`; don't include alt text
- Never replace with emoji or images

## Company favicon
- Always render a favicon to the left of company names
- Size: 28px in tables; 64px in page headers (account detail)
- No background circle or container - display favicon directly
- **logoUrl Priority**: Always use account `logoUrl` field when available (takes absolute priority over all fallbacks)
- Favicon fetch: Use `window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size })` for enhanced favicon system
- **Enhanced Fallback System**: Automatically tries 7 favicon sources in order:
  1. Clearbit Logo API (best for company logos)
  2. Google Favicon Service (most reliable)
  3. GitHub Favicons (high quality)
  4. FaviconKit API (supports custom sizes)
  5. Yandex Favicon Service
  6. DuckDuckGo Icons
  7. Direct favicon.ico from domain
- Implementation: Use `window.__pcFaviconHelper.generateCompanyIconHTML()` for logoUrl priority, or `generateFaviconHTML()` for domain-only

## Consistency & spacing
- Wrap name + icon with `.company-cell__wrap` and `.name-cell__wrap`; keep gap 8–10px; no underline/bold on hover; slightly lighter color only (matches link hover rules)
- Do not inline sizes; use the shared CSS classes so all pages stay in sync

## Performance & quality
- Lazy-load all favicon `<img>` elements
- Prefer higher-res (`sz=64`) and let CSS downscale to avoid blur
- Cache computed domains per row render pass to avoid repeated parsing

## Security & accessibility
- Domains must be sanitized before interpolation
- Favicon images are decorative; set empty `alt=""` and `aria-hidden="true"` on the `<img>` or wrapper icon

## Do not
- Do not use emoji icons anywhere
- Do not add background circles or containers around favicons
- Do not vary icon sizes per page without updating the shared variables/classes