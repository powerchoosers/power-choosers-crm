import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useContact, useUpdateContact } from '@/hooks/useContacts'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useContactCalls } from '@/hooks/useCalls'
import { useApolloNews } from '@/hooks/useApolloNews'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks, useAllPendingTasks } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatMillValue } from '@/lib/mills'

function parseDomainFromWebsite(value?: string | null): string | undefined {
    if (value == null) return undefined
    const trimmed = value.trim()
    if (trimmed === '') return ''

    const cleanHost = (host: string) => host.replace(/^www\./i, '').trim()

    try {
        const candidate = trimmed.match(/^https?:\/\//i) ? new URL(trimmed) : new URL(`https://${trimmed}`)
        return cleanHost(candidate.hostname)
    } catch {
        const withoutScheme = trimmed.replace(/^https?:\/\//i, '')
        const hostPart = withoutScheme.split(/[/?#]/)[0] || ''
        return cleanHost(hostPart)
    }
}

export function useContactDossierState(id: string) {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()

    const { data: contact, isLoading, isFetched } = useContact(id)
    const { data: account } = useAccount((contact as any)?.linkedAccountId ?? '')

    const domain = account?.domain?.trim() || (() => {
        try {
            const w = (contact as any)?.website?.trim()
            if (!w) return undefined
            const u = new URL(w.startsWith('http') ? w : `https://${w}`)
            return u.hostname.replace(/^www\./, '') || undefined
        } catch {
            return undefined
        }
    })()

    const { data: apolloNewsSignals } = useApolloNews(domain)
    const { data: recentCalls, isLoading: isLoadingCalls } = useContactCalls(id, account?.companyPhone, account?.id)
    const updateContact = useUpdateContact()
    const updateAccount = useUpdateAccount()
    const queryClient = useQueryClient()
    const { isEditing, setIsEditing, toggleEditing } = useUIStore()
    const setContext = useGeminiStore((state) => state.setContext)

    useEffect(() => {
        if (!contact || !id) return
        const c = contact as any
        const linkedAccountId = c?.linkedAccountId || c?.linked_account_id || c?.accountId || c?.account_id || ''
        const contextAccountId = account?.id || linkedAccountId || ''
        const label = `${String(contact.name || editCompany || 'UNKNOWN CONTACT').toUpperCase()}`
        setContext({
            type: 'contact',
            id,
            label,
            data: {
                accountId: contextAccountId,
                contactTitle: c?.title || c?.jobTitle || '',
                contactCompany: c?.companyName || c?.company || c?.company_name || '',
                domain,
            },
        } as any)
        return () => setContext(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, contact, account?.id, domain, setContext])

    const [isSaving, setIsSaving] = useState(false)
    const [showSynced, setShowSynced] = useState(false)
    const [isComposeOpen, setIsComposeOpen] = useState(false)
    const [currentCallPage, setCurrentCallPage] = useState(1)
    const [activeEditField, setActiveEditField] = useState<'logo' | 'website' | 'linkedin' | null>(null)

    // Local Field States
    const [editName, setEditName] = useState('')
    const [editFirstName, setEditFirstName] = useState('')
    const [editLastName, setEditLastName] = useState('')
    const [editTitle, setEditTitle] = useState('')
    const [editCompany, setEditCompany] = useState('')
    const [editPhone, setEditPhone] = useState('')
    const [editEmail, setEditEmail] = useState('')
    const [editNotes, setEditNotes] = useState('')
    const [editSupplier, setEditSupplier] = useState('')
    const [editStrikePrice, setEditStrikePrice] = useState('')
    const [editAnnualUsage, setEditAnnualUsage] = useState('')
    const [editLocation, setEditLocation] = useState('')
    const [editLogoUrl, setEditLogoUrl] = useState('')
    const [editWebsite, setEditWebsite] = useState('')
    const [editLinkedinUrl, setEditLinkedinUrl] = useState('')
    const [editServiceAddresses, setEditServiceAddresses] = useState<any[]>([])
    const [editMobile, setEditMobile] = useState('')
    const [editWorkDirect, setEditWorkDirect] = useState('')
    const [editOther, setEditOther] = useState('')
    const [editCompanyPhone, setEditCompanyPhone] = useState('')
    const [editPrimaryField, setEditPrimaryField] = useState<'mobile' | 'workDirectPhone' | 'otherPhone'>('mobile')
    const [editContractEnd, setEditContractEnd] = useState('')
    const [editMills, setEditMills] = useState('')

    // UI Effects States
    const [recentlyUpdatedFields, setRecentlyUpdatedFields] = useState<Set<string>>(new Set())
    const prevContactRef = useRef<any>(undefined)
    const lastEnrichedContactId = useUIStore((s) => s.lastEnrichedContactId)
    const prevIsEditing = useRef(isEditing)
    const prevEditingStateRef = useRef(isEditing)
    const suppressHydrationRef = useRef(false)
    const skipSaveOnNextLockRef = useRef(false)

    // Task Integration
    const { pendingTasks } = useEntityTasks(id, contact?.name, {
        contactId: id,
        accountId: contact?.accountId || (contact as any)?.linkedAccountId
    })
    const { data: allPendingData } = useAllPendingTasks()
    const allPendingTasks = allPendingData?.allPendingTasks ?? []
    const globalTotal = allPendingData?.totalCount ?? 0
    const { updateTask } = useTasks()
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0)

    useEffect(() => {
        if (prevEditingStateRef.current && !isEditing) {
            suppressHydrationRef.current = true
        }
        prevEditingStateRef.current = isEditing
    }, [isEditing])

    // Sync Logic
    useEffect(() => {
        if (contact && !isEditing && !suppressHydrationRef.current) {
            const c = contact as any
            const first = c.firstName ?? (contact.name || '').split(/\s+/)[0] ?? ''
            const last = c.lastName ?? (contact.name || '').split(/\s+/).slice(1).join(' ') ?? ''
            setEditName(contact.name || '')
            setEditFirstName(first)
            setEditLastName(last)
            setEditTitle(contact.title || '')
            setEditCompany(contact.companyName || contact.company || '')
            setEditPhone(contact.phone || '')
            setEditEmail(contact.email || '')
            setEditNotes(contact.notes || contact.accountDescription || '')
            setEditLocation(contact.location || '')
            setEditLogoUrl(contact.logoUrl || contact.avatarUrl || '')
            setEditWebsite(contact.website || '')
            setEditLinkedinUrl(contact.linkedinUrl || '')
            setEditMobile(contact.mobile || '')
            setEditWorkDirect(contact.workDirectPhone || '')
            setEditOther(contact.otherPhone || '')
            setEditCompanyPhone(contact.companyPhone || '')
            setEditPrimaryField(contact.primaryPhoneField || 'mobile')
            setEditServiceAddresses(Array.isArray(contact.serviceAddresses) ? contact.serviceAddresses : [])

            // Energy & Forensic fields come from Account as the source of truth
            if (account) {
                setEditSupplier(account.electricitySupplier || '')
                setEditStrikePrice(account.currentRate || '')
                setEditAnnualUsage(account.annualUsage || '')
                setEditContractEnd(account.contractEnd ? String(account.contractEnd).slice(0, 10) : '')
                setEditMills(formatMillValue(account.mills ?? account.metadata?.mills))
            } else {
                setEditSupplier(contact.electricitySupplier || '')
                setEditStrikePrice(contact.currentRate || '')
                setEditAnnualUsage(contact.annualUsage || '')
                setEditContractEnd(contact.contractEnd ? String(contact.contractEnd).slice(0, 10) : '')
                setEditMills(formatMillValue((contact as any)?.mills ?? (contact as any)?.metadata?.mills))
            }
        }
    }, [contact, account, isEditing])

    // Save Effect
    useEffect(() => {
        if (prevIsEditing.current === isEditing) return
        const wasEditing = prevIsEditing.current
        prevIsEditing.current = isEditing

        if (wasEditing && !isEditing) {
            if (skipSaveOnNextLockRef.current) {
                skipSaveOnNextLockRef.current = false
                return
            }
            const triggerSave = async () => {
                setIsSaving(true)
                const fullName = [editFirstName, editLastName].filter(Boolean).join(' ').trim() || editName
                const linkedAccountId = (contact as any)?.accountId || (contact as any)?.linkedAccountId
                const cleanedUsage = parseInt(editAnnualUsage.replace(/[^0-9]/g, '')) || 0
                const websiteDomain = parseDomainFromWebsite(editWebsite)
                const changedFields = new Set<string>()

                if ((contact?.name || '') !== (fullName || '')) changedFields.add('name')
                if ((contact?.title || '') !== (editTitle || '')) changedFields.add('title')
                if ((contact?.companyName || contact?.company || '') !== (editCompany || '')) changedFields.add('company')
                if ((contact?.location || '') !== (editLocation || '')) changedFields.add('location')
                if ((contact?.logoUrl || contact?.avatarUrl || '') !== (editLogoUrl || '')) changedFields.add('logoUrl')
                if ((contact?.linkedinUrl || '') !== (editLinkedinUrl || '')) changedFields.add('linkedin')
                if ((contact?.website || '') !== (editWebsite || '')) changedFields.add('website')
                if ((account?.domain || '') !== (websiteDomain ?? account?.domain ?? '')) changedFields.add('website')
                if ((account?.electricitySupplier || '') !== (editSupplier || '')) changedFields.add('currentSupplier')
                if ((account?.currentRate || '') !== (editStrikePrice || '')) changedFields.add('strikePrice')
                if ((account?.annualUsage || '') !== (cleanedUsage.toString() || '')) changedFields.add('annualVolume')
                if ((formatMillValue(account?.mills ?? account?.metadata?.mills) || '') !== (editMills || '')) changedFields.add('mills')
                if ((account?.contractEnd ? String(account.contractEnd).slice(0, 10) : '') !== (editContractEnd || '')) changedFields.add('contractEnd')

                if (changedFields.size) {
                    setRecentlyUpdatedFields(changedFields)
                }

                const previousContactQueries = queryClient.getQueriesData({ queryKey: ['contact'] })
                const previousAccountQueries = queryClient.getQueriesData({ queryKey: ['account'] })

                queryClient.setQueriesData({ queryKey: ['contact'] }, (cached: any) => {
                    if (!cached || cached.id !== id) return cached
                    return {
                        ...cached,
                        name: fullName,
                        firstName: editFirstName,
                        lastName: editLastName,
                        title: editTitle,
                        companyName: editCompany,
                        phone: editPhone,
                        email: editEmail,
                        notes: editNotes,
                        location: editLocation,
                        logoUrl: editLogoUrl,
                        website: editWebsite,
                        linkedinUrl: editLinkedinUrl,
                        serviceAddresses: editServiceAddresses,
                        mobile: editMobile,
                        workDirectPhone: editWorkDirect,
                        otherPhone: editOther,
                        companyPhone: editCompanyPhone,
                        primaryPhoneField: editPrimaryField,
                    }
                })

                if (linkedAccountId) {
                    queryClient.setQueriesData({ queryKey: ['account'] }, (cached: any) => {
                        if (!cached || cached.id !== linkedAccountId) return cached
                        return {
                            ...cached,
                            electricitySupplier: editSupplier,
                            currentRate: editStrikePrice,
                            annualUsage: cleanedUsage.toString(),
                            mills: editMills,
                            contractEnd: editContractEnd || null,
                            ...(websiteDomain !== undefined ? { domain: websiteDomain } : {})
                        }
                    })
                }

                try {
                    // Update contact-specific fields
                    await updateContact.mutateAsync({
                        id,
                        name: fullName,
                        firstName: editFirstName,
                        lastName: editLastName,
                        title: editTitle,
                        companyName: editCompany,
                        phone: editPhone,
                        email: editEmail,
                        notes: editNotes,
                        location: editLocation,
                        logoUrl: editLogoUrl,
                        website: editWebsite,
                        linkedinUrl: editLinkedinUrl,
                        serviceAddresses: editServiceAddresses,
                        mobile: editMobile,
                        workDirectPhone: editWorkDirect,
                        otherPhone: editOther,
                        companyPhone: editCompanyPhone,
                        primaryPhoneField: editPrimaryField,
                    })

                    // If linked to an account, sync energy data and the company website domain
                    if (linkedAccountId) {
                        const accountPayload: any = {
                            id: linkedAccountId,
                            electricitySupplier: editSupplier,
                            currentRate: editStrikePrice,
                            annualUsage: cleanedUsage.toString(),
                            mills: editMills,
                            contractEnd: editContractEnd || undefined
                        }
                        if (websiteDomain !== undefined) {
                            accountPayload.domain = websiteDomain
                        }
                        await updateAccount.mutateAsync(accountPayload)
                    }

                    setShowSynced(true)
                    setTimeout(() => setShowSynced(false), 3000)
                    setTimeout(() => setRecentlyUpdatedFields(new Set()), 1200)
                    toast.success('System Synced')
                } catch (err) {
                    for (const [key, value] of previousContactQueries) {
                        queryClient.setQueryData(key, value)
                    }
                    for (const [key, value] of previousAccountQueries) {
                        queryClient.setQueryData(key, value)
                    }
                    setRecentlyUpdatedFields(new Set())
                    toast.error('Sync failed')
                } finally {
                    suppressHydrationRef.current = false
                    setIsSaving(false)
                }
            }
            triggerSave()
        }
    }, [isEditing, id, editFirstName, editLastName, editName, editTitle, editCompany, editPhone, editEmail, editNotes, editSupplier, editStrikePrice, editMills, editAnnualUsage, editLocation, editLogoUrl, editWebsite, editLinkedinUrl, editServiceAddresses, editMobile, editWorkDirect, editOther, editCompanyPhone, editPrimaryField, editContractEnd, updateContact, updateAccount, contact])

    useEffect(() => {
        return () => {
            if (!prevIsEditing.current) return
            skipSaveOnNextLockRef.current = true
            setIsEditing(false)
        }
    }, [setIsEditing])

    return {
        // Data
        contact,
        account,
        recentCalls,
        isLoading: isLoading || (!!id && contact == null && !isFetched),
        isLoadingCalls,
        isFetched,

        // UI State
        isEditing,
        toggleEditing,
        isSaving,
        showSynced,
        setShowSynced,
        isComposeOpen,
        setIsComposeOpen,
        currentCallPage,
        setCurrentCallPage,
        activeEditField,
        setActiveEditField,
        recentlyUpdatedFields,
        setRecentlyUpdatedFields,

        // Field States
        editName,
        editFirstName,
        editLastName,
        editTitle,
        editCompany,
        editPhone,
        editEmail,
        editNotes,
        editSupplier,
        editStrikePrice,
        editMills,
        editAnnualUsage,
        editLocation,
        editLogoUrl,
        editWebsite,
        editLinkedinUrl,
        editMobile,
        editWorkDirect,
        editOther,
        editCompanyPhone,
        editPrimaryField,
        editContractEnd,
        editServiceAddresses,

        // Setters
        setEditFirstName,
        setEditLastName,
        setEditTitle,
        setEditCompany,
        setEditPhone,
        setEditEmail,
        setEditNotes,
        setEditSupplier,
        setEditStrikePrice,
        setEditMills,
        setEditAnnualUsage,
        setEditLocation,
        setEditLogoUrl,
        setEditWebsite,
        setEditLinkedinUrl,
        setEditMobile,
        setEditWorkDirect,
        setEditOther,
        setEditCompanyPhone,
        setEditPrimaryField,
        setEditContractEnd,
        setEditServiceAddresses,

        // Dependency collections for downstream
        apolloNewsSignals,
        domain,

        // Tasks
        pendingTasks,
        allPendingTasks,
        globalTotal,
        currentTaskIndex,
        setCurrentTaskIndex,
        updateTask
    }
}
