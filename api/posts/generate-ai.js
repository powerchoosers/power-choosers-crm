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
- Avoid fluffy marketing language
- Structure posts with an H2 introduction, three or more H3 body sections, and paragraphs
- Include image placement suggestions as HTML comments: <!-- [IMAGE: description of image to add here] -->
- Target high-intent commercial energy keywords
- Focus on trending energy topics for 2025

Return your response as a JSON object with these exact fields:
{
  "title": "Post title with primary keyword in first 60 characters, format: [Keyword] + [Benefit] + [Year]",
  "category": "One of: News, Market Update, Energy Tips, Case Study, Industry Analysis",
  "metaDescription": "150-160 character meta description in format: [Question/Pain Point]? [Solution/Keyword]. [Call to Action].",
  "keywords": "3-5 comma-separated keywords, mix 1 broad term with 2-4 specific terms",
  "content": "HTML content with H2 for introduction, 3+ H3 sections, paragraphs, and image placement comments"
}`;

// Generate user prompt with existing posts context
function buildUserPrompt(existingPosts) {
  const existingTitles = existingPosts.map(p => p.title).filter(Boolean).slice(0, 20);
  const existingCategories = [...new Set(existingPosts.map(p => p.category).filter(Boolean))];
  const existingKeywords = existingPosts
    .map(p => p.keywords)
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, 30);

  let context = '';
  if (existingTitles.length > 0) {
    context += `\n\nEXISTING POSTS TO AVOID DUPLICATING:\n`;
    context += `Titles: ${existingTitles.join(', ')}\n`;
    if (existingCategories.length > 0) {
      context += `Categories used: ${existingCategories.join(', ')}\n`;
    }
    if (existingKeywords.length > 0) {
      context += `Keywords already used: ${existingKeywords.join(', ')}\n`;
    }
    context += `\nGenerate a FRESH, UNIQUE post that does NOT repeat these topics or use the same keywords.`;
  }

  const trendingTopics = [
    'Summarize the latest natural gas storage report from the EIA and explain its impact on commercial electricity futures',
    'Explain the difference between Fixed-All-Inclusive and Index products for a manufacturing facility manager',
    'Write a news update on the latest ERCOT/PJM grid weather alerts and advise businesses on demand response strategies',
    'Analyze 2025 commercial electricity rate trends and when businesses should lock in fixed contracts',
    'Discuss rising demand charges and how commercial facilities can optimize their load profiles',
    'Review solar tax incentives for businesses in 2025 and ROI calculations',
    'Explain capacity charges and their impact on commercial energy costs',
    'Cover energy market forecast for 2025 and strategic procurement timing'
  ];

  const randomTopic = trendingTopics[Math.floor(Math.random() * trendingTopics.length)];

  return `${randomTopic}${context}\n\nGenerate a complete blog post following the structure and format specified in the system prompt.`;
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
    const category = String(parsed.category || 'News').trim();
    const metaDescription = String(parsed.metaDescription || '').trim();
    const keywords = String(parsed.keywords || '').trim();
    let content = String(parsed.content || '').trim();
    
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
    // Fetch existing posts from Firestore
    let existingPosts = [];
    if (db) {
      try {
        const snapshot = await db.collection('posts')
          .limit(50)
          .get();
        
        existingPosts = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            title: data.title || '',
            category: data.category || '',
            keywords: data.keywords || '',
            metaDescription: data.metaDescription || ''
          };
        });
        
        console.log(`[AI Post Generation] Loaded ${existingPosts.length} existing posts for context`);
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

