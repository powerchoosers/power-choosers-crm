'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Clock,
    Check,
    AlertTriangle,
    ChevronRight,
    Target,
    Zap,
    DollarSign,
    FileText,
    SlidersHorizontal,
    Search,
    Building2,
    Trash2,
    ArrowRight,
    TrendingUp,
    Sparkles
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateDeal, useUpdateDeal } from '@/hooks/useDeals'
import { type DealStage, DEAL_STAGES } from '@/types/deals'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { cn } from '@/lib/utils'
import { millOptions, formatMillValue, millDecimal } from '@/lib/mills'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'

interface AccountResult {
    id: string
    name: string
    logo_url?: string
    domain?: string
}

export function DealCreationPanel() {
    const { dealContext, rightPanelMode, setRightPanelMode, setDealContext } = useUIStore()
    const { role } = useAuth()
    const createDeal = useCreateDeal()
    const updateDeal = useUpdateDeal()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<'SELECT_ACCOUNT' | 'DEAL_DETAILS'>(
        () => (dealContext?.accountId ? 'DEAL_DETAILS' : 'SELECT_ACCOUNT')
    )
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<AccountResult[]>([])
    const [isSearching, setIsSearching] = useState(false)

    // Deal Form State
    const [title, setTitle] = useState('')
    const [stage, setStage] = useState<DealStage>('IDENTIFIED')
    const [amount, setAmount] = useState('')
    const [annualUsage, setAnnualUsage] = useState('')
    const [sellRate, setSellRate] = useState('')
    const [mills, setMills] = useState('')
    const [contractLength, setContractLength] = useState('')
    const [closeDate, setCloseDate] = useState('')
    const [probability, setProbability] = useState('50')
    const [isCommitting, setIsCommitting] = useState(false)

    const isEditMode = dealContext?.mode === 'edit' && !!dealContext?.dealId
    const commissionRate = role === 'admin' ? 0.7 : 0.5
    const commissionLabel = role === 'admin' ? 'Admin' : 'Agent'
    
    const payoutCommissionPreview = useMemo(() => {
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) return ''
        return (value * commissionRate).toFixed(2)
    }, [amount, commissionRate])

    const recalcAmountFromUsageAndMills = useCallback((usageValue: string, millsValue: string) => {
        const usageNum = Number(usageValue.replace(/[^0-9]/g, '')) || 0
        const millsDecimalValue = millDecimal(millsValue)
        if (Number.isFinite(usageNum) && usageNum > 0 && millsDecimalValue > 0) {
            const calculatedAmount = usageNum * millsDecimalValue
            setAmount(calculatedAmount.toFixed(2))
        }
    }, [])

    // Auto-skip step 1 and resolve metadata if account context is provided
    useEffect(() => {
        if (dealContext?.accountId) {
            setStep('DEAL_DETAILS')

            if (isEditMode) {
                setTitle(dealContext.defaultTitle || '')
                setStage(dealContext.stage || 'IDENTIFIED')
                setAmount(dealContext.amount?.toString() || '')
                setAnnualUsage(
                    typeof dealContext.annualUsage === 'number'
                        ? Math.trunc(dealContext.annualUsage).toLocaleString()
                        : ''
                )
                const existingSellRate =
                    typeof dealContext.sellRate === 'number'
                        ? dealContext.sellRate
                        : Number((dealContext.metadata as any)?.sellRate)
                setSellRate(Number.isFinite(existingSellRate) ? String(existingSellRate) : '')
                setMills(formatMillValue(dealContext.mills))
                setContractLength(dealContext.contractLength?.toString() || '')
                setCloseDate(dealContext.closeDate ? dealContext.closeDate.slice(0, 10) : '')
                setProbability(dealContext.probability?.toString() || '50')

                // Edit-mode can be opened from several surfaces; some only provide accountId.
                if (!dealContext.accountName || !dealContext.accountLogoUrl || !dealContext.accountDomain) {
                    const hydrateAccountContext = async () => {
                        const { data } = await supabase
                            .from('accounts')
                            .select('name, logo_url, domain')
                            .eq('id', dealContext.accountId)
                            .single()

                        if (data) {
                            setDealContext({
                                ...dealContext,
                                accountName: dealContext.accountName || data.name,
                                accountLogoUrl: dealContext.accountLogoUrl || data.logo_url,
                                accountDomain: dealContext.accountDomain || data.domain,
                            })
                        }
                    }
                    hydrateAccountContext()
                }
                return
            }

            // If we only have an ID, fetch the metadata
            if (!dealContext.accountName) {
                const fetchMeta = async () => {
                    const { data } = await supabase
                        .from('accounts')
                        .select('name, logo_url, domain, annual_usage, contract_end_date, current_rate, metadata')
                        .eq('id', dealContext.accountId)
                        .single()

                    if (data) {
                        setDealContext({
                            ...dealContext,
                            accountName: data.name,
                            accountLogoUrl: data.logo_url,
                            accountDomain: data.domain
                        })
                        if (!title) setTitle(dealContext.defaultTitle || `${data.name} - New Opportunity`)
                        if (!annualUsage && data.annual_usage) setAnnualUsage(parseInt(data.annual_usage).toLocaleString())
                        if (!closeDate && data.contract_end_date) setCloseDate(data.contract_end_date.slice(0, 10))
                        if (!sellRate && data.current_rate) setSellRate(String(data.current_rate))
                        if (!mills) {
                            const dbMills = data.metadata?.mills
                            setMills(formatMillValue(dbMills ?? 10))
                        }
                    }
                }
                fetchMeta()
            } else if (!title) {
                setTitle(dealContext.defaultTitle || `${dealContext.accountName} - New Opportunity`)
                const fillForm = async () => {
                    const { data } = await supabase
                        .from('accounts')
                        .select('annual_usage, contract_end_date, current_rate, metadata')
                        .eq('id', dealContext.accountId)
                        .single()
                    if (data) {
                        if (!annualUsage && data.annual_usage) setAnnualUsage(parseInt(data.annual_usage).toLocaleString())
                        if (!closeDate && data.contract_end_date) setCloseDate(data.contract_end_date.slice(0, 10))
                        if (!sellRate && data.current_rate) setSellRate(String(data.current_rate))
                        if (!mills) {
                            const dbMills = data.metadata?.mills
                            setMills(formatMillValue(dbMills ?? 10))
                        }
                    }
                }
                fillForm()
            }
        } else {
            setStep('SELECT_ACCOUNT')
        }
    }, [dealContext?.accountId, dealContext?.dealId, isEditMode])

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
        setTitle(dealContext?.defaultTitle || `${account.name} - New Opportunity`)
    }

    const handleClose = useCallback(() => {
        setRightPanelMode('DEFAULT')
        setDealContext(null)
        setStep('SELECT_ACCOUNT')
        setSearchQuery('')
        setTitle('')
        setStage('IDENTIFIED')
        setAmount('')
        setAnnualUsage('')
        setSellRate('')
        setMills('')
        setContractLength('')
        setCloseDate('')
        setProbability('50')
    }, [setDealContext, setRightPanelMode])

    useEscClose(handleClose)

    const handleCommit = async () => {
        if (!dealContext?.accountId || !title.trim()) {
            toast.error('Title and Account are required')
            return
        }

        setIsCommitting(true)
        try {
            const amountNum = amount ? Number(amount) : undefined
            const annualUsageNum = annualUsage ? Number(annualUsage.replace(/[^0-9.-]+/g, "")) : undefined
            const millsNum = mills ? Number(mills) : undefined
            const contractLengthNum = contractLength ? Number(contractLength) : undefined
            const probabilityNum = probability ? Number(probability) : undefined
            const sellRateNum = sellRate ? Number(sellRate) : undefined
            const computedCommission =
                typeof amountNum === 'number' && Number.isFinite(amountNum)
                    ? Number((amountNum * commissionRate).toFixed(2))
                    : undefined
            const nextMetadata = {
                ...(dealContext?.metadata || {}),
                ...(typeof sellRateNum === 'number' && Number.isFinite(sellRateNum)
                    ? { sellRate: sellRateNum }
                    : {}),
            }

            if (isEditMode && dealContext.dealId) {
                await updateDeal.mutateAsync({
                    id: dealContext.dealId,
                    title: title.trim(),
                    accountId: dealContext.accountId,
                    contactId: dealContext.contactId || undefined,
                    stage,
                    amount: amountNum,
                    annualUsage: annualUsageNum,
                    mills: millsNum,
                    contractLength: contractLengthNum,
                    closeDate: closeDate || undefined,
                    probability: probabilityNum,
                    yearlyCommission: computedCommission,
                    metadata: nextMetadata,
                })
            } else {
                await createDeal.mutateAsync({
                    title: title.trim(),
                    accountId: dealContext.accountId,
                    contactId: dealContext.contactId,
                    stage: stage,
                    amount: amountNum,
                    annualUsage: annualUsageNum,
                    mills: millsNum,
                    contractLength: contractLengthNum,
                    closeDate: closeDate || undefined,
                    probability: probabilityNum,
                    yearlyCommission: computedCommission,
                    metadata: nextMetadata,
                })
                toast.success('CONTRACT_INITIALIZED // VECTOR_LOCKED')
            }
            handleClose()
        } catch (error: any) {
            toast.error(error.message || (isEditMode ? 'System error during update' : 'System error during initialization'))
        } finally {
            setIsCommitting(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
            className={panelTheme.shell}
        >
            {/* HEADER */}
            <div className={panelTheme.header}>
                <div className={panelTheme.headerTitleWrap}>
                    <Target className="w-4 h-4 text-[#002FA7]" />
                    <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
                        INITIALIZE_CONTRACT_VECTOR
                    </span>
                </div>
                <ForensicClose onClick={handleClose} size={16} />
            </div>

            <div className={`${panelTheme.body} space-y-8`}>
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
                                        className={`${panelTheme.field} pl-10`}
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
                                        className={panelTheme.field}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Vector_Phase</label>
                                        <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                                            <SelectTrigger className={`${panelTheme.selectTrigger} text-[10px] uppercase tracking-widest`}>
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
                                                className={`${panelTheme.field} text-center`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* FINANCIALS */}
                            <div className="space-y-5">
                                <div className="rounded-2xl nodal-glass border border-white/5 p-5 space-y-5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                                            Financial Payload
                                        </span>
                                        <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-400">
                                            Live preview
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                                <Zap className="w-3 h-3 inline" /> Annual Usage
                                            </label>
                                            <Input
                                                type="text"
                                                value={annualUsage}
                                                onChange={(e) => {
                                                    const cleaned = e.target.value.replace(/[^0-9]/g, '')
                                                    if (!cleaned) {
                                                        setAnnualUsage('')
                                                        return
                                                    }
                                                    const usageCommas = parseInt(cleaned).toLocaleString()
                                                    setAnnualUsage(usageCommas)
                                                    recalcAmountFromUsageAndMills(usageCommas, mills)
                                                }}
                                                placeholder="0"
                                                className={panelTheme.field}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                                <Clock className="w-3 h-3 inline" /> Term
                                            </label>
                                            <Select value={contractLength} onValueChange={setContractLength}>
                                                <SelectTrigger className={panelTheme.selectTrigger}>
                                                    <SelectValue placeholder="Length" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-950 border-white/10">
                                                    {['12', '24', '36', '48', '60'].map((m) => (
                                                        <SelectItem key={m} value={m} className="text-sm font-mono text-zinc-300 focus:bg-[#002FA7]/10">
                                                            {m} months
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                                <FileText className="w-3 h-3 inline" /> Sell Rate
                                            </label>
                                            <div className="relative">
                                                <Input
                                                    type="text"
                                                    value={sellRate}
                                                    onChange={(e) => {
                                                        const cleaned = e.target.value
                                                            .replace(/[^0-9.]/g, '')
                                                            .replace(/(\..*)\./g, '$1')
                                                        setSellRate(cleaned)
                                                    }}
                                                    placeholder="8.70"
                                                    className={`${panelTheme.field} pr-12`}
                                                />
                                                <span className="absolute inset-y-0 right-3 flex items-center text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                                                    ¢/kWh
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                                <SlidersHorizontal className="w-3 h-3 inline" /> Margin Mills
                                            </label>
                                            <Select
                                                value={mills}
                                                onValueChange={(value) => {
                                                    setMills(value)
                                                    recalcAmountFromUsageAndMills(annualUsage, value)
                                                }}
                                            >
                                                <SelectTrigger className={panelTheme.selectTrigger}>
                                                    <SelectValue placeholder="Select mills" />
                                                </SelectTrigger>
                                                <SelectContent position="popper" className="bg-zinc-950 border-white/10 max-h-36">
                                                    {millOptions.map((option) => (
                                                        <SelectItem
                                                            key={option}
                                                            value={option}
                                                            className="text-sm font-mono text-zinc-300 focus:bg-[#002FA7]/10"
                                                        >
                                                            {option}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                            <DollarSign className="w-3 h-3 inline" /> {commissionLabel} Commission ({Math.round(commissionRate * 100)}%)
                                        </label>
                                        <div className="bg-black/30 border border-white/10 text-sm font-mono text-white rounded-xl h-9 flex items-center justify-center">
                                            {payoutCommissionPreview || '0.00'}
                                        </div>
                                        <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                                            Auto-updates on save
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl nodal-glass border border-white/5 p-5 space-y-6">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-zinc-500" />
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                            Temporal Anchor
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                            Expected Close Date
                                        </label>
                                        <Input
                                            type="date"
                                            value={closeDate}
                                            onChange={(e) => setCloseDate(e.target.value)}
                                            className={panelTheme.field}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ACTION */}
                            <div className="pt-4">
                                <Button
                                    onClick={handleCommit}
                                    disabled={isCommitting || !title.trim() || !dealContext?.accountId}
                                    className={panelTheme.cta}
                                >
                                    {isCommitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                            {isEditMode ? 'UPDATING...' : 'INITIATING...'}
                                        </>
                                    ) : (
                                        isEditMode ? 'EDIT CONTRACT' : 'INITIATE CONTRACT'
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
