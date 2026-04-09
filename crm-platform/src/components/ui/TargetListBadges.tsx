'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ListEntry {
    listId: string
    listName: string
}

const CONTACT_TARGET_TYPES = ['people', 'contact', 'contacts']
const ACCOUNT_TARGET_TYPES = ['account', 'accounts', 'company', 'companies']

/**
 * Per-cell fallback hook — only runs when preloadedLists is not provided.
 * TanStack Query deduplicates and caches by (entityType, entityId).
 */
function useEntityListMemberships(
    entityId: string,
    entityType: 'contact' | 'account',
    opts?: { enabled?: boolean },
) {
    return useQuery<ListEntry[]>({
        queryKey: ['entity-list-memberships', entityType, entityId],
        queryFn: async () => {
            const types = entityType === 'contact' ? CONTACT_TARGET_TYPES : ACCOUNT_TARGET_TYPES

            const { data: memberships, error: mErr } = await supabase
                .from('list_members')
                .select('listId, targetId')
                .eq('targetId', entityId)
                .in('targetType', types)

            if (mErr || !memberships?.length) return []

            const listIds = [...new Set(memberships.map((m) => m.listId))]

            const { data: lists, error: lErr } = await supabase
                .from('lists')
                .select('id, name')
                .in('id', listIds)

            if (lErr || !lists?.length) return []

            return lists.map((l) => ({ listId: l.id, listName: l.name }))
        },
        enabled: !!entityId && (opts?.enabled !== false),
        staleTime: 1000 * 60 * 5,
    })
}

/**
 * Page-level batch hook — fetches list memberships for ALL visible entity IDs
 * in exactly 2 Supabase queries instead of 2N per-row queries.
 * Pass the returned Map into table.meta so cells can read it.
 */
export function usePageListMemberships(entityIds: string[], entityType: 'contact' | 'account') {
    return useQuery<Map<string, ListEntry[]>>({
        queryKey: ['page-list-memberships', entityType, entityIds.slice().sort().join(',')],
        queryFn: async () => {
            if (!entityIds.length) return new Map()

            const types = entityType === 'contact' ? CONTACT_TARGET_TYPES : ACCOUNT_TARGET_TYPES

            const { data: memberships } = await supabase
                .from('list_members')
                .select('listId, targetId')
                .in('targetId', entityIds)
                .in('targetType', types)

            if (!memberships?.length) return new Map()

            const listIds = [...new Set(memberships.map((m) => m.listId))]

            const { data: lists } = await supabase
                .from('lists')
                .select('id, name')
                .in('id', listIds)

            const listMap = new Map(lists?.map((l) => [l.id, l.name]) ?? [])

            const result = new Map<string, ListEntry[]>()
            for (const membership of memberships) {
                const name = listMap.get(membership.listId)
                if (!name) continue
                const existing = result.get(membership.targetId) ?? []
                existing.push({ listId: membership.listId, listName: name })
                result.set(membership.targetId, existing)
            }

            return result
        },
        enabled: entityIds.length > 0,
        staleTime: 1000 * 60 * 5,
    })
}

interface TargetListBadgesProps {
    entityId: string
    entityType: 'contact' | 'account'
    /** Max badges to show before "+N" overflow chip. Default: 2 */
    maxVisible?: number
    className?: string
    /**
     * Pre-fetched list memberships from usePageListMemberships, passed via table.meta.
     * When provided, skips the per-row fetch entirely.
     */
    preloadedLists?: ListEntry[]
}

export function TargetListBadges({
    entityId,
    entityType,
    maxVisible = 2,
    className,
    preloadedLists,
}: TargetListBadgesProps) {
    // Only fire the per-row query when no batch-preloaded data is available
    const { data: fetchedLists, isLoading } = useEntityListMemberships(
        entityId,
        entityType,
        { enabled: preloadedLists === undefined },
    )

    // Prefer preloaded data; fall back to individually fetched
    const lists = preloadedLists ?? fetchedLists

    if (preloadedLists === undefined && isLoading) {
        return (
            <div className={cn('flex items-center gap-1', className)}>
                <div className="h-3.5 w-14 rounded-md bg-white/5 animate-pulse" />
                <div className="h-3.5 w-10 rounded-md bg-white/5 animate-pulse" />
            </div>
        )
    }

    if (!lists || lists.length === 0) {
        return <span className="text-zinc-700 font-mono text-[10px]">—</span>
    }

    const visible = lists.slice(0, maxVisible)
    const overflow = lists.length - maxVisible

    return (
        <div className={cn('flex items-center gap-1 flex-wrap', className)}>
            {visible.map((l) => (
                <Link
                    key={l.listId}
                    href={`/network/targets/${l.listId}`}
                    onClick={(e) => e.stopPropagation()}
                    title={l.listName}
                    className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md
            bg-emerald-500/10 border border-emerald-500/30 text-emerald-400
            hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-emerald-300
            transition-all whitespace-nowrap leading-none"
                >
                    {l.listName}
                </Link>
            ))}

            {overflow > 0 && (
                <span
                    className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest px-1.5 py-0.5
            rounded-md bg-white/5 border border-white/10 leading-none"
                >
                    +{overflow}
                </span>
            )}
        </div>
    )
}
