'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import {
  Zap,
  Layers,
  Save,
  Type,
  Table as TableIcon,
  MousePointer2,
  Variable,
  Trash2,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  Image as ImageIcon,
  User,
  Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { generateStaticHtml, substituteVariables, contactToVariableMap } from '@/lib/foundry'
import { CONTACT_VARIABLES, ACCOUNT_VARIABLES, extractVariableKeysFromText } from '@/lib/foundry-variables'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { useContacts, useContact } from '@/hooks/useContacts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type ValueColor = 'yellow' | 'green' | 'red' | 'black'

const VALUE_COLORS: ValueColor[] = ['black', 'yellow', 'green', 'red']
const VALUE_COLOR_CLASSES: Record<ValueColor, string> = {
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  black: 'bg-zinc-900',
}

interface TextModuleContent {
  text: string;
  useAi: boolean;
  aiPrompt: string;
  bullets?: string[];
}

interface Block {
  id: string
  type: 'TEXT_MODULE' | 'TELEMETRY_GRID' | 'TACTICAL_BUTTON' | 'VARIABLE_CHIP' | 'IMAGE_BLOCK' | 'LIABILITY_GAUGE' | 'MARKET_BREADCRUMB'
  content: any
}

export default function FoundryBuilder({ assetId }: { assetId?: string }) {
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
  const [variablePopoverOpen, setVariablePopoverOpen] = useState<string | null>(null)
  const textModuleTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, profile } = useAuth()

  const insertVariableIntoText = (blockId: string, key: string, currentText: string) => {
    const placeholder = `{{${key}}} `
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return
    const ta = textModuleTextareaRef.current
    const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
    if (ta && blockId === activeBlock) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newText = currentText.slice(0, start) + placeholder + currentText.slice(end)
      updateBlockContent(blockId, { ...contentObj, text: newText })
      setVariablePopoverOpen(null)
      setTimeout(() => {
        if (ta) {
          ta.focus()
          const pos = start + placeholder.length
          ta.setSelectionRange(pos, pos)
        }
      }, 0)
    } else {
      updateBlockContent(blockId, { ...contentObj, text: (currentText || '') + placeholder })
      setVariablePopoverOpen(null)
    }
  }

  const { data: contactsData } = useContacts()
  const contacts = useMemo(() => contactsData?.pages?.flatMap((p: { contacts: any[] }) => p.contacts) ?? [], [contactsData])
  const { data: previewContact } = useContact(previewContactId ?? '')
  const previewHtml = useMemo(() => {
    if (!previewContactId || !previewContact) return null
    const html = generateStaticHtml(blocks, { skipFooter: true })
    const data = contactToVariableMap(previewContact)
    return substituteVariables(html, data)
  }, [blocks, previewContactId, previewContact])

  // Auto-generate TEXT_MODULE blocks with AI when contact is selected
  useEffect(() => {
    if (!previewContactId || !previewContact || generatingBlockId) return

    const blocksToGenerate = blocks.filter(block => {
      if (block.type !== 'TEXT_MODULE') return false
      const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
      return contentObj.useAi === true && contentObj.aiPrompt?.trim() && !contentObj.text?.trim()
    })

    // Only generate for blocks that need it, and only once per contact selection
    blocksToGenerate.forEach(block => {
      const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
      generateWithAi(block.id, 'TEXT_MODULE', contentObj)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewContactId, previewContact, generatingBlockId])

  const applyAssetData = (data: { name?: string; type?: string; content_json?: { blocks?: any[] } }) => {
    setAssetName(data.name || 'Untitled Asset')
    setAssetType((data.type as 'market_signal' | 'invoice_req' | 'educational') || 'market_signal')
    const rawBlocks = data.content_json?.blocks || []
    if (!Array.isArray(rawBlocks)) {
      setBlocks([])
      return
    }
    const blocks = rawBlocks.map((block: any) => {
      if (!block || typeof block !== 'object') return block
      if (block.type === 'TEXT_MODULE' && typeof block.content === 'string') {
        return {
          ...block,
          content: { text: block.content || '', useAi: false, aiPrompt: '' }
        }
      }
      return block
    })
    setBlocks(blocks)
  }

  const fetchAsset = useCallback(async (id: string) => {
    try {
      // Use cached asset from sessionStorage if we just created it (avoids failed refetch due to RLS/replication)
      const cacheKey = `foundry_asset_${id}`
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) {
          try {
            const data = JSON.parse(cached)
            sessionStorage.removeItem(cacheKey)
            applyAssetData(data)
            return
          } catch {
            sessionStorage.removeItem(cacheKey)
          }
        }
      }

      // Use API so we bypass RLS (backend uses supabaseAdmin)
      const idToken = await (user as any)?.getIdToken?.().catch(() => null)
      const res = await fetch(`/api/foundry/assets?id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Error fetching asset:', json?.error || res.status, json?.details)
        toast.error(json?.error || 'Failed to load asset')
        return
      }
      const data = json?.asset
      if (!data) {
        toast.error('Asset not found')
        return
      }
      applyAssetData(data)
    } catch (err) {
      console.error('Unexpected error in fetchAsset:', err)
      toast.error('Failed to load asset')
    }
  }, [user])

  useEffect(() => {
    if (assetId && assetId !== 'new') {
      fetchAsset(assetId).catch(err => {
        console.error('Error fetching asset:', err)
        toast.error('Failed to load asset')
      })
    }
  }, [assetId, fetchAsset])

  const saveAsset = async () => {
    setIsSaving(true)
    const compiled_html = generateStaticHtml(blocks)
    const chipVars = blocks
      .filter(b => b.type === 'VARIABLE_CHIP')
      .map(b => (typeof b.content === 'string' ? b.content.replace(/{{|}}/g, '') : ''))
    const textVars = blocks
      .filter(b => b.type === 'TEXT_MODULE')
      .flatMap(b => {
        const contentObj = typeof b.content === 'object' ? b.content : { text: String(b.content || ''), useAi: false, aiPrompt: '' }
        return extractVariableKeysFromText(contentObj.text || '')
      })
    const variables = [...new Set([...chipVars.filter(Boolean), ...textVars])]

    // Strip AI-generated text before saving to keep template dynamic
    const blocksToSave = blocks.map(block => {
      if (block.type === 'TEXT_MODULE') {
        const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
        if (contentObj.useAi) {
          return {
            ...block,
            content: { ...contentObj, text: '', bullets: [] } // Clear text and bullets for AI blocks
          }
        }
      }
      return block
    })

    const payload = {
      name: assetName,
      type: assetType,
      content_json: { blocks: blocksToSave },
      compiled_html,
      variables
    }

    try {
      const idToken = await (user as any)?.getIdToken?.().catch(() => null)
      const res = await fetch('/api/foundry/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          id: assetId && assetId !== 'new' ? assetId : undefined,
          ...payload,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.details || 'Forge failure')

      if (assetId && assetId !== 'new') {
        toast.success('Asset updated in Foundry')
        queryClient.invalidateQueries({ queryKey: ['transmission_assets'] })
      } else {
        const newId = data?.asset?.id
        const asset = data?.asset
        if (typeof newId === 'string' && newId.trim()) {
          // Cache so the next page load uses it (avoids "Failed to load asset" when RLS or replication delays)
          if (typeof window !== 'undefined' && asset) {
            sessionStorage.setItem(`foundry_asset_${newId}`, JSON.stringify(asset))
          }
          queryClient.invalidateQueries({ queryKey: ['transmission_assets'] })
          toast.success('Asset forged in Foundry')
          router.push(`/network/foundry/${newId}`)
        } else {
          toast.success('Asset forged')
        }
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
    { type: 'IMAGE_BLOCK', label: 'Image', icon: ImageIcon },
    { type: 'LIABILITY_GAUGE', label: 'Risk_Vector', icon: Zap },
    { type: 'MARKET_BREADCRUMB', label: 'Market_Intel', icon: Search },
  ]

  const addBlock = (type: Block['type']) => {
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === 'TEXT_MODULE' ? { text: '', useAi: false, aiPrompt: '', bullets: [] } :
        type === 'TACTICAL_BUTTON' ? '[ INITIATE_PROTOCOL ]' :
          type === 'TELEMETRY_GRID' ? { headers: ['ITEM', 'VALUE'], rows: [['Metric', '0.00']], valueColors: ['black'] as const } :
            type === 'IMAGE_BLOCK' ? { url: '', description: '', caption: '' } :
              type === 'LIABILITY_GAUGE' ? {
                baselineLabel: 'CURRENT_FIXED_RATE',
                baselineValue: '0.082',
                riskLabel: 'SCARCITY_EXPOSURE',
                riskLevel: 75,
                status: 'VOLATILE',
                note: '',
                bullets: ['Structural variance detected in regional load profiles', 'Architecture leaking $4.2k/mo in ghost capacity', 'Grid volatility index elevated']
              } :
                type === 'MARKET_BREADCRUMB' ? {
                  headline: 'ERCOT_RESERVES_DROP_BELOW_3000MW',
                  source: 'GridMonitor_Intelligence',
                  url: 'https://',
                  nodalAnalysis: 'Detected scarcity risk in {{contact.load_zone}}. Estimated variance: $0.12/kWh.',
                  impactLevel: 'HIGH_VOLATILITY'
                } :
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

  const generateWithAi = async (blockId: string, blockType: 'TEXT_MODULE' | 'TACTICAL_BUTTON' | 'LIABILITY_GAUGE' | 'MARKET_BREADCRUMB', currentContent: string | { text?: string; aiPrompt?: string }, noteField?: string) => {
    setGeneratingBlockId(blockId)
    try {
      let prompt: string
      let blockTypeParam: string
      let contextText: string = ''

      if (blockType === 'TEXT_MODULE') {
        const blockIndex = blocks.findIndex(b => b.id === blockId)
        const isFirstBlock = blockIndex === 0
        const contentObj = typeof currentContent === 'object'
          ? currentContent as TextModuleContent
          : { text: String(currentContent), aiPrompt: '', useAi: false, bullets: [] } as TextModuleContent
        const userPrompt = contentObj.aiPrompt?.trim() || ''

        // Build context from all other blocks
        const otherBlocks = blocks.filter((b, idx) => idx !== blockIndex)
        const contextParts: string[] = []
        otherBlocks.forEach((b, idx) => {
          if (b.type === 'TEXT_MODULE') {
            const txt = typeof b.content === 'string' ? b.content : (b.content?.text || '')
            if (txt.trim()) contextParts.push(`Block ${idx + 1}: ${txt.slice(0, 200)}`)
          } else if (b.type === 'TACTICAL_BUTTON') {
            contextParts.push(`Block ${idx + 1}: CTA button "${b.content}"`)
          } else if (b.type === 'TELEMETRY_GRID') {
            const headers = b.content?.headers?.join(', ') || ''
            contextParts.push(`Block ${idx + 1}: Data grid with columns: ${headers}`)
          } else if (b.type === 'LIABILITY_GAUGE') {
            contextParts.push(`Block ${idx + 1}: Liability gauge showing ${b.content?.baselineValue || 'rate'}/kWh, ${b.content?.riskLevel || 0}% risk`)
          } else if (b.type === 'MARKET_BREADCRUMB') {
            contextParts.push(`Block ${idx + 1}: Market intel "${b.content?.headline || ''}"`)
          }
        })
        const foundryContext = contextParts.length > 0 ? `\n\nOther blocks in this foundry asset:\n${contextParts.join('\n')}` : ''

        const contactInfo = previewContact
          ? `\n\nContact: ${(previewContact as { firstName?: string })?.firstName || '—'} ${(previewContact as { lastName?: string })?.lastName || ''}, Company: ${(previewContact as { companyName?: string })?.companyName || '—'}, Current rate: ${(previewContact as { currentRate?: string })?.currentRate || '—'}/kWh`
          : ''

        if (isFirstBlock) {
          prompt = `You are writing the introduction and intelligence briefing for an energy intelligence email. 
          
          STRUCTURE:
          1. Greeting: "{contact.firstName}," (On its own line)
          2. Double Newline
          3. Paragraph 1: EXACTLY 1 concise forensic sentence setting the context.
          4. Double Newline
          5. Paragraph 2: EXACTLY 2 forensic sentences detailing the technical requirements or intelligence signals.
          
          CONTENT RULES:
          - CONCISENESS IS MANDATORY. Keep sentences short and clinical.
          - Use Nodal Point's forensic, intelligence-brief style.
          - NO bracketed sources like [1], [2], [3].
          - NO marketing fluff.
          - Include ${contentObj.bullets?.length || 0} technical signal bullets.
          
          FORMAT: Return a JSON object with "text" (string) and "bullets" (array of strings, exactly ${contentObj.bullets?.length || 0} items).
          Ensure Paragraph 1 and Paragraph 2 are separated by TWO newline characters (\n\n).
          ${userPrompt ? `\n\nUser instruction: ${userPrompt}` : ''}${foundryContext}${contactInfo}`
        } else {
          prompt = `You are writing a body paragraph for an energy intelligence email. 
          
          STRUCTURE:
          1. Narrative: EXACTLY 2-3 concise forensic sentences.
          
          CONTENT RULES:
          - CONCISENESS IS MANDATORY. Keep sentences short and clinical.
          - Use the contact's first name naturally within the paragraph.
          - NO bracketed sources like [1], [2], [3].
          - NO marketing fluff.
          - Include ${contentObj.bullets?.length || 0} technical signal bullets.
          
          FORMAT: Return a JSON object with "text" (string) and "bullets" (array of strings, exactly ${contentObj.bullets?.length || 0} items).
          ${userPrompt ? `\n\nUser instruction: ${userPrompt}` : ''}${foundryContext}${contactInfo}`
        }
        blockTypeParam = 'narrative'
        contextText = typeof currentContent === 'string' ? currentContent : (currentContent?.text || '')
      } else if (blockType === 'TACTICAL_BUTTON') {
        prompt = 'Rewrite as a single tactical CTA label for an intelligence brief.'
        blockTypeParam = 'button'
        contextText = typeof currentContent === 'string' ? currentContent : String(currentContent)
      } else if (blockType === 'LIABILITY_GAUGE') {
        const contactSummary = previewContact
          ? ` Contact context: current rate ${(previewContact as { currentRate?: string })?.currentRate ?? '—'}, supplier ${(previewContact as { electricitySupplier?: string })?.electricitySupplier ?? '—'}, contract end ${(previewContact as { contractEnd?: string })?.contractEnd ?? '—'}.`
          : ''
        prompt = `Rewrite the following as a one-sentence risk diagnosis for an energy liability gauge. Focus on structural inefficiency and grid physics. Minimalist and forensic. No marketing.${contactSummary}`
        blockTypeParam = 'narrative'
        contextText = typeof currentContent === 'string' ? currentContent : String(currentContent)
      } else if (blockType === 'MARKET_BREADCRUMB') {
        const contactSummary = previewContact
          ? ` Contact context: load zone ${(previewContact as { metadata?: { energy?: { loadZone?: string } } })?.metadata?.energy?.loadZone ?? '—'}, company ${(previewContact as { companyName?: string })?.companyName ?? '—'}, current rate ${(previewContact as { currentRate?: string })?.currentRate ?? '—'}.`
          : ''
        prompt = `Rewrite this market news into a 2-sentence impact assessment for a client in {{load_zone}}. Focus on how this event increases their 'Liability' or 'Cost Leakage'. Do not summarize the article; interpret its 'Physics' relative to the client's strike price.${contactSummary}`
        blockTypeParam = 'narrative'
        contextText = typeof currentContent === 'string' ? currentContent : String(currentContent)
      } else {
        prompt = 'Rewrite this for a Nodal Point intelligence brief. Keep it forensic and precise.'
        blockTypeParam = 'narrative'
        contextText = typeof currentContent === 'string' ? currentContent : String(currentContent)
      }
      const res = await fetch('/api/foundry/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: contextText,
          blockType: blockTypeParam,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || data?.details || 'AI generation failed')
        return
      }

      // Handle JSON response (text + bullets) or plain text
      let generatedText = ''
      let generatedBullets: string[] = []

      if (typeof data?.text === 'string') {
        try {
          // Check if the AI returned a JSON string inside the text field
          const parsed = JSON.parse(data.text)
          generatedText = (parsed.text || '').replace(/\[\d+\]/g, '').trim()
          generatedBullets = (parsed.bullets || []).map((b: string) => b.replace(/\[\d+\]/g, '').trim())
        } catch {
          // Fallback to plain text if not JSON
          generatedText = data.text.replace(/\[\d+\]/g, '').trim()
        }
      }

      if (generatedText) {
        if (blockType === 'TEXT_MODULE') {
          const block = blocks.find(b => b.id === blockId)
          if (block) {
            const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content), useAi: false, aiPrompt: '' }
            updateBlockContent(blockId, {
              ...contentObj,
              text: generatedText,
              bullets: generatedBullets.length > 0 ? generatedBullets : (contentObj.bullets ?? [])
            })
          }
        } else if (blockType === 'LIABILITY_GAUGE' && noteField === 'note') {
          const block = blocks.find(b => b.id === blockId)
          if (block) updateBlockContent(blockId, { ...block.content, note: data.text.trim() })
        } else if (blockType === 'MARKET_BREADCRUMB' && noteField === 'nodalAnalysis') {
          const block = blocks.find(b => b.id === blockId)
          if (block) updateBlockContent(blockId, { ...block.content, nodalAnalysis: data.text.trim() })
        } else {
          updateBlockContent(blockId, data.text.trim())
        }
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

  const rootStyle = {
    '--split-position': `${splitPosition}%`,
    '--split-position-inv': `${100 - splitPosition}%`
  } as React.CSSProperties

  return (
    <div
      aria-label="Foundry Builder Interface"
      className="flex flex-col h-full bg-zinc-950 text-zinc-300 overflow-hidden rounded-2xl border border-white/5 shadow-2xl"
      style={rootStyle}
    >
      {/* Top Controls */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 nodal-recessed bg-black/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] bg-zinc-900 border border-white/5 flex items-center justify-center">
              <Zap size={14} className="text-[#002FA7]" />
            </div>
            <input
              aria-label="Asset Name"
              title="Asset Name"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-sm font-bold tracking-tighter text-white p-0 w-48"
              placeholder="ASSET_NAME"
            />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <select
            aria-label="Asset Type"
            title="Asset Type"
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
          className="flex flex-col border-r border-white/5 bg-zinc-950 overflow-hidden w-[var(--split-position)]"
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
                        {block.type === 'TELEMETRY_GRID' && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const headers = block.content?.headers ?? ['ITEM', 'VALUE']
                                const numCols = headers.length
                                const newRow = Array(numCols).fill('')
                                const newRows = [...(block.content?.rows ?? [['Metric', '0.00']]), newRow]
                                const prevColors = block.content?.valueColors ?? []
                                const valueColors = [...prevColors, 'black']
                                updateBlockContent(block.id, { ...block.content, headers, rows: newRows, valueColors })
                              }}
                              className="p-1 hover:text-[#002FA7]"
                              title="Add Row"
                              aria-label="Add Row"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const headers = [...(block.content?.headers ?? ['ITEM', 'VALUE']), `COL_${(block.content?.headers?.length ?? 0) + 1}`]
                                const rows = (block.content?.rows ?? [['Metric', '0.00']]).map((row: string[]) => [...row, ''])
                                updateBlockContent(block.id, { ...block.content, headers, rows })
                              }}
                              className="p-1 hover:text-[#002FA7]"
                              title="Add Column"
                              aria-label="Add Column"
                            >
                              <TableIcon size={14} />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                          disabled={blocks.findIndex(b => b.id === block.id) === 0}
                          className="p-1 hover:text-[#002FA7] disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move up"
                          title="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                          disabled={blocks.findIndex(b => b.id === block.id) === blocks.length - 1}
                          className="p-1 hover:text-[#002FA7] disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move down"
                          title="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          aria-label="Delete block"
                          title="Delete block"
                          onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                          className="p-1 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {block.type === 'TEXT_MODULE' && (() => {
                      const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                      const useAi = contentObj.useAi ?? false
                      const blockIndex = blocks.findIndex(b => b.id === block.id)
                      const isFirstBlock = blockIndex === 0

                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={useAi}
                              aria-label="Activate AI Generation"
                              title="Activate AI Generation"
                              onCheckedChange={(checked) => {
                                const currentContent = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                                // When turning AI on, clear the text so placeholder shows in preview
                                if (checked) {
                                  updateBlockContent(block.id, { ...currentContent, useAi: true, text: '' })
                                } else {
                                  updateBlockContent(block.id, { ...currentContent, useAi: false })
                                }
                              }}
                            />
                            <Label
                              className={cn(
                                "text-[10px] font-mono uppercase tracking-widest cursor-pointer transition-colors",
                                useAi ? "text-emerald-500 font-bold" : "text-zinc-400"
                              )}
                            >
                              {useAi ? 'AI ACTIVATED' : 'ACTIVATE AI'}
                            </Label>
                            {useAi && (
                              <span className="text-[9px] font-mono text-zinc-500">
                                {isFirstBlock ? '(Introduction)' : '(Body paragraph)'}
                              </span>
                            )}
                          </div>

                          {useAi ? (
                            <div className="space-y-2">
                              <textarea
                                value={contentObj.aiPrompt || ''}
                                aria-label="AI Prompt"
                                title="AI Prompt"
                                onChange={(e) => {
                                  const currentContent = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: true, aiPrompt: '' }
                                  updateBlockContent(block.id, { ...currentContent, aiPrompt: e.target.value })
                                }}
                                placeholder={isFirstBlock ? 'e.g., "Quick intro to the email and tell the customer that it was a pleasure speaking with him today"' : 'e.g., "Explain the concept of phantom charges in simple terms"'}
                                className="w-full bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs font-sans text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#002FA7] min-h-[60px] resize-none"
                              />
                              {generatingBlockId === block.id && (
                                <p className="text-[10px] font-mono text-zinc-500">Generating...</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <textarea
                                ref={(el) => { if (activeBlock === block.id) textModuleTextareaRef.current = el }}
                                value={contentObj.text || ''}
                                aria-label="Narrative text"
                                title="Narrative text"
                                onChange={(e) => {
                                  const currentContent = typeof block.content === 'object' ? block.content : { text: '', useAi: false, aiPrompt: '' }
                                  updateBlockContent(block.id, { ...currentContent, text: e.target.value })
                                }}
                                placeholder="Enter narrative payload..."
                                className="w-full bg-transparent border-none focus:ring-0 text-xs font-sans text-zinc-300 min-h-[100px] resize-none p-0 placeholder:text-zinc-600"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <Popover open={variablePopoverOpen === block.id} onOpenChange={(open) => setVariablePopoverOpen(open ? block.id : null)}>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded border border-[#002FA7]/30 bg-[#002FA7]/10 text-[10px] font-mono uppercase tracking-widest text-[#002FA7] hover:bg-[#002FA7]/20"
                                    >
                                      <Variable size={12} />
                                      Insert variable
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-0 bg-zinc-900 border-white/10" align="start">
                                    <div className="max-h-[280px] overflow-y-auto np-scroll">
                                      <div className="p-2 border-b border-white/10">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                          <User size={10} /> Contact
                                        </span>
                                      </div>
                                      <div className="p-1">
                                        {CONTACT_VARIABLES.map((v) => (
                                          <button
                                            key={v.key}
                                            type="button"
                                            className="w-full text-left px-2 py-1.5 rounded text-xs font-sans text-zinc-300 hover:bg-white/10 hover:text-white"
                                            onClick={() => {
                                              const currentContent = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                                              insertVariableIntoText(block.id, v.key, currentContent.text || '')
                                            }}
                                          >
                                            {v.label} <span className="text-[10px] font-mono text-[#002FA7]">{v.key}</span>
                                          </button>
                                        ))}
                                      </div>
                                      <div className="p-2 border-b border-t border-white/10">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                          <Building2 size={10} /> Account
                                        </span>
                                      </div>
                                      <div className="p-1">
                                        {ACCOUNT_VARIABLES.map((v) => (
                                          <button
                                            key={v.key}
                                            type="button"
                                            className="w-full text-left px-2 py-1.5 rounded text-xs font-sans text-zinc-300 hover:bg-white/10 hover:text-white"
                                            onClick={() => {
                                              const currentContent = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                                              insertVariableIntoText(block.id, v.key, currentContent.text || '')
                                            }}
                                          >
                                            {v.label} <span className="text-[10px] font-mono text-[#002FA7]">{v.key}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>
                          )}

                          {/* Signal Bullets */}
                          <div className="space-y-2 pt-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-[#002FA7]/10 border-[#002FA7]/20 text-[#002FA7] text-[9px] font-mono uppercase">Signal</Badge>
                              <label className="text-[9px] font-mono text-zinc-500 uppercase">Bullets</label>
                              <button
                                type="button"
                                onClick={() => {
                                  const bullets = contentObj.bullets ?? []
                                  updateBlockContent(block.id, { ...contentObj, bullets: [...bullets, 'New signal point...'] })
                                }}
                                className="text-[9px] font-mono text-[#002FA7] hover:underline"
                              >
                                + Add Bullet
                              </button>
                            </div>
                            <div className="space-y-1">
                              {(contentObj.bullets ?? []).map((bullet: string, bi: number) => (
                                <div key={bi} className="flex items-center gap-1">
                                  <span className="text-[#002FA7] text-[10px]">●</span>
                                  <input
                                    value={useAi ? 'AI_GENERATED_SIGNAL_POINT' : bullet}
                                    readOnly={useAi}
                                    onChange={(e) => {
                                      if (useAi) return
                                      const newBullets = [...(contentObj.bullets ?? [])]
                                      newBullets[bi] = e.target.value
                                      updateBlockContent(block.id, { ...contentObj, bullets: newBullets })
                                    }}
                                    className={cn(
                                      "flex-1 bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono",
                                      useAi ? "text-emerald-500 italic opacity-70 cursor-not-allowed" : "text-zinc-300"
                                    )}
                                  />
                                  <button
                                    type="button"
                                    aria-label="Remove bullet"
                                    onClick={() => {
                                      const newBullets = (contentObj.bullets ?? []).filter((_: any, i: number) => i !== bi)
                                      updateBlockContent(block.id, { ...contentObj, bullets: newBullets })
                                    }}
                                    className="p-1 hover:text-red-400"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    )()}

                    {block.type === 'TACTICAL_BUTTON' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          aria-label="Button Text"
                          title="Button Text"
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          placeholder="INITIATE_PROTOCOL"
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
                          aria-label="Variable Name"
                          title="Variable Name"
                          value={block.content}
                          onChange={(e) => updateBlockContent(block.id, e.target.value)}
                          placeholder="variable"
                          className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-[#002FA7] p-0 w-32"
                        />
                      </div>
                    )}

                    {block.type === 'TELEMETRY_GRID' && (
                      <div
                        aria-label="Telemetry Grid"
                        className="space-y-3"
                        // eslint-disable-next-line react/forbid-dom-props
                        style={{ gridTemplateColumns: 'repeat(var(--num-cols), minmax(0, 1fr)) 24px' } as React.CSSProperties}
                      >
                        <style jsx>{`
                          .space-y-3 {
                            --num-cols: ${block.content.headers.length};
                          }
                        `}</style>
                        <div
                          className="grid gap-2 grid-cols-[repeat(var(--num-cols),minmax(0,1fr))_24px]"
                        >
                          {block.content.headers.map((h: string, i: number) => (
                            <div key={i} className="relative group/header">
                              <input
                                value={h}
                                aria-label={`Column Header ${i + 1}`}
                                title={`Column Header ${i + 1}`}
                                onChange={(e) => {
                                  const newHeaders = [...block.content.headers]
                                  newHeaders[i] = e.target.value
                                  updateBlockContent(block.id, { ...block.content, headers: newHeaders })
                                }}
                                placeholder="Metric"
                                className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase focus:border-[#002FA7]/50 outline-none"
                              />
                            </div>
                          ))}
                          <div /> {/* Spacer for col action column */}
                        </div>

                        {block.content.rows.map((row: string[], ri: number) => {
                          const valueColors: ValueColor[] = block.content.valueColors ?? block.content.rows.map(() => 'black' as ValueColor)
                          const currentColor: ValueColor = valueColors[ri] ?? 'black'
                          return (
                            <div
                              key={ri}
                              className="grid gap-2 items-center group grid-cols-[repeat(var(--num-cols),minmax(0,1fr))_24px]"
                            >
                              {row.map((cell: string, ci: number) => (
                                <div key={ci} className="flex items-center gap-2">
                                  <input
                                    value={cell}
                                    aria-label={`Cell Row ${ri + 1} Col ${ci + 1}`}
                                    title={`Cell Row ${ri + 1} Col ${ci + 1}`}
                                    onChange={(e) => {
                                      const newRows = [...block.content.rows]
                                      newRows[ri][ci] = e.target.value
                                      updateBlockContent(block.id, { ...block.content, headers: block.content.headers, rows: newRows })
                                    }}
                                    placeholder="0.00"
                                    className={cn(
                                      "w-full bg-black/20 border border-white/5 rounded px-2 py-1 text-xs text-zinc-300 focus:border-[#002FA7]/50 outline-none",
                                      ci > 0 && VALUE_COLOR_CLASSES[currentColor].replace('bg-', 'text-')
                                    )}
                                  />
                                  {ci === row.length - 1 && (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const nextColor = VALUE_COLORS[(VALUE_COLORS.indexOf(currentColor) + 1) % VALUE_COLORS.length]
                                        const newValueColors = [...(block.content?.valueColors ?? [])]
                                        newValueColors[ri] = nextColor
                                        updateBlockContent(block.id, { ...block.content, valueColors: newValueColors })
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation()
                                          const nextColor = VALUE_COLORS[(VALUE_COLORS.indexOf(currentColor) + 1) % VALUE_COLORS.length]
                                          const newValueColors = [...(block.content?.valueColors ?? [])]
                                          newValueColors[ri] = nextColor
                                          updateBlockContent(block.id, { ...block.content, valueColors: newValueColors })
                                        }
                                      }}
                                      className={cn(
                                        "w-3 h-3 rounded-full cursor-pointer border border-white/20 transition-all hover:scale-110",
                                        VALUE_COLOR_CLASSES[currentColor]
                                      )}
                                      title={`Cycle color: ${currentColor}`}
                                      aria-label={`Cycle color: ${currentColor}`}
                                    />
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const newRows = block.content.rows.filter((_: any, idx: number) => idx !== ri)
                                  const newValueColors = (block.content.valueColors ?? []).filter((_: any, idx: number) => idx !== ri)
                                  updateBlockContent(block.id, { ...block.content, rows: newRows, valueColors: newValueColors })
                                }}
                                className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove Row"
                                aria-label="Remove Row"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )
                        })}

                        {/* Column management footer */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const newHeaders = [...block.content.headers, 'New Column']
                              const newRows = block.content.rows.map((row: string[]) => [...row, ''])
                              updateBlockContent(block.id, { ...block.content, headers: newHeaders, rows: newRows })
                            }}
                            className="text-[9px] font-mono text-[#002FA7] hover:underline"
                          >
                            + Add Column
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newRow = Array(block.content.headers.length).fill('')
                              const newRows = [...block.content.rows, newRow]
                              const newValueColors = [...(block.content.valueColors ?? []), 'black']
                              updateBlockContent(block.id, { ...block.content, rows: newRows, valueColors: newValueColors })
                            }}
                            className="text-[9px] font-mono text-[#002FA7] hover:underline"
                          >
                            + Add Row
                          </button>
                        </div>

                        {block.content.headers.length > 2 && (
                          <div
                            className="grid gap-2 grid-cols-[repeat(var(--num-cols),minmax(0,1fr))_24px]"
                          >
                            {block.content.headers.map((_: string, i: number) => (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const headers = block.content.headers.filter((_: any, idx: number) => idx !== i)
                                  const rows = block.content.rows.map((row: string[]) => row.filter((_: any, idx: number) => idx !== i))
                                  updateBlockContent(block.id, { ...block.content, headers, rows })
                                }}
                                className="text-[9px] font-mono text-zinc-600 hover:text-red-400 uppercase text-center"
                              >
                                [ Delete_Col ]
                              </button>
                            ))}
                          </div>
                        )}
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
                            aria-label="Upload Image"
                            title="Upload Image"
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
                            <Image
                              src={block.content.url}
                              alt="Asset Preview"
                              width={200}
                              height={96}
                              className="w-full h-full object-contain max-h-24"
                            />
                          </div>
                        )}
                        <div className="grid gap-2">
                          <input
                            type="text"
                            aria-label="Image description"
                            title="Image description"
                            placeholder="Description (alt text)"
                            value={block.content?.description ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, description: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1.5 text-[10px] font-mono text-zinc-400 placeholder:text-zinc-600"
                          />
                          <input
                            type="text"
                            aria-label="Image caption"
                            title="Image caption"
                            placeholder="Caption (visible below image)"
                            value={block.content?.caption ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, caption: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1.5 text-[10px] font-mono text-zinc-400 placeholder:text-zinc-600"
                          />
                        </div>
                      </div>
                    )}

                    {block.type === 'LIABILITY_GAUGE' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Baseline label</label>
                            <input
                              value={block.content?.baselineLabel ?? ''}
                              aria-label="Baseline label"
                              title="Baseline label"
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, baselineLabel: e.target.value })}
                              placeholder="Baseline label"
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Value</label>
                            <input
                              value={block.content?.baselineValue ?? ''}
                              aria-label="Baseline value"
                              title="Baseline value"
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, baselineValue: e.target.value })}
                              placeholder="Value"
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Risk % (0–100)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              aria-label="Risk percentage"
                              title="Risk percentage"
                              value={block.content?.riskLevel ?? 75}
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, riskLevel: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                              placeholder="Risk percentage"
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Status</label>
                            <input
                              value={block.content?.status ?? ''}
                              aria-label="Status"
                              title="Status"
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, status: e.target.value })}
                              placeholder="Status"
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-zinc-500 uppercase">Risk diagnosis note</label>
                          <textarea
                            value={block.content?.note ?? ''}
                            aria-label="Risk diagnosis note"
                            title="Risk diagnosis note"
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, note: e.target.value })}
                            rows={2}
                            placeholder="Risk diagnosis note"
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => generateWithAi(block.id, 'LIABILITY_GAUGE', block.content?.note ?? '', 'note')}
                            disabled={generatingBlockId === block.id}
                            className="text-[10px] font-mono uppercase tracking-widest text-[#002FA7] hover:underline disabled:opacity-50"
                          >
                            {generatingBlockId === block.id ? 'Generating…' : 'Generate with AI'}
                          </button>
                        </div>

                        {/* Signal Bullets */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-[#002FA7]/10 border-[#002FA7]/20 text-[#002FA7] text-[9px] font-mono uppercase">Signal</Badge>
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Bullets</label>
                            <button
                              type="button"
                              onClick={() => {
                                const bullets = block.content?.bullets ?? []
                                updateBlockContent(block.id, { ...block.content, bullets: [...bullets, 'New signal point...'] })
                              }}
                              className="text-[9px] font-mono text-[#002FA7] hover:underline"
                            >
                              + Add Bullet
                            </button>
                          </div>
                          {(block.content?.bullets ?? []).map((bullet: string, bi: number) => (
                            <div key={bi} className="flex items-center gap-1">
                              <span className="text-[#002FA7] text-[10px]">●</span>
                              <input
                                value={bullet}
                                aria-label="Bullet point"
                                title="Bullet point"
                                onChange={(e) => {
                                  const newBullets = [...(block.content?.bullets ?? [])]
                                  newBullets[bi] = e.target.value
                                  updateBlockContent(block.id, { ...block.content, bullets: newBullets })
                                }}
                                placeholder="Bullet point"
                                className="flex-1 bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                              />
                              <button
                                type="button"
                                aria-label="Remove bullet"
                                onClick={() => {
                                  const newBullets = (block.content?.bullets ?? []).filter((_: any, i: number) => i !== bi)
                                  updateBlockContent(block.id, { ...block.content, bullets: newBullets })
                                }}
                                className="p-1 hover:text-red-400"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {block.type === 'MARKET_BREADCRUMB' && (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-zinc-500 uppercase">Headline</label>
                          <input
                            aria-label="Headline"
                            title="Headline"
                            value={block.content?.headline ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, headline: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            placeholder="ERCOT_RESERVES_DROP_BELOW_3000MW"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Source</label>
                            <input
                              aria-label="Source"
                              title="Source"
                              value={block.content?.source ?? ''}
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, source: e.target.value })}
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                              placeholder="GridMonitor_Intelligence"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-zinc-500 uppercase">Impact level</label>
                            <input
                              aria-label="Impact Level"
                              title="Impact Level"
                              value={block.content?.impactLevel ?? ''}
                              onChange={(e) => updateBlockContent(block.id, { ...block.content, impactLevel: e.target.value })}
                              className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                              placeholder="HIGH_VOLATILITY"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-zinc-500 uppercase">URL</label>
                          <input
                            aria-label="Breadcrumb URL"
                            title="Breadcrumb URL"
                            value={block.content?.url ?? ''}
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, url: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300"
                            placeholder="https://..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-zinc-500 uppercase">Nodal Architect Analysis</label>
                          <textarea
                            value={block.content?.nodalAnalysis ?? ''}
                            aria-label="Nodal Analysis"
                            title="Nodal Analysis"
                            onChange={(e) => updateBlockContent(block.id, { ...block.content, nodalAnalysis: e.target.value })}
                            rows={2}
                            placeholder="Analysis note"
                            className="w-full bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => generateWithAi(block.id, 'MARKET_BREADCRUMB', block.content?.nodalAnalysis ?? '', 'nodalAnalysis')}
                            disabled={generatingBlockId === block.id}
                            className="text-[10px] font-mono uppercase tracking-widest text-[#002FA7] hover:underline disabled:opacity-50"
                          >
                            {generatingBlockId === block.id ? 'Generating…' : 'Generate with AI'}
                          </button>
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
          className="absolute top-0 bottom-0 w-1 bg-white/5 hover:bg-[#002FA7]/40 cursor-col-resize z-10 flex items-center justify-center group transition-colors left-[var(--split-position)] -translate-x-1/2"
          onMouseDown={() => setIsResizing(true)}
        >
          <div className="h-8 w-px bg-white/20 group-hover:bg-[#002FA7] transition-colors" />
        </div>

        {/* Right Panel: The Simulation */}
        <div
          className="bg-white overflow-hidden flex flex-col w-[var(--split-position-inv)]"
        >
          <div className="h-10 border-b border-zinc-200 bg-zinc-50 flex items-center px-4 justify-between gap-4">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Live_Simulation</span>
            <Select
              value={previewContactId ?? '__none__'}
              onValueChange={(v) => {
                const contactId = v === '__none__' ? null : v
                setPreviewContactId(contactId)
                if (contactId) {
                  // Clear AI-generated text to force fresh generation and prevent "flashing" old contact data
                  setBlocks(current => current.map(block => {
                    if (block.type === 'TEXT_MODULE') {
                      const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                      if (contentObj.useAi) {
                        return { ...block, content: { ...contentObj, text: '' } }
                      }
                    }
                    return block
                  }))
                }
              }}
            >
              <SelectTrigger aria-label="Select preview contact" title="Select preview contact" className="h-6 bg-transparent border-none text-[10px] font-mono text-[#002FA7] uppercase tracking-widest gap-2 shadow-none focus:ring-0">
                <SelectValue placeholder="SELECT_CONTACT_PREVIEW" />
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

          <div className="flex-1 overflow-y-auto bg-zinc-100 p-8 flex justify-center items-start np-scroll">
            <div className="w-full max-w-[600px] bg-white shadow-2xl flex flex-col shrink-0">
              {previewHtml ? (
                <div
                  className="foundry-preview w-full"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml, { ALLOWED_TAGS: ['p', 'div', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'img', 'figcaption', 'br', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'], ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'title'] }) }}
                />
              ) : (
                <>
                  <div className="border-b border-zinc-200 p-6 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Image
                        src="/images/nodalpoint.png"
                        alt="Nodal Point Logo"
                        width={24}
                        height={24}
                        className="h-6 w-auto"
                      />
                      <span className="text-[10px] font-mono text-zinc-900 font-bold tracking-[0.2em] uppercase">NODAL_POINT // INTELLIGENCE</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-tighter">
                      REF: {new Date().toISOString().split('T')[0].replace(/-/g, '')} {'//'} TX_001
                    </span>
                  </div>
                  <div className="p-8 space-y-6">
                    {blocks.map((block) => (
                      <div key={block.id}>
                        {block.type === 'TEXT_MODULE' && (() => {
                          const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
                          const text = contentObj.text || ''
                          const useAi = contentObj.useAi ?? false
                          const hasText = text.trim().length > 0

                          // Show placeholder when AI is enabled but no text generated yet
                          if (useAi && !hasText) {
                            return (
                              <div className="border-2 border-dashed border-zinc-300 rounded-lg p-8 bg-zinc-50">
                                <div className="text-center">
                                  <p className="text-zinc-400 text-sm font-mono uppercase tracking-widest">
                                    AI Generated Content Placeholder
                                  </p>
                                  <p className="text-zinc-300 text-xs font-mono mt-2">
                                    Text will appear here when a contact is selected
                                  </p>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div className="flex flex-col">
                              {text.split(/\n\n+/).filter((p: string) => p.trim()).map((paragraph: string, pi: number) => (
                                <p key={pi} className="text-zinc-900 leading-tight font-sans whitespace-pre-wrap text-[13px] mb-4 last:mb-0">
                                  {paragraph.trim().split(/(\{\{[^}]+\}\})/g).map((part: string, i: number) =>
                                    part.startsWith('{{') && part.endsWith('}}')
                                      ? <span key={i} className="bg-amber-100 text-amber-800 px-0.5 rounded font-mono text-[10px]">{part}</span>
                                      : part
                                  )}
                                </p>
                              ))}
                              {(contentObj.bullets ?? []).length > 0 && (
                                <ul className="space-y-1.5 mt-5">
                                  {(contentObj.bullets ?? []).map((bullet: string, bi: number) => (
                                    <li key={bi} className="flex items-start gap-2 text-[10px] font-mono text-zinc-500 leading-tight">
                                      <span className="text-[#002FA7] mt-1 shrink-0">●</span>
                                      <span>
                                        {bullet.split(/(\{\{[^}]+\}\})/g).map((part: string, i: number) =>
                                          part.startsWith('{{') && part.endsWith('}}')
                                            ? <span key={i} className="bg-amber-100 text-amber-800 px-0.5 rounded">{part}</span>
                                            : part
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })()}
                        {block.type === 'TACTICAL_BUTTON' && (
                          <div className="pt-4 flex justify-center">
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
                                {block.content.rows.map((row: string[], ri: number) => {
                                  const valueColors: ValueColor[] = block.content.valueColors ?? []
                                  const rowColor = valueColors[ri] ?? 'black'
                                  const valueTextClass = rowColor === 'yellow' ? 'text-amber-600' : rowColor === 'red' ? 'text-red-600' : rowColor === 'black' ? 'text-zinc-900' : 'text-emerald-600'
                                  return (
                                    <tr key={ri}>
                                      {row.map((cell: string, ci: number) => (
                                        <td key={ci} className={ci > 0 ? `py-2 text-xs font-mono ${valueTextClass}` : 'py-2 text-xs font-mono text-zinc-900'}>{cell}</td>
                                      ))}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {block.type === 'IMAGE_BLOCK' && block.content?.url && (
                          <figure className="my-4">
                            <Image
                              src={block.content.url}
                              alt={block.content?.description ?? 'Asset Image'}
                              width={600}
                              height={400}
                              className="max-w-full h-auto block rounded border border-zinc-200"
                            />
                            {block.content?.caption && (
                              <figcaption className="text-[10px] font-mono text-zinc-500 mt-2">{block.content.caption}</figcaption>
                            )}
                          </figure>
                        )}
                        {block.type === 'LIABILITY_GAUGE' && (
                          <div className="p-6 bg-zinc-100 border border-zinc-200 rounded-xl space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{block.content?.baselineLabel ?? 'CURRENT_FIXED_RATE'}</p>
                                <p className="text-xl font-mono text-zinc-900 tabular-nums">${block.content?.baselineValue ?? '0.082'}/kWh</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest">{block.content?.status ?? 'VOLATILE'}</p>
                                <p className="text-xl font-mono text-zinc-900 tabular-nums">{block.content?.riskLevel ?? 75}%</p>
                              </div>
                            </div>
                            <div
                              className="h-2 w-full bg-zinc-300 rounded-full overflow-hidden relative"
                            >
                              <div
                                className="h-full bg-[#002FA7] transition-all duration-1000"
                                // eslint-disable-next-line react/forbid-dom-props
                                style={{ width: `${Math.min(100, Math.max(0, Number(block.content?.riskLevel) ?? 75))}%` }}
                              />
                            </div>
                            {(block.content?.note ?? '').trim() && (
                              <p className="text-[9px] font-mono text-zinc-600 leading-tight uppercase tracking-tighter">
                                {block.content.note}
                              </p>
                            )}
                            {(block.content?.bullets ?? []).length > 0 && (
                              <ul className="space-y-1 mt-3">
                                {(block.content?.bullets ?? []).map((bullet: string, bi: number) => (
                                  <li key={bi} className="flex items-start gap-2 text-[10px] font-mono text-zinc-600">
                                    <span className="text-[#002FA7] mt-0.5 shrink-0">●</span>
                                    <span>{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        {block.type === 'MARKET_BREADCRUMB' && (
                          <div className="border border-zinc-200 bg-white overflow-hidden shadow-sm">
                            <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-100 flex justify-between items-center">
                              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">
                                Source: {block.content?.source ?? 'GridMonitor_Intelligence'}
                              </span>
                              <span className="text-[9px] font-mono text-[#002FA7] font-bold">
                                [ {block.content?.impactLevel ?? 'HIGH_VOLATILITY'} ]
                              </span>
                            </div>
                            <div className="p-4 space-y-3">
                              <h4 className="text-sm font-bold text-zinc-900 leading-tight uppercase font-mono">
                                {block.content?.headline ?? 'ERCOT_RESERVES_DROP_BELOW_3000MW'}
                              </h4>
                              {(block.content?.nodalAnalysis ?? '').trim() && (
                                <div className="bg-zinc-900 p-3 rounded-sm border-l-4 border-[#002FA7]">
                                  <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">
                                    Nodal_Architect_Analysis:
                                  </p>
                                  <p className="text-xs text-white leading-snug font-sans italic">
                                    &quot;{block.content.nodalAnalysis}&quot;
                                  </p>
                                </div>
                              )}
                              {block.content?.url && (
                                <a href={block.content.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-[#002FA7] underline uppercase tracking-tighter">
                                  [ VIEW_FULL_TRANSMISSION ]
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {/* Live signature (builder-only): Settings + hosted avatar, clickable links */}
              <div className="p-8 border-t border-zinc-100 bg-zinc-50 mt-auto">
                <div className="flex items-center gap-3">
                  {(profile?.hostedPhotoUrl || user?.photoURL) && (
                    <Image
                      src={profile?.hostedPhotoUrl || user?.photoURL || ''}
                      alt="Profile"
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-[12px] border border-zinc-200 object-cover shrink-0"
                    />
                  )}
                  <div>
                    <div className="font-sans font-bold text-zinc-900 text-sm">
                      {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.name || user?.displayName || '—'}
                    </div>
                    <div className="font-sans text-zinc-500 text-xs">
                      {profile?.jobTitle || '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 mb-3 font-mono text-[11px] text-zinc-600 flex flex-col gap-0.5">
                  {profile?.selectedPhoneNumber && <span>P: {profile.selectedPhoneNumber}</span>}
                  {(profile?.city || profile?.state) && (
                    <span className="text-[10px] text-zinc-500">
                      {[profile?.city, profile?.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
                <div className="flex gap-4 font-mono text-[10px] text-[#002FA7] font-bold uppercase tracking-widest">
                  <a href={profile?.linkedinUrl || 'https://linkedin.com/company/nodal-point'} target="_blank" rel="noopener noreferrer" className="hover:underline">LINKEDIN</a>
                  <a href="https://nodalpoint.io" target="_blank" rel="noopener noreferrer" className="hover:underline">NETWORK</a>
                  <a href="https://nodalpoint.io/bill-debugger" target="_blank" rel="noopener noreferrer" className="hover:underline">[ RUN_AUDIT ]</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
