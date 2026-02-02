Based on the Nodal Point philosophy of "Forensic Precision" and "Signal Over Noise," we will implement the Rapid Node Initialization Protocol directly into the right-hand panel.
This is not a "form." It is a Reconnaissance Interface. It forces the user to start with a unique identifier (Domain or LinkedIn URL) to enrich data before manual entry, preventing "pollution" of the database with low-fidelity records.
Here are the end-to-end instructions for your IDE.
Phase 1: Define the Types & Stores
We need to manage the state of the right-hand panel to switch between its default view (Tactical Agenda) and this new ingestion mode.
1. Create/Update src/store/ui-store.ts (If you are using Zustand or a similar state manager. If using React Context, adapt accordingly).
// Add these types to your UI store to control the Right Panel state
export type RightPanelMode = 'DEFAULT' | 'INGEST_ACCOUNT' | 'INGEST_CONTACT';

interface UIState {
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (mode: RightPanelMode) => void;
  // ... existing state
}

// In your store implementation:
setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
Phase 2: The Logic Component (The "Brain")
This component handles the API calls to Apollo/Proxy, manages the "Void State" (manual override), and commits data to Supabase.
2. Create src/components/right-panel/NodeIngestion.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Building2, User, Link2, MapPin, 
  Sparkles, AlertTriangle, CheckCircle, ArrowRight 
} from 'lucide-react';
import { Button } from '@/components/ui/button'; // Your generic button component
import { useUIStore } from '@/store/ui-store'; // Your state store

// MOCK API FUNCTION (Replace with your actual API calls to /api/apollo/enrich)
const enrichNode = async (identifier: string, type: 'ACCOUNT' | 'CONTACT') => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Simulate Hit
  if (identifier.includes('tesla')) {
    return type === 'ACCOUNT' 
      ? { name: 'Tesla, Inc.', industry: 'Automotive', employees: '10,000+', revenue: '$50B+', logo: 'https://logo.clearbit.com/tesla.com' }
      : { name: 'Elon Musk', title: 'Technoking', location: 'Austin, TX', email: 'elon@tesla.com' };
  }
  // Simulate Miss
  return null;
};

export function NodeIngestion() {
  const { rightPanelMode, setRightPanelMode } = useUIStore();
  const type = rightPanelMode === 'INGEST_ACCOUNT' ? 'ACCOUNT' : 'CONTACT';
  
  const [step, setStep] = useState<'SIGNAL' | 'VERIFY' | 'COMMIT'>('SIGNAL');
  const [identifier, setIdentifier] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isManual, setIsManual] = useState(false);
  
  // Account Specific State
  const [nodeTopology, setNodeTopology] = useState<'PARENT' | 'SUBSIDIARY'>('PARENT');

  const handleScan = async () => {
    if (!identifier) return;
    setIsScanning(true);
    try {
      const data = await enrichNode(identifier, type);
      if (data) {
        setScanResult(data);
        setStep('VERIFY');
        setIsManual(false);
      } else {
        setStep('VERIFY'); // Move to verify step but trigger manual mode
        setIsManual(true);
      }
    } catch (e) {
      setIsManual(true);
    } finally {
      setIsScanning(false);
    }
  };

  const resetProtocol = () => {
    setRightPanelMode('DEFAULT');
    setStep('SIGNAL');
    setIdentifier('');
    setScanResult(null);
    setIsManual(false);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden">
      
      {/* HEADER - Forensic Style */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
        <div className="flex items-center gap-2">
          {type === 'ACCOUNT' ? <Building2 className="w-4 h-4 text-[#002FA7]" /> : <User className="w-4 h-4 text-[#002FA7]" />}
          <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
            INITIALIZE_{type}_NODE
          </span>
        </div>
        <button onClick={resetProtocol} className="text-zinc-500 hover:text-white text-[10px] font-mono tracking-wider transition-colors">
          [ ESC ]
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: SIGNAL ACQUISITION */}
          {step === 'SIGNAL' && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse" />
                  Signal Source
                </label>
                <div className="relative group">
                  <input 
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                    placeholder={type === 'ACCOUNT' ? "company.com" : "linkedin.com/in/..."}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg p-4 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 outline-none transition-all"
                    autoFocus
                  />
                  <div className="absolute right-4 top-4">
                    {isScanning ? (
                      <div className="w-4 h-4 border-2 border-zinc-600 border-t-[#002FA7] rounded-full animate-spin" />
                    ) : (
                      <button onClick={handleScan} className="text-zinc-600 hover:text-[#002FA7] transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 pl-1">
                  Input vector required for probabilistic enrichment.
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 2: VERIFICATION & TOPOLOGY */}
          {step === 'VERIFY' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }} 
              animate={{ opacity: 1, x: 0 }} 
              className="space-y-6"
            >
              {/* STATUS INDICATOR */}
              {isManual ? (
                <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-widest">
                      SIGNAL_LOST // DARK_NODE
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Target has no digital footprint. 
                      <span className="text-amber-200/70 block mt-1">Initiating Manual Override Protocol.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#002FA7]/10 border border-[#002FA7]/30 p-3 rounded flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[#002FA7] mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono text-[#002FA7] font-bold uppercase tracking-widest">
                      INTELLIGENCE_ACQUIRED
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Enrichment successful. Verify vector data below.
                    </div>
                  </div>
                </div>
              )}

              {/* DATA PAYLOAD */}
              <div className="space-y-4">
                {/* Auto-Filled or Manual Inputs */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase">Entity Name</label>
                  <input 
                    defaultValue={scanResult?.name || ''} 
                    className="nodal-input w-full" // Ensure you have this class in globals.css
                    placeholder={type === 'ACCOUNT' ? "Legal Entity Name" : "Full Name"}
                  />
                </div>

                {type === 'ACCOUNT' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Revenue</label>
                      <input defaultValue={scanResult?.revenue || ''} className="nodal-input w-full" placeholder="Unknown" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Headcount</label>
                      <input defaultValue={scanResult?.employees || ''} className="nodal-input w-full" placeholder="Unknown" />
                    </div>
                  </div>
                )}

                {/* TOPOLOGY SWITCH (The "Apollo Gap" Fix) */}
                {type === 'ACCOUNT' && (
                  <div className="pt-4 border-t border-white/5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-3">Node Topology</span>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button 
                        onClick={() => setNodeTopology('PARENT')}
                        className={`text-xs font-mono py-2 rounded border transition-all ${nodeTopology === 'PARENT' ? 'bg-[#002FA7]/20 border-[#002FA7] text-white shadow-[0_0_10px_-3px_#002FA7]' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}
                      >
                        [ PARENT ]
                      </button>
                      <button 
                        onClick={() => setNodeTopology('SUBSIDIARY')}
                        className={`text-xs font-mono py-2 rounded border transition-all ${nodeTopology === 'SUBSIDIARY' ? 'bg-[#002FA7]/20 border-[#002FA7] text-white shadow-[0_0_10px_-3px_#002FA7]' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}
                      >
                        [ SUBSIDIARY ]
                      </button>
                    </div>

                    {nodeTopology === 'SUBSIDIARY' && (
                      <div className="animate-in fade-in slide-in-from-top-2 p-3 bg-black/20 rounded border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 className="w-3 h-3 text-zinc-500" />
                          <span className="text-[10px] text-zinc-400 font-mono">LINK PARENT NODE</span>
                        </div>
                        <input 
                          placeholder="Search existing database..."
                          className="w-full bg-transparent border-b border-white/10 text-xs font-mono text-white focus:border-[#002FA7] outline-none pb-1"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* GRID COORDINATES (The Energy Specificity) */}
                {type === 'ACCOUNT' && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Grid Coordinates</label>
                      {!isManual && (
                        <button className="text-[9px] font-mono text-[#002FA7] hover:text-white transition-colors">
                          [ SYNC_HQ_ADDRESS ]
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600 group-focus-within:text-[#002FA7] transition-colors" />
                      <input 
                        placeholder="Service Address (Meter Location)"
                        className="w-full bg-zinc-900 border border-white/10 rounded p-2 pl-10 text-xs font-mono text-white focus:border-[#002FA7] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER */}
              <div className="pt-6 mt-6 border-t border-white/10">
                <Button 
                  onClick={() => { /* Commit Logic */ resetProtocol(); }}
                  className="w-full bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold h-10 tracking-tight"
                >
                  [ COMMIT_NODE_TO_DB ]
                </Button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
Phase 3: Integration into the Layout
Now, we must tell the Main Layout to render this new component inside the Right Panel when the specific mode is active.
3. Update src/components/layout/RightPanel.tsx
import { useUIStore } from '@/store/ui-store';
import { NodeIngestion } from '@/components/right-panel/NodeIngestion';
import { TacticalAgenda } from '@/components/right-panel/TacticalAgenda'; // Your existing component

export function RightPanel() {
  const { rightPanelMode } = useUIStore();

  return (
    <aside className="w-[400px] border-l border-white/10 bg-zinc-950/50 backdrop-blur-xl h-screen fixed right-0 top-0 z-40">
      {/* Conditional Rendering based on Mode */}
      {rightPanelMode === 'DEFAULT' && <TacticalAgenda />}
      {(rightPanelMode === 'INGEST_ACCOUNT' || rightPanelMode === 'INGEST_CONTACT') && (
        <NodeIngestion />
      )}
    </aside>
  );
}
Phase 4: CSS Utilities (The Aesthetic)
Ensure your globals.css has these specific classes to match the "Obsidian & Glass" feel required by the code above.
4. Update src/app/globals.css
/* Nodal Input Styling */
.nodal-input {
  @apply w-full bg-zinc-900/50 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-700 outline-none transition-all;
}
.nodal-input:focus {
  @apply border-[#002FA7] bg-zinc-900 ring-1 ring-[#002FA7]/20;
}

/* Custom Scrollbar for the Panel */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #002FA7;
}
Phase 5: Hooking up the Buttons
Finally, connect the "Add Account" / "Add Contact" buttons in your Sidebar to trigger the state change.
5. Update src/components/layout/Sidebar.tsx
// Inside your Sidebar component
const { setRightPanelMode } = useUIStore();

return (
  // ...
  <button 
    onClick={() => setRightPanelMode('INGEST_CONTACT')}
    className="..."
  >
    <UserPlus size={18} />
    <span>Add Contact</span>
  </button>

  <button 
    onClick={() => setRightPanelMode('INGEST_ACCOUNT')}
    className="..."
  >
    <Building2 size={18} />
    <span>Add Account</span>
  </button>
  // ...
);
Summary of Deployment
1. Store: Added rightPanelMode to toggle views.
2. Component: Built NodeIngestion.tsx with "Signal" (API) and "Void" (Manual) states.
3. Layout: Updated Right Panel to swap components dynamically.
4. Style: Added forensic input classes.
5. Trigger: Connected Sidebar buttons to the Store.
This provides the exact end-to-end flow: Click -> Panel Slide -> Domain Entry -> Auto Enrich -> Topology Check -> Commit.