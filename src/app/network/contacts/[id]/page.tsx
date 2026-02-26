import { supabaseAdmin } from '@/lib/supabase'
import ContactDossierClient from '@/components/dossier/contact-dossier/ContactDossierClient'
import { notFound } from 'next/navigation'

/**
 * Contact Dossier Page (Server Component)
 * Hybrid Data Pattern: Fetches initial baseline on server to eliminate layout jumps.
 */
export default async function ContactDossierPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const { id } = params

  // 1. Fetch Primary Contact Data on Server
  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !contact) {
    notFound()
  }

  // 2. Fetch linked account (optional but prevents secondary flicker)
  let account = null
  if (contact.accountId) {
    const { data: accountData } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', contact.accountId)
      .single()
    account = accountData
  }

  // 3. Construct Initial Intelligence Packet
  const initialData = {
    contact,
    account,
    tasks: [] // Let client handle broad tasks
  }

  return (
    <ContactDossierClient
      id={id}
      initialData={initialData}
    />
  )
}
