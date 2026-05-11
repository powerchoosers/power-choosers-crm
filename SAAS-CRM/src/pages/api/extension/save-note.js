import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { trimText } from './_shared.js'

function appendLogEntry(existing, entry) {
  const current = trimText(existing)
  const next = trimText(entry)
  if (!current) return next
  if (!next) return current
  return `${current}\n\n${next}`
}

export default async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const auth = await requireUser(req)
    if (!auth.user && !auth.isAdmin) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const note = trimText(body.note || body.noteLine || body.text || '')
    if (!note) {
      res.status(400).json({ error: 'Missing note' })
      return
    }

    const contactId = trimText(body.contactId || '')
    const accountId = trimText(body.accountId || '')
    const now = new Date().toISOString()

    if (contactId) {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('contacts')
        .select(`
          *,
          accounts!contacts_accountId_fkey(name, domain, website)
        `)
        .eq('id', contactId)
        .maybeSingle()

      if (contactError) {
        res.status(500).json({ error: 'Failed to load contact', message: contactError.message })
        return
      }

      if (!contact) {
        res.status(404).json({ error: 'Contact not found' })
        return
      }

      const updatedNotes = appendLogEntry(contact.notes, note)
      const { data: updatedContact, error: updateError } = await supabaseAdmin
        .from('contacts')
        .update({
          notes: updatedNotes,
          updatedAt: now,
        })
        .eq('id', contactId)
        .select(`
          *,
          accounts!contacts_accountId_fkey(name, domain, website)
        `)
        .single()

      if (updateError) {
        res.status(500).json({ error: 'Failed to save contact note', message: updateError.message })
        return
      }

      res.status(200).json({
        success: true,
        targetType: 'contact',
        contact: updatedContact,
        accountId: updatedContact?.accountId || contact.accountId || null,
        note,
      })
      return
    }

    if (!accountId) {
      res.status(400).json({ error: 'Missing contactId or accountId' })
      return
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()

    if (accountError) {
      res.status(500).json({ error: 'Failed to load account', message: accountError.message })
      return
    }

    if (!account) {
      res.status(404).json({ error: 'Account not found' })
      return
    }

    const updatedDescription = appendLogEntry(account.description, note)
    const { data: updatedAccount, error: updateError } = await supabaseAdmin
      .from('accounts')
      .update({
        description: updatedDescription,
        updatedAt: now,
      })
      .eq('id', accountId)
      .select('*')
      .single()

    if (updateError) {
      res.status(500).json({ error: 'Failed to save account note', message: updateError.message })
      return
    }

    res.status(200).json({
      success: true,
      targetType: 'account',
      account: updatedAccount,
      accountId: updatedAccount?.id || account.id,
      note,
    })
  } catch (error) {
    console.error('[Extension Save Note] Error:', error)
    res.status(500).json({
      error: 'Log save failed',
      message: error.message,
    })
  }
}
