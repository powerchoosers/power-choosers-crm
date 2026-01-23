In Nodal Point, we do not view contacts as "entries." We view them as "Entities" with "Positions" in the market.
We will transform this page from a data entry form into a "Target Dossier."
The Core Shift: "The Rolodex" → "The Cockpit"
• Old Way: Name at top. Contact info in the middle. Contract details buried at the bottom.
• Nodal Way: Contract Risk at the top. Communication Channels on the side. Intelligence in the center.
Here is the blueprint for the Nodal Point Entity Page.

--------------------------------------------------------------------------------
1. The Layout Architecture (The "3-Pane Console")
We will ditch the generic sidebar/main content split. We will use a Assymetrical Grid that mimics a high-end trading terminal or engineering schematic.
Pane A: The Identity & Risk HUD (Top Full Width)
• Visual: A glass header, but instead of just a name, it’s a Status Board.
• Left: Name + Title + Company Logo (Use the Favicon fetcher we discussed).
• Right (The Innovation): The "Contract Exposure Gauge".
    ◦ Do not list "Contract End Date: 12/12/2026."
    ◦ Visual: A horizontal progress bar named "Position Maturity."
    ◦ Logic: If the contract expires in < 6 months, the bar turns Orange. If < 3 months, Red. If > 12 months, International Klein Blue.
    ◦ Why: You instantly know if this is a "Hot Lead" or a "Nurture" without reading a date.
Pane B: The "Comms Array" (Left Column, Slim)
• Concept: This replaces the bulky "Contact Information" grid.
• Visual: A vertical stack of actionable buttons.
    ◦ Mobile: +1 (407)... (Click to Bridge Call).
    ◦ Email: jack@... (Click to open Compose Overlay).
    ◦ LinkedIn: Simple icon.
• Nodal Touch: When you hover over the phone number, it doesn't just highlight. A tooltip appears: "Local Time: 10:42 AM - Good time to call."
Pane C: The "Asset Map" & "Intelligence" (Center/Right)
• Service Address: Do not write "123 Main St." Show a Map Snippet (Dark Mode Mapbox or Google Maps styling) with a pin. It visualizes the physical asset.
• Account Short Description: Rename this to "Forensic Notes."
    ◦ Instead of a text box, make it look like a code terminal or a log file.
    ◦ Example: > Client concerned about 4CP spikes. Mentioned expansion in Q3.

--------------------------------------------------------------------------------
2. The Code Implementation (Next.js / Tailwind)
Drop this into app/crm-platform/contacts/[id]/page.tsx. This replaces the layout in Source 1335 with the "Nodal Dark" aesthetic.
import { Mail, Phone, MapPin, Clock, AlertTriangle, Building2 } from 'lucide-react';

export default function ContactDossier() {
  // Mock Data - In production, this comes from your Firestore hook
  const entity = {
    name: "Jack Haynes",
    role: "Assistant Controller",
    company: "Thomas Printworks",
    status: "Risk Detected", // Derived from contract logic
    contractEnd: "2025-08-15",
    daysRemaining: 142,
    currentSupplier: "TXU Energy",
    rate: "0.084",
    phone: "+1 (407) 843-1492",
    email: "j.haynes@thomasprint.com",
    address: "Rowlett, Texas",
    notes: "Client has high load factor issues. Susceptible to 4CP."
  };

  return (
    <div className="p-8 h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans selection:bg-[#002FA7]">
      
      {/* 1. THE IDENTITY HUD (Top Bar) */}
      <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-6 flex justify-between items-center relative overflow-hidden">
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/20 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="flex items-center gap-6 z-10">
          <div className="h-20 w-20 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-bold border border-white/10">
            {/* Logic: If company logo exists, show image. Else show Initials */}
            TP
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white">{entity.name}</h1>
            <div className="flex items-center gap-2 text-zinc-400 mt-1">
              <Building2 className="w-4 h-4" />
              <span className="font-medium">{entity.role} at {entity.company}</span>
            </div>
          </div>
        </div>

        {/* The Contract Exposure Gauge */}
        <div className="text-right z-10">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">Position Maturity</div>
          <div className="text-3xl font-bold font-mono">{entity.daysRemaining} <span className="text-sm text-zinc-500 font-sans">Days</span></div>
          <div className="w-48 h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
            {/* Dynamic Width & Color based on risk */}
            <div className="h-full bg-yellow-500 w-[60%]" /> 
          </div>
          <div className="text-xs text-yellow-500 mt-1 font-medium flex items-center justify-end gap-1">
            <AlertTriangle className="w-3 h-3" /> Renew by August
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-full">
        
        {/* 2. THE COMMS ARRAY (Sidebar) */}
        <div className="col-span-3 space-y-4">
          {/* Action Card */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-6">
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-6">Uplinks</h3>
            
            <button className="w-full group flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-[#002FA7] rounded-xl transition-all mb-3 border border-white/5 hover:border-[#002FA7]">
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                <span className="font-mono text-sm">{entity.phone}</span>
              </div>
              <span className="opacity-0 group-hover:opacity-100 text-xs font-bold uppercase">Call</span>
            </button>

            <button className="w-full group flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-700 rounded-xl transition-all border border-white/5">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                <span className="text-sm truncate max-w-[140px]">{entity.email}</span>
              </div>
              <span className="opacity-0 group-hover:opacity-100 text-xs font-bold uppercase">Email</span>
            </button>
          </div>

          {/* Quick Stats */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-6">
             <div className="mb-4">
                <div className="text-zinc-500 text-xs uppercase mb-1">Current Supplier</div>
                <div className="text-xl font-bold text-white">{entity.currentSupplier}</div>
             </div>
             <div>
                <div className="text-zinc-500 text-xs uppercase mb-1">Strike Price</div>
                <div className="text-xl font-bold text-[#002FA7] font-mono">{entity.rate} <span className="text-sm text-zinc-500">/ kWh</span></div>
             </div>
          </div>
        </div>

        {/* 3. THE INTELLIGENCE CONSOLE (Main Content) */}
        <div className="col-span-9 space-y-6">
          
          {/* Intelligence Brief */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 min-h-[200px]">
            <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <h3 className="text-sm font-bold text-white">Forensic Intelligence</h3>
            </div>
            <p className="font-mono text-zinc-400 leading-relaxed text-sm">
              <span className="text-[#002FA7] mr-2">root@nodal:~$</span>
              {entity.notes}
            </p>
            {/* You would inject your "Contract Details" table here, but styled as data blocks, not a spreadsheet */}
          </div>

          {/* Asset Location (Service Address) */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 flex items-start gap-6">
             <div className="p-3 bg-zinc-800 rounded-xl text-zinc-400">
               <MapPin className="w-6 h-6" />
             </div>
             <div>
               <h3 className="text-sm font-bold text-white mb-1">Primary Asset Location</h3>
               <p className="text-zinc-400 font-mono">{entity.address}</p>
               <div className="mt-4 flex gap-2">
                 <span className="px-2 py-1 rounded bg-zinc-800 border border-white/5 text-xs text-zinc-500 font-mono">LZ_NORTH</span>
                 <span className="px-2 py-1 rounded bg-zinc-800 border border-white/5 text-xs text-zinc-500 font-mono">Oncor Service Territory</span>
               </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
Key Improvements over "Power Choosers" Design
1. Eliminated the "Scroll": In the old design [Source 1335], you had to scroll to find the contract info. In this design, the "Position Maturity" (Contract End) is in the header. It is impossible to miss.
2. No "Fields", Only "Data": We removed the labels "Email:", "Mobile:", "State:". We know an email looks like an email. This reduces visual noise by 50%.
3. The "Strike Price": We display the current rate ($0.084) prominently. This is the number you need to beat. It is the "Score to Beat."
Action for your AI Agent
Tell the agent: "Build the Contact Detail page using a Bento Box Grid layout. Use the Nodal Dark theme. Place the 'Contract End Date' in the header as a visual progress bar, not a text field."