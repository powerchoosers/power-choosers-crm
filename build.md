We need to upgrade the "Call Intelligence" widget to align with Nodal Point's "Forensic Architect" persona and the NEPQ sales methodology. 

Currently, the script is too robotic, uses too much jargon, and the UI freezes while generating. We need to fix both the Logic (Backend) and the Experience (Frontend).

PLEASE IMPLEMENT THE FOLLOWING TWO PROTOCOLS:

1. THE "UNIVERSAL" SCRIPT LOGIC (Backend Handler):
Update the AI system prompt generation logic. It must dynamically select a "Risk Vector" based on the account's industry to ensure the script is relevant to any prospect, not just energy experts.

- Create a `industryRisks` map:
  - Manufacturing: "production spikes triggering demand ratchets"
  - Real Estate: "transmission charges eroding Net Operating Income (NOI)"
  - Logistics: "ghost capacity charges on idle facilities"
  - Technology: "scarcity adders during peak compute times"
  - Default: "structural inefficiencies in the load profile"

- Update the System Prompt with these strict constraints:
  - ROLE: Forensic Market Architect. Skeptical, high-status, helpful but detached.
  - TONE: NEPQ (Neuro-Emotional Persuasion Questioning). Always ask for permission first. Use "I'm not sure if..." to lower resistance.
  - NO JARGON RULE: The AI must possess the grid data (LZ_NORTH, MWs) but NEVER speak it in the script. Translate "MW" to "Usage" and "LZ_North" to "North Zone" or "Region."
  - OUTPUT: A 4-step JSON object: { opener, hook, disturb, close }.

2. THE "NEURAL SCAN" LOADING STATE (Frontend UI):
The current "isGenerating" state looks like the app has frozen. Replace the empty state with a "Forensic Analysis" animation sequence using Framer Motion.

- Visuals: A centered, pulsing "Brain/Sparkle" icon (Lucide React) with a Klein Blue (#002FA7) glow.
- Animation: A text sequence that cycles through forensic steps every 800ms to show "thinking":
   1. "> ACCESSING_GRID_TELEMETRY..."
   2. "> CALCULATING_VARIANCE..."
   3. "> SYNTHESIZING_PROTOCOL..."
- Typography: Use `font-mono`, `text-[10px]`, and `uppercase` for the loading text to maintain the "Technical Instrument" aesthetic.

Execute this now. Ensure the transition from "Loading" to "Result" is seamless.