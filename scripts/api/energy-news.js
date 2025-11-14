// Energy News (Serverless) - Vercel function

// Simple CORS middleware (public)
function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
            console.error('[Energy News] Gemini reformatting failed for headline:', err);
            return item; // Fallback to original headline
          }
        }));
        
        items.push(...reformattedItems);
      } else {
        // No Gemini key - use original headlines
        console.warn('[Energy News] GEMINI_API_KEY not set, using original headlines');
        items.push(...rawItems);
      }
    } catch (error) {
      // Gemini import or processing failed - use original headlines
      console.error('[Energy News] Gemini processing failed:', error);
      items.push(...rawItems);
    }

    return res.status(200).json({
      lastRefreshed: new Date().toISOString(),
      items
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch energy news', message: error.message });
  }
}
