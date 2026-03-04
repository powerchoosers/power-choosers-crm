import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin, requireUser } from '@/lib/supabase'
// @ts-ignore — Zoho service is JS
import { ZohoMailService } from '../email/zoho-service.js'

const ADMIN_EMAIL = 'l.patterson@nodalpoint.io'
const SIGNAL_EMAIL = 'signal@nodalpoint.io'

function buildInviteEmail(params: {
    firstName: string
    accountName: string
    inviteUrl: string
}): string {
    const { firstName, accountName, inviteUrl } = params
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Nodal Point Portal Access</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:ui-monospace,'SF Mono','Fira Code',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

          <!-- Logo / Header -->
          <tr>
            <td style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Nodal <span style="color:#002FA7;">Point</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 36px;">

              <!-- Label -->
              <p style="margin:0 0 20px 0;font-size:10px;color:#002FA7;letter-spacing:0.3em;text-transform:uppercase;">CLIENT_PORTAL_ACCESS</p>

              <!-- Headline -->
              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">
                Your energy intelligence dashboard is ready.
              </h1>

              <!-- Body -->
              <p style="margin:0 0 8px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
                Your Nodal Point client portal has been activated for <strong style="color:#e4e4e7;">${accountName}</strong>. Click the button below to set up your password and access your forensic energy dashboard.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background:#002FA7;border-radius:10px;">
                    <a href="${inviteUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.1em;text-transform:uppercase;">
                      Activate Portal Access →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 24px 0;" />

              <!-- What they'll see -->
              <p style="margin:0 0 12px 0;font-size:10px;color:#52525b;letter-spacing:0.25em;text-transform:uppercase;">WHAT_YOU'LL_SEE</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                ${['Forensic dashboard — your energy metrics decoded', 'Live contract monitor — stage, term, and expiry alerts', 'Direct line to your advisor — book sessions instantly'].map(item => `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:16px;vertical-align:top;padding-top:1px;">
                          <span style="color:#002FA7;font-size:12px;">›</span>
                        </td>
                        <td style="font-size:12px;color:#a1a1aa;padding-left:8px;">${item}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>

              <!-- Expiry note -->
              <p style="margin:24px 0 0 0;font-size:11px;color:#52525b;line-height:1.5;">
                This invitation link expires in 24 hours. If you have questions, reply to this email or contact your Nodal Point advisor directly.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:10px;color:#3f3f46;letter-spacing:0.2em;text-transform:uppercase;">
                Nodal Point · Client Portal · Energy Intelligence
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

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
        .select('id, email, firstName, lastName, name, accountId')
        .in('id', contactIds)

    if (dbError) {
        return res.status(500).json({ error: dbError.message })
    }

    // Fetch account names for any contacts that have accountIds
    const accountIds = [...new Set((contacts || []).map(c => c.accountId).filter(Boolean))]
    const accountMap: Record<string, string> = {}
    if (accountIds.length > 0) {
        const { data: accounts } = await supabaseAdmin
            .from('accounts')
            .select('id, name')
            .in('id', accountIds)
        for (const a of accounts || []) {
            accountMap[a.id] = a.name
        }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const zohoService = new ZohoMailService()
    const results: Array<{ contactId: string; email: string; status: 'sent' | 'error'; message?: string }> = []

    for (const contact of contacts || []) {
        if (!contact.email) {
            results.push({ contactId: contact.id, email: '', status: 'error', message: 'No email on file' })
            continue
        }

        try {
            // 1. Generate invite link via Supabase admin
            const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
                type: 'invite',
                email: contact.email,
                options: {
                    redirectTo: `${baseUrl}/client`,
                },
            })

            if (linkError || !linkData?.properties?.action_link) {
                // If user already exists, fall back to magic link
                const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink',
                    email: contact.email,
                    options: { redirectTo: `${baseUrl}/client` },
                })

                if (magicError || !magicData?.properties?.action_link) {
                    results.push({ contactId: contact.id, email: contact.email, status: 'error', message: linkError?.message || 'Could not generate link' })
                    continue
                }
            }

            const actionLink = linkData?.properties?.action_link
                || (await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: contact.email, options: { redirectTo: `${baseUrl}/client` } }))?.data?.properties?.action_link
                || `${baseUrl}/portal`

            // 2. Build personalised email
            const firstName = contact.firstName || contact.name?.split(' ')[0] || 'there'
            const accountName = (contact.accountId && accountMap[contact.accountId]) || 'your company'

            const html = buildInviteEmail({ firstName, accountName, inviteUrl: actionLink })

            // 3. Send via Zoho signal@nodalpoint.io
            await zohoService.sendEmail({
                to: contact.email,
                subject: `${accountName} — Your Nodal Point Portal is Ready`,
                html,
                from: SIGNAL_EMAIL,
                fromName: 'Nodal Point',
                userEmail: ADMIN_EMAIL,
            })

            results.push({ contactId: contact.id, email: contact.email, status: 'sent' })

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
