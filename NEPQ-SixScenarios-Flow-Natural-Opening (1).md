# NEPQ Call Script - Six Scenarios Flow + Natural Opening (IDE Ready)
## Correct Problem Bridge Order + Contract Timing Qualification - Copy into your FLOW object

---

## HOW TO USE THIS FILE

Copy each conversation block directly into your FLOW object in call-scripts.js

Each block is formatted as:
```javascript
stageName: {
  stage: 'Stage Title',
  text: `Your dialogue here with {{variables}}`,
  responses: [
    { label: 'What prospect says', next: 'nextStageName' },
    { label: 'Another response', next: 'anotherStage' }
  ]
}
```

---

## CONVERSATION 1: Opening - Quick Intro + Permission

```javascript
opening_quick_intro: {
  stage: 'Opening - Quick Intro & Permission',
  text: `Hey {{contact.first_name}}! This is Lewis.

[PAUSE 1 second]

Real quick... did I catch you at a bad time... or do you have about 30 seconds?`,
  
  responses: [
    { label: 'Yeah, go ahead', next: 'opening_industry_context' },
    { label: 'I got 30 seconds', next: 'opening_industry_context' },
    { label: 'Actually, not a good time', next: 'reschedule_callback' },
    { label: 'What is this about?', next: 'opening_industry_context' }
  ]
}
```

---

## CONVERSATION 2: Opening - Industry Context

```javascript
opening_industry_context: {
  stage: 'Opening - Industry Context',
  text: `Perfect. So I work with {{account.industry}} companies on electricity procurement.

[PAUSE 1 second - let that land]`,
  
  responses: [
    { label: 'Continue to problem', next: 'problem_bridge' }
  ]
}
```

---

## CONVERSATION 3: Problem Bridge (Six Scenarios Order)

```javascript
problem_bridge: {
  stage: 'Problem Bridge - Why I\'m Calling',
  text: `Perfect. So I'm reaching out because most {{account.industry}} companies 
your size are overpaying on electricity...

[PAUSE]

Not because they're doing anything wrong... just because they handle it 
the same way most companies do.

[PAUSE]

Are you involved in how {{account.name}} handles electricity?`,
  
  responses: [
    { label: 'Yeah, somewhat', next: 'timing_qualification' },
    { label: 'I handle it', next: 'timing_qualification' },
    { label: 'We have a corporate person', next: 'timing_qualification' },
    { label: 'That\'s someone else', next: 'gatekeeper_route' },
    { label: 'Not really sure', next: 'clarify_involvement' }
  ]
}
```

---

## CONVERSATION 4: Qualification - Contract Timing (CRITICAL QUESTION)

```javascript
timing_qualification: {
  stage: 'Qualification - Contract Timing',
  text: `Got it. So quick question... have you already extended your agreements 
past 2026... or is that renewal window still open for you?`,
  
  responses: [
    { label: 'Still open / renew before 2026', next: 'discovery_process' },
    { label: 'We renew in 2026', next: 'discovery_process' },
    { label: 'Not sure when it expires', next: 'discovery_process' },
    { label: 'We just renewed / locked in', next: 'locked_in_future' }
  ]
}
```

---

## CONVERSATION 5: Discovery - Current Process

```javascript
discovery_process: {
  stage: 'Discovery - Current Process',
  text: `Good. So walk me through it... when you renew... how many quotes 
do you typically get?`,
  
  responses: [
    { label: '2 or 3 quotes', next: 'key_question_confidence' },
    { label: 'Just current supplier', next: 'key_question_confidence' },
    { label: '5 to 10 quotes', next: 'discovery_supplier_count' },
    { label: 'We have a broker handle it', next: 'objection_broker_intro' },
    { label: 'Never really counted', next: 'key_question_confidence' }
  ]
}
```

---

## CONVERSATION 6: THE KEY QUESTION (Core of NEPQ)

```javascript
key_question_confidence: {
  stage: 'Discovery - Key Question',
  text: `So [however many they said]...

[PAUSE 2 seconds - let that sink in]

How confident are you that's actually enough to make sure you're getting 
competitive pricing?

[PAUSE - silence is your friend here. Let them think.]`,
  
  responses: [
    { label: 'Pretty confident', next: 'probe_confidence' },
    { label: 'They work fine', next: 'probe_confidence' },
    { label: 'Not 100% sure', next: 'probe_confidence' },
    { label: 'Not very confident', next: 'gap_creator' },
    { label: 'We use a broker', next: 'objection_broker_intro' }
  ]
}
```

---

## CONVERSATION 7: Probe Their Confidence

```javascript
probe_confidence: {
  stage: 'Discovery - Probe Confidence',
  text: `And is that because you've actually compared your rates to what 
the rest of the market is quoting... or more just because you've been 
with them for a while and you trust them?

[PAUSE]`,
  
  responses: [
    { label: 'We haven\'t really compared', next: 'gap_creator' },
    { label: 'Just been with them forever', next: 'gap_creator' },
    { label: 'We don\'t really know', next: 'gap_creator' },
    { label: 'We have compared before', next: 'discovery_supplier_count' },
    { label: 'That\'s what our broker does', next: 'objection_broker_intro' }
  ]
}
```

---

## CONVERSATION 8: Gap Creator - Supplier Count

```javascript
discovery_supplier_count: {
  stage: 'Discovery - Supplier Count',
  text: `Okay, so when you last renewed... did you end up getting like 5, 
10 quotes from different suppliers... or more like 2 or 3 options?`,
  
  responses: [
    { label: '5 to 10 quotes', next: 'discovery_market_check' },
    { label: '2 or 3 options', next: 'discovery_market_check' },
    { label: 'Just stuck with the same one', next: 'discovery_market_check' },
    { label: 'Don\'t remember', next: 'discovery_market_check' }
  ]
}
```

---

## CONVERSATION 9: Market Check - Set Up The Reveal

```javascript
discovery_market_check: {
  stage: 'Discovery - Market Check',
  text: `Alright, so like 2 or 3 quotes...

Here's what I'm curious about: Do you know roughly how many different 
suppliers are actually available in the {{account.industry}} market? 

Like, are we talking 10 or 20 suppliers... or more like 100 plus?

[PAUSE - they usually guess low]`,
  
  responses: [
    { label: '10 to 20 suppliers', next: 'gap_revealed' },
    { label: '50 suppliers', next: 'gap_revealed' },
    { label: '100 plus', next: 'consequence_quantify' },
    { label: 'I have no idea', next: 'gap_revealed' }
  ]
}
```

---

## CONVERSATION 10: THE GAP REVEALED (Moment of Realization)

```javascript
gap_revealed: {
  stage: 'Discovery - Gap Revealed',
  text: `Actually, there's like 100 plus suppliers out there.

[PAUSE 3 SECONDS - let this sink in]

So if there's a supplier quoting 15, 20 percent lower than your current rate... 
you probably wouldn't even know about them.

[PAUSE 2 SECONDS]

I mean, has that ever crossed your mind? That there could be better rates 
out there that you're just not seeing?`,
  
  responses: [
    { label: 'Yeah, that bothers me', next: 'consequence_quantify' },
    { label: 'I guess I never thought about it', next: 'consequence_quantify' },
    { label: 'Not really', next: 'confidence_challenge' },
    { label: 'We trust our current supplier', next: 'confidence_challenge' }
  ]
}
```

---

## CONVERSATION 11: Gap Creator (Fallback for Early Discovery)

```javascript
gap_creator: {
  stage: 'Discovery - Gap Creator',
  text: `So when you last renewed... did you get like 5-10 competitive 
quotes from different suppliers... or was it more like 2-3 options?`,
  
  responses: [
    { label: '5-10 quotes', next: 'discovery_market_check' },
    { label: '2-3 options', next: 'discovery_market_check' },
    { label: 'Just renewed with same supplier', next: 'discovery_market_check' }
  ]
}
```

---

## CONVERSATION 12: CONSEQUENCE (Most Powerful - Stage 4)

```javascript
consequence_quantify: {
  stage: 'Discovery - Consequence Quantified',
  text: `So here's what I'm thinking... you're spending {{monthly_spend}} 
a month on electricity right now, right?

And if there's a 15, 20 percent gap you don't know about, that's roughly 
{{potential_savings}} a year you could be leaving on the table.

[PAUSE - let that land]

Over like 3 years, that's... well, you do the math. That's a lot of money.

[PAUSE 2 SECONDS]

Are you really willing to just settle for that?`,
  
  responses: [
    { label: 'No, definitely not', next: 'solution_audit_proposal' },
    { label: 'I should look into it', next: 'solution_audit_proposal' },
    { label: 'That\'s a lot of money', next: 'solution_audit_proposal' },
    { label: 'We\'re locked in anyway', next: 'locked_in_future' }
  ]
}
```

---

## CONVERSATION 13: Solution - Audit Proposal

```javascript
solution_audit_proposal: {
  stage: 'Solution - Audit Proposal',
  text: `Here's what I'd suggest we do:

I pull together a quick audit for you. Takes me like 2 or 3 days. I reach out 
to 100 plus suppliers, get competitive bids from ones you probably haven't 
even talked to.

Then we jump on a quick call... maybe 15 minutes. I show you what's out there, 
you compare, and you decide if it makes sense.

No pressure, no obligation. Just data so you can make a smart decision.

Fair?`,
  
  responses: [
    { label: 'Fair, let\'s do it', next: 'close_calendar_commitment' },
    { label: 'How would that actually work?', next: 'solution_explain_process' },
    { label: 'Send me something first', next: 'solution_email_first' },
    { label: 'When would we talk?', next: 'close_calendar_commitment' }
  ]
}
```

---

## CONVERSATION 14: Solution - Explain Process (If They Ask)

```javascript
solution_explain_process: {
  stage: 'Solution - Explain Process',
  text: `Super simple. You give me like three things: your monthly spend, 
when your contract ends, and who your current supplier is. That's it.

I take a couple days, I coordinate with all these suppliers, pull competitive 
bids from the ones you haven't talked to.

We hop on a 15 minute call. I walk you through what everyone's quoting. 
You look at the numbers, you compare, you decide.

Simple as that.`,
  
  responses: [
    { label: 'Okay, let\'s do it', next: 'close_calendar_commitment' },
    { label: 'When would we talk?', next: 'close_calendar_commitment' },
    { label: 'Send me info first', next: 'solution_email_first' }
  ]
}
```

---

## CLOSE: Calendar Commitment

```javascript
close_calendar_commitment: {
  stage: 'Close - Calendar Commitment',
  text: `Perfect. So here's what I need: Your monthly spend, when you renew, 
and your current supplier name if you know it.

That's it. I'll handle the rest.

When works this week for a quick call? Monday, Tuesday, or Wednesday?`,
  
  responses: [
    { label: 'Monday afternoon', next: 'close_invite_sent' },
    { label: 'Tuesday morning', next: 'close_invite_sent' },
    { label: 'Wednesday anytime', next: 'close_invite_sent' },
    { label: 'Let me check', next: 'close_send_calendar_link' }
  ]
}
```

---

## CLOSE: Invite Sent

```javascript
close_invite_sent: {
  stage: 'Close - Invite Sent',
  text: `Perfect. I'm sending you a calendar invite right now.

We'll go over your specs and I'll pull those quotes for you.

See you then.`,
  
  responses: []
}
```

---

## OBJECTION 1: We Use a Broker (3-Step Handler)

```javascript
objection_broker_intro: {
  stage: 'Objection - Broker (Clarify)',
  text: `Oh, you use a broker... So when you say that, do they handle like 
everything or just coordinate quotes for you?

[PAUSE]`,
  
  responses: [
    { label: 'They handle everything', next: 'objection_broker_discuss' },
    { label: 'They shop rates', next: 'objection_broker_discuss' },
    { label: 'They get us quotes', next: 'objection_broker_discuss' },
    { label: 'They negotiate for us', next: 'objection_broker_discuss' }
  ]
}
```

---

## OBJECTION 1B: Broker Discussion

```javascript
objection_broker_discuss: {
  stage: 'Objection - Broker (Discuss)',
  text: `Got it. So when you last renewed, how many quotes did they actually 
bring you? Like 5, 10... or more like 2, 3?`,
  
  responses: [
    { label: '2 or 3 quotes', next: 'objection_broker_gap' },
    { label: '5 to 10 quotes', next: 'objection_broker_gap' },
    { label: 'Just renewed with same supplier', next: 'objection_broker_gap' },
    { label: 'Not sure', next: 'objection_broker_gap' }
  ]
}
```

---

## OBJECTION 1C: Broker Gap Reveal

```javascript
objection_broker_gap: {
  stage: 'Objection - Broker Gap Reveal',
  text: `Okay so like 2 or 3 quotes. And do you know how many suppliers 
your broker actually works with? Like 20, 30... or closer to 100 plus?

[PAUSE]`,
  
  responses: [
    { label: '20 to 30', next: 'objection_broker_reveal_gap' },
    { label: '50 suppliers', next: 'objection_broker_reveal_gap' },
    { label: '100 plus', next: 'consequence_quantify' },
    { label: 'I have no idea', next: 'objection_broker_reveal_gap' }
  ]
}
```

---

## OBJECTION 1D: Reveal The Gap

```javascript
objection_broker_reveal_gap: {
  stage: 'Objection - Broker Gap Revealed',
  text: `So there's actually 100 plus suppliers in the market... but your 
broker probably only works with like 20, 30, maybe 50.

[PAUSE 3 SECONDS]

That means like half the market... your broker doesn't even have access to.

Wouldn't it be worth seeing what that other half is quoting?`,
  
  responses: [
    { label: 'Yeah, that makes sense', next: 'solution_audit_proposal' },
    { label: 'How would that work?', next: 'solution_explain_process' },
    { label: 'We\'re happy with them', next: 'objection_broker_happy' }
  ]
}
```

---

## OBJECTION 2: Happy With Broker

```javascript
objection_broker_happy: {
  stage: 'Objection - Broker Happy',
  text: `I get it. They're probably doing a good job.

But real quick... have you ever had like a second opinion? Where someone 
compared your broker's rates to the broader market just to see?

[PAUSE]`,
  
  responses: [
    { label: 'No, we just trust them', next: 'gap_creator' },
    { label: 'We\'ve checked before', next: 'gap_creator' },
    { label: 'Why would we need to?', next: 'gap_creator' }
  ]
}
```

---

## OBJECTION 3: Locked In / Can't Change

```javascript
locked_in_future: {
  stage: 'Objection - Locked In',
  text: `Got it. When does your contract actually expire?`,
  
  responses: [
    { label: '18 months', next: 'locked_in_plant_seed' },
    { label: '12 months', next: 'locked_in_plant_seed' },
    { label: '6 months', next: 'locked_in_plant_seed' },
    { label: '[Any timeframe]', next: 'locked_in_plant_seed' }
  ]
}
```

---

## OBJECTION 3B: Plant Seed For Future

```javascript
locked_in_plant_seed: {
  stage: 'Objection - Plant Seed',
  text: `Perfect timing actually. Here's the thing... most companies start 
thinking about this like 6 months before it expires.

So you've still got some time to plan this right.

What I'd suggest... let me put on my calendar to reach back out to you 
in like [appropriate month]. That way, you're not scrambling at the 
last minute when rates are going up.

Sound good?`,
  
  responses: [
    { label: 'Yeah, that works', next: 'locked_in_confirm_callback' },
    { label: 'Sure, reach out later', next: 'locked_in_confirm_callback' },
    { label: 'Actually send info now', next: 'solution_email_first' }
  ]
}
```

---

## OBJECTION 3C: Confirm Future Callback

```javascript
locked_in_confirm_callback: {
  stage: 'Objection - Callback Confirmed',
  text: `Perfect. I'm putting it on my calendar to reach out in [X months].

We'll get you a game plan sorted out before you're in a crunch.

Talk soon.`,
  
  responses: []
}
```

---

## OBJECTION 4: Not Interested

```javascript
objection_not_interested: {
  stage: 'Objection - Not Interested',
  text: `Fair enough. Can I ask why? Is it because you're happy with what 
you're paying right now... or more just not a priority at the moment?

[PAUSE]`,
  
  responses: [
    { label: 'Happy with rates', next: 'confidence_challenge' },
    { label: 'Just not a priority', next: 'consequence_challenge' },
    { label: 'Still not interested', next: 'close_respect_decision' }
  ]
}
```

---

## OBJECTION 5: Confidence Challenge (Redirect Not Interested)

```javascript
confidence_challenge: {
  stage: 'Objection - Confidence Challenge',
  text: `I'm sure you are happy. They're probably good.

But quick question... have you ever had like a second opinion? Where someone 
actually compared your rates to what else is available just to make sure?

[PAUSE]`,
  
  responses: [
    { label: 'No, we just trust them', next: 'gap_creator' },
    { label: 'Actually that\'s a good point', next: 'gap_creator' },
    { label: 'Still not interested', next: 'close_respect_decision' }
  ]
}
```

---

## OBJECTION 6: Consequence Challenge

```javascript
consequence_challenge: {
  stage: 'Objection - Consequence Challenge',
  text: `I get it, not a priority right now. But here's the thing... while 
you're handling everything else, your electricity costs are going up in the 
background. And nobody's shopping, so you're locked in at rates way higher 
than new customers get.

When renewal hits... it's a crisis. No leverage, stuck.

What would that cost you? Maybe {{potential_savings}} over like 3 years?`,
  
  responses: [
    { label: 'Wow, didn\'t think about it like that', next: 'solution_audit_proposal' },
    { label: 'That\'s a good point', next: 'solution_audit_proposal' },
    { label: 'Still not interested', next: 'close_respect_decision' }
  ]
}
```

---

## SUPPORTING STAGES

### Gatekeeper Route

```javascript
gatekeeper_route: {
  stage: 'Gatekeeper - Route',
  text: `Got it. Can you transfer me to {{contact.first_name}}... or should 
I just follow up with them directly?`,
  
  responses: [
    { label: 'I\'ll transfer you', next: 'gatekeeper_wait' },
    { label: 'Here\'s their number', next: 'close_respect_decision' },
    { label: 'Let me take your info', next: 'gatekeeper_info' }
  ]
}
```

---

### Clarify Involvement

```javascript
clarify_involvement: {
  stage: 'Clarify - Involvement',
  text: `No problem. Here's the thing... most {{account.industry}} companies 
are leaving like {{potential_savings}} on the table a year just from bad 
timing on their renewal.

Does that sound like something you'd be involved in... or is that more 
of a procurement team thing?`,
  
  responses: [
    { label: 'That\'s me', next: 'timing_qualification' },
    { label: 'That\'s [name]', next: 'gatekeeper_route' },
    { label: 'Both of us', next: 'timing_qualification' }
  ]
}
```

---

### Reschedule Callback

```javascript
reschedule_callback: {
  stage: 'Reschedule - Callback',
  text: `No problem at all. When's a better time this week... or next week?`,
  
  responses: [
    { label: 'Tomorrow at 2', next: 'close_invite_sent' },
    { label: 'Next week Monday', next: 'close_invite_sent' },
    { label: '[Any time]', next: 'close_invite_sent' }
  ]
}
```

---

### Solution Email First

```javascript
solution_email_first: {
  stage: 'Solution - Email First',
  text: `Sure thing. What's your email? I'll send you over a quick breakdown 
of how this works.`,
  
  responses: []
}
```

---

### Close - Respect Decision

```javascript
close_respect_decision: {
  stage: 'Close - Respected',
  text: `Totally fair. No pressure at all.

But hey, if anything changes or you ever want to just see what the market's 
doing, feel free to reach out.

Take care.`,
  
  responses: []
}
```

---

## GATEKEEPER SUPPORT STAGES

### Gatekeeper Wait

```javascript
gatekeeper_wait: {
  stage: 'Gatekeeper - Hold',
  text: `Perfect. I'll hold.`,
  
  responses: [
    { label: 'New person answers', next: 'transferred_person_warmup' }
  ]
}
```

---

### Transferred Person Warmup

```javascript
transferred_person_warmup: {
  stage: 'Opening - Transferred Warmup',
  text: `Hey {{contact.first_name}}! Thanks for picking up. {{previousContact}} 
passed me over to you.

I know this is kind of random... but do you have about 30 seconds?`,
  
  responses: [
    { label: 'Yeah, go ahead', next: 'problem_bridge' },
    { label: 'What is this about?', next: 'problem_bridge' },
    { label: 'Not a good time', next: 'reschedule_callback' }
  ]
}
```

---

### Gatekeeper Info Capture

```javascript
gatekeeper_info: {
  stage: 'Gatekeeper - Info Capture',
  text: `Sure. What's the best way to reach them? Email or phone?`,
  
  responses: []
}
```

---

## VARIABLE LEGEND

```javascript
// All available variables:
{{contact.first_name}}          // John
{{contact.last_name}}           // Smith
{{contact.full_name}}           // John Smith
{{contact.title}}               // VP Operations
{{account.name}}                // Company Name Inc
{{account.industry}}            // Restaurants / Manufacturing
{{account.state}}               // Texas
{{account.supplier}}            // TXU Electric
{{account.contract_end}}        // 03/15/2026
{{monthly_spend}}               // $50,000
{{annual_spend}}                // $600,000
{{potential_savings}}           // $150,000
{{day.part}}                    // Good morning / Good afternoon
```

---

## QUICK FLOW REFERENCE

```
Opening (Quick Intro + Permission)
→ Industry Context
→ Problem Bridge (Six Scenarios Order)
→ Contract Timing Qualification ⭐ (CRITICAL - NEW)
→ Discovery Process (if open)
→ Key Question Confidence
→ Probe Confidence (if needed)
→ Gap Creator (if needed)
→ Market Check
→ Gap Revealed
→ Consequence Quantify
→ Solution Audit Proposal
→ Close Calendar

OR

→ Locked In Path (if renewal is future)
→ Plant Seed → Confirm Callback

Objections: Broker → Gap → Reveal Gap → Back to Consequence → Solution
Objections: Not Interested → Challenge → Back to Gap or Respect
```

---

## THE CORRECT SEQUENCE

**This is the Six Scenarios flow with critical timing qualification:**

```
1. "Hey {{contact.first_name}}! This is Lewis."              [Intro]
2. "Real quick... did I catch you at a bad time?"            [Permission Ask]
3. "Perfect. So I work with {{account.industry}}..."         [Industry Context]
4. "Most are overpaying on electricity..."                   [Problem Statement]
5. "Are you involved in how you handle that?"                [Soft Qualification]
6. "Have you already extended past 2026... or is renewal window open?" [CONTRACT TIMING - CRITICAL]
7. IF OPEN: "How many quotes do you typically get?"          [Discovery]
8. IF LOCKED IN: "When did you renew?" → Plant Seed          [Future Path]
9. "How confident are you that's enough?"                    [Key Question]
10. Gap reveal, consequence, solution, close                 [Rest of NEPQ]
```

---

## KEY CHANGES IN THIS UPDATE

✅ **Added timing_qualification stage** - Asks about contract renewal window FIRST
✅ **Moved it after problem_bridge** - Before any discovery questions
✅ **Routes to locked_in_future** - If contract already extended
✅ **Routes to discovery_process** - If renewal window is open
✅ **Updated clarify_involvement** - Now routes to timing_qualification instead of discovery_process
✅ **Added context about why** - This qualification saves time on prospects you can't help now

---

## READY TO IMPLEMENT

This is the winning combination:
✅ Natural opening (your instinct)
✅ Six Scenarios flow (proven approach)
✅ Contract timing qualification (critical business logic)
✅ Correct problem bridge order
✅ Self-discovery through questions
✅ Real conversation tone

Copy into your call-scripts.js FLOW object. All variables auto-render. All responses flow correctly.

Go build it. 💪
