'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Plus,
    Search,
    ArrowRight,
    Building2,
    Trash2,
    Clock,
    Check,
    AlertTriangle,
    ChevronRight,
    Target,
    Zap,
    DollarSign
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDeals, useCreateDeal } from '@/hooks/useDeals'
import { type DealStage, DEAL_STAGES } from '@/types/deals'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { cn } from '@/lib/utils'

interface AccountResult {
    id: string
    name: string
    logo_url?: string
    domain?: string
}

export function DealCreationPanel() {
    const { dealContext, rightPanelMode, setRightPanelMode, setDealContext } = useUIStore()
    const createDeal = useCreateDeal()

    const [step, setStep] = useState<'SELECT_ACCOUNT' | 'DEAL_DETAILS'>('SELECT_ACCOUNT')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<AccountResult[]>([])
    const [isSearching, setIsSearching] = useState(false)

    // Deal Form State
    const [title, setTitle] = useState('')
    const [stage, setStage] = useState<DealStage>('IDENTIFIED')
    const [amount, setAmount] = useState('')
    const [annualUsage, setAnnualUsage] = useState('')
    const [mills, setMills] = useState('')
    const [contractLength, setContractLength] = useState('')
    const [closeDate, setCloseDate] = useState('')
    const [probability, setProbability] = useState('50')
    const [yearlyCommission, setYearlyCommission] = useState('')
    const [isCommitting, setIsCommitting] = useState(false)

    // Auto-skip step 1 and resolve metadata if account context is provided
    useEffect(() => {
        if (dealContext?.accountId) {
            setStep('DEAL_DETAILS')

            // If we only have an ID, fetch the metadata
            if (!dealContext.accountName) {
                const fetchMeta = async () => {
                    const { data } = await supabase
                        .from('accounts')
                        .select('name, logo_url, domain')
                        .eq('id', dealContext.accountId)
                        .single()

                    if (data) {
                        setDealContext({
                            ...dealContext,
                            accountName: data.name,
                            accountLogoUrl: data.logo_url,
                            accountDomain: data.domain
                        })
                        if (!title) setTitle(`${data.name} - New Opportunity`)
                    }
                }
                fetchMeta()
            } else if (!title) {
                setTitle(`${dealContext.accountName} - New Opportunity`)
            }
        } else {
            setStep('SELECT_ACCOUNT')
        }
    }, [dealContext?.accountId])

    // Internal Account Search
    useEffect(() => {
        if (!searchQuery || searchQuery.length < 2) {
            setSearchResults([])
            return
        }

        const timer = setTimeout(async () => {
            setIsSearching(true)
            try {
                const { data } = await supabase
                    .from('accounts')
                    .select('id, name, logo_url, domain')
                    .ilike('name', `%${searchQuery}%`)
                    .limit(5)
                setSearchResults((data as any[]) || [])
            } catch (e) {
                console.error('Search error:', e)
            } finally {
                setIsSearching(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    const handleSelectAccount = (account: AccountResult) => {
        setDealContext({
            accountId: account.id,
            accountName: account.name,
            accountLogoUrl: account.logo_url,
            accountDomain: account.domain
        })
        setStep('DEAL_DETAILS')
        setTitle(`${account.name} - New Opportunity`)
    }

    const handleCommit = async () => {
        if (!dealContext?.accountId || !title.trim()) {
            toast.error('Title and Account are required')
            return
        }

        setIsCommitting(true)
        try {
            await createDeal.mutateAsync({
                title: title.trim(),
                accountId: dealContext.accountId,
                contactId: dealContext.contactId,
                stage: stage,
                amount: amount ? Number(amount) : undefined,
                annualUsage: annualUsage ? Number(annualUsage) : undefined,
                mills: mills ? Number(mills) : undefined,
                contractLength: contractLength ? Number(contractLength) : undefined,
                closeDate: closeDate || undefined,
                probability: probability ? Number(probability) : undefined,
                yearlyCommission: yearlyCommission ? Number(yearlyCommission) : undefined,
            })

            toast.success('CONTRACT_INITIALIZED // VECTOR_LOCKED')
            handleClose()
        } catch (error: any) {
            toast.error(error.message || 'System error during initialization')
        } finally {
            setIsCommitting(false)
        }
    }

    const handleClose = () => {
        setRightPanelMode('DEFAULT')
        setDealContext(null)
        // Reset internal state
        setStep('SELECT_ACCOUNT')
        setSearchQuery('')
        setTitle('')
        setAmount('')
        setAnnualUsage('')
        setMills('')
        setContractLength('')
        setCloseDate('')
        setYearlyCommission('')
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
            className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden"
        >
            {/* HEADER */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 nodal-recessed">
                <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#002FA7]" />
                    <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
                        INITIALIZE_CONTRACT_VECTOR
                    </span>
                </div>
                <button onClick={handleClose} className="text-zinc-500 hover:text-white text-[10px] font-mono tracking-wider transition-colors">
                    [ ESC ]
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 custom-scrollbar space-y-8">
                <AnimatePresence mode="wait">
                    {step === 'SELECT_ACCOUNT' ? (
                        <motion.div
                            key="select-account"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            <div className="space-y-4">
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                                    Select_Target_Node
                                </div>

                                <div className="relative group">
                                    <Input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="> SEARCH_ACCOUNTS..."
                                        className="w-full h-12 bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 rounded-xl transition-all pl-10"
                                        autoFocus
                                    />
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-[#002FA7] transition-colors" />
                                    {isSearching && (
                                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                            <div className="w-3 h-3 border-2 border-zinc-700 border-t-[#002FA7] rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {searchResults.map((account) => (
                                        <button
                                            key={account.id}
                                            onClick={() => handleSelectAccount(account)}
                                            className="w-full text-left bg-zinc-900/40 border border-white/5 hover:border-[#002FA7]/50 rounded-xl p-3 transition-all hover:bg-zinc-900/60 group flex items-center gap-3"
                                        >
                                            <CompanyIcon
                                                logoUrl={account.logo_url}
                                                domain={account.domain}
                                                name={account.name}
                                                size={32}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
                                                    {account.name}
                                                </div>
                                                <div className="text-[10px] font-mono text-zinc-600 truncate uppercase tracking-wider">
                                                    {account.domain || 'NO DOMAIN'}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-[#002FA7] transition-colors" />
                                        </button>
                                    ))}

                                    {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                                        <div className="py-8 text-center">
                                            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">No matching nodes found</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="deal-details"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            {/* NODE CONTEXT */}
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                                    Target_Node_Context
                                    <button
                                        onClick={() => setStep('SELECT_ACCOUNT')}
                                        className="ml-auto text-zinc-600 hover:text-zinc-400 text-[10px] font-mono lowercase tracking-wider hover:underline"
                                    >
                                        [ change ]
                                    </button>
                                </div>
                                <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center gap-4">
                                    <CompanyIcon
                                        logoUrl={dealContext?.accountLogoUrl}
                                        domain={dealContext?.accountDomain}
                                        name={dealContext?.accountName || 'Account'}
                                        size={40}
                                    />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Linked Account</span>
                                        <span className="text-sm font-semibold text-white truncate">{dealContext?.accountName || 'Unlabeled Node'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* CORE INFO */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Core_Vector_Data</div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Contract Title</label>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g. Q3 Energy Procurement"
                                        className="bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] transition-all rounded-xl h-11"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Vector_Phase</label>
                                        <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                                            <SelectTrigger className="h-11 bg-black/40 border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-300 rounded-xl focus:ring-[#002FA7]/50 focus:border-[#002FA7]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-950 border-white/10">
                                                {DEAL_STAGES.map((s) => (
                                                    <SelectItem key={s} value={s} className="text-[10px] font-mono uppercase tracking-widest text-zinc-300 focus:bg-[#002FA7]/10">
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Probability (%)</label>
                                        <div className="flex items-center gap-3">
                                            <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={probability}
                                                onChange={(e) => setProbability(e.target.value)}
                                                className="bg-black/40 border-white/5 text-sm font-mono text-white text-center rounded-xl h-11"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* FINANCIALS */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Financial_Payload</div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <DollarSign className="w-3 h-3" /> Est_Annual_Value
                                        </label>
                                        <Input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0"
                                            className="bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] transition-all rounded-xl h-11"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <Zap className="w-3 h-3" /> Est_Annual_Usage
                                        </label>
                                        <Input
                                            type="number"
                                            value={annualUsage}
                                            onChange={(e) => setAnnualUsage(e.target.value)}
                                            placeholder="0"
                                            className="bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] transition-all rounded-xl h-11"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Margin_Mills</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={mills}
                                            onChange={(e) => setMills(e.target.value)}
                                            placeholder="0.00"
                                            className="bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] transition-all rounded-xl h-11"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <DollarSign className="w-3 h-3" /> Commission_Est
                                        </label>
                                        <Input
                                            type="number"
                                            value={yearlyCommission}
                                            onChange={(e) => setYearlyCommission(e.target.value)}
                                            placeholder="0"
                                            className="bg-black/40 border-white/5 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] transition-all rounded-xl h-11"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Term (Months)</label>
                                    <Select value={contractLength} onValueChange={setContractLength}>
                                        <SelectTrigger className="h-11 bg-black/40 border-white/5 text-sm font-mono text-zinc-300 rounded-xl focus:ring-[#002FA7]/50 focus:border-[#002FA7]">
                                            <SelectValue placeholder="LENGTH" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-white/10">
                                            {['12', '24', '36', '48', '60'].map((m) => (
                                                <SelectItem key={m} value={m} className="text-sm font-mono text-zinc-300 focus:bg-[#002FA7]/10">
                                                    {m} MO
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* TEMPORAL */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Temporal_Anchor
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Expected_Close_Date</label>
                                    <Input
                                        type="date"
                                        value={closeDate}
                                        onChange={(e) => setCloseDate(e.target.value)}
                                        className="bg-black/40 border-white/5 text-sm font-mono text-white focus:border-[#002FA7] transition-all rounded-xl h-11"
                                    />
                                </div>
                            </div>

                            {/* ACTION */}
                            <div className="pt-4">
                                <Button
                                    onClick={handleCommit}
                                    disabled={isCommitting || !title.trim() || !dealContext?.accountId}
                                    className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                                >
                                    {isCommitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                            INITIATING...
                                        </>
                                    ) : (
                                        '[ INITIATE_CONTRACT ]'
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}
