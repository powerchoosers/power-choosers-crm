import type { NextApiRequest, NextApiResponse } from 'next'
import React from 'react'
import sgMail from '@sendgrid/mail'
import { render } from '@react-email/render'
import { cors } from './_cors.js'
import ContactAdminAlert from '../../emails/ContactAdminAlert'
import ContactConfirmation from '../../emails/ContactConfirmation'

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')

const APOLLO_BASE_URL = 'https://api.apollo.io/v1'
const ADMIN_EMAIL = 'l.patterson@nodalpoint.io'
const FROM_EMAIL = 'signal@nodalpoint.io'

async function enrichViaApollo(email: string, name: string, company?: string) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) return null

  try {
    const nameParts = name.trim().split(' ')
    const body: Record<string, string | boolean> = { email }
    if (nameParts[0]) body.first_name = nameParts[0]
    if (nameParts.length > 1) body.last_name = nameParts.slice(1).join(' ')
    if (company) body.organization_name = company

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    let resp: Response
    try {
      resp = await fetch(`${APOLLO_BASE_URL}/people/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!resp.ok) return null
    const data = await resp.json()
    const p = data?.person
    if (!p) return null

    return {
      jobTitle: p.title || p.headline || '',
      companyName: p.organization?.name || '',
      linkedin: p.linkedin_url || '',
      location: [p.city, p.state].filter(Boolean).join(', '),
      seniority: p.seniority || '',
      industry: p.organization?.industry || '',
      phone: p.phone_numbers?.[0]?.sanitized_number || '',
    }
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (cors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, company, email, message } = req.body
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // 1. Render confirmation email and kick off Apollo enrichment in parallel
    const [confirmationHtml, enrichment] = await Promise.all([
      render(<ContactConfirmation name={name} />),
      enrichViaApollo(email, name, company),
    ])

    // 2. Send confirmation to submitter
    await sgMail.send({
      to: email,
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      subject: 'Signal received // Nodal Point',
      html: confirmationHtml,
    })

    // 3. Render + send admin alert with enrichment data if available
    const adminHtml = await render(
      <ContactAdminAlert
        name={name}
        company={company}
        email={email}
        message={message}
        enrichment={enrichment ?? undefined}
      />
    )
    await sgMail.send({
      to: ADMIN_EMAIL,
      from: FROM_EMAIL,
      replyTo: email,
      subject: `[CONTACT] ${name}${company ? ` — ${company}` : ''}`,
      html: adminHtml,
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[Contact Submit]', err)
    return res.status(500).json({ error: 'Failed to send message' })
  }
}
