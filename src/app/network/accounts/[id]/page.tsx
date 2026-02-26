import { supabaseAdmin } from '@/lib/supabase'
import AccountDossierClient from '@/components/dossier/account-dossier/AccountDossierClient'
import { notFound } from 'next/navigation'

/**
 * Account Dossier Page (Server Component)
 * Hybrid Data Pattern: Fetches initial baseline on server to eliminate layout jumps.
 */
export default async function AccountDossierPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const { id } = params

  // 1. Fetch Primary Account Data on Server
  const { data: account, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !account) {
    notFound()
  }

  // 2. Fetch critical baseline relationships (optional but faster)
  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('accountId', id)
    .limit(10)

  // 3. Construct Initial Intelligence Packet
  const initialData = {
    account,
    contacts: contacts || [],
    calls: [], // We let the client handle heavy call feeds
    tasks: []  // We let the client handle broad task feeds
  }

  return (
    <AccountDossierClient
      id={id}
      initialData={initialData}
    />
  )
}
