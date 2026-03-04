import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Auth guard — must be a valid Nodal Point user
    const { email: callerEmail } = await requireUser(req)
    if (!callerEmail) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const { contactIds } = req.body as { contactIds: string[] }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({ error: 'contactIds array is required' })
    }

    if (contactIds.length > 20) {
        return res.status(400).json({ error: 'Max 20 contacts per request' })
    }

    // Fetch contacts from DB
    const { data: contacts, error: dbError } = await supabaseAdmin
        .from('contacts')
        .select('id, email, firstName, lastName, name')
        .in('id', contactIds)

    if (dbError) {
        return res.status(500).json({ error: dbError.message })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'

    const results: Array<{ contactId: string; email: string; status: 'sent' | 'error'; message?: string }> = []

    for (const contact of contacts || []) {
        if (!contact.email) {
            results.push({ contactId: contact.id, email: '', status: 'error', message: 'No email on file' })
            continue
        }

        try {
            const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
                contact.email,
                {
                    redirectTo: `${baseUrl}/portal`,
                    data: {
                        contactId: contact.id,
                        source: 'portal_access_invite',
                    },
                }
            )

            if (inviteError) {
                // If user already exists, that's okay — they can still log in
                const isAlreadyExists = inviteError.message?.toLowerCase().includes('already been registered')
                    || inviteError.message?.toLowerCase().includes('already exists')
                    || inviteError.status === 422

                results.push({
                    contactId: contact.id,
                    email: contact.email,
                    status: isAlreadyExists ? 'sent' : 'error',
                    message: isAlreadyExists ? 'User already has access' : inviteError.message,
                })
            } else {
                results.push({ contactId: contact.id, email: contact.email, status: 'sent' })
            }
        } catch (err: any) {
            results.push({ contactId: contact.id, email: contact.email, status: 'error', message: err.message })
        }
    }

    const sent = results.filter(r => r.status === 'sent').length
    const failed = results.filter(r => r.status === 'error').length

    return res.status(200).json({
        results,
        summary: { sent, failed, total: results.length },
    })
}
