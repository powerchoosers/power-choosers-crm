/**
 * Power Choosers CRM - Posts List API
 * Returns published posts with clean URLs (powerchoosers.com/posts/slug)
 */

import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!supabaseAdmin) {
      logger.error('[Posts List] Supabase Admin not initialized');
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    // Get all published posts from Supabase
    const { data: publishedPosts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('status', 'published')
      .order('publishDate', { ascending: false });

    if (postsError) {
      logger.error('[Posts List] Supabase error:', postsError);
      throw postsError;
    }

    // Use clean URLs for each post (powerchoosers.com/posts/slug)
    const postsWithUrls = (publishedPosts || []).map((post) => {
      const slug = post.slug || post.id;
      const cleanUrl = `https://powerchoosers.com/posts/${slug}`;

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        category: post.category || '',
        metaDescription: post.metaDescription || '',
        featuredImg: post.featuredImg || post.featuredImage || '',
        publishDate: post.publishDate || post.publish_date || null,
        createdAt: post.createdAt || post.created_at || null,
        url: cleanUrl
      };
    });

    res.status(200).json({
      posts: postsWithUrls,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Posts List] Error:', error);
    res.status(500).json({
      error: 'Failed to load posts',
      message: error.message
    });
  }
}

