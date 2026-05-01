# Talk Track Generation Fix Proposal

## Problem Summary

The IDEA Public Schools talk track is falling back to generic `industry_context` language instead of leveraging the actual signal (National Alumni Advisory Council launch). This happens because:

1. **Signal not recognized**: The Alumni Advisory Council launch doesn't match any of the existing signal patterns in `inferSignalPriority()`
2. **Generic fallback**: When no signal pattern matches, it defaults to `industry_context` which uses generic industry templates
3. **Multi-site scale ignored**: The code doesn't detect that IDEA has 143+ schools and should use portfolio-level language
4. **Signal detail unused**: The "short description" field containing context about the signal is not being incorporated into talk track generation

## Root Cause Analysis

### Current Signal Classification Logic (lines 950-1050)

```typescript
function inferSignalPriority(text: string, fallbackPriority: number) {
  const lower = cleanText(text).toLowerCase()
  
  // Filter out religious content first
  if (/(rosh hashanah|yom kippur|passover|hanukkah|easter|christmas|prayer|sermon|worship service|spiritual|faith|blessing)/.test(lower)) {
    return fallbackPriority
  }
  
  if (/(acquir|merger|takeover|buyout)/.test(lower)) return 1
  if (hasStrongNewLocationEvidence(lower)) return 2
  if (hasLeadershipChangeEvidence(lower)) return 3
  if (/(expansion|capital expenditure|capex|headcount|growth|future site|buildout|build-out)/.test(lower)) return 4
  if (/(restructuring|closure|consolidation|downsizing|layoff|shutdown)/.test(lower)) return 5
  if (/(contract award|government contract|customer win|major customer|new customer)/.test(lower)) return 6
  if (/(funding round|series [abcde]|ipo|initial public offering|going public)/.test(lower)) return 7
  return fallbackPriority
}
```

**Issue**: "Alumni Advisory Council" doesn't match any of these patterns, so it returns `fallbackPriority` (usually 9), which causes `inferSignalFamily()` to return `'industry_context'`.

### Current Industry Template (lines 1400-1450)

```typescript
case 'education_nonprofit':
  return {
    label: 'Education / nonprofit',
    angle: 'Campus occupancy, events, HVAC schedules, and building controls drive the load more than the invoice total.',
    question: 'Do you know which buildings or schedules are driving the load, and whether smarter controls or occupancy planning could help?',
    openers: [
      `For schools and nonprofits, the power side usually comes down to budget discipline and timing.`,
      `Campus operations can change with occupancy, events, and seasonal usage even when the footprint looks stable.`,
      `That is the sort of setup where usage patterns matter more than the contract headline.`,
    ],
    focus: ['tight budgets', 'campus timing', 'stewardship', 'seasonal occupancy', 'controls', 'scheduling'],
  }
```

**Issue**: This is single-campus language. For a 143-school network, we need portfolio-level language.

## Proposed Fixes

### Fix 1: Expand Signal Recognition Patterns

Add patterns to recognize organizational scaling signals like advisory councils, program launches, and network expansion:

```typescript
function inferSignalPriority(text: string, fallbackPriority: number) {
  const lower = cleanText(text).toLowerCase()
  
  // Filter out religious content first
  if (/(rosh hashanah|yom kippur|passover|hanukkah|easter|christmas|prayer|sermon|worship service|spiritual|faith|blessing)/.test(lower)) {
    return fallbackPriority
  }
  
  if (/(acquir|merger|takeover|buyout)/.test(lower)) return 1
  if (hasStrongNewLocationEvidence(lower)) return 2
  if (hasLeadershipChangeEvidence(lower)) return 3
  
  // EXPANDED: Add organizational scaling signals
  if (/(expansion|capital expenditure|capex|headcount|growth|future site|buildout|build-out|advisory council|alumni council|network expansion|scaling|program launch|administrative program|portfolio expansion|multi-site expansion)/.test(lower)) return 4
  
  if (/(restructuring|closure|consolidation|downsizing|layoff|shutdown)/.test(lower)) return 5
  if (/(contract award|government contract|customer win|major customer|new customer)/.test(lower)) return 6
  if (/(funding round|series [abcde]|ipo|initial public offering|going public)/.test(lower)) return 7
  return fallbackPriority
}
```

### Fix 2: Enhance Growth Signal Guidance

Update the `growth` signal guidance to better handle organizational scaling signals:

```typescript
case 'growth':
  // Detect if this is an organizational/administrative scaling signal
  const isOrgScalingSignal = /(advisory council|alumni council|program launch|administrative program|network expansion|scaling programs|portfolio expansion)/.test(candidateText.toLowerCase())
  
  return {
    label: 'Growth / capex / headcount',
    angle: isOrgScalingSignal 
      ? 'Scaling administrative programs and operational infrastructure across a growing network.'
      : 'Growing load, added equipment, and budget creep before the bills catch up.',
    question: isOrgScalingSignal
      ? 'As you scale administrative programs across the network, how is the electricity side being managed—portfolio-wide or region-by-region?'
      : 'Has anyone checked whether the current setup still matches the way the site is growing?',
    openers: isOrgScalingSignal ? [
      sourceLead,
      `That kind of centralized coordination makes sense when you're operating across multiple regions.`,
      `As you're building portfolio-wide programs on the administrative side, it got me wondering how the electricity piece is being managed.`,
    ] : [
      sourceLead,
      `When headcount or capex starts moving, the electricity side usually changes before anyone notices it in the budget.`,
      `The thing I'd want to understand is whether the current setup still fits the way the operation is scaling.`,
    ],
    focus: isOrgScalingSignal 
      ? ['portfolio management', 'operational consistency', 'multi-site coordination', 'centralized programs', 'network scaling']
      : ['load growth', 'equipment additions', 'budget creep'],
  }
```

### Fix 3: Add Multi-Site Detection and Portfolio Language

Detect when an organization has many locations and adjust language accordingly:

```typescript
function detectMultiSiteScale(account: AccountRow, candidate: ResearchHit | null): { isMultiSite: boolean; locationCount: number | null; regions: string[] } {
  const text = `${account.name || ''} ${account.industry || ''} ${candidate?.title || ''} ${candidate?.snippet || ''}`
  const lower = text.toLowerCase()
  
  // Extract location count if mentioned
  const locationMatch = /(\d+)\s*(?:schools?|locations?|sites?|campuses|stores?|branches?|facilities|restaurants?|units?)/i.exec(text)
  const locationCount = locationMatch ? parseInt(locationMatch[1], 10) : null
  
  // Extract regions/states mentioned
  const statePattern = /(texas|california|florida|new york|ohio|louisiana|georgia|illinois|pennsylvania|north carolina|michigan|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|kentucky|oregon|oklahoma|connecticut|iowa|mississippi|arkansas|kansas|utah|nevada|new mexico|west virginia|nebraska|idaho|hawaii|maine|new hampshire|rhode island|montana|delaware|south dakota|north dakota|alaska|vermont|wyoming)/gi
  const states = text.match(statePattern) || []
  const uniqueStates = Array.from(new Set(states.map(s => s.toLowerCase())))
  
  const isMultiSite = (locationCount !== null && locationCount >= 10) || 
                      uniqueStates.length >= 2 ||
                      /(multi[-\s]?site|portfolio|network|chain|across \d+ (?:states?|regions?)|nationwide)/i.test(lower)
  
  return {
    isMultiSite,
    locationCount,
    regions: uniqueStates,
  }
}
```

### Fix 4: Update Education/Nonprofit Industry Guidance

Add multi-site variant for large education networks:

```typescript
case 'education_nonprofit':
  const multiSiteInfo = detectMultiSiteScale(account, null)
  
  if (multiSiteInfo.isMultiSite) {
    return {
      label: 'Education / nonprofit network',
      angle: 'Portfolio-level electricity management across multiple campuses and regions.',
      question: `Are your ${multiSiteInfo.locationCount || 'multiple'} ${multiSiteInfo.regions.length > 1 ? 'campuses across ' + multiSiteInfo.regions.length + ' states' : 'campuses'} being managed as a portfolio, or is each region handling electricity independently?`,
      openers: [
        `Multi-site education groups usually need a portfolio view to ensure consistency across the network.`,
        `With that kind of footprint, there's usually an opportunity to bring consistency to how sites are contracted and how usage is tracked.`,
        `The question I'd want answered is whether the electricity piece is being managed centrally or site-by-site.`,
      ],
      focus: ['portfolio management', 'multi-site coordination', 'operational consistency', 'centralized procurement', 'network visibility'],
    }
  }
  
  // Single-site fallback
  return {
    label: 'Education / nonprofit',
    angle: 'Campus occupancy, events, HVAC schedules, and building controls drive the load more than the invoice total.',
    question: 'Do you know which buildings or schedules are driving the load, and whether smarter controls or occupancy planning could help?',
    openers: [
      `For schools and nonprofits, the power side usually comes down to budget discipline and timing.`,
      `Campus operations can change with occupancy, events, and seasonal usage even when the footprint looks stable.`,
      `That is the sort of setup where usage patterns matter more than the contract headline.`,
    ],
    focus: ['tight budgets', 'campus timing', 'stewardship', 'seasonal occupancy', 'controls', 'scheduling'],
  }
```

### Fix 5: Use Signal Detail in Talk Track Generation

Pass the signal detail (short description) through to talk track generation and use it as context:

```typescript
function buildManualTalkTrack(
  account: AccountRow, 
  candidate: ResearchHit | null, 
  context: TalkTrackContext, 
  signalDetail: string | null,  // NEW PARAMETER
  attempt = 0
) {
  const companyName = cleanText(account.name) || 'the company'
  const sourceLead = buildSourceLead(account, candidate)
  const multiSiteInfo = detectMultiSiteScale(account, candidate)
  
  // Extract key context from signal detail
  const signalContext = signalDetail ? cleanText(signalDetail) : ''
  const hasNetworkExpansion = /expanding|expansion|network|across|portfolio|multi[-\s]?site|scaling/i.test(signalContext)
  const hasAdminProgram = /administrative|program|council|engagement|coordination|centralized/i.test(signalContext)
  
  // Use this context to enhance the talk track...
  // (rest of function)
}
```

## Expected Outcome

With these fixes, the IDEA Public Schools talk track would be:

**Before (Generic):**
> "I came across an update about IDEA Public Schools. What stands out is how the operation likely uses power day to day. Schools and nonprofits usually feel it in occupancy, events, and HVAC schedules. Has anyone looked at whether the current setup still matches how the business runs today?"

**After (Research-Based):**
> "I saw IDEA just launched their first National Alumni Advisory Council—15 alumni helping scale engagement programs across your 143-school network. That kind of centralized coordination makes sense when you're operating in 11 regions across four states. As you're building portfolio-wide programs on the administrative side, how is the electricity piece being managed? Are your 143 campuses being managed as a portfolio, or is each region handling it independently? With that kind of footprint, there's usually an opportunity to bring consistency to how sites are contracted and how usage is tracked across the network."

## Implementation Priority

1. **High Priority**: Fix 1 (Expand signal recognition) - This alone would move IDEA from `industry_context` to `growth`
2. **High Priority**: Fix 2 (Enhance growth guidance) - This would generate better talk tracks for organizational scaling signals
3. **Medium Priority**: Fix 3 & 4 (Multi-site detection) - This would improve all multi-site organizations, not just IDEA
4. **Low Priority**: Fix 5 (Use signal detail) - Nice to have but requires more refactoring

## Testing

After implementing, test with:
1. IDEA Public Schools (143 schools, Alumni Advisory Council signal)
2. Other multi-site education networks
3. Other organizational scaling signals (advisory boards, program launches, etc.)
4. Ensure existing signal types (acquisition, new_location, etc.) still work correctly
