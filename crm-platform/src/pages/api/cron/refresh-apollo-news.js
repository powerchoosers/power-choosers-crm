/**
 * Cron: refresh Apollo news for domains that haven't been refreshed in 7 days.
 * Called by Supabase pg_cron daily (via pg_net to this URL).
 * Requires Authorization: Bearer <APOLLO_NEWS_CRON_SECRET or CRON_SECRET>.
 */

import { supabaseAdmin } from '../_supabase.js';
import { fetchWithRetry, getApiKey, APOLLO_BASE_URL, normalizeDomain } from '../apollo/_utils.js';

const REFRESH_WINDOW_DAYS = 7;

function getCronSecret() {
  return process.env.APOLLO_NEWS_CRON_SECRET || process.env.CRON_SECRET || '';
}

async function fetchApolloNewsForDomain(domain) {
  const APOLLO_API_KEY = getApiKey();
  const normalizedDomain = normalizeDomain(domain);

  const enrichUrl = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(normalizedDomain)}`;
  const enrichResp = await fetchWithRetry(enrichUrl, {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY
    }
  });

  if (!enrichResp.ok) return null;
  const enrichData = await enrichResp.json();
  const orgId = enrichData.organization?.id || null;
  if (!orgId) return null;

  const searchParams = new URLSearchParams();
  searchParams.append('organization_ids[]', orgId);
  searchParams.set('per_page', '10');
  searchParams.set('page', '1');
  const newsUrl = `${APOLLO_BASE_URL}/news_articles/search?${searchParams.toString()}`;
  const newsResp = await fetchWithRetry(newsUrl, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY
    }
  });

  if (!newsResp.ok) return null;
  const newsData = await newsResp.json();
  return (newsData.news_articles || []).slice(0, 10);
}

async function upsertNewsToSupabase(domain, rawArticles) {
  if (!supabaseAdmin || !domain || !rawArticles.length) return;
  const now = new Date().toISOString();
  for (const a of rawArticles) {
    await supabaseAdmin.from('apollo_news_articles').upsert(
      {
        domain,
        apollo_article_id: a.id,
        title: a.title || '',
        url: a.url || null,
        source_domain: a.domain || null,
        snippet: a.snippet || null,
        published_at: a.published_at || null,
        event_categories: Array.isArray(a.event_categories) ? a.event_categories : [],
        updated_at: now
      },
      { onConflict: 'domain,apollo_article_id' }
    );
  }
  await supabaseAdmin
    .from('apollo_news_refresh')
    .upsert({ key: domain, last_refreshed_at: now }, { onConflict: 'key' });
}

export default async function handler(req, res) {
  const auth = req.headers?.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const secret = getCronSecret();

  if (!secret || token !== secret) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    if (!supabaseAdmin) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ refreshed: [], error: 'Supabase not configured' }));
      return;
    }

    const { data: refreshRows, error } = await supabaseAdmin
      .from('apollo_news_refresh')
      .select('key, last_refreshed_at');

    if (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message, refreshed: [] }));
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - REFRESH_WINDOW_DAYS);
    const staleDomains = (refreshRows || []).filter(
      (r) => !r.last_refreshed_at || new Date(r.last_refreshed_at) < cutoff
    ).map((r) => r.key);

    const refreshed = [];
    for (const domain of staleDomains) {
      try {
        const rawArticles = await fetchApolloNewsForDomain(domain);
        if (rawArticles && rawArticles.length > 0) {
          await upsertNewsToSupabase(domain, rawArticles);
          refreshed.push(domain);
        } else {
          // Still update last_refreshed_at so we don't hammer Apollo
          await supabaseAdmin
            .from('apollo_news_refresh')
            .upsert({ key: domain, last_refreshed_at: new Date().toISOString() }, { onConflict: 'key' });
          refreshed.push(domain);
        }
      } catch (e) {
        console.warn('[Cron Apollo News] Failed for domain', domain, e.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ refreshed }));
  } catch (e) {
    console.error('[Cron Apollo News] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message, refreshed: [] }));
  }
}
