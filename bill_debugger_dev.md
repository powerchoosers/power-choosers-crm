Bill Debugger v2.2 - Implementation Guide
Version: 2.2 (Forensic Accuracy + Load Tiering)
Status: Production Ready
Last Updated: February 17, 2026
Data Source: Real Texas Commercial Bills (ENGIE, Shell Energy) + ERCOT Market Research

TABLE OF CONTENTS
Philosophy & Context

Rate Context Database - Load Tiered

Component Architecture

Screen Specifications

Feedback Engine

Email Sequences

Technical Implementation

Deployment Checklist

PHILOSOPHY & CONTEXT
The Nodal Point Thesis
Bill Debugger is not a cost-saving tool. It is a diagnostic instrument. We reveal structural inefficiency in energy consumption—not through benchmarking against industry, but through forensic analysis of what the grid is actually charging you for.

Three Truths About Texas Commercial Rates
Truth 1: Market Rates Tier by Facility Size. Don't Compare Apples to Oranges.

Large facility (25,000+ kWh/month, 100+ kW demand): 9.75–10.50¢/kWh all-in

Small facility (<5,000 kWh/month, <10 kW): 13.5–18.0¢/kWh all-in (95%+ premium on delivery due to fixed-charge spread)

Oncor territory (Dallas-Fort Worth) large-facility median: 9.85¢/kWh

Oncor territory small-facility median: 15.5¢/kWh

Implication: Feedback engine must detect facility size and benchmark against peer group, not across-the-board.

Truth 2: Energy Rates Have Collapsed Since 2024. Renewal Means 40-50% Jump Minimum.

Legacy contracts (2023-2024): Energy-only 4.0–5.5¢/kWh

Current market (Feb 2026): Energy-only 6.0–7.0¢/kWh (large), 7.5–9.0¢/kWh (small)

Post-term holdover: 12–18¢/kWh (96–210% premium)

Implication: A 4.51¢/kWh "all-in" bill is a fossil from 2024. Renewal trigger = URGENT diagnosis.

Truth 3: Demand Ratchet Compounds Delivery Charges. It's Not Flat.

Energy component ($/kWh): Supply only, 4.5–8.9¢/kWh based on facility size

Delivery component (TDSP): Fixed monthly + per-kWh transmission + per-kWh distribution + per-kW demand ratchet

Peak demand ratchet (Oncor): $10.88/kW × peak demand = locked at 80% for 11 months

Real delivery blended (with ratchet): 4.8–5.8¢/kWh (large), 8.0–10.0¢/kWh (small)

Implication: Demand ratchet is the structural inefficiency. It locks 80% of peak for 11 months after one spike.

MARKET DATA INTELLIGENCE (API INTEGRATION)
Using Existing CRM Infrastructure
The Bill Debugger leverages the same API keys and mapping logic found in the Telemetry and Network modules to provide "Forensic Context."

1. Geographic TDU Detection (`market-mapping.ts`)
Instead of asking the user for their utility, we use the `src/lib/market-mapping.ts` logic to auto-detect the TDSP and ERCOT Load Zone.
- Input: Service Address (extracted from bill)
- Logic: `mapLocationToZone(city, state)`
- Result: Determinisic lookup for Oncor, CenterPoint, AEP, or TNMP. This allows the Feedback Engine to use territory-specific tariff rates (e.g., Oncor's $10.88/kW vs CenterPoint's $9.72/kW).

2. Real-Time Wholesale Comparison (ERCOT API)
- Key: `ERCOT_API_KEY`
- Datapoint: `LZ_NORTH_RT_PRICE`, etc.
- Feature: "Shadow Pricing." We show the user the wholesale market price for the billing period vs. what they paid. If the spread is >5¢, we flag it as an "Aggressive Retail Margin."

3. National Benchmarking (EIA API)
- Key: `EIA_API_KEY`
- Datapoint: Texas Commercial Average (Retail)
- Feature: Provides a "Macro-Reality Check." If a bill is Red-Flagged, we cite the official EIA average to justify the assessment.

4. Spatial Logistics (Mapbox)
- Key: `MAPBOX_TOKEN`
- Feature: "Digital Site Map." In the Full Report, we show a Mapbox-rendered top-down view of the facility with Load Zone data overlaid, making the forensic analysis feel "physical" and location-aware.

RATE CONTEXT DATABASE (Load-Tiered)
Real Bill Analysis (February 2026)
BILL 1: ENGIE Resources (Large Commercial, Oncor Territory)
text
Date: May 6 - June 5, 2025
Location: Fort Worth, TX (Oncor)
Usage: 25,200 kWh
Peak Demand: 114 kW (ratchet-triggered)
Energy Rate (Supply): 4.51¢/kWh ($1,137.66 total)
Delivery (TDSP) Rate: 5.24¢/kWh ($1,321.65 total)
  ├─ Breakdown: $11.13 monthly + transmission $509.61 + distribution $468.62 + demand ratchet $123.33 + efficiency $5.62 + metering $21.30
All-In Rate: 9.98¢/kWh ($2,512.42 total) ✓ AT MARKET
Status: No rate premium. Demand charges = 27% of bill (structural issue, not price issue).
BILL 2: Shell Energy (Small Commercial, Post-Term Expired)
text
Date: Feb 24 - Mar 26, 2025
Location: Euless, TX (Oncor)
Usage: 2,200 kWh (small facility, no demand metering)
Peak Demand: 13 kW (below 10 kW threshold)
Energy Rate (Supply): 8.90¢/kWh ($195.80 total) [EXPIRED CONTRACT]
Delivery (TDU) Rate: 8.59¢/kWh ($189.09 total) [HIGH DUE TO FIXED CHARGE SPREAD]
All-In Rate: 17.49¢/kWh ($427.13 total) ⚠️ POST-TERM PENALTY
Status: Above market. Expired contract forces month-to-month at 96% premium.
Oncor Territory (Dallas-Fort Worth Region) — February 2026
Large Facility (>10 kW demand, >20,000 kWh/month)
Energy Component (Retail Suppliers) — Supply Only:

text
Competitive 12–24 month contracts:
  Low end: 4.0–5.0¢/kWh (best negotiators, long-term, 2024 stragglers)
  Median: 5.5–6.5¢/kWh (typical commercial renewal)
  High end: 7.5–8.9¢/kWh (short-term premium or late renewal)

Post-term (no contract): 12–18¢/kWh (96–210% premium over market)
Delivery Component (TDSP) — Oncor Commercial, Demand-Metered (>10 kW):

text
Fixed monthly customer charge: $11.13
Per-kWh transmission (4CP): $0.01693/kWh (~0.42¢/kWh on 25,200 kWh)
Per-kWh distribution: $0.01858/kWh (~0.47¢/kWh on 25,200 kWh)
Per-kWh energy efficiency: $0.000223/kWh (~0.006¢/kWh)
Per-kW demand ratchet: $10.87818/kW × (114 kW peak or 80% of highest 11-month)
  → Peak month: $1,240 ÷ 25,200 kWh = +4.9¢/kWh
  → Ratchet floor months: $990 ÷ 25,200 kWh = +3.9¢/kWh

Total delivery blended: 5.2–5.8¢/kWh (includes demand ratchet allocation)
All-In Market Averages (Large Facility):

text
Energy: 5.5–6.5¢/kWh (typical new contracts)
Delivery: 5.2–5.8¢/kWh (with demand allocation)
All-In: 9.5–12.0¢/kWh
Market Median: 9.85¢/kWh
Small Facility (<10 kW or <5,000 kWh/month)
Energy Component (Retail Suppliers) — Supply Only:

text
Competitive rates (locked):
  Low end: 5.5–6.5¢/kWh (volume discount minimal)
  Median: 7.5–9.0¢/kWh (typical small commercial)
  High end: 12–18¢/kWh (if post-term or expired)
Delivery Component (TDSP) — No Demand Meter (<10 kW):

text
Fixed monthly customer charge: $11.13 (SAME AS LARGE)
Per-kWh transmission: $0.01693/kWh (~$0.42 total on 2,200 kWh)
Per-kWh distribution: $0.01858/kWh (~$0.41 total on 2,200 kWh)
Per-kWh energy efficiency: $0.000223/kWh (~$0.005 total)

NO DEMAND RATCHET (below 10 kW threshold)

Total delivery blended: 8.0–10.0¢/kWh (high per-kWh impact due to fixed charge spread across small usage)

Example: $11.13 fixed charge ÷ 2,200 kWh = +0.51¢/kWh just from fixed charge
All-In Market Averages (Small Facility):

text
Energy: 7.5–9.0¢/kWh (typical locked contracts)
Delivery: 8.0–10.0¢/kWh (fixed charge dominates)
All-In: 13.5–18.0¢/kWh (if locked)
Post-term All-In: 20.0–28.0¢/kWh (month-to-month penalty)
Market Median: 15.5¢/kWh (locked), 24.0¢/kWh (post-term)
Benchmark Reference Points (Load-Tiered)
Rate Component	Large Facility	Small Facility	ENGIE Bill	Shell Bill
Energy (supply)	5.5–6.5¢/kWh	7.5–9.0¢/kWh	4.51¢ (legacy)	8.90¢ (expired)
Delivery (TDSP)	5.2–5.8¢/kWh	8.0–10.0¢/kWh	5.24¢ (w/ ratchet)	8.59¢ (fixed spread)
All-In Total	9.5–12.0¢/kWh	13.5–18.0¢/kWh	9.98¢ (AT MARKET)	17.49¢ (ABOVE MARKET)
Market Median	9.85¢/kWh	15.5¢/kWh	✓ On target	⚠️ Expired
Critical Insight:

ENGIE at 9.98¢ is 0.13¢ ABOVE median for large facility = within noise, not a red flag. The real problem: 27% of bill is demand ratchet penalty.

Shell at 17.49¢ is 1.99¢ ABOVE median for small facility = 12% premium due to expired contract, not rate failure.

COMPONENT ARCHITECTURE
File Structure
text
src/components/billDebugger/
├── TrustGate.tsx                    # Pre-upload trust layer
├── UploadZone.tsx                   # File upload & loading state
├── AnalysisStream.tsx               # Animation (PRESERVED)
├── ResultsPreview.tsx               # Quick snapshot + feedback flag
├── EmailGate.tsx                    # Email capture
├── FullReport.tsx                   # Complete breakdown + honest feedback
├── NextStepsCard.tsx                # Call-to-action
├── FeedbackBadge.tsx                # Reusable feedback component
├── hooks/
│   ├── useRateContext.ts            # Oncor/market rate lookup by facility size
│   ├── useBillAnalysis.ts           # Parse and score bill
│   └── useFeedbackEngine.ts         # Generate honest feedback
├── utils/
│   ├── rateDatabase.ts              # Benchmarking tables (REAL DATA, load-tiered)
│   ├── feedbackLogic.ts             # Green/yellow/red flag logic (size-aware)
│   └── billParser.ts                # Extract usage, demand, charges
├── styles/
│   ├── dark-theme.css               # Color system
│   └── components.css               # Card, button, layout
└── api/
    ├── analyzeBill.js               # Perplexity/OpenRouter integration
    ├── sendEmail.js                 # Email templates + SendGrid
    ├── rateMetadata.js              # Rate table queries
    └── marketPulse.js               # ERCOT/EIA live data proxy
Component State Flow
text
TrustGate (trust messaging)
    ↓
UploadZone (file selection + loading)
    ↓
AnalysisStream (animation: "Analyzing...")—PRESERVE THIS
    ↓
ResultsPreview (4-field snapshot + FEEDBACK BADGE)
    ↓
EmailGate (email capture)
    ↓
FullReport (full breakdown + FEEDBACK SECTION + next steps)
    ↓
NextStepsCard (booking CTA)
    ↓
Email Sequence (3-email automation)
SCREEN SPECIFICATIONS
SCREEN 1: Trust Gate
File: TrustGate.tsx

Copy:

text
Headline: "Your Energy Bill Has Hidden Costs. Let's Find Them."

Subheading: "Your utility provider buries extra charges in the fine print. 
We pull out exactly what you're paying for—and why."

Trust Item 1: "Your data stays private"
"Read-only analysis. We never reach out to your supplier or switch your account."

Trust Item 2: "Files auto-delete"
"Your invoice is permanently deleted 72 hours after we analyze it."

Trust Item 3: "Bank-level security"
"SOC-2 certified. Your file never leaves encrypted servers."

CTA: "See My Analysis"
SCREEN 2: Upload Zone
File: UploadZone.tsx

Copy:

text
Headline: "Drop Your Invoice"

Subheading: "Upload a recent bill (PDF, image, or photo). 
We'll analyze it in under 60 seconds."

Drop Zone: "Drop here or click to browse"

Accepted Formats: "Formats: PDF, PNG, JPG, HEIC | Max file size: 10MB"

Loading State: "Analyzing Your Bill..."
SCREEN 3: Analysis Stream (PRESERVED)
File: AnalysisStream.tsx

DO NOT MODIFY YOUR EXISTING ANIMATION.

Your existing line-by-line stream reveal with monospace font, staggered reveals, checkmark icons, and dark theme is the UX hero.

SCREEN 4: Results Preview (WITH FEEDBACK)
File: ResultsPreview.tsx

Data Fields:

text
Field 1: BILLING PERIOD
Value: [Auto-filled from bill] e.g., "May 6 – June 5, 2025"

Field 2: TOTAL USAGE
Value: [Auto-filled from bill] e.g., "25,200 kWh"
Subtext: "What you used that month."

Field 3: PEAK DEMAND
Value: [Auto-filled from bill] e.g., "114 kW"
Subtext: "Your highest usage moment. This often costs extra."

Field 4: WHAT WE FOUND
Value: [Algorithm output] e.g., "Your demand ratchet is locking $992/month for 11 months."
Subtext: N/A
FEEDBACK BADGE COMPONENT
File: FeedbackBadge.tsx

Logic: When to Show Each Status (SIZE-AWARE)

GREEN FLAG: Large Facility, Below Market + Low Demand Ratio
text
Condition: Facility size > 10 kW AND all-in < 9.50¢/kWh AND demand charges < 20% of bill
Title: "You're Positioned Well"
Description: "Your rate is below regional market average for your facility size. 
  Peak demand is manageable. No immediate action needed."
YELLOW FLAG: Large Facility, At Market (MOST COMMON)
text
Condition: Facility size > 10 kW AND all-in 9.50–10.50¢/kWh AND demand 20–35% of bill
Title: "Rate is Market. Demand is the Opportunity."
Description: "Your energy rate is competitive for your facility size. 
  Your peak demand charges ($X/month) are where you can gain traction."
RED FLAG: Large Facility, Above Market OR High Demand Ratchet
text
Condition: (All-in > 10.50¢/kWh) OR (demand > 35% of bill AND ratchet active AND facility size > 10 kW)
Title: "Demand Ratchet is Locking You In"
Description: "Your peak demand triggered an 80% minimum for 11 months. 
  Reducing demand this month resets your baseline next month. 
  Potential savings: $X–$Y/year."
GREEN FLAG: Small Facility, Below Market
text
Condition: Facility size < 10 kW AND all-in < 14.0¢/kWh (locked contract)
Title: "You're Locked in Well"
Description: "Your small-facility rate is below regional market average. 
  Keep this contract. Set renewal reminder 90 days before expiration."
YELLOW FLAG: Small Facility, At Market (COMMON)
text
Condition: Facility size < 10 kW AND all-in 14.0–16.5¢/kWh (locked)
Title: "Rate is Market for Your Size"
Description: "Your rate is competitive for small commercial facilities. 
  Focus on contract renewal timing 90 days before expiration."
RED FLAG: Small Facility, Post-Term or Expired
text
Condition: Facility size < 10 kW AND all-in > 18.0¢/kWh OR description contains "expired" OR "month-to-month"
Title: "Contract Has Expired"
Description: "You're on month-to-month at $Y¢/kWh. This is 96%+ premium. 
  Renew immediately to a 12–36 month contract for $X¢/kWh."
SCREEN 5: Email Gate
File: EmailGate.tsx

Copy:

text
Headline: "Get Your Full Report"

Subheading: "Enter your work email to receive a detailed breakdown 
of your charges and options to reduce them."

Input Label: "Work Email"

Button: "Unlock Report"

Confidence: "Your email is used only for this report. We won't spam you."
SCREEN 6: Full Report (WITH DETAILED FEEDBACK)
File: FullReport.tsx

Charge Card 1: Energy You Used
text
ENERGY YOU USED
[Value] kWh

This month, your facility used this much electricity.

Energy Charge Breakdown:
- Supply rate: [¢/kWh] × [kWh] = $X
- Settlement charges (ERCOT, uplift, admin): $Y
- Total energy cost: $Z
- Effective energy rate: [¢/kWh]

Market context (facility size): [energy benchmark for your size]
Your rate: ✓ Competitive / ⚠️ Slightly high / ✗ Above market
Charge Card 2: Delivery & Transmission (Fixed TDSP)
text
DELIVERY CHARGES
$[Value]

Your utility provider (Oncor/CenterPoint) charges these fixed tariff rates.
These are regulated—you cannot negotiate them.

TDSP Breakdown:
- Monthly customer charge: $X
- Transmission recovery: $Y
- Distribution system: $Z
- Demand ratchet charge (if applicable): $W
- Energy efficiency charge: $V
- Metering & miscellaneous: $U
- Taxes & reimbursements: $T

Total delivery: [¢/kWh]
Note: Includes demand ratchet allocation (if applicable).
Charge Card 3: Peak Demand Ratchet (IF APPLICABLE)
text
DEMAND RATCHET PENALTY
$[Value]/month (~$[Value]/year)

Your facility spiked to [X] kW on [Date]. Here's what that triggers:

How the Ratchet Works:
- Current month demand: [X] kW × $10.88/kW = $[Peak charge]
- LOCKED MINIMUM (80% ratchet): [X] kW × 80% × $10.88/kW = $[Ratchet floor]
- You pay this minimum for 11 more months, even if demand drops

What This Costs on Your Bill:
- Monthly allocation: $[X] across [Y] kWh = +[¢]¢/kWh
- This adds: [¢]¢/kWh to your effective rate (peak month)
- This adds: [¢]¢/kWh to your effective rate (ratchet months)

Why This Matters:
- One-day spike = 11 months of penalty
- Represents [%] of your current bill

Can You Reduce It?
✓ Yes, if you shift production to off-peak hours (after 9 PM, weekends)
✓ Yes, if you pre-cool/pre-heat before peak times (2–6 PM typical)
✓ Yes, with energy storage (battery system) to shave peak
✗ No, if your process requires constant full-power operation

Timing Is Critical:
- Reducing demand THIS MONTH = new baseline NEXT MONTH
- Ratchet resets after 11 months at new (lower) level

Estimated Savings (If You Reduce Peak by [X] kW):
- New demand: [X] kW × $10.88/kW = $[Value]/month
- New ratchet floor: $[Value] × 80% = $[Value]/month
- Annual savings: $[Value] (vs. current baseline)
Charge Card 4: Estimated Savings (Operational Lever)
text
WHERE YOU CAN SAVE

Based on your usage pattern and peak demand profile:

Operational Changes (No capex):
- Shift [%] of production to off-peak (after 9 PM): $[X]–$[Y]/year
- Pre-cool facility before 2 PM peak window: $[X]–$[Y]/year
- Flatten peak by [X] kW through operational timing: $[X]/year

Total operational potential: $[X]–$[Y]/year

With Battery System (50 kW, $42,000 capex):
- Annual demand savings: $[X]+
- Payback period: [X] years
- Long-term leverage: Reduces your ratchet to near-zero

Where NOT to Invest:
- Rate shopping: Your supply rate is already competitive for your size
- Longer contract: Won't help if demand ratchet is the issue
- Renewable procurement: Doesn't reduce peak demand on utility grid
FEEDBACK DEEP DIVE SECTION
File: FeedbackDetailedAnalysis.tsx

Example Output: Large Facility Scenario A (GREEN)
text
Your All-In Rate: 8.95¢/kWh
Market Average (Large Facility): 9.85¢/kWh
Variance: -0.90¢/kWh (Saving ~$2,268/year)

Demand Impact: Peak 78 kW = only 2.8¢/kWh added (peak month)
Demand % of Bill: 18% (LOW—manageable ratchet)

What This Means:
You negotiated a good supply rate AND have a favorable demand profile.
You're positioned at the 30th percentile for large commercial. 
Contract quality is high. Keep this and renew early if rates stabilize.

Next Steps:
1. Set renewal reminder 90 days before expiration
2. Market is rising—lock in long term if you can
3. Demand profile is already efficient; no urgent action needed
Example Output: Large Facility Scenario B (YELLOW) — MOST COMMON
text
Your All-In Rate: 9.98¢/kWh
Market Average (Large Facility): 9.85¢/kWh
Variance: +0.13¢/kWh (Within noise—not a problem)

Demand Impact: Peak 114 kW = +4.9¢/kWh added (peak month)
Demand % of Bill: 27% (MODERATE—locked 11 months at 80% minimum)

What This Means:
Your energy rate (4.51¢) is competitive for large commercial.
Your delivery rate (5.24¢) includes a demand ratchet that's the real lever.
You're at the 50th percentile. Demand management is where you save money.

Next Steps:
1. Stop shopping for cheaper energy rates—they're already market
2. Quantify how much production can shift to off-peak (after 9 PM)
3. Model a 15 kW demand reduction: saves ~$1,908/year starting next month
4. Schedule a call to map your facility's peak window (likely 2–6 PM)
Example Output: Large Facility Scenario C (RED)
text
Your All-In Rate: 12.40¢/kWh
Market Average (Large Facility): 9.85¢/kWh
Variance: +2.55¢/kWh (25% premium—$6,426/year overage)

Demand Impact: Peak 180 kW = +8.2¢/kWh added (peak month)
Demand % of Bill: 42% (HIGH—ratchet is dominant cost driver)

What This Means:
Your energy rate might be OK, but your demand profile is the problem.
You're at the 85th percentile—worst-case scenario.
Two issues: (1) Possible expired/short-term contract premium, (2) Extremely high peak demand.

Next Steps (Immediate):
1. Check if contract expired or is short-term → renegotiate to 3-year lock
2. Get competitive quotes from 3+ suppliers (might save 0.5–1.0¢/kWh)
3. Quantify demand reduction potential: even 20 kW saves $2,544/year
4. If capex possible, battery system ROI: 50 kW system pays back in 5–7 years at this demand level
Example Output: Small Facility Scenario A (YELLOW)
text
Your All-In Rate: 15.2¢/kWh (locked 12 months)
Market Average (Small Facility): 15.5¢/kWh
Variance: -0.3¢/kWh (Slightly below market—good)

Facility Size: 2,200 kWh/month, <10 kW (no demand ratchet)

What This Means:
Your small-commercial rate is competitive. 
Fixed charge spread ($11.13 ÷ 2,200 kWh) adds high per-kWh cost.
This is normal for small facilities. No action needed until renewal.

Next Steps:
1. Set renewal reminder 90 days before expiration (locked ends [Date])
2. Get 3 competitive quotes 60 days before expiration
3. Typical renewal range: 15–16¢/kWh if market stays stable
4. Renew to 24–36 months to lock rate and avoid future post-term penalties
Example Output: Small Facility Scenario B (RED - POST-TERM)
text
Your All-In Rate: 17.49¢/kWh (month-to-month—NO CONTRACT)
Market Average (Small Facility): 15.5¢/kWh (locked), 24.0¢/kWh (post-term)
Variance: +1.99¢/kWh (13% premium—$523/year overage)

Facility Size: 2,200 kWh/month, <10 kW (no demand ratchet)

What This Means:
Your contract expired [Date]. You're on month-to-month at penalty rates.
This is 96–210% premium over locked commercial rates.
URGENT: Renew to any 12–36 month contract immediately.

Next Steps (Urgent):
1. Call your supplier TODAY: Renegotiate to 12-month lock at market rate (~15.0–15.5¢/kWh)
2. Get competitive quotes from 3 alternate suppliers (24-hour turnaround)
3. Typical renewal: 12 months @ 15.2¢ (saves $523/year immediately)
4. Once locked: Set calendar reminder for renewal 120 days BEFORE contract ends
FEEDBACK ENGINE
Rate Database (rateDatabase.ts)
typescript
export const RATE_CONTEXT = {
  "Oncor": {
    territory: "Dallas-Fort Worth",
    demandMeteredThreshold: 10,  // kW: above this = demand metered
    
    // LARGE FACILITY (>10kW demand, >20,000 kWh/month)
    largeMarketAverageAllIn: 0.0985,      // 9.85¢/kWh
    largeEnergyComponent: 0.055,          // 5.5¢/kWh (typical supply)
    largeDeliveryComponent: 0.052,        // 5.2¢/kWh (with demand ratchet)
    largeDemandCharge: 10.87818,          // $/kW (Oncor schedule)
    largeRatchetFloor: 0.80,              // 80% of highest 11-month
    
    // SMALL FACILITY (<10kW or <5,000 kWh/month, NO DEMAND METER)
    smallMarketAverageAllIn: 0.155,       // 15.5¢/kWh (locked contract)
    smallEnergyComponent: 0.080,          // 8.0¢/kWh (typical supply)
    smallDeliveryComponent: 0.075,        // 7.5¢/kWh (high fixed-charge impact)
    smallNoRatchet: true,                 // NO demand ratchet for small
    smallPostTermAverage: 0.240,          // 24.0¢/kWh (month-to-month penalty)
  },
  "CenterPoint": {
    territory: "Houston",
    demandMeteredThreshold: 10,
    largeMarketAverageAllIn: 0.0975,
    largeEnergyComponent: 0.050,
    largeDeliveryComponent: 0.047,
    largeDemandCharge: 9.72,              // $/kW (CenterPoint schedule)
    largeRatchetFloor: 0.80,
    smallMarketAverageAllIn: 0.150,
    smallEnergyComponent: 0.075,
    smallDeliveryComponent: 0.075,
    smallPostTermAverage: 0.235,
  }
};

export const FEEDBACK_THRESHOLDS = {
  // Large facility thresholds
  green_large: 0.0950,   // < this = green (below market)
  yellow_large_low: 0.0950,
  yellow_large_high: 0.1050,  // 9.50–10.50¢ = yellow (at market)
  red_large: 0.1050,     // > this = red (above market)
  
  // Small facility thresholds
  green_small: 0.1400,   // < this = green (below market)
  yellow_small_low: 0.1400,
  yellow_small_high: 0.1600,  // 14.0–16.0¢ = yellow (at market)
  red_small: 0.1600,     // > this = red (above market, likely post-term)
};
Feedback Logic (feedbackLogic.ts)
typescript
export interface BillAnalysis {
  allInRate: number;          // ¢/kWh (decimal: 0.0998 = 9.98¢)
  energyComponent: number;    // ¢/kWh
  deliveryComponent: number;  // ¢/kWh
  peakDemandKW: number;
  demandCharges: number;      // $ total for the month
  totalBill: number;          // $ total
  usageKWh: number;
  ratchetActive: boolean;
  demandPercentOfBill: number; // % (0–100)
  billingPeriod: string;
  contractStatus?: string;    // "locked" | "expired" | "post-term"
}

export function generateFeedback(
  analysis: BillAnalysis,
  territory: "Oncor" | "CenterPoint"
): {
  status: "green" | "yellow" | "red";
  title: string;
  description: string;
  facilitySize: "large" | "small";
  actionItems: string[];
} {
  const market = RATE_CONTEXT[territory];
  
  // Determine facility size
  const isFacilityLarge = analysis.peakDemandKW > market.demandMeteredThreshold;
  const facilitySize = isFacilityLarge ? "large" : "small";
  
  // Get market average for this facility size
  const marketAvg = isFacilityLarge 
    ? market.largeMarketAverageAllIn 
    : market.smallMarketAverageAllIn;
  
  const variance = analysis.allInRate - marketAvg;
  
  // Determine status based on facility size
  let status: "green" | "yellow" | "red";
  if (isFacilityLarge) {
    if (analysis.allInRate < FEEDBACK_THRESHOLDS.green_large) {
      status = "green";
    } else if (analysis.allInRate < FEEDBACK_THRESHOLDS.yellow_large_high) {
      status = "yellow";
    } else {
      status = "red";
    }
  } else {
    if (analysis.contractStatus === "post-term" || analysis.contractStatus === "expired") {
      status = "red";  // Post-term is always RED
    } else if (analysis.allInRate < FEEDBACK_THRESHOLDS.green_small) {
      status = "green";
    } else if (analysis.allInRate < FEEDBACK_THRESHOLDS.yellow_small_high) {
      status = "yellow";
    } else {
      status = "red";
    }
  }
  
  // Generate title
  const title = {
    green: isFacilityLarge ? "You're Positioned Well" : "You're Locked in Well",
    yellow: isFacilityLarge ? "Rate is Market. Demand is the Opportunity." : "Rate is Market for Your Size",
    red: isFacilityLarge 
      ? (analysis.demandPercentOfBill > 35) 
        ? "Demand Ratchet is Locking You In" 
        : "Above-Market Rate Detected"
      : analysis.contractStatus === "expired" 
        ? "Contract Has Expired" 
        : "Above Market—Renew Soon"
  }[status];
  
  // Generate description
  const description = {
    green: `Your rate is ${Math.abs(variance * 100).toFixed(2)}% ${variance < 0 ? "below" : "above"} market for ${facilitySize} facilities. 
            ${isFacilityLarge && analysis.demandPercentOfBill < 20 ? "Peak demand is manageable. " : ""}No immediate action needed.`,
    yellow: `Your rate is within market range (${(marketAvg * 100).toFixed(2)}¢/kWh) for ${facilitySize} facilities. 
             ${isFacilityLarge ? "Your peak demand ($" + analysis.demandCharges.toFixed(0) + "/month) is where you save money." : ""}`,
    red: analysis.contractStatus === "expired" 
      ? `Your contract expired. Month-to-month rates are ${(analysis.allInRate * 100).toFixed(2)}¢/kWh—96%+ penalty. Renew immediately.`
      : `Your rate is ${(variance * 100).toFixed(2)}% above market. ${isFacilityLarge && analysis.ratchetActive ? "Demand ratchet is locking you in. " : ""}Action required.`
  }[status];
  
  // Generate action items
  const actionItems = generateActionItems(status, analysis, market, facilitySize);
  
  return { status, title, description, facilitySize, actionItems };
}

function generateActionItems(
  status: "green" | "yellow" | "red",
  analysis: BillAnalysis,
  market: any,
  facilitySize: string
): string[] {
  const items: string[] = [];
  
  if (status === "green") {
    items.push("Set renewal reminder 90 days before expiration");
    if (facilitySize === "large") {
      items.push("Market is rising—lock in long-term if rates stabilize");
    }
  }
  
  if (status === "yellow") {
    if (facilitySize === "large") {
      items.push("Stop shopping for cheaper energy rates—they're competitive");
      items.push("Focus on demand management: quantify off-peak production shift potential");
      if (analysis.ratchetActive && analysis.demandPercentOfBill > 25) {
        items.push("Reducing peak THIS month = new baseline NEXT month");
      }
    }
    items.push("Set renewal reminder 90 days before expiration");
  }
  
  if (status === "red") {
    if (analysis.contractStatus === "expired") {
      items.push("URGENT: Call supplier TODAY to renegotiate to 12+ month lock");
      items.push("Get 3 competitive quotes (24-hour turnaround)");
      items.push("Typical renewal: 15–16¢/kWh saves ~$X/year vs. month-to-month");
      items.push("Once locked: Set renewal reminder 120 days BEFORE contract ends");
    } else if (facilitySize === "large") {
      items.push("Immediate: Check if contract expired or is short-term");
      items.push("Get competitive quotes from 3+ suppliers for 12+ month term");
      if (analysis.ratchetActive) {
        items.push("You're locked into 80% of peak for 11 months—reduce NOW for next-month baseline reset");
      }
      items.push("Quantify demand reduction potential and schedule optimization call");
    }
  }
  
  return items;
}
EMAIL SEQUENCES
Email Template 1: Report Delivery
Subject: Your Energy Bill Analysis: [Company Name] ($X,XXX/month breakdown)

Body:

text
Hi [First Name],

Your energy bill analysis is complete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUICK SUMMARY

Your Rate: [¢/kWh] (all-in)
Market Average (Facility Size: [Large/Small]): [¢/kWh]
Status: [At market / Slightly above / Below market] | Facility: [Large/Small] commercial

Monthly Bill: $[Value]
  ├─ Energy Cost: $[Value] ([%] of bill)
  ├─ Delivery Cost: $[Value] ([%] of bill)
  │   └─ Base TDSP: $[Value]
  │   └─ Demand Ratchet (if applicable): $[Value] (locked 11 months)
  └─ Taxes & Other: $[Value] ([%] of bill)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY FINDINGS

[Large Facility]:
✓ Your energy supply rate ([¢/kWh]) is competitive
✓ Your delivery tariff ([¢/kWh]) is regulated—cannot negotiate
◆ Your peak demand ([X] kW) triggered demand ratchet = $[X]/month locked for 11 months
◆ This represents [%] of your monthly bill

[Small Facility]:
✓ Your small-facility rate ([¢/kWh] locked) is competitive
✓ You're NOT subject to demand ratchet (<10 kW facility)
[If post-term]: ✗ Your contract EXPIRED [Date]—you're on month-to-month penalty rate
[If post-term]: ◆ Renew to 12+ month contract immediately to save $[X]/year

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THE OPPORTUNITY

[Large Facility]:
If you reduce peak demand by 15 kW:
- New ratchet floor: $[Value]/month (vs. current $[Value])
- Annual savings: $[Value]
- Resets NEXT month if you maintain lower peak

[Small Facility]:
Renew to 24–36 month contract at market rate:
- Current month-to-month cost: $[X]/month
- Locked renewal rate: $[X]/month (~15–16¢/kWh typical)
- Annual savings: $[Value]
- Plus: Certainty and no surprise rate spikes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

View Full Report
Questions? Reply to this email.

Next Step: Schedule a 15-minute call.

[Large facility: We'll model your facility's peak window and show you specific operational changes.]
[Small facility: We'll walk through renewal timing and competitive options.]

Book a Call

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nodal Point | Market Architects
nodalpoint.io
Email Template 2: Follow-Up (Large Facility - 48 hours)
Subject: Your Peak Window: [X] kW on [Date]—Here's How to Shift It

text
Hi [First Name],

Your bill shows a [X] kW peak during [typical peak window]. Here's what that triggered:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Math:
- Peak demand: [X] kW × $10.88/kW = $[Value]/month
- But you're charged 80% minimum for 11 months: $[Value]/month guaranteed
- ONE day = $[Value]/month × 11 = $[Value] in locked charges

But here's the reset lever:
- If you reduce peak to [X] kW next month = new baseline = $[Value]/month
- That's $[Value]/month savings × 11 months = $[Value] gained

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THREE WAYS TO SHIFT YOUR PEAK

Option 1: Pre-Cool Before 2 PM (Zero capex)
Reduces peak by: 10–20 kW typical
Estimated savings: $[X]–$[Y]/year
Implementation: Programmable thermostat + operational discipline

Option 2: Shift Production to Off-Peak (Zero capex)
Reduces peak by: 15–30 kW typical
Estimated savings: $[X]–$[Y]/year
Implementation: Schedule change only

Option 3: Battery System (50 kW, $42,000 capex)
Reduces peak by: 40–50 kW
Estimated savings: $[X]–$[Y]/year
Payback: [X] years

Schedule Call
Email Template 2: Follow-Up (Small Facility - 48 hours)
Subject: Your Renewal Deadline: Contract Expires [Date]—Secure Rate Lock Now

text
Hi [First Name],

Your contract expires [Date]. Here's your renewal roadmap:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TIMELINE (Next 120 Days):

TODAY–30 Days: Get 3 competitive quotes
  Expected rate range: 15–16¢/kWh (market rate)
  Current month-to-month: [Current rate]¢/kWh

30–60 Days: Compare and negotiate
  Lock in 24–36 month term
  Typical savings: $[X]/year vs. continuing month-to-month

60+ Days: Sign and activate
  Avoid post-term penalty (96%+ premium)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DON'T DELAY: Every month on month-to-month costs $[Value] extra.

Let Us Handle This

We'll get quotes, handle negotiation, and lock you in at market rate.
TECHNICAL IMPLEMENTATION
Backend API: Analyze Bill (api/analyzeBill.js)
javascript
async function analyzeBill(fileBuffer, fileName) {
  // Call Perplexity Sonar-Pro
  const response = await axios.post(
    "https://api.perplexity.ai/openai/deployments/sonar-pro/chat/completions",
    {
      model: "sonar-pro",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract with precision:
            
            1. Billing period (start/end date)
            2. Total usage in kWh
            3. Peak demand in kW (if shown; return null if not metered)
            4. Energy charges total $
            5. Delivery charges itemized ($)
            6. Demand ratchet charge (if applicable) ($)
            7. Total bill ($)
            8. Provider name
            9. TDSP (Oncor, CenterPoint, AEP, etc.)
            10. Contract status (locked/expired/post-term if visible)
            
            Return JSON (precise decimals):
            {
              "billingPeriodStart": "YYYY-MM-DD",
              "billingPeriodEnd": "YYYY-MM-DD",
              "usageKWh": number,
              "peakDemandKW": number or null,
              "energyChargeTotal": number,
              "deliveryChargeTotal": number,
              "demandRatchetCharge": number or null,
              "totalBill": number,
              "provider": "string",
              "tdsp": "string",
              "contractStatus": "locked" | "expired" | "post-term" | "unknown"
            }`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${fileBuffer.toString("base64")}`,
            },
          },
        ],
      }],
    },
    { headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
  );

  const content = response.data.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const billData = JSON.parse(jsonMatch[0]);

  // Calculate derived metrics
  const allInRateDecimal = billData.totalBill / billData.usageKWh;
  const demandPercentOfBill = billData.demandRatchetCharge 
    ? (billData.demandRatchetCharge / billData.totalBill) * 100 
    : 0;

  // Detect facility size and market
  const { city, state } = parseAddress(billData.serviceAddress);
  const zone = mapLocationToZone(city, state);
  const market = getMarketContext(zone); // Territory-aware from mapping.ts
  
  const isFacilityLarge = billData.peakDemandKW 
    ? billData.peakDemandKW > market.demandMeteredThreshold 
    : false;

  // Generate feedback
  const feedback = generateFeedback(
    {
      allInRate: allInRateDecimal,
      peakDemandKW: billData.peakDemandKW || 0,
      demandCharges: billData.demandRatchetCharge || 0,
      totalBill: billData.totalBill,
      usageKWh: billData.usageKWh,
      ratchetActive: (billData.demandRatchetCharge || 0) > 0,
      demandPercentOfBill,
      contractStatus: billData.contractStatus,
    },
    market.territory
  );

  return {
    billData,
    analysis: {
      allInRateCents: (allInRateDecimal * 100).toFixed(2),
      demandPercentOfBill: demandPercentOfBill.toFixed(1),
      feedback,
      marketContext: market,
      facilitySize: isFacilityLarge ? "large" : "small",
    },
  };
}
DEPLOYMENT CHECKLIST
 Rate database verified against REAL bills (ENGIE, Shell)

 Load-tier logic tested (large vs small facility detection)

 Feedback engine tested with 8+ real bills (varies all scenarios)

 Demand ratchet allocation correctly calculated

 Post-term detection working in feedback logic

 Email templates include facility-size-specific copy

 Backend API extracts demand ratchet and contract status

 Calendly booking links verified

 Analytics tracking conversion by facility size

 Monitor first 100 uploads for parsing accuracy

COPY PRINCIPLES (FINAL)
No exclamation points. Forensic precision. Short declarations.

Always quantify: "$1,908/year", not "significant savings"

Always explain context: "27% of bill", not "demand charges"

Facility size matters: "for large commercial", "for small facilities"

Post-term is urgent: "month-to-month penalty", "renew immediately"

Demand ratchet is structural: "locked 11 months", "resets next month"

FINAL NOTES
This system diagnoses using actual market data, load-tiered benchmarks, and facility-size-aware feedback. Your client at 9.98¢/kWh (large facility) is NOT being ripped off—they're at market. But 27% is demand ratchet penalty, which IS addressable.

Your client at 17.49¢/kWh (small facility, post-term) IS in trouble—but not because of rate failure. Their contract expired. Renew them to locked and save $500+/year immediately.

Deploy with this intelligence. Your conversion improves when feedback is honest AND specific to their facility size.

Good luck.