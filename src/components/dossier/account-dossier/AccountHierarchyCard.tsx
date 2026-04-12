'use client'

import { memo, type KeyboardEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Building2, GitBranch, Plus, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { DottedEmptyState } from '@/components/dossier/DottedEmptyState'
import { supabase } from '@/lib/supabase'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { cn } from '@/lib/utils'

type RelationshipMode = 'PARENT' | 'SUBSIDIARY'

interface AccountHierarchy {
  parentAccountId: string | null
  subsidiaryAccountIds: string[]
}

interface RelatedAccount {
  id: string
  name: string
  domain?: string
  industry?: string
  city?: string
  state?: string
  logoUrl?: string
  metadata?: Record<string, unknown> | null
}

interface ApolloOrganization {
  id?: string
  name?: string
  domain?: string
  website?: string
  linkedin?: string
  logoUrl?: string
  description?: string
  location?: string
  employees?: string | number | null
  industry?: string
  phone?: string
  city?: string
  state?: string
  country?: string
  address?: string
  revenue?: string
}

interface AccountHierarchyCardProps {
  accountId: string
  account: any
  className?: string
}

interface HierarchyRow {
  metadata: Record<string, unknown>
  hierarchy: AccountHierarchy
}

interface RelationshipActionsProps {
  parentLabel: string
  onOpenParent: () => void
  onOpenSubsidiary: () => void
}

const RelationshipActions = memo(function RelationshipActions({
  parentLabel,
  onOpenParent,
  onOpenSubsidiary
}: RelationshipActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 shrink-0">
      <button
        onClick={onOpenParent}
        className="w-full h-9 px-3 rounded-xl border border-white/10 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-all uppercase tracking-widest flex items-center justify-center leading-none whitespace-nowrap"
      >
        {parentLabel}
      </button>
      <button
        onClick={onOpenSubsidiary}
        className="w-full h-9 px-3 rounded-xl border border-white/10 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-all uppercase tracking-widest flex items-center justify-center leading-none whitespace-nowrap"
      >
        Subsidiary
      </button>
    </div>
  )
})

const getApolloAuthHeaders = async (includeContentType = false): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  }
}

function normalizeDomain(value?: string | null): string {
  if (!value) return ''
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase()
}

function uniqueIds(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    if (!value || seen.has(value)) return
    seen.add(value)
    output.push(value)
  })
  return output
}

function parseHierarchy(metadata: unknown): AccountHierarchy {
  const safeMeta = (metadata && typeof metadata === 'object') ? metadata as Record<string, unknown> : {}
  const relationships = (safeMeta.relationships && typeof safeMeta.relationships === 'object')
    ? safeMeta.relationships as Record<string, unknown>
    : {}

  const parentRaw = relationships.parentAccountId ?? safeMeta.parentAccountId
  const parentAccountId = typeof parentRaw === 'string' && parentRaw.trim() ? parentRaw : null

  const subsidiariesRaw = relationships.subsidiaryAccountIds ?? safeMeta.subsidiaryAccountIds
  const subsidiaryAccountIds = Array.isArray(subsidiariesRaw)
    ? uniqueIds(
      subsidiariesRaw
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    : []

  return { parentAccountId, subsidiaryAccountIds }
}

function withHierarchyMetadata(metadata: Record<string, unknown>, hierarchy: AccountHierarchy): Record<string, unknown> {
  const relationships = (metadata.relationships && typeof metadata.relationships === 'object')
    ? metadata.relationships as Record<string, unknown>
    : {}

  return {
    ...metadata,
    relationships: {
      ...relationships,
      parentAccountId: hierarchy.parentAccountId,
      subsidiaryAccountIds: hierarchy.subsidiaryAccountIds,
      hierarchyUpdatedAt: new Date().toISOString()
    }
  }
}

function mapAccountRow(row: any): RelatedAccount {
  return {
    id: row.id,
    name: row.name || 'Unknown Account',
    domain: row.domain || row.metadata?.domain || '',
    industry: row.industry || '',
    city: row.city || '',
    state: row.state || '',
    logoUrl: row.logo_url || row.metadata?.logo_url || row.metadata?.logoUrl || '',
    metadata: row.metadata || null
  }
}

function parseCityState(location?: string | null): { city: string; state: string } {
  if (!location) return { city: '', state: '' }
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return { city: '', state: '' }
  if (parts.length === 1) return { city: parts[0], state: '' }
  const stateToken = parts[1].split(/\s+/)[0] || parts[1]
  return {
    city: parts[0],
    state: stateToken
  }
}

export function AccountHierarchyCard({ accountId, account, className }: AccountHierarchyCardProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [pickerMode, setPickerMode] = useState<RelationshipMode | null>(null)
  const [query, setQuery] = useState('')
  const [localResults, setLocalResults] = useState<RelatedAccount[]>([])
  const [apolloResults, setApolloResults] = useState<ApolloOrganization[]>([])
  const [isSearchingLocal, setIsSearchingLocal] = useState(false)
  const [isSearchingApollo, setIsSearchingApollo] = useState(false)
  const [isCommittingApollo, setIsCommittingApollo] = useState(false)
  const [isSyncingRelationship, setIsSyncingRelationship] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [parentAccount, setParentAccount] = useState<RelatedAccount | null>(null)
  const [subsidiaryAccounts, setSubsidiaryAccounts] = useState<RelatedAccount[]>([])
  const [hierarchyOverride, setHierarchyOverride] = useState<AccountHierarchy | null>(null)
  const [isHierarchyLoaded, setIsHierarchyLoaded] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const closeControlsTimerRef = useRef<number | null>(null)
  const accountHierarchy = useMemo(
    () => hierarchyOverride ?? parseHierarchy(account?.metadata),
    [account?.metadata, hierarchyOverride]
  )

  const resetPickerState = useCallback(() => {
    setQuery('')
    setLocalResults([])
    setApolloResults([])
  }, [])

  const openPicker = useCallback((mode: RelationshipMode) => {
    setControlsOpen(true)
    resetPickerState()
    setPickerMode(mode)
  }, [resetPickerState])

  const closePicker = useCallback(() => {
    setPickerMode(null)
  }, [])

  const toggleControls = useCallback(() => {
    setControlsOpen((prev) => {
      const next = !prev
      if (!next) {
        closePicker()
      }
      return next
    })
  }, [closePicker])

  const handleOpenParent = useCallback(() => openPicker('PARENT'), [openPicker])
  const handleOpenSubsidiary = useCallback(() => openPicker('SUBSIDIARY'), [openPicker])
  const closeControlsSmoothly = useCallback(() => {
    closePicker()
    if (closeControlsTimerRef.current !== null) {
      window.clearTimeout(closeControlsTimerRef.current)
    }
    closeControlsTimerRef.current = window.setTimeout(() => {
      setControlsOpen(false)
      closeControlsTimerRef.current = null
    }, 220)
  }, [closePicker])

  const invalidateAccountQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    ])
  }

  const fetchHierarchyRow = async (targetId: string): Promise<HierarchyRow> => {
    const { data, error } = await supabase
      .from('accounts')
      .select('metadata')
      .eq('id', targetId)
      .maybeSingle()

    if (error) throw error
    const metadata = (data?.metadata && typeof data.metadata === 'object')
      ? data.metadata as Record<string, unknown>
      : {}

    return {
      metadata,
      hierarchy: parseHierarchy(metadata)
    }
  }

  const persistHierarchy = async (
    targetId: string,
    metadata: Record<string, unknown>,
    hierarchy: AccountHierarchy
  ) => {
    const nextMetadata = withHierarchyMetadata(metadata, hierarchy)
    const { error } = await supabase
      .from('accounts')
      .update({
        metadata: nextMetadata,
        updatedAt: new Date().toISOString()
      })
      .eq('id', targetId)

    if (error) throw error
  }

  const ingestApolloOrganization = async (organization: ApolloOrganization): Promise<RelatedAccount> => {
    const normalizedDomain = normalizeDomain(organization.domain || organization.website)
    let merged = { ...organization }

    if (normalizedDomain) {
      try {
        const enrichResponse = await fetch(`/api/apollo/company?domain=${encodeURIComponent(normalizedDomain)}`, {
          headers: await getApolloAuthHeaders()
        })

        if (enrichResponse.ok) {
          const enrichedCompany = await enrichResponse.json()
          merged = {
            ...merged,
            name: enrichedCompany?.name || merged.name,
            domain: normalizeDomain(enrichedCompany?.domain || normalizedDomain),
            website: enrichedCompany?.website || merged.website,
            description: enrichedCompany?.description || merged.description,
            industry: enrichedCompany?.industry || merged.industry,
            employees: enrichedCompany?.employees || merged.employees,
            revenue: enrichedCompany?.revenue || merged.revenue,
            address: enrichedCompany?.address || merged.address,
            city: enrichedCompany?.city || merged.city,
            state: enrichedCompany?.state || merged.state,
            country: enrichedCompany?.country || merged.country,
            phone: enrichedCompany?.companyPhone || merged.phone,
            linkedin: enrichedCompany?.linkedin || merged.linkedin,
            logoUrl: enrichedCompany?.logoUrl || merged.logoUrl
          }
        }
      } catch (error) {
        console.error('Apollo enrichment failed during hierarchy ingest:', error)
      }
    }

    const parsedLocation = parseCityState(merged.location)
    const city = merged.city || parsedLocation.city
    const state = merged.state || parsedLocation.state
    const domainKey = normalizeDomain(merged.domain || normalizedDomain)
    const name = (merged.name || '').trim()
    const address = (merged.address || '').trim()
    const serviceAddresses = (address || city || state)
      ? [{
        address: address || '',
        city: city || '',
        state: state || '',
        country: merged.country || '',
        type: 'headquarters',
        isPrimary: true
      }]
      : []
    const meters = address
      ? [{
        id: crypto.randomUUID(),
        esiId: '',
        address,
        rate: '',
        endDate: ''
      }]
      : []
    const employeesRaw = parseInt(String(merged.employees ?? ''), 10)
    const employees = Number.isNaN(employeesRaw) ? null : employeesRaw
    const phone = formatPhoneNumber(merged.phone || '') || null
    const now = new Date().toISOString()
    const { data: { session } } = await supabase.auth.getSession()
    const currentOwnerId = session?.user?.email?.toLowerCase() || null

    let existingAccount: { id: string; ownerId?: string | null } | null = null
    if (domainKey) {
      const { data } = await supabase
        .from('accounts')
        .select('id, ownerId')
        .eq('domain', domainKey)
        .maybeSingle()
      if (data) existingAccount = data
    }
    if (!existingAccount && name) {
      const { data } = await supabase
        .from('accounts')
        .select('id, ownerId')
        .ilike('name', name)
        .maybeSingle()
      if (data) existingAccount = data
    }

    const existingId = existingAccount?.id ?? null
    const resolvedId = existingId || crypto.randomUUID()
    if (existingId) {
      const { data: currentRow } = await supabase
        .from('accounts')
        .select('metadata, ownerId')
        .eq('id', existingId)
        .maybeSingle()

      const updates: Record<string, unknown> = {
        updatedAt: now,
        status: 'active'
      }
      const existingOwnerId = String(currentRow?.ownerId || '').trim()
      if (name) updates.name = name
      if (domainKey) updates.domain = domainKey
      if (merged.industry) updates.industry = merged.industry
      if (merged.description) updates.description = merged.description
      if (merged.revenue) updates.revenue = merged.revenue
      if (employees !== null) updates.employees = employees
      if (address) updates.address = address
      if (city) updates.city = city
      if (state) updates.state = state
      if (merged.country) updates.country = merged.country
      if (serviceAddresses.length > 0) updates.service_addresses = serviceAddresses
      if (merged.logoUrl) updates.logo_url = merged.logoUrl
      if (phone) updates.phone = phone
      if (merged.linkedin) updates.linkedin_url = merged.linkedin
      if (merged.website) updates.website = merged.website

      const existingMetadata = (currentRow?.metadata && typeof currentRow.metadata === 'object')
        ? currentRow.metadata as Record<string, unknown>
        : {}
      if (meters.length > 0) {
        updates.metadata = { ...existingMetadata, meters }
      }
      if (!existingOwnerId && currentOwnerId) {
        updates.ownerId = currentOwnerId
      }

      const { error } = await supabase
        .from('accounts')
        .update(updates)
        .eq('id', existingId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('accounts')
        .insert({
          id: resolvedId,
          name: name || 'Unknown Account',
          domain: domainKey || null,
          industry: merged.industry || null,
          description: merged.description || null,
          revenue: merged.revenue || null,
          employees,
          address: address || null,
          city: city || null,
          state: state || null,
          country: merged.country || null,
          service_addresses: serviceAddresses,
          logo_url: merged.logoUrl || null,
          phone,
          linkedin_url: merged.linkedin || null,
          website: merged.website || null,
          ownerId: currentOwnerId,
          status: 'active',
          metadata: { meters },
          createdAt: now,
          updatedAt: now
        })
      if (error) throw error
    }

    return {
      id: resolvedId,
      name: name || 'Unknown Account',
      domain: domainKey || '',
      industry: merged.industry || '',
      city: city || '',
      state: state || '',
      logoUrl: merged.logoUrl || '',
      metadata: null
    }
  }

  const applyRelationship = async (targetAccount: RelatedAccount, mode: RelationshipMode) => {
    if (targetAccount.id === accountId) {
      toast.error('Cannot link this account to itself.')
      return
    }

    setIsSyncingRelationship(true)
    try {
      const current = await fetchHierarchyRow(accountId)
      let nextCurrent = current.hierarchy

      if (mode === 'PARENT') {
        if (current.hierarchy.parentAccountId === targetAccount.id) {
          toast.message(`${targetAccount.name} is already the parent company.`)
          closePicker()
          return
        }

        const previousParentId = current.hierarchy.parentAccountId
        nextCurrent = {
          parentAccountId: targetAccount.id,
          subsidiaryAccountIds: uniqueIds(
            current.hierarchy.subsidiaryAccountIds.filter((id) => id !== targetAccount.id)
          )
        }

        await persistHierarchy(accountId, current.metadata, nextCurrent)

        if (previousParentId && previousParentId !== targetAccount.id) {
          const previousParent = await fetchHierarchyRow(previousParentId)
          const nextPreviousParent = {
            ...previousParent.hierarchy,
            subsidiaryAccountIds: previousParent.hierarchy.subsidiaryAccountIds.filter((id) => id !== accountId)
          }
          await persistHierarchy(previousParentId, previousParent.metadata, nextPreviousParent)
        }

        const newParent = await fetchHierarchyRow(targetAccount.id)
        const nextParent = {
          ...newParent.hierarchy,
          subsidiaryAccountIds: uniqueIds([...newParent.hierarchy.subsidiaryAccountIds, accountId])
        }
        await persistHierarchy(targetAccount.id, newParent.metadata, nextParent)

        setParentAccount(targetAccount)
      } else {
        if (current.hierarchy.subsidiaryAccountIds.includes(targetAccount.id)) {
          toast.message(`${targetAccount.name} is already a subsidiary.`)
          closePicker()
          return
        }

        const child = await fetchHierarchyRow(targetAccount.id)
        const previousChildParentId = child.hierarchy.parentAccountId

        nextCurrent = {
          ...current.hierarchy,
          subsidiaryAccountIds: uniqueIds([...current.hierarchy.subsidiaryAccountIds, targetAccount.id])
        }
        await persistHierarchy(accountId, current.metadata, nextCurrent)

        if (previousChildParentId && previousChildParentId !== accountId) {
          const previousParent = await fetchHierarchyRow(previousChildParentId)
          const nextPreviousParent = {
            ...previousParent.hierarchy,
            subsidiaryAccountIds: previousParent.hierarchy.subsidiaryAccountIds.filter((id) => id !== targetAccount.id)
          }
          await persistHierarchy(previousChildParentId, previousParent.metadata, nextPreviousParent)
        }

        const nextChild = {
          ...child.hierarchy,
          parentAccountId: accountId,
          subsidiaryAccountIds: child.hierarchy.subsidiaryAccountIds.filter((id) => id !== accountId)
        }
        await persistHierarchy(targetAccount.id, child.metadata, nextChild)

        setSubsidiaryAccounts((prev) => {
          if (prev.some((accountItem) => accountItem.id === targetAccount.id)) return prev
          return [...prev, targetAccount]
        })
      }

      setHierarchyOverride(nextCurrent)
      await invalidateAccountQueries()
      closeControlsSmoothly()
      toast.success(mode === 'PARENT' ? 'Parent company linked' : 'Subsidiary linked')
    } catch (error: any) {
      console.error('Failed to link corporate relationship:', error)
      toast.error('Relationship update failed', { description: error?.message || 'Unknown error' })
    } finally {
      setIsSyncingRelationship(false)
    }
  }

  const handleSelectExisting = async (targetAccount: RelatedAccount) => {
    if (!pickerMode) return
    await applyRelationship(targetAccount, pickerMode)
  }

  const handleSelectApollo = async (organization: ApolloOrganization) => {
    if (!pickerMode) return
    setIsCommittingApollo(true)
    try {
      const ingested = await ingestApolloOrganization(organization)
      await applyRelationship(ingested, pickerMode)
      toast.success('Account ingested and linked')
    } catch (error: any) {
      console.error('Apollo ingest failed from hierarchy card:', error)
      toast.error('Ingestion failed', { description: error?.message || 'Unable to ingest account from Apollo.' })
    } finally {
      setIsCommittingApollo(false)
    }
  }

  const clearParent = async () => {
    if (!accountHierarchy.parentAccountId) return
    setIsSyncingRelationship(true)
    try {
      const current = await fetchHierarchyRow(accountId)
      const oldParentId = current.hierarchy.parentAccountId
      if (!oldParentId) return

      const nextCurrent = {
        ...current.hierarchy,
        parentAccountId: null
      }
      await persistHierarchy(accountId, current.metadata, nextCurrent)

      const oldParent = await fetchHierarchyRow(oldParentId)
      const nextOldParent = {
        ...oldParent.hierarchy,
        subsidiaryAccountIds: oldParent.hierarchy.subsidiaryAccountIds.filter((id) => id !== accountId)
      }
      await persistHierarchy(oldParentId, oldParent.metadata, nextOldParent)

      setHierarchyOverride(nextCurrent)
      setParentAccount(null)
      await invalidateAccountQueries()
      toast.success('Parent company removed')
    } catch (error: any) {
      console.error('Failed to clear parent company:', error)
      toast.error('Failed to remove parent company', { description: error?.message || 'Unknown error' })
    } finally {
      setIsSyncingRelationship(false)
    }
  }

  const removeSubsidiary = async (subsidiaryId: string) => {
    setIsSyncingRelationship(true)
    try {
      const current = await fetchHierarchyRow(accountId)
      if (!current.hierarchy.subsidiaryAccountIds.includes(subsidiaryId)) return

      const nextCurrent = {
        ...current.hierarchy,
        subsidiaryAccountIds: current.hierarchy.subsidiaryAccountIds.filter((id) => id !== subsidiaryId)
      }
      await persistHierarchy(accountId, current.metadata, nextCurrent)

      const child = await fetchHierarchyRow(subsidiaryId)
      if (child.hierarchy.parentAccountId === accountId) {
        const nextChild = {
          ...child.hierarchy,
          parentAccountId: null
        }
        await persistHierarchy(subsidiaryId, child.metadata, nextChild)
      }

      setHierarchyOverride(nextCurrent)
      setSubsidiaryAccounts((prev) => prev.filter((item) => item.id !== subsidiaryId))
      await invalidateAccountQueries()
      toast.success('Subsidiary removed')
    } catch (error: any) {
      console.error('Failed to remove subsidiary:', error)
      toast.error('Failed to remove subsidiary', { description: error?.message || 'Unknown error' })
    } finally {
      setIsSyncingRelationship(false)
    }
  }

  const searchApolloByName = async () => {
    const searchTerm = query.trim()
    if (!searchTerm) return

    setIsSearchingApollo(true)
    setApolloResults([])
    try {
      const response = await fetch('/api/apollo/search-organizations', {
        method: 'POST',
        headers: await getApolloAuthHeaders(true),
        body: JSON.stringify({
          q_organization_name: searchTerm,
          per_page: 6
        })
      })

      if (!response.ok) {
        throw new Error(`Apollo search failed (${response.status})`)
      }

      const payload = await response.json()
      const organizations = Array.isArray(payload?.organizations) ? payload.organizations : []
      const mapped = organizations.map((organization: any) => ({
        id: organization.id,
        name: organization.name,
        domain: normalizeDomain(organization.domain || organization.website),
        website: organization.website || '',
        linkedin: organization.linkedin || '',
        logoUrl: organization.logoUrl || '',
        description: organization.description || '',
        location: organization.location || '',
        employees: organization.employees,
        industry: organization.industry || '',
        phone: organization.phone || '',
        city: organization.city || '',
        state: organization.state || '',
        country: organization.country || '',
        address: organization.address || '',
        revenue: organization.revenue || ''
      })) as ApolloOrganization[]

      setApolloResults(mapped)
      if (mapped.length === 0) {
        toast.message('No Apollo organizations found for this search.')
      }
    } catch (error: any) {
      console.error('Apollo organization search failed:', error)
      toast.error('Apollo search failed', { description: error?.message || 'Unknown error' })
    } finally {
      setIsSearchingApollo(false)
    }
  }

  const handlePickerKeyDown: KeyboardEventHandler<HTMLInputElement> = async (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (localResults.length > 0) return
    await searchApolloByName()
  }

  const renderAccountSubtitle = (item: RelatedAccount) => {
    const location = [item.city, item.state].filter(Boolean).join(', ')
    return item.domain || location || item.industry || 'Account Dossier'
  }

  const trimmedQuery = query.trim()
  const hasLinkedAccounts = Boolean(parentAccount) || subsidiaryAccounts.length > 0
  const shouldShowSearchResults = (
    trimmedQuery.length >= 2
    || isSearchingLocal
    || isSearchingApollo
    || localResults.length > 0
    || apolloResults.length > 0
    || isCommittingApollo
    || isSyncingRelationship
  )

  useEffect(() => {
    if (!pickerMode) return
    const timer = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [pickerMode])

  useEffect(() => {
    if (!pickerMode) return
    const searchTerm = query.trim()
    if (searchTerm.length < 2) {
      setLocalResults([])
      setIsSearchingLocal(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearchingLocal(true)
      try {
        const sanitized = searchTerm.replace(/,/g, ' ')
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, domain, industry, city, state, logo_url, metadata')
          .neq('id', accountId)
          .or(`name.ilike.%${sanitized}%,domain.ilike.%${sanitized}%,city.ilike.%${sanitized}%,state.ilike.%${sanitized}%`)
          .limit(6)

        if (error) throw error
        if (cancelled) return

        const mapped = (data || []).map(mapAccountRow).filter((item) => item.id !== accountId)
        setLocalResults(mapped)
      } catch (error) {
        if (!cancelled) {
          console.error('Local account search failed:', error)
          setLocalResults([])
        }
      } finally {
        if (!cancelled) setIsSearchingLocal(false)
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pickerMode, query, accountId])

  useEffect(() => {
    let cancelled = false
    const loadLinkedAccounts = async () => {
      const parentId = accountHierarchy.parentAccountId
      const subsidiaryIds = accountHierarchy.subsidiaryAccountIds

      if (!parentId) {
        setParentAccount(null)
      }

      if (subsidiaryIds.length === 0) {
        setSubsidiaryAccounts([])
      }

      try {
        if (parentId) {
          const { data } = await supabase
            .from('accounts')
            .select('id, name, domain, industry, city, state, logo_url, metadata')
            .eq('id', parentId)
            .maybeSingle()
          if (!cancelled) {
            setParentAccount(data ? mapAccountRow(data) : null)
          }
        }

        if (subsidiaryIds.length > 0) {
          const { data } = await supabase
            .from('accounts')
            .select('id, name, domain, industry, city, state, logo_url, metadata')
            .in('id', subsidiaryIds)

          if (!cancelled) {
            const mapped = (data || []).map(mapAccountRow)
            const ordered = subsidiaryIds
              .map((id) => mapped.find((row) => row.id === id))
              .filter((row): row is RelatedAccount => Boolean(row))
            setSubsidiaryAccounts(ordered)
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load linked hierarchy accounts:', error)
          setParentAccount(null)
          setSubsidiaryAccounts([])
        }
      } finally {
        if (!cancelled) {
          setIsHierarchyLoaded(true)
        }
      }
    }

    loadLinkedAccounts()
    return () => { cancelled = true }
  }, [accountHierarchy.parentAccountId, accountHierarchy.subsidiaryAccountIds])

  useEffect(() => {
    setHierarchyOverride(null)
  }, [account?.metadata])

  useEffect(() => {
    return () => {
      if (closeControlsTimerRef.current !== null) {
        window.clearTimeout(closeControlsTimerRef.current)
      }
    }
  }, [])

  return (
    <div className={cn('nodal-module-glass nodal-monolith-edge rounded-2xl p-4', className)}>
      <div className={cn('flex items-center justify-between', (controlsOpen || hasLinkedAccounts) && 'mb-2')}>
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.24em] flex items-center gap-2">
          <GitBranch className="w-3 h-3 text-zinc-500" /> Corporate Chain
        </h3>
        <div className="flex items-center gap-2">
          {isSyncingRelationship && (
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest animate-pulse">Syncing...</span>
          )}
          <button
            onClick={toggleControls}
            className="icon-button-forensic w-7 h-7"
            title={controlsOpen ? 'Close Corporate Chain Add Mode' : 'Add Parent or Subsidiary'}
          >
            <Plus className={cn('w-3.5 h-3.5 transition-transform duration-300', controlsOpen && 'rotate-45')} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hasLinkedAccounts && (
          <motion.div
            key="linked-accounts"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pb-0">
            {parentAccount && (
              <div className="space-y-1">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] px-1">Parent</p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/network/accounts/${parentAccount.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      router.push(`/network/accounts/${parentAccount.id}`)
                    }
                  }}
                  className="group flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-white/5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#002FA7]/50"
                  title="Open account dossier"
                >
                  <CompanyIcon
                    name={parentAccount.name}
                    logoUrl={parentAccount.logoUrl}
                    domain={parentAccount.domain}
                    metadata={parentAccount.metadata}
                    size={32}
                    roundedClassName="rounded-[12px]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-300 group-hover:text-white group-hover:scale-[1.02] transition-all origin-left truncate">
                      {parentAccount.name}
                    </p>
                    <p className="text-[10px] text-zinc-600 group-hover:text-zinc-500 truncate font-mono">
                      {renderAccountSubtitle(parentAccount)}
                    </p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void clearParent()
                    }}
                    className="text-zinc-700 hover:text-zinc-400 hover:scale-110 transition-all shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Clear parent company"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors shrink-0" />
                </div>
              </div>
            )}

            {subsidiaryAccounts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] px-1">
                  Subsidiaries ({subsidiaryAccounts.length})
                </p>
                <AnimatePresence initial={false}>
                  {subsidiaryAccounts.map((subsidiary) => (
                    <motion.div
                      key={subsidiary.id}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/network/accounts/${subsidiary.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            router.push(`/network/accounts/${subsidiary.id}`)
                          }
                        }}
                        className="group flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-white/5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#002FA7]/50"
                        title="Open account dossier"
                      >
                        <CompanyIcon
                          name={subsidiary.name}
                          logoUrl={subsidiary.logoUrl}
                          domain={subsidiary.domain}
                          metadata={subsidiary.metadata}
                          size={32}
                          roundedClassName="rounded-[12px]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-300 group-hover:text-white group-hover:scale-[1.02] transition-all origin-left truncate">
                            {subsidiary.name}
                          </p>
                          <p className="text-[10px] text-zinc-600 group-hover:text-zinc-500 truncate font-mono">
                            {renderAccountSubtitle(subsidiary)}
                          </p>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            void removeSubsidiary(subsidiary.id)
                          }}
                          className="text-zinc-700 hover:text-zinc-400 hover:scale-110 transition-all shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Remove subsidiary"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors shrink-0" />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
            </div>
          </motion.div>
        )}

        {!controlsOpen && isHierarchyLoaded && !hasLinkedAccounts && (
          <motion.div
            key="corporate-chain-empty"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden mt-3"
          >
            <DottedEmptyState message="No corporate chain linked" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {controlsOpen && (
          <motion.div
            key="controls-area"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-0 pt-1">
              <RelationshipActions
                parentLabel={parentAccount ? 'Change Parent' : 'Parent'}
                onOpenParent={handleOpenParent}
                onOpenSubsidiary={handleOpenSubsidiary}
              />

              <AnimatePresence initial={false} mode="wait" onExitComplete={resetPickerState}>
                {pickerMode && (
                  <motion.div
                    key={`picker-${pickerMode}`}
                    initial={{ opacity: 0, gridTemplateRows: '0fr', paddingTop: 0 }}
                    animate={{ opacity: 1, gridTemplateRows: '1fr', paddingTop: 8 }}
                    exit={{ opacity: 0, gridTemplateRows: '0fr', paddingTop: 0 }}
                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                    className="grid overflow-hidden"
                  >
                    <div className="min-h-0 overflow-hidden pb-0">
                      <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 min-h-6">
                        <span className="min-w-0 flex-1 text-[10px] leading-none font-mono text-zinc-500 uppercase tracking-[0.2em] whitespace-nowrap truncate">
                          {pickerMode === 'PARENT' ? 'Find Parent Company' : 'Find Subsidiary'}
                        </span>
                        <button
                          onClick={closePicker}
                          className="shrink-0 text-[9px] leading-none font-mono text-zinc-600 hover:text-zinc-300 uppercase tracking-widest transition-colors"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
                        <input
                          ref={inputRef}
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          onKeyDown={handlePickerKeyDown}
                          placeholder="Search existing accounts..."
                          className="w-full bg-black/40 border border-white/5 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                        />
                      </div>

                      <AnimatePresence initial={false}>
                        {shouldShowSearchResults && (
                          <motion.div
                            key="picker-results"
                            initial={{ opacity: 0, gridTemplateRows: '0fr' }}
                            animate={{ opacity: 1, gridTemplateRows: '1fr' }}
                            exit={{ opacity: 0, gridTemplateRows: '0fr' }}
                            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                            className="grid"
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div className="space-y-1 max-h-48 overflow-y-auto np-scroll">
                              {isSearchingLocal && (
                                <p className="text-[10px] font-mono text-zinc-600 text-center py-3 uppercase tracking-widest">Scanning local accounts...</p>
                              )}

                              {!isSearchingLocal && localResults.map((result) => (
                                <button
                                  key={`local-${result.id}`}
                                  onClick={() => void handleSelectExisting(result)}
                                  disabled={isSyncingRelationship || isCommittingApollo}
                                  className="w-full group flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-950/40 border border-transparent hover:border-white/5 transition-all text-left disabled:opacity-60"
                                >
                                  <CompanyIcon
                                    name={result.name}
                                    logoUrl={result.logoUrl}
                                    domain={result.domain}
                                    metadata={result.metadata}
                                    size={32}
                                    roundedClassName="rounded-[12px]"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-zinc-200 group-hover:text-white truncate">{result.name}</p>
                                    <p className="text-[10px] text-zinc-600 group-hover:text-zinc-500 truncate font-mono">{renderAccountSubtitle(result)}</p>
                                  </div>
                                  <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors shrink-0" />
                                </button>
                              ))}

                              {!isSearchingLocal && trimmedQuery.length >= 2 && localResults.length === 0 && !isSearchingApollo && apolloResults.length === 0 && (
                                <p className="text-[10px] font-mono text-zinc-700 text-center py-3 uppercase tracking-widest">
                                  No local match. Press Enter to search Apollo.
                                </p>
                              )}

                              {isSearchingApollo && (
                                <p className="text-[10px] font-mono text-zinc-600 text-center py-3 uppercase tracking-widest">Querying Apollo...</p>
                              )}

                              {!isSearchingApollo && apolloResults.length > 0 && (
                                <>
                                  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-1 pt-2">Apollo results</p>
                                  {apolloResults.map((organization, index) => (
                                    <button
                                      key={`apollo-${organization.id || organization.domain || index}`}
                                      onClick={() => void handleSelectApollo(organization)}
                                      disabled={isSyncingRelationship || isCommittingApollo}
                                      className="w-full group flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-950/40 border border-transparent hover:border-white/5 transition-all text-left disabled:opacity-60"
                                    >
                                      <CompanyIcon
                                        name={organization.name || 'Unknown Account'}
                                        logoUrl={organization.logoUrl}
                                        domain={organization.domain}
                                        size={32}
                                        roundedClassName="rounded-[12px]"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-zinc-200 group-hover:text-white truncate">{organization.name || 'Unknown Account'}</p>
                                        <p className="text-[10px] text-zinc-600 group-hover:text-zinc-500 truncate font-mono">
                                          {organization.domain || organization.location || organization.industry || 'Apollo Discovery'}
                                        </p>
                                      </div>
                                      <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors shrink-0" />
                                    </button>
                                  ))}
                                </>
                              )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {(isCommittingApollo || isSyncingRelationship) && (
                        <p className="text-[10px] font-mono text-zinc-600 text-center py-1 uppercase tracking-widest animate-pulse">
                          {isCommittingApollo ? 'Ingesting account...' : 'Linking relationship...'}
                        </p>
                      )}
                    </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
