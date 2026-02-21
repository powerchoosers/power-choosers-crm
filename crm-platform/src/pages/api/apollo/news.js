/**
 * Apollo News Articles Search
 * Serves company news/signals for the Target Signal Stream from Supabase only.
 * Refresh is NOT triggered by visiting the dossier: we hold off until cron or first-ever load.
 * - If we have saved data for this domain → return it (no Apollo call).
 * - If we have no saved data (first time) → fetch from Apollo, persist, return.
 * Ongoing refresh is only via daily cron (domains not refreshed in 7 days).
 * @see Apollo/News Feed.md for API spec
 */

import { cors, fetchWithRetry, getApiKey, APOLLO_BASE_URL, normalizeDomain } from './_utils.js';
import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { domain: rawDomain, organization_id: organizationId } = req.query || {};

    if (!rawDomain && !organizationId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing parameter: domain or organization_id required',
        signals: []
      }));
      return;
    }

    const domain = rawDomain ? normalizeDomain(rawDomain) : null;
    if (!domain) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ signals: [] }));
      return;
    }

    // Check if we have a valid refresh record
    const { data: refreshRec } = await supabaseAdmin
      .from('apollo_news_refresh')
      .select('last_refreshed_at')
      .eq('key', domain)
      .maybeSingle();

    const isStaleOrMissing = !refreshRec || (Date.now() - new Date(refreshRec.last_refreshed_at).getTime() > 7 * 24 * 60 * 60 * 1000);

    // 1. Serve from Supabase if we have fresh data.
    if (!isStaleOrMissing && supabaseAdmin) {
      const { data: articles, error } = await supabaseAdmin
        .from('apollo_news_articles')
        .select('id, domain, apollo_article_id, title, url, source_domain, snippet, published_at, event_categories')
        .eq('domain', domain)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(10);

      if (!error && articles) {
        const signals = articles.map((a) => ({
          id: a.apollo_article_id,
          title: a.title || '',
          url: a.url || '',
          domain: a.source_domain || a.domain || '',
          snippet: a.snippet || '',
          published_at: a.published_at || null,
          event_categories: a.event_categories || []
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ signals, _source: 'supabase' }));
        return;
      }
    }

    // 2. Data is stale or missing — fetch from Apollo
    const APOLLO_API_KEY = getApiKey();
    let orgId = organizationId;

    if (!orgId) {
      const enrichUrl = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(domain)}`;
      const enrichResp = await fetchWithRetry(enrichUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        }
      });

      if (enrichResp.ok) {
        const enrichData = await enrichResp.json();
        orgId = enrichData.organization?.id || null;
      }
    }

    // If orgId is found, search news
    if (orgId) {
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

      if (newsResp.ok) {
        const newsData = await newsResp.json();
        const rawArticles = newsData.news_articles || [];
        const signals = rawArticles.slice(0, 10).map((a) => ({
          id: a.id,
          title: a.title || '',
          url: a.url || '',
          domain: a.domain || '',
          snippet: a.snippet || '',
          published_at: a.published_at || null,
          event_categories: Array.isArray(a.event_categories) ? a.event_categories : []
        }));

        // Persist Apollo signals to Supabase (so they mix with any manual ingestions)
        if (supabaseAdmin && signals.length > 0) {
          const now = new Date().toISOString();
          for (const a of signals) {
            await supabaseAdmin
              .from('apollo_news_articles')
              .upsert(
                {
                  domain,
                  apollo_article_id: a.id,
                  title: a.title,
                  url: a.url || null,
                  source_domain: a.domain || null,
                  snippet: a.snippet || null,
                  published_at: a.published_at || null,
                  event_categories: a.event_categories || [],
                  updated_at: now
                },
                { onConflict: 'domain,apollo_article_id' }
              );
          }
        }
      }
    }

    // Update refresh timestamp so we don't hammer Apollo, even if no news was found
    if (supabaseAdmin) {
      await supabaseAdmin
        .from('apollo_news_refresh')
        .upsert({ key: domain, last_refreshed_at: new Date().toISOString() }, { onConflict: 'key' });
    }

    // 3. Finally, read back from Supabase to return the combined top 10 (manual + apollo)
    if (supabaseAdmin) {
      const { data: articles, error } = await supabaseAdmin
        .from('apollo_news_articles')
        .select('id, domain, apollo_article_id, title, url, source_domain, snippet, published_at, event_categories')
        .eq('domain', domain)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(10);

      if (!error && articles) {
        const finalSignals = articles.map((a) => ({
          id: a.apollo_article_id,
          title: a.title || '',
          url: a.url || '',
          domain: a.source_domain || a.domain || '',
          snippet: a.snippet || '',
          published_at: a.published_at || null,
          event_categories: a.event_categories || []
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ signals: finalSignals, _source: 'apollo_and_supabase' }));
        return;
      }
    }

    // Fallback if DB fetch fails
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ signals: [] }));
  } catch (e) {
    console.error('[Apollo News] Error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error', signals: [] }));
  }
}
