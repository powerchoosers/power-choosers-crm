import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/pages/api/_logger.js';

const staticPages = [
  { url: 'https://nodalpoint.io/', changefreq: 'weekly', priority: '1.0' },
  { url: 'https://nodalpoint.io/philosophy', changefreq: 'monthly', priority: '0.9' },
  { url: 'https://nodalpoint.io/bill-debugger', changefreq: 'monthly', priority: '0.9' },
  { url: 'https://nodalpoint.io/technical-docs', changefreq: 'monthly', priority: '0.8' },
  { url: 'https://nodalpoint.io/market-data', changefreq: 'weekly', priority: '0.8' },
];

function escapeXml(text: string | undefined) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSitemapXML(staticEntries: typeof staticPages, blogPosts: any[]) {
  const urls = [...staticEntries];

  blogPosts.forEach((post) => {
    const slug = post.slug || post.id;
    const url = `https://nodalpoint.io/posts/${slug}`;

    let lastmod = new Date().toISOString().split('T')[0];
    if (post.publishDate) {
      try {
        lastmod = new Date(post.publishDate).toISOString().split('T')[0];
      } catch {
        // fallback to today
      }
    } else if (post.updatedAt || post.updated_at) {
      try {
        lastmod = new Date(post.updatedAt || post.updated_at).toISOString().split('T')[0];
      } catch {
        // fallback to today
      }
    }

    urls.push({
      url,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7',
    });
  });

  const today = new Date().toISOString().split('T')[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (page) => `  <url>
    <loc>${escapeXml(page.url)}</loc>
    <lastmod>${page.lastmod || today}</lastmod>
    <changefreq>${page.changefreq || 'monthly'}</changefreq>
    <priority>${page.priority || '0.5'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return xml;
}

async function fetchBlogPosts() {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('publishDate', { ascending: false });

  if (error) {
    logger.error('[Sitemap] Supabase error fetching published posts:', error);
  }

  return data ?? [];
}

export async function GET() {
  try {
    const publishedPosts = await fetchBlogPosts();
    const sitemapXML = generateSitemapXML(staticPages, publishedPosts);

    return new NextResponse(sitemapXML, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    logger.error('[Sitemap] Error generating sitemap:', error);
    const fallback = generateSitemapXML(staticPages, []);

    return new NextResponse(fallback, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
}
