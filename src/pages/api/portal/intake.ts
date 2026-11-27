import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePortalAccount } from '@/lib/portal/server'
import { intakeAddress, newIntakeToken } from '@/lib/portal/intake'

interface IntakeRow {
  address_token: string
  status: 'active' | 'paused'
  enrolled_at: string
  last_received_at: string | null
}

function present(row: IntakeRow | null) {
  if (!row) return { enrolled: false, status: null, address: null, enrolledAt: null, lastReceivedAt: null }
  return {
    enrolled: true,
    status: row.status,
    // null while the receiving domain is not set up yet; the client is told an advisor will finish it.
    address: intakeAddress(row.address_token),
    enrolledAt: row.enrolled_at,
    lastReceivedAt: row.last_received_at,
  }
}

/**
 * GET: this account's automatic bill intake status.
 * POST { action: 'enroll' | 'pause' | 'resume' }: change it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const columns = 'address_token, status, enrolled_at, last_received_at'
  const load = async () => {
    const { data } = await supabaseAdmin.from('client_bill_intake').select(columns).eq('account_id', identity.accountId).limit(1)
    return (data?.[0] as IntakeRow) || null
  }

  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method === 'GET') return res.status(200).json({ intake: present(await load()) })

  const action = String(req.body?.action || '')
  const existing = await load()

  if (action === 'enroll') {
    if (!existing) {
      const { error } = await supabaseAdmin.from('client_bill_intake').insert({
        account_id: identity.accountId,
        address_token: newIntakeToken(),
        enrolled_by_email: identity.email,
      })
      // A second tab enrolling at the same moment hits the primary key; that is fine.
      if (error && error.code !== '23505') {
        console.error('[Portal Intake] Enroll failed:', error.message)
        return res.status(500).json({ error: 'Could not turn on automatic intake' })
      }
    } else if (existing.status !== 'active') {
      await supabaseAdmin.from('client_bill_intake').update({ status: 'active', updated_at: new Date().toISOString() }).eq('account_id', identity.accountId)
    }
  } else if (action === 'pause' || action === 'resume') {
    if (!existing) return res.status(400).json({ error: 'Automatic intake is not turned on' })
    await supabaseAdmin
      .from('client_bill_intake')
      .update({ status: action === 'pause' ? 'paused' : 'active', updated_at: new Date().toISOString() })
      .eq('account_id', identity.accountId)
  } else {
    return res.status(400).json({ error: 'Unknown action' })
  }

  return res.status(200).json({ intake: present(await load()) })
}
