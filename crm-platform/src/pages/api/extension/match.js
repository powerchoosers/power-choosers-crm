import { cors } from '../_cors.js'
import { requireUser, supabaseAdmin } from '@/lib/supabase'
import {
  extractDomain,
  extractEmailCandidates,
  extractPhoneCandidates,
  inferNameParts,
  normalizeOrigin,
  normalizeDigits,
  tokenizeSearchText,
  trimText,
  unique,
} from './_shared.js'

function applyLegacyOwnershipScope(query, user, isAdmin) {
  if (isAdmin) return query

  const uid = trimText(user?.id || '') || ''
  const email = trimText(user?.email || '').toLowerCase().trim()

  if (uid && email) {
    return query.or(`ownerId.eq.${uid},ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`)
  }
  if (uid) return query.or(`ownerId.eq.${uid},ownerId.is.null`)
  if (email) return query.or(`ownerId.eq.${email},metadata->>ownerId.eq.${email},ownerId.is.null`)
  return query
}

function normalizeAccountRow(row, score = 0, reason = 'Matched from CRM data') {
  if (!row) return null
  return {
    id: trimText(row.id),
    name: trimText(row.name || row.domain || row.website || 'Unknown account'),
    domain: trimText(row.domain) || null,
    industry: trimText(row.industry || row.metadata?.industry) || null,
    city: trimText(row.city) || null,
    state: trimText(row.state) || null,
    phone: trimText(row.phone) || null,
    logoUrl: trimText(row.logoUrl || row.logo_url || row.metadata?.logoUrl || row.metadata?.logo_url) || null,
    description: trimText(row.description || row.metadata?.description) || null,
    website: trimText(row.website || row.metadata?.website) || null,
    score: Number(score) || 0,
    reason: trimText(reason) || 'Matched from CRM data',
  }
}

function normalizeContactRow(row, score = 0, reason = 'Matched from CRM data') {
  if (!row) return null
  const firstName = trimText(row.firstName || row.first_name)
  const lastName = trimText(row.lastName || row.last_name)
  const name = trimText(row.name || [firstName, lastName].filter(Boolean).join(' ') || row.email || 'Unknown contact')
  return {
    id: trimText(row.id),
    accountId: trimText(row.accountId || row.account_id) || null,
    accountName: trimText(row.accountName || row.accounts?.name) || null,
    accountDomain: trimText(row.accountDomain || row.accounts?.domain) || null,
    name,
    email: trimText(row.email) || null,
    title: trimText(row.title) || null,
    phone: trimText(row.phone) || null,
    mobile: trimText(row.mobile) || null,
    workPhone: trimText(row.workPhone) || null,
    companyPhone: trimText(row.companyPhone) || null,
    city: trimText(row.city) || null,
    state: trimText(row.state) || null,
    score: Number(score) || 0,
    reason: trimText(reason) || 'Matched from CRM data',
  }
}

function scoreText(haystack, tokens, weight = 8) {
  const text = trimText(haystack).toLowerCase()
  if (!text || !Array.isArray(tokens) || tokens.length === 0) return 0
  let score = 0
  for (const token of tokens) {
    if (text.includes(token)) score += weight
  }
  return score
}

function hostMatches(pageDomain, candidateValue) {
  const pageHost = extractDomain(pageDomain)
  const candidateHost = extractDomain(candidateValue)
  if (!pageHost || !candidateHost) return false
  return (
    pageHost === candidateHost ||
    pageHost.endsWith(`.${candidateHost}`) ||
    candidateHost.endsWith(`.${pageHost}`)
  )
}

function resolveAppOrigin(req, payloadOrigin) {
  const explicit = normalizeOrigin(payloadOrigin)
  if (explicit && !explicit.startsWith('chrome-extension://')) {
    return explicit
  }

  const envOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (envOrigin && !envOrigin.startsWith('chrome-extension://')) {
    return envOrigin
  }

  const proto = trimText(req.headers['x-forwarded-proto'] || '') || 'https'
  const host = trimText(req.headers.host || '') || 'www.nodalpoint.io'
  return `${proto}://${host}`
}

async function fetchPhoneMatch(appOrigin, authHeader, phone) {
  const response = await fetch(`${appOrigin}/api/search?phone=${encodeURIComponent(phone)}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
    },
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
    return null
  }

  return data
}

function collectPageTerms(snapshot, bodyText) {
  const pieces = [
    snapshot?.title,
    snapshot?.selectedText,
    snapshot?.description,
    ...(Array.isArray(snapshot?.headings) ? snapshot.headings.slice(0, 5) : []),
    bodyText,
    extractDomain(snapshot?.url || snapshot?.origin || '')?.split('.').join(' '),
  ]

  return tokenizeSearchText(pieces.filter(Boolean).join(' '), 12)
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

    const body = req.body || {}
    const snapshot = body && typeof body === 'object' ? body : {}
    const appOrigin = resolveAppOrigin(req, body.appOrigin)
    const authHeader = String(req.headers.authorization || '')

    const domain = extractDomain(snapshot.origin || snapshot.url || '')
    const phones = unique([
      ...extractPhoneCandidates(snapshot.selectedText),
      ...extractPhoneCandidates(snapshot.description),
      ...extractPhoneCandidates(Array.isArray(snapshot.headings) ? snapshot.headings.join(' ') : ''),
      ...extractPhoneCandidates(body.bodyText || ''),
      ...extractPhoneCandidates(snapshot.url || ''),
    ])
    const emails = unique([
      ...extractEmailCandidates(snapshot.selectedText),
      ...extractEmailCandidates(snapshot.description),
      ...extractEmailCandidates(Array.isArray(snapshot.headings) ? snapshot.headings.join(' ') : ''),
      ...extractEmailCandidates(body.bodyText || ''),
    ])
    const tokens = collectPageTerms(snapshot, body.bodyText || '')
    const title = trimText(snapshot.title || '')
    const companyGuess = trimText(inferNameParts(title).fullName || title || '')

    const accountMap = new Map()
    const contactMap = new Map()
    const summaryParts = []

    for (const phone of phones.slice(0, 3)) {
      try {
        const data = await fetchPhoneMatch(appOrigin, authHeader, phone)
        if (data?.account) {
          const account = normalizeAccountRow(
            {
              ...data.account,
              score: 120,
            },
            120,
            `Phone match: ${phone}`
          )
          if (account) accountMap.set(account.id, account)
          summaryParts.push(`Phone match found for ${phone}`)
        }
        if (data?.contact) {
          const contact = normalizeContactRow(
            {
              ...data.contact,
              score: 130,
            },
            130,
            `Phone match: ${phone}`
          )
          if (contact) {
            contactMap.set(contact.id, contact)
            if (contact.accountId && contact.accountName && !accountMap.has(contact.accountId)) {
              accountMap.set(
                contact.accountId,
                normalizeAccountRow(
                  {
                    id: contact.accountId,
                    name: contact.accountName,
                    domain: contact.accountDomain,
                  },
                  Math.max(85, contact.score - 10),
                  `Matched through ${contact.name}`
                )
              )
            }
          }
          summaryParts.push(`Contact match found for ${phone}`)
        }
      } catch (error) {
        console.warn('[Extension Match] Phone lookup failed:', error)
      }
    }

    const accountClauses = []
    if (domain) {
      accountClauses.push(`domain.eq.${domain}`)
      accountClauses.push(`domain.ilike.%${domain}%`)
      accountClauses.push(`website.ilike.%${domain}%`)
    }
    for (const token of tokens.slice(0, 4)) {
      accountClauses.push(`name.ilike.%${token}%`)
      accountClauses.push(`domain.ilike.%${token}%`)
      accountClauses.push(`industry.ilike.%${token}%`)
      accountClauses.push(`city.ilike.%${token}%`)
      accountClauses.push(`state.ilike.%${token}%`)
    }
    if (companyGuess && companyGuess.length >= 3) {
      accountClauses.push(`name.ilike.%${companyGuess.split(' ')[0]}%`)
    }

    if (accountClauses.length > 0) {
      let accountQuery = supabaseAdmin
        .from('accounts')
        .select('id, name, domain, phone, website, city, state, industry, logo_url, description, metadata')
        .or(unique(accountClauses).join(','))
        .limit(300)

      accountQuery = applyLegacyOwnershipScope(accountQuery, auth.user, auth.isAdmin)

      const { data: accountRows, error: accountError } = await accountQuery
      if (accountError) {
        console.warn('[Extension Match] Account lookup failed:', accountError.message)
      } else if (Array.isArray(accountRows)) {
        for (const row of accountRows) {
          const normalized = normalizeAccountRow(row)
          if (!normalized) continue

          const accountDomainHost = extractDomain(normalized.domain)
          const accountWebsiteHost = extractDomain(normalized.website)
          
          let score = scoreText(normalized.name, tokens, 12)
          score += scoreText(normalized.domain, tokens, 10)
          score += scoreText(normalized.industry, tokens, 7)
          score += scoreText(normalized.city, tokens, 6)
          score += scoreText(normalized.state, tokens, 6)

          const isDomainMatch = domain && (hostMatches(domain, normalized.domain) || hostMatches(domain, normalized.website))
          
          if (isDomainMatch) {
            // ULTIMATE boost for direct domain/host match — forensic priority
            score += 10000
          }

          // Exact name match boost
          const cleanRowName = normalized.name.toLowerCase().trim()
          const cleanCompanyGuess = companyGuess.toLowerCase().trim()
          const cleanPageTitle = title.toLowerCase().trim()

          if (cleanRowName === cleanCompanyGuess || cleanRowName === cleanPageTitle) {
            score += 500
          } else if ((cleanRowName.includes(cleanCompanyGuess) && cleanRowName.length < cleanCompanyGuess.length + 10) || 
                     (cleanCompanyGuess.includes(cleanRowName) && cleanCompanyGuess.length < cleanRowName.length + 10)) {
            score += 150
          } else if (cleanRowName.includes(cleanCompanyGuess) || cleanPageTitle.includes(cleanRowName)) {
            score += 40
          }

          if (domain && accountDomainHost) {
            const domainTokens = tokenizeSearchText(domain.replace(/\./g, ' '), 4)
            score += scoreText(accountDomainHost, domainTokens, 18)
            score += scoreText(accountWebsiteHost, domainTokens, 12)
          }

          if (phones.some((phone) => normalizeDigits(normalized.phone) === phone)) score += 150
          if (domain && normalized.domain && normalized.domain.includes(domain)) score += 5000
          
          // Punish very short name matches that are just subsets (e.g. "Texas" matching "North Central Texas College")
          // if we already have a better match. But for now, we rely on the 500pt domain boost.

          normalized.score = score
          normalized.reason = isDomainMatch
              ? `Direct Domain Match: ${domain}`
              : phones.some((phone) => normalizeDigits(normalized.phone) === phone)
                ? `Phone match: ${normalized.phone}`
                : `Matched from CRM data`

          accountMap.set(normalized.id, normalized)
        }
      }
    }

    const accountIdsForContacts = unique(
      Array.from(accountMap.values())
        .map((account) => account.id)
        .filter(Boolean)
    ).slice(0, 6)

    const contactClauses = []
    for (const email of emails.slice(0, 5)) {
      contactClauses.push(`email.eq.${email}`)
    }
    for (const token of tokens.slice(0, 5)) {
      contactClauses.push(`name.ilike.%${token}%`)
      contactClauses.push(`firstName.ilike.%${token}%`)
      contactClauses.push(`lastName.ilike.%${token}%`)
      contactClauses.push(`title.ilike.%${token}%`)
      contactClauses.push(`city.ilike.%${token}%`)
      contactClauses.push(`state.ilike.%${token}%`)
    }

    let contactQuery = supabaseAdmin
      .from('contacts')
      .select(`
        id,
        accountId,
        firstName,
        lastName,
        name,
        email,
        phone,
        mobile,
        workPhone,
        companyPhone,
        title,
        city,
        state,
        metadata,
        accounts (
          id,
          name,
          domain,
          phone,
          website,
          city,
          state,
          industry,
          logo_url,
          description
        )
      `)
      .limit(50)

    if (contactClauses.length > 0) {
      contactQuery = contactQuery.or(unique(contactClauses).join(','))
    }

    if (accountIdsForContacts.length > 0) {
      contactQuery = contactQuery.in('accountId', accountIdsForContacts)
    }

    contactQuery = applyLegacyOwnershipScope(contactQuery, auth.user, auth.isAdmin)

    const { data: contactRows, error: contactError } = await contactQuery
    if (contactError) {
      console.warn('[Extension Match] Contact lookup failed:', contactError.message)
    } else if (Array.isArray(contactRows)) {
      for (const row of contactRows) {
        const normalized = normalizeContactRow(row)
        if (!normalized) continue
        const contactAccountDomainHost = extractDomain(normalized.accountDomain)

        let score = 0
        score += scoreText(normalized.name, tokens, 12)
        score += scoreText(normalized.email, emails, 20)
        score += scoreText(normalized.title, tokens, 7)
        score += scoreText(normalized.accountName, tokens, 8)
        score += scoreText(normalized.accountDomain, tokens, 10)
        if (domain && hostMatches(domain, normalized.accountDomain)) score += 45
        if (domain && contactAccountDomainHost) {
          const domainTokens = tokenizeSearchText(domain.replace(/\./g, ' '), 4)
          score += scoreText(contactAccountDomainHost, domainTokens, 12)
        }
        if (normalized.email && emails.includes(normalized.email.toLowerCase())) score += 90
        if (normalized.phone && phones.includes(normalizeDigits(normalized.phone).slice(-10))) score += 85
        if (normalized.mobile && phones.includes(normalizeDigits(normalized.mobile).slice(-10))) score += 80
        if (normalized.workPhone && phones.includes(normalizeDigits(normalized.workPhone).slice(-10))) score += 80

        normalized.score = score
        normalized.reason =
          normalized.email && emails.includes(normalized.email.toLowerCase())
            ? `Email match: ${normalized.email}`
            : normalized.phone && phones.includes(normalizeDigits(normalized.phone).slice(-10))
              ? `Phone match: ${normalized.phone}`
              : domain && hostMatches(domain, normalized.accountDomain)
                ? `Account domain match: ${extractDomain(normalized.accountDomain) || normalized.accountDomain}`
                : `Matched from CRM data`

        contactMap.set(normalized.id, normalized)

        if (normalized.accountId && normalized.accountName && !accountMap.has(normalized.accountId)) {
          accountMap.set(
            normalized.accountId,
            normalizeAccountRow(
              {
                id: normalized.accountId,
                name: normalized.accountName,
                domain: normalized.accountDomain,
              },
              Math.max(75, normalized.score - 10),
              `Matched through ${normalized.name}`
            )
          )
        }
      }
    }

    const accounts = Array.from(accountMap.values()).sort((a, b) => b.score - a.score)
    const contacts = Array.from(contactMap.values()).sort((a, b) => b.score - a.score)
    const bestAccount = accounts[0] || null
    const bestContact = contacts[0] || null

    // Final selection logic: Prioritize the highest-confidence match between account and contact data
    let finalAccount = bestAccount
    if (bestContact?.id && contactAccountMap.has(bestContact.id)) {
      const contactAccount = contactAccountMap.get(bestContact.id)
      const contactAccountScore = bestContact.score
      const standaloneAccountScore = bestAccount?.score || 0

      // Only switch to the contact's account if its match confidence is higher than the standalone account score
      if (contactAccount && contactAccountScore > standaloneAccountScore) {
        finalAccount = contactAccount
      }
    }

    let summary = 'No strong CRM match found yet.'
    if (finalAccount && bestContact && finalAccount.id === bestContact.accountId) {
      summary = `Matched ${bestContact.name} to ${finalAccount.name}.`
    } else if (finalAccount) {
      summary = `Matched the page to ${finalAccount.name}.`
    } else if (bestContact) {
      summary = `Matched the page to ${bestContact.name}.`
    }

    if (phones.length > 0 && summaryParts.length > 0) {
      summary = `${summaryParts[0]}. ${summary}`
    }

    res.status(200).json({
      success: true,
      account: finalAccount,
      contact: bestContact,
      accounts,
      contacts,
      summary,
      matchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Extension Match] Error:', error)
    res.status(500).json({
      error: 'Match failed',
      message: error.message,
    })
  }
}
