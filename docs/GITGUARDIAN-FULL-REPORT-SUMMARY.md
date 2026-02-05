# GitGuardian Full Report – Before Fixes (Summary)

This doc maps each GitGuardian finding to **what was exposed** and **status** after the security fixes.

---

## Your code / docs (real leaks)

| Finding | File | What was exposed | Status |
|--------|------|-------------------|--------|
| **Invalid Google API Key** | `docs/GOOGLE-MAPS-API-PROJECT-ERROR.md` | Old Maps API key (`AIzaSyCyd...`) in the doc | **Fixed** – key redacted; doc now says “use value from env.” |
| **Supabase Service Role JWT** | `check_industries.js` | Supabase URL + **service_role** JWT (full DB access) | **Fixed** – script now uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env. **You should rotate** the service role key in Supabase (Dashboard → Project Settings → API). |
| **Invalid Google API Key** | `plan.md` | GitGuardian reported 10 matches | **In history** – current `plan.md` has no key in it; likely an **old version** in git history. Rotate any Google key that was ever in this file; consider resolving in GitGuardian. |
| **Valid SendGrid Key** (Critical) | `# Power Choosers CRM - Local Development.ini` | SendGrid API key | **In history** – file was committed before; now in `.gitignore`. **Rotate** the SendGrid key in SendGrid dashboard. |
| **Valid Google API Key** (Critical) | `# Power Choosers CRM - Local Development.ini` | Google API key | **In history** – same as above. **Rotate** (delete old key in Google Cloud, use new key in env only). |
| **Bearer Token** | `api/upload/signature-image.js` | Imgur Client ID (`546c25a59c58ad7`) | **Fixed** – handler now uses `IMGUR_CLIENT_ID` from env. Optional: create new Imgur app and rotate. |

---

## Vendor / toolchain (false positives)

These paths are **third-party or system** code, not your secrets. GitGuardian flags high-entropy strings inside them.

| Finding | File | Status |
|--------|------|--------|
| **Generic High Entropy Secret** | `usr/share/perl5/vendor_perl/URI/otpauth.pm` | **False positive** – Perl vendor lib. |
| **Generic Password** | `usr/lib/perl5/core_perl/Cwd.pm` | **False positive** – Perl core lib. |
| **Basic Auth String** | `mingw64/lib/tcl8/8.6/http-2.9.8.tm` | **False positive** – MinGW/Tcl vendor lib. |

**Recommendation:** Add `usr/` and `mingw64/` to `.gitignore` so they are not committed or scanned. If they are already in the repo, they will stay in history; future commits can ignore them.

---

## What to do

1. **Rotate** (revoke/regenerate): Supabase service role key, SendGrid key, any Google key that was in the INI file or old `plan.md`. Use new values only in env (and Cloud Run), never in repo.
2. **Resolve in GitGuardian:** Mark the items we fixed (doc, check_industries, signature-image) as “Resolved” after the push. For `plan.md` and the INI file, either resolve as “Secret rotated” or use GitGuardian’s workflow to suppress after rotation.
3. **Optional:** Add `usr/` and `mingw64/` to `.gitignore` to avoid vendor false positives and keep the repo smaller.
