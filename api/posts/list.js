/**
 * Power Choosers CRM - Posts List API
 * Returns published posts with signed URLs for public access
 * Works around domain-restricted sharing by generating signed URLs server-side
 */

import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';

// Get Firebase Storage bucket
function getStorageBucket() {
  if (!admin.apps || admin.apps.length === 0) {
    throw new Error('Firebase Admin not initialized');
  }
  
  const projectId = process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm';
  let storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    process.env.FIREBASE_STORAGE_BUCKET;
  
  // Remove gs:// prefix if present
  if (storageBucket && storageBucket.startsWith('gs://')) {
    storageBucket = storageBucket.replace('gs://', '');
  }
  
  if (!storageBucket || (!storageBucket.includes('.') && !storageBucket.includes('gs://'))) {
    storageBucket = `${projectId}.firebasestorage.app`;
  }
  
  // Try default bucket first, then fallback to explicit name
  try {
    return admin.storage().bucket();
  } catch (error) {
    if (storageBucket) {
      return admin.storage().bucket(storageBucket);
    }
    throw error;
  }
}

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
      console.error('[Posts List] Firestore not initialized');
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
      console.warn('[Posts List] Composite index not found, using fallback query');
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
    
    // Get storage bucket
    const bucket = getStorageBucket();
    
    // Generate signed URLs for each post (10-year expiration)
    const expiresIn = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
    const postsWithUrls = await Promise.all(publishedPosts.map(async (post) => {
      const postFile = bucket.file(`posts/${post.slug || post.id}.html`);
      let signedUrl = '';
      try {
        const [url] = await postFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + expiresIn,
        });
        signedUrl = url;
      } catch (error) {
        console.warn('[Posts List] Could not generate signed URL for post:', post.id, error.message);
        // Fallback URL (won't work without access, but structure is correct)
        signedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/posts%2F${encodeURIComponent(post.slug || post.id)}.html?alt=media`;
      }
      
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
        url: signedUrl
      };
    }));
    
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });
    res.end(JSON.stringify({
      posts: postsWithUrls,
      lastUpdated: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('[Posts List] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to load posts',
      message: error.message
    }));
  }
}

