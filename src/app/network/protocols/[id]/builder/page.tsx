'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  BackgroundVariant,
  Handle,
  Position,
  NodeProps,
  useUpdateNodeInternals,
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
  Target,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  CalendarCheck,
  PhoneMissed,
  Bug,
  FileText
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
import { useContacts, type Contact } from '@/hooks/useContacts';
import { toast } from 'sonner';

// Mock Data for Visualization (The "Test Sequence")
const MOCK_NODES: Node[] = [
  { 
    id: '1', 
    position: { x: 250, y: 50 }, 
    data: { label: 'Start: Target Array Initialize', type: 'input' }, 
    type: 'protocolNode', 
  },
  { 
    id: '2', 
    position: { x: 250, y: 150 }, 
    data: { label: 'LinkedIn: View Profile', type: 'linkedin' }, 
    type: 'protocolNode', 
  },
  { 
    id: '3', 
    position: { x: 250, y: 250 }, 
    data: { 
      label: 'Email: 4CP Value Prop', 
      type: 'email',
      outcomes: [
        { id: 'opened', label: 'Opened' },
        { id: 'no_reply', label: 'No Reply' }
      ]
    }, 
    type: 'protocolNode', 
  },
  { 
    id: '4', 
    position: { x: 50, y: 500 }, 
    data: { label: 'Call: Follow-up', type: 'call' }, 
    type: 'protocolNode', 
  },
  { 
    id: '5', 
    position: { x: 450, y: 500 }, 
    data: { label: 'Task: Drop-in Packet', type: 'recon' }, 
    type: 'protocolNode', 
  },
];

const MOCK_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 } },
  { 
    id: 'e3-4', 
    source: '3', 
    sourceHandle: 'opened', 
    target: '4', 
    label: 'Opened', 
    labelStyle: { fill: '#002FA7', fontSize: '10px', fontWeight: 'bold' }, 
    style: { stroke: '#002FA7', strokeWidth: 2 },
    animated: true
  },
  { 
    id: 'e3-5', 
    source: '3', 
    sourceHandle: 'no_reply', 
    target: '5', 
    label: 'No Reply', 
    labelStyle: { fill: '#002FA7', fontSize: '10px', fontWeight: 'bold' }, 
    style: { stroke: '#002FA7', strokeWidth: 2 },
    animated: true
  },
];

const FRESH_NODES: Node[] = [
  { 
    id: '1', 
    position: { x: 400, y: 100 }, 
    data: { label: 'Start: Target Array Initialize', type: 'input' }, 
    type: 'protocolNode', 
  },
];

const FRESH_EDGES: Edge[] = [];

const TEST_PROTOCOL_ID = '123'; // The hardcoded ID for the demo/test sequence

const ProtocolNode = ({ data, id, selected }: NodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const outcomes = data.outcomes as { id: string; label: string }[] || [];
  
  useEffect(() => {
    // Force re-measure whenever data changes (e.g. hover state, vector added)
    // This fixes the "Connects to Center" bug by ensuring handles are registered immediately
    updateNodeInternals(id);
  }, [data, id, updateNodeInternals]);

  const type = data.type as string;
  const isTargeted = data.isTargeted as boolean;
  const activeHandleId = data.activeHandleId as string | null;
  const debugSlotIndex = data.debugSlotIndex as number | undefined;
  
  const getIcon = () => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'linkedin': return <Linkedin className="w-4 h-4" />;
      case 'recon': return <MapPin className="w-4 h-4" />;
      case 'delay': return <Clock className="w-4 h-4" />;
      case 'trigger': return <Zap className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  const isInput = type === 'input';

  return (
    <div className={cn(
      "min-w-[180px] rounded-xl border backdrop-blur-xl transition-all duration-300 relative",
      selected ? "border-[#002FA7] shadow-[0_0_20px_rgba(0,47,167,0.3)]" : "border-white/10 bg-zinc-900/80 hover:border-white/20",
      isTargeted && "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-[1.02]",
      isInput && "bg-[#002FA7] border-none shadow-[0_0_20px_rgba(0,47,167,0.4)]"
    )}>
      {/* Target Highlight Glow */}
      {isTargeted && (
        <div className="absolute -inset-0.5 bg-emerald-500/20 blur-xl rounded-xl -z-10 animate-pulse" />
      )}

      {/* DEBUG: Slot Visualizer */}
      {debugSlotIndex !== undefined && outcomes.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-50 rounded-xl overflow-hidden">
          {outcomes.map((_, i) => (
             <div 
               key={i} 
               className={cn(
                 "absolute top-0 bottom-0 border-r border-red-500/50 bg-red-500/5",
                 i === debugSlotIndex ? "bg-emerald-500/10 border-emerald-500/50" : ""
               )}
               style={{ 
                 left: `${(i / outcomes.length) * 100}%`, 
                 width: `${100 / outcomes.length}%` 
               }}
             >
                <div className="absolute bottom-6 left-1 text-[8px] font-mono text-white bg-black/50 px-1 rounded z-50 pointer-events-none whitespace-nowrap">
                  SLOT_{i} ({outcomes[i].id.slice(0,4)})
                </div>
             </div>
          ))}
        </div>
      )}

      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ top: '-6px' }}
        className={cn(
          "!w-3 !h-3 !border-none transition-transform !absolute", 
          isInput ? "opacity-0" : "!bg-[#002FA7]",
          isTargeted && !activeHandleId && "scale-150 shadow-[0_0_10px_rgba(16,185,129,1)]"
        )} 
      />
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("p-1.5 rounded-lg", isInput ? "bg-white/20" : "bg-[#002FA7]/10")}>
            {getIcon()}
          </div>
          <div className="flex flex-col">
            <span className={cn("text-[10px] font-mono uppercase tracking-widest", isInput ? "text-white/70" : "text-zinc-500")}>
              {isInput ? 'Entry_Point' : (type || 'Vector')}
            </span>
            <span className="text-xs font-semibold tracking-tight text-white leading-tight">
              {data.label as string}
            </span>
          </div>
        </div>
      </div>

      {outcomes.length > 0 && (
        <div className="border-t border-white/5 bg-black/20 p-1 flex flex-row gap-1">
          {outcomes.map((outcome) => {
            const label = outcome.label.toLowerCase();
            const isActive = activeHandleId === outcome.id;
            
            const getOutcomeIcon = () => {
              if (label.includes('opened')) return <ArrowUpRight className={cn("w-2.5 h-2.5", isActive ? "text-emerald-400" : "text-emerald-500/70")} />;
              if (label.includes('clicked')) return <ArrowUpRight className={cn("w-2.5 h-2.5", isActive ? "text-sky-400" : "text-sky-500/70")} />;
              if (label.includes('no answer')) return <PhoneMissed className={cn("w-2.5 h-2.5", isActive ? "text-white" : "text-zinc-500")} />;
              if (label.includes('reply')) return <ArrowUpRight className={cn("w-2.5 h-2.5", isActive ? "text-rose-400" : "text-rose-500/70")} />;
              if (label.includes('positive')) return <CheckCircle2 className={cn("w-2.5 h-2.5", isActive ? "text-emerald-400" : "text-emerald-500")} />;
              if (label.includes('negative')) return <XCircle className={cn("w-2.5 h-2.5", isActive ? "text-rose-400" : "text-rose-500")} />;
              if (label.includes('booked') || label.includes('meeting')) return <CalendarCheck className={cn("w-2.5 h-2.5", isActive ? "text-amber-400" : "text-amber-500")} />;
              return <ArrowUpRight className={cn("w-2.5 h-2.5", isActive ? "text-white" : "text-zinc-500")} />;
            };

            return (
              <div 
                key={outcome.id} 
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center border rounded-lg py-1.5 px-1 group min-w-0 transition-all",
                  isActive ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-zinc-900/50 border-white/5"
                )}
              >
                <div className="mb-0.5">
                  {getOutcomeIcon()}
                </div>
                <span className={cn(
                  "text-[7px] font-mono uppercase tracking-tighter text-center truncate w-full px-0.5",
                  isActive ? "text-emerald-400 font-bold" : "text-zinc-400"
                )}>
                  {outcome.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Source Handles - Positioned at bottom relative to outcomes */}
      {outcomes.length > 0 ? (
        outcomes.map((outcome, index) => {
          const isActive = activeHandleId === outcome.id;
          const leftOffset = ((index + 0.5) / outcomes.length) * 100;
          
          return (
            <Handle 
               key={outcome.id}
               type="source" 
               position={Position.Bottom} 
               id={outcome.id}
               data-handle-id={outcome.id}
               style={{ left: `${leftOffset}%`, bottom: '-6px', zIndex: 50 }}
               className={cn(
                 "!w-3 !h-3 !border-none transition-all !absolute",
                 isActive ? "!bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" : "!bg-[#002FA7]"
               )} 
             />
           );
         })
       ) : (
         <Handle 
           type="source" 
           position={Position.Bottom} 
           style={{ bottom: '-6px' }}
           className={cn(
             "!bg-[#002FA7] !w-3 !h-3 !border-none transition-transform !absolute",
             isTargeted && "scale-150 shadow-[0_0_10px_rgba(16,185,129,1)]"
           )} 
         />
       )}
    </div>
  );
};

const nodeTypes = {
  protocolNode: ProtocolNode,
};

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
  
  // Initialize state based on the ID (Test vs. Fresh)
  const [nodes, setNodes, onNodesChange] = useNodesState(
    id === TEST_PROTOCOL_ID ? MOCK_NODES : FRESH_NODES
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    id === TEST_PROTOCOL_ID ? MOCK_EDGES : FRESH_EDGES
  );
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeHandleId, setActiveHandleId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState({
    hoverNodeId: '',
    activeHandleId: '',
    slotIndex: -1,
    rawX: 0,
    rawY: 0,
    closestNodeId: '',
    minDistance: 0,
    sourceHandle: '',
    fallbackUsed: false,
    newNodeId: '',
    edgeId: '',
    calculatedWidth: 0,
    nodeX: 0,
    outcomesList: [] as string[],
    totalEdges: 0
  });

  // Monitor Edges
  useMemo(() => {
    if (debugMode) {
        setDebugData(d => ({ ...d, totalEdges: edges.length }));
    }
  }, [edges.length, debugMode]);
  
  // Phase 4: AI & Preview
  const { data: contactsData } = useContacts();
  const [testContactId, setTestContactId] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [emailViewMode, setEmailViewMode] = useState<'payload' | 'ai'>('payload');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const testContact = useMemo(() => {
    const allContacts = contactsData?.pages?.flatMap(page => page.contacts) || [];
    return allContacts.find((c: Contact) => c.id === testContactId);
  }, [contactsData, testContactId]);

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
    if (!selectedNode?.data.body && !selectedNode?.data.prompt) {
      toast.error("Add some draft text or a prompt first");
      return;
    }

    setIsOptimizing(true);
    try {
      const response = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: selectedNode.data.body,
          prompt: selectedNode.data.prompt,
          provider: 'openrouter', // Force OpenRouter/ChatGPT-OSS as requested
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
      toast.success("Protocol optimized by Nodal Architect (OSS)");
      setEmailViewMode('payload'); // Switch back to payload view to see result
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

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
    toast.success("Node deleted");
  }, [selectedNode, setNodes, setEdges]);

  const duplicateNode = useCallback((node: Node) => {
    const newNodeId = crypto.randomUUID();
    const newNode: Node = {
      ...node,
      id: newNodeId,
      position: {
        x: node.position.x + 40,
        y: node.position.y + 40,
      },
      selected: false,
    };
    setNodes((nds) => nds.concat(newNode));
    toast.success("Node duplicated");
  }, [setNodes]);

  const updateOutcomeLabel = (nodeId: string, outcomeId: string, newLabel: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const outcomes = (node.data.outcomes as any[]).map(o => 
            o.id === outcomeId ? { ...o, label: newLabel } : o
          );
          return { ...node, data: { ...node.data, outcomes } };
        }
        return node;
      })
    );

    // Update connected edges labels
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.source === nodeId && edge.sourceHandle === outcomeId) {
          return { ...edge, label: newLabel };
        }
        return edge;
      })
    );

    // Update selected node state
    if (selectedNode?.id === nodeId) {
      setSelectedNode((prev) => {
        if (!prev) return null;
        const outcomes = (prev.data.outcomes as any[]).map(o => 
          o.id === outcomeId ? { ...o, label: newLabel } : o
        );
        return { ...prev, data: { ...prev.data, outcomes } };
      });
    }
  };

  const addOutcome = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || (node.data.outcomes as any[]).length >= 3) return;

    const newId = `outcome-${crypto.randomUUID().slice(0, 8)}`;
    const newOutcomes = [...(node.data.outcomes as any[]), { id: newId, label: 'New Outcome' }];
    
    updateNodeData(nodeId, { outcomes: newOutcomes });
  };

  const removeOutcome = (nodeId: string, outcomeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || (node.data.outcomes as any[]).length <= 1) return;

    const newOutcomes = (node.data.outcomes as any[]).filter(o => o.id !== outcomeId);
    updateNodeData(nodeId, { outcomes: newOutcomes });

    // Remove connected edges
    setEdges((eds) => eds.filter(e => !(e.source === nodeId && e.sourceHandle === outcomeId)));
  };

  const onConnect = useCallback(
    (params: Connection) => {
      // Find the source node to check if it's a split node
      const sourceNode = nodes.find(n => n.id === params.source);
      
      // Ensure unique ID for every edge to allow multiple connections
      const edgeId = `e-${params.source}-${params.sourceHandle || 'default'}-${params.target}-${params.targetHandle || 'default'}-${crypto.randomUUID().slice(0, 4)}`;
      
      let edgeParams: any = { 
        ...params,
        id: edgeId
      };

      const hasOutcomes = (sourceNode?.data?.outcomes as any[])?.length > 0;

      // STRICT HANDLE MATCHING: Only apply styling if the sourceHandle exists on the node
      if (hasOutcomes && params.sourceHandle) {
        const outcomes = sourceNode?.data.outcomes as any[];
        const outcome = outcomes?.find((o: any) => o.id === params.sourceHandle);
        
        if (outcome) {
          edgeParams.label = outcome.label;
          edgeParams.labelStyle = { fill: '#002FA7', fontSize: '10px', fontWeight: 'bold' };
          edgeParams.style = { stroke: '#002FA7', strokeWidth: 2 };
          edgeParams.animated = true;
        } else {
            // Fallback: If handle ID is passed but not found in outcomes (rare sync issue), 
            // do NOT default to center. Force React Flow to look for the handle.
            // If React Flow can't find the handle in DOM, it defaults to center.
            // We can't fix DOM missing here, but we can ensure we don't clear the handle ID.
            console.warn(`Handle ${params.sourceHandle} not found in node outcomes`, outcomes);
        }
      } else {
        // Standard edge (grey)
        edgeParams.style = { stroke: 'rgba(63, 63, 70, 0.5)', strokeWidth: 2 };
        edgeParams.animated = true;
      }

      setEdges((eds) => addEdge(edgeParams, eds));
    },
    [setEdges, nodes]
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

    // Visual Feedback: Find closest node during drag
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const MAGNET_THRESHOLD = 250;
    let closestNodeId: string | null = null;
    let minDistance = Infinity;

    nodes.forEach((node) => {
      // Use Center-to-Mouse distance (matching onDrop logic) for accurate targeting
      const centerX = node.position.x + ((node.measured?.width || 200) / 2);
      const centerY = node.position.y + ((node.measured?.height || 100) / 2);
      const dx = centerX - position.x;
      const dy = centerY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        closestNodeId = node.id;
      }
    });

    if (minDistance < MAGNET_THRESHOLD) {
      const closestNode = nodes.find(n => n.id === closestNodeId);
      let handleId: string | null = null;
      let slotIndexCalc: number | null = null;
      let nodeWidth = 0;
      let outcomes: any[] = [];

      if (closestNode && (closestNode.data.outcomes as any[])?.length > 0) {
        outcomes = closestNode.data.outcomes as any[];
        // Use measured width if available for accuracy, else fallback to 200 (approx visual width)
        nodeWidth = closestNode.measured?.width || 200; 
        const relativeX = position.x - closestNode.position.x;
        const slotWidth = nodeWidth / outcomes.length;
        
        // Improved slot calculation with bounds clamping
        const rawIndex = Math.floor(relativeX / slotWidth);
        slotIndexCalc = Math.max(0, Math.min(outcomes.length - 1, rawIndex));
        handleId = outcomes[slotIndexCalc].id;
      }

      if (hoveredNodeId !== closestNodeId || activeHandleId !== handleId) {
        setHoveredNodeId(closestNodeId);
        setActiveHandleId(handleId);
        setNodes((nds) => nds.map(n => ({
          ...n,
          data: { 
            ...n.data, 
            isTargeted: n.id === closestNodeId,
            activeHandleId: n.id === closestNodeId ? handleId : null,
            // Pass debug info to node for visualization
            debugSlotIndex: n.id === closestNodeId && debugMode ? slotIndexCalc : undefined
          }
        })));
        if (debugMode) {
          setDebugData((d) => ({
            ...d,
            hoverNodeId: closestNodeId || '',
            activeHandleId: handleId || '',
            slotIndex: slotIndexCalc ?? -1,
            rawX: position.x,
            rawY: position.y,
            closestNodeId: closestNodeId || '',
            minDistance: Math.round(minDistance),
            calculatedWidth: nodeWidth,
            nodeX: closestNode?.position.x || 0,
            outcomesList: outcomes.map(o => `${o.label}(${o.id.slice(0,4)})`)
          }));
          console.log('dragOver', {
            closestNodeId,
            handleId,
            slotIndex: slotIndexCalc,
            position
          });
        }
      }
    } else if (hoveredNodeId !== null) {
      setHoveredNodeId(null);
      setActiveHandleId(null);
      setNodes((nds) => nds.map(n => ({
        ...n,
        data: { ...n.data, isTargeted: false, activeHandleId: null }
      })));
    }
  }, [screenToFlowPosition, nodes, hoveredNodeId, activeHandleId, setNodes, debugMode]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      
      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      // 1. Determine Drop Position (Raw Mouse)
      const rawPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Capture state-based source before clearing
      let activeSourceHandleId = activeHandleId;
      let activeTargetNodeId = hoveredNodeId;

      // Clear highlight
      setHoveredNodeId(null);
      setActiveHandleId(null);
      setNodes((nds) => nds.map(n => ({ ...n, data: { ...n.data, isTargeted: false, activeHandleId: null } })));

      const newNodeId = crypto.randomUUID();
      const isSplit = type === 'split';
      const isVector = type.startsWith('vector:');
      
      // ... Vector Adding Logic (Keep as is) ...
      if (isVector) {
        const vectorLabel = type.split(':')[1].replace('_', ' ');
        const label = vectorLabel.charAt(0).toUpperCase() + vectorLabel.slice(1);
        const MAGNET_THRESHOLD = 150;
        let closestNode: Node | null = null;
        let minDistance = Infinity;

        nodes.forEach((node) => {
          const dx = node.position.x - rawPosition.x;
          const dy = node.position.y - rawPosition.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < minDistance) {
            minDistance = distance;
            closestNode = node;
          }
        });

        if (closestNode) {
          const outcomeId = `outcome-${crypto.randomUUID().slice(0, 8)}`;
          const currentOutcomes = closestNode.data.outcomes as any[] || [];
          
          if (currentOutcomes.length < 3) {
            updateNodeData(closestNode.id, { 
              outcomes: [...currentOutcomes, { id: outcomeId, label }] 
            });
            toast.success(`Added ${label} vector to ${closestNode.data.label}`);
          } else {
            toast.error("Maximum 3 vectors per node");
          }
        }
        return;
      }

      // 2. Find Closest Node for Auto-Connect
      const MAGNET_THRESHOLD = 250;
      let closestNode: Node | null = null;
      let minDistance = Infinity;

      nodes.forEach((node) => {
        // Distance from mouse to node center (approx)
        const centerX = node.position.x + ((node.measured?.width || 180) / 2);
        const centerY = node.position.y + ((node.measured?.height || 100) / 2);
        const dx = centerX - rawPosition.x;
        const dy = centerY - rawPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          minDistance = distance;
          closestNode = node;
        }
      });

      // 3. Determine Source Handle & Alignment
      let sourceHandle: string | null = null;
      let finalPosition = { x: rawPosition.x - 90, y: rawPosition.y }; // Default: Center on mouse

      const connectNode = activeTargetNodeId ? nodes.find(n => n.id === activeTargetNodeId) : closestNode;
      if (connectNode) {
        const outcomes = connectNode.data.outcomes as any[] || [];
        
        if (outcomes.length > 0) {
            // ALWAYS Calculate based on drop position to ensure 100% accuracy
            // We ignore activeHandleId state to prevent race conditions or stale hovers
            const nodeWidth = connectNode.measured?.width || 200;
            const relativeX = rawPosition.x - connectNode.position.x;
            const slotWidth = nodeWidth / outcomes.length;
            const rawIndex = Math.floor(relativeX / slotWidth);
            const slotIndex = Math.max(0, Math.min(outcomes.length - 1, rawIndex));
            sourceHandle = outcomes[slotIndex].id;
        }
      }

      const newNode: Node = {
        id: newNodeId,
        type: 'protocolNode',
        position: finalPosition,
        data: { 
          label: isSplit ? 'Interaction Split' : `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
          type: type,
          subject: '',
          body: '',
          delay: '1',
          signalType: 'VIEW',
          templateId: '',
          condition: 'opened',
          outcomes: isSplit ? [
            { id: 'opened', label: 'Opened' },
            { id: 'no_reply', label: 'No Reply' }
          ] : []
        },
      };

      setNodes((nds) => nds.concat(newNode));
      if (debugMode) {
        setDebugData((d) => ({ ...d, newNodeId }));
        console.log('drop:newNode', { newNodeId, finalPosition });
      }

      // 5. Create Connection
      if (connectNode) {
        const outcomes = connectNode.data.outcomes as any[] || [];
        
        // Ensure sourceHandle is valid
        let validHandle = outcomes.find(o => o.id === sourceHandle);
        
        // FALLBACK: If outcomes exist but no handle selected, default to the closest slot
        // This prevents "invisible lines" where connection logic runs but fails silently
        if (outcomes.length > 0 && !validHandle) {
             const nodeWidth = connectNode.measured?.width || 200;
             const relativeX = rawPosition.x - connectNode.position.x;
             const slotWidth = nodeWidth / outcomes.length;
             const rawIndex = Math.floor(relativeX / slotWidth);
             const slotIndex = Math.max(0, Math.min(outcomes.length - 1, rawIndex));
             sourceHandle = outcomes[slotIndex].id;
             validHandle = outcomes[slotIndex];
        }

        const canConnect = outcomes.length === 0 || !!validHandle;

        if (canConnect) {
            const newEdge: Edge = {
              id: `e-${connectNode.id}-${sourceHandle || 'default'}-${newNodeId}-${crypto.randomUUID().slice(0, 4)}`,
              source: connectNode.id,
              sourceHandle: sourceHandle || undefined,
              target: newNodeId,
              animated: true,
              label: validHandle ? validHandle.label : undefined,
              labelStyle: validHandle ? { fill: '#ffffff', fontSize: '10px', fontWeight: 'bold' } : undefined,
              style: { 
                stroke: validHandle ? '#002FA7' : '#52525b', // Zinc-600 for default lines for better visibility
                strokeWidth: 2 
              }
            };
            
            // FORCE ADD: Use concat instead of addEdge to bypass any potential filtering
            setEdges((eds) => eds.concat(newEdge));
            toast.success(`Connected to ${validHandle?.label}`);
            
            if (debugMode) {
              setDebugData((d) => ({ ...d, edgeId: newEdge.id, sourceHandle: sourceHandle || '' }));
              console.log('drop:newEdge', newEdge);
            }
        } else {
            console.warn("Aborted connection: Node has outcomes but no valid handle selected.");
        }
      }
    },
    [screenToFlowPosition, setNodes, selectedNode, setEdges, nodes, updateNodeData, activeHandleId, hoveredNodeId, debugMode]
  );

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    if (deletedNodes.find(n => n.id === selectedNode?.id)) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Link href="/network/protocols">
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
                  Status: Designing // Protocol ID: {id?.toString().slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            onClick={() => setDebugMode((v) => !v)}
            className={cn(
              "border border-white/5 font-mono text-[10px] uppercase tracking-wider h-9 px-4 rounded-xl",
              debugMode ? "bg-white/10 text-white" : "bg-white/5 text-white hover:bg-white/10"
            )}
          >
            <Bug className="w-3.5 h-3.5 mr-2" /> {debugMode ? 'Debug_On' : 'Debug_Off'}
          </Button>
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
            
            <div className="flex flex-col gap-5 overflow-y-auto scrollbar-none pb-8">
              <ToolButton icon={Mail} label="Email" color="text-zinc-300" type="email" />
              <ToolButton icon={Phone} label="Voice" color="text-zinc-300" type="call" />
              <ToolButton icon={Linkedin} label="Signal" color="text-[#0077b5]" type="linkedin" />
              <ToolButton icon={MapPin} label="Recon" color="text-emerald-500" type="recon" />
              <ToolButton icon={Clock} label="Delay" color="text-zinc-400" type="delay" />
              <div className="w-8 h-px bg-white/10 my-1" />
              <ToolButton icon={Zap} label="Trigger" color="text-amber-500" type="trigger" />

              {/* Interaction Vectors */}
              <div className="flex flex-col gap-5 mt-4 pt-4 border-t border-white/5">
                <h4 className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.2em] text-center">Vectors</h4>
                <ToolButton 
                  icon={ArrowUpRight} 
                  label="Opened" 
                  type="vector:opened" 
                  color="text-emerald-500/70 group-hover:text-emerald-400"
                />
                <ToolButton 
                  icon={ArrowUpRight} 
                  label="No_Reply" 
                  type="vector:no_reply" 
                  color="text-rose-500/70 group-hover:text-rose-400"
                />
                <ToolButton 
                  icon={ArrowUpRight} 
                  label="Clicked" 
                  type="vector:clicked" 
                  color="text-sky-500/70 group-hover:text-sky-400"
                />
                <ToolButton 
                  icon={CheckCircle2} 
                  label="Positive" 
                  type="vector:positive" 
                  color="text-emerald-500 group-hover:text-emerald-400"
                />
                <ToolButton 
                  icon={XCircle} 
                  label="Negative" 
                  type="vector:negative" 
                  color="text-rose-500 group-hover:text-rose-400"
                />
                <ToolButton 
                  icon={CalendarCheck} 
                  label="Booked" 
                  type="vector:booked" 
                  color="text-amber-500 group-hover:text-amber-400"
                />
                <ToolButton 
                  icon={PhoneMissed} 
                  label="No_Answer" 
                  type="vector:no_answer" 
                  color="text-zinc-500 group-hover:text-zinc-400"
                />
              </div>
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
              onNodesDelete={onNodesDelete}
              nodeTypes={nodeTypes}
              fitView
              className="bg-transparent"
              colorMode="dark"
            >
              <Background color="#18181b" gap={24} size={1} variant={BackgroundVariant.Dots} />
              <Controls className="bg-zinc-900/80 border border-white/10 text-white backdrop-blur-md rounded-xl overflow-hidden shadow-2xl !bottom-4 !left-4" />
              
              <Panel position="top-right" className="m-4">
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 p-4 rounded-2xl flex flex-col gap-3 min-w-[220px] shadow-2xl">
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
                  {debugMode && (
                    <div className="mt-2 bg-black/30 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Debug</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-zinc-400">
                        <div>Hover_Node</div><div className="text-white">{debugData.hoverNodeId || '-'}</div>
                        <div>Active_Handle</div><div className="text-white">{debugData.activeHandleId || '-'}</div>
                        <div>Slot_Index</div><div className="text-white">{debugData.slotIndex}</div>
                        <div>Drop_X</div><div className="text-white">{debugData.rawX}</div>
                        <div>Drop_Y</div><div className="text-white">{debugData.rawY}</div>
                        <div>Closest_Node</div><div className="text-white">{debugData.closestNodeId || '-'}</div>
                        <div>Min_Dist</div><div className="text-white">{debugData.minDistance}</div>
                        <div>Source_Handle</div><div className="text-white">{debugData.sourceHandle || '-'}</div>
                        <div>Fallback</div><div className="text-white">{debugData.fallbackUsed ? 'YES' : 'NO'}</div>
                        <div>New_Node</div><div className="text-white">{debugData.newNodeId || '-'}</div>
                        <div>Edge_ID</div><div className="text-white">{debugData.edgeId || '-'}</div>
                        <div className="col-span-2 border-t border-white/5 my-1" />
                        <div>Node_X</div><div className="text-white">{Math.round(debugData.nodeX)}</div>
                        <div>Calc_Width</div><div className="text-white">{Math.round(debugData.calculatedWidth)}</div>
                        <div>Total_Edges</div><div className="text-white">{debugData.totalEdges}</div>
                        <div className="col-span-2 text-[8px] text-zinc-500 break-all">{JSON.stringify(debugData.outcomesList)}</div>
                      </div>
                    </div>
                  )}
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
            
            <Tabs defaultValue="calibration" className="flex-1 flex flex-col min-h-0 h-full">
              <div className="p-8 pb-4 shrink-0 border-b border-white/5 bg-black/10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                    <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Node_Calibration</h3>
                    <span className="text-lg font-semibold tracking-tighter text-white mt-1">
                      {selectedNode?.data.label as string}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => selectedNode && duplicateNode(selectedNode)}
                      className="h-8 w-8 rounded-lg bg-zinc-800/50 border border-white/5 hover:border-white/20 text-zinc-400 hover:text-white transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => selectedNode && deleteNode(selectedNode.id)}
                      className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <TabsList className="bg-black/40 border border-white/5 p-1 rounded-xl w-full mb-0 shrink-0">
                  <TabsTrigger value="calibration" className="flex-1 rounded-lg text-[10px] uppercase tracking-widest font-mono data-[state=active]:bg-white/10 data-[state=active]:text-white">Calibration</TabsTrigger>
                  <TabsTrigger value="preview" className="flex-1 rounded-lg text-[10px] uppercase tracking-widest font-mono data-[state=active]:bg-white/10 data-[state=active]:text-white">Test_Protocol</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="calibration" className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-6 pr-6 scrollbar-thin min-h-0">
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

                  {((selectedNode?.data.outcomes as any[])?.length > 0) && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Interaction_Branches</label>
                        <span className="text-[9px] font-mono text-[#002FA7] uppercase tracking-tighter">Max: 03 Nodes</span>
                      </div>
                      
                      <div className="space-y-3">
                        {(selectedNode?.data.outcomes as any[] || []).map((outcome, idx) => (
                          <div key={outcome.id} className="group relative">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-black/40 border border-white/5 rounded-xl flex items-center px-3 focus-within:border-[#002FA7] transition-all">
                                <span className="text-[10px] font-mono text-zinc-600 mr-2">{idx + 1}</span>
                                <input 
                                  type="text" 
                                  className="w-full bg-transparent py-3 text-sm font-mono outline-none text-zinc-100"
                                  value={outcome.label}
                                  onChange={(e) => updateOutcomeLabel(selectedNode!.id, outcome.id, e.target.value)}
                                  placeholder="Branch Label"
                                />
                              </div>
                              {(selectedNode?.data.outcomes as any[]).length > 1 && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeOutcome(selectedNode!.id, outcome.id)}
                                  className="h-10 w-10 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}

                        {(selectedNode?.data.outcomes as any[] || []).length < 3 && (
                          <Button 
                            variant="ghost" 
                            onClick={() => addOutcome(selectedNode!.id)}
                            className="w-full h-10 border border-dashed border-white/10 text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all"
                          >
                            + Add_Branch_Vector
                          </Button>
                        )}
                      </div>

                      <div className="space-y-2 mt-4">
                        <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Protocol_Presets</label>
                        <div className="flex flex-wrap gap-2">
                          {['Opened', 'Clicked', 'Positive Call', 'Meeting Booked', 'No Answer', 'Negative Call'].map((preset) => (
                            <button
                              key={preset}
                              onClick={() => {
                                // Find first outcome and update it, or add new
                                const outcomes = selectedNode?.data.outcomes as any[];
                                if (outcomes.length > 0) {
                                  // Update the last added outcome or the one that's empty
                                  const emptyOutcomeIdx = outcomes.findIndex(o => !o.label || o.label === 'Branch Label');
                                  const targetId = emptyOutcomeIdx !== -1 ? outcomes[emptyOutcomeIdx].id : outcomes[outcomes.length - 1].id;
                                  updateOutcomeLabel(selectedNode!.id, targetId, preset);
                                } else {
                                  // Add new outcome with this label
                                  const outcomeId = `outcome-${crypto.randomUUID().slice(0, 8)}`;
                                  updateNodeData(selectedNode!.id, { 
                                    outcomes: [...outcomes, { id: outcomeId, label: preset }] 
                                  });
                                }
                              }}
                              className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[9px] font-mono text-zinc-400 hover:text-white hover:bg-[#002FA7]/20 hover:border-[#002FA7]/30 transition-all"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-[#002FA7]/5 border border-[#002FA7]/10 rounded-xl mt-4">
                        <p className="text-[10px] font-mono text-[#002FA7]/80 uppercase tracking-widest leading-relaxed">
                          Note: Interaction split vectors route targets based on behavioral signals. Connect each handle to a unique downstream node.
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
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        {emailViewMode === 'payload' ? 'Payload_Matrix' : 'AI_Instruction_Prompt'}
                      </label>
                      
                      {selectedNode?.data.type === 'email' && (
                        <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded-lg p-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEmailViewMode('payload')}
                            className={cn("w-6 h-6 rounded-md transition-all", emailViewMode === 'payload' ? "bg-white/10 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEmailViewMode('ai')}
                            className={cn("w-6 h-6 rounded-md transition-all", emailViewMode === 'ai' ? "bg-white/10 text-emerald-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {emailViewMode === 'payload' ? (
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
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[#002FA7] animate-pulse">Ready</span>
                          </div>
                        </div>

                        <textarea 
                          ref={textareaRef}
                          className="w-full h-48 bg-transparent p-4 text-sm text-zinc-300 font-mono resize-none outline-none placeholder:text-zinc-700"
                          placeholder="Hi {{first_name}}, I noticed your 4CP exposure in the LZ_NORTH node..."
                          value={selectedNode?.data.body as string || ''}
                          onChange={(e) => updateNodeData(selectedNode!.id, { body: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div className="relative group rounded-2xl border border-white/5 bg-black/40 overflow-hidden focus-within:border-emerald-500/50 transition-all">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-emerald-500/5">
                           <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">Nodal_Architect // OSS_Model</span>
                           <Button 
                              onClick={optimizeWithGemini}
                              disabled={isOptimizing}
                              variant="ghost"
                              className="h-7 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 text-[9px] font-mono uppercase tracking-widest hover:bg-emerald-500/20 hover:text-emerald-300 transition-all disabled:opacity-50"
                            >
                              {isOptimizing ? <Clock className="w-3 h-3 animate-spin mr-1.5" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
                              Optimize_AI
                            </Button>
                        </div>
                        <textarea 
                          className="w-full h-48 bg-transparent p-4 text-sm text-emerald-400/90 font-mono resize-none outline-none placeholder:text-emerald-500/20"
                          placeholder="Instructions for AI: e.g., 'Write a 4CP curtailment warning for a manufacturing plant in ERCOT...'"
                          value={selectedNode?.data.prompt as string || ''}
                          onChange={(e) => updateNodeData(selectedNode!.id, { prompt: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-6 pr-6 scrollbar-thin min-h-0">
                <div className="space-y-8 pb-32">
                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Select_Test_Node</label>
                    <Select value={testContactId} onValueChange={setTestContactId}>
                      <SelectTrigger className="w-full bg-black/40 border-white/5 rounded-xl h-12 font-mono text-sm focus:ring-0 focus:border-[#002FA7]">
                        <SelectValue placeholder="Choose a contact..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10">
                        {contactsData?.pages?.flatMap(page => page.contacts).map((contact: Contact) => (
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
