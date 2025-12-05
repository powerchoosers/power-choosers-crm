/**
 * Power Choosers CRM - Static Post HTML Generator
 * Generates static HTML files for posts and uploads to Firebase Storage
 * Also updates posts-list.json index file
 */

import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';
import logger from '../_logger.js';

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

  const projectId = process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm';

  // Check for _NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET first (Cloud Run env var)
  // Then FIREBASE_STORAGE_BUCKET, then default
  let storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET;

  // Remove gs:// prefix if present (Admin SDK doesn't need it)
  if (storageBucket && storageBucket.startsWith('gs://')) {
    storageBucket = storageBucket.replace('gs://', '');
  }

  // If no bucket specified, use the project's default bucket name
  // Try .firebasestorage.app first (newer format), then .appspot.com (legacy)
  if (!storageBucket || (!storageBucket.includes('.') && !storageBucket.includes('gs://'))) {
    // Try newer format first
    storageBucket = `${projectId}.firebasestorage.app`;
  }

  logger.log('[GenerateStatic] Attempting to use storage bucket:', storageBucket);
  logger.log('[GenerateStatic] Project ID:', projectId);
  logger.log('[GenerateStatic] Env vars - _NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:', process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  logger.log('[GenerateStatic] Env vars - FIREBASE_STORAGE_BUCKET:', process.env.FIREBASE_STORAGE_BUCKET);

  // Firebase Admin SDK: Use default bucket (no name) - this automatically uses the project's default bucket
  // The default bucket is created automatically when Firebase Storage is enabled
  // This avoids bucket name format issues between Firebase Storage URLs and GCS bucket names
  logger.log('[GenerateStatic] Using default bucket (no name specified - uses project default)');
  try {
    const bucket = admin.storage().bucket(); // No name = uses default bucket
    logger.log('[GenerateStatic] Default bucket retrieved successfully');
    return bucket;
  } catch (error) {
    logger.error('[GenerateStatic] Failed to get default bucket:', error);

    // Fallback: Try with explicit bucket name if env var is set
    if (storageBucket) {
      logger.log('[GenerateStatic] Trying explicit bucket name as fallback:', storageBucket);
      try {
        return admin.storage().bucket(storageBucket);
      } catch (fallbackError) {
        logger.error('[GenerateStatic] Fallback bucket also failed:', fallbackError);
      }
    }

    throw new Error(`Failed to access storage bucket. Error: ${error.message}`);
  }
}

// Generate HTML for a single post
function generatePostHTML(post, recentPosts = [], authorInfo = null) {
  const title = post.title || 'Untitled Post';
  const metaDescription = post.metaDescription || '';
  const keywords = post.keywords || '';
  const content = post.content || '';
  const tags = (keywords || '').split(',').map(tag => tag.trim()).filter(Boolean);
  const featuredImage = post.featuredImage || '';
  const publishDate = post.publishDate ?
    (post.publishDate.toDate ? post.publishDate.toDate() : new Date(post.publishDate)) :
    new Date();

  // Get storage bucket for public URLs (use .firebasestorage.app format for public URLs)
  // This is different from Admin SDK bucket name which uses .appspot.com
  let publicStorageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm'}.firebasestorage.app`;

  // Convert .appspot.com to .firebasestorage.app for public URLs
  if (publicStorageBucket.includes('.appspot.com')) {
    publicStorageBucket = publicStorageBucket.replace('.appspot.com', '.firebasestorage.app');
  }

  // Ensure we use .firebasestorage.app format for public URLs
  if (!publicStorageBucket.includes('.firebasestorage.app') && !publicStorageBucket.includes('.appspot.com')) {
    publicStorageBucket = `${process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm'}.firebasestorage.app`;
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
    <link rel="stylesheet" href="../styles/public.css">
    <style>
      /* Article */
      .article-page{max-width:1400px;margin:0 auto;padding:60px 24px}
      .article-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:32px;align-items:start}
      .article-main{min-width:0}
      .article-container{max-width:900px;margin:0;padding:0}
      .article-header{margin-bottom:32px}
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
      
      /* Author Bio Section */
      .author-bio-section{max-width:900px;margin:60px 0 0;padding:0}
      .author-bio-container{background:linear-gradient(135deg,#f8fafc 0%, #ffffff 100%);border:1px solid var(--border);border-radius:var(--radius);padding:32px;box-shadow:0 4px 12px rgba(0,0,0,.05)}
      .author-bio-content{display:flex;align-items:center;gap:24px}
      .author-avatar{flex-shrink:0}
      .author-avatar img{width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--brand-orange);box-shadow:0 4px 12px rgba(245,158,11,.2)}
      .author-info{flex:1}
      .author-name{font-size:24px;font-weight:700;margin:0 0 8px 0;color:var(--brand-blue)}
      .author-title{font-size:16px;color:var(--muted);margin:0 0 12px 0}
      .author-social{display:flex;align-items:center;gap:12px}
      .linkedin-link{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;background:var(--brand-blue);color:#ffffff;transition:all .3s ease;text-decoration:none}
      .linkedin-link:hover{background:var(--brand-orange);transform:translateY(-2px);box-shadow:0 4px 12px rgba(245,158,11,.3);text-decoration:none}
      .linkedin-link svg{width:20px;height:20px}
      
      @media (max-width: 768px){
        .author-bio-content{flex-direction:column;text-align:center}
        .author-avatar img{width:64px;height:64px}
        .author-name{font-size:20px}
        .article-title{font-size:32px}
        .article-content{font-size:16px}
        .article-content h2{font-size:24px}
        .article-content h3{font-size:20px}
      }
      
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

      /* Sidebar */
      .article-sidebar{position:sticky;top:120px;align-self:start;display:flex;flex-direction:column;gap:16px}
      .sidebar-card{background:linear-gradient(135deg,#ffffff 0%, #fafbfc 100%);border:1px solid rgba(229,231,235,.6);border-radius:var(--radius);padding:20px;box-shadow:0 4px 12px rgba(0,0,0,.05)}
      .sidebar-card h3{font-size:18px;font-weight:700;margin:0 0 10px;color:var(--brand-blue)}
      .sidebar-card p{margin:0 0 12px;color:var(--muted);line-height:1.6;font-size:14px}
      .newsletter-form{display:flex;flex-direction:column;gap:10px}
      .newsletter-form input{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:14px}
      .newsletter-form input:focus{outline:none;border-color:var(--brand-orange);box-shadow:0 0 0 3px rgba(245,158,11,.12)}
      .sidebar-list{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;list-style:none}
      .sidebar-list a{color:var(--brand-blue);font-weight:600;line-height:1.4;text-decoration:none;transition:color .2s}
      .sidebar-list a:hover{color:var(--brand-orange);text-decoration:none}
      .sidebar-tag{display:inline-flex;align-items:center;padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;font-weight:600;color:var(--brand-blue);background:rgba(11,27,69,.04);margin:4px 6px 0 0}
      .sidebar-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:8px}

      @media (max-width: 1100px){
        .article-layout{grid-template-columns:1fr}
        .article-sidebar{position:static;flex-direction:row;flex-wrap:wrap}
        .sidebar-card{flex:1 1 260px}
      }
      @media (max-width: 768px){
        .article-title{font-size:32px}
        .article-content{font-size:16px}
        .article-content h2{font-size:24px}
        .article-content h3{font-size:20px}
        .article-sidebar{flex-direction:column}
      }
    </style>
    <!-- Apollo Tracking Script -->
    <script>function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){window.trackingFunctions.onLoad({appId:"691c89270f724f000d121b65"})},document.head.appendChild(o)}initApollo();</script>
</head>
<body>
    <header class="site-header">
        <nav class="nav">
            <a href="https://powerchoosers.com/index.html" class="brand">
                <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers" />
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
                <button class="btn btn-primary" onclick="window.location.href='https://powerchoosers.com/index.html#get-started'">Contact an Expert</button>
            </div>
        </nav>
    </header>
    
    <div class="article-page">
      <div class="article-layout">
        <div class="article-main">
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
          
          ${authorInfo && (authorInfo.firstName || authorInfo.lastName) ? `
          <section class="author-bio-section">
              <div class="author-bio-container">
                  <div class="author-bio-content">
                      ${authorInfo.hostedPhotoURL || authorInfo.photoURL ? `
                      <div class="author-avatar">
                          <img src="${escapeHtml(authorInfo.hostedPhotoURL || authorInfo.photoURL)}" alt="${escapeHtml((authorInfo.firstName || '') + ' ' + (authorInfo.lastName || ''))}">
                      </div>
                      ` : ''}
                      <div class="author-info">
                          <h3 class="author-name">${escapeHtml((authorInfo.firstName || '') + ' ' + (authorInfo.lastName || ''))}</h3>
                          <p class="author-title">${escapeHtml(authorInfo.jobTitle || 'Energy Strategist')}</p>
                          ${authorInfo.bio ? `
                          <p class="author-bio-text" style="margin: 12px 0; color: var(--text); line-height: 1.6; font-size: 15px;">
                              ${escapeHtml(authorInfo.bio).replace(/\n/g, '<br>')}
                          </p>
                          ` : ''}
                          ${authorInfo.linkedIn ? `
                          <div class="author-social">
                              <a href="${escapeHtml(authorInfo.linkedIn)}" target="_blank" rel="noopener" class="linkedin-link" aria-label="LinkedIn Profile">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                  </svg>
                              </a>
                          </div>
                          ` : ''}
                      </div>
                  </div>
              </div>
          </section>
          ` : ''}
        </div>

        <aside class="article-sidebar" aria-label="Article sidebar">
          <div class="sidebar-card">
            <h3>Email Newsletter</h3>
            <p>Get weekly commercial energy insights and rate moves.</p>
            <form class="newsletter-form" action="mailto:info@powerchoosers.com" method="post" enctype="text/plain">
              <input type="email" name="email" placeholder="Work email" required>
              <button type="submit" class="btn btn-primary">Get updates</button>
            </form>
          </div>

          <div class="sidebar-card">
            <h3>Recent Posts</h3>
            ${recentPosts && recentPosts.length > 0 ? `
              <ul class="sidebar-list">
                ${recentPosts.slice(0,4).map(rp => {
                  const slug = rp.slug || rp.id;
                  const url = `https://powerchoosers.com/posts/${slug}`;
                  const titleText = rp.title || 'Untitled';
                  const cat = rp.category || '';
                  return `
                    <li>
                      <a href="${escapeHtml(url)}">${escapeHtml(titleText)}</a>
                      ${cat ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${escapeHtml(cat)}</div>` : ''}
                    </li>
                  `;
                }).join('')}
              </ul>
            ` : `<p>No recent posts yet.</p>`}
          </div>

          <div class="sidebar-card">
            <h3>Featured Resource</h3>
            <p>Estimate your TDU delivery charges and demand costs.</p>
            <a class="btn btn-outline sidebar-cta" href="https://powerchoosers.com/tdu-delivery-charges">TDU Delivery Charges</a>
          </div>

          <div class="sidebar-card">
            <h3>Categories & Tags</h3>
            <div class="tag-list">
              ${post.category ? `<span class="sidebar-tag">${escapeHtml(post.category)}</span>` : ''}
              ${tags.length ? tags.map(tag => `<span class="sidebar-tag">${escapeHtml(tag)}</span>`).join('') : '<p style="margin:6px 0 0;color:var(--muted);font-size:13px;">No tags provided</p>'}
            </div>
          </div>
        </aside>
      </div>
    </div>
    
    ${recentPosts.length > 0 ? `
    <section class="recent-posts-section">
        <h2>Recent Posts</h2>
        <div class="recent-posts-grid">
            ${recentPosts.map(recentPost => {
    const recentTitle = recentPost.title || 'Untitled';
    const recentDesc = recentPost.metaDescription || '';
    const recentImage = recentPost.featuredImage || '';
    const recentCategory = recentPost.category || '';
    // Use clean URL (powerchoosers.com/posts/slug)
    const slug = recentPost.slug || recentPost.id;
    const recentUrl = `https://powerchoosers.com/posts/${slug}`;

    // Truncate description to ~150 characters
    const preview = recentDesc.length > 150 ? recentDesc.substring(0, 150).trim() + '...' : recentDesc;

    return `
                    <a href="${escapeHtml(recentUrl)}" class="recent-post-card">
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
    
    <footer class="footer" style="background:linear-gradient(180deg,#f8fafc,#ffffff);border-top:1px solid var(--border);padding:48px 24px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;width:100%;max-width:var(--container);margin:0 auto">
            <div>
                <div class="brand" style="margin-bottom:16px">
                    <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers" style="height:40px;width:40px" />
                    <span class="brand-name">Power Choosers</span>
                </div>
                <p style="color:var(--muted);font-size:14px;margin-bottom:16px">Your trusted partner in energy procurement and management.</p>
            </div>
            <div>
                <h4 style="font-weight:700;margin-bottom:16px;font-size:16px">Company</h4>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <a href="https://powerchoosers.com/about.html" style="color:var(--muted);font-size:14px;transition:color .2s">About Us</a>
                    <a href="https://powerchoosers.com/services.html" style="color:var(--muted);font-size:14px;transition:color .2s">Services</a>
                    <a href="https://powerchoosers.com/resources.html" style="color:var(--muted);font-size:14px;transition:color .2s">Resources</a>
                    <a href="https://powerchoosers.com/schedule.html" style="color:var(--muted);font-size:14px;transition:color .2s">Schedule Consultation</a>
                    <a href="https://powerchoosers.com/index.html#testimonials" style="color:var(--muted);font-size:14px;transition:color .2s">Testimonials</a>
                </div>
            </div>
            <div>
                <h4 style="font-weight:700;margin-bottom:16px;font-size:16px">Legal</h4>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <a href="https://powerchoosers.com/index.html#privacy" style="color:var(--muted);font-size:14px;transition:color .2s">Privacy Policy</a>
                    <a href="https://powerchoosers.com/index.html#terms" style="color:var(--muted);font-size:14px;transition:color .2s">Terms of Service</a>
                </div>
            </div>
            <div>
                <h4 style="font-weight:700;margin-bottom:16px;font-size:16px">Contact</h4>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <a href="tel:+18178093367" style="color:var(--muted);font-size:14px">+1 (817) 809-3367</a>
                    <a href="mailto:info@powerchoosers.com" style="color:var(--muted);font-size:14px">info@powerchoosers.com</a>
                </div>
            </div>
        </div>
        <div style="text-align:center;padding-top:32px;border-top:1px solid var(--border);margin-top:32px;color:var(--muted);font-size:14px;width:100%;max-width:var(--container);margin-left:auto;margin-right:auto">
            © ${new Date().getFullYear()} Power Choosers. All rights reserved.
        </div>
    </footer>
    
    <script>
        // Initialize scroll animations for page-specific elements
        document.addEventListener('DOMContentLoaded', () => {
            const elements = document.querySelectorAll('.article-header > *, .article-featured-image, .article-content > *, .author-bio-container, .recent-post-card');
            elements.forEach(el => el.classList.add('animate-on-scroll'));
        });
    </script>
    <script src="../scripts/public.js"></script>
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
  try {
    logger.log('[GenerateStatic] Uploading to bucket:', bucket.name);
    const file = bucket.file(`posts/${filename}`);
    logger.log('[GenerateStatic] File path: posts/' + filename);

    // With uniform bucket-level access and domain-restricted sharing, we can't use public IAM
    // Use signed URLs with long expiration instead (10 years = effectively permanent)
    await file.save(htmlContent, {
      metadata: {
        contentType: 'text/html',
        cacheControl: 'public, max-age=3600',
      },
    });

    logger.log('[GenerateStatic] File saved successfully');

    // Generate signed URL with 10-year expiration (effectively permanent for blog posts)
    // This works even with domain-restricted sharing policies
    const expiresIn = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years in milliseconds
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn,
    });

    logger.log('[GenerateStatic] Signed URL generated (expires in 10 years)');

    return signedUrl;
  } catch (error) {
    logger.error('[GenerateStatic] Error uploading HTML file:', error);
    logger.error('[GenerateStatic] Bucket name:', bucket.name);
    logger.error('[GenerateStatic] Error code:', error.code);
    logger.error('[GenerateStatic] Error message:', error.message);

    // If bucket doesn't exist, provide helpful error
    if (error.code === 404 || error.message.includes('does not exist')) {
      throw new Error(`Storage bucket "${bucket.name}" does not exist. Please check your Firebase Storage bucket name in the Firebase Console.`);
    }

    throw error;
  }
}

// Update posts-list.json in Firebase Storage
async function updatePostsList(bucket, posts) {
  // Always create/update posts-list.json, even if empty
  // Use clean URLs (powerchoosers.com/posts/slug) instead of signed URLs
  const postsWithUrls = posts.map((post) => {
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

  const listData = {
    posts: postsWithUrls,
    lastUpdated: new Date().toISOString()
  };

  try {
    logger.log('[GenerateStatic] Updating posts-list.json in bucket:', bucket.name);
    const file = bucket.file('posts-list.json');

    // With uniform bucket-level access and domain-restricted sharing, we can't use public IAM
    // Use signed URLs with long expiration instead (10 years = effectively permanent)
    await file.save(JSON.stringify(listData, null, 2), {
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=300',
      },
    });

    logger.log('[GenerateStatic] posts-list.json saved successfully');

    // Generate signed URL with 10-year expiration (effectively permanent)
    // This works even with domain-restricted sharing policies
    const expiresIn = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years in milliseconds
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn,
    });

    logger.log('[GenerateStatic] posts-list.json created/updated with', posts.length, 'posts');
    logger.log('[GenerateStatic] posts-list.json signed URL generated (expires in 10 years)');

    return signedUrl;
  } catch (error) {
    logger.error('[GenerateStatic] Error updating posts-list.json:', error);
    logger.error('[GenerateStatic] Bucket name:', bucket.name);
    logger.error('[GenerateStatic] Error code:', error.code);
    logger.error('[GenerateStatic] Error message:', error.message);

    // If bucket doesn't exist, provide helpful error
    if (error.code === 404 || error.message.includes('does not exist')) {
      throw new Error(`Storage bucket "${bucket.name}" does not exist. Please verify the bucket exists in Firebase Console → Storage.`);
    }

    throw error;
  }
}

export default async function handler(req, res) {
  logger.log('[GenerateStatic] Request received:', req.method);

  if (cors(req, res)) {
    logger.log('[GenerateStatic] CORS preflight handled');
    return;
  }

  if (req.method !== 'POST') {
    logger.log('[GenerateStatic] Invalid method:', req.method);
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { postId, regenerateList } = req.body || {};

    // If regenerateList is true, just update posts-list.json without generating HTML
    if (regenerateList) {
      let bucket;
      try {
        bucket = getStorageBucket();
        logger.log('[GenerateStatic] Bucket retrieved successfully for list regeneration');
      } catch (bucketError) {
        logger.error('[GenerateStatic] Failed to get storage bucket:', bucketError);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to access Firebase Storage',
          details: bucketError.message
        }));
        return;
      }

      // Get all published posts
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
        logger.warn('[GenerateStatic] Composite index not found, using fallback query:', indexError.message);
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
            return dateB - dateA;
          });
        } catch (fallbackError) {
          logger.error('[GenerateStatic] Error fetching published posts:', fallbackError);
          publishedPosts = [];
        }
      }

      // Update posts-list.json
      const listUrl = await updatePostsList(bucket, publishedPosts);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        listUrl,
        message: 'Posts list regenerated successfully'
      }));
      return;
    }

    if (!postId) {
      logger.log('[GenerateStatic] No postId provided');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'postId is required' }));
      return;
    }

    if (!db) {
      logger.error('[GenerateStatic] Firestore not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not available' }));
      return;
    }

    // Get post from Firestore
    const postDoc = await db.collection('posts').doc(postId).get();

    if (!postDoc.exists) {
      logger.log('[GenerateStatic] Post not found:', postId);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Post not found' }));
      return;
    }

    const post = { id: postDoc.id, ...postDoc.data() };

    // Only generate static HTML for published posts
    if (post.status !== 'published') {
      logger.log('[GenerateStatic] Post is not published, skipping static generation:', postId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Post is not published, static generation skipped',
        skipped: true
      }));
      return;
    }

    // Get storage bucket
    let bucket;
    try {
      bucket = getStorageBucket();
      logger.log('[GenerateStatic] Bucket retrieved successfully');
    } catch (bucketError) {
      logger.error('[GenerateStatic] Failed to get storage bucket:', bucketError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to access Firebase Storage',
        details: bucketError.message
      }));
      return;
    }

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
      const recentPostsData = allPublished.slice(0, 3);

      // Use clean URLs for recent posts (powerchoosers.com/posts/slug)
      recentPosts = recentPostsData.map((rp) => {
        const slug = rp.slug || rp.id;
        const cleanUrl = `https://powerchoosers.com/posts/${slug}`;
        return {
          ...rp,
          signedUrl: cleanUrl // Use clean URL instead of signed URL
        };
      });
    } catch (error) {
      logger.warn('[GenerateStatic] Error fetching recent posts:', error);
      // Continue without recent posts if there's an error
      recentPosts = [];
    }

    // Fetch author info from settings
    let authorInfo = null;
    try {
      // Try to get settings - admin uses 'user-settings', employees use 'user-settings-{email}'
      // For blog posts, we'll use admin settings (user-settings) as default
      const settingsDoc = await db.collection('settings').doc('user-settings').get();

      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        const general = settings.general || {};

        // Only include author info if we have at least a first or last name
        if (general.firstName || general.lastName) {
          authorInfo = {
            firstName: general.firstName || '',
            lastName: general.lastName || '',
            jobTitle: general.jobTitle || '',
            hostedPhotoURL: general.hostedPhotoURL || '',
            photoURL: general.photoURL || '',
            linkedIn: general.linkedIn || '',
            bio: general.bio || ''
          };
        }
      }
    } catch (settingsError) {
      logger.warn('[GenerateStatic] Could not fetch author info from settings:', settingsError.message);
      // Continue without author info if settings fetch fails
    }

    // Generate HTML
    const htmlContent = generatePostHTML(post, recentPosts, authorInfo);
    const filename = `${post.slug || post.id}.html`;

    // Upload HTML file
    logger.log('[GenerateStatic] Uploading HTML file:', filename);
    const htmlUrl = await uploadHTMLToStorage(bucket, filename, htmlContent);
    logger.log('[GenerateStatic] HTML uploaded:', htmlUrl);

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
      logger.warn('[GenerateStatic] Composite index not found, using fallback query:', indexError.message);
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
        logger.error('[GenerateStatic] Error fetching published posts:', fallbackError);
        // Continue with empty array - at least the current post will be in the list
        publishedPosts = [{ id: post.id, ...post }];
      }
    }

    // Update posts-list.json
    logger.log('[GenerateStatic] Updating posts-list.json with', publishedPosts.length, 'posts');
    const listUrl = await updatePostsList(bucket, publishedPosts);
    logger.log('[GenerateStatic] posts-list.json updated:', listUrl);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      htmlUrl,
      listUrl,
      message: 'Static HTML generated and uploaded successfully'
    }));

  } catch (error) {
    logger.error('[GenerateStatic] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to generate static HTML',
      details: error.message
    }));
  }
}

