/**
 * Nodal Point Platform - Dynamic Sitemap Generator
 * Generates sitemap.xml dynamically including all public pages and blog posts
 */

import { supabaseAdmin } from './_supabase.js';
import logger from './_logger.js';

// Static pages that should always be in the sitemap
const staticPages = [
  { url: 'https://nodalpoint.io/', changefreq: 'weekly', priority: '1.0' },
  { url: 'https://nodalpoint.io/philosophy', changefreq: 'monthly', priority: '0.9' },
  { url: 'https://nodalpoint.io/bill-debugger', changefreq: 'monthly', priority: '0.9' },
  { url: 'https://nodalpoint.io/technical-docs', changefreq: 'monthly', priority: '0.8' },
  { url: 'https://nodalpoint.io/market-data', changefreq: 'weekly', priority: '0.8' },
];

// Generate sitemap XML
function generateSitemapXML(staticPages, blogPosts) {
  const urls = [...staticPages];

  // Add blog posts if they exist in the new structure
  blogPosts.forEach(post => {
    const slug = post.slug || post.id;
    const url = `https://nodalpoint.io/posts/${slug}`;

    // Get last modified date
    let lastmod = new Date().toISOString().split('T')[0]; // Default to today
    if (post.publishDate) {
      try {
        lastmod = new Date(post.publishDate).toISOString().split('T')[0];
      } catch (e) {
        // Use default if date parsing fails
      }
    } else if (post.updatedAt || post.updated_at) {
      try {
        lastmod = new Date(post.updatedAt || post.updated_at).toISOString().split('T')[0];
      } catch (e) {
        // Use default if date parsing fails
      }
    }

    urls.push({
      url,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7'
    });
  });

  // Generate XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(page => `  <url>
    <loc>${escapeXml(page.url)}</loc>
    <lastmod>${page.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq || 'monthly'}</changefreq>
    <priority>${page.priority || '0.5'}</priority>
  </url>`).join('\n')}
</urlset>`;

  return xml;
}

function escapeXml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  try {
    // Get all published blog posts from Supabase
    const { data: publishedPosts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('status', 'published')
      .order('publishDate', { ascending: false });

    if (postsError) {
      logger.error('[Sitemap] Supabase error fetching published posts:', postsError);
    }

    // Generate sitemap XML
    const sitemapXML = generateSitemapXML(staticPages, publishedPosts || []);

    // Set headers for XML response
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    });

    res.end(sitemapXML);

  } catch (error) {
    logger.error('[Sitemap] Error generating sitemap:', error);

    // Return a basic sitemap with just static pages if blog posts fail
    const basicSitemap = generateSitemapXML(staticPages, []);

    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes on error
    });

    res.end(basicSitemap);
  }
}

