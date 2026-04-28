# Testing the Enhanced Intelligence Brief

## Quick Test Guide

### Test Case 1: Account with Recent News
**Example:** Large public company with recent announcements

**Expected Result:**
- Should find news signals from Google News, Bing, SEC filings
- `usedFallback: false`
- Confidence: High or Medium
- Source: News article or SEC filing URL

### Test Case 2: Small Business Without News (Mill Forest Dental Group)
**Account Details:**
- Name: Mill Forest Dental Group
- Industry: Dental
- Domain: millforestdental.com
- Location: Webster, TX

**Expected Result:**
- No news signals found
- Fallback mode activates
- Fetches company website
- Searches for "dental industry trends 2026"
- Generates brief about:
  - Company overview (6 dentists, 30+ years, actively hiring)
  - Industry context (digital transformation, AI adoption)
  - Talk track about technology opportunities
- `usedFallback: true`
- Confidence: Medium
- Source: Company website URL

### Test Case 3: Account Missing Domain
**Expected Result:**
- Tries news signals first
- If no news, fallback mode tries industry trends only
- May still generate brief if industry field exists
- If both fail, returns empty

### Test Case 4: Account Missing Industry
**Expected Result:**
- Tries news signals first
- If no news, fallback mode tries company website only
- May still generate brief from website content
- If fails, returns empty

## API Testing

### Using curl:

```bash
# Replace with your actual account ID and auth token
curl -X POST "http://localhost:3000/api/accounts/YOUR_ACCOUNT_ID/intelligence-brief" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected Response Structure:

```json
{
  "ok": true,
  "message": "Intelligence brief generated from company profile and industry context.",
  "brief": {
    "signal_headline": "...",
    "signal_detail": "...",
    "talk_track": "...",
    "signal_date": "2026-04-28",
    "source_url": "https://millforestdental.com",
    "confidence_level": "Medium"
  },
  "account": {
    "id": "...",
    "intelligenceBriefHeadline": "...",
    "intelligenceBriefStatus": "ready",
    "intelligenceBriefLastRefreshedAt": "2026-04-28T..."
  },
  "diagnostics": {
    "total": 2,
    "bySourceKind": {
      "web": 1,
      "news": 1
    }
  },
  "usedFallback": true
}
```

## UI Testing

1. **Navigate to Account Dossier**
   - Open an account detail page
   - Scroll to Intelligence Brief section

2. **Click Refresh Button**
   - Should show loading state: "Researching [Account Name]..."
   - Should display progress message about pulling signals

3. **Verify Results**
   - Check that brief appears (no more "No recent signals" for most accounts)
   - Verify all sections populated:
     - Signal Headline
     - Signal Detail
     - Talk Track
     - Signal Date
     - Confidence Level
     - Source link

4. **Test Copy Button**
   - Click "Copy" button
   - Paste into text editor
   - Should include all three sections formatted properly

5. **Test Cooldown**
   - Try refreshing again immediately
   - Should show cooldown message
   - Refresh button should be disabled

## Console Logs to Watch

When fallback mode activates, you should see:

```
[Intelligence Brief] Research candidates collected: { accountId: '...', accountName: '...', total: 0, bySourceKind: { news: 0, web: 0, sec: 0, linkedin: 0 } }
[Intelligence Brief] Entering fallback mode - fetching company website and industry trends
[Intelligence Brief] Fallback candidates collected: { accountId: '...', accountName: '...', fallbackTotal: 2 }
```

## Common Issues

### Issue: Still getting "No recent signals"
**Possible Causes:**
- Account missing both `domain` and `industry` fields
- Company website is down or blocking requests
- Industry trends search returned no results
- OpenRouter API error

**Debug:**
- Check console logs for error messages
- Verify account has `domain` or `industry` populated
- Check OpenRouter API key is configured

### Issue: Fallback brief quality is poor
**Possible Causes:**
- Company website has minimal content
- Industry field is too generic or misspelled
- No relevant industry trends found

**Solutions:**
- Ensure `industry` field is specific (e.g., "Dental Services" not just "Healthcare")
- Verify `domain` points to actual company website
- Check that website is accessible and has content

### Issue: Slow response time
**Expected:**
- News signal mode: 10-15 seconds
- Fallback mode: 15-20 seconds (additional website fetch + industry search)

**If slower:**
- Check network connectivity
- Verify OpenRouter API response times
- Check if website is slow to respond

## Success Criteria

✅ Accounts with news signals still work as before
✅ Accounts without news signals now get fallback briefs
✅ Fallback briefs are clearly marked (Medium confidence)
✅ Copy button works with fallback briefs
✅ UI shows appropriate loading states
✅ Cooldown period still enforced
✅ No breaking changes to existing functionality
