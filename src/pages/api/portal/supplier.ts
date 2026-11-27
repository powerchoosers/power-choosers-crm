import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePortalAccount } from '@/lib/portal/server'
import { ensureSupplier, findSupplier, lookUpSupplierContact, supplierKey } from '@/lib/portal/suppliers'

export const config = { maxDuration: 45 }

type PhoneSource = 'advisor' | 'bill' | 'web'

/**
 * GET: who the client's electricity supplier is and how to reach them.
 * Order of trust for the phone number: advisor-confirmed, then the client's own
 * latest bill, then a web lookup (shown with its source link, marked unconfirmed).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const identity = await resolvePortalAccount(req)
  if (!identity) return res.status(401).json({ error: 'Unauthorized' })

  const [{ data: accounts }, { data: bills }] = await Promise.all([
    supabaseAdmin.from('accounts').select('electricity_supplier').eq('id', identity.accountId).limit(1),
    supabaseAdmin
      .from('client_bills')
      .select('supplier_name, account_number, period_end, extracted')
      .eq('account_id', identity.accountId)
      .in('status', ['ready', 'needs_review'])
      .not('supplier_name', 'is', null)
      .order('period_end', { ascending: false, nullsFirst: false })
      .limit(6),
  ])

  const onFile = String(accounts?.[0]?.electricity_supplier || '').trim()
  const latestBill = bills?.[0] || null
  const name = onFile || latestBill?.supplier_name || ''
  if (!name) return res.status(200).json({ supplier: null })

  // Only a name an advisor put on the account may create a directory entry or trigger a web search.
  let supplier = onFile ? await ensureSupplier(onFile) : await findSupplier(name)
  const key = supplier?.name_key || supplierKey(name)

  // The newest bill from this same supplier that printed a phone number.
  const billWithPhone = (bills || []).find((bill) => {
    const facts = (bill.extracted as { facts?: { supplierPhone?: string | null } } | null)?.facts
    if (!facts?.supplierPhone) return false
    const billKey = supplierKey(bill.supplier_name)
    return billKey === key || (supplier?.aliases || []).includes(billKey)
  })
  const billFacts = (billWithPhone?.extracted as { facts?: Record<string, string | null> } | null)?.facts

  let phone: string | null = null
  let phoneSource: PhoneSource | null = null
  if (supplier?.support_phone && supplier.phone_source === 'advisor') {
    phone = supplier.support_phone
    phoneSource = 'advisor'
  } else if (billFacts?.supplierPhone) {
    phone = billFacts.supplierPhone
    phoneSource = 'bill'
  } else if (supplier) {
    if (onFile) supplier = await lookUpSupplierContact(supplier)
    if (supplier.support_phone) {
      phone = supplier.support_phone
      phoneSource = (supplier.phone_source as PhoneSource) || 'web'
    }
  }

  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json({
    supplier: {
      name: supplier?.name || name,
      phone,
      phoneSource,
      phoneSourceUrl: phoneSource === 'web' ? supplier?.source_url || null : null,
      phoneBillDate: phoneSource === 'bill' ? billWithPhone?.period_end || null : null,
      hours: phoneSource === 'bill' ? null : supplier?.support_hours || null,
      email: billFacts?.supplierEmail || supplier?.support_email || null,
      website: supplier?.website || billFacts?.supplierWebsite || null,
      accountNumber: latestBill?.account_number || null,
    },
  })
}
