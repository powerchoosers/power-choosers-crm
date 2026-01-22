# Call Scripts Overview

This document explains how the Call Scripts module works, key flows, dynamic variables, and example snippets you can use during calls.

## How It Works
- **FLOW object:** All scripts live in `scripts/pages/call-scripts.js` as a state machine (`FLOW`). Each node has `stage`, `text`, and `responses`.
- **Dynamic data:** Live context fills placeholders like `{{agent.first_name}}`, `{{contact.first_name}}`, `{{account.name}}`, `{{account.industry}}`, `{{potential_savings}}`, and `{{day.part}}`.
- **Rendering:** The Call Scripts page and the Phone widget mini-scripts read the same FLOW, so any change is reflected everywhere.
- **Opener routing:** The `hook` node asks “Who picked up?” and routes to Decision Maker, Gatekeeper, or Voicemail.
- **Permission-first style:** The primary opener is “Hey {{contact.first_name}}! This is {{agent.first_name}}… did I catch you at a bad time or do you have ~30 seconds?”

## Core Flows
1. **Decision Maker path (Permission + Empathy)**
   - `opening_quick_intro` → `opening_industry_context` (responsibility check) → `urgency_building` (2026 warning + confidence) → `acknowledge_response` → `renewal_timing` → discovery (`key_question_confidence`, etc.) → gap → consequence → solution/close.

2. **Gatekeeper path (Texas power bills, clarity-first)**
   - `gatekeeper_intro`: “I’m calling about {{account.name}}’s power bills. Who handles those there?”
   - If confused: `gatekeeper_electricity_confusion`: “Yeah, your electricity bills. Who handles those there?”
   - Clarify purpose: “Someone who looks at the electricity bills and decides on suppliers or contracts. Who handles that there?”
   - Transfer request: “Perfect. Can you connect me with them please?”
   - Fallback nuclear clarity: “The person who gets the electric bill each month and signs the energy contracts.”
   - Outcomes: transfer → decision-maker opener; busy/voicemail → schedule/voicemail; decline → end politely.
   - **Size-based wording (Call Scripts page only):** Small (<20): “power bills”; Mid (20–199): “electricity bills”; Enterprise (200+): “electric service.”

3. **Voicemail path**
   - 30s message: name twice, problem (15–20% overpaying), 15-minute ask, callback number + LinkedIn.

4. **Discovery highlights**
   - Confidence question: “How confident are you that’s enough to make sure you’re getting competitive pricing?”
   - Gap reveal: “Did you get 5–10 competitive quotes… or 2–3 options?”
   - Consequence: uses `{{monthly_spend}}` and `{{potential_savings}}` to quantify.

## Dynamic Variables (key ones)
- `{{agent.first_name}}` — pulled from Settings
- `{{contact.first_name}}`, `{{contact.full_name}}`, `{{contact.title}}`
- `{{account.name}}`, `{{account.industry}}`, `{{account.city}}`, `{{account.state}}`
- `{{monthly_spend}}`, `{{potential_savings}}`, `{{account.contract_end}}`, `{{account.supplier}}`
- `{{day.part}}` — Good morning / Good afternoon / Good evening

## Example Decision-Maker Script (primary opener)
```
Hey {{contact.first_name}}! This is {{agent.first_name}}.
[PAUSE 1 second]

Real quick... did I catch you at a bad time... or do you have about 30 seconds?

Perfect. So {{contact.first_name}}, I work with {{account.industry}} companies on electricity procurement.
Are you responsible for electricity agreements and contract renewals?

Okay great. The writing's kind of on the wall for 2026. Rates are going up next year and most teams don’t have a solid strategy.
Do you feel like you have a solid handle on your energy costs? Or are you kind of winging it?
```

## Example Gatekeeper Script (clarity-first)
```
{{day.part}}, this is {{agent.first_name}}. I'm calling about {{account.name}}'s power bills. Who handles those there?

If confused: Yeah, your electricity bills. Who handles those there?

If they ask what this is about:
Someone who looks at the electricity bills and decides on suppliers or contracts. Who handles that there?

If they give a name: Perfect. Can you connect me with them please?

Fallback clarity:
The person who gets the electric bill each month and signs the energy contracts.
```

## Tips for Use
- Always start at `hook` and pick Decision Maker or Gatekeeper based on who answers.
- Follow the button responses in the UI; each keeps you on the designed path.
- Use pauses where indicated to let points land.
- Let dynamic fields populate; avoid hard-coding names/companies.
- In the Phone widget, use the Scripts toggle to see the same flow while in-call.

## Where the Code Lives
- Core scripts: `scripts/pages/call-scripts.js` (authoritative FLOW, size-based gatekeeper opener).
- Training mirror: `training-tool.html` (same FLOW content; static gatekeeper wording without size logic).
- Phone widget mini-scripts: `scripts/widgets/phone.js` renders the same FLOW in-call.

## Quick Troubleshooting
- **Variables not filling:** Ensure contact/account context exists (click-to-call or selected contact) and agent first name is set in Settings.
- **Wrong opener after transfer:** `gatekeeper_transferred` routes to `opening_quick_intro`; confirm the hook path is Decision Maker after transfer.
- **Styling/hover:** Uses shared CSS; no underline/bold on hover per CRM standards.





