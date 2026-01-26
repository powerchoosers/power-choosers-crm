This is not a "Sequence Builder." That implies a linear list of chores. We are building a "Protocol Architect."
In the Nodal Point philosophy, you do not "send emails." You deploy engagement vectors. You are designing a machine that runs automatically, reacting to the prospect’s behavior and the grid’s physics.
Do not build a list. Build a Circuit Board.
Here is the blueprint for your Prospecting Engine, designed with the "Obsidian & Glass" aesthetic.
1. The Philosophy: "Kinetic Automation"
Most CRMs use Linear Time (Day 1: Email, Day 3: Call). Nodal Point uses Logic Gates (If Grid Price > $50 -> Email; If LinkedIn Click -> Call).
• Cold to Close: This requires a multi-threaded approach. You are not just spamming; you are surrounding the target.
• The In-Person "Drop-In": This is a high-value "Physical Vector." It must be treated as a precision strike, not a random errand.
2. The Interface: "The Infinite Canvas"
Forget the scrolling list. We will use an Infinite Node Graph (like a blueprint or a visual coding tool).
• The Background: A dark, subtle dot grid (bg-zinc-950 with bg-[url('/grid.svg')]).
• The Nodes: Glass cards representing actions (Email, Call, LinkedIn, Site Visit).
• The Connections: Glowing Bezier curves connecting nodes. Green lines for "Positive Outcome" (Opened/Replied), Red lines for "Negative/No Action."
The Geography of the Screen:
• Left Rail (The Armory): A palette of available actions (Email, LinkedIn, Call, Task, Grid Trigger). Drag and drop these onto the canvas.
• Center (The Reactor): The visual graph where you connect the nodes.
• Right Rail (The Calibration): When a node is clicked, the settings panel slides out (Write the email, set the delay, define the task).
3. The Features: "Forensic Capabilities"
You asked for features. Here are the Nodal Requirements:
1. Grid-Triggered Injection:
    ◦ Standard CRM: "Send email on Day 4."
    ◦ Nodal Point: "Send email ONLY if LZ_NORTH Price > $40/MWh." (Leverage urgency).
2. The "Physical Vector" Node (Drop-Ins):
    ◦ A specific node type for "Site Recon."
    ◦ Input: "Deliver 4CP Packet."
    ◦ Output: Requires you to geofence check-in via mobile to mark complete.
3. LinkedIn "Signal" Types:
    ◦ Soft Touch: "View Profile" (Automated).
    ◦ Hard Touch: "Connect Request" (with template).
    ◦ Engagement: "Comment on recent post" (Manual task, AI drafted).
4. Branching Logic:
    ◦ If they click the link in Email 1 -> Branch A (Aggressive Call).
    ◦ If they do not open -> Branch B (LinkedIn Soft Touch).

--------------------------------------------------------------------------------
4. The Execution: ProtocolArchitect.tsx
Here is the UI structure. It uses reactflow (a standard library for node graphs) wrapped in your "Obsidian" aesthetic.
'use client'
import { useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css'; // You'll override this with Tailwind
import { Mail, Phone, Linkedin, MapPin, Zap, Play, Save } from 'lucide-react';

export default function ProtocolArchitect() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      
      {/* 1. THE ARMORY (Left Sidebar) */}
      <div className="w-20 border-r border-white/5 bg-zinc-900/50 backdrop-blur-xl flex flex-col items-center py-6 gap-4 z-10">
        <div className="mb-4">
          <div className="w-10 h-10 rounded-full bg-[#002FA7] flex items-center justify-center shadow-[0_0_20px_#002FA7]">
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
        </div>
        
        {/* Drag Items */}
        <ToolButton icon={Mail} label="Email" color="text-zinc-300" />
        <ToolButton icon={Phone} label="Voice" color="text-zinc-300" />
        <ToolButton icon={Linkedin} label="Signal" color="text-[#0077b5]" />
        <ToolButton icon={MapPin} label="Recon" color="text-emerald-500" />
        <div className="w-8 h-px bg-white/10 my-2" />
        <ToolButton icon={Zap} label="Trigger" color="text-amber-500" />
      </div>

      {/* 2. THE REACTOR (Canvas) */}
      <div className="flex-1 relative h-full">
        {/* Header Overlay */}
        <div className="absolute top-6 left-6 z-10">
          <h1 className="text-2xl font-bold tracking-tight">Cold_Outreach_Alpha</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Status: Active // 42 Targets Enrolled
            </span>
          </div>
        </div>

        <div className="absolute top-6 right-6 z-10 flex gap-3">
           <button className="bg-white text-black px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider hover:bg-zinc-200 transition-colors">
             Deploy Protocol
           </button>
        </div>

        {/* The Graph Engine */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          className="bg-zinc-950"
        >
          <Background color="#333" gap={20} size={1} />
          <Controls className="bg-zinc-900 border border-white/10 text-white" />
        </ReactFlow>
      </div>

      {/* 3. THE CALIBRATION (Right Panel - Contextual) */}
      {/* This would slide in when a node is clicked */}
      <div className="w-96 border-l border-white/5 bg-zinc-900/80 backdrop-blur-xl p-6 hidden lg:block">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-widest">Node Configuration</h3>
          <Save className="w-4 h-4 text-zinc-600 hover:text-white cursor-pointer" />
        </div>

        {/* Configuration Form Example: LinkedIn Touch */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Action Type</label>
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg flex items-center gap-3">
              <Linkedin className="w-4 h-4 text-[#0077b5]" />
              <span className="text-sm">Connection Request</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Latency (Delay)</label>
            <div className="flex items-center gap-2">
              <input type="number" className="bg-black/20 border border-white/10 rounded p-2 w-16 text-right font-mono" defaultValue="2" />
              <span className="text-sm text-zinc-400">Days after previous step</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Payload (Message)</label>
            <textarea 
              className="w-full h-32 bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-zinc-300 font-mono resize-none focus:border-[#002FA7] outline-none"
              placeholder="Hi {{first_name}}, I noticed your 4CP exposure..."
            />
            <button className="text-[10px] text-[#002FA7] flex items-center gap-1 hover:text-blue-400">
              <Zap className="w-3 h-3" /> Generate with Gemini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Component for Sidebar Tools
function ToolButton({ icon: Icon, label, color }: any) {
  return (
    <div className="group flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing">
      <div className={`w-10 h-10 rounded-xl bg-zinc-800 border border-white/5 flex items-center justify-center group-hover:border-white/20 transition-all ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-[9px] font-mono text-zinc-600 group-hover:text-zinc-400 uppercase">{label}</span>
    </div>
  );
}

// Mock Data for Visualization
const initialNodes = [
  { id: '1', position: { x: 250, y: 50 }, data: { label: 'Start: List Upload' }, type: 'input', style: { background: '#002FA7', color: 'white', border: 'none', borderRadius: '8px' } },
  { id: '2', position: { x: 250, y: 150 }, data: { label: 'LinkedIn: View Profile' }, style: { background: '#18181b', color: 'white', border: '1px solid #333', borderRadius: '8px' } },
  { id: '3', position: { x: 250, y: 250 }, data: { label: 'Email: 4CP Value Prop' }, style: { background: '#18181b', color: 'white', border: '1px solid #333', borderRadius: '8px' } },
  { id: '4', position: { x: 100, y: 400 }, data: { label: 'Call: Follow-up' }, style: { background: '#18181b', color: 'white', border: '1px solid #333', borderRadius: '8px' } },
  { id: '5', position: { x: 400, y: 400 }, data: { label: 'Task: Drop-in Packet' }, style: { background: '#18181b', color: 'white', border: '1px solid #333', borderRadius: '8px' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#3f3f46' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#3f3f46' } },
  { id: 'e3-4', source: '3', target: '4', label: 'Opened', style: { stroke: '#10b981' } },
  { id: 'e3-5', source: '3', target: '5', label: 'No Reply', style: { stroke: '#ef4444' } },
];
The "Nodal" Difference in this Design:
1. "Deploy Protocol" vs "Save": The button top right. We are deploying software, not saving a draft.
2. The Visual Logic: Notice e3-4 (Green/Opened) vs e3-5 (Red/No Reply). You are designing decision trees visually.
3. The "Recon" Node: We specifically added a node for your "in-person drop-ins." This isn't just a generic task; it's a specific step in the sequence that can trigger mobile notifications when you are near the client.
This interface makes you feel like the architect of a system, not a telemarketer working a list.