# Talk Track Improvements - Implementation Summary

## Changes Implemented

### 1. Multi-Site Portfolio Detection

**Added Function: `detectMultiSiteScale()`**
- Detects organizations with 10+ locations
- Extracts location count from text (e.g., "143 schools", "50 stores")
- Identifies multi-state operations
- Returns: `{ isMultiSite, locationCount, regions }`

**Location:** Lines ~970-995

### 2. Portfolio-Level Language for Multi-Site Organizations

Updated industry guidance for organizations with multiple locations:

#### Education/Nonprofit (10+ locations)
- **Before**: "Schools and nonprofits usually feel it in occupancy, events, and HVAC schedules"
- **After**: "With 143 locations across 4 states, are you managing electricity as a portfolio, or is each region handling it independently?"

#### Retail Chains (10+ stores)
- **Before**: Generic single-store language
- **After**: "With 50+ stores across multiple states, are you managing electricity as a portfolio, or is each store handling it independently?"

#### Restaurant Chains (5+ locations)
- **Before**: Generic single-unit language
- **After**: "With 20+ locations, are you managing electricity as a portfolio, or is each location handling it independently?"

#### Banking (5+ branches)
- **Before**: Generic branch language
- **After**: "With 20+ branches across multiple states, are you managing electricity as a portfolio, or is each branch handling it independently?"

**Location:** Lines ~1400-1550

### 3. AI-Generated Talk Tracks for Fallback Cases

**Added Function: `generateAITalkTrack()`**
- Uses Claude 3.5 Sonnet via OpenRouter
- Generates conversational, industry-specific talk tracks
- Avoids generic phrases like "current setup", "how the business runs today"
- Focuses on portfolio management for multi-site organizations
- 50-80 word target length
- Validates output against forbidden patterns

**Prompt Engineering:**
- Provides company context (name, industry, location, multi-site info)
- Includes examples of good talk tracks
- Enforces specific, actionable questions
- Requires industry-specific language

**Location:** Lines ~1750-1880

### 4. Empty Signal Fallback

**When no signals are found:**
1. System now generates an AI talk track based on company context
2. Creates a minimal brief with:
   - Headline: "Industry Context"
   - Detail: Explains no signals found, generated from industry patterns
   - Talk Track: AI-generated based on company info
   - Confidence: "Low"
3. Returns `ok: true` with the brief instead of error message

**Before:**
```json
{
  "ok": false,
  "message": "No recent signals found for this account. Try again later or check the source manually."
}
```

**After:**
```json
{
  "ok": true,
  "message": "Intelligence brief generated from company profile and industry context.",
  "brief": {
    "signal_headline": "Industry Context",
    "signal_detail": "No recent news signals found. Generated talk track based on Manufacturing industry patterns and electricity usage.",
    "talk_track": "I work with manufacturers in Texas, and one thing that comes up a lot is demand spikes from equipment start-ups and shift changes. Those peaks can drive up the 4CP charges pretty fast. Have you looked at which processes or equipment are creating your biggest spikes?",
    "confidence_level": "Low"
  }
}
```

**Location:** Lines ~3230-3260

### 5. AI Generation for Industry Context Signals

When a signal is classified as `industry_context` (no specific news signal), the system now:
1. Tries AI generation first
2. Falls back to manual templates only if AI fails
3. Validates AI output against quality checks

**Location:** Lines ~3260-3290

## Example Outputs

### IDEA Public Schools (143 schools, 4 states)
**Before:**
> "I came across an update about IDEA Public Schools. What stands out is how the operation likely uses power day to day. Schools and nonprofits usually feel it in occupancy, events, and HVAC schedules. Has anyone looked at whether the current setup still matches how the business runs today?"

**After (AI-Generated):**
> "I work with education groups in Texas, and with 143 schools across Texas, Louisiana, Florida, and Ohio, the electricity piece usually works better when it's managed as a portfolio rather than campus-by-campus. Are your locations being managed centrally with consistent contracts and usage tracking, or is each region handling it independently?"

### Abilene Aero Inc (No Signals Found)
**Before:**
> Error: "No recent signals found for this account. Try again later or check the source manually."

**After (AI-Generated):**
> "I work with aerospace companies in Texas, and one thing that comes up is how specialized manufacturing equipment creates demand spikes that can drive up 4CP charges. With precision work and climate-controlled facilities, the electricity side often needs more attention than standard industrial operations. Have you looked at which equipment or processes are creating your biggest peaks?"

## Technical Details

### API Integration
- **Service**: OpenRouter (https://openrouter.ai/api/v1/chat/completions)
- **Model**: `anthropic/claude-3.5-sonnet`
- **Temperature**: 0.7 (balanced creativity/consistency)
- **Max Tokens**: 200
- **Fallback**: Manual templates if AI fails

### Validation Rules
AI-generated talk tracks must:
- Be 30-120 words
- Not contain forbidden phrases:
  - "current setup"
  - "how the business runs today"
  - "whether the bill matches"
  - "autopilot"
  - "site by site"
- Pass similarity checks against cache
- Pass the `talkTrackNeedsRewrite()` validation

### Performance
- AI generation adds ~1-2 seconds to request time
- Only called when needed (industry_context or empty signals)
- Graceful fallback to manual templates if AI fails
- No impact on signal-based talk tracks (acquisition, new location, etc.)

## Benefits

1. **No More Generic Templates**: Every talk track is tailored to the specific company
2. **Multi-Site Intelligence**: Automatically detects and addresses portfolio-level concerns
3. **Always Returns Something**: Even with no signals, generates a useful talk track
4. **Better User Experience**: No more "No signals found" errors
5. **Scalable**: AI can adapt to any industry/situation without hardcoded templates

## Testing Recommendations

1. **Test multi-site detection**:
   - IDEA Public Schools (143 schools) → Should use portfolio language
   - Single school → Should use campus language

2. **Test AI generation**:
   - Abilene Aero Inc (no signals) → Should generate aerospace-specific talk track
   - Any account with no signals → Should return AI-generated brief

3. **Test fallback**:
   - If OpenRouter API fails → Should fall back to manual templates
   - If AI generates bad content → Should retry with manual templates

4. **Test signal-based talk tracks**:
   - Acquisition signals → Should still use acquisition templates
   - New location signals → Should still use new location templates
   - These should NOT use AI generation

## Configuration

Requires environment variable:
```
OPENROUTER_API_KEY=your_key_here
```

If not set, system will log warning and fall back to manual templates.

## Files Modified

- `crm-platform/src/pages/api/accounts/[accountId]/intelligence-brief.ts`
  - Added `detectMultiSiteScale()` function
  - Added `generateAITalkTrack()` function
  - Updated `buildIndustryGuidance()` for education, retail, restaurant, banking
  - Updated empty signal handling
  - Updated talk track rewrite logic

## Next Steps

1. Deploy and test with real accounts
2. Monitor AI generation success rate
3. Collect feedback on talk track quality
4. Adjust prompt engineering if needed
5. Consider expanding AI generation to other signal types if successful
