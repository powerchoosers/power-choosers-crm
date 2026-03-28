'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ShieldCheck, ShieldOff, Loader2, RefreshCw, Users, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type AdminUser = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  displayName: string
  role: 'admin' | 'employee'
  roleSource: 'stored' | 'bootstrap' | 'default'
  updatedAt: string | null
}

type AdminPayload = {
  users: AdminUser[]
  totals: {
    users: number
    admins: number
    employees: number
    bootstrapAdmins: number
  }
}

function formatActivity(value?: string | null) {
  if (!value) return '—'
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true })
  } catch {
    return value
  }
}

function roleTone(role: AdminUser['role']) {
  return role === 'admin'
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
    : 'bg-white/5 text-zinc-500 border-white/10'
}

function sourceTone(source: AdminUser['roleSource']) {
  if (source === 'bootstrap') return 'bg-amber-500/10 text-amber-300 border-amber-500/20'
  if (source === 'stored') return 'bg-white/5 text-zinc-400 border-white/10'
  return 'bg-white/5 text-zinc-500 border-white/10'
}

export default function AdminPage() {
  const { role, loading, user } = useAuth()
  const isPrivileged = role === 'admin' || role === 'dev'

  const [payload, setPayload] = useState<AdminPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingId, setIsSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch('/api/admin/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load admin roster')
      }

      setPayload(data as AdminPayload)
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin roster')
      setPayload(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!loading && isPrivileged) {
      loadUsers()
    }
  }, [loading, isPrivileged])

  const filteredUsers = useMemo(() => {
    const users = payload?.users || []
    const term = search.trim().toLowerCase()
    if (!term) return users

    return users.filter((item) => {
      const haystack = [
        item.displayName,
        item.email,
        item.jobTitle,
        item.role,
        item.roleSource,
      ].map((value) => String(value || '').toLowerCase()).join(' | ')

      return haystack.includes(term)
    })
  }, [payload?.users, search])

  const changeRole = async (target: AdminUser, nextRole: AdminUser['role']) => {
    const label = nextRole === 'admin' ? 'Make this person an admin?' : 'Remove admin access from this person?'
    const confirmed = window.confirm(label)
    if (!confirmed) return

    setIsSavingId(target.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: target.id,
          role: nextRole,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update admin access')
      }

      toast.success(nextRole === 'admin' ? 'Admin access granted' : 'Admin access removed')
      await loadUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update admin access')
    } finally {
      setIsSavingId(null)
    }
  }

  const totals = payload?.totals

  if (!loading && !isPrivileged) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="nodal-glass rounded-3xl border border-white/5 p-8 max-w-xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Access Restricted</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Admin</h1>
          <p className="mt-2 text-zinc-400">
            This section is for admin review only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CollapsiblePageHeader
        title="Admin"
        description="Grant or remove admin access. Roles are saved in the user's profile row, and your own role is locked from this screen to avoid lockouts."
        globalFilter={search}
        onSearchChange={setSearch}
        placeholder="Search names, emails, titles..."
      >
        <Badge className="border border-[#002FA7]/30 bg-[#002FA7]/10 text-[#9db7ff] uppercase tracking-[0.2em] text-[10px] font-mono">
          Access Control
        </Badge>
      </CollapsiblePageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Users', value: totals?.users ?? 0, icon: Users },
          { label: 'Admins', value: totals?.admins ?? 0, icon: ShieldCheck },
          { label: 'Employees', value: totals?.employees ?? 0, icon: UserCog },
          { label: 'Bootstrap', value: totals?.bootstrapAdmins ?? 0, icon: ShieldOff },
        ].map((item) => (
          <Card key={item.label} className="nodal-glass border border-white/5">
            <CardContent className="p-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">{item.label}</div>
                <div className="mt-3 text-3xl font-mono text-white tabular-nums">{item.value}</div>
              </div>
              <item.icon className="w-5 h-5 text-zinc-500 shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <div className="nodal-glass rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-400/80 font-mono">Load Failed</div>
            <div className="mt-2 text-zinc-100 font-medium">Could not load admin access.</div>
            <p className="mt-1 text-sm text-zinc-400">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={loadUsers}
            className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="nodal-void-card overflow-hidden border border-white/5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Team Access</div>
            <div className="mt-1 text-sm text-zinc-400">
              {isLoading ? 'Loading team access…' : `Signed in as ${user?.email || 'unknown'}`}
            </div>
          </div>
          <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
            {filteredUsers.length} visible
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-white/5">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Person</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Email</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Title</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Access</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Source</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">Updated</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-zinc-500">
                    Loading admin roster...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((item) => {
                  const isSelf = user?.email?.toLowerCase().trim() === item.email?.toLowerCase().trim()
                  const nextRole: AdminUser['role'] = item.role === 'admin' ? 'employee' : 'admin'

                  return (
                    <TableRow key={item.id} className={cn('border-white/5 hover:bg-white/[0.02]', isSelf && 'bg-white/[0.03]')}>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-zinc-100 whitespace-nowrap">{item.displayName}</span>
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
                              {isSelf ? 'You' : 'Team member'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300 font-mono text-[12px] whitespace-nowrap">{item.email || '—'}</TableCell>
                      <TableCell className="text-zinc-400 whitespace-nowrap">{item.jobTitle || '—'}</TableCell>
                      <TableCell>
                        <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', roleTone(item.role))}>
                          {item.role === 'admin' ? 'Admin' : 'Employee'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('border uppercase tracking-[0.2em] text-[10px] font-mono', sourceTone(item.roleSource))}>
                          {item.roleSource}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-400 whitespace-nowrap">{formatActivity(item.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf || isLoading || isSavingId === item.id}
                          onClick={() => changeRole(item, nextRole)}
                          className={cn(
                            'border-white/10 nodal-glass',
                            item.role === 'admin'
                              ? 'text-zinc-300 hover:text-white hover:bg-rose-500/10'
                              : 'text-zinc-300 hover:text-white hover:bg-[#002FA7]/10'
                          )}
                        >
                          {isSavingId === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : item.role === 'admin' ? (
                            <ShieldOff className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                          {isSelf
                            ? 'Self'
                            : item.role === 'admin'
                              ? 'Remove admin'
                              : 'Make admin'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-zinc-500">
                    No users matched the current search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
