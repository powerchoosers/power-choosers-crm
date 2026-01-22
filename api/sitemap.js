/**
 * Power Choosers CRM - Dynamic Sitemap Generator
 * Generates sitemap.xml dynamically including all published blog posts
 */

import { db } from './_firebase.js';
import logger from './_logger.js';

// Static pages that should always be in the sitemap
const staticPages = [
  { url: 'https://powerchoosers.com/', changefreq: 'weekly', priority: '1.0' },
  { url: 'https://powerchoosers.com/about.html', changefreq: 'monthly', priority: '0.8' },
  { url: 'https://powerchoosers.com/services.html', changefreq: 'monthly', priority: '0.9' },
  { url: 'https://powerchoosers.com/resources.html', changefreq: 'weekly', priority: '0.8' },
  { url: 'https://powerchoosers.com/schedule.html', changefreq: 'monthly', priority: '0.9' },
];

// Generate sitemap XML
function generateSitemapXML(staticPages, blogPosts) {
  const urls = [...staticPages];
  
  // Add blog posts
  blogPosts.forEach(post => {
    const slug = post.slug || post.id;
    const url = `https://powerchoosers.com/posts/${slug}`;
    
    // Get last modified date
    let lastmod = new Date().toISOString().split('T')[0]; // Default to today
    if (post.publishDate) {
      try {
        const publishDate = post.publishDate.toDate ? post.publishDate.toDate() : new Date(post.publishDate);
        lastmod = publishDate.toISOString().split('T')[0];
      } catch (e) {
        // Use default if date parsing fails
      }
    } else if (post.updatedAt) {
      try {
        const updatedDate = post.updatedAt.toDate ? post.updatedAt.toDate() : new Date(post.updatedAt);
        lastmod = updatedDate.toISOString().split('T')[0];
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
    // Get all published blog posts
    let publishedPosts = [];
    
    try {
      // Try to get posts ordered by publishDate (requires composite index)
      const publishedPostsSnapshot = await db.collection('posts')
        .where('status', '==', 'published')
        .orderBy('publishDate', 'desc')
        .get();
      
      publishedPostsSnapshot.forEach(doc => {
        publishedPosts.push({ id: doc.id, ...doc.data() });
      });
    } catch (indexError) {
      // If composite index doesn't exist, use simpler query
      logger.warn('[Sitemap] Composite index not found, using fallback query:', indexError.message);
      try {
        const publishedPostsSnapshot = await db.collection('posts')
          .where('status', '==', 'published')
          .get();
        
        publishedPostsSnapshot.forEach(doc => {
          publishedPosts.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory by publishDate
        publishedPosts.sort((a, b) => {
          const dateA = a.publishDate ? (a.publishDate.toDate ? a.publishDate.toDate() : new Date(a.publishDate)) : new Date(0);
          const dateB = b.publishDate ? (b.publishDate.toDate ? b.publishDate.toDate() : new Date(b.publishDate)) : new Date(0);
          return dateB - dateA; // Descending order
        });
      } catch (fallbackError) {
        logger.error('[Sitemap] Error fetching published posts:', fallbackError);
        publishedPosts = [];
      }
    }
    
    // Generate sitemap XML
    const sitemapXML = generateSitemapXML(staticPages, publishedPosts);
    
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

