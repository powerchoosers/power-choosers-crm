import { cors } from '../_cors.js'
import { trimText } from './_shared.js'

const SUPABASE_URL = trimText(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
const SUPABASE_ANON_KEY = trimText(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '')

function normalizeSession(data) {
  if (!data || typeof data !== 'object') return null

  const session = data.session && typeof data.session === 'object' ? data.session : data

  return {
    access_token: trimText(session.access_token || session.accessToken || session.token || ''),
    refresh_token: trimText(session.refresh_token || session.refreshToken || ''),
    expires_in: Number(session.expires_in || session.expiresIn || 0) || null,
    expires_at: trimText(session.expires_at || session.expiresAt || '') || null,
    token_type: trimText(session.token_type || session.tokenType || 'bearer') || 'bearer',
    user: session.user || null,
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.status(500).json({ error: 'Supabase is not configured for session refresh.' })
      return
    }

    const body = req.body || {}
    const refreshToken = trimText(body.refreshToken || body.refresh_token || '')

    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refresh token' })
      return
    }

    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    })

    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (!response.ok) {
      const message = typeof data === 'object' && data ? (data.error_description || data.error || data.message) : data
      res.status(response.status).json({
        error: message || `Refresh failed (${response.status})`,
      })
      return
    }

    const session = normalizeSession(data)

    if (!session?.access_token) {
      res.status(502).json({ error: 'Refresh did not return a usable session.' })
      return
    }

    res.status(200).json({
      success: true,
      session,
    })
  } catch (error) {
    console.error('[Extension Refresh] Error:', error)
    res.status(500).json({
      error: 'Refresh failed',
      message: error.message,
    })
  }
}
