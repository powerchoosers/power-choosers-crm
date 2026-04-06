---
name: nodal-linkedin-content
description: Draft LinkedIn posts, carousels, content calendars, and repurposed market-intelligence content for Nodal Point or Lewis Patterson. Use when the user asks for LinkedIn writing, weekly post series, founder posts, company-page posts, carousel outlines, CTAs, rewrites, or campaign ideas that should follow the SIGNAL_FEED voice.
---

# Nodal Point LinkedIn Content

Use this skill to turn raw notes, ERCOT data, tariff concepts, product updates, or campaign ideas into LinkedIn-native content that sounds like Nodal Point.

## Core rules

- Write for LinkedIn first. Keep it skimmable.
- Open with a statement, not a question.
- Lead with the strongest point in line 1.
- Use plain English. Explain energy terms only when they matter to the point.
- Keep the tone forensic, calm, and specific.
- Keep one main idea per post.
- Do not invent numbers. Use source-backed data or clear placeholders.
- Do not put links in the body unless the user asks.
- Use short lines and spacing to make the post easy to read.
- Avoid hype, generic marketing language, and stock-photo energy.
- Default to zero hashtags unless the user requests them.
- For SIGNAL_FEED posts, keep the structure to three data points and one clear takeaway.

## Default assumptions

- If the channel is not specified, choose Lewis for founder POV and Nodal Point for market intel or product proof.
- If the audience is not specified, write for brokers first, then commercial CFOs or energy managers.
- If the goal is not specified, default to authority-building.
- If the user wants a series or calendar, use the cadence in `references/linkedin-playbook.md`.
- If the user wants a campaign idea or ad-style concept, use `references/ad-campaigns-success.md`.
- If the user wants a carousel, return a slide-by-slide outline with one point per slide.
- If the user wants a rewrite, preserve the meaning and tighten the hook, structure, and pace.
- If the user gives raw notes, extract signal, meaning, and implication before drafting.

## Workflow

1. Identify the post type: single post, carousel, calendar, series, CTA, rewrite, or repurpose.
2. Pick the channel and audience.
3. Pick the best angle from the brief.
4. Draft the post in a LinkedIn-native shape.
5. Offer one strong version first. Add alternates only if they materially help.
6. If the user asked for a plan, include cadence, goal, and why each post exists.

## Output patterns

- Single post: hook, body, closing line, optional CTA.
- Founder post: first-person, contrarian, specific, experience-led.
- Company post: data-led, concise, investigative, product-aware.
- Carousel: title, slide-by-slide outline, and final CTA slide.
- Calendar: week or date, channel, goal, angle, format, source notes.
- Series post: use the recurring SIGNAL_FEED pattern and keep it consistent.
- Rewrite: improve the hook and flow without changing the substance.

## Refer to

- `references/linkedin-playbook.md` for voice, phase defaults, templates, and examples.
- `references/ad-campaigns-success.md` for high-concept campaign patterns, simplicity, and talkability.
