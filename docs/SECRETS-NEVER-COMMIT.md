# Secrets – Never Commit to Git

GitGuardian and other scanners will flag secrets in the repo. **Never commit:**

- `.env`, `.env.local`, `.env.*` (already in `.gitignore`)
- **Google API keys** (Maps, Gemini, etc.) – use env vars only; never paste real keys in docs or code
- **Supabase** `SUPABASE_SERVICE_ROLE_KEY` – server-only; never in repo or client code
- **SendGrid / email API keys**
- **Imgur** `IMGUR_CLIENT_ID` – set in env; used by `api/upload/signature-image.js`
- **INI files** with keys (e.g. `Power Choosers CRM - Local Development.ini`) – `*.ini` is gitignored

**If a secret was ever committed:** rotate the key in the provider (Google, Supabase, SendGrid, etc.), then fix the code to use env vars and redact from docs. History will still contain the old secret until you use something like `git filter-repo` (advanced); rotating the key is the critical step.

**Backend env (root `.env` or Cloud Run):** `SUPABASE_SERVICE_ROLE_KEY`, `FREE_GEMINI_KEY` or `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY` or `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `IMGUR_CLIENT_ID`, etc.

**Frontend build env:** Only `NEXT_PUBLIC_*` vars are exposed to the client; never put service role keys or server-only secrets there.
