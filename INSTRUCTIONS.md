# Nodal Protocol Architect – Email Node Prompt Instructions

## Purpose

Define how the Email node constructs prompts for the AI so that outbound signals read like fast human diagnostics, not vendor templates.

The goal is to:
- Eliminate bullet‑point cold emails.
- Center user "strategy" input as the primary directive.
- Keep prompts short, deterministic, and Nodal‑coded.

---

## Behavioral Rules for AI-Generated Emails

- Treat every email as a **forensic readout of grid liability**, not a sales pitch.
- Assume the reader is a skeptical CFO in Texas who hates brokers.
- Use **plain language, 6th‑grade reading level**, and keep each email under **80 words**.
- **No bullet points at all** in cold emails. Short paragraphs only.
- No greetings like "Hi" or "Hello." Start with the **first name and a comma** only (e.g., `Sarah,`).
- Write like it was typed in **90 seconds** from a real terminal, not a marketing platform.

---

## File-Level Changes

### 1. `optimize.js` – System Instruction Refactor

This handler powers AI optimization and generation (`/api/ai/optimize`). It currently hard‑codes bullet rules into the system prompt and partially ignores user strategy.

#### Remove All Bullet-Specific Rules

Delete any lines in `optimize.js` that instruct the model to use bullets, including but not limited to:

- `- BULLETS: Max 15 words per item.`
- `5. Bullets: Max 15 words per bullet.`
- `4. Bullets: Max 15 words per item.`
- `- Bullet points must be one single, short sentence. Max 15 words per bullet.`

#### New `mode === 'generate_email'` System Instruction

Replace the existing `systemInstruction` block in the `generate_email` branch with this:

```js
} else if (mode === 'generate_email') {
  systemInstruction = `
You write cold emails for an Energy Analyst at Nodal Point. You do not sell, you diagnose.

RULES:
1. Max 80 words.
2. 6th grade vocabulary. No corporate jargon.
3. NO bullet points. Write in 2–3 short paragraphs.
4. NO em-dashes (—). Use commas or periods.
5. Start with first name and a comma only. No "Hi" or "Hello."
6. If you use bullets, this email fails. Use paragraphs only.

NEURAL_CONTEXT:
${dataVectors || '- No specific data vectors provided.'}

CONTACT_COMPANY:
${contact?.company || 'Unknown'}

STRATEGY (follow this above all else):
${prompt}

INSTRUCTIONS:
- Generate a sequence step (type: ${type}) based on the STRATEGY.
- If news or transcript data exists in NEURAL_CONTEXT, reference it directly.

Output MUST be a valid JSON object:
{
  "subject_line": "Direct, non-salesy subject",
  "body_html": "<p>FirstName,</p><p>Paragraph 1.</p><p>Paragraph 2.</p>",
  "logic_reasoning": "Explain why this fits a human, 6th-grade tone and Nodal diagnostic posture."
}
`;
  userContent = `STRATEGY: ${prompt}\n\nDraft/Context: ${draft || '(None)'}`;
}
```

This makes the **user strategy (`prompt`) the primary steering signal**, while the system prompt enforces structure and format.

#### Optional: Simplify `optimize_prompt` Mode

For `mode === 'optimize_prompt'`, keep it minimal:

```js
if (mode === 'optimize_prompt') {
  systemInstruction = `
You are the Nodal Architect. Your task is to clean and tighten a prompt that will be used to generate cold email copy.

RULES:
1. Keep it under 80 words.
2. No mention of bullets.
3. State the goal, the target persona, and one key risk signal.
4. Output ONLY the optimized prompt text. No explanations.
`;
  userContent = `Original prompt:\n\n${prompt}`;
}
```

---

### 2. `page.tsx` – Email Node Strategy Input

The Calibration panel for an Email node currently exposes multiple fragmented fields (e.g., "Architect Role," "Liability Objective," "Forensic Constraints") that get concatenated into a single prompt string. This increases cognitive load and still allows the back end to dominate behavior.

#### Remove Multi-Field Prompt Configuration

In the right‑side Calibration panel for an Email node, remove any block that looks like this pattern:

```tsx
// Remove this pattern
<div className="space-y-2">
  <label>Architect Role</label>
  <input
    value={selectedNode?.data.promptConfig?.role}
    ...
  />
</div>

<div className="space-y-2">
  <label>Liability Objective</label>
  <input
    value={selectedNode?.data.promptConfig?.objective}
    ...
  />
</div>

<div className="space-y-2">
  <label>Forensic Constraints</label>
  <input
    value={selectedNode?.data.promptConfig?.constraints}
    ...
  />
</div>
```

And any logic that assembles `promptConfig.role + promptConfig.objective + promptConfig.constraints` into a single prompt string.

#### Replace With a Single "Strategy Directive" Field

Add one field, bound directly to `selectedNode.data.prompt`:

```tsx
<div className="space-y-3">
  <label className="text-10px font-mono text-zinc-500 uppercase tracking-widest">
    Strategy Directive
  </label>
  <textarea
    className="w-full h-32 bg-black/40 border border-white/5 rounded-xl p-3 text-xs font-mono
               focus:border-002FA7 outline-none transition-all text-zinc-300"
    placeholder={
      "Write the signal you want.\n\n" +
      "Example:\n" +
      "Dallas CFOs with high 4CP exposure. Reference their load zone.\n" +
      "Two short paragraphs. No bullets."
    }
    value={(selectedNode?.data.prompt as string) || ""}
    onChange={(e) =>
      updateNodeData(selectedNode!.id, { prompt: e.target.value })
    }
  />
</div>
```

This ensures the user writes **one coherent instruction**, which is passed as `prompt` to `/api/ai/optimize` in both `optimize_prompt` and `generate_email` flows.

---

## Execution Model

1. **User** selects an Email node and writes a **Strategy Directive** (single textarea).
2. **Protocol builder** stores it as `node.data.prompt`.
3. **Preview / AI mode** calls `/api/ai/optimize` with:
   - `mode: 'generate_email'`
   - `type: node.data.type`
   - `prompt: node.data.prompt`
   - `vectors: node.data.vectors`
   - `contact: { …enriched contact + energy intel… }`
4. **optimize.js** builds a tight system instruction that:
   - Enforces **no bullets**, short paragraphs, and first‑name greeting.
   - Injects user STRATEGY verbatim.
   - Returns `subject_line`, `body_html`, and `logic_reasoning` JSON.
5. **UI** writes:
   - `node.data.aiBody = data.optimized`
   - `node.data.aiSubject = data.subject`
   - `aiLogic = data.logic` for inspection.

---

## Design Principles (Nodal Point)

- **Trade on physics, not templates**: The AI's only job is to articulate structural risk (4CP, load factor, scarcity adders), not to "sound professional".
- **One node = one directive**: If an instruction cannot be expressed in one Strategy Directive field, the node is confused and needs to be split.
- **No vendor energy**: Any email that looks like a marketing sequence is a failed run. The prompts here are built to prevent that at the root.

---

## Implementation Checklist

- [ ] Remove all bullet-mention lines from `optimize.js`
- [ ] Replace `generate_email` system instruction in `optimize.js`
- [ ] Simplify `optimize_prompt` mode (optional but recommended)
- [ ] Remove multi-field prompt config from `page.tsx` Calibration panel
- [ ] Add single "Strategy Directive" textarea to `page.tsx`
- [ ] Test with a dummy contact and Strategy Directive
- [ ] Verify AI output has no bullets and starts with first name only
- [ ] Commit as single PR with this `INSTRUCTIONS.md` as reference

---

**Save this file as `INSTRUCTIONS.md` at the root of your protocol builder module.**
