import { parseAddressParts as parseLocationAddressParts, formatCityStateZip } from '@/lib/address'
import { getTexasEnergyContext, resolveTexasTduDisplay } from '@/lib/texas-territory'

type AnyRecord = Record<string, any>

export type LoaFieldValues = Record<string, string>

export interface LoaResolvedServiceRow {
  serviceAddress: string
  esiId: string
}

export interface LoaTemplateData {
  fieldValues: LoaFieldValues
  tdspChoice: string
  serviceRows: LoaResolvedServiceRow[]
}

export interface LoaTemplateContext {
  account?: AnyRecord | null
  contact?: AnyRecord | null
  executionDate?: Date
}

const LOA_TDSP_FIELDS = ['Oncor', 'CenterPoint Energy', 'Sharyland', 'AEP', 'TNMP', 'Nueces'] as const

function cleanText(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function formatUsDate(date: Date): string {
  return date.toLocaleDateString('en-US')
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function getServiceRows(account: AnyRecord | null | undefined): LoaResolvedServiceRow[] {
  const fromMeters = Array.isArray(account?.meters)
    ? account.meters.map((meter: AnyRecord) => ({
        serviceAddress: firstNonEmpty([
          meter.service_address,
          meter.address,
          meter.serviceAddress,
          meter.location,
        ]),
        esiId: firstNonEmpty([
          meter.esid,
          meter.esiId,
          meter.esi_id,
          meter.esiID,
        ]),
      }))
    : []

  const fromServiceAddresses = Array.isArray(account?.serviceAddresses)
    ? account.serviceAddresses.map((entry: AnyRecord) => ({
        serviceAddress: firstNonEmpty([
          entry.address,
          entry.service_address,
          entry.serviceAddress,
          entry.location,
        ]),
        esiId: firstNonEmpty([
          entry.esid,
          entry.esiId,
          entry.esi_id,
        ]),
      }))
    : []

  const rows = [...fromMeters, ...fromServiceAddresses].filter(
    (row) => row.serviceAddress || row.esiId
  )

  return rows.slice(0, 3)
}

function resolveTdspChoice(account: AnyRecord | null | undefined, city: string, state: string, rawLocation: string): string {
  const direct = firstNonEmpty([
    account?.tdsp,
    account?.utilityTerritory,
    account?.tdu,
    account?.metadata?.tdsp,
    account?.metadata?.utilityTerritory,
    account?.metadata?.utility_territory,
  ])

  const texasContext = getTexasEnergyContext(city, state, rawLocation)
  const candidate = firstNonEmpty([direct, texasContext.tduDisplay, resolveTexasTduDisplay(city, state, rawLocation)])

  const normalized = candidate.toLowerCase()
  if (normalized.includes('oncor')) return 'Oncor'
  if (normalized.includes('centerpoint')) return 'CenterPoint Energy'
  if (normalized.includes('sharyland')) return 'Sharyland'
  if (normalized.includes('aep')) return 'AEP'
  if (normalized.includes('tnmp')) return 'TNMP'
  if (normalized.includes('nueces')) return 'Nueces'

  return ''
}

export function buildLoaTemplateData(context: LoaTemplateContext): LoaTemplateData {
  const account = context.account || {}
  const contact = context.contact || {}
  const executionDate = context.executionDate || new Date()

  const accountAddress = firstNonEmpty([
    account.address,
    account.metadata?.address,
    account.location,
    account.service_address,
  ])
  const parsedFromAddress = parseLocationAddressParts(accountAddress)
  const city = firstNonEmpty([account.city, parsedFromAddress.city, account.metadata?.city, account.metadata?.general?.city])
  const state = firstNonEmpty([account.state, parsedFromAddress.state, account.metadata?.state, account.metadata?.general?.state])
  const zip = firstNonEmpty([account.zip, parsedFromAddress.zip, account.metadata?.zip, account.metadata?.general?.zip])
  const street = firstNonEmpty([parsedFromAddress.street, account.address, account.metadata?.street, account.metadata?.address])
  const rawLocation = firstNonEmpty([account.location, accountAddress, [city, state, zip].filter(Boolean).join(' ')])

  const signatoryName = firstNonEmpty([
    [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    contact.name,
    contact.fullName,
    contact.displayName,
  ])
  const company = firstNonEmpty([account.name, contact.company, contact.companyName])
  const title = firstNonEmpty([contact.title, contact.job_title, contact.metadata?.title])
  const email = firstNonEmpty([contact.email, contact.workEmail, contact.metadata?.email])
  const companyPhone = firstNonEmpty([
    contact.companyPhone,
    account.phone,
    contact.phone,
    contact.workPhone,
    contact.workDirectPhone,
  ])

  const cityStateZip = formatCityStateZip(city, state, zip)
  const serviceRows = getServiceRows(account)
  const tdspChoice = resolveTdspChoice(account, city, state, rawLocation)

  const fieldValues: LoaFieldValues = {
    Date: formatUsDate(executionDate),
    Text11: formatUsDate(addYears(executionDate, 1)),
    'Name printed': signatoryName,
    Title: title,
    Email: email,
    Company: company,
    'Billing Street Address': firstNonEmpty([street, accountAddress]),
    'City, State, Zip': cityStateZip,
    Telephone: companyPhone,
    'Service Address': serviceRows[0]?.serviceAddress || '',
    'ESI ID Number': serviceRows[0]?.esiId || '',
    'Service Address 2': serviceRows[1]?.serviceAddress || '',
    'ESI ID Number 2': serviceRows[1]?.esiId || '',
    'Service Address 3': serviceRows[2]?.serviceAddress || '',
    'ESI ID Number 3': serviceRows[2]?.esiId || '',
  }

  return { fieldValues, tdspChoice, serviceRows }
}

export function getLoaSignatureFieldDefaults() {
  return [
    {
      fieldId: 'loa_signature',
      pageIndex: 0,
      x: 94,
      y: 710,
      width: 236,
      height: 26,
      type: 'signature' as const,
      label: 'Signature',
      value: '',
    },
  ]
}

export function getLoaFieldDefinitions() {
  return [
    { key: 'Date', label: 'Date' },
    { key: 'Text11', label: 'Authorization Expiration' },
    { key: 'Name printed', label: 'Name Printed' },
    { key: 'Title', label: 'Title' },
    { key: 'Email', label: 'Email' },
    { key: 'Company', label: 'Company' },
    { key: 'Billing Street Address', label: 'Billing Street Address' },
    { key: 'City, State, Zip', label: 'City, State, Zip' },
    { key: 'Telephone', label: 'Telephone' },
    { key: 'Service Address', label: 'Service Address' },
    { key: 'ESI ID Number', label: 'ESI ID Number' },
    { key: 'Service Address 2', label: 'Service Address 2' },
    { key: 'ESI ID Number 2', label: 'ESI ID Number 2' },
    { key: 'Service Address 3', label: 'Service Address 3' },
    { key: 'ESI ID Number 3', label: 'ESI ID Number 3' },
  ] as const
}

export function getLoaTdsFields() {
  return LOA_TDSP_FIELDS
}
