# Nodal Point Bill Debugger: Architectural & Design Specification (v2.2.4)

The **Bill Debugger** is a forensic energy analysis platform designed to expose "noise" (hidden fees, market markups, and structural penalties) in commercial electricity bills. It is built with **Next.js 16 (App Router)** and follows the **Nodal Point** premium design system.

---

## 1. End-To-End Process Flow

The user journey is orchestrated in `src/app/bill-debugger/page.tsx` through a multi-stage reactive state machine:

1.  **Stage 0: Trust Gate** (`TrustGate.tsx`)
    - Initial landing view establishing forensic credibility.
    - Style: Ultra-clean, wide tracking labels, clear "Run Forensic Analysis" primary action.

2.  **Stage 1: Ingestion** (`UploadZone.tsx`)
    - Drag-and-drop or click-to-upload (PDF/Image).
    - Logic: Client-side file validation and `FormData` preparation.

3.  **Stage 2: Forensic Stream** (`AnalysisStream.tsx`)
    - Visual feedback during API latency.
    - Animation: Matrix-style "Forensic Signal" data ingestion stream mimicking raw memory dumps.

4.  **Stage 3: Diagnostic Preview** (`ResultsPreview.tsx`)
    - **Leads capture prep**: Shows 4 critical extracted markers (Period, Usage, Peak Demand, Diagnostic Finding) to verify extraction accuracy.
    - Style: **Light Glass Architecture** (v2.2.4 alignment).

5.  **Stage 4: Verification Gate** (`EmailGate.tsx`)
    - lead capture mechanism before revealing the deep forensic report.

6.  **Stage 5: Full Forensic Report** (`FullReport.tsx`)
    - Comprehensive breakdown including interactive Mapbox Satellite views, shadow pricing breakouts, demand ratchet models, and strategic recommendations.

---

## 2. Visual Design System (v2.2.4 Alignment)

To match the `nodalpoint.io` homepage, the Bill Debugger follows a "Pure Signal" aesthetic:

### Core Tokens
- **Theme**: Light-themed Glassmorphism.
- **Surface Labels**: `glass-card` Class.
  - Background: `linear-gradient(145deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.05))`.
  - Blur: `backdrop-filter: blur(40px)`.
  - Border: `1px solid rgba(255, 255, 255, 0.5)` (semi-opaque glass edges).
- **Corner Radius**: `30px` (3XL) for all primary cards.
- **Shadows**: Custom "Premium Depth" shadows (e.g., `shadow-2xl shadow-[#002FA7]/5`).

### Typography & Colors
- **Primaries**: Nodal Blue (`#002FA7`) used for "Signal" elements (icons, markers, active buttons).
- **Secondary**: Zinc Palette (`zinc-900` for headings, `zinc-500` for metadata).
- **Forensic Badges**:
  - `Green`: Emerald-700 on Emerald-50 (Positioned Well).
  - `Yellow`: Amber-700 on Amber-50 (Market Rate / Opportunity).
  - `Red`: Rose-700 on Rose-50 (Above Market / Post-Term Spike).

---

## 3. The Forensic "Brain" (Logic Engine)

Located in `src/app/bill-debugger/utils/feedbackLogic.ts` and `rateDatabase.ts`.

### A. Automatic Tiering
- **Small Commercial**: < 20,000 kWh/mo or < 10kW Peak. Benchmarked against "Small Market Average All-In".
- **Large Commercial**: > 20,000 kWh/mo or > 10kW Peak. Benchmarked against "Large Market Average All-In" with specific Energy vs. Delivery breakouts.

### B. Shadow Pricing (Benchmark Calibration)
- Benchmarks are calibrated to **Retail "Sold" Rates** (not wholesale LMP).
- **Feb 2026 Baseline**: ~7.2¢ - 9.0¢ energy components for Oncor Commercial.

### C. Demand Ratchet Modelling
- Calculates hidden penalty costs for large facilities.
- Logic: `Peak Demand * TDU Charge * 12 Months * 0.8` (Estimating the 80% ratchet floor impact).

### D. Contract Lifecycle Intelligence
- **Budget Cliff Warning**: If a current rate is low (Green) but expires within 18-24 months, the system warns of a potential 40-60% budget increase based on 2026 forward curves.
- **MM/YYYY Parsing**: Robust regex and `Date` object normalization to handle varied provider formats (TXU, Engie, Reliant).

---

## 4. API & Data Extraction

### Endpoint: `/api/analyze-bill.js`
- **Model**: OpenRouter / Perplexity (Vision LLM).
- **Prompting Strategy**: Instructs the AI to look for varied phrasing:
  - *"Valid through the meter date on or following..."* (Engie).
  - *"Contract Expires"* (TXU).
- **Normalization**: Backend maps TDU/Zones via `src/lib/market-mapping.ts` using the extracted `serviceAddress`.

### Geography: `/api/maps/geocode.js`
- Translates extracted address into coordinates for the **Mapbox GL** satellite visualization in `ForensicMap.tsx`.

---

## 5. Critical Files Summary

| File | Responsibility | Style |
| :--- | :--- | :--- |
| `page.tsx` | State Orchestration | Layout Wrapper |
| `FullReport.tsx` | Final Data Presentation | 3-Column Glass Grid |
| `feedbackLogic.ts`| Forensic Logic / Scoring | N/A (Logic) |
| `rateDatabase.ts` | Market Benchmarks (Feb 2026) | N/A (Data) |
| `ResultsPreview.tsx`| Teaser / Lead Magnet | Glass Cards |
| `globals.css` | Design Tokens (`glass-card`) | Tailwind v4 |
