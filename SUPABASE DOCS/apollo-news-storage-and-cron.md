# Apollo News Storage and 7-Day Refresh

Apollo news articles are stored in Supabase with pgvector so AI (e.g. Gemini chat, search) has full access. A 7-day cache avoids repeated Apollo API calls; a daily cron refreshes any domain that hasn’t been updated in 7 days.

## Tables (see migrations)

- **`apollo_news_refresh`**  
  One row per domain we’ve ever fetched news for.  
  - `key` (text, PK): normalized domain (e.g. `apollo.io`)  
  - `last_refreshed_at` (timestamptz): last time we pulled news for this domain  

- **`apollo_news_articles`**  
  One row per article, with embedding for vector search.  
  - `id` (uuid), `domain`, `apollo_article_id`, `title`, `url`, `source_domain`, `snippet`, `published_at`, `event_categories`, `embedding` (vector(768)), `created_at`, `updated_at`  
  - Unique on `(domain, apollo_article_id)`  

Existing **`apollo_searches`** (company + contacts cache) is unchanged; it is separate from news.

## Behavior

1. **GET /api/apollo/news?domain=…**  
   - If `apollo_news_refresh` has that domain and `last_refreshed_at` is within the last 7 days → return articles from `apollo_news_articles` (no Apollo call).  
   - Otherwise → fetch from Apollo, upsert into `apollo_news_articles`, update `apollo_news_refresh`, then return.

2. **Embeddings**  
   New/updated rows in `apollo_news_articles` are queued for the existing `embed` Edge Function (trigger + `util.queue_embeddings`). Content for embedding is built by `apollo_news_embedding_input()` (title, snippet, source, domain, categories).

3. **Cron (daily refresh)**  
   - **Supabase:** `pg_cron` runs daily at 2:00 AM UTC and calls `util.refresh_apollo_news_via_backend()`.  
   - That function uses `pg_net` to POST to your backend at  
     `{apollo_news_cron_url}/api/cron/refresh-apollo-news`  
     with header `Authorization: Bearer {apollo_news_cron_secret}`.  
   - **Backend:** `POST /api/cron/refresh-apollo-news` (or GET) checks the Bearer token against `APOLLO_NEWS_CRON_SECRET` or `CRON_SECRET`, then selects from `apollo_news_refresh` where `last_refreshed_at` is null or older than 7 days, and for each such domain fetches from Apollo and upserts into `apollo_news_articles` and `apollo_news_refresh`.

## Setup (cron)

1. **Backend env**  
   Set one of:
   - `APOLLO_NEWS_CRON_SECRET` (preferred), or  
   - `CRON_SECRET`  
   to a long random string. The cron request must send this as `Authorization: Bearer <secret>`.

2. **Supabase Vault (Dashboard → Project Settings → Vault)**  
   - `apollo_news_cron_url`: full backend URL (e.g. `https://your-cloud-run.run.app`). No trailing slash.  
   - `apollo_news_cron_secret`: same value as `APOLLO_NEWS_CRON_SECRET` / `CRON_SECRET`.  

If `apollo_news_cron_url` is not set, the cron job no-ops (no request is sent).

## Manual refresh

You can trigger a refresh without waiting for cron:

```bash
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-backend.run.app/api/cron/refresh-apollo-news
```

Response: `{ "refreshed": ["domain1.com", "domain2.com", ...] }`.
