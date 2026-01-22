# SEO Blog Posting Machine - Development Guide

This guide helps developers understand and modify the AI-powered blog post generation system in the Power Choosers CRM.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [AI Generation Flow](#ai-generation-flow)
5. [Modifying AI Prompts](#modifying-ai-prompts)
6. [Adding/Modifying Fields](#addingmodifying-fields)
7. [Skeleton Animations](#skeleton-animations)
8. [API Endpoints](#api-endpoints)
9. [SEO Guidelines Integration](#seo-guidelines-integration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The SEO Blog Posting Machine allows admins to generate complete blog posts with a single click. It uses Perplexity Sonar API to generate:
- Post title (with primary keyword in first 60 chars)
- URL slug (auto-generated from title)
- Category
- Meta description (150-160 chars)
- Keywords (3-5 comma-separated)
- Full HTML content (with H2, H3, paragraphs, image suggestions)

The system includes:
- Skeleton loading animations during generation
- Orange glow effect on modal during AI processing
- Context-aware generation (avoids duplicating existing posts)
- SEO-optimized output based on `SEO.md` guidelines
- Author bio section at bottom of generated posts (from settings)
- Author column in news table for post management

---

## Architecture

```
User clicks "AI Generate" button
    ↓
Frontend: post-editor.js
    - Shows skeleton animations
    - Adds orange glow to modal
    ↓
API Call: /api/posts/generate-ai
    ↓
Backend: api/posts/generate-ai.js
    - Fetches existing posts from Firestore
    - Builds context to avoid duplicates
    - Calls Perplexity Sonar API
    - Parses and validates response
    ↓
Returns structured JSON
    ↓
Frontend: post-editor.js
    - Removes skeletons
    - Populates all form fields
    - Shows success toast
```

---

## File Structure

### Frontend Files

**`crm-dashboard.html`** (lines ~3054-3056)
- Contains the modal HTML structure
- AI Generate button in `.pc-modal__header`
- Button ID: `ai-generate-post-btn`

**`scripts/pages/post-editor.js`**
- Main post editor logic
- AI generation functions:
  - `generateWithAI(els)` - Main generation function
  - `startGeneratingAnimation(els)` - Shows skeletons
  - `stopGeneratingAnimation(els)` - Removes skeletons
  - `createSkeletonInField(field, type)` - Creates skeleton overlay
  - `removeSkeletonFromField(field)` - Removes skeleton overlay

**`scripts/pages/news.js`**
- News list page for managing posts
- Fetches author info from settings on page load
- Displays author name in table column
- Post title links styled to match accounts/people pages (no underline, subtle hover)

**`styles/main.css`**
- Skeleton animation styles (`.post-skeleton-bar`, `.post-field-skeleton-container`)
- Orange glow effect (`.pc-modal.ai-generating`)
- AI button styling (`.ai-generate-post-btn`)
- Post title link styling (`#news-table .post-link`) - matches accounts/people hover styles
- Author bio section styles (`.author-bio-section`, `.author-avatar`, `.author-info`)

### Backend Files

**`api/posts/generate-ai.js`**
- Main API endpoint handler
- Functions:
  - `buildUserPrompt(existingPosts)` - Builds prompt with context
  - `parseAIResponse(responseText)` - Parses Perplexity response
  - `parseFallback(text)` - Fallback parser if JSON fails

**`api/posts/generate-static.js`**
- Generates static HTML files for published posts
- Fetches author info from `settings/user-settings` collection
- Includes author bio section with:
  - Profile picture (from `hostedPhotoURL` or `photoURL`)
  - First and last name
  - Job title
  - LinkedIn profile link (if available)
- Uploads HTML to Firebase Storage
- Uses clean URLs: `powerchoosers.com/posts/slug` (no signed URLs)
- Recent posts section links use clean URLs
- Updates `posts-list.json` with clean URLs

**`server.js`**
- Route handler: `/api/posts/generate-ai`
- Wrapper function: `handleApiGenerateAiPost(req, res)`
- Blog post route handler: `/posts/:slug`
  - Fetches HTML from Firebase Storage: `posts/{slug}.html`
  - Serves with proper headers and caching
  - Returns 404 if post doesn't exist
- Sitemap route handler: `/sitemap.xml`
  - Dynamically generates sitemap including all published blog posts
  - Includes static pages and blog posts with proper lastmod dates

### Reference Files

**`SEO.md`**
- SEO guidelines and best practices
- Keyword strategies
- Content structure requirements
- Referenced in AI system prompt

**`api/perplexity-email.js`**
- Reference implementation for Perplexity API calls
- Shows how to structure API requests

**`api/posts/list.js`**
- Returns list of published posts with clean URLs
- Used by `resources.html` to display blog posts
- Returns URLs in format: `powerchoosers.com/posts/slug`

**`api/sitemap.js`**
- Dynamically generates sitemap.xml
- Includes static pages and all published blog posts
- Updates automatically when posts are published

---

## Blog Post Hosting & URLs

### Hosting Architecture

Blog posts are hosted on `powerchoosers.com` using a Google Cloud Application Load Balancer that routes traffic to Cloud Run:

```
User → powerchoosers.com/posts/slug
    ↓
Application Load Balancer (HTTPS, SSL termination)
    ↓
Cloud Run Service (server.js)
    ↓
Firebase Storage (posts/{slug}.html)
```

### URL Structure

**Published Posts:**
- Format: `https://powerchoosers.com/posts/{slug}`
- Example: `https://powerchoosers.com/posts/commercial-electricity-rates-2025`
- No signed URLs - clean, SEO-friendly URLs
- No expiration dates - permanent URLs

**Static Pages:**
- Home: `https://powerchoosers.com/` (serves `index.html`)
- Resources: `https://powerchoosers.com/resources.html`
- Other static pages served directly from Cloud Run

### How It Works

1. **Post Generation:**
   - When a post is published, `generate-static.js` creates HTML file
   - Uploads to Firebase Storage: `posts/{slug}.html`
   - Uses clean URLs in HTML content (no signed URLs)
   - Updates `posts-list.json` with clean URLs

2. **Post Serving:**
   - User visits `powerchoosers.com/posts/slug`
   - Load balancer routes to Cloud Run
   - `server.js` handles `/posts/:slug` route
   - Fetches HTML from Firebase Storage
   - Serves with proper headers and caching
   - **Cache Control:** Posts cached for 5 minutes with `must-revalidate` for faster updates
   - **ETag Support:** Uses file metadata ETag for efficient cache validation
   - **Updates:** When posts are updated in CRM, static HTML is regenerated and cache is invalidated

3. **Sitemap:**
   - Auto-generated at `powerchoosers.com/sitemap.xml`
   - Includes all published blog posts
   - Updates automatically when posts are published
   - Includes static pages and proper lastmod dates

### URL Generation

**In Generated HTML:**
- Recent posts links: `powerchoosers.com/posts/slug`
- Internal links: Use clean URLs throughout
- No signed URLs in any generated content

**In API Responses:**
- `/api/posts/list` returns clean URLs
- `/api/posts/generate-static` returns clean URL in response
- All URLs use `powerchoosers.com` domain

### Benefits

- ✅ **SEO-Friendly:** Clean URLs without query parameters
- ✅ **Permanent:** No expiration dates
- ✅ **Fast:** Served through Cloud CDN (cached at edge)
- ✅ **Secure:** HTTPS with Google-managed SSL certificate
- ✅ **Scalable:** Load balancer handles traffic distribution

---

## AI Generation Flow

### 1. User Clicks "AI Generate" Button

**Location:** `scripts/pages/post-editor.js` (line ~1214)

```javascript
if (els.aiGenerateBtn) {
  els.aiGenerateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    generateWithAI(els);
  });
}
```

### 2. Animation Starts

**Function:** `startGeneratingAnimation(els)`

- Adds `ai-generating` class to modal (orange glow)
- Creates skeleton overlays on all input fields:
  - Title input
  - Slug input
  - Category select
  - Meta description textarea
  - Keywords input
  - Content editor

### 3. API Call

**Function:** `generateWithAI(els)`

**Endpoint:** `/api/posts/generate-ai`

**Request:**
```javascript
POST /api/posts/generate-ai
Headers: { 'Content-Type': 'application/json' }
Body: {} // No body needed - context comes from Firestore
```

### 4. Backend Processing

**File:** `api/posts/generate-ai.js`

**Steps:**
1. Fetch existing posts from Firestore (last 50)
2. Extract metadata (title, category, keywords, metaDescription)
3. Build user prompt with context
4. Call Perplexity Sonar API with system prompt
5. Parse JSON response
6. Validate and clean fields
7. Return structured data

### 5. Response Format

```json
{
  "success": true,
  "post": {
    "title": "Commercial Electricity Rates 2025: When to Lock In a Fixed Contract",
    "slug": "commercial-electricity-rates-2025",
    "category": "Market Update",
    "metaDescription": "Worried about rising energy costs? Discover the 2025 forecast for commercial electricity rates in Texas and how to secure a low fixed rate today.",
    "keywords": "commercial electricity, energy rates, business energy, Texas power rates, energy procurement",
    "content": "<h2>Introduction</h2><p>...</p><h3>Section 1</h3><p>...</p>"
  }
}
```

### 6. Field Population

**Function:** `generateWithAI(els)` (after API response)

- Waits 350ms for skeleton fade-out
- Populates each field with generated data
- Triggers slug auto-generation from title
- Inserts HTML content into editor
- Shows success toast

---

## Modifying AI Prompts

### System Prompt

**Location:** `api/posts/generate-ai.js` (line ~15)

**Current Prompt:**
```javascript
const SYSTEM_PROMPT = `You are Lewis Patterson, Lead Energy Strategist at Power Choosers, with 15+ years of commercial energy procurement experience.

CRITICAL TERMINOLOGY & GEOGRAPHIC FOCUS:
- For TEXAS-focused content (60% of posts): Use "demand charges" NOT "capacity charges". Include Texas context, ERCOT references, TDU charges, and Texas business energy concerns.
- For NATIONAL content (40% of posts): Use "capacity charges" for markets like PJM, ISO-NE, MISO where capacity is procured separately.
- PRODUCT NEUTRALITY: We offer BOTH Fixed and Index plans. Do NOT advise users to universally switch away from Index plans. Instead, explain that Index plans can be beneficial for certain load profiles (e.g., high load factor, ability to curtail) while Fixed plans offer budget certainty. Frame the choice as "Strategic Fit" rather than "Good vs. Bad".

CRITICAL INSTRUCTION: Every post MUST start with a "Hook" that follows one of these proven formulas:
1. THE SHOCKING STAT
2. THE INSIDER ALERT
3. THE CONTRARIAN TAKE
4. THE TIME BOMB
5. THE BEFORE/AFTER

POST STRUCTURE REQUIREMENTS:
1. HOOK (First 1-2 sentences)
2. THE PROMISE (Next 1-2 sentences)
3. H2: Introduction
4. H3: Section 1-3 with specific data points
5. H2: "Analyst Take" or "Broker's Take" (Your OPINION)
6. H2: Resource Bridge (Link to /resources with specific tool)
7. H2: Conclusion

STYLE RULES:
- NO FLUFF: Delete generic phrases
- SHORT PARAGRAPHS: Maximum 3 sentences
- BULLET POINTS: Use for lists of 3+ items
- BOLD KEY STATS: Wrap important numbers in <strong> tags

Return your response as a JSON object with these exact fields:
{
  "title": "...",
  "category": "...",
  "contentType": "educational | soft-sell | hard-sell",
  "metaDescription": "...",
  "keywords": "...",
  "content": "..."
}`;
```

**To Modify:**
- Edit the `SYSTEM_PROMPT` constant
- Adjust tone, structure requirements, or output format
- Update JSON schema if adding new fields

### User Prompt (Topic Selection)

**Location:** `api/posts/generate-ai.js` - `buildUserPrompt()` function

**Topic Categories:**
```javascript
const educationalTopics = [
  // TEXAS-FOCUSED (60%):
  'Summarize the latest EIA Weekly Natural Gas Storage Report and explain its impact on Texas commercial electricity futures for Q1 2025',
  'Write a news update on the latest ERCOT grid weather alerts and advise Texas businesses on demand response strategies',
  'Discuss rising demand charges in Texas and how commercial facilities can optimize their load profiles',
  
  // NATIONAL (40%):
  'Analyze the most recent EIA Short-Term Energy Outlook and what it means for business energy procurement nationwide',
  'Explain capacity charges (PJM, ISO-NE, MISO markets) and their impact on commercial energy costs'
];

const softSellTopics = [
  // TEXAS-FOCUSED (60%):
  'Write a case study showing how a Texas manufacturing facility saved money by optimizing demand charges while on a strategic Index electricity plan',
  'Create an educational guide: "How to Read Your Texas Commercial Energy Bill" with explanations of demand charges',
  
  // NATIONAL (40%):
  'Write a case study comparing Fixed vs. Index energy contracts for a manufacturing facility, highlighting how the right choice depends on risk tolerance',
  'Explain the pros and cons of Fixed-All-Inclusive vs. Index products, emphasizing that we offer both solutions to match their risk profile'
];

const hardSellTopics = [
  // TEXAS-FOCUSED (60%):
  'Write a post: "Texas Electricity Rates at 12-Month Low: Secure Your Ideal Texas Electricity Plan (Fixed or Index) Now Before Summer Volatility"',
  
  // NATIONAL (40%):
  'Write a post: "Commercial Electricity Rates at 12-Month Low: Review Your Contract Options (Fixed vs. Index) Now Before Prices Rise"'
];
```

**Key Changes:**
- Added "PRODUCT NEUTRALITY" instruction to avoid pushing users away from Index plans
- Updated case study topics to show Index plans as a strategic choice, not just a problem
- Reframed comparison topics to emphasize "Strategic Fit" over "Good vs. Bad"
- Hard-sell topics now present both Fixed and Index as options

**To Add New Topics:**
1. Add new topic strings to appropriate array (educational, soft-sell, or hard-sell)
2. Maintain 60% Texas-focused, 40% National ratio
3. Ensure topics remain neutral about Index vs. Fixed plans
4. Topics are randomly selected based on content type strategy (4-1-1 ratio)
5. Ensure topics align with SEO.md keyword strategy

**To Modify Context Building:**
- Edit `buildUserPrompt(existingPosts)` function
- Adjust how existing posts metadata is formatted
- Change the "avoid duplicates" instructions

---

## Adding/Modifying Fields

### Adding a New Field to Generation

**Step 1: Update System Prompt**

In `api/posts/generate-ai.js`, add field to JSON schema:

```javascript
const SYSTEM_PROMPT = `...
Return your response as a JSON object with these exact fields:
{
  "title": "...",
  "category": "...",
  "metaDescription": "...",
  "keywords": "...",
  "newField": "...",  // Add here
  "content": "..."
}`;
```

**Step 2: Update Parser**

In `parseAIResponse()` function, extract new field:

```javascript
const parsed = JSON.parse(jsonText);
const newField = String(parsed.newField || '').trim();
return {
  // ... existing fields
  newField
};
```

**Step 3: Add to Frontend**

In `scripts/pages/post-editor.js`:

1. Add to `initDomRefs()`:
```javascript
newFieldInput: document.getElementById('post-new-field'),
```

2. Add skeleton in `startGeneratingAnimation()`:
```javascript
if (els.newFieldInput) createSkeletonInField(els.newFieldInput, 'newField');
```

3. Add removal in `stopGeneratingAnimation()`:
```javascript
if (els.newFieldInput) removeSkeletonFromField(els.newFieldInput);
```

4. Populate in `generateWithAI()`:
```javascript
if (post.newField && els.newFieldInput) {
  els.newFieldInput.value = post.newField;
}
```

**Step 4: Add Skeleton Type**

In `createSkeletonInField()`, add case:
```javascript
} else if (type === 'newField') {
  skeletonHTML = `
    <div class="post-skeleton-bar post-skeleton-medium"></div>
  `;
}
```

### Modifying Existing Fields

**Title Field:**
- Validation: First 60 chars must contain primary keyword
- Auto-generates slug on input event
- Location: `post-editor.js` - `setupSlugGeneration()`

**Slug Field:**
- Auto-generated from title (lowercase, hyphenated)
- Can be manually edited
- Location: `post-editor.js` - `generateSlug()`

**Category Field:**
- Options: News, Market Update, Energy Tips, Case Study, Industry Analysis
- To add options: Update `<select>` in `crm-dashboard.html`
- Update system prompt to include new categories

**Content Field:**
- Rich text editor with formatting toolbar
- Supports H2, H3, paragraphs, links, images
- Image suggestions as HTML comments: `<!-- [IMAGE: description] -->`
- Location: `post-editor.js` - `setupRichTextEditor()`

---

## Skeleton Animations

### How It Works

Skeletons are **overlays** that appear on top of input fields during generation. They don't hide or clear the field content.

### Skeleton Types

**Location:** `scripts/pages/post-editor.js` - `createSkeletonInField()`

```javascript
'title' or 'slug': 2 bars (short + medium)
'category': 1 bar (short)
'meta': 3 bars (medium + wide + medium)
'keywords': 1 bar (medium)
'content': 5 bars (wide + medium + wide + medium + wide)
```

### Adding New Skeleton Type

1. Add case in `createSkeletonInField()`:
```javascript
} else if (type === 'newType') {
  skeletonHTML = `
    <div class="post-skeleton-bar post-skeleton-short"></div>
    <div class="post-skeleton-bar post-skeleton-medium"></div>
  `;
}
```

2. Skeleton bars use CSS classes:
- `.post-skeleton-short` (40% width)
- `.post-skeleton-medium` (65% width)
- `.post-skeleton-wide` (90% width)

### Animation Timing

- **Fade-in:** 50ms delay, staggered by 0.15s per bar
- **Fade-out:** 300ms transition
- **Field population:** 350ms after fade-out starts

### CSS Customization

**Location:** `styles/main.css`

**Skeleton bar colors:**
```css
.post-skeleton-bar {
    background: linear-gradient(90deg,
        rgba(245, 158, 11, 0.3) 25%,
        rgba(245, 158, 11, 0.6) 50%,
        rgba(245, 158, 11, 0.3) 75%);
}
```

**Orange glow:**
```css
.pc-modal.ai-generating .pc-modal__dialog {
    box-shadow: 0 0 20px rgba(245, 158, 11, 0.5), ...;
    animation: post-ai-glow 2s ease-in-out infinite alternate;
}
```

---

## API Endpoints

### POST /api/posts/generate-ai

**Handler:** `api/posts/generate-ai.js`

**Request:**
- Method: POST
- Headers: `Content-Type: application/json`
- Body: Empty (context comes from Firestore)

**Response:**
```json
{
  "success": true,
  "post": {
    "title": "...",
    "slug": "...",
    "category": "...",
    "metaDescription": "...",
    "keywords": "...",
    "content": "..."
  }
}
```

**Error Response:**
```json
{
  "error": "Failed to generate post",
  "details": "Error message"
}
```

### Environment Variables Required

- `PERPLEXITY_API_KEY` - Perplexity API key for Sonar model
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key

### Firestore Collections Used

- `posts` - Fetches existing posts for context (last 50)
  - Fields read: `title`, `category`, `keywords`, `metaDescription`
- `settings` - Fetches author info for static HTML generation and news table
  - Document: `user-settings` (admin settings)
  - Fields read: `general.firstName`, `general.lastName`, `general.jobTitle`, `general.hostedPhotoURL`, `general.photoURL`, `general.linkedIn`

### Firebase Storage Used

- `posts/{slug}.html` - Static HTML files for published posts
- `posts/posts-list.json` - Index of all published posts with metadata and clean URLs

---

## SEO Guidelines Integration

### SEO.md Reference

The system prompt and topic selection are based on `SEO.md` guidelines:

**Title Format:** `[Primary Keyword] + [Benefit/Hook] + [Year]`
- Example: "Commercial Electricity Rates 2025: When to Lock In a Fixed Contract"
- First 60 characters must contain primary keyword

**Slug Format:** Lowercase, hyphenated, no stop words
- Example: `commercial-electricity-rates-2025`

**Meta Description:** 150-160 characters
- Format: `[Question/Pain Point]? [Solution/Keyword]. [Call to Action].`

**Keywords:** 3-5 terms, mix broad + specific
- Example: "commercial electricity, energy rates, business energy, Texas power rates"

**Content Structure:**
- H2 for introduction
- 3+ H3 sections for body
- Paragraphs with proper spacing
- Image suggestions as HTML comments

### Keyword Strategy

**Tier 1 (High Intent):**
- Commercial electricity rates [State]
- Business energy broker reviews
- Corporate PPA 2025
- Industrial power procurement strategy

**Tier 2 (Informational):**
- Energy market forecast 2025
- Rising demand charges explanation
- ERCOT grid reliability updates
- B2B energy contract renewal tips

**To Update Keywords:**
1. Edit `SEO.md` with new keyword tiers
2. Update system prompt in `api/posts/generate-ai.js` to reference new keywords
3. Add keyword examples to user prompt topics

---

## Troubleshooting

### Issue: 404 Error on `/api/posts/generate-ai`

**Cause:** Server route handler missing

**Fix:**
1. Check `server.js` has import: `import generateAiPostHandler from './api/posts/generate-ai.js';`
2. Check route handler exists: `if (pathname === '/api/posts/generate-ai')`
3. Check wrapper function exists: `handleApiGenerateAiPost(req, res)`

### Issue: Modal Disappears During Generation

**Cause:** Skeleton creation clearing field content

**Fix:**
- Ensure `createSkeletonInField()` doesn't clear `field.value` or `field.innerHTML`
- Skeletons should be overlays, not replacements
- Check `field.style.color` is not set to 'transparent'

### Issue: AI Returns Invalid JSON

**Cause:** Perplexity response not in expected format

**Fix:**
1. Check `parseAIResponse()` fallback parser
2. Add logging: `console.log('[AI] Raw response:', responseText);`
3. Update system prompt to be more explicit about JSON format
4. Consider adding response validation

### Issue: Generated Content Missing H2/H3

**Cause:** AI not following structure requirements

**Fix:**
1. Strengthen system prompt with examples
2. Add validation in `parseAIResponse()` to check for H2/H3
3. Add fallback HTML generation if structure missing

### Issue: Duplicate Posts Generated

**Cause:** Context not being passed correctly

**Fix:**
1. Check Firestore query in `api/posts/generate-ai.js`
2. Verify `buildUserPrompt()` includes existing posts metadata
3. Add more explicit "avoid duplicates" instructions
4. Check existing posts are being fetched (log count)

### Issue: Skeleton Animations Not Showing

**Cause:** CSS or JavaScript timing issue

**Fix:**
1. Check `.post-skeleton-bar` styles in `main.css`
2. Verify `skeleton-animate` class is added
3. Check animation delay timing (50ms + staggered)
4. Verify skeleton container is positioned correctly (absolute)

### Issue: Orange Glow Not Appearing

**Cause:** CSS class not being added

**Fix:**
1. Check `startGeneratingAnimation()` adds `ai-generating` class to modal
2. Verify CSS selector: `.pc-modal.ai-generating .pc-modal__dialog`
3. Check animation keyframes: `@keyframes post-ai-glow`

### Issue: Button Not Visible (White on Orange)

**Cause:** Text/icon color not set correctly

**Fix:**
1. Check `.ai-generate-post-btn` has `color: #fff;`
2. Verify SVG `fill="white"` attribute
3. Check button background is `var(--orange-primary)`

---

## Testing Checklist

Before deploying changes:

- [ ] AI Generate button visible and clickable
- [ ] Skeleton animations appear on all fields
- [ ] Orange glow appears on modal
- [ ] API call succeeds (check Network tab)
- [ ] All fields populate correctly
- [ ] Generated content has proper HTML structure (H2, H3)
- [ ] Slug auto-generates from title
- [ ] No duplicate posts generated (check existing posts)
- [ ] Error handling works (test with invalid API key)
- [ ] Modal stays visible during generation
- [ ] Button re-enables after completion/error

---

## Future Enhancements

### Potential Improvements

1. **Topic Selection UI**
   - Let user choose topic before generation
   - Show trending topics as buttons

2. **Regeneration**
   - "Regenerate" button to try different output
   - Keep same topic, generate new content

3. **Field-Level Generation**
   - Generate individual fields (title only, content only)
   - Useful for refining specific sections

4. **Template System**
   - Pre-defined content templates
   - Industry-specific templates (Manufacturing, Healthcare, etc.)

5. **Content Preview**
   - Show preview of generated content before populating
   - Allow editing before accepting

6. **Image Suggestions**
   - Parse HTML comments for image suggestions
   - Auto-upload placeholder images
   - Suggest stock images based on content

7. **SEO Score**
   - Calculate SEO score for generated content
   - Show suggestions for improvement
   - Validate against SEO.md guidelines

---

## Code Examples

### Adding a New Field: "Author"

**1. Update System Prompt:**
```javascript
const SYSTEM_PROMPT = `...
{
  "title": "...",
  "author": "Author Name",  // Add this
  ...
}`;
```

**2. Update Parser:**
```javascript
const author = String(parsed.author || '').trim();
return {
  // ... existing
  author
};
```

**3. Update Frontend:**
```javascript
// In initDomRefs()
authorInput: document.getElementById('post-author'),

// In startGeneratingAnimation()
if (els.authorInput) createSkeletonInField(els.authorInput, 'author');

// In stopGeneratingAnimation()
if (els.authorInput) removeSkeletonFromField(els.authorInput);

// In generateWithAI()
if (post.author && els.authorInput) {
  els.authorInput.value = post.author;
}

// In createSkeletonInField()
} else if (type === 'author') {
  skeletonHTML = `<div class="post-skeleton-bar post-skeleton-medium"></div>`;
}
```

### Modifying Topic Selection

**Add Industry-Specific Topics:**
```javascript
const trendingTopics = [
  // Existing topics...
  
  // Manufacturing-specific
  'Explain how manufacturing facilities can optimize energy costs during peak production seasons',
  
  // Healthcare-specific
  'Discuss energy procurement strategies for multi-facility healthcare systems',
  
  // Hospitality-specific
  'Analyze seasonal energy demand patterns for hotels and resorts',
];
```

### Customizing Skeleton Appearance

**Change Colors:**
```css
.post-skeleton-bar {
    background: linear-gradient(90deg,
        rgba(59, 130, 246, 0.3) 25%,  /* Blue instead of orange */
        rgba(59, 130, 246, 0.6) 50%,
        rgba(59, 130, 246, 0.3) 75%);
}
```

**Change Animation Speed:**
```css
.post-skeleton-bar.skeleton-animate {
    animation: skeleton-loading 2s ease-in-out infinite; /* Slower: 2s */
}
```

---

## Author Information

### Author Bio in Generated Posts

When a post is published, the static HTML includes an author bio section at the bottom with the following structure (displayed in order):

1. **Profile picture** (from settings `hostedPhotoURL` or `photoURL`) - optional
2. **Author name** - First and last name from `general.firstName` and `general.lastName`
3. **Job title** - Always displayed below the author name, from `general.jobTitle` (defaults to "Energy Strategist" if not set)
4. **LinkedIn profile link** - Clickable LinkedIn icon (if `linkedIn` field is set in settings) - optional

**Location:** `api/posts/generate-static.js` (lines ~295-320 for HTML template, lines ~735-761 for data fetching)

**Settings Location:** `settings/user-settings` document, `general` object

**Fields Required:**
- `general.firstName` - Author's first name (required for author bio to display)
- `general.lastName` - Author's last name (required for author bio to display)
- `general.jobTitle` - Author's job title (always displayed, defaults to "Energy Strategist" if empty)
- `general.hostedPhotoURL` or `general.photoURL` - Profile picture URL (optional)
- `general.linkedIn` - LinkedIn profile URL (optional)

**Display Order:**
```
Author Name (h3)
↓
Job Title (p) - Always shown
↓
LinkedIn Link (if available)
```

### Author Column in News Table

The news list page (`scripts/pages/news.js`) displays the author's name in a dedicated column.

**How It Works:**
1. On page load, `reloadData()` fetches author info from `settings/user-settings`
2. Author info is stored in `state.authorInfo`
3. `rowHtml()` displays `${firstName} ${lastName}` in the Author column
4. If no author info is available, displays "—"

**Table Column Order:**
1. Select checkbox
2. Title (clickable link, styled like accounts/people pages)
3. Category
4. Status
5. **Author** (new column)
6. Slug
7. Publish Date
8. Updated
9. Quick Actions

### Post Title Link Styling

Post title links in the news table match the hover styles from accounts and people pages:
- Base color: `var(--grey-400)`
- Font weight: `400`
- No underline
- Hover: `var(--text-inverse)` color, no underline
- Smooth transition

**CSS Location:** `styles/main.css` - `#news-table .post-link`

### Adding LinkedIn to Settings

LinkedIn field was added to general settings:
- **Location:** `scripts/pages/settings.js`
- **Field ID:** `user-linkedin`
- **Storage:** `settings/user-settings.general.linkedIn`
- **Display:** Shown in author bio section as clickable LinkedIn icon

### Setting Author Profile Information

All author profile information is managed in the Settings page:

**Location:** Settings page → Profile Information section

**Fields:**
- **First Name** (`user-first-name`) - Stored in `settings/user-settings.general.firstName`
- **Last Name** (`user-last-name`) - Stored in `settings/user-settings.general.lastName`
- **Job Title** (`user-job-title`) - Stored in `settings/user-settings.general.jobTitle` (defaults to "Energy Strategist")
- **LinkedIn** (`user-linkedin`) - Stored in `settings/user-settings.general.linkedIn`
- **Profile Photo** - Stored in `settings/user-settings.general.hostedPhotoURL` or `general.photoURL`

**Note:** The job title is always displayed in published blog posts below the author's name. If not set, it defaults to "Energy Strategist".

## Related Documentation

- `SEO.md` - SEO guidelines and keyword strategies
- `api/perplexity-email.js` - Reference for Perplexity API usage
- `scripts/pages/news.js` - Post list page (where posts are displayed)
- `api/posts/generate-static.js` - Static HTML generation for published posts
- `scripts/pages/settings.js` - Settings page (where author info is managed)
- `LOAD-BALANCER-CONFIGURATION.md` - Load balancer setup and configuration
- `server.js` - Route handlers for blog posts and sitemap

---

## Support

For issues or questions:
1. Check this guide first
2. Review `SEO.md` for content guidelines
3. Check browser console for errors
4. Check server logs for API errors
5. Verify environment variables are set correctly

---

**Last Updated:** December 2025
**Version:** 1.4

## Changelog

### Version 1.4 (December 2025)
- **Cache Control Fix:** Reduced cache time from 1 hour to 5 minutes with `must-revalidate` for faster post updates
- **ETag Support:** Added ETag and Last-Modified headers based on Firebase Storage file metadata for efficient cache validation
- **Update Flow:** Improved static HTML regeneration when updating published posts
- **Load Balancer Compatibility:** Cache headers now properly work with Google Cloud Load Balancer
- Fixed issue where post updates weren't appearing live due to aggressive caching

### Version 1.3 (November 22, 2025)
- **Hosting Migration:** Blog posts now hosted on `powerchoosers.com/posts/slug` via Application Load Balancer
- **Clean URLs:** Replaced signed URLs with permanent clean URLs for better SEO
- **Sitemap:** Added dynamic sitemap.xml generation at `powerchoosers.com/sitemap.xml`
- **CDN Integration:** Posts served through Cloud CDN for faster global delivery
- **SSL:** Google-managed SSL certificate for secure HTTPS connections
- Updated URL generation in `generate-static.js` and `posts-list.js`
- Added route handlers in `server.js` for `/posts/:slug` and `/sitemap.xml`

### Version 1.2 (2025-01-XX)
- **Author Bio Enhancement:** Job title now always displays below author name in published posts
- Job title defaults to "Energy Strategist" if not set in profile settings
- Updated author bio structure documentation to clarify display order
- Improved author bio section to ensure job title is always visible

### Version 1.1 (2025-01-XX)
- Added author bio section to generated static HTML posts
- Added Author column to news table
- Fixed post title link styling to match accounts/people pages
- Added LinkedIn field to settings
- Updated documentation for author information flow

### Version 1.0 (2025-01-XX)
- Initial release
- AI generation with Perplexity Sonar
- Skeleton animations
- Static HTML generation

