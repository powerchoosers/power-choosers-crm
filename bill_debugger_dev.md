# Bill Debugger - Developer Flow Guide
## Nodal Point | Implementation Ready

**Purpose:** Complete screen-by-screen implementation guide. All text copy is production-ready. Preserve the animation between bill upload and analysis results.

---

## BEFORE UPLOAD: Trust Gate

### Screen Name: `TrustGate.tsx`

**Component Structure:**
```
<div className="trust-gate">
  <header>
    <h1>{headline}</h1>
    <p>{subheading}</p>
  </header>
  
  <div className="trust-items">
    {trustItems.map(item => <TrustItem key={item.id} {...item} />)}
  </div>
  
  <footer>
    <button className="cta-primary">{ctaText}</button>
    <a href="#methodology" className="link-secondary">{methodologyLink}</a>
  </footer>
</div>
```

**Headline:**
```
Your Energy Bill Has Hidden Costs.
Let's Find Them.
```

**Subheading:**
```
Your utility provider buries extra charges in the fine print. 
We pull out exactly what you're paying for—and why.
```

**Visual Cues:**
- Dark background (obsidian, #0f1419)
- Single blurred invoice image (no detail visible, just shape)
- Monospace accent numbers (if you show an example charge)

**Three Trust Items (small text, gray):**

1. **"Your data stays private"**
   - Read-only analysis. We never reach out to your supplier or switch your account.

2. **"Files auto-delete"**
   - Your invoice is permanently deleted 72 hours after we analyze it.

3. **"Bank-level security"**
   - SOC-2 certified. Your file never leaves encrypted servers.

**Methodology Link (optional modal):**

Title: `How We Analyze Your Bill`

Content:
```
We break down your energy bill into three parts:

1. Energy costs (what you actually used)
2. Delivery charges (fees to move power to your building)
3. Peak demand penalties (extra charges if you used power during high-demand times)

Most facilities can reduce at least one of these through better timing 
or peak management. We show you which one affects your bill most.
```

**CTA Button:**
```
See My Analysis
```

**Button Behavior:**
- Navigate to `UploadZone.tsx`
- Smooth fade transition (200ms)
- No micro-interactions needed

---

## UPLOAD ZONE: The Clean Room

### Screen Name: `UploadZone.tsx`

**Component Structure:**
```
<div className="upload-zone">
  <header>
    <h2>{headline}</h2>
    <p>{subheading}</p>
  </header>
  
  <DropZone 
    onFileSelect={handleFileSelect}
    isDragging={isDragging}
  />
  
  <div className="accepted-formats">
    {formatsInfo}
  </div>
</div>
```

**Headline:**
```
Drop Your Invoice
```

**Subheading:**
```
Upload a recent bill (PDF, image, or photo). 
We'll analyze it in under 60 seconds.
```

**Drop Zone:**
- Border: dashed, 2px, light gray (#475569)
- Background: slightly elevated surface
- Drag state: border brightens, text changes
- Icon: cloud with upward arrow (system icon)
- Text: "Drop here or click to browse"

**Drag State Text (when file hovers):**
```
Ready to analyze...
```

**Accepted Formats (small text below):**
```
Formats: PDF, PNG, JPG, HEIC
Max file size: 10MB
```

**Loading State (critical — preserve animation):**

After file uploads, show:
```
Analyzing Your Bill...
```

- Minimal spinner (CSS or SVG, no JavaScript animation library)
- **DO NOT INTERRUPT THIS STATE.** This is where your Perplexity/OpenRouter parsing happens.
- No percentage counter
- No fake progress bar
- Duration: 4–8 seconds (actual parse time)
- User can see upload is happening (feels real, not a wait screen)

---

## ANIMATION LAYER: Real-Time Stream

### Screen Name: `AnalysisStream.tsx` (Your existing animation)

**PRESERVE THIS EXACTLY AS-IS.**

What triggers it:
- File upload completes
- Backend returns stream data
- Frontend renders line-by-line animation

Example stream output from backend:
```
Parsing your bill structure...
Extracting charge categories...
Calculating peak demand impact...
Modeling energy cost breakdown...
Analyzing your usage pattern...
Building your report...

✓ Analysis complete.
```

**Your animation already handles:**
- Monospace font rendering
- Staggered line reveals (100–150ms per line)
- Checkmark icons
- Dark theme with accent color highlights
- 4–6 second total duration

**No changes needed.** This is the UX hero. Keep it.

---

## RESULTS: Signal Detected

### Screen Name: `ResultsPreview.tsx`

**Component Structure:**
```
<div className="results-preview">
  <header>
    <h1>Analysis Complete</h1>
  </header>
  
  <div className="snapshot-card">
    {snapshotData.map(field => <DataField key={field.id} {...field} />)}
  </div>
  
  <footer>
    <button className="cta-secondary">{ctaText}</button>
  </footer>
</div>
```

**Headline (after animation completes):**
```
Analysis Complete
```

**Snapshot Card** (4 key fields only — keep it tight):

**Field 1: Billing Period**
```
Label: BILLING PERIOD
Value: [automatically from bill]
Example: May 6 – June 5, 2025
```

**Field 2: Energy Usage**
```
Label: TOTAL USAGE
Value: [automatically from bill]
Example: 25,200 kWh
Context: (Small text below) What you used that month.
```

**Field 3: Peak Demand**
```
Label: PEAK DEMAND
Value: [automatically from bill]
Example: 114 kW
Context: (Small text below) Your highest usage moment. This often costs extra.
```

**Field 4: What We Found**
```
Label: WHAT WE FOUND
Value: [algorithm-determined summary]
Example: "You have peak demand charges that might be reducible through better timing."
Context: One sentence only. Plain language.
```

**Visual Design:**
- Card background: slightly elevated surface (#1e293b)
- Numbers: accent color (teal, #38bdf8)
- Labels: gray text (#94a3b8)
- Spacing: 24px gutters, monospace font for numbers

**CTA Button:**
```
See Full Report
```

**Button Behavior:**
- Navigate to email gate (see next section)
- Color: primary accent
- Size: 48px tall, full width on mobile

**Micro-text below button (optional):**
```
Unlock your complete report with your email.
```

---

## EMAIL GATE: Value Exchange

### Screen Name: `EmailGate.tsx`

**Component Structure:**
```
<div className="email-gate">
  <header>
    <h1>{headline}</h1>
    <p>{subheading}</p>
  </header>
  
  <form onSubmit={handleSubmit}>
    <input type="email" placeholder={placeholder} required />
    <button type="submit">{ctaText}</button>
  </form>
  
  <footer>
    <p>{confidenceMessage}</p>
  </footer>
</div>
```

**Headline:**
```
Get Your Full Report
```

**Subheading:**
```
Enter your work email to receive a detailed breakdown 
of your charges and options to reduce them.
```

**Input Field:**
- Type: email
- Placeholder: `your.name@company.com`
- Validation: standard HTML5 email
- Label (above): "Work Email"

**CTA Button:**
```
Unlock Report
```

**Button Behavior:**
- On submit:
  1. Validate email format
  2. Show brief success state: `"Sending your report..."`
  3. Send email immediately (backend task)
  4. Redirect to `FullReport.tsx` (same window or new tab, your choice)
  5. Duration of success state: 1–2 seconds

**Confidence Message (small text, gray):**
```
Your email is used only for this report. We won't spam you.
```

---

## FULL REPORT: Complete Analysis

### Screen Name: `FullReport.tsx`

**Component Structure:**
```
<div className="full-report">
  <header>
    <h1>Your Energy Bill Breakdown</h1>
    <p className="meta">{providerAndPeriod}</p>
  </header>
  
  <section className="charge-cards">
    {chargeBreakdown.map(card => <ChargeCard key={card.id} {...card} />)}
  </section>
  
  <section className="next-steps">
    <NextStepsCard />
  </section>
</div>
```

**Header:**
```
Your Energy Bill Breakdown

Analyzed: [Provider Name] | [Billing Period]
```

**Charge Card 1: Energy Usage**

```
ENERGY YOU USED
25,200 kWh

This month, your facility used about this much electricity.
We use this to determine if you're comparable to other businesses like yours.

Cost breakdown:
- Energy supply: $X,XXX
- Taxes: $XXX
```

**Charge Card 2: Delivery & Fees**

```
DELIVERY CHARGES
$X,XXX

This is what your utility charges to move power to your building.
It includes system maintenance, upgrades, and emergency response.

Breakdown:
- Transmission: $XXX
- Distribution: $XXX
- System support: $XXX
```

**Charge Card 3: Peak Demand Impact**

```
PEAK DEMAND PENALTY
$X,XXX (estimated)

During 4 peak days this month, your usage spiked to 114 kW.
Your supplier charges extra for these moments—it's their way of managing grid stress.

Why this happens:
- You used power when everyone else did
- Your peak was in the top 4 moments of the month
- Extra charges are built into your rate

Can you reduce it?
- Yes, if you can shift some usage to off-peak hours
- Yes, if you can pre-cool/pre-heat your facility before peaks
- No, if your process requires constant power
```

**Charge Card 4: Estimated Savings (Optional)**

```
WHERE YOU CAN SAVE

Based on your usage pattern, we estimate you could reduce your bill by:
• $X,XXX/month by managing peak demand
• $X,XXX/month by shifting usage to off-peak hours
• Total potential: $XX,XXX/year
```

**Visual Design (All Cards):**
- Background: dark surface (#1e293b)
- Numbers/Amounts: accent color, larger font
- Section titles: uppercase, gray (#94a3b8)
- Body text: light gray (#cbd5e1)
- Icons: optional (lightning bolt, dollar sign, trending down)
- Spacing: 32px between cards, 24px padding inside

---

## CALL TO ACTION: Next Steps

### Screen Name: `NextStepsCard.tsx` (Bottom of Full Report)

**Component Structure:**
```
<div className="next-steps">
  <h2>{headline}</h2>
  <p>{description}</p>
  <button className="cta-primary">{ctaText}</button>
  <p className="assurance">{assurance}</p>
</div>
```

**Headline:**
```
What's Next?
```

**Description:**
```
Schedule a brief call with our team. We'll walk through your bill, 
explain what's driving your costs, and show you specific options 
to lower them. No obligation, no sales pitch.
```

**CTA Button:**
```
Book a Call
```

**Button Behavior:**
- Links to booking system (Calendly embed, custom booking flow, or calendar link)
- Opens in same window or new tab (your preference)
- Preferred duration: 15–20 minute slots

**Assurance (small text, gray):**
```
Quick call. Direct answers. No brokers, no pressure.
```

---

## EMAIL SEQUENCE: Post-Unlock Automation

### Email Template 1: Report Delivery

**Send:** Immediately after email submission

**Subject:**
```
Your Energy Bill Analysis: [Company Name]
```

**From:** noreply@nodalpoint.io

**Body:**

```
Hi [First Name],

Your energy bill analysis is ready.

[EMBEDDED REPORT LINK OR ONE-PAGER PDF]

Key findings from your most recent invoice:
- Your peak demand spiked to 114 kW
- This triggered extra charges worth $X,XXX
- We estimate you can reduce this by shifting usage or better forecasting

Next step: Schedule a 15-minute call to discuss your options.

[BUTTON: Book a Call → https://calendly.com/your-link]

Questions? Reply to this email.

---
Nodal Point
Market Architects
nodalpoint.io

This is not a sales email. We diagnose problems, we don't push solutions.
```

---

### Email Template 2: Specific Insight

**Send:** 24 hours after report delivery

**Subject:**
```
How to Stop Your Peak Demand Charges
```

**From:** noreply@nodalpoint.io

**Body:**

```
Hi [First Name],

Your bill shows a 114 kW peak during June 3rd—the hottest day of the month.

Here's what happened:
Your facility was running full capacity when the grid was also stressed. 
Your supplier charges extra during these moments ($X,XXX this month).

Three ways to reduce this:

1. Pre-cool before 2 PM
   Start cooling your building in the morning, then reduce during peak hours.
   Estimated savings: $XXX–$XXX/month.

2. Shift flexible loads
   If you can delay non-critical operations (compressors, water heaters, etc.) 
   until after 9 PM, you avoid peak pricing.
   Estimated savings: $XXX–$XXX/month.

3. Install a small battery or generator
   More expensive upfront, but neutralizes peak demand long-term.
   Estimated savings: $XXX–$XXX/month.

Ready to talk through which makes sense for your facility?

[BUTTON: Book a Call → https://calendly.com/your-link]

---
Nodal Point
```

---

### Email Template 3: Case Study (Optional)

**Send:** 48–72 hours after report delivery

**Subject:**
```
How a Similar Facility Saved $XX,XXX/Year
```

**From:** noreply@nodalpoint.io

**Body:**

```
Hi [First Name],

We worked with a 30,000 sq ft manufacturing facility in Dallas 
with a similar peak demand profile to yours.

Their situation:
- 112 kW peak demand
- $2,400/month in extra charges
- No flexibility in production schedule

What we did:
- Installed a 50 kW battery system ($XX,XXX upfront)
- Programmed it to discharge during grid peaks
- Kept production running, avoided peak penalties

Result:
- Reduced peak demand charges by 85%
- Saved $1,950/month ($23,400/year)
- ROI: 18 months

Your facility could see similar results. Want to explore this?

[BUTTON: Schedule a Call → https://calendly.com/your-link]

---
Nodal Point
```

---

## COPY GUIDELINES FOR ALL SCREENS

### Language Principles
- **Always:** Plain English. No jargon unless explained.
- **Never:** "Synergy," "cutting-edge," "exciting opportunities," exclamation points.
- **Use:** "Cost," "save," "reduce," "option," "timing," "peak."

### Numbers
- Format as `$X,XXX` or `114 kW` — clear, no approximation.
- Always include context: "$X,XXX/month" (not just "$X,XXX").
- Round to nearest $100 for estimates.

### Button Copy
- **Action verbs only:** "See," "Unlock," "Book," "Schedule."
- **No:** "Learn more," "Get started," "Submit."

### Headlines
- **Max 10 words.** One idea per headline.
- **Avoid "/" or special characters** (breaks mobile rendering).

---

## TECHNICAL NOTES FOR DEVELOPERS

### State Flow
1. `TrustGate` → User clicks "See My Analysis"
2. `UploadZone` → User drops/selects file
3. `AnalysisStream` → Backend parses bill (4–8s), frontend animates
4. `ResultsPreview` → Card with 4 key fields, blurred details
5. `EmailGate` → User enters email
6. `FullReport` → Complete breakdown + email sent in parallel
7. `NextStepsCard` → Call booking CTA + email sequence triggers

### File Handling
- Input: PDF, PNG, JPG, HEIC
- Backend: Perplexity Sonar-Pro or OpenRouter fallback (you have this)
- Output: Structured JSON (usage, demand, charges)
- Frontend: Parse JSON → render cards

### Email Delivery
- Service: SendGrid, Resend, or your current provider
- Trigger: On email gate submission
- Content: HTML email (simple, dark theme)
- Sequences: 3 emails over 72 hours

### Analytics / Tracking (Optional)
- Track page views: TrustGate → UploadZone → ResultsPreview → EmailGate → FullReport
- Track conversion: Email submission (this is the key metric)
- Track booking clicks: From any CTA button
- Avoid: Tracking file contents, sensitive bill data

### Security
- File storage: Encrypted, deleted after 72 hours
- Email addresses: Standard compliance (opt-out option)
- API keys: Environment variables (Perplexity, OpenRouter, email service)

---

## DEPLOYMENT CHECKLIST

- [ ] All copy reviewed (no jargon, CFO-friendly)
- [ ] Animation preserved (AnalysisStream unchanged)
- [ ] Email templates formatted and tested
- [ ] Booking calendar linked (Calendly or custom)
- [ ] Backend API endpoints ready (file upload, email send)
- [ ] Responsive design tested on mobile/tablet/desktop
- [ ] Email deliverability tested (spam filters)
- [ ] Analytics integrated (conversion tracking)
- [ ] Dark theme colors consistent across all screens
- [ ] Buttons all 48px+ tall (accessibility)
- [ ] Form validation working (email gate)
- [ ] 72-hour file deletion scheduled (backend job)
- [ ] 3-email sequence automation running (cron/event-based)

---

## NEXT QUESTIONS FOR LEWIS

1. **Booking integration:** Calendly link, or custom booking system?
2. **Email template style:** HTML with branding, or plain text?
3. **Report format for full page:** Printable PDF option for user?
4. **Re-engagement:** Send reminder email if no booking within 7 days?
5. **Facility type capture:** After booking, collect TDU + industry for deeper modeling?
6. **Analytics:** What's your primary conversion metric—email submission or booking completion?

---

## IMPLEMENTATION ORDER (Recommended)

1. **Build TrustGate** (static content, no logic)
2. **Build UploadZone** (file upload + loading state)
3. **Preserve AnalysisStream** (your existing animation)
4. **Build ResultsPreview** (parse backend JSON, render 4 cards)
5. **Build EmailGate** (form validation, email submission)
6. **Build FullReport** (render full breakdown from same JSON)
7. **Set up email sequences** (SendGrid/Resend + cron jobs)
8. **Connect booking system** (Calendly or custom)
9. **Test end-to-end** (upload → email → booking)
10. **Deploy to production**

---

## Files to Implement

- `TrustGate.tsx` — First screen
- `UploadZone.tsx` — File upload
- `AnalysisStream.tsx` — **(PRESERVE YOUR EXISTING)**
- `ResultsPreview.tsx` — Quick snapshot
- `EmailGate.tsx` — Email capture
- `FullReport.tsx` — Complete breakdown
- `NextStepsCard.tsx` — Call CTA
- `emailTemplates.js` — All 3 templates
- `api/analyzeBill.js` — Backend (you have this)
- `api/sendEmail.js` — Email service integration
- `api/deleteFile.js` — 72-hour cleanup job
