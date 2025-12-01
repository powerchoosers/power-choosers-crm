/**
 * Power Choosers CRM - Posts List API
 * Returns published posts with clean URLs (powerchoosers.com/posts/slug)
 */

import { cors } from '../_cors.js';
import { db } from '../_firebase.js';
import logger from '../_logger.js';

// Note: No longer need getStorageBucket() since we're using clean URLs

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    if (!db) {
      logger.error('[Posts List] Firestore not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not available' }));
      return;
    }
    
    // Get all published posts from Firestore
    let publishedPosts = [];
    try {
      const publishedPostsSnapshot = await db.collection('posts')
        .where('status', '==', 'published')
        .orderBy('publishDate', 'desc')
        .get();
      
      publishedPostsSnapshot.forEach(doc => {
        publishedPosts.push({ id: doc.id, ...doc.data() });
      });
    } catch (indexError) {
      // Fallback if composite index doesn't exist
      logger.warn('[Posts List] Composite index not found, using fallback query');
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
        return dateB - dateA;
      });
    }
    
    // Use clean URLs for each post (powerchoosers.com/posts/slug)
    const postsWithUrls = publishedPosts.map((post) => {
      const slug = post.slug || post.id;
      const cleanUrl = `https://powerchoosers.com/posts/${slug}`;
      
      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        category: post.category || '',
        metaDescription: post.metaDescription || '',
        featuredImage: post.featuredImage || '',
        publishDate: post.publishDate ? 
          (post.publishDate.toDate ? post.publishDate.toDate().toISOString() : new Date(post.publishDate).toISOString()) : 
          null,
        createdAt: post.createdAt ? 
          (post.createdAt.toDate ? post.createdAt.toDate().toISOString() : new Date(post.createdAt).toISOString()) : 
          null,
        url: cleanUrl // Use clean URL instead of signed URL
      };
    });
    
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });
    res.end(JSON.stringify({
      posts: postsWithUrls,
      lastUpdated: new Date().toISOString()
    }));
    
  } catch (error) {
    logger.error('[Posts List] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to load posts',
      message: error.message
    }));
  }
}

