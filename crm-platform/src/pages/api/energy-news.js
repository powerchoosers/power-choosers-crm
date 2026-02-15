// Energy News (Serverless)
import { cors } from './_cors.js';
import { supabaseAdmin } from './_supabase.js';
import logger from './_logger.js';

// Only refresh (RSS + Gemini) at 10 AM and 3 PM America/Chicago. Saves Gemini credits.
const REFRESH_WINDOW_HOURS = [10, 15]; // 10 AM and 3 PM
const WINDOW_COOLDOWN_MS = 55 * 60 * 1000; // Within same window, don't refetch for 55 min

function isInRefreshWindow() {
  const chicago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return REFRESH_WINDOW_HOURS.includes(chicago.getHours());
}

function sendCache(res, cacheData) {
  const cacheAge = Date.now() - (cacheData.timestamp || 0);
  res.status(200).json({
    ...cacheData.data,
    _cached: true,
    _cacheAge: Math.floor(cacheAge / 1000)
  });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    let cacheData = null;
    if (supabaseAdmin) {
      try {
        const { data: cacheRow, error: cacheError } = await supabaseAdmin
          .from('ai_cache')
          .select('insights, cached_at')
          .eq('key', 'energy-news')
          .single();

        if (cacheRow && !cacheError) {
          cacheData = {
            timestamp: cacheRow.cached_at,
            data: cacheRow.insights
          };
        }
      } catch (cacheError) {
        logger.warn('[Energy News] Cache read failed:', cacheError.message);
      }
    }

    const inWindow = isInRefreshWindow();
    const cacheAge = cacheData ? Date.now() - (cacheData.timestamp || 0) : Infinity;

    // Outside 10 AM / 3 PM: never fetch or call Gemini. Return cache if we have it.
    if (!inWindow) {
      if (cacheData?.data) return sendCache(res, cacheData);
      logger.info('[Energy News] Outside refresh window; no cache — fetching RSS only (no Gemini)', 'EnergyNews');
    } else {
      // Inside window: one refresh per window
      if (cacheData?.data && cacheAge < WINDOW_COOLDOWN_MS) return sendCache(res, cacheData);
    }

    // Fetch fresh RSS (Google News + EIA)
    const userAgent = 'PowerChoosersCRM/1.0';
    const headers = { 'User-Agent': userAgent };

    function parseRssItems(xml, maxItems, sourceLabel) {
      const out = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) && out.length < maxItems) {
        const block = match[1];
        const getTag = (name) => {
          const r = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i');
          const m = r.exec(block);
          return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        };
        const title = getTag('title');
        const link = getTag('link');
        const pubDate = getTag('pubDate');
        let publishedAt = '';
        try { publishedAt = new Date(pubDate).toISOString(); } catch (_) { publishedAt = ''; }
        if (!title || !link) continue;
        out.push({ title, url: link, publishedAt, source: sourceLabel });
      }
      return out;
    }

    let rawItems = [];
    try {
      const [googleRes, eiaRes] = await Promise.all([
        fetch('https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en', { headers }),
        fetch('https://www.eia.gov/rss/todayinenergy.xml', { headers }).catch(() => null)
      ]);
      const googleXml = await googleRes.text();
      rawItems = parseRssItems(googleXml, 4, 'Energy Intel');
      if (eiaRes && eiaRes.ok) {
        const eiaXml = await eiaRes.text();
        const eiaItems = parseRssItems(eiaXml, 2, 'EIA Today in Energy');
        rawItems = [...rawItems, ...eiaItems].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 6);
      }
    } catch (fetchErr) {
      logger.warn('[Energy News] RSS fetch failed, using Google only:', fetchErr.message);
      const response = await fetch('https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en', { headers: { 'User-Agent': userAgent } });
      const xml = await response.text();
      rawItems = parseRssItems(xml, 4, 'Energy Intel');
    }

    // Use Gemini only during 10 AM / 3 PM refresh window to save credits.
    const items = [];
    const useGemini = inWindow && (process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY);

    if (useGemini) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const reformattedItems = await Promise.all(rawItems.map(async (item) => {
          try {
            const prompt = `Rewrite this energy news headline to be approximately 150-180 characters long (must fill exactly 3 lines in a widget display). Make it detailed and comprehensive while remaining clear and scannable. Include the key facts and context. Remove source attribution (like "- CBS News", "- The Hill", etc.) from the end. Return ONLY the rewritten headline with no quotes or extra text:

"${item.title}"`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const reformattedTitle = response.text().trim().replace(/^["']|["']$/g, '');

            return { ...item, title: reformattedTitle || item.title };
          } catch (err) {
            logger.error('[Energy News] Gemini reformatting failed for headline:', err);
            return item;
          }
        }));
        items.push(...reformattedItems);
      } catch (error) {
        logger.error('[Energy News] Gemini processing failed:', error);
        items.push(...rawItems);
      }
    } else {
      items.push(...rawItems);
    }

    const responseData = {
      lastRefreshed: new Date().toISOString(),
      items
    };

    // Save to cache for future requests
    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('ai_cache')
          .upsert({
            key: 'energy-news',
            insights: responseData,
            cached_at: Date.now(),
            source: 'energy-news-api'
          });
      } catch (cacheError) {
        logger.warn('[Energy News] Cache write failed:', cacheError.message);
      }
    }

    res.status(200).json(responseData);
  } catch (error) {
    logger.error('[Energy News] Final handler error:', error);
    res.status(500).json({ error: 'Failed to fetch energy news', message: error.message });
  }
}
