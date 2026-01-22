i have a gemini api that can view uploaded files and i want to incorporate this with the bill-debugger.html page.. look at the cloudbuild.yaml file and the phone.js  you'll see the gemini at work and i need you to use the end points in server.js to incorporate this api ket in the page

1. Update the API Handler (The Brain)
File: app/api/analyze-bill/route.ts (or wherever your Gemini logic lives)
We need to update the system instruction to specifically hunt for the Entity Name. We must teach Gemini to distinguish between the Provider (TXU) and the Customer (Big Logistics).
Copy and paste this updated prompt structure:
// Define the schema we want Gemini to return
const schema = {
  type: "OBJECT",
  properties: {
    provider_name: { type: "STRING", description: "The utility company issuing the bill (e.g., TXU, Reliant, MP2)." },
    customer_name: { type: "STRING", description: "The business or entity name receiving the bill. Usually labeled 'Customer Name' or 'Account Name'. Ignore personal names if a business name is present." },
    billing_period: { type: "STRING", description: "The date range of service (e.g., '10/16/2025 - 11/14/2025')." },
    total_usage_kwh: { type: "STRING", description: "Total energy usage in kWh." },
    billed_demand_kw: { type: "STRING", description: "The specific Billed Demand or Peak Demand in kW. Look for 'Billed kW', 'Peak Demand', or 'Demand'. If multiple exist, prefer 'Billed'." },
  },
  required: ["provider_name", "customer_name", "billing_period", "total_usage_kwh", "billed_demand_kw"],
};

// The System Instruction
const prompt = `
  You are a forensic energy auditor. Analyze this Texas commercial electricity invoice.
  
  EXTRACT THE FOLLOWING SIGNAL DATA:
  1. **Provider**: Who sent the bill? (Top left logo usually).
  2. **Customer Identity**: Who is paying? Look for "Customer Name" (e.g., BIG LOGISTICS, LLC). Do not confuse this with the service address.
  3. **The Snapshot**: Usage (kWh) and Demand (kW). 
     - For Demand: This is critical. Look for "Billed kW" or "Actual kW". If both exist, grab "Billed kW" (e.g., 125). 
     - Warning: Do not grab "Distribution System Charge" quantities unless they match the demand. 
  
  Return raw JSON only. No markdown.
`;
2. Update the Frontend (The Reveal)
File: components/CleanRoom.tsx
We are updating the Success State. Instead of a generic "Analysis Complete," we make it personal. We use the extracted customer_name to headline the card.
Replace your step === 'success' block with this:
{step === 'success' && extractedData && (
  <motion.div 
    initial={{ scale: 0.9, opacity: 0 }} 
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.5, type: "spring" }}
    className="w-full max-w-lg mx-auto"
  >
    
    {/* The Headline: Identification Confirmed */}
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#002FA7]/10 mb-4 ring-1 ring-[#002FA7]/20">
         <Check className="w-6 h-6 text-[#002FA7]" /> 
      </div>
      <h3 className="text-2xl font-bold tracking-tight text-black">
        Signal Detected for <span className="text-[#002FA7]">{extractedData.customer_name}</span>.
      </h3>
      <p className="text-zinc-500 text-sm mt-2 font-medium">
        Forensic snapshot of your {extractedData.provider_name} invoice.
      </p>
    </div>

    {/* The Data Card: The "Biopsy" */}
    <div className="bg-zinc-50/50 backdrop-blur-sm rounded-2xl border border-zinc-200 overflow-hidden relative group hover:border-[#002FA7]/30 transition-colors duration-500">
      
      {/* Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.03]" />

      <div className="p-6 space-y-5 relative z-10">
        {/* Row 1: Period */}
        <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Billing Period</span>
          <span className="text-sm font-medium text-zinc-700">{extractedData.billing_period}</span>
        </div>

        {/* Row 2: Load Profile */}
        <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
          <div className="flex flex-col text-left">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Consumption</span>
            <span className="text-[10px] text-zinc-400 font-medium">Volume</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-zinc-900">
            {extractedData.total_usage_kwh} <span className="text-sm font-normal text-zinc-500">kWh</span>
          </span>
        </div>

        {/* Row 3: The Risk Factor (Demand) */}
        <div className="flex justify-between items-center">
          <div className="flex flex-col text-left">
            <span className="text-xs font-mono uppercase tracking-widest text-[#002FA7]">Peak Demand</span>
            <span className="text-[10px] text-zinc-400 font-medium">Volatility Driver</span>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold tracking-tight text-[#002FA7]">
              {extractedData.billed_demand_kw} <span className="text-sm font-normal text-[#002FA7]/70">kW</span>
            </span>
          </div>
        </div>
      </div>
      
      {/* Bottom Action Bar */}
      <div className="bg-white p-4 border-t border-zinc-100 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          This usage profile reveals <br/> potential 4CP exposure.
        </span>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#002FA7] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#002FA7]"></span>
        </span>
