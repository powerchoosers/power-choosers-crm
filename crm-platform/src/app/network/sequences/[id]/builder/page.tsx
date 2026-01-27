'use client'

import { useState, useCallback, useMemo, useRef } from 'react';
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
  useReactFlow,
  ReactFlowProvider,
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
  GitBranch,
  Target
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useContacts } from '@/hooks/useContacts';
import { toast } from 'sonner';

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
  return (
    <ReactFlowProvider>
      <ProtocolArchitectInner />
    </ReactFlowProvider>
  );
}

function ProtocolArchitectInner() {
  const { id } = useParams();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  
  // Phase 4: AI & Preview
  const { data: contactsData } = useContacts();
  const [testContactId, setTestContactId] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const testContact = useMemo(() => 
    contactsData?.contacts?.find(c => c.id === testContactId),
    [contactsData, testContactId]
  );

  const insertVariable = (variable: string) => {
    if (!textareaRef.current || !selectedNode) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = selectedNode.data.body as string || '';
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    updateNodeData(selectedNode.id, { body: before + `{{${variable}}}` + after });
    
    // Reset focus and cursor position after React update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = start + variable.length + 4;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const optimizeWithGemini = async () => {
    if (!selectedNode?.data.body) {
      toast.error("Add some draft text first");
      return;
    }

    setIsOptimizing(true);
    try {
      const response = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: selectedNode.data.body,
          type: selectedNode.data.type,
          context: 'sequence_step',
          contact: testContact ? {
            name: `${testContact.firstName} ${testContact.lastName}`,
            company: testContact.metadata?.general?.company,
            load_zone: testContact.metadata?.energy?.loadZone,
          } : null
        })
      });

      if (!response.ok) throw new Error('Failed to optimize');
      
      const data = await response.json();
      updateNodeData(selectedNode.id, { body: data.optimized });
      toast.success("Protocol optimized by Gemini");
    } catch (error) {
      console.error(error);
      toast.error("Optimization failed");
    } finally {
      setIsOptimizing(false);
    }
  };

  const previewBody = useMemo(() => {
    let body = selectedNode?.data.body as string || '';
    if (!testContact) return body;

    return body
      .replace(/{{first_name}}/g, testContact.firstName || 'Friend')
      .replace(/{{last_name}}/g, testContact.lastName || '')
      .replace(/{{company_name}}/g, testContact.metadata?.general?.company || 'your company')
      .replace(/{{load_zone}}/g, testContact.metadata?.energy?.loadZone || 'LZ_NORTH')
      .replace(/{{scarcity_risk}}/g, 'HIGH'); // Mocked for now
  }, [selectedNode?.data.body, testContact]);

  // Phase 2: Two-Way Binding
  const updateNodeData = useCallback((nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, ...newData },
          };
        }
        return node;
      })
    );
    // Update selected node state if it's the one being edited
    if (selectedNode?.id === nodeId) {
      setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, ...newData } } : null);
    }
  }, [selectedNode, setNodes]);

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

  // Phase 1: DnD Mechanics
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = crypto.randomUUID();
      const newNode: Node = {
        id: newNodeId,
        type: 'default',
        position,
        data: { 
          label: type === 'split' ? 'Logic: Branch' : `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
          type: type,
          subject: '',
          body: '',
          delay: '1',
          signalType: 'VIEW',
          templateId: '',
          condition: 'opened' // Default for split
        },
        style: { 
          background: type === 'split' ? 'rgba(0, 47, 167, 0.2)' : 'rgba(24, 24, 27, 0.8)', 
          color: 'white', 
          border: type === 'split' ? '1px solid #002FA7' : '1px solid rgba(255, 255, 255, 0.1)', 
          borderRadius: '12px',
          backdropFilter: 'blur(8px)',
          padding: '12px 20px',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          boxShadow: type === 'split' ? '0 0 15px rgba(0, 47, 167, 0.3)' : 'none'
        } 
      };

      setNodes((nds) => nds.concat(newNode));

      // Auto-connect to selected node
      if (selectedNode) {
        const newEdge: Edge = {
          id: `e-${selectedNode.id}-${newNodeId}`,
          source: selectedNode.id,
          target: newNodeId,
          animated: true,
          style: { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 }
        };
        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [screenToFlowPosition, setNodes, selectedNode, setEdges]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Link href="/network/sequences">
            <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl border border-white/5 hover:bg-white/5 text-zinc-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tighter text-zinc-100">Protocol_Architect</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Status: Designing // Sequence ID: {id?.toString().slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" className="bg-white/5 border border-white/5 text-white font-mono text-[10px] uppercase tracking-wider hover:bg-white/10 h-9 px-4 rounded-xl">
            <Save className="w-3.5 h-3.5 mr-2" /> Save_Draft
          </Button>
          <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-mono text-[10px] uppercase tracking-widest font-bold h-9 px-5 rounded-xl shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]">
            Deploy_Protocol
          </Button>
        </div>
      </div>

      {/* Main Builder Container */}
      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        
        <div className="flex-1 flex overflow-hidden relative">
          {/* 1. THE ARMORY (Left Sidebar) */}
          <div className="w-20 border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col items-center pt-6 pb-8 gap-6 z-10 relative">
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
            
            <div className="flex-none">
              <div className="w-10 h-10 rounded-xl bg-[#002FA7]/10 border border-white/20 flex items-center justify-center shadow-[0_0_20px_rgba(0,47,167,0.3)]">
                <Target className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="flex flex-col gap-5">
              <ToolButton icon={Mail} label="Email" color="text-zinc-300" type="email" />
              <ToolButton icon={Phone} label="Voice" color="text-zinc-300" type="call" />
              <ToolButton icon={Linkedin} label="Signal" color="text-[#0077b5]" type="linkedin" />
              <ToolButton icon={GitBranch} label="Split" color="text-[#002FA7]" type="split" />
              <ToolButton icon={MapPin} label="Recon" color="text-emerald-500" type="recon" />
              <ToolButton icon={Clock} label="Delay" color="text-zinc-400" type="delay" />
              <div className="w-8 h-px bg-white/10 my-1" />
              <ToolButton icon={Zap} label="Trigger" color="text-amber-500" type="trigger" />
            </div>
          </div>

          {/* 2. THE REACTOR (Canvas) */}
          <div 
            className="flex-1 relative h-full bg-zinc-950/50"
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              className="bg-transparent"
              colorMode="dark"
            >
              <Background color="#18181b" gap={24} size={1} variant="dots" />
              <Controls className="bg-zinc-900/80 border border-white/10 text-white backdrop-blur-md rounded-xl overflow-hidden shadow-2xl !bottom-4 !left-4" />
              
              <Panel position="top-right" className="m-4">
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 p-4 rounded-2xl flex flex-col gap-3 min-w-[180px] shadow-2xl">
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
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* 3. THE CALIBRATION (Right Panel - Contextual) */}
          <div className={cn(
            "w-96 border-l border-white/5 bg-zinc-900/40 backdrop-blur-2xl transition-all duration-500 ease-in-out relative flex flex-col z-20",
            selectedNode ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 absolute right-0"
          )}>
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
            
            <Tabs defaultValue="calibration" className="flex-1 flex flex-col">
              <div className="p-8 pb-0">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                    <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Node_Calibration</h3>
                    <span className="text-lg font-semibold tracking-tighter text-white mt-1">
                      {selectedNode?.data.label as string}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-zinc-800/50 border border-white/5 hover:border-white/20 text-zinc-400 hover:text-white transition-all">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <TabsList className="bg-black/40 border border-white/5 p-1 rounded-xl w-full mb-8">
                  <TabsTrigger value="calibration" className="flex-1 rounded-lg text-[10px] uppercase tracking-widest font-mono data-[state=active]:bg-white/10 data-[state=active]:text-white">Calibration</TabsTrigger>
                  <TabsTrigger value="preview" className="flex-1 rounded-lg text-[10px] uppercase tracking-widest font-mono data-[state=active]:bg-white/10 data-[state=active]:text-white">Test_Protocol</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="calibration" className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-0 pr-6 np-scroll min-h-0">
                <div className="space-y-8 pb-32">
                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Protocol Label</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm font-mono focus:border-[#002FA7] outline-none transition-all"
                      value={selectedNode?.data.label as string || ''}
                      onChange={(e) => updateNodeData(selectedNode!.id, { label: e.target.value })}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Protocol Type</label>
                    <div className="p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center gap-4 group hover:border-white/10 transition-all">
                      <div className="p-2 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/20">
                        {selectedNode?.data.type === 'email' && <Mail className="w-5 h-5 text-zinc-300" />}
                        {selectedNode?.data.type === 'call' && <Phone className="w-5 h-5 text-zinc-300" />}
                        {selectedNode?.data.type === 'linkedin' && <Linkedin className="w-5 h-5 text-[#0077b5]" />}
                        {selectedNode?.data.type === 'split' && <GitBranch className="w-5 h-5 text-[#002FA7]" />}
                        {selectedNode?.data.type === 'recon' && <MapPin className="w-5 h-5 text-emerald-500" />}
                        {selectedNode?.data.type === 'trigger' && <Zap className="w-5 h-5 text-amber-500" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium uppercase">{selectedNode?.data.type as string}</span>
                        <span className="text-[10px] text-zinc-500">Vector Logic</span>
                      </div>
                    </div>
                  </div>

                  {selectedNode?.data.type === 'split' && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Branching_Condition</label>
                      <Select 
                        value={selectedNode?.data.condition as string || 'opened'} 
                        onValueChange={(val) => updateNodeData(selectedNode!.id, { condition: val })}
                      >
                        <SelectTrigger className="w-full bg-black/40 border-white/5 rounded-xl h-12 font-mono text-sm focus:ring-0 focus:border-[#002FA7]">
                          <SelectValue placeholder="Select Condition" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10">
                          <SelectItem value="opened">IF: Email Opened</SelectItem>
                          <SelectItem value="clicked">IF: Link Clicked</SelectItem>
                          <SelectItem value="replied">IF: Replied</SelectItem>
                          <SelectItem value="risk_high">IF: Scarcity Risk &gt; 50%</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl mt-4">
                        <p className="text-[10px] font-mono text-emerald-500/80 uppercase tracking-widest leading-relaxed">
                          Note: Split nodes create two output vectors. One for 'True' (Condition Met) and one for 'False'.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedNode?.data.type === 'linkedin' && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Signal_Type</label>
                      <Select 
                        value={selectedNode?.data.signalType as string || 'VIEW'} 
                        onValueChange={(val) => updateNodeData(selectedNode!.id, { signalType: val })}
                      >
                        <SelectTrigger className="w-full bg-black/40 border-white/5 rounded-xl h-12 font-mono text-sm focus:ring-0 focus:border-[#002FA7]">
                          <SelectValue placeholder="Select Signal Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10">
                          <SelectItem value="VIEW">VIEW (Passive Recon)</SelectItem>
                          <SelectItem value="INTERACT">INTERACT (Like/Comment)</SelectItem>
                          <SelectItem value="CONNECT">CONNECT (Request)</SelectItem>
                          <SelectItem value="MESSAGE">MESSAGE (Direct Inmail)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {selectedNode?.data.type === 'call' && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Script_Template</label>
                      <Select 
                        value={selectedNode?.data.templateId as string || ''} 
                        onValueChange={(val) => updateNodeData(selectedNode!.id, { templateId: val })}
                      >
                        <SelectTrigger className="w-full bg-black/40 border-white/5 rounded-xl h-12 font-mono text-sm focus:ring-0 focus:border-[#002FA7]">
                          <SelectValue placeholder="Select Template" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10">
                          <SelectItem value="gatekeeper">Gatekeeper Bypass</SelectItem>
                          <SelectItem value="cfo_direct">CFO Direct</SelectItem>
                          <SelectItem value="follow_up">Follow-up / Voicemail</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {selectedNode?.data.type === 'email' && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Subject_Matrix</label>
                      <input 
                        type="text" 
                        className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm font-mono focus:border-[#002FA7] outline-none transition-all"
                        placeholder="Subject Line"
                        value={selectedNode?.data.subject as string || ''}
                        onChange={(e) => updateNodeData(selectedNode!.id, { subject: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <Clock className="w-3 h-3" /> Latency_Delay
                    </label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        className="bg-black/40 border border-white/5 rounded-xl p-3 w-20 text-center font-mono text-sm focus:border-[#002FA7] outline-none transition-all" 
                        value={selectedNode?.data.delay as string || '1'}
                        onChange={(e) => updateNodeData(selectedNode!.id, { delay: e.target.value })}
                      />
                      <span className="text-xs text-zinc-400 font-mono">Days after previous node</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Payload_Matrix</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#002FA7] animate-pulse">Ready</span>
                      </div>
                    </label>
                    <div className="relative group rounded-2xl border border-white/5 bg-black/40 overflow-hidden focus-within:border-[#002FA7] transition-all">
                      {/* Editor Toolbar */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-1">
                          <Select onValueChange={insertVariable}>
                            <SelectTrigger className="h-7 bg-zinc-800/50 border-white/5 px-2 text-[9px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all focus:ring-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#002FA7]">+</span>
                                <span>Variable</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10">
                              <SelectItem value="first_name">First Name</SelectItem>
                              <SelectItem value="last_name">Last Name</SelectItem>
                              <SelectItem value="company_name">Company Name</SelectItem>
                              <SelectItem value="load_zone">Load Zone</SelectItem>
                              <SelectItem value="scarcity_risk">Scarcity Risk</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button 
                          onClick={optimizeWithGemini}
                          disabled={isOptimizing}
                          variant="ghost"
                          className="h-7 bg-[#002FA7]/10 border border-[#002FA7]/20 text-[#002FA7] px-2 text-[9px] font-mono uppercase tracking-widest hover:bg-[#002FA7]/20 transition-all disabled:opacity-50"
                        >
                          {isOptimizing ? <Clock className="w-3 h-3 animate-spin mr-1.5" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
                          Optimize_AI
                        </Button>
                      </div>

                      <textarea 
                        ref={textareaRef}
                        className="w-full h-48 bg-transparent p-4 text-sm text-zinc-300 font-mono resize-none outline-none placeholder:text-zinc-700"
                        placeholder="Hi {{first_name}}, I noticed your 4CP exposure in the LZ_NORTH node..."
                        value={selectedNode?.data.body as string || ''}
                        onChange={(e) => updateNodeData(selectedNode!.id, { body: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-0 pr-6 np-scroll min-h-0">
                <div className="space-y-8 pb-32">
                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Select_Test_Node</label>
                    <Select value={testContactId} onValueChange={setTestContactId}>
                      <SelectTrigger className="w-full bg-black/40 border-white/5 rounded-xl h-12 font-mono text-sm focus:ring-0 focus:border-[#002FA7]">
                        <SelectValue placeholder="Choose a contact..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10">
                        {contactsData?.contacts?.map(contact => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.firstName} {contact.lastName} ({contact.metadata?.general?.company})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Protocol_Preview</label>
                    <div className="bg-zinc-950/80 border border-white/5 rounded-2xl p-6 min-h-[300px] relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                      
                      {selectedNode?.data.type === 'email' && (
                        <div className="mb-4 pb-4 border-b border-white/5">
                          <span className="text-[10px] text-zinc-500 font-mono block mb-1">Subject:</span>
                          <span className="text-sm text-zinc-100 font-mono">
                            {selectedNode?.data.subject as string || '(No Subject)'}
                          </span>
                        </div>
                      )}

                      <div className="text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                        {previewBody || '(No content to preview)'}
                      </div>

                      {!testContact && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-8 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <Target className="w-8 h-8 text-zinc-700" />
                            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Select a node to simulate payload injection</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-[#002FA7]/10 border border-[#002FA7]/20 rounded-xl flex items-start gap-3">
                    <Zap className="w-4 h-4 text-[#002FA7] mt-0.5" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest font-bold">Forensic Note</span>
                      <span className="text-[10px] text-zinc-400 font-mono leading-relaxed uppercase">
                        Payload is dynamically rendered using real contact vectors from the Nodal Point database.
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-auto p-8 pt-6 border-t border-white/5">
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">
                <span>System_Ready</span>
                <span>v2.0.4-Alpha</span>
              </div>
            </div>
          </div>
        </div>

        {/* Standardized Sync_Block Footer */}
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block 01-0{nodes.length}</span>
              <div className="h-1 w-1 rounded-full bg-zinc-800" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{nodes.length}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              Operational_Link
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="text-[10px] font-mono text-zinc-600">v2.0.4-NP</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Component for Sidebar Tools
function ToolButton({ icon: Icon, label, color, type }: { icon: any, label: string, color: string, type: string }) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div 
      className="group flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(event) => onDragStart(event, type)}
    >
      <div className={cn(
        "w-12 h-12 rounded-2xl bg-zinc-900/50 border border-white/5 flex items-center justify-center transition-all duration-300",
        "group-hover:border-[#002FA7]/50 group-hover:bg-zinc-800/80 group-hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]",
        color
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-[9px] font-mono text-zinc-500 group-hover:text-zinc-300 uppercase tracking-widest transition-colors">{label}</span>
    </div>
  );
}
