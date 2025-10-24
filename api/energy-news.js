// Energy News (Serverless)
import { cors } from './_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS centrally
  if (req.method !== 'GET') {
    return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
  }

  try {
    const rssUrl = 'https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'PowerChoosersCRM/1.0' } });
    const xml = await response.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && items.length < 4) {
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
      items.push({ title, url: link, publishedAt });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      lastRefreshed: new Date().toISOString(),
      items
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch energy news', message: error.message }));
  }
}
