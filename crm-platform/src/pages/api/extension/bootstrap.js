import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { inferNameParts, trimText } from './_shared.js'

function normalizePhoneNumber(value) {
  const raw = trimText(value)
  if (!raw) return null

  if (raw.startsWith('+')) {
    const cleaned = '+' + raw.slice(1).replace(/\D/g, '')
    return /^\+\d{10,15}$/.test(cleaned) ? cleaned : null
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

function normalizeTwilioNumbers(raw) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') {
        const number = normalizePhoneNumber(entry)
        if (!number) return null
        return { name: 'Primary', number, selected: false }
      }
      if (typeof entry === 'object') {
        const candidate = entry
        const number = normalizePhoneNumber(candidate.number ?? candidate.phone ?? '')
        if (!number) return null
        return {
          name: trimText(candidate.name ?? 'Primary') || 'Primary',
          number,
          selected: Boolean(candidate.selected || false)
        }
      }
      return null
    })
    .filter(Boolean)
}

function normalizeProfile(row, emailFallback) {
  if (!row) return null

  const settings = (row.settings && typeof row.settings === 'object' ? row.settings : {}) || {}
  const inferred = inferNameParts(
    trimText(row.first_name || row.firstName || settings.name || row.name || emailFallback || '')
  )

  const twilioNumbers = normalizeTwilioNumbers(settings.twilioNumbers || [])
  
  // 1. Prioritize top-level settings.selectedPhoneNumber
  // 2. Fallback to the one marked 'selected' in the array
  // 3. Last fallback to the first number in the array
  const markedInArray = twilioNumbers.find(item => item.selected)?.number
  const selectedPhoneNumber = normalizePhoneNumber(
    settings.selectedPhoneNumber || markedInArray || row.selected_phone_number || row.selectedPhoneNumber || twilioNumbers[0]?.number || ''
  ) || null

  return {
    email: trimText(row.email || emailFallback || '') || null,
    name: trimText(row.name || settings.name || inferred.fullName || '') || null,
    firstName: trimText(row.first_name || row.firstName || settings.firstName || inferred.firstName || '') || null,
    lastName: trimText(row.last_name || row.lastName || settings.lastName || inferred.lastName || '') || null,
    jobTitle: trimText(row.job_title || row.jobTitle || settings.jobTitle || '') || null,
    hostedPhotoUrl: trimText(row.hosted_photo_url || row.hostedPhotoUrl || settings.hostedPhotoUrl || settings.avatar_url || '') || null,
    city: trimText(settings.city || row.city || '') || null,
    state: trimText(settings.state || row.state || '') || null,
    website: trimText(settings.website || row.website || '') || null,
    twilioNumbers,
    selectedPhoneNumber,
    bridgeToMobile: Boolean(settings.bridgeToMobile || row.bridge_to_mobile || row.bridgeToMobile || false),
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const auth = await requireUser(req)
    const email = trimText(auth.email || auth.user?.email || '') || null
    const userId = trimText(auth.id || auth.user?.id || '') || null

    if (!auth.user && !auth.isAdmin) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    let row = null

    if (userId) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      row = data || null
    }

    if (!row && email) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle()
      row = data || null
    }

    const profile = normalizeProfile(row, email)

    res.status(200).json({
      success: true,
      profile,
    })
  } catch (error) {
    console.error('[Extension Bootstrap] Error:', error)
    res.status(500).json({
      error: 'Bootstrap failed',
      message: error.message,
    })
  }
}
