import { cors } from './_cors.js';

function normalizeDomain(value) {
  try {
    if (!value) return '';
    let s = String(value).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        s = u.hostname || '';
      } catch (_) {
        s = s.replace(/^https?:\/\//i, '');
      }
    }
    s = s.replace(/^www\./i, '');
    s = s.split(/[/?#]/)[0];
    s = s.replace(/:\d+$/, '');
    return String(s || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

function isLikelyUnsafeHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost') return true;
  if (h.endsWith('.local')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (h === '::1') return true;
  if (h.includes(':')) return true;
  return false;
}

function clampSize(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 64;
  return Math.max(16, Math.min(256, n));
}

function svgFallback(size) {
  const s = clampSize(size);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="10" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
    <path d="M14 54h36"/>
    <path d="M18 54V20l14-8 14 8v34"/>
    <path d="M24 28a3 3 0 1 0 6 0"/>
    <path d="M24 38a3 3 0 1 0 6 0"/>
    <path d="M24 48a3 3 0 1 0 6 0"/>
    <path d="M40 28a3 3 0 1 0 6 0"/>
    <path d="M40 38a3 3 0 1 0 6 0"/>
    <path d="M40 48a3 3 0 1 0 6 0"/>
  </g>
</svg>`;
}

async function fetchFirstImage(candidates, timeoutMs) {
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(candidate, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PowerChoosersCRM/1.0',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });

      if (!resp.ok) continue;

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('image/') && !contentType.includes('application/octet-stream')) continue;

      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf || buf.length === 0) continue;
      if (buf.length > 512 * 1024) continue;

      return { buf, contentType: contentType || 'image/png', sourceUrl: candidate };
    } catch (_) {
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const q = req.query || {};
  const size = clampSize(q.size);
  const domain = normalizeDomain(q.domain);
  const urlParam = q.url ? String(q.url).trim() : '';

  const requestSize = Math.max(size, 32);

  const candidates = [];

  if (urlParam) {
    try {
      const u = new URL(urlParam);
      const host = String(u.hostname || '').toLowerCase();
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !isLikelyUnsafeHost(host)) {
        candidates.push(u.toString());
      }
    } catch (_) {
    }
  }

  if (domain && !isLikelyUnsafeHost(domain)) {
    candidates.push(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
    candidates.push(`https://www.google.com/s2/favicons?sz=${encodeURIComponent(requestSize)}&domain=${encodeURIComponent(domain)}`);
    candidates.push(`https://favicons.githubusercontent.com/${encodeURIComponent(domain)}`);
    candidates.push(`https://api.faviconkit.com/${encodeURIComponent(domain)}/${encodeURIComponent(requestSize)}`);
    candidates.push(`https://favicon.yandex.net/favicon/${encodeURIComponent(domain)}`);
    candidates.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
    candidates.push(`https://${domain}/favicon.ico`);
  }

  const picked = await fetchFirstImage(candidates, 2500);
  if (picked) {
    res.writeHead(200, {
      'Content-Type': picked.contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    });
    res.end(picked.buf);
    return;
  }

  const svg = svgFallback(size);
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
  });
  res.end(svg);
}
