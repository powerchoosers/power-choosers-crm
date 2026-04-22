**text**

**# Nodal Point Cold Email Audit**

**\*\*Prepared:\*\* April 22, 2026**  

**\*\*Sender:\*\* l.patterson@getnodalpoint.com / l.patterson@nodalpoint.io**  

**\*\*Sequence:\*\* seq-ercot-cold-v1**  

**\*\*Sample Size:\*\* 200 emails reviewed**



**---**



**## Executive Summary**



**After reviewing 200 outbound emails across the `seq-ercot-cold-v1` sequence and manual sends, the campaign has \*\*zero replies\*\* despite a measurable open rate on a subset of contacts. The core problems fall into 5 categories: subject line framing, opening line structure, CTA friction, bot-inflated open data, and a broken AI generation pipeline (`aiPrompt: null` on all records).**



**---**



**## 1. Data Findings from 200 Emails**



**### Open \& Click Stats (Sent Emails Only)**



**| Metric | Count |**

**|---|---|**

**| Total emails in sample | 200 |**

**| Emails with `status: sent` | \~120 |**

**| Emails with `status: awaiting\_generation` | \~80 |**

**| Emails with openCount > 0 | \~22 |**

**| Emails with clickCount > 0 | \~14 |**

**| Emails with `botFlagged: true` | 2 confirmed |**

**| Emails with any reply | \*\*0\*\* |**

**| Emails where `aiPrompt` is NOT null | \*\*0\*\* |**



**### Bot-Flagged Opens (Critical)**

**Two records have `botFlagged: true` in metadata:**

**- `cmoses@tes85.com` — subject: \*"Plano delivery charges"\* — 2 opens, 0 clicks, bot flagged**

**- `richardi@interloadforwarding.com` — subject: \*"El Paso load costs"\* — 2 opens, 0 clicks, bot flagged**



**Several other records show opens and clicks occurring \*\*within seconds of send\*\* (< 30 seconds), which is a strong indicator of security scanners, not humans:**

**- `lorir@mengervalve.com` — opened 14s after send, clicked 23s after send**

**- `jshowalter@jdfields.com` — opened 16s after send, clicked 48s after send**

**- `marek@mengervalve.com` — opened 10s after send, clicked 27s after send**

**- `clem@ricos.com` — opened 17s after send, clicked 29s after send**

**- `jean.schanberger@tailoredbrands.com` — opened 9s after send, clicked 33s after send**

**- `eric.jones@empirepaper.com` — opened 14s after send, clicked 36s after send**



**> \*\*Bottom line:\*\* Your apparent open/click rate is largely \*\*bot activity, not human engagement.\*\* Actual human open rate may be near zero.**



**### Confirmed Human Opens (Likely Real)**

**These contacts had delayed opens suggesting a real person:**

**- `mstewart@bakernissan.com` — opened 33 min after send (Baker Nissan — active conversation thread)**

**- `payables@alltranstc.com` (AllTrans Port Services) — opened \~1 min after send, clicked \~2 min after — likely real**

**- `sbowe@eastcoastwarehouse.com` (Sean Bowe) — opened 16s after send — borderline, may be bot**



**---**



**## 2. The `aiPrompt: null` Problem — Most Critical Bug**



**\*\*Every single email record has `aiPrompt: null`.\*\***



**This means the AI generation step is either:**

**- Not firing before the email sends**

**- Failing silently and falling back to a template**

**- The `aiPrompt` field is never being populated in the DB before send**



**### What This Means**

**If emails are going out without AI-generated personalization, every prospect is receiving a \*\*generic template\*\* — not the forensic, location-specific copy the sequence was designed to produce. This single issue likely accounts for the zero reply rate more than anything else.**



**### Fix Required**

**- Add a pre-send validation gate: if `aiPrompt` is null, \*\*block send and log error\*\***

**- Check the sequence executor — confirm AI generation job completes before `scheduledAt` fires**

**- Add a `generatedBody` field to the email record so you can audit what was actually sent**



**---**



**## 3. Subject Line Problems**



**### Current Patterns Observed**

**"Houston utility costs"**

**"Fort Worth energy charges"**

**"Plano delivery charges"**

**"CHO America costs"**

**"Abilene power costs"**

**"East Texas Truck budget"**

**"Parish electricity costs"**

**"Houston facility power"**



**text**



**### Why These Fail**

**- They describe your service, not the prospect's problem**

**- They sound like internal billing line items, not human-written messages**

**- No curiosity gap — the prospect knows exactly what you're selling before they open**

**- Generic enough to apply to 1,000 companies → reads as mass outreach**



**### Recommended Subject Line Patterns**



**| Current (❌) | Replace With (✅) |**

**|---|---|**

**| Houston utility costs | noticed something in Houston |**

**| Fort Worth energy charges | Fort Worth rate question |**

**| Plano delivery charges | quick note on Plano |**

**| CHO America costs | CHO America — quick question |**

**| Abilene power costs | Abilene demand question |**

**| East Texas Truck budget | East Texas Truck — 30 seconds |**

**| Parish electricity costs | electricity question for Parish |**

**| Houston facility power | your Houston facility |**



**\*\*Rule:\*\* Subject line should feel like it was written by someone who knows \*one specific thing\* about them — not by someone blasting a list.**



**---**



**## 4. Opening Line Problems**



**### Current Pattern (Inferred from Sequence Design)**

**Emails open by anchoring to the city/location, e.g.:**

**> \*"I wanted to reach out to \[Company] regarding your energy billing in \[City]..."\***



**### Why This Fails**

**- Still centers \*\*you\*\* as the researcher, not them as having a problem**

**- "Wanted to reach out" is the most overused phrase in cold email**

**- Naming the city alone is not personalization — it's a mail merge**



**### Recommended Opening Formula**

**Lead with a \*\*specific, verifiable observation\*\* about their operation:**



**\*\*Template:\*\***

**> \*"\[Company] runs a \[operation type] out of \[City] — that's one of the \[specific ERCOT characteristic] environments in the state."\***



**\*\*Examples:\*\***

**> \*"East Texas Truck Center operates out of a high-demand corridor near Longview — most facilities that size in that zone are leaving money on the table with flat-rate contracts."\***



**> \*"Rico's has multiple San Antonio locations — demand charges hit harder in ERCOT South than most operators realize until they see a side-by-side."\***



**> \*"Menger Valve's Houston facility is in one of the heaviest industrial demand zones in ERCOT. Most manufacturers there are on outdated fixed rates."\***



**---**



**## 5. CTA Problems**



**### Current CTA Pattern**

**> \*"Would you be open to a quick 10-minute call?"\***  

**> \*"Can I send over a rate comparison?"\***



**### Why These Fail**

**- Asking for a call in Email #1 requires the prospect to commit time before trust is established**

**- "Rate comparison" sounds like a sales pitch PDF, not a value delivery**

**- Both require the prospect to \*\*do something\*\* before any relationship exists**



**### Recommended CTAs by Email Step**



**| Step | CTA |**

**|---|---|**

**| Email #1 (Day 1) | "Worth me pulling a quick rate view for \[City]?" |**

**| Email #2 (Day 3 - Opened) | "Is \[City] pricing on your radar heading into summer?" |**

**| Email #3 (Day 7 - No reply) | "Still worth a look?" |**

**| Email #4a (Day 14 - Signal) | "Want to see where the number actually sits?" |**

**| Breakup (Day 17) | "Should I take you off my list, or is the timing just off?" |**



**\*\*Rule:\*\* Every CTA should be a yes/no question. The goal of Email #1 is one reply — not a booked call.**



**---**



**## 6. Cadence \& Timing Analysis**



**### Current Sequence Structure (seq-ercot-cold-v1)**

**- Day 1: Email #1 — The Forensic Opener**

**- Day 3: Email #2 — The Evidence (opened branch)**

**- Day 7: Pattern interrupt (no open branch)**

**- Day 14: Email #4a — The Rate Benchmark (signal branch)**

**- Day 17+: Breakup / ghost branch**



**### Issues Found**

**1. \*\*Day 7 is too late for the pattern interrupt\*\* — optimal second touch is Day 3-4**

**2. \*\*No Day 5 email for the no-open branch\*\* — a gap from Day 1 to Day 7 with zero contact is dead air**

**3. \*\*\~80 emails stuck in `awaiting\_generation`\*\* — AI pipeline bug is blocking sends entirely**

**4. \*\*Repeat contacts getting 3-4 emails\*\* — `eric.jones@empirepaper.com`, `lorir@mengervalve.com`, `marek@mengervalve.com`, `jshowalter@jdfields.com`, `clem@ricos.com` all received multiple emails with zero human replies**



**### Recommended Cadence**

**Day 1 → Email #1: Forensic Opener**

**Day 3 → Email #2: The Evidence (all contacts)**

**Day 5 → Call attempt + LinkedIn connect**

**Day 7 → Email #3: Pattern Interrupt (2 sentences max)**

**Day 10 → Call attempt**

**Day 14 → Email #4: Rate Benchmark or Social Proof**

**Day 17 → Breakup email**



**text**



**---**



**## 7. Two Domain Analysis**



**| Domain | Use Case | Performance |**

**|---|---|---|**

**| `l.patterson@nodalpoint.io` | Manual/personal outreach, warm follow-ups | Real human opens observed |**

**| `l.patterson@getnodalpoint.com` | Automated sequence sends | All opens appear bot-generated; zero human replies |**



**### Key Observation**

**The `nodalpoint.io` domain gets \*\*real human opens\*\* — Baker Nissan opened 33 min after send, AllTrans opened and clicked within \~1 min. The `getnodalpoint.com` sequence domain is generating bot-flagged or near-instant opens only.**



**\*\*This suggests:\*\***

**- `getnodalpoint.com` may have a \*\*deliverability or spam reputation issue\*\***

**- Or the sequence emails are too templated to pass spam filters and engage real humans**

**- Run MX Toolbox on `getnodalpoint.com` and check blacklists immediately**



**### Notable Manual Email Subjects (nodalpoint.io — Stronger)**

**- \*"Sean, we just spoke about the getting electric service at Baytown"\* — personal, specific**

**- \*"Memory, got another LOE release request"\* — warm follow-up, clearly active thread**

**- \*"Is getting a good price still a priority?"\* — excellent breakup/re-engagement angle**

**- \*"AllTrans Port Services electricity agreements"\* — direct, company-specific**



**---**



**## 8. Prioritized Action Items**



**### 🔴 Immediate (This Week)**

**- \[ ] \*\*Fix the `aiPrompt: null` bug\*\* — add pre-send validation gate; no email should fire without a generated body**

**- \[ ] \*\*Add a `generatedBody` column\*\* to the email record so you can audit exact copy sent**

**- \[ ] \*\*Check `getnodalpoint.com` domain reputation\*\* — run MX Toolbox, check blacklists, verify SPF/DKIM/DMARC**

**- \[ ] \*\*Flag bot opens\*\* — mark any open occurring < 60 seconds after send as `botSuspected: true`**



**### 🟡 Short-Term (Next 2 Weeks)**

**- \[ ] \*\*Rewrite subject lines\*\* using curiosity/specificity formula from Section 3**

**- \[ ] \*\*Rewrite Email #1 opener\*\* — lead with a specific ERCOT market observation, not a city name**

**- \[ ] \*\*Change all CTAs to yes/no questions\*\* — remove all "quick call" asks from Email #1**

**- \[ ] \*\*Add Day 5 touchpoint\*\* to the no-open branch**

**- \[ ] \*\*Inject one real ERCOT market fact\*\* into the AI prompt for each email step**



**### 🟢 Structural (Next Month)**

**- \[ ] \*\*A/B test subject lines\*\* — curiosity vs. company-name vs. question formats**

**- \[ ] \*\*Consolidate sending to `nodalpoint.io`\*\* or complete deliverability audit for `getnodalpoint.com`**

**- \[ ] \*\*Add reply detection\*\* to sequence executor — auto-remove repliers from sequence, flag for manual follow-up**

**- \[ ] \*\*Build a `sequenceAnalytics` view\*\* in Supabase aggregating open rate, click rate, reply rate, bot-flag rate by step**



**---**



**## 9. Sample Rewritten Email #1**



**### ❌ Before (Current)**

**> \*\*Subject:\*\* Houston utility costs**

**>**

**> Hi \[First Name],**

**>**

**> I wanted to reach out to \[Company] regarding your energy costs in Houston. Many businesses in your area are overpaying on electricity, and I'd love to help you explore options.**

**>**

**> Would you be open to a quick 10-minute call this week?**

**>**

**> — Lewis**  

**> Nodal Point**



**### ✅ After (Recommended)**

**> \*\*Subject:\*\* noticed something in Houston**

**>**

**> \[First Name] —**

**>**

**> \[Company] runs a \[operation type] out of Houston — that's one of the highest demand-charge environments in ERCOT. Most commercial accounts in that zone on flat fixed-rate contracts are paying 12-18% above market heading into summer peak.**

**>**

**> Worth me pulling a quick rate view for your facility?**

**>**

**> — Lewis**  

**> Nodal Point | nodalpoint.io**





