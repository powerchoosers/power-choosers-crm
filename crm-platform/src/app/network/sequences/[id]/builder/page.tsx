'use client'

import { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Mail, 
  Phone, 
  Linkedin, 
  MapPin, 
  Zap, 
  Play, 
  Save, 
  ChevronLeft,
  Sparkles,
  Settings2,
  Trash2,
  Copy,
  Clock,
  Target
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Mock Data for Visualization
const initialNodes: Node[] = [
  { 
    id: '1', 
    position: { x: 250, y: 50 }, 
    data: { label: 'Start: List Upload' }, 
    type: 'input', 
    style: { 
      background: '#002FA7', 
      color: 'white', 
      border: 'none', 
      borderRadius: '12px',
      padding: '12px 20px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'var(--font-mono)',
      boxShadow: '0 0 20px rgba(0, 47, 167, 0.4)'
    } 
  },
  { 
    id: '2', 
    position: { x: 250, y: 150 }, 
    data: { label: 'LinkedIn: View Profile' }, 
    style: { 
      background: 'rgba(24, 24, 27, 0.8)', 
      color: 'white', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      padding: '12px 20px',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)'
    } 
  },
  { 
    id: '3', 
    position: { x: 250, y: 250 }, 
    data: { label: 'Email: 4CP Value Prop' }, 
    style: { 
      background: 'rgba(24, 24, 27, 0.8)', 
      color: 'white', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      padding: '12px 20px',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)'
    } 
  },
  { 
    id: '4', 
    position: { x: 100, y: 400 }, 
    data: { label: 'Call: Follow-up' }, 
    style: { 
      background: 'rgba(24, 24, 27, 0.8)', 
      color: 'white', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      padding: '12px 20px',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)'
    } 
  },
  { 
    id: '5', 
    position: { x: 400, y: 400 }, 
    data: { label: 'Task: Drop-in Packet' }, 
    style: { 
      background: 'rgba(24, 24, 27, 0.8)', 
      color: 'white', 
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      padding: '12px 20px',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)'
    } 
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 } },
  { id: 'e3-4', source: '3', target: '4', label: 'Opened', labelStyle: { fill: '#10b981', fontSize: '10px', fontWeight: 'bold' }, style: { stroke: '#10b981', strokeWidth: 2 } },
  { id: 'e3-5', source: '3', target: '5', label: 'No Reply', labelStyle: { fill: '#ef4444', fontSize: '10px', fontWeight: 'bold' }, style: { stroke: '#ef4444', strokeWidth: 2 } },
];

export default function ProtocolArchitect() {
  const { id } = useParams();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-950 text-white overflow-hidden animate-in fade-in duration-700">
      
      {/* 1. THE ARMORY (Left Sidebar) */}
      <div className="w-20 border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col items-center py-6 gap-6 z-10 relative">
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        
        <Link href="/network/sequences">
          <div className="w-10 h-10 rounded-xl bg-zinc-800/50 border border-white/10 flex items-center justify-center hover:bg-zinc-700 transition-all mb-4 group">
            <ChevronLeft className="w-5 h-5 text-zinc-400 group-hover:text-white" />
          </div>
        </Link>

        <div className="mb-4">
          <div className="w-10 h-10 rounded-full bg-[#002FA7] flex items-center justify-center shadow-[0_0_20px_rgba(0,47,167,0.6)] animate-pulse">
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
        </div>
        
        <div className="flex flex-col gap-5">
          <ToolButton icon={Mail} label="Email" color="text-zinc-300" />
          <ToolButton icon={Phone} label="Voice" color="text-zinc-300" />
          <ToolButton icon={Linkedin} label="Signal" color="text-[#0077b5]" />
          <ToolButton icon={MapPin} label="Recon" color="text-emerald-500" />
          <div className="w-8 h-px bg-white/10 my-1" />
          <ToolButton icon={Zap} label="Trigger" color="text-amber-500" />
        </div>
      </div>

      {/* 2. THE REACTOR (Canvas) */}
      <div className="flex-1 relative h-full">
        {/* Header Overlay */}
        <div className="absolute top-8 left-8 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#002FA7]/10 rounded-lg border border-[#002FA7]/20">
              <Target className="w-5 h-5 text-[#002FA7]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tighter text-zinc-100">Protocol_Architect</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Status: Designing // Sequence ID: {id?.toString().slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute top-8 right-8 z-10 flex gap-3">
           <button className="bg-white/5 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider hover:bg-white/10 transition-all flex items-center gap-2">
             <Save className="w-3.5 h-3.5" /> Save_Draft
           </button>
           <button className="bg-white text-zinc-950 px-5 py-2 rounded-xl font-mono text-[10px] uppercase tracking-widest font-bold hover:bg-zinc-200 transition-all shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]">
             Deploy_Protocol
           </button>
        </div>

        {/* The Graph Engine */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          className="bg-zinc-950"
          colorMode="dark"
        >
          <Background color="#18181b" gap={24} size={1} variant="dots" />
          <Controls className="bg-zinc-900/80 border border-white/10 text-white backdrop-blur-md rounded-xl overflow-hidden shadow-2xl" />
          <Panel position="bottom-right" className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 p-4 rounded-2xl flex flex-col gap-3 min-w-[200px] shadow-2xl">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest px-1">
              <div className="flex items-center gap-2">
                <Settings2 className="w-3 h-3" /> Canvas_Metrics
              </div>
              <div className="text-[9px] text-[#002FA7]">v2.0.4</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/40 border border-white/5 rounded-lg p-2.5 flex flex-col">
                <span className="text-[9px] text-zinc-600 uppercase tracking-tighter">Nodes</span>
                <span className="text-sm font-mono tabular-nums text-zinc-100">{nodes.length}</span>
              </div>
              <div className="bg-black/40 border border-white/5 rounded-lg p-2.5 flex flex-col">
                <span className="text-[9px] text-zinc-600 uppercase tracking-tighter">Vectors</span>
                <span className="text-sm font-mono tabular-nums text-zinc-100">{edges.length}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              <span>Sync_Block 01-0{nodes.length}</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                Total_Nodes: {nodes.length}
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* 3. THE CALIBRATION (Right Panel - Contextual) */}
      <div className={cn(
        "w-96 border-l border-white/5 bg-zinc-900/40 backdrop-blur-2xl p-8 transition-all duration-500 ease-in-out relative flex flex-col",
        selectedNode ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 absolute right-0"
      )}>
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        
        <div className="flex items-center justify-between mb-10">
          <div className="flex flex-col">
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Node_Calibration</h3>
            <span className="text-lg font-semibold tracking-tighter text-white mt-1">
              {selectedNode?.data.label as string}
            </span>
          </div>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg bg-zinc-800/50 border border-white/5 hover:border-white/20 text-zinc-400 hover:text-white transition-all">
              <Copy className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="space-y-8 flex-1 overflow-auto pr-2 np-scroll">
          <div className="space-y-3">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Protocol Type</label>
            <div className="p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center gap-4 group hover:border-white/10 transition-all">
              <div className="p-2 rounded-lg bg-[#0077b5]/10 border border-[#0077b5]/20">
                <Linkedin className="w-5 h-5 text-[#0077b5]" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">LinkedIn Connection</span>
                <span className="text-[10px] text-zinc-500">Signal Vector</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3 h-3" /> Latency_Delay
            </label>
            <div className="flex items-center gap-3">
              <input 
                type="number" 
                className="bg-black/40 border border-white/5 rounded-xl p-3 w-20 text-center font-mono text-sm focus:border-[#002FA7] outline-none transition-all" 
                defaultValue="2" 
              />
              <span className="text-xs text-zinc-400 font-mono">Days after previous node</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center justify-between">
              <span>Payload_Matrix</span>
              <span className="text-[9px] text-[#002FA7] animate-pulse">Ready</span>
            </label>
            <div className="relative group">
              <textarea 
                className="w-full h-48 bg-black/40 border border-white/5 rounded-2xl p-4 text-sm text-zinc-300 font-mono resize-none focus:border-[#002FA7] outline-none transition-all placeholder:text-zinc-700"
                placeholder="Hi {{first_name}}, I noticed your 4CP exposure in the LZ_NORTH node..."
              />
              <div className="absolute bottom-4 right-4">
                <button className="bg-[#002FA7] text-white px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-widest flex items-center gap-2 hover:bg-[#002FA7]/80 transition-all shadow-[0_0_20px_rgba(0,47,167,0.3)]">
                  <Sparkles className="w-3 h-3" /> Optimize_AI
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">
            <span>System_Ready</span>
            <span>v2.0.4-Alpha</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Component for Sidebar Tools
function ToolButton({ icon: Icon, label, color }: { icon: any, label: string, color: string }) {
  return (
    <div className="group flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing">
      <div className={cn(
        "w-12 h-12 rounded-2xl bg-zinc-900/50 border border-white/5 flex items-center justify-center transition-all duration-300",
        "group-hover:border-white/20 group-hover:bg-zinc-800/80 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]",
        color
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-[9px] font-mono text-zinc-500 group-hover:text-zinc-300 uppercase tracking-widest transition-colors">{label}</span>
    </div>
  );
}
