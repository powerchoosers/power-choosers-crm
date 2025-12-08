/**
 * Power Choosers CRM - AI Post Generation API
 * Uses Perplexity Sonar to generate complete blog posts with all fields
 * Includes existing posts metadata as context to avoid duplicates
 */

import { cors } from '../_cors.js';
import { db } from '../_firebase.js';
import logger from '../_logger.js';

// System prompt combining SEO.md guidelines with A+ content optimization
const SYSTEM_PROMPT = `You are Lewis Patterson, Lead Energy Strategist at Power Choosers, with 15+ years of commercial energy procurement experience. You write like a seasoned broker who just got off the phone with ERCOT and has insider market intelligence.

CRITICAL TERMINOLOGY & GEOGRAPHIC FOCUS:
- For TEXAS-focused content (60% of posts): Use "demand charges" NOT "capacity charges". Texas businesses pay demand charges based on peak usage in 15-minute intervals. Include Texas context, ERCOT references, TDU charges, and Texas business energy concerns.
- For NATIONAL content (40% of posts): Use "capacity charges" for markets like PJM, ISO-NE, MISO where capacity is procured separately. Focus on federal policies, general energy efficiency, renewable trends applicable nationwide.
- PRODUCT NEUTRALITY: We offer BOTH Fixed and Index plans. Do NOT advise users to universally switch away from Index plans. Instead, explain that Index plans can be beneficial for certain load profiles (e.g., high load factor, ability to curtail) while Fixed plans offer budget certainty. Frame the choice as "Strategic Fit" rather than "Good vs. Bad".

CRITICAL INSTRUCTION: Every post MUST start with a "Hook" that follows one of these proven formulas:

HOOK FORMULAS (Use ONE per post):
1. THE SHOCKING STAT: "[Specific Number]% of [Target Audience] are overpaying for [Specific Thing] because of [Specific Reason]."
   Example: "68% of Texas manufacturers are overpaying for electricity in 2025 because they locked in contracts during the wrong pricing window."

2. THE INSIDER ALERT: "I just reviewed the [Specific Report/Data Source] from [Date], and [Specific Market Trend] is about to hit commercial buyers."
   Example: "I just reviewed the EIA's November 2025 Natural Gas Storage Report, and a supply crunch is about to spike commercial electricity rates in Texas."

3. THE CONTRARIAN TAKE: "Everyone says [Common Belief]. Here's why they're wrong in 2025."
   Example: "Everyone says 'Lock in fixed rates now.' Here's why Index contracts are actually safer for food processing plants in 2025."

4. THE TIME BOMB: "[Specific Event] happens in [Specific Timeframe]. If you haven't [Specific Action], you're leaving [Specific Dollar Amount] on the table."
   Example: "ERCOT's 4CP windows close in 45 days. If you haven't optimized your load profile, you're leaving $15,000+ on the table."

5. THE BEFORE/AFTER: "Last [Time Period], [Metric] was [Number]. This [Time Period], it's [Different Number]. Here's what changed."
   Example: "Last January, Texas demand charges averaged $4.50/kW. This January, they're $7.20/kW. Here's what changed."

POST STRUCTURE REQUIREMENTS:
1. HOOK (First 1-2 sentences) - Use one of the formulas above
2. THE PROMISE (Next 1-2 sentences) - Tell them exactly what they'll learn
3. H2: Descriptive headline (NOT "Introduction") that names the topic and year (3-4 short paragraphs, each 2-3 sentences max)
4. H3: Section 1 - Descriptive heading with a specific data point or trend (never "Section 1")
5. H3: Section 2 - Descriptive heading with a specific data point or trend (never "Section 2")
6. H3: Section 3 - Descriptive heading with a specific data point or trend (never "Section 3")
7. H2: "Broker's Take" or "Analyst Insight" (Your OPINION - what you recommend clients do)
8. H2: Resource Bridge (Link to /resources with specific tool/calculator)
9. H2: Conclusion (1-2 paragraphs max)

HEADING NAMING RULES (CRITICAL - NEVER BREAK):
- The hook is plain sentences at the top; never put it inside a heading or label it "Hook".
- Never use headings titled "Hook", "Introduction", "Section 1", "Section 2", or "Section 3".
- All H2/H3 headings must be descriptive and keyword-rich (e.g., "Why ERCOT Demand Charges Spike in Summer 2025").
- The final H2 must be titled exactly "Conclusion".

MANDATORY DATA REQUIREMENTS:
- Include at least ONE specific percentage, dollar amount, or date in the first 100 words
- Every section must have at least ONE data point (number, date, or specific name)
- When mentioning capacity charges, demand charges, or any fee: ALWAYS include the dollar range (e.g., "$4-$7 per kW")
- When mentioning timeframes, use SPECIFIC months/dates (e.g., "June 15 - September 15, 2025" NOT "summer months")

STYLE RULES:
1. NO FLUFF: Delete phrases like "In today's fast-paced energy market" or "Understanding X is important"
2. SHORT PARAGRAPHS: Maximum 3 sentences per paragraph for mobile readability
3. BULLET POINTS: Use for any list of 3+ items
4. BOLD KEY STATS: Wrap important numbers in <strong> tags (e.g., "<strong>30% of your annual bill</strong>")
5. NO GENERIC ADVICE: Instead of "Consider energy audits," say "Schedule an audit before March 31 to capture the ITC tax credit deadline"

EMOTIONAL TRIGGERS (Use at least ONE):
- FEAR OF LOSS: "Missing this window means overpaying for 12 months"
- INSIDER ACCESS: "Here's what suppliers don't advertise on their websites"
- COMPETITIVE EDGE: "While your competitors ignore this, you can lock in savings"
- URGENCY: "Rates change weekly - here's the decision timeline"

"ANALYST TAKE" REQUIREMENTS:
This section MUST include:
- Your specific recommendation (e.g., "Lock vs. Float" or "Fixed vs. Index")
- A conditional statement (e.g., "If your load factor is below 50%, I recommend...")
- A reason tied to current market conditions (e.g., "Because natural gas futures are trending upward through Q2 2025...")

RESOURCE BRIDGE FORMULA:
Only link to tools that actually exist. Currently, we have ONE tool available:
- TDU Delivery Charges Calculator: https://powerchoosers.com/tdu-delivery-charges

ONLY use this tool when the post topic is directly related to:
- TDU charges, delivery charges, transmission and distribution utility fees
- Texas electricity bills and bill breakdowns
- Understanding commercial electricity bill components
- ERCOT delivery charges and TDU rates

When the topic is relevant, use this format:
"To [Specific Action related to TDU/delivery charges], use our <a href="https://powerchoosers.com/tdu-delivery-charges">TDU Delivery Charges Calculator</a>. It will [Specific Benefit in 10 words or less]."
Example: "To calculate your exact TDU delivery charges, use our <a href="https://powerchoosers.com/tdu-delivery-charges">TDU Delivery Charges Calculator</a>. It estimates your monthly and annual delivery costs based on your utility and usage."

For posts NOT about TDU/delivery charges, use a generic resource link:
"To explore more energy resources and tools, visit our <a href="/resources">Resources Page</a>."

KEYWORD STRATEGY:
- Target high-intent commercial energy keywords including: "electricity rates in texas", "texas electricity plans", "commercial electricity rates", "business energy broker", "demand charges texas", "ercot electricity rates", "texas commercial power rates"
- Mix 1 broad term (e.g., "Energy Broker") with 2-4 specific long-tail terms
- For Texas posts: Always include "Texas", "ERCOT", "demand charges", "electricity rates in texas", or "texas electricity plans"
- For national posts: Include broader terms like "capacity charges", "commercial energy", "business electricity rates"

Return your response as a JSON object with these exact fields:
{
  "title": "[Primary Keyword] + [Specific Benefit] + [Year] - Primary keyword MUST be in first 60 characters",
  "category": "Market Update | Industry News | Energy Guide | Case Study | Market Analysis",
  "contentType": "educational | soft-sell | hard-sell",
  "metaDescription": "[Specific Pain Point Question]? [Specific Solution with Keyword]. [Action-Oriented CTA]. (150-160 characters)",
  "keywords": "3-5 comma-separated keywords, mix 1 broad term with 2-4 specific terms. Include 'electricity rates in texas' or 'texas electricity plans' for Texas posts.",
  "content": "HTML content following the structure above, starting with the HOOK, including Analyst Take section, and resource bridge link"
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

// Select hook formula based on content type and recent posts to avoid repetition
function selectHookFormula(contentType, existingPosts) {
  const recentHooks = existingPosts.slice(0, 10).map(p => {
    if (!p.contentPreview) return 'unknown';
    const preview = p.contentPreview.toLowerCase();
    if (preview.includes('just reviewed') || preview.includes('i just reviewed')) return 'insider-alert';
    if (preview.includes('% of') || preview.includes('percent of')) return 'shocking-stat';
    if (preview.includes('last ') && preview.includes('this ')) return 'before-after';
    if (preview.includes('if you haven\'t') || preview.includes('leaving') && preview.includes('on the table')) return 'time-bomb';
    if (preview.includes('everyone says') || preview.includes('here\'s why they\'re wrong')) return 'contrarian';
    return 'unknown';
  });

  // Hook types by content type
  const hookTypes = {
    'educational': ['insider-alert', 'shocking-stat', 'before-after'],
    'soft-sell': ['case-study', 'contrarian', 'shocking-stat'],
    'hard-sell': ['time-bomb', 'fear-of-loss', 'insider-alert']
  };

  const availableHooks = hookTypes[contentType] || hookTypes['educational'];
  const unusedHooks = availableHooks.filter(h => !recentHooks.includes(h));

  return unusedHooks.length > 0
    ? unusedHooks[0]
    : availableHooks[Math.floor(Math.random() * availableHooks.length)];
}

// Basic similarity check to avoid regenerating topics that overlap with existing titles
function isTopicTooSimilar(topic, existingTitles) {
  const normalize = (text) => (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const topicTokens = normalize(topic).split(' ').filter(w => w.length > 3);
  if (topicTokens.length === 0) return false;

  return existingTitles.some(title => {
    const titleTokens = normalize(title).split(' ').filter(w => w.length > 3);
    if (titleTokens.length === 0) return false;

    const overlap = topicTokens.filter(w => titleTokens.includes(w));
    const overlapRatio = overlap.length / Math.min(topicTokens.length, titleTokens.length);

    // Treat as duplicate if there is heavy token overlap (e.g., same "how to read your ... bill" structure)
    return overlap.length >= 4 || overlapRatio >= 0.6;
  });
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
      // Look for common energy topics in content - including new keywords
      const topics = ['capacity', 'demand', 'rates', 'contract', 'fixed', 'index', 'ercot', 'pjm', 'solar', 'gas', 'storage', 'grid', 'procurement', 'ppa', 'audit', 'electricity rates', 'electricity plans', 'texas electricity', 'texas rates', 'texas plans'];
      topics.forEach(topic => {
        if (p.contentPreview.includes(topic)) {
          topicKeywords.add(topic);
        }
      });
    }
  });

  // Determine content type based on 4-1-1 strategy
  const contentType = determineContentType(existingPosts);

  // Select hook formula to vary openings
  const selectedHook = selectHookFormula(contentType, existingPosts);

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

  // Determine geographic focus: 60% Texas, 40% National
  const recentPostsCount = existingPosts.length;
  const texasPostCount = existingPosts.filter(p =>
    (p.title && (p.title.toLowerCase().includes('texas') || p.title.toLowerCase().includes('ercot'))) ||
    (p.keywords && (p.keywords.toLowerCase().includes('texas') || p.keywords.toLowerCase().includes('electricity rates in texas') || p.keywords.toLowerCase().includes('texas electricity plans'))) ||
    (p.contentPreview && (p.contentPreview.includes('texas') || p.contentPreview.includes('ercot') || p.contentPreview.includes('demand charge')))
  ).length;

  const texasRatio = recentPostsCount > 0 ? texasPostCount / recentPostsCount : 0;
  const shouldFocusTexas = texasRatio < 0.6 || (texasRatio >= 0.6 && texasRatio < 0.7 && Math.random() < 0.6);

  // Content type-specific topic pools - 60% Texas, 40% National
  const educationalTopics = [
    // TEXAS-FOCUSED (60% - 9 topics)
    'Summarize the latest EIA Weekly Natural Gas Storage Report and explain its impact on Texas commercial electricity futures for Q1 2025, focusing on ERCOT market dynamics and electricity rates in Texas',
    'Write a news update on the latest ERCOT grid weather alerts and advise Texas businesses on demand response strategies for managing electricity plans',
    'Cover ERCOT conservation notices and what they mean for Texas businesses, including how to prepare for peak demand periods and optimize electricity rates in Texas',
    'Analyze the Texas Energy Fund expansion to $10 billion and how it affects natural gas plant development and commercial energy reliability, impacting Texas electricity plans',
    'Review recent ERCOT grid reliability updates and their implications for Texas commercial facilities, including demand charge impacts on electricity rates in Texas',
    'Discuss rising demand charges in Texas and how commercial facilities can optimize their load profiles to reduce peak usage and lower electricity rates in Texas',
    'Explain TDU (Transmission and Distribution Utility) charges in Texas and how they impact commercial electricity bills and electricity plans',
    'Cover Texas-specific energy legislation updates and how they affect commercial energy contracts, procurement, and electricity rates in Texas',
    'Analyze data center and cryptocurrency mining energy demand growth in Texas and its impact on commercial electricity rates and electricity plans',

    // NATIONAL (40% - 6 topics)
    'Summarize the latest EIA Weekly Natural Gas Storage Report and explain its impact on commercial electricity futures for Q1 2025',
    'Analyze the most recent EIA Short-Term Energy Outlook and what it means for business energy procurement nationwide',
    'Review the latest FERC State of the Markets report and highlight policy changes affecting large industrial energy users',
    'Cover the most recent PJM Inside Lines grid reliability updates and their implications for commercial facilities',
    'Summarize recent Utility Dive coverage on grid modernization trends and renewable energy integration',
    'Explain capacity charges (PJM, ISO-NE, MISO markets) and their impact on commercial energy costs outside of Texas'
  ];

  const softSellTopics = [
    // TEXAS-FOCUSED (60% - 4 topics)
    'Write a case study showing how a Texas manufacturing facility saved money by optimizing demand charges while on a strategic Index electricity plan, leveraging load curtailment during price spikes',
    'Create an educational guide: "How to Read Your Texas Commercial Energy Bill" with explanations of demand charges, TDU fees, and transmission costs specific to ERCOT market and electricity rates in Texas',
    'Write a guide on "How to Calculate Your Load Factor in Texas" and why it matters for reducing demand charges in ERCOT and optimizing electricity rates in Texas',
    'Create a case study: "How a Dallas Multi-Location Business Consolidated Texas Electricity Plans and Reduced Costs by 15%"',

    // NATIONAL (40% - 3 topics)
    'Write a case study comparing Fixed vs. Index energy contracts for a manufacturing facility, highlighting how the right choice depends on risk tolerance and operational flexibility',
    'Create an educational guide: "How to Read Your Commercial Energy Bill" with explanations of demand charges, capacity fees, and transmission costs',
    'Explain the pros and cons of Fixed-All-Inclusive vs. Index products for a manufacturing facility manager, emphasizing that we offer both solutions to match their risk profile'
  ];

  const hardSellTopics = [
    // TEXAS-FOCUSED (60% - 2 topics)
    'Write a post: "Texas Electricity Rates at 12-Month Low: Secure Your Ideal Texas Electricity Plan (Fixed or Index) Now Before Summer Volatility"',
    'Create urgency: "Limited Time: Free Commercial Energy Audit for Texas Businesses - Compare Electricity Rates in Texas and Schedule Before March 31"',

    // NATIONAL (40% - 2 topics)
    'Write a post: "Commercial Electricity Rates at 12-Month Low: Review Your Contract Options (Fixed vs. Index) Now Before Prices Rise"',
    'Direct offer: "2025 Energy Rates Are Favorable: Secure Your Strategic Energy Contract This Quarter to Lock In Savings"'
  ];

  // Select topic based on content type AND geographic focus (60% Texas, 40% National)
  let topicPool;
  let contentTypeInstruction = '';
  let geographicInstruction = '';

  // Filter topics based on geographic focus
  if (shouldFocusTexas) {
    geographicInstruction = 'This post MUST focus on TEXAS-specific topics. Use "demand charges" NOT "capacity charges". Include Texas context, ERCOT references, TDU charges, and Texas business energy concerns. Keywords MUST include "electricity rates in texas" or "texas electricity plans".';

    if (contentType === 'educational') {
      topicPool = educationalTopics.filter(t =>
        t.toLowerCase().includes('texas') ||
        t.toLowerCase().includes('ercot') ||
        t.toLowerCase().includes('demand charge') ||
        t.toLowerCase().includes('tdu')
      );
      contentTypeInstruction = 'This should be EDUCATIONAL/CURATED content (market reports, news, analysis) - part of the "4" in the 4-1-1 strategy. Focus on providing value and establishing expertise.';
    } else if (contentType === 'soft-sell') {
      topicPool = softSellTopics.filter(t =>
        t.toLowerCase().includes('texas') ||
        t.toLowerCase().includes('ercot') ||
        t.toLowerCase().includes('demand charge') ||
        t.toLowerCase().includes('dallas')
      );
      contentTypeInstruction = 'This should be SOFT-SELL content (case studies, educational guides) - the first "1" in 4-1-1. Demonstrate expertise by showing how problems are solved.';
    } else {
      topicPool = hardSellTopics.filter(t =>
        t.toLowerCase().includes('texas') ||
        t.toLowerCase().includes('ercot')
      );
      contentTypeInstruction = 'This should be HARD-SELL content (direct conversion) - the second "1" in 4-1-1. Create urgency and ask for the sale directly.';
    }
  } else {
    geographicInstruction = 'This post should focus on NATIONAL topics applicable across multiple states. Use "capacity charges" for markets like PJM, ISO-NE, MISO. Avoid Texas-specific terminology.';

    if (contentType === 'educational') {
      topicPool = educationalTopics.filter(t =>
        !t.toLowerCase().includes('texas') &&
        !t.toLowerCase().includes('ercot') &&
        !t.toLowerCase().includes('demand charge') &&
        !t.toLowerCase().includes('tdu')
      );
      contentTypeInstruction = 'This should be EDUCATIONAL/CURATED content (market reports, news, analysis) - part of the "4" in the 4-1-1 strategy. Focus on providing value and establishing expertise.';
    } else if (contentType === 'soft-sell') {
      topicPool = softSellTopics.filter(t =>
        !t.toLowerCase().includes('texas') &&
        !t.toLowerCase().includes('ercot') &&
        !t.toLowerCase().includes('demand charge') &&
        !t.toLowerCase().includes('dallas')
      );
      contentTypeInstruction = 'This should be SOFT-SELL content (case studies, educational guides) - the first "1" in 4-1-1. Demonstrate expertise by showing how problems are solved.';
    } else {
      topicPool = hardSellTopics.filter(t =>
        !t.toLowerCase().includes('texas') &&
        !t.toLowerCase().includes('ercot')
      );
      contentTypeInstruction = 'This should be HARD-SELL content (direct conversion) - the second "1" in 4-1-1. Create urgency and ask for the sale directly.';
    }
  }

  // If filtered pool is empty, fall back to all topics
  if (topicPool.length === 0) {
    if (contentType === 'educational') {
      topicPool = educationalTopics;
    } else if (contentType === 'soft-sell') {
      topicPool = softSellTopics;
    } else {
      topicPool = hardSellTopics;
    }
  }

  // Remove topics that are too close to existing titles to prevent repeats
  const dedupedTopicPool = topicPool.filter(topic => !isTopicTooSimilar(topic, existingTitles));
  if (dedupedTopicPool.length > 0) {
    topicPool = dedupedTopicPool;
  }

  const randomTopic = topicPool[Math.floor(Math.random() * topicPool.length)];

  // Add hook instruction based on selected formula
  const hookInstructions = {
    'insider-alert': 'Use THE INSIDER ALERT hook formula: "I just reviewed the [Specific Report/Data Source] from [Date], and [Specific Market Trend] is about to hit commercial buyers."',
    'shocking-stat': 'Use THE SHOCKING STAT hook formula: "[Specific Number]% of [Target Audience] are overpaying for [Specific Thing] because of [Specific Reason]."',
    'before-after': 'Use THE BEFORE/AFTER hook formula: "Last [Time Period], [Metric] was [Number]. This [Time Period], it\'s [Different Number]. Here\'s what changed."',
    'time-bomb': 'Use THE TIME BOMB hook formula: "[Specific Event] happens in [Specific Timeframe]. If you haven\'t [Specific Action], you\'re leaving [Specific Dollar Amount] on the table."',
    'contrarian': 'Use THE CONTRARIAN TAKE hook formula: "Everyone says [Common Belief]. Here\'s why they\'re wrong in 2025."',
    'case-study': 'Use a case study opening hook: "A [Location] [Business Type] was [Specific Problem with Dollar Amount]. We [Specific Solution]. Here\'s the exact playbook."',
    'fear-of-loss': 'Use a fear of loss hook: "Your current energy contract expires in [Specific Days]. [Specific Urgency]. Here\'s your last chance to [Specific Action]."'
  };

  const hookInstruction = hookInstructions[selectedHook] || hookInstructions['insider-alert'];

  // Determine if TDU tool is relevant based on topic
  const tduRelevant = randomTopic.toLowerCase().includes('tdu') || 
                      randomTopic.toLowerCase().includes('delivery charge') ||
                      randomTopic.toLowerCase().includes('bill') ||
                      randomTopic.toLowerCase().includes('transmission and distribution');
  
  const resourceInstruction = tduRelevant 
    ? 'IMPORTANT: Since this post is about TDU charges or delivery charges, include a link to our TDU Delivery Charges Calculator: <a href="https://powerchoosers.com/tdu-delivery-charges">TDU Delivery Charges Calculator</a>. Only use this specific tool link when the topic is directly related to TDU/delivery charges.'
    : 'IMPORTANT: This post is NOT about TDU/delivery charges. Use a generic link to /resources instead. Do NOT reference the TDU calculator or any other tools that don\'t exist yet.';

  const headingRules = 'Heading rules: hook is plain text (no heading). Never use headings titled "Hook", "Introduction", "Section 1/2/3". Use descriptive, keyword-rich H2/H3 titles. Final H2 must be exactly "Conclusion".';

  const aiInstruction = randomTopic.toLowerCase().includes('ai') || randomTopic.toLowerCase().includes('automation') || randomTopic.toLowerCase().includes('machine learning')
    ? 'If the topic involves AI/automation/analytics, name-drop 1-2 leading models (ChatGPT, Gemini) naturally when discussing AI-driven analysis—do this only when AI is relevant.'
    : '';

  return `${randomTopic}\n\n${hookInstruction}\n\n${geographicInstruction}\n\n${contentTypeInstruction}\n\n${resourceInstruction}\n\n${headingRules}\n\n${aiInstruction}\n\n${context}\n\nGenerate a complete blog post following the structure and format specified in the system prompt. Remember: EVERY post must start with the specified HOOK formula, include an "Analyst Take" section with specific recommendations, and include an appropriate resource link (TDU calculator ONLY if topic is relevant, otherwise generic /resources link).`;
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

    // Ensure content includes resource funnel link (but don't force TDU tool if not relevant)
    if (!content.includes('/resources') && !content.includes('Resources Page') && !content.includes('tdu-delivery-charges')) {
      // Add generic resource funnel section if missing
      const resourceSection = `
<h3>Take Action: Access Our Resources</h3>
<p>To explore more energy resources and tools, visit our <a href="/resources">Resources Page</a>.</p>`;
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
    logger.error('[AI Post Generation] Failed to parse response:', error);
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

        logger.log(`[AI Post Generation] Loaded ${existingPosts.length} existing posts (published + drafts) for context`);
      } catch (firestoreError) {
        logger.warn('[AI Post Generation] Failed to load existing posts:', firestoreError);
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

    logger.log('[AI Post Generation] Calling Perplexity Sonar API...');

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
      logger.error('[AI Post Generation] Perplexity API error:', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const perplexityData = await perplexityResponse.json();
    const responseText = perplexityData.choices?.[0]?.message?.content || '';

    if (!responseText) {
      throw new Error('Empty response from Perplexity API');
    }

    // Parse response
    const generatedPost = parseAIResponse(responseText);

    logger.log('[AI Post Generation] Successfully generated post:', {
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
    logger.error('[AI Post Generation] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to generate post',
      details: error.message
    }));
  }
}

