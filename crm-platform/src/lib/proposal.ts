export interface ProposalRateStructure {
  id: string
  label: string
  termMonths: number | ''
  rate: string
}

export interface ProposalDraft {
  accountName: string
  facilityAddress: string
  annualUsage?: string
  currentRate?: string
  currentSupplier?: string
  defaultTermMonths?: number
  primaryContacts: string[]
  attentionLine: string
  subject: string
  supplierName: string
  confidentialityNote: string
  terminationFee: string
  blendAndExtend: boolean
  blendExtendMonths: number
  dealTitle?: string
  rateStructures: ProposalRateStructure[]
}

export interface ProposalSenderProfile {
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  jobTitle?: string | null
  email?: string | null
  selectedPhoneNumber?: string | null
  city?: string | null
  state?: string | null
  hostedPhotoUrl?: string | null
  linkedinUrl?: string | null
  website?: string | null
}

export interface ProposalContactSummary {
  id?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  title?: string | null
}

export interface ProposalEmailOptions {
  draft: ProposalDraft
  signatureHtml?: string
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

export function normalizeRateDisplay(value: string | number | null | undefined): string {
  if (isBlank(value)) return '—'
  const raw = typeof value === 'number' ? String(value) : String(value).trim()
  if (!raw) return '—'
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return raw
  return numeric.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')
}

export function normalizeRateStructures(rateStructures: ProposalRateStructure[]): ProposalRateStructure[] {
  return rateStructures
    .filter((structure) => !!structure)
    .slice(0, 3)
    .map((structure, index) => ({
      ...structure,
      label: structure.label?.trim() || `Option ${index + 1}`,
      rate: structure.rate?.trim() || '',
      termMonths: structure.termMonths === '' || structure.termMonths == null
        ? ''
        : Number(structure.termMonths),
    }))
}

function formatTerm(termMonths: number | ''): string {
  if (termMonths === '' || termMonths == null) return '—'
  return `${termMonths} months`
}

function safeLine(value: string | number | null | undefined, fallback = '—'): string {
  if (isBlank(value)) return fallback
  return String(value).trim()
}

function getProposalContactName(contact: ProposalContactSummary): string {
  const directName = typeof contact.name === 'string' ? contact.name.trim() : ''
  if (directName) return directName
  const parts = [contact.firstName, contact.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  return parts.join(' ')
}

function scoreProposalContact(contact: ProposalContactSummary, preferredContactId?: string | null): number {
  if (preferredContactId && contact.id && contact.id === preferredContactId) return -100

  const title = String(contact.title || '').toLowerCase()
  if (/(president|owner|ceo|cfo|principal|partner)/.test(title)) return 0
  if (/(office manager|manager|director|vp|vice president|operations|facility|procurement|energy|controller)/.test(title)) return 1
  if (/(assistant|admin|coordinator|specialist)/.test(title)) return 3
  return 2
}

export function buildProposalAttentionLine(
  contacts: ProposalContactSummary[] = [],
  preferredContactId?: string | null,
  fallback = 'Decision Team'
): string {
  const ordered = [...contacts].sort((a, b) => {
    const aScore = scoreProposalContact(a, preferredContactId)
    const bScore = scoreProposalContact(b, preferredContactId)
    if (aScore !== bScore) return aScore - bScore
    return getProposalContactName(a).localeCompare(getProposalContactName(b))
  })

  const chosen = ordered
    .map((contact) => getProposalContactName(contact))
    .filter(Boolean)
    .slice(0, 2)

  return chosen.join(' and ') || fallback
}

export function buildProposalSubject(draft: ProposalDraft): string {
  return draft.subject?.trim() || `${draft.accountName} ${draft.supplierName} Proposal`
}

export function buildProposalEmailText(draft: ProposalDraft): string {
  const options = normalizeRateStructures(draft.rateStructures)
  const lines: string[] = []
  const greeting = draft.attentionLine?.trim() || draft.primaryContacts.join(' and ') || draft.accountName
  lines.push(`Hi ${greeting},`)
  lines.push('')
  lines.push(
    `Attached is the clean ${options[0]?.termMonths || 24}-month ${draft.supplierName} proposal for ${draft.accountName}.`
  )
  lines.push('It is built for internal review and easy comparison.')
  lines.push('')

  options.forEach((option) => {
    lines.push(`${option.label}: ${normalizeRateDisplay(option.rate)} (${formatTerm(option.termMonths)})`)
  })

  lines.push('')
  lines.push(
    `Terms: $${safeLine(draft.terminationFee, '0')} termination fee if ${draft.accountName} no longer occupies the facility.`
  )
  if (draft.blendAndExtend) {
    lines.push(
      `Blend and extend: if market rates drop, the structure can be extended by ${draft.blendExtendMonths || 12} month${(draft.blendExtendMonths || 12) === 1 ? '' : 's'}.`
    )
  }
  lines.push('')
  lines.push(draft.confidentialityNote || 'Please keep the pricing confidential and review it internally only.')
  lines.push('')
  return lines.join('\n')
}

export function buildProposalEmailHtml({ draft, signatureHtml = '' }: ProposalEmailOptions): string {
  const options = normalizeRateStructures(draft.rateStructures)
  const greeting = escapeHtml(draft.attentionLine?.trim() || draft.primaryContacts.join(' and ') || draft.accountName)
  const accountName = escapeHtml(draft.accountName)
  const subject = escapeHtml(buildProposalSubject(draft))
  const supplierName = escapeHtml(draft.supplierName)
  const confidentialityNote = escapeHtml(draft.confidentialityNote || 'Please keep the pricing confidential and review it internally only.')
  const facilityAddress = escapeHtml(draft.facilityAddress)
  const annualUsage = escapeHtml(draft.annualUsage || '—')
  const currentRate = escapeHtml(draft.currentRate || '—')
  const primaryContacts = escapeHtml(draft.primaryContacts.join(' and ') || '—')
  const optionCards = options.map((option, index) => {
    const isLast = index === options.length - 1
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d7e0f5;border-radius:16px;background:#f8fbff;margin-bottom:${isLast ? '0' : '12px'};">
        <tr>
          <td style="padding:18px 18px 16px 18px;">
            <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;font-family:Arial,sans-serif;margin-bottom:10px;">${escapeHtml(option.label)}</div>
            <div style="font-family:Arial,sans-serif;font-size:34px;line-height:1;color:#0f172a;font-weight:700;margin-bottom:10px;">${escapeHtml(normalizeRateDisplay(option.rate))}</div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#334155;line-height:1.55;">
              <div><strong>Term:</strong> ${escapeHtml(formatTerm(option.termMonths))}</div>
              <div><strong>Supplier:</strong> ${supplierName}</div>
            </div>
          </td>
        </tr>
      </table>
    `
  }).join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #dbe3f0;border-radius:22px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5edf7;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;width:40%;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="vertical-align:middle;padding-right:10px;">
                            <img src="https://nodalpoint.io/images/nodalpoint-webicon.png" width="22" height="22" alt="Nodal Point" style="display:block;border-radius:5px;" />
                          </td>
                          <td style="vertical-align:middle;">
                            <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#0f172a;font-weight:700;">Nodal Point</div>
                            <div style="font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;margin-top:3px;">Commercial Energy Proposal</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td style="text-align:center;vertical-align:middle;width:40%;">
                      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#60718b;">Confidential Energy Proposal</div>
                    </td>
                    <td style="text-align:right;vertical-align:middle;width:20%;">
                      ${
                        supplierName.toUpperCase().includes('ENGIE')
                          ? '<img src="https://nodalpoint.io/images/engie.png" width="74" height="26" alt="ENGIE" style="display:inline-block;vertical-align:middle;" />'
                          : `<div style="display:inline-block;padding:10px 14px;border:1px solid #dbe3f0;border-radius:16px;background:#f8fbff;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#0f172a;">${supplierName}</div>`
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 10px 24px;">
                <div style="font-size:34px;line-height:1.05;font-weight:700;color:#0f172a;margin:0 0 14px 0;">${accountName}</div>
                <div style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 22px 0;max-width:560px;">
                  ${greeting}, here is the cleanest ${escapeHtml(String(options[0]?.termMonths || draft.defaultTermMonths || 24))}-month ${supplierName} option I can put in front of you. It is built to be easy to compare: one rate, one term, $0 exit if you no longer occupy the facility, and a lower-rate path if the market drops.
                </div>

                ${optionCards}

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                  <tr>
                    <td style="vertical-align:top;width:56%;padding-right:12px;">
                      <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;font-weight:700;margin:0 0 10px 0;">Why This Works</div>
                      <div style="padding:16px 16px 14px 16px;border:1px solid #dbe3f0;border-radius:18px;background:#f8fbff;">
                        <div style="font-size:13px;line-height:1.65;color:#0f172a;margin-bottom:10px;">- Simple for internal review because the structure is easy to compare.</div>
                        <div style="font-size:13px;line-height:1.65;color:#0f172a;margin-bottom:10px;">- $0 termination fee if ${accountName} no longer occupies the facility.</div>
                        <div style="font-size:13px;line-height:1.65;color:#0f172a;">- Blend and extend by ${draft.blendExtendMonths || 12} month${(draft.blendExtendMonths || 12) === 1 ? '' : 's'} if market rates drop.</div>
                      </div>
                    </td>
                    <td style="vertical-align:top;width:44%;padding-left:12px;">
                      <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;font-weight:700;margin:0 0 10px 0;">On File</div>
                      <div style="padding:16px 16px 14px 16px;border:1px solid #dbe3f0;border-radius:18px;background:#ffffff;">
                        <div style="margin-bottom:14px;">
                          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Facility</div>
                          <div style="font-size:13px;line-height:1.5;color:#0f172a;">${facilityAddress}</div>
                        </div>
                        <div style="margin-bottom:14px;">
                          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Annual Usage</div>
                          <div style="font-size:13px;line-height:1.5;color:#0f172a;">${annualUsage} kWh</div>
                        </div>
                        <div style="margin-bottom:14px;">
                          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Primary Contacts</div>
                          <div style="font-size:13px;line-height:1.5;color:#0f172a;">${primaryContacts}</div>
                        </div>
                        <div>
                          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Current Rate</div>
                          <div style="font-size:13px;line-height:1.5;color:#0f172a;">${currentRate}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:16px;padding:14px 16px;border:1px solid #d7e0f5;border-radius:16px;background:#eef4ff;color:#17337f;font-size:13px;line-height:1.6;">
                  ${confidentialityNote}
                </div>

                <div style="margin-top:22px;">
                  ${signatureHtml}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function buildProposalFileName(draft: ProposalDraft): string {
  const base = [draft.accountName, draft.subject || draft.supplierName, 'Proposal']
    .filter(Boolean)
    .join(' - ')
    .replace(/[\\/:"*?<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${base || 'Proposal'}.pdf`
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function loadImageAsset(url: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const mimeType = response.headers.get('content-type') || (url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
    return { bytes: await response.arrayBuffer(), mimeType }
  } catch {
    return null
  }
}

async function embedImage(pdfDoc: any, asset?: { bytes: ArrayBuffer; mimeType: string } | null) {
  if (!asset) return null
  try {
    if (asset.mimeType.includes('png')) {
      return await pdfDoc.embedPng(asset.bytes)
    }
    return await pdfDoc.embedJpg(asset.bytes)
  } catch {
    return null
  }
}

function textBlock(page: any, text: string, x: number, y: number, width: number, font: any, size: number, color: any, lineHeight?: number) {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color,
    maxWidth: width,
    lineHeight: lineHeight || size * 1.35,
  })
}

export async function generateProposalPdfBytes(
  draft: ProposalDraft,
  profile?: ProposalSenderProfile | null
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792])
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const medium = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const nodalLogo = await embedImage(pdfDoc, await loadImageAsset('/images/nodalpoint-webicon.png'))
  const supplierLogo = draft.supplierName.toUpperCase().includes('ENGIE')
    ? await embedImage(pdfDoc, await loadImageAsset('/images/engie.png'))
    : null
  const senderPhoto = profile?.hostedPhotoUrl ? await embedImage(pdfDoc, await loadImageAsset(profile.hostedPhotoUrl)) : null

  const black = rgb(0.06, 0.09, 0.14)
  const zinc = rgb(0.28, 0.33, 0.40)
  const muted = rgb(0.43, 0.49, 0.59)
  const blue = rgb(0, 0.184, 0.655)
  const border = rgb(0.83, 0.88, 0.94)
  const softFill = rgb(0.97, 0.98, 1)
  const paleBlue = rgb(0.93, 0.96, 1)

  const margin = 36
  const pageWidth = 612
  const topY = 748

  if (nodalLogo) {
    page.drawImage(nodalLogo, {
      x: margin,
      y: topY - 2,
      width: 30,
      height: 30,
    })
  }

  textBlock(page, 'NODAL POINT', margin + 42, topY + 12, 130, bold, 11, black, 13)
  textBlock(page, 'COMMERCIAL ENERGY PROPOSAL', margin + 42, topY - 2, 170, regular, 7.5, muted, 9)
  textBlock(page, 'CONFIDENTIAL ENERGY PROPOSAL', 208, topY + 10, 196, regular, 10, muted, 11)

  const supplierBadgeX = 470
  const supplierBadgeY = topY - 6
  page.drawRectangle({
    x: supplierBadgeX,
    y: supplierBadgeY,
    width: 106,
    height: 34,
    borderColor: border,
    color: paleBlue,
    borderWidth: 1,
  })

  if (supplierLogo) {
    page.drawImage(supplierLogo, {
      x: supplierBadgeX + 24,
      y: supplierBadgeY + 9,
      width: 58,
      height: 16,
    })
  } else {
    textBlock(page, draft.supplierName, supplierBadgeX + 14, supplierBadgeY + 12, 80, bold, 10, blue, 10)
  }

  textBlock(page, draft.accountName, margin, 704, 330, bold, 26, black, 28)
  const intro = `${draft.attentionLine || 'Team'}, here is the cleanest ${normalizeRateStructures(draft.rateStructures)[0]?.termMonths || 24}-month ${draft.supplierName} option I can put in front of you. It is built to be easy to compare: one rate, one term, $0 exit if you no longer occupy the facility, and a lower-rate path if the market drops.`
  textBlock(page, intro, margin, 676, 310, regular, 12, zinc, 16)

  const attentionPillX = 442
  const attentionPillY = 672
  const pills = [
    draft.attentionLine,
    'INTERNAL REVIEW ONLY',
  ].filter(Boolean)
  pills.forEach((pill, index) => {
    const y = attentionPillY - index * 34
    page.drawRectangle({
      x: attentionPillX,
      y,
      width: 134,
      height: 28,
      color: softFill,
      borderColor: border,
      borderWidth: 1,
    })
    textBlock(page, pill.toUpperCase(), attentionPillX + 10, y + 9, 114, medium, 8.5, black, 9)
  })

  page.drawLine({
    start: { x: margin, y: 604 },
    end: { x: pageWidth - margin, y: 604 },
    color: border,
    thickness: 1,
  })

  const options = normalizeRateStructures(draft.rateStructures)
  const cardTop = 570
  const cardGap = 12
  const cardHeight = 128
  const usableWidth = pageWidth - margin * 2
  const cardWidth = options.length > 1
    ? Math.floor((usableWidth - cardGap * (options.length - 1)) / options.length)
    : usableWidth

  options.forEach((option, index) => {
    const x = margin + index * (cardWidth + cardGap)
    const y = cardTop - cardHeight
    page.drawRectangle({
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      color: softFill,
      borderColor: border,
      borderWidth: 1,
    })
    textBlock(page, option.label.toUpperCase(), x + 12, y + cardHeight - 22, cardWidth - 24, regular, 8.5, muted, 9)
    textBlock(page, normalizeRateDisplay(option.rate), x + 12, y + cardHeight - 62, cardWidth - 24, bold, 28, black, 30)
    textBlock(page, `TERM: ${formatTerm(option.termMonths).toUpperCase()}`, x + 12, y + 45, cardWidth - 24, medium, 8.5, blue, 9)
    textBlock(page, `SUPPLIER: ${draft.supplierName.toUpperCase()}`, x + 12, y + 30, cardWidth - 24, regular, 8.5, muted, 9)
  })

  page.drawLine({
    start: { x: margin, y: 404 },
    end: { x: pageWidth - margin, y: 404 },
    color: border,
    thickness: 1,
  })

  textBlock(page, 'WHY THIS WORKS', margin, 384, 140, bold, 10, muted, 11)
  const bullets = [
    'Simple for your team to review internally because the structure is easy to compare.',
    `$0 termination fee if ${draft.accountName} no longer occupies the facility.`,
    `Blend and extend one additional year if market rates drop.`,
  ]
  bullets.forEach((bullet, index) => {
    const y = 364 - index * 36
    page.drawCircle({ x: margin + 5, y: y + 4, size: 4, color: blue })
    textBlock(page, bullet, margin + 16, y, 228, regular, 10.5, black, 13)
  })

  const onFileX = 306
  textBlock(page, 'ON FILE', onFileX, 384, 120, bold, 10, muted, 11)
  const onFileCards = [
    { label: 'Facility', value: draft.facilityAddress || '—' },
    { label: 'Annual Usage', value: draft.annualUsage ? `${draft.annualUsage} kWh` : '—' },
    { label: 'Primary Contacts', value: draft.primaryContacts.join(' and ') || '—' },
    { label: 'Current Rate', value: draft.currentRate || '—' },
  ]
  onFileCards.forEach((item, index) => {
    const y = 364 - index * 60
    page.drawRectangle({
      x: onFileX,
      y: y - 8,
      width: 240,
      height: 48,
      color: rgb(1, 1, 1),
      borderColor: border,
      borderWidth: 1,
    })
    textBlock(page, item.label.toUpperCase(), onFileX + 12, y + 20, 190, regular, 8.5, muted, 9)
    textBlock(page, item.value, onFileX + 12, y + 4, 210, regular, 10.5, black, 12)
  })

  page.drawRectangle({
    x: onFileX,
    y: 112,
    width: 240,
    height: 86,
    color: rgb(0.95, 0.96, 1),
    borderColor: border,
    borderWidth: 1,
  })
  textBlock(page, 'CONFIDENTIALITY', onFileX + 12, 174, 120, regular, 8.5, muted, 9)
  textBlock(page, draft.confidentialityNote || 'Please keep the pricing confidential and review it internally only.', onFileX + 12, 142, 214, regular, 10, blue, 13)

  const footerTop = 96
  page.drawLine({
    start: { x: margin, y: footerTop + 8 },
    end: { x: pageWidth - margin, y: footerTop + 8 },
    color: border,
    thickness: 1,
  })

  if (senderPhoto) {
    page.drawRectangle({
      x: margin,
      y: 28,
      width: 44,
      height: 44,
      borderColor: border,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    })
    page.drawImage(senderPhoto, {
      x: margin + 1,
      y: 29,
      width: 42,
      height: 42,
    })
  }

  const senderName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.name || 'Lewis Patterson'
  textBlock(page, senderName, margin + 56, 58, 160, bold, 13, black, 14)
  textBlock(page, profile?.jobTitle || 'DIRECTOR OF ENERGY ARCHITECTURE', margin + 56, 42, 190, regular, 8.5, muted, 9)
  textBlock(
    page,
    `${profile?.city || 'Fort Worth'}, ${profile?.state || 'TX'} · ${profile?.email || 'l.patterson@nodalpoint.io'} · ${profile?.selectedPhoneNumber || '+1 (817)-518-2151'}`,
    margin + 56,
    28,
    260,
    regular,
    9,
    zinc,
    11
  )

  textBlock(
    page,
    `Prepared for ${draft.accountName}. Built for internal review with ${draft.attentionLine || 'the decision team'}.`,
    296,
    45,
    230,
    regular,
    8.5,
    muted,
    10
  )

  textBlock(page, 'NODAL POINT', 444, 28, 116, bold, 12, black, 12)
  textBlock(page, 'CONFIDENTIAL PROPOSAL', 430, 16, 136, regular, 7.5, muted, 8)

  return await pdfDoc.save()
}

export function buildProposalStoragePath(accountId: string, draft: ProposalDraft, extension = 'pdf'): string {
  const accountSlug = slugify(draft.accountName || accountId)
  const subjectSlug = slugify(draft.subject || 'proposal')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `accounts/${accountId}/proposals/${timestamp}-${accountSlug}-${subjectSlug}.${extension}`
}
