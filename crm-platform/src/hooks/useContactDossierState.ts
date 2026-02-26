import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useContact, useUpdateContact } from '@/hooks/useContacts'
import { useAccount } from '@/hooks/useAccounts'
import { useContactCalls } from '@/hooks/useCalls'
import { useApolloNews } from '@/hooks/useApolloNews'
import { useEntityTasks } from '@/hooks/useEntityTasks'
import { useTasks, useAllPendingTasks } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { useGeminiStore } from '@/store/geminiStore'
import { toast } from 'sonner'
import { format } from 'date-fns'

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
    const { isEditing, setIsEditing, toggleEditing } = useUIStore()
    const setContext = useGeminiStore((state) => state.setContext)

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

    // UI Effects States
    const [recentlyUpdatedFields, setRecentlyUpdatedFields] = useState<Set<string>>(new Set())
    const prevContactRef = useRef<any>(undefined)
    const lastEnrichedContactId = useUIStore((s) => s.lastEnrichedContactId)
    const prevIsEditing = useRef(isEditing)

    // Task Integration
    const { pendingTasks } = useEntityTasks(id, contact?.name)
    const { data: allPendingData } = useAllPendingTasks()
    const allPendingTasks = allPendingData?.allPendingTasks ?? []
    const globalTotal = allPendingData?.totalCount ?? 0
    const { updateTask } = useTasks()
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0)

    // Sync Logic
    useEffect(() => {
        if (contact && !isEditing) {
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
            setEditSupplier(contact.electricitySupplier || '')
            setEditStrikePrice(contact.currentRate || '')
            setEditAnnualUsage(contact.annualUsage || '')
            setEditLocation(contact.location || '')
            setEditLogoUrl(contact.logoUrl || contact.avatarUrl || '')
            setEditWebsite(contact.website || '')
            setEditLinkedinUrl(contact.linkedinUrl || '')
            setEditMobile(contact.mobile || '')
            setEditWorkDirect(contact.workDirectPhone || '')
            setEditOther(contact.otherPhone || '')
            setEditCompanyPhone(contact.companyPhone || '')
            setEditPrimaryField(contact.primaryPhoneField || 'mobile')
            setEditContractEnd(contact.contractEnd ? String(contact.contractEnd).slice(0, 10) : '')
            setEditServiceAddresses(Array.isArray(contact.serviceAddresses) ? contact.serviceAddresses : [])
        }
    }, [contact, isEditing])

    // Save Effect
    useEffect(() => {
        if (prevIsEditing.current === isEditing) return
        const wasEditing = prevIsEditing.current
        prevIsEditing.current = isEditing

        if (wasEditing && !isEditing) {
            const triggerSave = async () => {
                setIsSaving(true)
                const fullName = [editFirstName, editLastName].filter(Boolean).join(' ').trim() || editName
                try {
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
                        electricitySupplier: editSupplier,
                        currentRate: editStrikePrice,
                        annualUsage: editAnnualUsage,
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
                        contractEnd: editContractEnd || undefined
                    })
                    setShowSynced(true)
                    setTimeout(() => setShowSynced(false), 3000)
                    toast.success('System Synced')
                } catch (err) {
                    toast.error('Sync failed')
                } finally {
                    setIsSaving(false)
                }
            }
            triggerSave()
        }
    }, [isEditing, id, editFirstName, editLastName, editName, editTitle, editCompany, editPhone, editEmail, editNotes, editSupplier, editStrikePrice, editAnnualUsage, editLocation, editLogoUrl, editWebsite, editLinkedinUrl, editServiceAddresses, editMobile, editWorkDirect, editOther, editCompanyPhone, editPrimaryField, editContractEnd, updateContact])

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
