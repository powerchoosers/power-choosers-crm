# Intelligence Brief Enhancement - Multi-Tier Research System

## Problem
The Intelligence Brief component was returning "No recent signals found" for many accounts because it relied solely on finding recent news articles, SEC filings, or LinkedIn posts. Small businesses and established companies without recent news coverage would get empty results.

## Solution
Implemented a **multi-tier intelligence generation system** that provides meaningful insights even when no news signals exist.

### Tier 1: News Signals (Existing)
- Google News RSS feeds
- Bing News search
- LinkedIn company pages and posts
- SEC filings (for public companies)
- General web search

### Tier 2: Fallback Intelligence (NEW)
When no news signals are found, the system now:
1. **Fetches company website** - Extracts company overview, services, team information, hiring status
2. **Searches industry trends** - Finds relevant 2026 industry trends affecting their sector
3. **Generates contextual brief** - Creates an intelligence brief positioning the company within industry context

## Key Changes

### 1. New Functions Added

#### `fetchCompanyWebsiteInfo(account: AccountRow)`
- Fetches and parses the company's website
- Extracts title, description, and body content
- Returns as a ResearchHit for AI processing

#### `fetchIndustryTrends(account: AccountRow)`
- Searches for industry-specific trends (e.g., "dental industry trends 2026")
- Focuses on technology adoption, digital transformation
- Returns up to 3 relevant news articles

#### Enhanced `runOpenRouterResearch(account, candidates, isFallbackMode)`
- Added `isFallbackMode` parameter
- Uses different prompts for news signals vs. fallback mode
- Fallback mode always generates a brief (never returns empty)
- Fallback briefs focus on industry context and growth opportunities

### 2. Handler Logic Updated

The main handler now follows this flow:

```
1. Try to collect news signals (existing behavior)
2. If news signals found → Generate news-based brief
3. If NO news signals OR brief generation failed:
   a. Enter fallback mode
   b. Fetch company website
   c. Fetch industry trends
   d. Generate contextual brief from company + industry data
4. Return result with `usedFallback` flag
```

## Example Output

### For Mill Forest Dental Group (No News Signals)

**Before Enhancement:**
```
Status: empty
Message: "No recent signals found for this account. Try again later or check the source manually."
```

**After Enhancement:**
```
Signal Headline:
"Multi-dentist practice positioned for digital transformation opportunity"

Signal Detail:
Mill Forest Dental Group operates as an established 6-dentist private practice serving the Clear Lake community for 30+ years. The practice is actively hiring ("always seeking dedicated professionals"), suggesting growth or capacity expansion. Industry data shows 84% of dental professionals believe digital transformation is essential for survival, with AI diagnostics, intraoral scanning, and 3D printing becoming standard.

Talk Track:
"I noticed you've built a strong multi-dentist practice over 30 years in Clear Lake. With 6 dentists and active hiring, you're clearly growing. I'm curious - as the industry shifts toward AI diagnostics and digital workflows, how are you thinking about technology investments? Many practices your size are finding that intraoral scanners and digital treatment planning not only improve patient outcomes but also help with the staffing challenges everyone's facing."

Signal Date: 2026-04-28
Confidence: Medium
Source: Company website + industry trends
```

## Benefits

1. **Always provides value** - No more empty results for small businesses
2. **Industry-aware** - Positions companies within their industry context
3. **Actionable insights** - Even without news, reps get talking points about industry trends
4. **Maintains quality** - Fallback briefs are clearly marked with "Medium" confidence
5. **Seamless UX** - Users don't need to know about the fallback system

## Technical Details

- **No breaking changes** - Existing API contract maintained
- **Backward compatible** - All existing functionality preserved
- **Performance** - Fallback mode only runs when needed (no news signals)
- **Error handling** - Graceful degradation if fallback also fails
- **Logging** - Clear console logs indicate when fallback mode is used

## Testing Recommendations

1. Test with accounts that have recent news (should use Tier 1)
2. Test with small businesses without news (should use Tier 2 fallback)
3. Test with accounts missing domain/industry fields
4. Verify cooldown period still works correctly
5. Check that `usedFallback` flag is properly returned in API response

## Future Enhancements

Consider adding:
- Tier 3: Basic company profile from public databases (Clearbit, ZoomInfo)
- Competitor analysis in fallback mode
- Technology stack detection from website
- Social media sentiment analysis
- Employee count trends from LinkedIn
