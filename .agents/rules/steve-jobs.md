---
trigger: always_on
---

# NODAL POINT — Design & Code Rules
**Antigravity IDE Skill | nodalpoint.io | ≤12k chars**

You are building a forensic energy market intelligence platform. Not a CRM. Not a dashboard. A **market-reading instrument** for Texas ERCOT diagnostics.

---

## IDENTITY

- **Company**: Nodal Point (nodalpoint.io)
- **Mission**: Expose structural energy market inefficiency. Not save money — eliminate liability.
- **User**: Energy advisors diagnosing Fortune 500 buyers. They think like forensic accountants, not salespeople.
- **Stack**: Next.js 15, TypeScript, Tailwind v4, Supabase, Zustand

---

## DESIGN PHILOSOPHY (Steve Jobs Applied)

**Creativity = Connecting Dots.** Steal from unrelated domains:
- Military intelligence dashboards → right-panel forensic reveal
- Trading terminals (Bloomberg) → monospace data hierarchy
- Surgical suites → precision instrument layout, zero wasted motion
- Zen minimalism → whitespace focuses attention.

**Simplicity Through Elimination.** Jobs cut 70% of Apple's product line in 1997. Do the same to features. If removing it doesn't break the core mission, remove it.

**CFO Test.** Every screen must pass: Can a skeptical CFO read the critical insight in 3 seconds? If not, redesign.

**The Unboxing Moment.** Every interaction should feel like unlocking a classified document — not browsing a SaaS app.

---

## AESTHETIC LAW: Obsidian & Glass

Dark mode only. No exceptions. No gradients. No bright colors outside Klein Blue signals.

### Color Tokens (Do Not Deviate)

```
Background:   oklch(0.13 0.028 261.692)  → zinc-950 (obsidian void)
Foreground:   oklch(0.985 0.002 247.839) → zinc-50  (near white)
Secondary:    oklch(0.551 0.027 264.364) → zinc-400 (metadata)
Signal Blue:  #002FA7                    → International Klein Blue
Border:       rgba(255,255,255,0.05)     → white/5 (default)
Border Hover: rgba(255,255,255,0.10)     → white/10 (interaction)
```

**Klein Blue (#002FA7) is a SIGNAL COLOR only.** Use it for:
- Active states, focus rings
- Critical alerts (demand ratchet exposure, scarcity adder spikes)
- Primary action buttons
- Scrollbar hover state

Do NOT use Klein Blue for decorative purposes.

### Glass System (Use These Classes — Do Not Invent New Ones)

| Class | When to Use |
|---|---|
| `.nodal-glass` | Default translucent surface — nav, sidebars, base panels |
| `.glass-panel` | Floating elements — modals, right panel, popovers |
| `.nodal-void-card` | Data containers — tables, lists, records, rows |
| `.nodal-table-header` | Sticky table headers in scrollable views |
| `.nodal-module-glass` | Right-panel active content area |
| `.nodal-input` | All form inputs — mono font, zinc-900, Klein Blue focus |
| `.icon-button-forensic` | Icon-only actions — no container, scale on hover |

All glass = `rgba(9,9,11,0.9)` + `blur(12px)` + `border-white/5`. Never more blur than 12px. Never change the base opacity.

---

## TYPOGRAPHY LAW

**Monospace = Data. Sans-serif = Labels.**

This split is non-negotiable:

```tsx
// ✅ CORRECT
<p className="text-xs text-zinc-400 font-sans">Annual Energy Spend</p>
<p className="text-2xl font-mono text-zinc-50">$2,400,000</p>

// ❌ WRONG
<p className="text-sm">Annual Energy Spend: $2,400,000</p>
```

- **ERCOT prices, MWh values, dollar amounts, percentages** → `font-mono`
- **Labels, headings, descriptions, nav items** → `font-sans` (Inter)
- **Metadata (timestamps, IDs, secondary info)** → `text-xs text-zinc-400 font-mono`
- **Letter spacing**: `-0.02em` tracking on sans headings (`--tracking-normal`)

---

## INTERACTION LAW

### Hover States
No shadow growth. No glow explosions. Subtle only:

```tsx
// ✅ CORRECT hover
className="border border-white/5 hover:border-white/10 hover:bg-zinc-900/60 transition-all duration-300"

// ❌ WRONG hover  
className="hover:shadow-2xl hover:shadow-blue-500/50"
```

- Transition: `300ms` duration, `cubic-bezier(0.16, 1, 0.3, 1)` easing
- Scale: `scale(1.02)` max on interactive cards
- Border shift: `white/5` → `white/10` on hover
- Background: subtle zinc-900/60 on hover only

### Right Panel (Forensic Reveal)
- Slides in from right. Never fades. Max `200ms` slide-in.
- Close: always top-right. `Esc` key always works.
- Links inside panel update the panel — they do not reload the main view.
- Every click on a contact/target/call must produce an instant forensic reveal.

### Loading States
- No spinners unless action takes >800ms
- Skeleton screens must match the glass system (zinc-800 pulse)
- Never block the UI for <300ms operations

---

## CODING RULES

### 1. No Gradients
```tsx
// ❌ BANNED
<div className="bg-gradient-to-br from-zinc-900 to-zinc-950">

// ✅ USE INSTEAD
<div className="bg-zinc-950 border border-white/5">
```
Glass + borders + blur create depth. Gradients create noise.

### 2. No Explanatory UI
If a component needs tooltip text to explain what it does, redesign it. Data should speak without annotation.

### 3. Zustand for State — Not Context
```typescript
// ✅ CORRECT — flat, single-responsibility
export const useUIStore = create((set) => ({\n  rightPanelOpen: false,\n  rightPanelContent: null,\n  openPanel: (content) => set({ rightPanelOpen: true, rightPanelContent: content }),\n  closePanel: () => set({ rightPanelOpen: false }),\n}));
```
No nested providers. No prop drilling. Keep stores flat.

### 4. Scroll Containers
Always use `.np-scroll` on scrollable divs — contains repaints, hides scrollbar, enables touch:
```tsx
<div className="np-scroll overflow-y-auto h-full">
```

### 5. TypeScript Discipline
- No `any`. Ever.
- All Supabase query results get typed interfaces in `/src/types`
- Component props get explicit interfaces, not inlined objects

---

## ERCOT / ENERGY DOMAIN RULES

This platform diagnoses liability. Never call it "savings." The vocabulary matters:

| Wrong | Correct |
|---|---|
| "Save money on energy" | "Eliminate demand ratchet exposure" |
| "Energy costs" | "Energy liability profile" |
| "Low price" | "Below-scarcity-adder pricing window" |
| "Peak usage" | "4CP coincident peak exposure" |
| "Monthly bill" | "Tariff structure + pass-through liability" |

**4CP (Four Coincident Peaks):** The 4 highest demand hours across ERCOT each June-September. Missing these peaks = transmission cost liability for the entire next year. This is the primary forensic signal.

**Demand Ratchet:** 80% billing floor on peak demand. If a client hits 1,000 kW once, they pay for 800 kW minimum every month. This is the hidden liability most buyers don't see.

**Scarcity Adder:** Real-time price multiplier triggered by low reserve margins. Appears as sudden price spikes. Not a fee — a grid physics event.

---

## ANTI-PATTERNS (Instant Rejection)

```
❌ Gradients anywhere in the app UI
❌ Light mode or white backgrounds in the platform
❌ Data values in sans-serif font
❌ Labels in monospace font
❌ Hover shadows that grow or glow
❌ Spinners under 800ms
❌ Explanatory text (tooltips, help modals, onboarding carousels)
❌ Bright colors outside Klein Blue signal use
❌ Generic CRM vocabulary ("partnership", "synergy", "save money")
❌ Nested React Context for frequently-updating state
❌ Custom glass classes (use the system, never invent)
❌ Tabs inside modals
❌ Breadcrumbs that don't navigate
❌ Right panel that fades instead of slides
❌ Any interaction that takes >200ms to feel responsive
```

---

## PRE-COMMIT CHECKLIST

```
VISUAL
[ ] Most important data: largest, first, monospace
[ ] Labels: sans-serif, zinc-400, smaller than data
[ ] No gradients. No bright colors outside Klein Blue.
[ ] Glass class used from system (not custom inline styles)
[ ] Border opacity: white/5 default, white/10 hover only

INTERACTION  
[ ] Hover: border shift + subtle bg, 300ms ease. No shadows.
[ ] Right panel: slides right, ≤200ms, Esc closes
[ ] No spinner under 800ms
[ ] Klein Blue used for signal/action only (not decoration)

CODE
[ ] No `any` types
[ ] State in Zustand, not Context
[ ] Scrollables use .np-scroll
[ ] No gradients in className strings

DOMAIN
[ ] ERCOT terminology used correctly (liability, not savings)
[ ] 4CP, demand ratchet, scarcity adder referenced by name when relevant
[ ] CFO test passed: 3-second clarity on the critical insight
[ ] Does this expose market inefficiency, or is it decoration?
```

---

**Forensic. Obsidian. Precise. Nodal Point.**
