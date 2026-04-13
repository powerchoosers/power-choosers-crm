import { useState, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useAccountContacts } from '@/hooks/useContacts'
import { useAccountCalls } from '@/hooks/useCalls'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks, useAllPendingTasks } from '@/hooks/useTasks'
import { useDeferredHydration } from '@/hooks/useDeferredHydration'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { buildProtocolContextFromTask } from '@/lib/protocol-context'
import { toast } from 'sonner'
import { parseISO, isValid } from 'date-fns'
import { formatMillValue } from '@/lib/mills'
import { isTodayOrOverdue } from '@/lib/task-date'

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

type AccountHierarchyContext = {
    parentAccountId: string | null
    parentCompanyName: string | null
    subsidiaryAccountIds: string[]
    subsidiaryCompanyNames: string[]
    organizationRole: 'parent' | 'subsidiary' | 'standalone'
    hierarchySummary: string
}

function toTrimmedString(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function toTrimmedStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
}

function parseAccountHierarchy(account: any): AccountHierarchyContext {
    const metadata = account?.metadata && typeof account.metadata === 'object'
        ? account.metadata as Record<string, unknown>
        : {}
    const relationships = metadata.relationships && typeof metadata.relationships === 'object'
        ? metadata.relationships as Record<string, unknown>
        : {}

    const parentAccountId = toTrimmedString(
        relationships.parentAccountId ??
        relationships.parentAccountID ??
        metadata.parentAccountId ??
        metadata.parent_company_id
    ) || null

    const parentCompanyName = toTrimmedString(
        relationships.parentCompanyName ??
        relationships.parentCompany ??
        metadata.parent_company_name ??
        metadata.parentCompanyName
    ) || null

    const subsidiaryAccountIds = toTrimmedStringArray(
        relationships.subsidiaryAccountIds ??
        metadata.subsidiaryAccountIds
    )

    const subsidiaryCompanyNames = toTrimmedStringArray(
        relationships.subsidiaryCompanies ??
        relationships.subsidiaryCompanyNames ??
        metadata.subsidiaryCompanies ??
        metadata.subsidiaryCompanyNames ??
        metadata.subsidiary_company_names
    )

    const organizationRole = parentAccountId
        ? 'subsidiary'
        : subsidiaryAccountIds.length > 0
            ? 'parent'
            : 'standalone'

    const hierarchySummary = [
        `Role: ${organizationRole}`,
        parentCompanyName ? `Parent company: ${parentCompanyName}` : null,
        parentAccountId && !parentCompanyName ? `Parent company id: ${parentAccountId}` : null,
        subsidiaryCompanyNames.length
            ? `Subsidiaries: ${subsidiaryCompanyNames.join('; ')}`
            : subsidiaryAccountIds.length
                ? `Subsidiaries: ${subsidiaryAccountIds.length} linked account(s)`
                : null,
    ].filter(Boolean).join(' | ')

    return {
        parentAccountId,
        parentCompanyName,
        subsidiaryAccountIds,
        subsidiaryCompanyNames,
        organizationRole,
        hierarchySummary,
    }
}

export function useAccountDossierState(id: string, taskIdFromUrl?: string | null) {
    const router = useRouter()

    const { data: account, isLoading, isFetched } = useAccount(id)
    const { data: contacts, isLoading: isLoadingContacts } = useAccountContacts(id)
    const contactIds = contacts?.map(c => c.id).filter(Boolean) || []
    const isSecondaryReady = useDeferredHydration(100)
    const { data: calls, isLoading: isLoadingCalls } = useAccountCalls(id, contactIds, account?.companyPhone, { enabled: isSecondaryReady })
    const updateAccount = useUpdateAccount()
    const queryClient = useQueryClient()

    const { isEditing, setIsEditing, toggleEditing, lastEnrichedAccountId, setRightPanelMode, setIngestionContext } = useUIStore()
    const setContext = useGeminiStore((state) => state.setContext)

    const [isSaving, setIsSaving] = useState(false)
    const [showSynced, setShowSynced] = useState(false)
    const [activeEditField, setActiveEditField] = useState<'logo' | 'domain' | 'linkedin' | null>(null)

    const [editAccountName, setEditAccountName] = useState('')
    const [editNotes, setEditNotes] = useState('')
    const [editAnnualUsage, setEditAnnualUsage] = useState('')
    const [editStrikePrice, setEditStrikePrice] = useState('')
    const [editMills, setEditMills] = useState('')
    const [editIndustry, setEditIndustry] = useState('')
    const [editLocation, setEditLocation] = useState('')
    const [editEmployees, setEditEmployees] = useState('')
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
    const prevEditingStateRef = useRef(isEditing)
    const suppressHydrationRef = useRef(false)
    const skipSaveOnNextLockRef = useRef(false)
    const justIngestedRef = useRef(false)

    const { pendingTasks } = useEntityTasks(id, account?.name, {
        accountId: id,
        includeContactIds: contactIds,
    })
    const { data: allPendingData } = useAllPendingTasks()
    const allPendingTasks = allPendingData?.allPendingTasks ?? []
    const { updateTaskAsync } = useTasks()
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
    const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set())
    const [isCompletingTask, setIsCompletingTask] = useState(false)

    const visiblePendingTasks = useMemo(
        () => pendingTasks.filter((task) => isTodayOrOverdue(task.dueDate) && !hiddenTaskIds.has(String(task.id))),
        [pendingTasks, hiddenTaskIds]
    )
    const visibleAllPendingTasks = useMemo(
        () => allPendingTasks.filter((task) => isTodayOrOverdue(task.dueDate) && !hiddenTaskIds.has(String(task.id))),
        [allPendingTasks, hiddenTaskIds]
    )
    const globalTotal = visibleAllPendingTasks.length
    const hasTasks = visiblePendingTasks.length > 0
    const displayTaskIndex = Math.min(currentTaskIndex, Math.max(0, visiblePendingTasks.length - 1))
    const currentTask = visiblePendingTasks[displayTaskIndex]
    const globalIndex = currentTask ? visibleAllPendingTasks.findIndex((t) => String(t.id) === String(currentTask.id)) : -1
    const globalPosition = globalIndex >= 0 ? globalIndex + 1 : 0
    const useGlobalPagination = globalIndex >= 0 && globalTotal > 0

    useEffect(() => {
        if (prevEditingStateRef.current && !isEditing) {
            suppressHydrationRef.current = true
        }
        prevEditingStateRef.current = isEditing
    }, [isEditing])

    useEffect(() => {
        if (account && !isEditing && !suppressHydrationRef.current) {
            setEditAccountName(account.name || '')
            setEditNotes(account.description || '')
            setEditAnnualUsage(account.annualUsage?.toString() || '')
            setEditStrikePrice(account.currentRate || '')
            setEditMills(formatMillValue(account.mills ?? account.metadata?.mills))
            setEditIndustry(account.industry || '')
            setEditLocation(account.location || '')
            setEditEmployees(account.employees?.toString() || '')
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
            if (skipSaveOnNextLockRef.current) {
                skipSaveOnNextLockRef.current = false
                suppressHydrationRef.current = false
                return
            }
            const triggerSave = async () => {
                setIsSaving(true)
                const cleanedUsage = parseInt(editAnnualUsage.replace(/[^0-9]/g, '')) || 0
                const changedFields = new Set<string>()
                if ((account?.name || '') !== (editAccountName || '')) changedFields.add('name')
                if ((account?.description || '') !== (editNotes || '')) changedFields.add('description')
                if ((account?.annualUsage || '') !== (cleanedUsage.toString() || '')) changedFields.add('annualVolume')
                if ((account?.currentRate || '') !== (editStrikePrice || '')) changedFields.add('strikePrice')
                if ((formatMillValue(account?.mills ?? account?.metadata?.mills) || '') !== (editMills || '')) changedFields.add('mills')
                if ((account?.industry || '') !== (editIndustry || '')) changedFields.add('industry')
                if ((account?.location || '') !== (editLocation || '')) changedFields.add('location')
                if ((account?.employees?.toString() || '') !== (editEmployees || '')) changedFields.add('employees')
                if ((account?.logoUrl || '') !== (editLogoUrl || '')) changedFields.add('logoUrl')
                if ((account?.electricitySupplier || '') !== (editSupplier || '')) changedFields.add('currentSupplier')
                if ((account?.domain || '') !== (editDomain || '')) changedFields.add('domain')
                if ((account?.linkedinUrl || '') !== (editLinkedinUrl || '')) changedFields.add('linkedin')
                if ((account?.contractEnd || '') !== (editContractEnd || '')) changedFields.add('contractEnd')
                if ((account?.companyPhone || '') !== (editCompanyPhone || '')) changedFields.add('companyPhone')
                if ((account?.address || '') !== (editAddress || '')) changedFields.add('address')

                if (changedFields.size) {
                    setRecentlyUpdatedFields(changedFields)
                }

                const previousAccountQueries = queryClient.getQueriesData({ queryKey: ['account', id] })
                queryClient.setQueriesData({ queryKey: ['account', id] }, (cached: any) => {
                    if (!cached || cached.id !== id) return cached
                    return {
                        ...cached,
                        name: editAccountName,
                        description: editNotes,
                        annualUsage: cleanedUsage.toString(),
                        currentRate: editStrikePrice,
                        mills: editMills,
                        industry: editIndustry,
                        location: editLocation,
                        employees: editEmployees,
                        logoUrl: editLogoUrl,
                        electricitySupplier: editSupplier,
                        domain: editDomain,
                        linkedinUrl: editLinkedinUrl,
                        meters: editMeters,
                        contractEnd: editContractEnd || null,
                        companyPhone: editCompanyPhone,
                        address: editAddress
                    }
                })

                try {
                    await updateAccount.mutateAsync({
                        id,
                        name: editAccountName,
                        description: editNotes,
                        annualUsage: cleanedUsage.toString(),
                        currentRate: editStrikePrice,
                        mills: editMills,
                        industry: editIndustry,
                        location: editLocation,
                        employees: editEmployees,
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
                    setTimeout(() => setRecentlyUpdatedFields(new Set()), 2000)
                    toast.success('System Synced')
                } catch (err: any) {
                    for (const [key, value] of previousAccountQueries) {
                        queryClient.setQueryData(key, value)
                    }
                    setRecentlyUpdatedFields(new Set())
                    toast.error(`Sync failed: ${err?.message || 'Unknown error'}`)
                } finally {
                    suppressHydrationRef.current = false
                    setIsSaving(false)
                }
            }
            triggerSave()
        }
    }, [isEditing, id, editAccountName, editNotes, editAnnualUsage, editStrikePrice, editMills, editIndustry, editLocation, editEmployees, editLogoUrl, editSupplier, editDomain, editLinkedinUrl, editMeters, editContractEnd, editCompanyPhone, editAddress, updateAccount])

    const lockWithoutSaving = () => {
        if (!isEditing) return
        skipSaveOnNextLockRef.current = true
        suppressHydrationRef.current = false
        setIsEditing(false)
    }

    useEffect(() => {
        return () => {
            if (!prevIsEditing.current) return
            skipSaveOnNextLockRef.current = true
            suppressHydrationRef.current = false
            setIsEditing(false)
        }
    }, [setIsEditing])

    useEffect(() => {
        if (account) {
            const hierarchy = parseAccountHierarchy(account)
            const decisionMakerId = account.primaryContactId || null
            setContext({
                type: 'account',
                id: account.id,
                label: `${account.name?.toUpperCase() || 'UNKNOWN ACCOUNT'}`,
                data: {
                    ...account,
                    decisionMakerId,
                    primaryContactId: decisionMakerId,
                    hierarchy,
                    parentAccountId: hierarchy.parentAccountId,
                    parentCompanyName: hierarchy.parentCompanyName,
                    subsidiaryAccountIds: hierarchy.subsidiaryAccountIds,
                    subsidiaryCompanyNames: hierarchy.subsidiaryCompanyNames,
                    organizationRole: hierarchy.organizationRole,
                    hierarchySummary: hierarchy.hierarchySummary,
                    revenue: account.revenue || account.metadata?.revenue || account.metadata?.annual_revenue,
                    employees: account.employees || account.metadata?.employees || account.metadata?.employee_count,
                    industry: account.industry || account.metadata?.industry,
                    description: account.description || account.metadata?.description || account.metadata?.general?.description,
                    service_addresses: account.serviceAddresses || account.metadata?.service_addresses || [],
                    annual_usage: account.annualUsage || account.metadata?.annual_usage,
                    current_rate: account.currentRate || account.metadata?.current_rate,
                    mills: formatMillValue(account.mills ?? account.metadata?.mills),
                    contract_end_date: account.contractEnd || account.metadata?.contract_end_date,
                    electricity_supplier: account.electricitySupplier || account.metadata?.electricity_supplier,
                } as any
            })
        }
        return () => setContext(null)
    }, [account, taskIdFromUrl, setContext])

    useEffect(() => {
        setCurrentTaskIndex((prev) => Math.min(prev, Math.max(0, visiblePendingTasks.length - 1)))
    }, [visiblePendingTasks.length])

    useEffect(() => {
        if (!taskIdFromUrl || !visiblePendingTasks.length) return
        const idx = visiblePendingTasks.findIndex((task) => String(task.id) === taskIdFromUrl)
        if (idx >= 0) setCurrentTaskIndex(idx)
    }, [taskIdFromUrl, visiblePendingTasks])

    useEffect(() => {
        if (!taskIdFromUrl) return
        const matchingTask = allPendingTasks.find((task) => String(task.id) === taskIdFromUrl)
        if (!matchingTask) return

        const hierarchy = parseAccountHierarchy(account)
        const protocolContext = buildProtocolContextFromTask(matchingTask, {
            targetAccountId: account?.id || undefined,
            targetAccountName: account?.name || undefined,
            targetContactId: account?.primaryContactId || undefined,
            targetContactName: account?.primaryContactId ? matchingTask.relatedTo || account?.name : undefined,
            decisionMakerId: account?.primaryContactId || undefined,
            parentAccountId: hierarchy.parentAccountId || undefined,
            parentCompanyName: hierarchy.parentCompanyName || undefined,
            subsidiaryAccountIds: hierarchy.subsidiaryAccountIds,
            subsidiaryCompanyNames: hierarchy.subsidiaryCompanyNames,
            organizationRole: hierarchy.organizationRole,
            hierarchySummary: hierarchy.hierarchySummary,
            taskId: taskIdFromUrl,
            taskTitle: matchingTask.title,
            taskPriority: matchingTask.priority,
            taskStatus: matchingTask.status,
        })

        if (!protocolContext) return
        setContext(protocolContext)
        return () => setContext(null)
    }, [taskIdFromUrl, allPendingTasks, account, setContext])

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
        const prevTask = visibleAllPendingTasks[prevIdx]
        if (prevTask) navigateToTaskDossier(prevTask)
    }

    const handleNext = () => {
        if (globalIndex < 0) {
            setCurrentTaskIndex((p) => Math.min(visiblePendingTasks.length - 1, p + 1))
            return
        }
        if (globalIndex >= visibleAllPendingTasks.length - 1) return
        const nextTask = visibleAllPendingTasks[globalIndex + 1]
        if (nextTask) navigateToTaskDossier(nextTask)
    }

    const handleCompleteAndAdvance = async () => {
        const task = visiblePendingTasks[displayTaskIndex]
        if (!task || isCompletingTask) return

        const taskId = String(task.id)
        const nextTask = globalIndex >= 0 ? visibleAllPendingTasks[globalIndex + 1] : undefined

        setIsCompletingTask(true)
        setHiddenTaskIds((prev) => {
            if (prev.has(taskId)) return prev
            const next = new Set(prev)
            next.add(taskId)
            return next
        })

        try {
            await updateTaskAsync({ id: task.id, status: 'Completed' })
            if (nextTask) navigateToTaskDossier(nextTask)
        } catch (error) {
            setHiddenTaskIds((prev) => {
                if (!prev.has(taskId)) return prev
                const next = new Set(prev)
                next.delete(taskId)
                return next
            })
        } finally {
            setIsCompletingTask(false)
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
            if (prev.mills !== account.mills) changed.add('mills')
            if (prev.annualUsage !== account.annualUsage) changed.add('annualVolume')
            if (prev.industry !== account.industry) changed.add('industry')
            if (prev.location !== account.location) changed.add('location')
            if (prev.logoUrl !== account.logoUrl) changed.add('logoUrl')
            if (prev.description !== account.description) changed.add('description')
        }
        prevAccountRef.current = account
            if (changed.size) {
                setRecentlyUpdatedFields(changed)
                setTimeout(() => setRecentlyUpdatedFields(new Set()), 2000)
            }
    }, [account, isRecalibrating, lastEnrichedAccountId])

    return {
        id, account, contacts, calls, isLoading: isLoading || (!!id && account == null && !isFetched),
        isLoadingContacts, isLoadingCalls, isFetched,
        isSecondaryReady,
        isEditing, lockWithoutSaving, toggleEditing, isSaving, showSynced, setActiveEditField, activeEditField,
        recentlyUpdatedFields, glowingFields, isRecalibrating,
        editAccountName, setEditAccountName, editNotes, setEditNotes, editAnnualUsage, setEditAnnualUsage,
        editStrikePrice, setEditStrikePrice, editMills, setEditMills, editIndustry, setEditIndustry, editLocation, setEditLocation,
        editEmployees, setEditEmployees,
        editLogoUrl, setEditLogoUrl, editSupplier, setEditSupplier, editDomain, setEditDomain, editLinkedinUrl, setEditLinkedinUrl,
        editMeters, setEditMeters, editContractEnd, setEditContractEnd, editCompanyPhone, setEditCompanyPhone,
        editAddress, setEditAddress,
        pendingTasks: visiblePendingTasks, hasTasks, displayTaskIndex, globalTotal, globalPosition, useGlobalPagination,
        handlePrev, handleNext, handleCompleteAndAdvance,
        isCompletingTask,
        contractEndDate, daysRemaining, maturityPct, maturityColor, handleIngestionComplete,
        updateAccountMutation: updateAccount
    }
}
