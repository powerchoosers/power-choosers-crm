To implement the LIABILITY_GAUGE within your TransmissionBuilder.tsx, you need to treat it as a new "Forensic Block" type. This component will visually represent the "Physics of Pricing" by contrasting a client's current fixed rate against real-time grid volatility.

1. Update the Data Schema
First, register the new block type in your Block interface and blockLibrary to maintain the "Obsidian & Glass" aesthetic.

TypeScript
// Inside TransmissionBuilder.tsx
type Block = {
  id: string;
  type: 'TEXT_MODULE' | 'TELEMETRY_GRID' | 'TACTICAL_BUTTON' | 'VARIABLE_CHIP' | 'IMAGE_BLOCK' | 'LIABILITY_GAUGE';
  content: any;
};

const blockLibrary = [
  // ... existing blocks
  { type: 'LIABILITY_GAUGE', label: 'Risk_Vector', icon: Zap },
];
2. Implementation of the Gauge Logic
The gauge should calculate a "Scarcity Risk" percentage. In your addBlock function, initialize the content with forensic defaults:

Logic: Contrast the "Baseline" (Fixed Rate) against the "Vector" (Scarcity Risk).

Aesthetic: Use a horizontal vector bar with a gradient from Zinc-800 to International Klein Blue (#002FA7).

TypeScript
// Inside addBlock function
if (type === 'LIABILITY_GAUGE') {
  return {
    id: Math.random().toString(36).substr(2, 9),
    type: 'LIABILITY_GAUGE',
    content: {
      baselineLabel: 'CURRENT_FIXED_RATE',
      baselineValue: '0.082',
      riskLabel: 'SCARCITY_EXPOSURE',
      riskLevel: 75, // Percentage for the needle/bar
      status: 'VOLATILE'
    }
  };
}
3. The Forensic Preview Component
In the "Simulation" (Right Panel) section of your builder, render a component that looks like a cockpit instrument rather than a generic chart.

TypeScript
{block.type === 'LIABILITY_GAUGE' && (
  <div className="p-6 bg-zinc-950 border border-white/10 rounded-xl space-y-4">
    <div className="flex justify-between items-end">
      <div>
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{block.content.baselineLabel}</p>
        <p className="text-xl font-mono text-white tabular-nums">${block.content.baselineValue}/kWh</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest">{block.content.status}</p>
        <p className="text-xl font-mono text-white tabular-nums">{block.content.riskLevel}%</p>
      </div>
    </div>
    
    {/* The Vector Bar */}
    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden relative">
      <div 
        className="h-full bg-[#002FA7] shadow-[0_0_15px_rgba(0,47,167,0.8)] transition-all duration-1000"
        style={{ width: `${block.content.riskLevel}%` }}
      />
    </div>
    
    <p className="text-[9px] font-mono text-zinc-600 leading-tight uppercase tracking-tighter">
      Note: Structural variance detected in regional load profiles. Architecture is currently leaking $4.2k/mo in ghost capacity.
    </p>
  </div>
)}
4. Integration with Nodal Architect
To align with the Signal Architect persona, the generateWithAi function should be used to craft the "Disturb" text for this gauge:

The Prompt: Instead of saying "You are overpaying," the AI should rewrite the gauge subtext to focus on "Structural Inefficiency" and "Grid Physics".

The Tone: Minimalist and forensic.

Would you like me to refine the generateWithAi prompt to specifically handle "Risk Diagnosis" for this new component?