// Energy News (Serverless)
import { cors } from './_cors.js';
import { db } from './_firebase.js';
import logger from './_logger.js';

// Cache duration: 6 hours (21600000 ms)
const CACHE_DURATION = 6 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS centrally
  if (req.method !== 'GET') {
    return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
  }

  try {
    // Check cache first
    let cacheData = null;
    let cacheValid = false;
    
    if (db) {
      try {
        const cacheDoc = await db.collection('cache').doc('energy-news').get();
        if (cacheDoc.exists) {
          cacheData = cacheDoc.data();
          const cacheAge = Date.now() - (cacheData.timestamp || 0);
          cacheValid = cacheAge < CACHE_DURATION;
          
          if (cacheValid) {
            // Return cached data
            res.writeHead(200, { 
              'Content-Type': 'application/json',
              'X-Cache': 'HIT',
              'X-Cache-Age': Math.floor(cacheAge / 1000) // Age in seconds
            });
            return res.end(JSON.stringify(cacheData.data));
          }
        }
      } catch (cacheError) {
        // If cache read fails, continue with fresh fetch
        logger.warn('[Energy News] Cache read failed, fetching fresh:', cacheError.message);
      }
    }

    // Cache miss or expired - fetch fresh data
    const rssUrl = 'https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'PowerChoosersCRM/1.0' } });
    const xml = await response.text();

    const rawItems = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && rawItems.length < 4) {
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
      rawItems.push({ title, url: link, publishedAt });
    }

    // Reformat headlines using Gemini to fit exactly 3 lines
    const items = [];
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        
        // Process headlines in parallel for better performance
        const reformattedItems = await Promise.all(rawItems.map(async (item) => {
          try {
            const prompt = `Rewrite this energy news headline to be approximately 150-180 characters long (must fill exactly 3 lines in a widget display). Make it detailed and comprehensive while remaining clear and scannable. Include the key facts and context. Remove source attribution (like "- CBS News", "- The Hill", etc.) from the end. Return ONLY the rewritten headline with no quotes or extra text:

"${item.title}"`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const reformattedTitle = response.text().trim().replace(/^["']|["']$/g, ''); // Remove quotes if any
            
            return {
              ...item,
              title: reformattedTitle || item.title // Fallback to original if Gemini fails
            };
          } catch (err) {
            logger.error('[Energy News] Gemini reformatting failed for headline:', err);
            return item; // Fallback to original headline
          }
        }));
        
        items.push(...reformattedItems);
      } else {
        // No Gemini key - use original headlines
        logger.warn('[Energy News] GEMINI_API_KEY not set, using original headlines');
        items.push(...rawItems);
      }
    } catch (error) {
      // Gemini import or processing failed - use original headlines
      logger.error('[Energy News] Gemini processing failed:', error);
      items.push(...rawItems);
    }

    // Prepare response data
    const responseData = {
      lastRefreshed: new Date().toISOString(),
      items
    };

    // Save to cache for future requests
    if (db) {
      try {
        await db.collection('cache').doc('energy-news').set({
          timestamp: Date.now(),
          data: responseData
        });
      } catch (cacheError) {
        // If cache write fails, still return the data
        logger.warn('[Energy News] Cache write failed:', cacheError.message);
      }
    }

    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'X-Cache': 'MISS'
    });
    return res.end(JSON.stringify(responseData));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch energy news', message: error.message }));
  }
}
