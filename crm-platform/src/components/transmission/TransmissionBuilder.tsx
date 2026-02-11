'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import { 
  Zap, 
  Layers, 
  Code2, 
  Eye, 
  Save, 
  ChevronRight, 
  GripVertical,
  Type,
  Table as TableIcon,
  MousePointer2,
  Variable,
  Trash2,
  RefreshCw,
  Search,
  Check,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { generateStaticHtml, substituteVariables, contactToVariableMap } from '@/lib/transmission'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useContacts, useContact } from '@/hooks/useContacts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Block {
  id: string
  type: 'TEXT_MODULE' | 'TELEMETRY_GRID' | 'TACTICAL_BUTTON' | 'VARIABLE_CHIP' | 'IMAGE_BLOCK'
  content: any
}

export default function TransmissionBuilder({ assetId }: { assetId?: string }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [activeBlock, setActiveBlock] = useState<string | null>(null)
  const [splitPosition, setSplitPosition] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [isForensicMode, setIsForensicMode] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [assetName, setAssetName] = useState('New Asset')
  const [assetType, setAssetType] = useState<'market_signal' | 'invoice_req' | 'educational'>('market_signal')
  const [previewContactId, setPreviewContactId] = useState<string | null>(null)
  const [generatingBlockId, setGeneratingBlockId] = useState<string | null>(null)
  const router = useRouter()

  const { data: contactsData } = useContacts()
  const contacts = useMemo(() => contactsData?.pages?.flatMap((p: { contacts: any[] }) => p.contacts) ?? [], [contactsData])
  const { data: previewContact } = useContact(previewContactId ?? '')
  const previewHtml = useMemo(() => {
    if (!previewContactId || !previewContact) return null
    const html = generateStaticHtml(blocks)
    const data = contactToVariableMap(previewContact)
    return substituteVariables(html, data)
  }, [blocks, previewContactId, previewContact])

  useEffect(() => {
    if (assetId && assetId !== 'new') {
      fetchAsset()
    }
  }, [assetId])

  const fetchAsset = async () => {
    const { data, error } = await supabase
      .from('transmission_assets')
      .select('*')
      .eq('id', assetId)
      .single()
    
    if (data && !error) {
      setAssetName(data.name)
      setAssetType(data.type)
      setBlocks(data.content_json?.blocks || [])
    }
  }

  const saveAsset = async () => {
    setIsSaving(true)
    const compiled_html = generateStaticHtml(blocks)
    const variables = blocks
      .filter(b => b.type === 'VARIABLE_CHIP')
      .map(b => b.content.replace(/{{|}}/g, ''))

    const payload = {
      name: assetName,
      type: assetType,
      content_json: { blocks },
      compiled_html,
      variables
    }

    try {
      if (assetId && assetId !== 'new') {
        const { error } = await supabase
          .from('transmission_assets')
          .update(payload)
          .eq('id', assetId)
        if (error) throw error
        toast.success('Asset updated in Foundry')
      } else {
        const { data, error } = await supabase
          .from('transmission_assets')
          .insert([{ ...payload, user_id: (await supabase.auth.getUser()).data.user?.id }])
          .select()
          .single()
        if (error) throw error
        toast.success('Asset forged in Foundry')
        router.push(`/network/transmission/${data.id}`)
      }
    } catch (err: any) {
      toast.error(`Forge failure: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const blockLibrary = [
    { type: 'TEXT_MODULE', label: 'Narrative_Text', icon: Type },
    { type: 'TELEMETRY_GRID', label: 'Data_Grid', icon: TableIcon },
    { type: 'TACTICAL_BUTTON', label: 'Action_Vector', icon: MousePointer2 },
    { type: 'VARIABLE_CHIP', label: 'Data_Injection', icon: Variable },
    { type: 'IMAGE_BLOCK', label: 'Image', icon: ImageIcon },
  ]

  const addBlock = (type: Block['type']) => {
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === 'TEXT_MODULE' ? 'Enter narrative payload...' : 
               type === 'TACTICAL_BUTTON' ? '[ INITIATE_PROTOCOL ]' : 
               type === 'TELEMETRY_GRID' ? { headers: ['ITEM', 'VALUE'], rows: [['Metric', '0.00']] } : 
               type === 'IMAGE_BLOCK' ? { url: '', description: '', caption: '' } :
               '{{variable}}'
    }
    setBlocks([...blocks, newBlock])
    setActiveBlock(newBlock.id)
  }

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id))
    if (activeBlock === id) setActiveBlock(null)
  }

  const updateBlockContent = (id: string, content: any) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b))
  }

  const generateWithAi = async (blockId: string, blockType: 'TEXT_MODULE' | 'TACTICAL_BUTTON', currentContent: string) => {
    setGeneratingBlockId(blockId)
    try {
      const prompt = blockType === 'TACTICAL_BUTTON'
        ? 'Rewrite as a single tactical CTA label for an intelligence brief.'
        : 'Rewrite this for a Nodal Point intelligence brief. Keep it forensic and precise.'
      const res = await fetch('/api/transmission/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: currentContent,
          blockType: blockType === 'TACTICAL_BUTTON' ? 'button' : 'narrative',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || data?.details || 'AI generation failed')
        return
      }
      if (typeof data?.text === 'string' && data.text.trim()) {
        updateBlockContent(blockId, data.text.trim())
        toast.success('Copy updated')
      }
    } catch (err: any) {
      toast.error(err?.message || 'AI generation failed')
    } finally {
      setGeneratingBlockId(null)
    }
  }

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === blocks.length - 1) return
    const next = [...blocks]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setBlocks(next)
  }

  // Handle resizing
  useEffect(() => {
    if (!isResizing) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const newPos = (e.clientX / window.innerWidth) * 100
      setSplitPosition(Math.min(Math.max(newPos, 20), 80))
    }
    
    const handleMouseUp = () => setIsResizing(false)
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 overflow-hidden rounded-2xl border border-white/5 shadow-2xl">
      {/* Top Controls */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 nodal-recessed bg-black/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] bg-zinc-900 border border-white/5 flex items-center justify-center">
              <Zap size={14} className="text-[#002FA7]" />
            </div>
            <input 
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-sm font-bold tracking-tighter text-white p-0 w-48"
              placeholder="ASSET_NAME"
            />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <select 
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as any)}
            className="bg-transparent border-none focus:ring-0 font-mono text-[10px] uppercase tracking-widest text-zinc-500 cursor-pointer"
          >
            <option value="market_signal">Market_Signal</option>
            <option value="invoice_req">Invoice_Req</option>
            <option value="educational">Educational</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5 mr-2">
             <button 
               onClick={() => setIsForensicMode(true)}
               className={cn(
                 "px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                 isForensicMode ? "bg-[#002FA7] text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
               )}
             >
               Forensic_HTML
             </button>
             <button 
               onClick={() => setIsForensicMode(false)}
               className={cn(
                 "px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                 !isForensicMode ? "bg-[#002FA7] text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
               )}
             >
               Stealth_Text
             </button>
          </div>
          <Button variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white hover:bg-white/5 font-mono text-xs uppercase">
            <RefreshCw size={14} /> Optimize
          </Button>
          <Button 
            onClick={saveAsset}
            disabled={isSaving}
            className="h-8 gap-2 bg-[#002FA7] hover:bg-[#002FA7]/80 text-white font-mono text-xs uppercase rounded-md px-4"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} 
            {assetId && assetId !== 'new' ? 'Update_Asset' : 'Deploy_Asset'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: The Forge */}
        <div 
          className="flex flex-col border-r border-white/5 bg-zinc-950 overflow-hidden"
          style={{ width: `${splitPosition}%` }}
        >
          {/* Block Library */}
          <div className="p-4 border-b border-white/5 nodal-recessed flex gap-2 overflow-x-auto no-scrollbar">
            {blockLibrary.map((item) => (
              <button
                key={item.type}
                onClick={() => addBlock(item.type as Block['type'])}
                className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/5 rounded-xl hover:border-[#002FA7]/50 hover:bg-[#002FA7]/5 transition-all group shrink-0"
              >
                <item.icon size={14} className="text-zinc-500 group-hover:text-[#002FA7]" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 group-hover:text-white">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Builder Canvas */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 np-scroll bg-black/20">
            {blocks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
                <Layers size={48} className="opacity-10" />
                <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-30">Canvas_Empty // Assemble_Modules</p>
              </div>
            ) : (
              <AnimatePresence>
                {blocks.map((block) => (
                  <motion.div
                    key={block.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setActiveBlock(block.id)}
                    className={cn(
                      "relative group p-4 rounded-xl border transition-all cursor-pointer",
                      activeBlock === block.id 
                        ? "bg-[#002FA7]/5 border-[#002FA7]/30 shadow-[0_0_20px_rgba(0,47,167,0.1)]" 
                        : "bg-black/40 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-black/40 border-white/5 text-[10px] font-mono text-zinc-500">
                          {block.type}
                        </Badge>
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tighter">{block.id.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                          disabled={blocks.findIndex(b => b.id === block.id) === 0}
                          className="p-1 hover:text-[#002FA7] disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                          disabled={blocks.findIndex(b => b.id === block.id) === blocks.length - 1}
                          className="p-1 hover:text-[#002FA7] disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                          className="p-1 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {block.type === 'TEXT_MODULE' && (
                      <div className="space-y-2">
                        <textarea
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 text-sm font-sans text-zinc-300 min-h-[100px] resize-none p-0"
                        />
                        <button
                          type="button"
                          onClick={() => generateWithAi(block.id, 'TEXT_MODULE', block.content)}
                          disabled={generatingBlockId === block.id}
                          className="text-[10px] font-mono uppercase tracking-widest text-[#002FA7] hover:underline disabled:opacity-50"
                        >
                          {generatingBlockId === block.id ? 'Generating…' : 'Generate with AI'}
                        </button>
                      </div>
                    )}

                    {block.type === 'TACTICAL_BUTTON' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-md px-3 py-2 text-xs font-mono text-[#002FA7] uppercase tracking-widest focus:ring-1 focus:ring-[#002FA7]/50 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => generateWithAi(block.id, 'TACTICAL_BUTTON', block.content)}
                          disabled={generatingBlockId === block.id}
                          className="text-[10px] font-mono uppercase tracking-widest text-[#002FA7] hover:underline disabled:opacity-50"
                        >
                          {generatingBlockId === block.id ? 'Generating…' : 'Generate with AI'}
                        </button>
                      </div>
                    )}

                    {block.type === 'VARIABLE_CHIP' && (
                      <div className="flex items-center gap-2 bg-[#002FA7]/10 border border-[#002FA7]/20 rounded-full px-3 py-1 w-fit">
                        <Variable size={12} className="text-[#002FA7]" />
                        <input
                          type="text"
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-[#002FA7] p-0 w-32"
                        />
                      </div>
                    )}

                    {block.type === 'TELEMETRY_GRID' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                           {block.content.headers.map((h: string, i: number) => (
                             <input 
                               key={i}
                               value={h}
                               onChange={(e) => {
                                 const newHeaders = [...block.content.headers]
                                 newHeaders[i] = e.target.value
                                 updateBlockContent(block.id, { ...block.content, headers: newHeaders })
                               }}
                               className="bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase"
                             />
                           ))}
                        </div>
                        {block.content.rows.map((row: string[], ri: number) => (
                          <div key={ri} className="grid grid-cols-2 gap-2">
                            {row.map((cell: string, ci: number) => (
                              <input 
                                key={ci}
                                value={cell}
                                onChange={(e) => {
                                  const newRows = [...block.content.rows]
                                  newRows[ri][ci] = e.target.value
                                  updateBlockContent(block.id, { ...block.content, rows: newRows })
                                }}
                                className="bg-black/20 border border-white/5 rounded px-2 py-1 text-xs text-zinc-300"
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {block.type === 'IMAGE_BLOCK' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id={`img-${block.id}`}
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = async () => {
                                const base64 = (reader.result as string)?.split(',')[1]
                                if (!base64) return
                                try {
                                  const res = await fetch('/api/upload/signature-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ image: base64, type: 'template-image' }),
                                  })
                                  const data = await res.json()
                                  if (data?.url) updateBlockContent(block.id, { ...block.content, url: data.url })
                                  else toast.error(data?.error || 'Upload failed')
                                } catch (err: any) {
                                  toast.error(err?.message || 'Upload failed')
                                }
                                e.target.value = ''
                              }
                              reader.readAsDataURL(file)
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById(`img-${block.id}`)?.click()}
                            className="h-8 px-3 rounded border border-white/10 bg-black/40 text-[10px] font-mono uppercase text-zinc-300 hover:bg-black/60"
                          >
                            Upload image
                          </button>
                          {block.content?.url && (
                            <a href={block.content.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#002FA7] truncate max-w-[120px]">URL</a>
                          )}
                        </div>
                        {block.content?.url && (
                          <div className="rounded-lg border border-white/5 overflow-hidden bg-black/20 max-h-24">
                            <img src={block.content.url} alt="" className="w-full h-full object-contain max-h-24" />
                          </div>
                        )}
                        <div className="grid gap-2">
                          <input
                            type="text"
                            placeholder="Description (alt text)"
                            value={block.content?.description ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, description: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1.5 text-[10px] font-mono text-zinc-400 placeholder:text-zinc-600"
                          />
                          <input
                            type="text"
                            placeholder="Caption (visible below image)"
                            value={block.content?.caption ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, caption: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1.5 text-[10px] font-mono text-zinc-400 placeholder:text-zinc-600"
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-white/5 hover:bg-[#002FA7]/40 cursor-col-resize z-10 flex items-center justify-center group transition-colors"
          style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
          onMouseDown={() => setIsResizing(true)}
        >
           <div className="h-8 w-px bg-white/20 group-hover:bg-[#002FA7] transition-colors" />
        </div>

        {/* Right Panel: The Simulation */}
        <div 
          className="bg-white overflow-hidden flex flex-col"
          style={{ width: `${100 - splitPosition}%` }}
        >
          <div className="h-10 border-b border-zinc-200 bg-zinc-50 flex items-center px-4 justify-between gap-4">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Live_Simulation</span>
            <Select value={previewContactId ?? '__none__'} onValueChange={(v) => setPreviewContactId(v === '__none__' ? null : v)}>
              <SelectTrigger className="h-7 max-w-[220px] text-[10px] font-mono uppercase border-zinc-200 bg-white">
                <SelectValue placeholder="Preview with contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[10px] font-mono">None</SelectItem>
                {contacts.map((c: { id: string; firstName?: string; lastName?: string; company?: string }) => (
                  <SelectItem key={c.id} value={c.id} className="text-[10px] font-mono">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown'} ({c.company || '—'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 shrink-0">
              <div className="w-2 h-2 rounded-full bg-zinc-200" />
              <div className="w-2 h-2 rounded-full bg-zinc-200" />
              <div className="w-2 h-2 rounded-full bg-[#002FA7]" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-zinc-100 p-8 flex justify-center np-scroll">
            <div className="w-full max-w-[600px] bg-white shadow-2xl min-h-full flex flex-col">
              {previewHtml ? (
                <div
                  className="p-8 flex-1 transmission-preview"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml, { ALLOWED_TAGS: ['p', 'div', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'img', 'figcaption', 'br'], ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'title'] }) }}
                />
              ) : (
                <>
                  <div className="border-b border-zinc-200 p-6 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-zinc-900 font-bold tracking-[0.2em] uppercase">NODAL_POINT // INTELLIGENCE</span>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-tighter">REF: {new Date().toISOString().split('T')[0].replace(/-/g, '')} // TX_001</span>
                  </div>
                  <div className="p-8 space-y-6 flex-1">
                    {blocks.map((block) => (
                      <div key={block.id}>
                        {block.type === 'TEXT_MODULE' && (
                          <p className="text-zinc-900 leading-relaxed font-sans">{block.content}</p>
                        )}
                        {block.type === 'TACTICAL_BUTTON' && (
                          <div className="pt-4">
                            <button className="bg-[#002FA7] text-white px-6 py-3 font-mono font-bold text-xs uppercase tracking-widest rounded-sm shadow-lg shadow-[#002FA7]/20">
                              {block.content}
                            </button>
                          </div>
                        )}
                        {block.type === 'VARIABLE_CHIP' && (
                          <span className="bg-zinc-100 px-2 py-0.5 rounded text-[10px] font-mono text-[#002FA7] border border-zinc-200">
                            {block.content}
                          </span>
                        )}
                        {block.type === 'TELEMETRY_GRID' && (
                          <div className="bg-[#F4F4F5] rounded-md p-4 border border-zinc-200 overflow-hidden">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-300">
                                  {block.content.headers.map((h: string, i: number) => (
                                    <th key={i} className="text-left py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.content.rows.map((row: string[], ri: number) => (
                                  <tr key={ri}>
                                    {row.map((cell: string, ci: number) => (
                                      <td key={ci} className="py-2 text-xs font-mono text-zinc-900">{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {block.type === 'IMAGE_BLOCK' && block.content?.url && (
                          <figure className="my-4">
                            <img src={block.content.url} alt={block.content?.description ?? ''} className="max-w-full h-auto block rounded border border-zinc-200" />
                            {block.content?.caption && (
                              <figcaption className="text-[10px] font-mono text-zinc-500 mt-2">{block.content.caption}</figcaption>
                            )}
                          </figure>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="p-8 border-t border-zinc-100 bg-zinc-50 mt-auto">
                    <div className="font-sans font-bold text-zinc-900 text-sm">Lewis Patterson</div>
                    <div className="font-sans text-zinc-500 text-xs mb-4">Director of Energy Architecture</div>
                    <div className="flex gap-4 font-mono text-[10px] text-[#002FA7] font-bold uppercase tracking-widest">
                      <span>LINKEDIN</span>
                      <span>NETWORK</span>
                      <span>[ RUN_AUDIT ]</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
