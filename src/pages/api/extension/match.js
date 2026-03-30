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
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const firstName = trimText(row.firstName || row.first_name)
  const lastName = trimText(row.lastName || row.last_name)
  const name = trimText(row.name || [firstName, lastName].filter(Boolean).join(' ') || row.email || 'Unknown contact')
  return {
    id: trimText(row.id),
    accountId: trimText(row.accountId || row.account_id) || null,
    accountName: trimText(row.accountName || row.accounts?.name) || null,
    accountDomain: trimText(row.accountDomain || row.accounts?.domain) || null,
    name,
    photoUrl: trimText(
      row.photoUrl ||
        row.photo_url ||
        row.avatarUrl ||
        row.avatar_url ||
        metadata.photoUrl ||
        metadata.photo_url ||
        metadata.avatarUrl ||
        metadata.avatar_url ||
        ''
    ) || null,
    email: trimText(row.email) || null,
    title: trimText(row.title) || null,
    linkedinUrl: trimText(row.linkedinUrl || row.linkedin_url || metadata.linkedinUrl || metadata.linkedin_url || '') || null,
    phone: trimText(row.phone) || null,
    mobile: trimText(row.mobile) || null,
    workPhone: trimText(row.workPhone) || null,
    companyPhone: trimText(row.companyPhone) || null,
    otherPhone: trimText(row.otherPhone) || null,
    primaryPhoneField: trimText(row.primaryPhoneField || metadata.primaryPhoneField || '') || null,
    directPhone: trimText(
      row.directPhone ||
        metadata.directPhone ||
        metadata.direct_phone ||
        metadata.original_apollo_data?.directPhone ||
        metadata.original_apollo_data?.direct_phone
    ) || null,
    city: trimText(row.city) || null,
    state: trimText(row.state) || null,
    score: Number(score) || 0,
    reason: trimText(reason) || 'Matched from CRM data',
  }
}

function normalizeLinkedinUrl(value) {
  const text = trimText(value).toLowerCase()
  if (!text) return ''
  try {
    const parsed = new URL(text.includes('://') ? text : `https://${text.replace(/^\/+/, '')}`)
    const hostname = parsed.hostname.replace(/^www\./, '')
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${hostname}${pathname}`.replace(/\/+$/, '')
  } catch {
    return text
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
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

function normalizeCompanyName(value) {
  const text = trimText(value).toLowerCase()
  if (!text) return ''
  return text
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(inc|llc|ltd|lp|corp|corporation|co|company|plc|holdings?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isExactCompanyNameMatch(left, right) {
  const a = normalizeCompanyName(left)
  const b = normalizeCompanyName(right)
  return Boolean(a && b && a === b)
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
    const pageLinkedinUrl = normalizeLinkedinUrl(snapshot.url || snapshot.origin || '')
    const pageLinkedinSlug = pageLinkedinUrl.includes('linkedin.com/')
      ? pageLinkedinUrl.split('linkedin.com/').pop()
      : ''

    const accountMap = new Map()
    const contactMap = new Map()
    const summaryParts = []
    const contactSelect = `
        id,
        accountId,
        firstName,
        lastName,
        name,
        email,
        linkedinUrl,
        phone,
        mobile,
        workPhone,
        companyPhone,
        primaryPhoneField,
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
      `
    let directLinkedinContact = null

    if (pageLinkedinUrl) {
      const directLinkedinLookup = pageLinkedinUrl.includes('linkedin.com/')
        ? pageLinkedinUrl.split('linkedin.com/').pop() || pageLinkedinSlug
        : pageLinkedinSlug
      const directLinkedinPattern = `%${directLinkedinLookup || pageLinkedinUrl}%`

      try {
        let directLinkedinQuery = supabaseAdmin
          .from('contacts')
          .select(contactSelect)
          .ilike('linkedinUrl', directLinkedinPattern)
          .order('updatedAt', { ascending: false })
          .limit(25)

        directLinkedinQuery = applyLegacyOwnershipScope(directLinkedinQuery, auth.user, auth.isAdmin)

        const { data: directLinkedinRows, error: directLinkedinError } = await directLinkedinQuery
        if (directLinkedinError) {
          console.warn('[Extension Match] LinkedIn contact lookup failed:', directLinkedinError.message)
        } else if (Array.isArray(directLinkedinRows)) {
          for (const row of directLinkedinRows) {
            const normalized = normalizeContactRow(row, 10000, `LinkedIn URL match: ${row?.linkedinUrl || pageLinkedinUrl}`)
            if (!normalized) continue

            const normalizedLinkedin = normalizeLinkedinUrl(normalized.linkedinUrl)
            const normalizedLinkedinSlug = normalizedLinkedin.includes('linkedin.com/')
              ? normalizedLinkedin.split('linkedin.com/').pop()
              : ''
            const isExactLinkedinMatch =
              Boolean(directLinkedinLookup && normalizedLinkedinSlug) &&
              (directLinkedinLookup === normalizedLinkedinSlug ||
                normalizedLinkedin.includes(directLinkedinLookup) ||
                directLinkedinLookup.includes(normalizedLinkedinSlug))

            if (!isExactLinkedinMatch) continue

            normalized.score = Math.max(Number(normalized.score || 0), 10000)
            normalized.reason = `LinkedIn URL match: ${normalized.linkedinUrl}`
            contactMap.set(normalized.id, normalized)
            directLinkedinContact = normalized

            if (normalized.accountId && normalized.accountName && !accountMap.has(normalized.accountId)) {
              accountMap.set(
                normalized.accountId,
                normalizeAccountRow(
                  {
                    id: normalized.accountId,
                    name: normalized.accountName,
                    domain: normalized.accountDomain,
                  },
                  Math.max(85, normalized.score - 10),
                  `Matched through ${normalized.name}`
                )
              )
            }

            break
          }
        }
      } catch (error) {
        console.warn('[Extension Match] Direct LinkedIn lookup failed:', error)
      }
    }

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
          const isExactNameMatch =
            isExactCompanyNameMatch(normalized.name, companyGuess) ||
            isExactCompanyNameMatch(normalized.name, title)

          if (isExactNameMatch || cleanRowName === cleanCompanyGuess || cleanRowName === cleanPageTitle) {
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
            ? `Exact domain match: ${domain}`
            : isExactNameMatch
              ? `Exact company name match: ${normalized.name}`
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
    if (pageLinkedinSlug) {
      contactClauses.push(`linkedinUrl.ilike.%${pageLinkedinSlug}%`)
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
        linkedinUrl,
        phone,
        mobile,
        workPhone,
        companyPhone,
        primaryPhoneField,
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
        const normalizedLinkedin = normalizeLinkedinUrl(normalized.linkedinUrl)
        const normalizedLinkedinSlug = normalizedLinkedin.includes('linkedin.com/')
          ? normalizedLinkedin.split('linkedin.com/').pop()
          : ''
        const isLinkedinMatch =
          Boolean(pageLinkedinSlug && normalizedLinkedinSlug) &&
          (pageLinkedinSlug === normalizedLinkedinSlug ||
            normalizedLinkedin.includes(pageLinkedinSlug) ||
            pageLinkedinSlug.includes(normalizedLinkedinSlug))

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
        if (normalized.companyPhone && phones.includes(normalizeDigits(normalized.companyPhone).slice(-10))) score += 80
        if (normalized.otherPhone && phones.includes(normalizeDigits(normalized.otherPhone).slice(-10))) score += 75
        if (normalized.directPhone && phones.includes(normalizeDigits(normalized.directPhone).slice(-10))) score += 85
        if (isLinkedinMatch) score += 10000

        normalized.score = score
        normalized.reason =
          isLinkedinMatch
            ? `LinkedIn URL match: ${normalized.linkedinUrl}`
            : normalized.email && emails.includes(normalized.email.toLowerCase())
            ? `Email match: ${normalized.email}`
            : normalized.phone && phones.includes(normalizeDigits(normalized.phone).slice(-10))
              ? `Phone match: ${normalized.phone}`
              : normalized.mobile && phones.includes(normalizeDigits(normalized.mobile).slice(-10))
                ? `Mobile match: ${normalized.mobile}`
                : normalized.workPhone && phones.includes(normalizeDigits(normalized.workPhone).slice(-10))
                  ? `Work phone match: ${normalized.workPhone}`
                  : normalized.companyPhone && phones.includes(normalizeDigits(normalized.companyPhone).slice(-10))
                    ? `Company phone match: ${normalized.companyPhone}`
                    : normalized.otherPhone && phones.includes(normalizeDigits(normalized.otherPhone).slice(-10))
                      ? `Other phone match: ${normalized.otherPhone}`
                      : normalized.directPhone && phones.includes(normalizeDigits(normalized.directPhone).slice(-10))
                        ? `Direct phone match: ${normalized.directPhone}`
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

    const exactDomainAccount = domain
      ? accounts.find((account) => hostMatches(domain, account.domain) || hostMatches(domain, account.website))
      : null
    const exactNameAccount = accounts.find(
      (account) =>
        isExactCompanyNameMatch(companyGuess, account.name) || isExactCompanyNameMatch(title, account.name)
    ) || null
    const exactLinkedinContact = directLinkedinContact || (pageLinkedinSlug
      ? contacts.find((contact) => {
          const linkedin = normalizeLinkedinUrl(contact.linkedinUrl)
          const linkedinSlug = linkedin.includes('linkedin.com/')
            ? linkedin.split('linkedin.com/').pop()
            : ''
          return Boolean(
            linkedin &&
              linkedinSlug &&
              (linkedinSlug === pageLinkedinSlug ||
                linkedin.includes(pageLinkedinSlug) ||
                pageLinkedinSlug.includes(linkedinSlug))
          )
        })
      : null)

    // Hard gate: only return an account when we have a precise signal (domain/name/phone).
    let finalAccount = exactDomainAccount || exactNameAccount || null
    if (!finalAccount && bestAccount?.reason?.startsWith('Phone match:')) {
      finalAccount = bestAccount
    }
    if (!finalAccount && !domain && bestAccount && bestAccount.score >= 140) {
      finalAccount = bestAccount
    }

    let finalContact = null
    if (exactLinkedinContact) {
      finalContact = exactLinkedinContact
      if (exactLinkedinContact.accountId && exactLinkedinContact.accountName) {
        finalAccount =
          accountMap.get(exactLinkedinContact.accountId) ||
          normalizeAccountRow(
            {
              id: exactLinkedinContact.accountId,
              name: exactLinkedinContact.accountName,
              domain: exactLinkedinContact.accountDomain,
            },
            Math.max(80, Number(exactLinkedinContact.score || 0) - 10),
            `Matched through ${exactLinkedinContact.name}`
          )
      }
    } else if (contacts.length > 0) {
      if (finalAccount?.id) {
        finalContact =
          contacts.find((contact) => contact.accountId && contact.accountId === finalAccount.id) ||
          contacts.find((contact) => domain && hostMatches(domain, contact.accountDomain)) ||
          null
      } else {
        const domainContact = contacts.find((contact) => domain && hostMatches(domain, contact.accountDomain)) || null
        finalContact = domainContact
      }
    }

    if (!finalAccount && finalContact?.accountId && finalContact.accountName) {
      finalAccount =
        accountMap.get(finalContact.accountId) ||
        normalizeAccountRow(
          {
            id: finalContact.accountId,
            name: finalContact.accountName,
            domain: finalContact.accountDomain,
          },
          Math.max(75, Number(finalContact.score || 0) - 10),
          `Matched through ${finalContact.name}`
        )
    }

    let summary = 'No strong CRM match found yet.'
    if (finalContact && finalAccount && finalAccount.id === finalContact.accountId) {
      summary = `Matched ${finalContact.name} to ${finalAccount.name}.`
    } else if (finalContact) {
      summary = finalContact.accountName
        ? `Matched ${finalContact.name} at ${finalContact.accountName}.`
        : `Matched the page to ${finalContact.name}.`
    } else if (finalAccount) {
      summary = `Matched the page to ${finalAccount.name}.`
    } else if (domain) {
      summary = `No exact CRM match found for ${domain}.`
    }

    if (phones.length > 0 && summaryParts.length > 0) {
      summary = `${summaryParts[0]}. ${summary}`
    }

    res.status(200).json({
      success: true,
      account: finalAccount,
      contact: finalContact,
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
