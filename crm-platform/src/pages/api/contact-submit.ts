import type { NextApiRequest, NextApiResponse } from 'next'
import sgMail from '@sendgrid/mail'
import { cors } from './_cors.js'

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (cors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, company, email, message } = req.body
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    await sgMail.send({
      to: 'signal@nodalpoint.io',
      from: 'signal@nodalpoint.io',
      replyTo: email,
      subject: `[Contact] ${name}${company ? ` — ${company}` : ''}`,
      html: `
        <div style="font-family: monospace; font-size: 14px; color: #333; max-width: 600px;">
          <h2 style="color: #002FA7; margin-bottom: 24px;">New Contact Form Submission</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666; width: 120px;">Name</td><td style="padding: 8px 0;">${name}</td></tr>
            ${company ? `<tr><td style="padding: 8px 0; color: #666;">Company</td><td style="padding: 8px 0;">${company}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #002FA7;">${email}</a></td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #666; margin-bottom: 8px;">Message:</p>
          <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
        </div>
      `,
    })
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[Contact Submit]', err)
    return res.status(500).json({ error: 'Failed to send message' })
  }
}
