import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useAccountContacts } from '@/hooks/useContacts'
import { useAccountCalls } from '@/hooks/useCalls'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks, useAllPendingTasks } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { toast } from 'sonner'
import { parseISO, isValid } from 'date-fns'

function parseContractEndDate(raw: unknown): Date | null {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null
    const iso = parseISO(s)
    if (isValid(iso)) return iso
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdy) {
        const mm = Number(mdy[1])
        const dd = Number(mdy[2])
        const yyyy = Number(mdy[3])
        const d = new Date(yyyy, mm - 1, dd)
        return isValid(d) ? d : null
    }
    const fallback = new Date(s)
    return isValid(fallback) ? fallback : null
}

function clamp01(n: number) {
    if (n < 0) return 0
    if (n > 1) return 1
    return n
}

export function useAccountDossierState(id: string) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const { data: account, isLoading, isFetched } = useAccount(id)
    const { data: contacts, isLoading: isLoadingContacts } = useAccountContacts(id)
    const contactIds = contacts?.map(c => c.id).filter(Boolean) || []
    const { data: calls, isLoading: isLoadingCalls } = useAccountCalls(id, contactIds)
    const updateAccount = useUpdateAccount()

    const { isEditing, setIsEditing, toggleEditing, lastEnrichedAccountId, setRightPanelMode, setIngestionContext } = useUIStore()
    const setContext = useGeminiStore((state) => state.setContext)

    const [isSaving, setIsSaving] = useState(false)
    const [showSynced, setShowSynced] = useState(false)
    const [activeEditField, setActiveEditField] = useState<'logo' | 'domain' | 'linkedin' | null>(null)

    const [editAccountName, setEditAccountName] = useState('')
    const [editNotes, setEditNotes] = useState('')
    const [editAnnualUsage, setEditAnnualUsage] = useState('')
    const [editStrikePrice, setEditStrikePrice] = useState('')
    const [editIndustry, setEditIndustry] = useState('')
    const [editLocation, setEditLocation] = useState('')
    const [editLogoUrl, setEditLogoUrl] = useState('')
    const [editSupplier, setEditSupplier] = useState('')
    const [editDomain, setEditDomain] = useState('')
    const [editLinkedinUrl, setEditLinkedinUrl] = useState('')
    const [editMeters, setEditMeters] = useState<any[]>([])
    const [editContractEnd, setEditContractEnd] = useState('')
    const [editCompanyPhone, setEditCompanyPhone] = useState('')
    const [editAddress, setEditAddress] = useState('')

    const [recentlyUpdatedFields, setRecentlyUpdatedFields] = useState<Set<string>>(new Set())
    const [glowingFields, setGlowingFields] = useState<Set<string>>(new Set())
    const [isRecalibrating, setIsRecalibrating] = useState(false)
    const prevAccountRef = useRef<any>(undefined)
    const prevIsEditing = useRef(isEditing)
    const justIngestedRef = useRef(false)

    const { pendingTasks } = useEntityTasks(id, account?.name)
    const { data: allPendingData } = useAllPendingTasks()
    const allPendingTasks = allPendingData?.allPendingTasks ?? []
    const globalTotal = allPendingData?.totalCount ?? 0
    const { updateTask } = useTasks()
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0)

    const hasTasks = pendingTasks.length > 0
    const displayTaskIndex = Math.min(currentTaskIndex, Math.max(0, pendingTasks.length - 1))
    const currentTask = pendingTasks[displayTaskIndex]
    const globalIndex = currentTask ? allPendingTasks.findIndex((t) => String(t.id) === String(currentTask.id)) : -1
    const globalPosition = globalIndex >= 0 ? globalIndex + 1 : 0
    const useGlobalPagination = globalIndex >= 0 && globalTotal > 0

    useEffect(() => {
        if (account && !isEditing) {
            setEditAccountName(account.name || '')
            setEditNotes(account.description || '')
            setEditAnnualUsage(account.annualUsage?.toString() || '')
            setEditStrikePrice(account.currentRate || '')
            setEditIndustry(account.industry || '')
            setEditLocation(account.location || '')
            setEditLogoUrl(account.logoUrl || '')
            setEditSupplier(account.electricitySupplier || '')
            setEditDomain(account.domain || '')
            setEditLinkedinUrl(account.linkedinUrl || '')
            setEditCompanyPhone(account.companyPhone || '')
            setEditAddress(account.address || '')

            const transformedMeters = (account.serviceAddresses || []).map((addr: any, idx: number) => {
                if (typeof addr === 'string') {
                    return {
                        id: `addr_${idx}`,
                        esiId: '',
                        address: addr,
                        rate: account.currentRate || '',
                        endDate: account.contractEnd || ''
                    }
                }
                return { ...addr, id: addr?.id ?? `meter_${idx}` }
            })
            setEditMeters(account.meters?.length ? account.meters : transformedMeters)
            setEditContractEnd(account.contractEnd || '')
        }
    }, [account, isEditing])

    useEffect(() => {
        if (prevIsEditing.current === isEditing) return
        const wasEditing = prevIsEditing.current
        prevIsEditing.current = isEditing

        if (wasEditing && !isEditing) {
            const triggerSave = async () => {
                setIsSaving(true)
                try {
                    const cleanedUsage = parseInt(editAnnualUsage.replace(/[^0-9]/g, '')) || 0
                    await updateAccount.mutateAsync({
                        id,
                        name: editAccountName,
                        description: editNotes,
                        annualUsage: cleanedUsage.toString(),
                        currentRate: editStrikePrice,
                        industry: editIndustry,
                        location: editLocation,
                        logoUrl: editLogoUrl,
                        electricitySupplier: editSupplier,
                        domain: editDomain,
                        linkedinUrl: editLinkedinUrl,
                        meters: editMeters,
                        contractEnd: editContractEnd,
                        companyPhone: editCompanyPhone,
                        address: editAddress
                    })
                    setShowSynced(true)
                    setTimeout(() => setShowSynced(false), 3000)
                    toast.success('System Synced')
                } catch (err: any) {
                    toast.error(`Sync failed: ${err?.message || 'Unknown error'}`)
                } finally {
                    setIsSaving(false)
                }
            }
            triggerSave()
        }
    }, [isEditing, id, editAccountName, editNotes, editAnnualUsage, editStrikePrice, editIndustry, editLocation, editLogoUrl, editSupplier, editDomain, editLinkedinUrl, editMeters, editContractEnd, editCompanyPhone, editAddress, updateAccount])

    useEffect(() => {
        if (account) {
            setContext({
                type: 'account',
                id: account.id,
                label: `${account.name?.toUpperCase() || 'UNKNOWN ACCOUNT'}`,
                data: {
                    ...account,
                    revenue: account.revenue || account.metadata?.revenue || account.metadata?.annual_revenue,
                    employees: account.employees || account.metadata?.employees || account.metadata?.employee_count,
                    industry: account.industry || account.metadata?.industry,
                    description: account.description || account.metadata?.description || account.metadata?.general?.description,
                    service_addresses: account.serviceAddresses || account.metadata?.service_addresses || [],
                    annual_usage: account.annualUsage || account.metadata?.annual_usage,
                    current_rate: account.currentRate || account.metadata?.current_rate,
                    contract_end_date: account.contractEnd || account.metadata?.contract_end_date,
                    electricity_supplier: account.electricitySupplier || account.metadata?.electricity_supplier,
                } as any
            })
        }
        return () => setContext(null)
    }, [account, setContext])

    useEffect(() => {
        setCurrentTaskIndex((prev) => Math.min(prev, Math.max(0, pendingTasks.length - 1)))
    }, [pendingTasks.length])

    const navigateToTaskDossier = (task: any) => {
        const cid = (task.contactId != null && String(task.contactId).trim() !== '') ? String(task.contactId).trim() : undefined
        const aid = (task.accountId != null && String(task.accountId).trim() !== '') ? String(task.accountId).trim() : undefined
        if (cid) {
            router.push(`/network/contacts/${cid}?taskId=${encodeURIComponent(task.id)}`)
        } else if (aid) {
            router.push(`/network/accounts/${aid}?taskId=${encodeURIComponent(task.id)}`)
        }
    }

    const handlePrev = () => {
        if (globalIndex < 0) {
            setCurrentTaskIndex((p) => Math.max(0, p - 1))
            return
        }
        if (globalIndex <= 0) return
        let prevIdx = globalIndex - 1
        const prevTask = allPendingTasks[prevIdx]
        if (prevTask) navigateToTaskDossier(prevTask)
    }

    const handleNext = () => {
        if (globalIndex < 0) {
            setCurrentTaskIndex((p) => Math.min(pendingTasks.length - 1, p + 1))
            return
        }
        if (globalIndex >= allPendingTasks.length - 1) return
        const nextTask = allPendingTasks[globalIndex + 1]
        if (nextTask) navigateToTaskDossier(nextTask)
    }

    const handleCompleteAndAdvance = () => {
        const task = pendingTasks[displayTaskIndex]
        if (!task) return
        updateTask({ id: task.id, status: 'Completed' })
        if (globalIndex >= 0 && globalIndex + 1 < allPendingTasks.length) {
            navigateToTaskDossier(allPendingTasks[globalIndex + 1])
        }
    }

    const contractEndDate = useMemo(() => parseContractEndDate(editContractEnd || account?.contractEnd), [editContractEnd, account?.contractEnd])
    const daysRemaining = contractEndDate ? Math.round((contractEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null
    const maturityPct = useMemo(() => {
        if (daysRemaining == null) return 0
        return clamp01(1 - daysRemaining / 365)
    }, [daysRemaining])

    const maturityColor = useMemo(() => {
        if (daysRemaining == null) return 'bg-zinc-700'
        if (daysRemaining < 90) return 'bg-red-500'
        if (daysRemaining < 180) return 'bg-yellow-500'
        return 'bg-[#002FA7]'
    }, [daysRemaining])

    const handleIngestionComplete = () => {
        justIngestedRef.current = true
        setTimeout(() => { justIngestedRef.current = false }, 2500)
        setIsRecalibrating(true)
        setGlowingFields(new Set(['contractEnd', 'daysRemaining', 'currentSupplier', 'strikePrice', 'annualVolume', 'revenue']))
        setTimeout(() => {
            setIsRecalibrating(false)
            setGlowingFields(new Set())
        }, 1500)
    }

    useEffect(() => {
        if (!account) return
        const fromEnrich = lastEnrichedAccountId === account.id
        if (!justIngestedRef.current && !isRecalibrating && !fromEnrich) {
            prevAccountRef.current = account
            return
        }
        const changed = new Set<string>()
        if (prevAccountRef.current) {
            const prev = prevAccountRef.current
            if (prev.contractEnd !== account.contractEnd) changed.add('contractEnd')
            if (prev.electricitySupplier !== account.electricitySupplier) changed.add('currentSupplier')
            if (prev.currentRate !== account.currentRate) changed.add('strikePrice')
            if (prev.annualUsage !== account.annualUsage) changed.add('annualVolume')
            if (prev.industry !== account.industry) changed.add('industry')
            if (prev.location !== account.location) changed.add('location')
            if (prev.logoUrl !== account.logoUrl) changed.add('logoUrl')
            if (prev.description !== account.description) changed.add('description')
        }
        prevAccountRef.current = account
        if (changed.size) {
            setRecentlyUpdatedFields(changed)
            setTimeout(() => setRecentlyUpdatedFields(new Set()), 1600)
        }
    }, [account, isRecalibrating, lastEnrichedAccountId])

    return {
        id, account, contacts, calls, isLoading: isLoading || (!!id && account == null && !isFetched),
        isLoadingContacts, isLoadingCalls, isFetched,
        isEditing, toggleEditing, isSaving, showSynced, setActiveEditField, activeEditField,
        recentlyUpdatedFields, glowingFields, isRecalibrating,
        editAccountName, setEditAccountName, editNotes, setEditNotes, editAnnualUsage, setEditAnnualUsage,
        editStrikePrice, setEditStrikePrice, editIndustry, setEditIndustry, editLocation, setEditLocation,
        editLogoUrl, setEditLogoUrl, editSupplier, setEditSupplier, editDomain, setEditDomain, editLinkedinUrl, setEditLinkedinUrl,
        editMeters, setEditMeters, editContractEnd, setEditContractEnd, editCompanyPhone, setEditCompanyPhone,
        editAddress, setEditAddress,
        pendingTasks, hasTasks, displayTaskIndex, globalTotal, globalPosition, useGlobalPagination,
        handlePrev, handleNext, handleCompleteAndAdvance,
        contractEndDate, daysRemaining, maturityPct, maturityColor, handleIngestionComplete,
        updateAccountMutation: updateAccount
    }
}
