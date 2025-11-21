/**
 * Power Choosers CRM - AI Post Generation API
 * Uses Perplexity Sonar to generate complete blog posts with all fields
 * Includes existing posts metadata as context to avoid duplicates
 */

import { cors } from '../_cors.js';
import { db } from '../_firebase.js';

// System prompt based on SEO.md guidelines
const SYSTEM_PROMPT = `You are an expert energy market analyst for the B2B sector. Generate blog posts that:
- Use short sentences, data-driven arguments, and professional terminology (e.g., 'Load Factor,' 'Strike Price,' 'kVA')
- Avoid fluffy marketing language - this is NEWS, not marketing
- Structure posts with an H2 introduction, three or more H3 body sections, and paragraphs
- Include image placement suggestions as HTML comments: <!-- [IMAGE: description of image to add here] -->
- Target high-intent commercial energy keywords from Tier 1 (ready to buy) or Tier 2 (research phase)
- Focus on trending energy topics for 2025

CRITICAL: Every post MUST include a "Resource Funnel" section near the end that:
1. Identifies a specific problem discussed in the post
2. Offers a specific tool/resource from /resources as the solution
3. Includes an internal link: <a href="/resources">Resources Page</a>
Example: "To see exactly how [problem] affects your specific situation, download our [specific tool name] on our <a href=\"/resources\">Resources Page</a>."

Return your response as a JSON object with these exact fields:
{
  "title": "Post title with primary keyword in first 60 characters, format: [Keyword] + [Benefit] + [Year]",
  "category": "One of: Market Update, Industry News, Energy Guide, Case Study, Market Analysis",
  "contentType": "One of: educational, soft-sell, hard-sell (educational = market reports/news, soft-sell = case studies/guides, hard-sell = direct conversion)",
  "metaDescription": "150-160 character meta description in format: [Question/Pain Point]? [Solution/Keyword]. [Call to Action].",
  "keywords": "3-5 comma-separated keywords, mix 1 broad term (e.g., 'Energy Broker') with 2-4 specific terms (e.g., 'Texas Commercial Power Rates', 'B2B Energy Procurement')",
  "content": "HTML content with H2 for introduction, 3+ H3 sections, paragraphs, image placement comments, and MUST include resource funnel link to /resources"
}`;

// Infer content type from category/title if not explicitly set
function inferContentType(category, title) {
  const cat = (category || '').toLowerCase();
  const tit = (title || '').toLowerCase();
  
  // Hard-sell indicators
  if (cat.includes('offer') || cat.includes('sale') || tit.includes('lock in') || tit.includes('limited time') || tit.includes('now')) {
    return 'hard-sell';
  }
  
  // Soft-sell indicators
  if (cat.includes('case study') || cat.includes('guide') || tit.includes('how to') || tit.includes('guide')) {
    return 'soft-sell';
  }
  
  // Default to educational (market updates, news, analysis)
  return 'educational';
}

// Determine content type based on 4-1-1 strategy (4 educational, 1 soft-sell, 1 hard-sell)
function determineContentType(existingPosts) {
  // Count content types from recent posts
  const recentPosts = existingPosts.slice(0, 20);
  const contentTypeCounts = {
    educational: 0,
    'soft-sell': 0,
    'hard-sell': 0
  };
  
  recentPosts.forEach(post => {
    // Infer content type from category if contentType not available
    const contentType = post.contentType || inferContentType(post.category, post.title);
    if (contentTypeCounts.hasOwnProperty(contentType)) {
      contentTypeCounts[contentType]++;
    }
  });
  
  // 4-1-1 ratio: prioritize educational (4), then soft-sell (1), then hard-sell (1)
  const total = contentTypeCounts.educational + contentTypeCounts['soft-sell'] + contentTypeCounts['hard-sell'];
  
  if (total === 0) {
    // First post - start with educational
    return 'educational';
  }
  
  // Calculate ratios
  const educationalRatio = contentTypeCounts.educational / total;
  const softSellRatio = contentTypeCounts['soft-sell'] / total;
  const hardSellRatio = contentTypeCounts['hard-sell'] / total;
  
  // Target: 66.7% educational, 16.7% soft-sell, 16.7% hard-sell (4-1-1 ratio)
  if (educationalRatio < 0.6) {
    return 'educational';
  } else if (softSellRatio < 0.2) {
    return 'soft-sell';
  } else if (hardSellRatio < 0.2) {
    return 'hard-sell';
  } else {
    // Default to educational if ratios are balanced
    return 'educational';
  }
}

// Generate user prompt with existing posts context
function buildUserPrompt(existingPosts) {
  const existingTitles = existingPosts.map(p => p.title).filter(Boolean).slice(0, 30);
  const existingCategories = [...new Set(existingPosts.map(p => p.category).filter(Boolean))];
  const existingKeywords = existingPosts
    .map(p => p.keywords)
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, 50);
  
  // Extract topic keywords from content previews for better duplicate detection
  const topicKeywords = new Set();
  existingPosts.forEach(p => {
    if (p.contentPreview) {
      // Look for common energy topics in content
      const topics = ['capacity', 'demand', 'rates', 'contract', 'fixed', 'index', 'ercot', 'pjm', 'solar', 'gas', 'storage', 'grid', 'procurement', 'ppa', 'audit'];
      topics.forEach(topic => {
        if (p.contentPreview.includes(topic)) {
          topicKeywords.add(topic);
        }
      });
    }
  });

  // Determine content type based on 4-1-1 strategy
  const contentType = determineContentType(existingPosts);
  
  let context = '';
  if (existingTitles.length > 0) {
    context += `\n\nEXISTING POSTS TO AVOID DUPLICATING (includes both published and draft posts):\n`;
    context += `Recent Titles: ${existingTitles.join(', ')}\n`;
    if (existingCategories.length > 0) {
      context += `Categories already used: ${existingCategories.join(', ')}\n`;
    }
    if (existingKeywords.length > 0) {
      context += `Keywords already used: ${existingKeywords.join(', ')}\n`;
    }
    if (topicKeywords.size > 0) {
      context += `Topics already covered: ${Array.from(topicKeywords).join(', ')}\n`;
    }
    context += `\nIMPORTANT: Generate a COMPLETELY FRESH, UNIQUE post that does NOT repeat any of these topics, keywords, or titles. Avoid similar subject matter even if worded differently.`;
  }

  // Content type-specific topic pools based on SEO.md 4-1-1 strategy
  const educationalTopics = [
    // Market Reports (EIA, FERC) - The "4" in 4-1-1
    'Summarize the latest EIA Weekly Natural Gas Storage Report and explain its impact on commercial electricity futures for Q1 2025',
    'Analyze the most recent EIA Short-Term Energy Outlook and what it means for business energy procurement',
    'Review the latest FERC State of the Markets report and highlight policy changes affecting large industrial energy users',
    'Write a news update on the latest ERCOT grid weather alerts and advise businesses on demand response strategies',
    'Cover the most recent PJM Inside Lines grid reliability updates and their implications for commercial facilities',
    'Summarize recent Utility Dive coverage on grid modernization trends and renewable energy integration',
    'Analyze Bloomberg Energy reports on global oil/gas trends and their impact on local commercial electricity pricing',
    'Review Energy Manager Today coverage on efficiency trends for facility managers',
    'Write about recent energy legislation updates and how they affect commercial energy contracts',
    'Cover ERCOT conservation notices and what they mean for Texas businesses',
    // Market Analysis
    'Analyze 2025 commercial electricity rate trends and when businesses should lock in fixed contracts',
    'Discuss rising demand charges and how commercial facilities can optimize their load profiles',
    'Explain capacity charges and their impact on commercial energy costs',
    'Cover energy market forecast for 2025 and strategic procurement timing'
  ];

  const softSellTopics = [
    // Case Studies & Educational Guides - The first "1" in 4-1-1
    'Write a case study showing how a manufacturing facility saved money by switching from Index to Fixed-All-Inclusive energy contracts',
    'Create an educational guide: "How to Read Your Commercial Energy Bill" with explanations of demand charges, capacity fees, and transmission costs',
    'Explain the difference between Fixed-All-Inclusive and Index products for a manufacturing facility manager, with real-world examples',
    'Write a guide on "How to Calculate Your Load Factor" and why it matters for commercial energy procurement',
    'Create a case study: "How a Multi-Location Business Consolidated Energy Contracts and Reduced Costs by 15%"',
    'Write an educational post: "Understanding Your Commercial Energy Contract: Key Terms Every Facility Manager Should Know"'
  ];

  const hardSellTopics = [
    // Direct Conversion - The second "1" in 4-1-1
    'Write a post: "Commercial Electricity Rates at 12-Month Low: Lock In Your Fixed Contract Now Before Prices Rise"',
    'Create urgency: "Limited Time: Free Commercial Energy Audit for Texas Businesses - Schedule Before March 31"',
    'Direct offer: "2025 Energy Rates Are Favorable: Secure Your Fixed Contract This Quarter to Lock In Savings"',
    'Call to action: "Rates Are Rising: Lock In Your Commercial Energy Contract Today to Avoid 15% Price Increases"'
  ];

  // Select topic based on content type
  let topicPool;
  let contentTypeInstruction = '';
  
  if (contentType === 'educational') {
    topicPool = educationalTopics;
    contentTypeInstruction = 'This should be EDUCATIONAL/CURATED content (market reports, news, analysis) - part of the "4" in the 4-1-1 strategy. Focus on providing value and establishing expertise.';
  } else if (contentType === 'soft-sell') {
    topicPool = softSellTopics;
    contentTypeInstruction = 'This should be SOFT-SELL content (case studies, educational guides) - the first "1" in 4-1-1. Demonstrate expertise by showing how problems are solved.';
  } else {
    topicPool = hardSellTopics;
    contentTypeInstruction = 'This should be HARD-SELL content (direct conversion) - the second "1" in 4-1-1. Create urgency and ask for the sale directly.';
  }

  const randomTopic = topicPool[Math.floor(Math.random() * topicPool.length)];

  return `${randomTopic}\n\n${contentTypeInstruction}\n\n${context}\n\nGenerate a complete blog post following the structure and format specified in the system prompt. Remember: EVERY post must include a resource funnel link to /resources near the end.`;
}

// Parse Perplexity response and extract structured data
function parseAIResponse(responseText) {
  try {
    // Try to extract JSON from response (may be wrapped in markdown code blocks)
    let jsonText = responseText.trim();
    
    // Remove markdown code fences if present
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
    jsonText = jsonText.replace(/\s*```\s*$/i, '');
    
    // Extract JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Validate and clean fields
    const title = String(parsed.title || '').trim();
    const category = String(parsed.category || 'Market Update').trim();
    const contentType = String(parsed.contentType || 'educational').trim();
    const metaDescription = String(parsed.metaDescription || '').trim();
    const keywords = String(parsed.keywords || '').trim();
    let content = String(parsed.content || '').trim();
    
    // Ensure content includes resource funnel link
    if (!content.includes('/resources') && !content.includes('Resources Page')) {
      // Add resource funnel section if missing
      const resourceSection = `
<h3>Take Action: Access Our Resources</h3>
<p>To see exactly how these trends affect your specific situation, visit our <a href="/resources">Resources Page</a> for tools, calculators, and market reports.</p>`;
      content += resourceSection;
    }
    
    // Ensure content has proper HTML structure
    if (!content.includes('<h2>') && !content.includes('<H2>')) {
      // If no H2, wrap in paragraphs
      content = content.split('\n\n').map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<h3>') || p.startsWith('<H3>')) return p;
        return `<p>${p}</p>`;
      }).filter(Boolean).join('\n\n');
    }
    
    // Generate slug from title
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    return {
      title,
      slug,
      category,
      contentType,
      metaDescription,
      keywords,
      content
    };
  } catch (error) {
    console.error('[AI Post Generation] Failed to parse response:', error);
    // Fallback: try to extract fields from text
    return parseFallback(responseText);
  }
}

// Fallback parser if JSON parsing fails
function parseFallback(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let title = '';
  let category = 'News';
  let metaDescription = '';
  let keywords = '';
  let content = '';
  
  let inContent = false;
  const contentLines = [];
  
  for (const line of lines) {
    if (line.toLowerCase().startsWith('title:')) {
      title = line.replace(/^title:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('category:')) {
      category = line.replace(/^category:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('meta') || line.toLowerCase().startsWith('description:')) {
      metaDescription = line.replace(/^(meta\s*)?description:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('keywords:')) {
      keywords = line.replace(/^keywords:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('content:') || inContent) {
      inContent = true;
      if (!line.toLowerCase().startsWith('content:')) {
        contentLines.push(line);
      }
    }
  }
  
  content = contentLines.join('\n\n');
  
  // Generate slug
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return {
    title: title || 'Commercial Energy Market Update 2025',
    slug: slug || 'commercial-energy-market-update-2025',
    category: category || 'News',
    metaDescription: metaDescription || 'Latest commercial energy market insights and trends for 2025.',
    keywords: keywords || 'commercial electricity, energy rates, business energy',
    content: content || '<h2>Introduction</h2><p>Energy market analysis for commercial facilities.</p>'
  };
}

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    // Fetch existing posts from Firestore (both published AND drafts to avoid duplicates)
    let existingPosts = [];
    if (db) {
      try {
        // Get all posts regardless of status (published + drafts)
        const snapshot = await db.collection('posts')
          .limit(100) // Increased to catch more duplicates
          .get();
        
        existingPosts = snapshot.docs.map(doc => {
          const data = doc.data();
          // Extract content preview for better duplicate detection
          const content = data.content || '';
          const contentPreview = content.substring(0, 200).toLowerCase();
          
          return {
            title: data.title || '',
            category: data.category || '',
            contentType: data.contentType || inferContentType(data.category, data.title),
            keywords: data.keywords || '',
            metaDescription: data.metaDescription || '',
            contentPreview: contentPreview, // For topic detection
            status: data.status || 'draft' // Track status for logging
          };
        });
        
        console.log(`[AI Post Generation] Loaded ${existingPosts.length} existing posts (published + drafts) for context`);
      } catch (firestoreError) {
        console.warn('[AI Post Generation] Failed to load existing posts:', firestoreError);
        // Continue without context if Firestore fails
      }
    }
    
    // Build prompts
    const userPrompt = buildUserPrompt(existingPosts);
    
    // Call Perplexity API
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }
    
    console.log('[AI Post Generation] Calling Perplexity Sonar API...');
    
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
    
    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('[AI Post Generation] Perplexity API error:', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }
    
    const perplexityData = await perplexityResponse.json();
    const responseText = perplexityData.choices?.[0]?.message?.content || '';
    
    if (!responseText) {
      throw new Error('Empty response from Perplexity API');
    }
    
    // Parse response
    const generatedPost = parseAIResponse(responseText);
    
    console.log('[AI Post Generation] Successfully generated post:', {
      title: generatedPost.title,
      category: generatedPost.category,
      contentLength: generatedPost.content.length
    });
    
    // Return generated post
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      post: generatedPost
    }));
    
  } catch (error) {
    console.error('[AI Post Generation] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to generate post',
      details: error.message
    }));
  }
}

