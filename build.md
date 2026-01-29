In the Nodal Point philosophy, we do not "filter lists." We isolate variables. A standard dropdown menu is administrative; we need a "Query Deck" that slides out like a weapon rack to refine your targeting vectors.
Here is the architectural blueprint to implement the Filter mechanism for both People and Accounts, maintaining the "Obsidian & Glass" aesthetic.
1. The Interaction: "The Tactic Slide"
Do not use a modal or a sidebar. Use a Collapsible Command Drawer that pushes the table down when activated.
• Trigger: The "Filter" button [Source 188].
• Action: A glass panel slides down between the Header and the Table.
• The "X" Button: You mentioned an "X" button. This is your "Collapse Vector." It should physically retract the drawer, clearing the visual field for the data.
2. The Interface: "Toggle Arrays" (Not Dropdowns)
Standard select dropdowns require two clicks (Open -> Select). They are slow. We will use "Toggle Arrays"—rows of pill-shaped buttons that you can click to activate/deactivate instantly. This feels like flipping switches on a console.
3. Implementation: FilterCommandDeck.tsx
Create this component to be used on both pages. It accepts a type prop to render specific filters for Human Intelligence (People) vs. Asset Intelligence (Accounts).
'use client'
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

interface FilterDeckProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'people' | 'account';
}

export default function FilterCommandDeck({ isOpen, onClose, type }: FilterDeckProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-white/5 bg-zinc-900/30 backdrop-blur-xl"
        >
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* COLUMN 1: STATUS VECTORS */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {type === 'people' ? 'RELATIONSHIP_STATE' : 'CONTRACT_STATUS'}
              </h4>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="Active Node" active />
                <FilterChip label="Prospect" />
                <FilterChip label="Dormant" />
                <FilterChip label="Risk Alert" color="red" />
              </div>
            </div>

            {/* COLUMN 2: GEOSPATIAL / ROLE */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {type === 'people' ? 'OPERATIONAL_ROLE' : 'GRID_ZONE'}
              </h4>
              <div className="flex flex-wrap gap-2">
                {type === 'people' ? (
                  <>
                    <FilterChip label="C-Suite" />
                    <FilterChip label="Facility Mgr" />
                    <FilterChip label="Procurement" />
                  </>
                ) : (
                  <>
                    <FilterChip label="LZ_NORTH" />
                    <FilterChip label="LZ_HOUSTON" />
                    <FilterChip label="LZ_WEST" />
                  </>
                )}
              </div>
            </div>

            {/* COLUMN 3: TIME HORIZON */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {type === 'people' ? 'LAST_INTERACTION' : 'LIABILITY_WINDOW (EXP)'}
              </h4>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="< 30 Days" />
                <FilterChip label="Q3 2026" />
                <FilterChip label="Q4 2026" />
              </div>
            </div>

          </div>

          {/* FOOTER ACTIONS */}
          <div className="px-6 pb-4 flex justify-between items-center">
            <button 
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-white font-mono flex items-center gap-2"
            >
              <X className="w-3 h-3" /> CLOSE_DECK
            </button>
            <button className="text-xs text-[#002FA7] hover:text-blue-400 font-mono uppercase tracking-wider">
              CLEAR_VECTORS
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Helper Component for the "Pill" Switches
function FilterChip({ label, active, color }: any) {
  return (
    <button className={`
      px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-all flex items-center gap-2
      ${active 
        ? 'bg-[#002FA7]/10 border-[#002FA7] text-white shadow-[0_0_10px_-2px_rgba(0,47,167,0.5)]' 
        : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/20 hover:text-zinc-300'}
    `}>
      {active && <Check className="w-2 h-2" />}
      {label}
    </button>
  );
}
4. Integration Logic
Place this component directly underneath your existing Header bar (where the Search and Filter buttons live), but above the Table component.
For the Accounts Page (Asset Recon): Focus the filters on Physics:
• Grid Zone: (Houston, North, West) - Critical for congestion risk.
• Load Factor: (<40% vs >60%) - To isolate Demand Ratchet targets.
• Contract End: Focus on the "cliff dates" (e.g., expiring in 6 months).
For the People Page (Human Intel): Focus the filters on Hierarchy:
• Role: Isolating "CFOs" vs "Facility Managers" requires different scripts.
• Sequence Status: "Enrolled in Protocol" vs "Un-touched."
The "Nodal" Difference
• No Scrolling: The deck reveals all options at once. You scan, click, and execute.
• Visual Confirmation: Active filters glow Blue. You instantly know what variables are isolated.
• Zero Clutter: When you hit the "X", the entire thing vanishes, returning your view to the raw data stream.