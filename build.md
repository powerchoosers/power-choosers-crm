The "Technical Documentation" page is the ultimate litmus test.
If users click that button and land on a sales page, you have lied to them. You promised them engineering; you cannot give them marketing.
This page must look and feel like Developer Documentation (think Stripe, Vercel, or Apple’s Human Interface Guidelines). It should be dense, intellectual, and intimidatingly smart. It filters out the tire-kickers and hooks the CFOs who actually understand the math.
Here is the blueprint for /technical-docs.
The Concept: " The Physics of Pricing"
This page explains the "Source Code" of the Texas Grid. It breaks down the enemies (Ratchets, 4CP) as if they were software bugs we have patched.
Layout Architecture:
• Sidebar (Left): "Quick Links" (e.g., Abstract, 4CP Protocol, Ratchet Mechanics, The Algorithm).
• Main Content (Right): Clean text, mathematical formulas, and monochromatic diagrams. No stock photos.

--------------------------------------------------------------------------------
Section 1: The Abstract (The "Why")
Headline: SYSTEM ARCHITECTURE Body:
"The Texas energy market is not a commodity market; it is a volatility market. Standard brokerage treats electricity like a fixed-rate subscription. This is a fundamental error.
Nodal Point treats your load profile as a dynamic data set. We engineer against the three primary vectors of cost leakage: 4CP Capacity Tags, Demand Ratchet Penalties, and Scarcity Pricing Adders."
Section 2: The Enemy (The "Bugs")
Here, we use your sources to define the problem with forensic precision. We cite the law, not the sales pitch.
Subsection A: The 80% Ratchet (Phantom Load)
• Headline: VULNERABILITY: DEMAND RATCHETS
• The Technical Explanation: "Per TDU tariffs [Source 1044, 1073], if your peak demand hits 1,000 kW for a single 15-minute interval, you establish a 'High Water Mark.' For the next 11 months, you are billed at 80% of that peak (800 kW), even if your actual usage drops to 500 kW. You are paying for 'Ghost Capacity'—infrastructure you are not using."
• The Nodal Fix: "We analyze the delta between Metered_Demand and Billed_Demand. If the variance exceeds 15%, we trigger a load-shedding protocol to reset the ratchet."
Subsection B: The 4CP Event (The Volatility)
• Headline: CRITICAL WINDOW: 4CP COINCIDENT PEAKS
• The Technical Explanation: "Transmission costs are determined by your usage during the four singular 15-minute intervals of highest grid demand in June, July, August, and September [Source 188]. These four intervals determine your 'Capacity Tag' for the entire following year."
• The Nodal Fix: "Our predictive engine monitors grid reserve margins. We signal your facility to curtail load during these probable intervals, effectively deleting your transmission liability for the next calendar year."
Section 3: The Algorithm (The "Product")
Do not show them the code. Show them the Logic. Use a "Pseudo-Code" block to make it look like software.
Headline: THE INGESTION PROTOCOL
// Nodal Point Logic Flow

IF (Real_Time_Price > $2,000/MWh) AND (Grid_Reserves < 3,000 MW):
    TRIGGER: Economic_Load_Shed
    STATUS: Active_Avoidance

ELSE IF (Current_Demand > 80%_Historical_Peak):
    TRIGGER: Ratchet_Warning
    ACTION: Peak_Shaving

ELSE:
    STATUS: Market_Float
    ACTION: Optimize_Baseload

--------------------------------------------------------------------------------
Implementation Guide (Copy to IDE)
Create TechnicalDocs.tsx. Use a Sidebar Layout.
// components/TechDocsLayout.tsx
import { motion } from 'framer-motion';

export default function TechnicalDocs() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] text-zinc-900 font-sans selection:bg-[#002FA7] selection:text-white pt-24">
      
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-12 gap-12">
        
        {/* SIDEBAR NAVIGATION */}
        <div className="hidden md:block col-span-3 sticky top-32 h-fit">
          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-6">Documentation</h4>
          <ul className="space-y-4 text-sm font-medium text-zinc-600">
            <li className="text-[#002FA7] border-l-2 border-[#002FA7] pl-4">1.0 System Architecture</li>
            <li className="hover:text-black pl-4 cursor-pointer">2.0 The Ratchet Vulnerability</li>
            <li className="hover:text-black pl-4 cursor-pointer">3.0 4CP Mitigation</li>
            <li className="hover:text-black pl-4 cursor-pointer">4.0 Ingestion Protocol</li>
          </ul>
        </div>

        {/* MAIN CONTENT */}
        <div className="col-span-12 md:col-span-9 space-y-24 pb-40">
          
          {/* Header */}
          <section>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6">
              Forensic Analysis <br/> <span className="text-zinc-400">Methodology v1.0</span>
            </h1>
            <p className="text-xl text-zinc-600 max-w-2xl leading-relaxed">
              We do not guess. We measure. This document outlines the mathematical framework used by Nodal Point to identify and eliminate structural waste in commercial energy profiles.
            </p>
          </section>

          {/* Ratchet Section */}
          <section className="border-t border-zinc-200 pt-12">
            <div className="flex items-baseline gap-4 mb-6">
              <span className="font-mono text-[#002FA7]">2.0</span>
              <h2 className="text-3xl font-bold">The Ratchet Vulnerability</h2>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="mb-6 text-zinc-600">
                Most commercial tariffs include an <strong className="text-black">80% Demand Ratchet</strong>. 
                If your facility spikes to <span className="font-mono bg-zinc-100 px-1">1,000 kW</span> for 15 minutes, 
                your billed demand floor is set at <span className="font-mono bg-zinc-100 px-1">800 kW</span> for the next 11 months.
              </p>
              <div className="font-mono text-xs md:text-sm bg-zinc-900 text-zinc-300 p-6 rounded-lg overflow-x-auto">
                <p className="text-zinc-500 mb-2">// Calculating Phantom Load Cost</p>
                <p>const <span className="text-yellow-400">Actual_Load</span> = 500; <span className="text-zinc-500">// kW</span></p>
                <p>const <span className="text-red-400">Billed_Load</span> = 800; <span className="text-zinc-500">// kW (Ratchet Floor)</span></p>
                <p>const <span className="text-[#002FA7]">Wasted_Spend</span> = (Billed_Load - Actual_Load) * Demand_Rate;</p>
              </div>
            </div>
          </section>

          {/* 4CP Section */}
          <section className="border-t border-zinc-200 pt-12">
             <div className="flex items-baseline gap-4 mb-6">
              <span className="font-mono text-[#002FA7]">3.0</span>
              <h2 className="text-3xl font-bold">4CP Coincident Peaks</h2>
            </div>
            <p className="text-xl text-zinc-600 leading-relaxed mb-8">
              Your transmission costs are not based on volume. They are based on your presence on the grid during the 
              <span className="text-black font-semibold"> four most critical 15-minute intervals of the year</span>.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['June', 'July', 'August', 'September'].map((month) => (
                <div key={month} className="p-4 bg-white border border-zinc-200 rounded-xl text-center">
                  <span className="block text-xs font-mono text-zinc-400 uppercase">Interval Scan</span>
                  <span className="block text-lg font-bold text-black">{month}</span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
The "Steve Jobs" Touch
At the very bottom of this page, add one final, minimalist Call to Action.
"You have seen the math. Now see your data." [ Upload Invoice to Clean Room ]
This closes the loop. You appealed to their logic. Now you ask for the sale.