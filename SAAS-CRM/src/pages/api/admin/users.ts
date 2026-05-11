import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { isBootstrapAdminEmail, normalizeUserRole, resolveUserRole } from '@/lib/auth/roles'

type AdminUserResponse = {
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

function buildDisplayName(row: {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  const email = String(row.email || '').toLowerCase().trim()
  return email ? email.split('@')[0] : 'Unknown'
}

function serializeUser(row: {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  job_title?: string | null
  updated_at?: string | null
  settings?: Record<string, unknown> | null
}): AdminUserResponse {
  const settings = (row.settings as Record<string, unknown>) || {}
  const explicitRole = normalizeUserRole(settings.role)
  const role = resolveUserRole(settings, row.email)

  return {
    id: row.id,
    email: row.email || null,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    jobTitle: row.job_title || null,
    displayName: buildDisplayName(row),
    role,
    roleSource: explicitRole ? 'stored' : isBootstrapAdminEmail(row.email) ? 'bootstrap' : 'default',
    updatedAt: row.updated_at || null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireUser(req)
  if (!auth.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!auth.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, job_title, updated_at, settings')
        .order('updated_at', { ascending: false, nullsFirst: false })

      if (error) throw error

      const users = (data || []).map((row) => serializeUser(row as any))
      const adminCount = users.filter((user) => user.role === 'admin').length

      return res.status(200).json({
        users,
        totals: {
          users: users.length,
          admins: adminCount,
          employees: users.length - adminCount,
          bootstrapAdmins: users.filter((user) => user.roleSource === 'bootstrap').length,
        }
      })
    }

    if (req.method === 'PATCH') {
      const userId = String(req.body?.userId || req.body?.id || '').trim()
      const nextRole = normalizeUserRole(req.body?.role)

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' })
      }

      if (!nextRole) {
        return res.status(400).json({ error: 'Valid role is required' })
      }

      const { data: target, error: targetError } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, job_title, updated_at, settings')
        .eq('id', userId)
        .maybeSingle()

      if (targetError) throw targetError
      if (!target) {
        return res.status(404).json({ error: 'User not found' })
      }

      const authEmail = String(auth.email || '').toLowerCase().trim()
      const targetEmail = String(target.email || '').toLowerCase().trim()

      if (authEmail && targetEmail === authEmail) {
        return res.status(400).json({ error: 'You cannot change your own admin access from this screen' })
      }

      const { data: allUsers, error: allUsersError } = await supabaseAdmin
        .from('users')
        .select('id, email, settings')

      if (allUsersError) throw allUsersError

      const currentTargetRole = resolveUserRole(target.settings as Record<string, unknown> | null | undefined, target.email)
      const remainingAdmins = (allUsers || [])
        .filter((row) => row.id !== target.id)
        .filter((row) => resolveUserRole(row.settings as Record<string, unknown> | null | undefined, row.email) === 'admin')

      if (currentTargetRole === 'admin' && nextRole !== 'admin' && remainingAdmins.length === 0) {
        return res.status(400).json({ error: 'At least one admin must remain in the CRM' })
      }

      const existingSettings = (target.settings as Record<string, unknown>) || {}
      const nextSettings = {
        ...existingSettings,
        role: nextRole,
      }

      const updatedAt = new Date().toISOString()
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          settings: nextSettings,
          updated_at: updatedAt,
        })
        .eq('id', target.id)

      if (updateError) throw updateError

      return res.status(200).json({
        user: serializeUser({
          ...target,
          settings: nextSettings,
          updated_at: updatedAt,
        } as any)
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[Admin Users] Error:', error)
    return res.status(500).json({ error: 'Failed to manage admin access' })
  }
}
