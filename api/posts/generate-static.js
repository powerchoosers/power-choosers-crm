/**
 * Power Choosers CRM - Static Post HTML Generator
 * Generates static HTML files for posts and uploads to Firebase Storage
 * Also updates posts-list.json index file
 */

import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Get Firebase Storage bucket
function getStorageBucket() {
  if (!admin.apps || admin.apps.length === 0) {
    throw new Error('Firebase Admin not initialized');
  }
  
  // Check for _NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET first (Cloud Run env var)
  // Then FIREBASE_STORAGE_BUCKET, then default
  const storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    process.env.FIREBASE_STORAGE_BUCKET || 
    `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
  
  return admin.storage().bucket(storageBucket);
}

// Generate HTML for a single post
function generatePostHTML(post, recentPosts = []) {
  const title = post.title || 'Untitled Post';
  const metaDescription = post.metaDescription || '';
  const keywords = post.keywords || '';
  const content = post.content || '';
  const featuredImage = post.featuredImage || '';
  const publishDate = post.publishDate ? 
    (post.publishDate.toDate ? post.publishDate.toDate() : new Date(post.publishDate)) : 
    new Date();
  
  // Get storage bucket for post URLs (use same format as resources.html)
  // Default to firebasestorage.app format if bucket name doesn't include it
  let storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    process.env.FIREBASE_STORAGE_BUCKET || 
    `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
  
  // Ensure we use the correct format (firebasestorage.app or appspot.com)
  if (!storageBucket.includes('.firebasestorage.app') && !storageBucket.includes('.appspot.com')) {
    storageBucket = `${process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm'}.firebasestorage.app`;
  }
  
  const formattedDate = publishDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} — Power Choosers</title>
    <meta name="description" content="${escapeHtml(metaDescription)}">
    ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
    <link rel="icon" type="image/png" sizes="32x32" href="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(metaDescription)}">
    ${featuredImage ? `<meta property="og:image" content="${escapeHtml(featuredImage)}">` : ''}
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
    ${featuredImage ? `<meta name="twitter:image" content="${escapeHtml(featuredImage)}">` : ''}
    
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      :root{
        --brand-blue:#0b1b45;
        --brand-orange:#f59e0b;
        --text:#0f172a;
        --muted:#475569;
        --card:#ffffff;
        --border:#e5e7eb;
        --shadow:0 10px 24px rgba(0,0,0,.08);
        --radius:14px;
        --container:900px;
      }
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{height:100%;scroll-behavior:smooth}
      body{margin:0;font-family:"Inter",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--text);background:#ffffff;line-height:1.6}
      a{color:var(--brand-orange);text-decoration:none}
      a:hover{text-decoration:underline}
      img{max-width:100%;display:block;height:auto}
      
      /* Header */
      .site-header{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .nav{max-width:1400px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:16px 24px}
      .brand{display:flex;align-items:center;gap:14px}
      .brand img{height:44px;width:44px;border-radius:50%}
      .brand-name{font-weight:800;letter-spacing:.2px;font-size:20px;color:var(--brand-blue)}
      .nav-links{display:flex;gap:22px;align-items:center}
      .menu-toggle{display:none}
      .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid transparent;padding:10px 14px;font-weight:600;cursor:pointer;transition:.2s ease}
      .btn-primary{background:linear-gradient(135deg,var(--brand-orange) 0%, #d97706 100%);color:#0a0f1f;box-shadow:0 6px 18px rgba(245,158,11,.35);border:1px solid rgba(255,255,255,.2);transition:all .3s cubic-bezier(.4,.0,.2,1)}
      .btn-primary:hover{transform:translateY(-2px);box-shadow:0 0 20px rgba(245,158,11,.3),0 12px 24px rgba(245,158,11,.4)}
      .btn-outline{border-color:#2d3a5c;background:transparent;color:var(--brand-blue);transition:all .3s cubic-bezier(.4,.0,.2,1)}
      .btn-outline:hover{border-color:var(--brand-orange);background:linear-gradient(135deg,rgba(245,158,11,.05) 0%, rgba(245,158,11,.02) 100%);color:var(--brand-orange)}
      
      @media (max-width: 768px){
        .nav{padding:12px 16px;width:100%;max-width:100%}
        .menu-toggle{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);background:#ffffff;border-radius:10px;padding:8px;width:40px;height:40px}
        .nav{position:relative}
        .nav-links{position:absolute;top:100%;left:0;right:0;display:none;flex-direction:column;gap:8px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:12px 16px;width:100%;box-shadow:0 4px 12px rgba(0,0,0,.1)}
        .nav-links.open{display:flex}
        .nav-links .btn{width:100%;justify-content:flex-start}
      }
      
      /* Article */
      .article-container{max-width:var(--container);margin:0 auto;padding:60px 24px}
      .article-header{margin-bottom:48px}
      .article-meta{display:flex;align-items:center;gap:16px;margin-bottom:16px;color:var(--muted);font-size:14px}
      .article-category{display:inline-block;padding:6px 12px;background:linear-gradient(135deg,rgba(11,27,69,.1),rgba(245,158,11,.1));border-radius:6px;font-size:12px;font-weight:600;color:var(--brand-blue)}
      .article-title{font-size:48px;font-weight:800;line-height:1.2;margin-bottom:24px;color:var(--brand-blue)}
      .article-featured-image{margin:32px 0;border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
      .article-featured-image img{width:100%;height:auto}
      .article-content{font-size:18px;line-height:1.8;color:var(--text)}
      .article-content h2{font-size:32px;font-weight:700;margin:48px 0 24px;color:var(--brand-blue)}
      .article-content h3{font-size:24px;font-weight:600;margin:36px 0 18px;color:var(--brand-blue)}
      .article-content p{margin-bottom:24px}
      .article-content ul,.article-content ol{margin:24px 0;padding-left:32px}
      .article-content li{margin-bottom:12px}
      .article-content img{max-width:100%;height:auto;margin:32px auto;border-radius:var(--radius);box-shadow:var(--shadow)}
      .article-content .image-with-caption{margin:32px 0}
      .article-content .image-caption{text-align:center;font-size:14px;color:var(--muted);font-style:italic;margin-top:8px}
      .article-content a{color:var(--brand-orange);text-decoration:underline}
      .article-content a:hover{color:#d97706}
      
      /* Recent Posts Section */
      .recent-posts-section{max-width:1400px;margin:80px auto 0;padding:80px 24px;background:linear-gradient(135deg,#f8fafc 0%, #ffffff 100%);border-top:1px solid var(--border)}
      .recent-posts-section h2{font-size:40px;font-weight:800;margin-bottom:48px;text-align:center;background:linear-gradient(135deg,var(--brand-blue) 0%, #1e3a8a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      .recent-posts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:32px}
      .recent-post-card{background:linear-gradient(135deg,#ffffff 0%, #fafbfc 100%);border:1px solid rgba(229,231,235,.6);border-radius:var(--radius);padding:0;box-shadow:0 4px 12px rgba(0,0,0,.05);transition:all .3s cubic-bezier(.4,.0,.2,1);display:flex;flex-direction:column;position:relative;overflow:hidden;text-decoration:none;color:inherit}
      .recent-post-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--brand-orange),transparent)}
      .recent-post-card:hover{transform:translateY(-6px);box-shadow:0 20px 40px rgba(0,0,0,.12);border-color:rgba(245,158,11,.2);text-decoration:none;color:inherit}
      .recent-post-image{width:100%;height:200px;object-fit:cover;display:block}
      .recent-post-content{padding:24px;flex-grow:1;display:flex;flex-direction:column}
      .recent-post-category{display:inline-block;padding:6px 12px;background:linear-gradient(135deg,rgba(11,27,69,.1),rgba(245,158,11,.1));border-radius:6px;font-size:12px;font-weight:600;color:var(--brand-blue);margin-bottom:12px;width:fit-content}
      .recent-post-card h3{font-size:20px;font-weight:700;margin-bottom:12px;line-height:1.3;color:var(--brand-blue)}
      .recent-post-card p{color:var(--muted);line-height:1.6;margin-bottom:16px;flex-grow:1;font-size:15px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .recent-post-link{display:inline-flex;align-items:center;gap:8px;color:var(--brand-orange);font-weight:600;font-size:14px;transition:gap .2s;margin-top:auto}
      .recent-post-card:hover .recent-post-link{gap:12px}
      
      @media (max-width: 768px){
        .recent-posts-section{padding:60px 16px}
        .recent-posts-section h2{font-size:32px;margin-bottom:32px}
        .recent-posts-grid{grid-template-columns:1fr;gap:24px}
      }
      
      /* Footer */
      .site-footer{background:linear-gradient(180deg,#f8fafc,#ffffff);border-top:1px solid var(--border);padding:48px 24px;margin-top:80px}
      .footer-content{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;width:100%;max-width:1400px;margin:0 auto}
      .footer-brand{display:flex;align-items:center;gap:14px;margin-bottom:16px}
      .footer-brand img{height:40px;width:40px;border-radius:50%}
      .footer-brand span{font-weight:800;font-size:18px;color:var(--brand-blue)}
      .footer h4{font-weight:700;margin-bottom:16px;font-size:16px;color:var(--brand-blue)}
      .footer-links{display:flex;flex-direction:column;gap:8px}
      .footer-links a{color:var(--muted);font-size:14px;transition:color .2s;text-decoration:none}
      .footer-links a:hover{color:var(--brand-orange)}
      .footer-bottom{text-align:center;padding-top:32px;border-top:1px solid var(--border);margin-top:32px;color:var(--muted);font-size:14px;grid-column:1/-1}
      
      @media (max-width: 768px){
        .article-title{font-size:32px}
        .article-content{font-size:16px}
        .article-content h2{font-size:24px}
        .article-content h3{font-size:20px}
      }
    </style>
    <!-- Apollo Tracking Script -->
    <script>function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){window.trackingFunctions.onLoad({appId:"67ec3b5820289a0021c5a43c"})},document.head.appendChild(o)}initApollo();</script>
</head>
<body>
    <header class="site-header">
        <nav class="nav">
            <a href="https://powerchoosers.com/index.html" class="brand">
                <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers">
                <span class="brand-name">Power Choosers</span>
            </a>
            <button class="menu-toggle" id="nav-toggle" aria-label="Open menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div class="nav-links">
                <a href="https://powerchoosers.com/index.html" class="btn btn-outline">Home</a>
                <a href="https://powerchoosers.com/index.html#services" class="btn btn-outline">Services</a>
                <a href="https://powerchoosers.com/about.html" class="btn btn-outline">About</a>
                <a href="https://powerchoosers.com/resources.html" class="btn btn-outline">Resources</a>
                <a href="https://powerchoosers.com/schedule.html" class="btn btn-outline">Schedule</a>
                <a href="https://powerchoosers.com/index.html#get-started" class="btn btn-primary">Contact an Expert</a>
            </div>
        </nav>
    </header>
    
    <article class="article-container">
        <header class="article-header">
            ${post.category ? `<span class="article-category">${escapeHtml(post.category)}</span>` : ''}
            <h1 class="article-title">${escapeHtml(title)}</h1>
            <div class="article-meta">
                <time datetime="${publishDate.toISOString()}">${formattedDate}</time>
            </div>
        </header>
        
        ${featuredImage ? `
        <div class="article-featured-image">
            <img src="${escapeHtml(featuredImage)}" alt="${escapeHtml(title)}">
        </div>
        ` : ''}
        
        <div class="article-content">
            ${content}
        </div>
    </article>
    
    ${recentPosts.length > 0 ? `
    <section class="recent-posts-section">
        <h2>Recent Posts</h2>
        <div class="recent-posts-grid">
            ${recentPosts.map(recentPost => {
                const recentTitle = recentPost.title || 'Untitled';
                const recentDesc = recentPost.metaDescription || '';
                const recentImage = recentPost.featuredImage || '';
                const recentCategory = recentPost.category || '';
                const recentSlug = recentPost.slug || recentPost.id;
                const recentPath = `posts/${recentSlug}.html`;
                const encodedPath = encodeURIComponent(recentPath);
                const recentUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodedPath}?alt=media`;
                
                // Truncate description to ~150 characters
                const preview = recentDesc.length > 150 ? recentDesc.substring(0, 150).trim() + '...' : recentDesc;
                
                return `
                    <a href="${escapeHtml(recentUrl)}" class="recent-post-card" target="_blank" rel="noopener">
                        ${recentImage ? `<img src="${escapeHtml(recentImage)}" alt="${escapeHtml(recentTitle)}" class="recent-post-image">` : ''}
                        <div class="recent-post-content">
                            ${recentCategory ? `<span class="recent-post-category">${escapeHtml(recentCategory)}</span>` : ''}
                            <h3>${escapeHtml(recentTitle)}</h3>
                            ${preview ? `<p>${escapeHtml(preview)}</p>` : ''}
                            <span class="recent-post-link">Read More <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
                        </div>
                    </a>
                `;
            }).join('')}
        </div>
    </section>
    ` : ''}
    
    <footer class="site-footer">
        <div class="footer-content">
            <div>
                <div class="footer-brand">
                    <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers" />
                    <span>Power Choosers</span>
                </div>
                <p style="color:var(--muted);font-size:14px;margin-bottom:16px">Your trusted partner in energy procurement and management.</p>
            </div>
            <div>
                <h4>Company</h4>
                <div class="footer-links">
                    <a href="https://powerchoosers.com/about.html">About Us</a>
                    <a href="https://powerchoosers.com/services.html">Services</a>
                    <a href="https://powerchoosers.com/resources.html">Resources</a>
                    <a href="https://powerchoosers.com/index.html#testimonials">Testimonials</a>
                </div>
            </div>
            <div>
                <h4>Legal</h4>
                <div class="footer-links">
                    <a href="https://powerchoosers.com/index.html#privacy">Privacy Policy</a>
                    <a href="https://powerchoosers.com/index.html#terms">Terms of Service</a>
                </div>
            </div>
            <div>
                <h4>Contact</h4>
                <div class="footer-links">
                    <a href="tel:19728342317">(972) 834-2317</a>
                    <a href="mailto:renewals@powerchoosers.com">renewals@powerchoosers.com</a>
                </div>
            </div>
            <div class="footer-bottom">
                © ${new Date().getFullYear()} Power Choosers. All rights reserved.
            </div>
        </div>
    </footer>
    
    <script>
        // Mobile nav toggle
        const navToggle = document.getElementById('nav-toggle');
        const navLinks = document.querySelector('.nav-links');
        if (navToggle && navLinks) {
            navToggle.addEventListener('click', () => {
                const isOpen = navLinks.classList.toggle('open');
                navToggle.setAttribute('aria-expanded', String(isOpen));
            });
            navLinks.addEventListener('click', (e) => {
                const t = e.target;
                if (t instanceof Element && (t.matches('a') || t.matches('button'))) {
                    navLinks.classList.remove('open');
                    navToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    </script>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Upload HTML file to Firebase Storage
async function uploadHTMLToStorage(bucket, filename, htmlContent) {
  const file = bucket.file(`posts/${filename}`);
  await file.save(htmlContent, {
    metadata: {
      contentType: 'text/html',
      cacheControl: 'public, max-age=3600',
    },
    public: true,
  });
  
  // Make file publicly accessible
  await file.makePublic();
  
  return file.publicUrl();
}

// Update posts-list.json in Firebase Storage
async function updatePostsList(bucket, posts) {
  const listData = {
    posts: posts.map(post => ({
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
      url: `posts/${post.slug || post.id}.html`
    })),
    lastUpdated: new Date().toISOString()
  };
  
  const file = bucket.file('posts-list.json');
  await file.save(JSON.stringify(listData, null, 2), {
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=300',
    },
    public: true,
  });
  
  await file.makePublic();
  
  return file.publicUrl();
}

export default async function handler(req, res) {
  console.log('[GenerateStatic] Request received:', req.method);
  
  if (cors(req, res)) {
    console.log('[GenerateStatic] CORS preflight handled');
    return;
  }
  
  if (req.method !== 'POST') {
    console.log('[GenerateStatic] Invalid method:', req.method);
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const { postId } = req.body || {};
    
    if (!postId) {
      console.log('[GenerateStatic] No postId provided');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'postId is required' }));
      return;
    }
    
    if (!db) {
      console.error('[GenerateStatic] Firestore not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not available' }));
      return;
    }
    
    // Get post from Firestore
    const postDoc = await db.collection('posts').doc(postId).get();
    
    if (!postDoc.exists) {
      console.log('[GenerateStatic] Post not found:', postId);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Post not found' }));
      return;
    }
    
    const post = { id: postDoc.id, ...postDoc.data() };
    
    // Only generate static HTML for published posts
    if (post.status !== 'published') {
      console.log('[GenerateStatic] Post is not published, skipping static generation:', postId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Post is not published, static generation skipped',
        skipped: true
      }));
      return;
    }
    
    // Get storage bucket
    const bucket = getStorageBucket();
    
    // Get recent posts (excluding current post, limit to 3 most recent)
    let recentPosts = [];
    try {
      const recentPostsSnapshot = await db.collection('posts')
        .where('status', '==', 'published')
        .get();
      
      const allPublished = [];
      recentPostsSnapshot.forEach(doc => {
        if (doc.id !== postId) { // Exclude current post
          allPublished.push({ id: doc.id, ...doc.data() });
        }
      });
      
      // Sort by publishDate descending
      allPublished.sort((a, b) => {
        const dateA = a.publishDate ? (a.publishDate.toDate ? a.publishDate.toDate() : new Date(a.publishDate)) : new Date(0);
        const dateB = b.publishDate ? (b.publishDate.toDate ? b.publishDate.toDate() : new Date(b.publishDate)) : new Date(0);
        return dateB - dateA;
      });
      
      // Get top 3 most recent
      recentPosts = allPublished.slice(0, 3);
    } catch (error) {
      console.warn('[GenerateStatic] Error fetching recent posts:', error);
      // Continue without recent posts if there's an error
    }
    
    // Generate HTML
    const htmlContent = generatePostHTML(post, recentPosts);
    const filename = `${post.slug || post.id}.html`;
    
    // Upload HTML file
    console.log('[GenerateStatic] Uploading HTML file:', filename);
    const htmlUrl = await uploadHTMLToStorage(bucket, filename, htmlContent);
    console.log('[GenerateStatic] HTML uploaded:', htmlUrl);
    
    // Get all published posts for index
    // Note: This query requires a Firestore composite index on (status, publishDate)
    // If index doesn't exist, it will fail - we'll catch and use a simpler query
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
      // If composite index doesn't exist, fallback to simpler query
      console.warn('[GenerateStatic] Composite index not found, using fallback query:', indexError.message);
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
        console.error('[GenerateStatic] Error fetching published posts:', fallbackError);
        // Continue with empty array - at least the current post will be in the list
        publishedPosts = [{ id: post.id, ...post }];
      }
    }
    
    // Update posts-list.json
    console.log('[GenerateStatic] Updating posts-list.json with', publishedPosts.length, 'posts');
    const listUrl = await updatePostsList(bucket, publishedPosts);
    console.log('[GenerateStatic] posts-list.json updated:', listUrl);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      htmlUrl,
      listUrl,
      message: 'Static HTML generated and uploaded successfully'
    }));
    
  } catch (error) {
    console.error('[GenerateStatic] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to generate static HTML',
      details: error.message 
    }));
  }
}

