This is the "Targeting Console."
In a standard CRM, a "List" page is just a directory of folders. It is boring administrative work. In Nodal Point, lists are "Strategic Arrays." They are the collections of targets you are monitoring for 4CP events, renewal windows, or scarcity risks.
To match the Obsidian & Glass aesthetic of your People Page [Source 552], we will not use a table for the overview. We will use a Grid of "Data Cassettes."
The Design Philosophy: "The Armory"
1. The Switch (Selector): Do not use standard tabs. Use a "Toggle Switch" that looks like a hardware control. It physically slides between "People" (Human Intelligence) and "Accounts" (Asset Intelligence).
2. The Object (Cassettes): Each list is represented as a glass card. It shows the List Name, the "Node Count" (number of items), and a "Last Sync" timestamp.
3. The Interaction:
    ◦ View: Clicking the card opens the list (your future table view).
    ◦ Edit/Delete: These are dangerous actions. They are hidden behind a "Settings" cog or a "More" menu on the card to prevent accidental misfires.
The Implementation: ListOverview.tsx
This code acts as the wrapper. It maintains the "Nodal" theme (Zinc-900, Monospace accents, Klein Blue highlights) while solving your requirement to separate Account vs. People lists.
'use client'
import { useState } from 'react';
import { 
  Users, 
  Building2, 
  Plus, 
  MoreVertical, 
  Search, 
  FolderOpen, 
  Trash2, 
  Edit3,
  ListFilter
} from 'lucide-react';

interface ListEntity {
  id: string;
  name: string;
  count: number;
  type: 'people' | 'account';
  lastModified: string;
}

export default function ListOverviewPage() {
  // STATE: Active Mode (People vs Accounts)
  const [activeMode, setActiveMode] = useState<'people' | 'account'>('people');
  
  // MOCK DATA - Replace with your Supabase query
  const lists: ListEntity[] = [
    { id: '1', name: 'Q3 Renewals - North Zone', count: 142, type: 'account', lastModified: '2h ago' },
    { id: '2', name: '4CP Alert Group A', count: 56, type: 'account', lastModified: '1d ago' },
    { id: '3', name: 'Manufacturing CFOs', count: 89, type: 'people', lastModified: '4h ago' },
    { id: '4', name: 'Cold Outreach Sequence 1', count: 210, type: 'people', lastModified: 'Just now' },
  ];

  // Filter based on toggle
  const filteredLists = lists.filter(l => l.type === activeMode);

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white p-8 overflow-hidden">
      
      {/* 1. THE HEADER (Aligned with Source 552) */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Segmentation</h1>
          <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">
            Targeting Arrays // {activeMode === 'people' ? 'HUMAN_INTEL' : 'ASSET_INTEL'}
          </p>
        </div>

        {/* 2. THE ACTION ARRAY */}
        <div className="flex items-center gap-4">
          
          {/* The Mode Switcher (Hardware Style) */}
          <div className="bg-zinc-900 border border-white/10 rounded-lg p-1 flex items-center">
            <button 
              onClick={() => setActiveMode('people')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all ${
                activeMode === 'people' 
                ? 'bg-zinc-800 text-white shadow-lg' 
                : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Users className="w-3 h-3" /> People
            </button>
            <button 
              onClick={() => setActiveMode('account')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all ${
                activeMode === 'account' 
                ? 'bg-zinc-800 text-white shadow-lg' 
                : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Building2 className="w-3 h-3" /> Accounts
            </button>
          </div>

          {/* Create Button (White High-Contrast) */}
          <button className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]">
            <Plus className="w-4 h-4" />
            <span>Create Array</span>
          </button>
        </div>
      </div>

      {/* 3. THE DATA CASSETTES (Grid View) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-20">
        
        {/* Search / Filter Input (Optional, kept minimal) */}
        <div className="col-span-full mb-2">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input 
              type="text" 
              placeholder={`Search ${activeMode} lists...`}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-[#002FA7]/50 transition-colors"
            />
          </div>
        </div>

        {/* List Cards */}
        {filteredLists.map((list) => (
          <div 
            key={list.id}
            className="group relative bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:bg-zinc-900/60 hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between h-40"
          >
            {/* Card Header */}
            <div className="flex justify-between items-start">
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-[#002FA7]">
                {list.type === 'people' ? <ListFilter className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}
              </div>
              
              {/* Action Menu (Hidden until Hover) */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Card Body */}
            <div>
              <h3 className="text-lg font-medium text-zinc-100 mb-1 group-hover:text-white truncate">
                {list.name}
              </h3>
              <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${list.count > 0 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                  Nodes: {list.count}
                </span>
                <span>Updated: {list.lastModified}</span>
              </div>
            </div>

            {/* Selection Visual (Active Corner) */}
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-tl from-[#002FA7]/20 to-transparent rounded-br-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}

        {/* Empty State (Add New Placeholder) */}
        <button className="border border-dashed border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 hover:bg-white/[0.02] transition-all h-40">
          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-mono uppercase tracking-widest">Initialize New Array</span>
        </button>

      </div>
    </div>
  );
}
Why This Works:
1. The "Switch" matches Source 552: It keeps the dark, monochromatic layout but adds a clear functional toggle for the list types.
2. No Jarring Transition: The background, fonts (Inter for headers, Geist Mono or standard Monospace for data), and colors (Zinc-950, Zinc-500) are identical to your People Page.
3. Future Proofing: When you click a card, you can easily route to /lists/people/[id] or /lists/accounts/[id], which will render your standard table view. This overview page acts as the "Lobby" for those lists.