Based on the Nodal Point Philosophy of "Forensic Precision" and "Signal Over Noise," you are correct to reject an "always-on" AI listener if it burns tokens on low-value calls (like voicemails or gatekeepers).
Since you do not have a live transcription stream (which requires heavy lifting via Twilio Media Streams), we will architect a "Manual-Trigger" Engagement HUD. This puts the Architect (you) in control of the Machine (AI), rather than the Machine billing you for silence.
Here is the architectural blueprint for the [ TACTICAL_INTERVENTION_HUD ].
The Concept: "On-Demand Intelligence"
Instead of a passive stream that listens to everything, we build a Command Console in the Right-Hand Panel. You manually inject data (what the prospect just said) or click a button to summon specific forensic assets.
The Workflow:
1. Call Starts: The panel shifts to "Active Engagement Mode."
2. No Live AI: The system is silent. No tokens used.
3. The Trigger: You encounter a specific objection or need a specific data point.
4. The Strike: You click a specific "Vector Button" (e.g., [ 4CP_DEFENSE ] or [ OBJECTION: PRICE ]).
5. The Output: The AI instantly analyzes the CRM data (via your vector database) and flashes the exact counter-argument or data point needed.

--------------------------------------------------------------------------------
The Architecture: 3-Module Stack
We will replace the "Call Script" with a Modular Combat Deck.
Module 1: The Identity Glyph & Leverage Card (Static)
• Visual: The "Squircle" Glyph of the contact.
• Data: High-contrast key metrics fetched once at call start (no recurring cost).
    ◦ Contract End: EXP: 14 MONTHS (Red/White).
    ◦ Strike Price: $0.042 vs MARKET: $0.038.
    ◦ Liability: RATCHET_RISK: HIGH.
• Why: This keeps the financial reality in front of you so you don't get charmed by the prospect.
Module 2: The "Vector Injection" Buttons (The AI Trigger)
This is your manual override. Instead of the AI listening, you tell it what is happening via Context Buttons.
• Grid: A 2x2 grid of large, touch-friendly buttons.
• Button A: [ GENERATE_OPENER ]
    ◦ Action: Sends CRM context (Industry, Title, Location) to LLM.
    ◦ Output: A 2-sentence "Hook" based on their specific industry risk (e.g., "I see you're in Cold Storage in LZ_WEST...").
• Button B: [ COUNTER: "SEND EMAIL" ]
    ◦ Action: Triggered when they try to brush you off.
    ◦ Output: The exact "No-Oriented" script to pivot from "Send me info" to "Discovery" [Source 883, 884].
• Button C: [ MARKET_INTEL ]
    ◦ Action: Pulls the latest ERCOT pricing/news for their zone.
    ◦ Output: "Did you see the Real-Time pricing hit $3,000 yesterday?"
Module 3: The "Rapid Fire" Input (The Bridge)
• Input: A small text area labeled LIVE_CONTEXT.
• Usage: You type one key phrase the prospect said (e.g., "They are expanding to Houston").
• Action: Hit Enter.
• Result: The AI takes that new fact, combines it with CRM data, and outputs a Strategic Pivot (e.g., "Ask about CenterPoint TDU delays for the new site").

--------------------------------------------------------------------------------
Implementation Instructions
File: src/components/right-panel/ActiveCallInterface.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ShieldAlert, Mail, BarChart3, Send } from 'lucide-react';
import { useAI } from '@/hooks/useAI'; // Your AI hook

export function ActiveCallInterface({ contact, account }: any) {
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingVector, setLoadingVector] = useState<string | null>(null);
  const [liveInput, setLiveInput] = useState('');
  const { generateScript } = useAI();

  // THE TRIGGER MECHANISM
  const handleVectorClick = async (vector: string) => {
    setLoadingVector(vector);
    setAiResponse(null);
    
    // Payload: Only send what is needed. NO live audio.
    const payload = {
      vector_type: vector, // e.g., 'OPENER', 'OBJECTION_EMAIL', 'MARKET_DATA'
      contact_context: {
        title: contact.job_title,
        industry: account.industry,
        load_zone: account.load_zone,
        contract_end: account.contract_end_date
      }
    };

    const response = await generateScript(payload);
    setAiResponse(response); // Text output like "It sounds like you're trying to avoid a bad decision..."
    setLoadingVector(null);
  };

  const handleLiveContext = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVectorClick('LIVE_PIVOT'); // Custom vector based on typed input
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-white/10 relative">
      
      {/* 1. LEVERAGE CARD (Static - No Token Cost) */}
      <div className="p-6 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-4 mb-4">
           {/* Your existing Squircle Avatar Logic */}
           <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center font-mono text-white">
             {contact.initials}
           </div>
           <div>
             <div className="font-bold text-white">{contact.name}</div>
             <div className="text-xs font-mono text-zinc-400">{account.name}</div>
           </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-red-500/10 border border-red-500/20 p-2 rounded text-center">
            <div className="text-[10px] text-red-400 uppercase font-mono">Expiration</div>
            <div className="text-sm font-bold text-white font-mono">{account.days_remaining} DAYS</div>
          </div>
          <div className="bg-[#002FA7]/10 border border-[#002FA7]/20 p-2 rounded text-center">
            <div className="text-[10px] text-[#002FA7] uppercase font-mono">Load Zone</div>
            <div className="text-sm font-bold text-white font-mono">{account.load_zone}</div>
          </div>
        </div>
      </div>

      {/* 2. THE AI OUTPUT STREAM (The Result) */}
      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {aiResponse ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/50 border border-[#002FA7]/30 p-4 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2 text-[#002FA7]">
                <Zap size={14} />
                <span className="text-[10px] font-mono uppercase">Neural Suggestion</span>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed font-sans">{aiResponse}</p>
            </motion.div>
          ) : (
            <div className="text-center text-zinc-600 mt-10 font-mono text-xs">
              AWAITING VECTOR INPUT...
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. THE TRIGGER DECK (Manual Controls) */}
      <div className="p-4 bg-zinc-900 border-t border-white/10">
        
        {/* Rapid Context Input */}
        <div className="relative mb-4">
          <input 
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            onKeyDown={handleLiveContext}
            placeholder="Type context (e.g. 'They hate Oncor')..."
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white focus:border-[#002FA7] outline-none pr-8"
          />
          <Send size={14} className="absolute right-3 top-2.5 text-zinc-500" />
        </div>

        {/* Vector Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => handleVectorClick('OPENER')}
            disabled={!!loadingVector}
            className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-white/5 flex flex-col items-center gap-2 transition-colors"
          >
            <Zap size={16} className={loadingVector === 'OPENER' ? 'animate-pulse text-[#002FA7]' : 'text-white'} />
            <span className="text-[9px] font-mono uppercase text-zinc-400">Generate Opener</span>
          </button>

          <button 
            onClick={() => handleVectorClick('OBJECTION_PRICE')}
            disabled={!!loadingVector}
            className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-white/5 flex flex-col items-center gap-2 transition-colors"
          >
            <ShieldAlert size={16} className={loadingVector === 'OBJECTION_PRICE' ? 'animate-pulse text-red-500' : 'text-white'} />
            <span className="text-[9px] font-mono uppercase text-zinc-400">Price Defense</span>
          </button>

          <button 
            onClick={() => handleVectorClick('OBJECTION_EMAIL')}
            disabled={!!loadingVector}
            className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-white/5 flex flex-col items-center gap-2 transition-colors"
          >
            <Mail size={16} className={loadingVector === 'OBJECTION_EMAIL' ? 'animate-pulse text-amber-500' : 'text-white'} />
            <span className="text-[9px] font-mono uppercase text-zinc-400">"Send Info" Pivot</span>
          </button>

          <button 
            onClick={() => handleVectorClick('MARKET_DATA')}
            disabled={!!loadingVector}
            className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-white/5 flex flex-col items-center gap-2 transition-colors"
          >
            <BarChart3 size={16} className={loadingVector === 'MARKET_DATA' ? 'animate-pulse text-emerald-500' : 'text-white'} />
            <span className="text-[9px] font-mono uppercase text-zinc-400">Market Pulse</span>
          </button>
        </div>
      </div>
    </div>
  );
}
Why This Fits Nodal Point:
1. Zero Waste: You pay only for the exact moment you need intelligence. No idle tokens.
2. Forensic Control: You decide the strategy (Price Defense vs. Opener), the AI just executes the tactics.
3. High-Speed: Buttons are pre-prompted. You don't have to type "Give me a price objection handler." You just click the Shield Icon.
4. Integration: It pulls contract_end_date and load_zone automatically [Source 978, 1291] to ensure the "Opener" is hyper-relevant (e.g., mentioning 4CP risk for their zone).