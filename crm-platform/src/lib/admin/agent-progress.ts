import { supabaseAdmin } from '@/lib/supabase'
import {
  buildOwnerDirectoryEntry,
  buildOwnerIndex,
  canonicalizeOwnerKey,
  normalizeEmail,
  normalizeOwnerKey,
} from '@/lib/owner-display'
import type {
  AgentProgressReport,
  AgentProgressRow,
  AgentProgressTotals,
  OwnerDirectoryEntry,
  TwilioNumberRecord,
  UserIdentityRecord,
} from '@/types/agents'

type UserRow = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  job_title?: string | null
  phone?: string | null
  settings?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

type AccountRow = {
  id: string
  ownerId?: string | null
  name?: string | null
  updatedAt?: string | null
}

type ContactRow = {
  id: string
  ownerId?: string | null
  accountId?: string | null
  lastActivityAt?: string | null
  lastContactedAt?: string | null
  updatedAt?: string | null
}

type CallRow = {
  id: string
  ownerId?: string | null
  accountId?: string | null
  timestamp?: string | null
  createdAt?: string | null
}

type EmailRow = {
  id: string
  ownerId?: string | null
  accountId?: string | null
  timestamp?: string | null
  sentAt?: string | null
  createdAt?: string | null
  metadata?: Record<string, unknown> | null
}

type TaskRow = {
  id: string
  ownerId?: string | null
  accountId?: string | null
  dueDate?: string | null
  updatedAt?: string | null
  createdAt?: string | null
}

type DocumentRow = {
  id: string
  account_id?: string | null
  document_type?: string | null
  created_at?: string | null
}

type AdminProgressData = {
  users: UserRow[]
  accounts: AccountRow[]
  contacts: ContactRow[]
  calls: CallRow[]
  emails: EmailRow[]
  tasks: TaskRow[]
  documents: DocumentRow[]
}

type OwnerAccumulator = AgentProgressRow & {
  aliasesSet: Set<string>
}

function getSettings(user: UserRow) {
  return (user.settings && typeof user.settings === 'object') ? user.settings : {}
}

function getOwnerKey(value?: string | null) {
  const normalized = normalizeOwnerKey(value)
  return normalized || 'unassigned'
}

function getEmailOwnerKey(row: EmailRow) {
  const metadataOwner = typeof row.metadata?.ownerId === 'string' ? row.metadata?.ownerId : null
  return getOwnerKey(row.ownerId || metadataOwner)
}

function getCallTimestamp(row: CallRow) {
  return row.timestamp || row.createdAt || null
}

function getEmailTimestamp(row: EmailRow) {
  return row.sentAt || row.timestamp || row.createdAt || null
}

function getTaskTimestamp(row: TaskRow) {
  return row.updatedAt || row.createdAt || row.dueDate || null
}

function pickLatest(values: Array<string | null | undefined>) {
  let latest: string | null = null
  for (const value of values) {
    if (!value) continue
    if (!latest || value > latest) latest = value
  }
  return latest
}

function toStringValue(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getAssignedNumbers(settings: Record<string, unknown>) {
  const entries = settings.twilioNumbers
  const numbers = new Map<string, TwilioNumberRecord>()

  const upsertNumber = (number: string, name: string | null, selected = false) => {
    const normalized = number.trim()
    if (!normalized) return
    const existing = numbers.get(normalized)
    if (existing) {
      if (!existing.name && name) existing.name = name
      if (selected) existing.selected = true
      return
    }
    numbers.set(normalized, {
      name: name || null,
      number: normalized,
      selected: selected || undefined,
    })
  }

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (typeof entry === 'string') {
        upsertNumber(entry, null, false)
        continue
      }
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const number = toStringValue(record.number)
      const name = toStringValue(record.name) || null
      const selected = record.selected === true
      if (number) {
        upsertNumber(number, name, selected)
      }
    }
  }

  const selectedPhoneNumber = toStringValue(settings.selectedPhoneNumber) || toStringValue(settings.assignedPhoneNumber)
  if (selectedPhoneNumber) {
    if (numbers.has(selectedPhoneNumber)) {
      const existing = numbers.get(selectedPhoneNumber)
      if (existing) existing.selected = true
    } else {
      upsertNumber(selectedPhoneNumber, null, true)
    }
  }

  return Array.from(numbers.values()).sort((a, b) => Number(!!b.selected) - Number(!!a.selected))
}

async function loadAdminProgressData(): Promise<AdminProgressData> {
  const [
    usersRes,
    accountsRes,
    contactsRes,
    callsRes,
    emailsRes,
    tasksRes,
    documentsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, job_title, phone, settings, created_at, updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('accounts')
      .select('id, ownerId, name, updatedAt')
      .order('updatedAt', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('contacts')
      .select('id, ownerId, accountId, lastActivityAt, lastContactedAt, updatedAt')
      .order('updatedAt', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('calls')
      .select('id, ownerId, accountId, timestamp, createdAt')
      .order('timestamp', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('emails')
      .select('id, ownerId, accountId, timestamp, sentAt, createdAt, metadata')
      .order('timestamp', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('tasks')
      .select('id, ownerId, accountId, dueDate, updatedAt, createdAt')
      .order('updatedAt', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('documents')
      .select('id, account_id, document_type, created_at')
      .order('created_at', { ascending: false, nullsFirst: false }),
  ])

  if (usersRes.error) throw usersRes.error
  if (accountsRes.error) throw accountsRes.error
  if (contactsRes.error) throw contactsRes.error
  if (callsRes.error) throw callsRes.error
  if (emailsRes.error) throw emailsRes.error
  if (tasksRes.error) throw tasksRes.error
  if (documentsRes.error) throw documentsRes.error

  return {
    users: (usersRes.data ?? []) as UserRow[],
    accounts: (accountsRes.data ?? []) as AccountRow[],
    contacts: (contactsRes.data ?? []) as ContactRow[],
    calls: (callsRes.data ?? []) as CallRow[],
    emails: (emailsRes.data ?? []) as EmailRow[],
    tasks: (tasksRes.data ?? []) as TaskRow[],
    documents: (documentsRes.data ?? []) as DocumentRow[],
  }
}

function createAccumulator(entry: OwnerDirectoryEntry): OwnerAccumulator {
  return {
    ...entry,
    aliasesSet: new Set(entry.aliases || []),
    title: null,
    territory: null,
    status: null,
    role: null,
    assignedPhoneNumber: null,
    assignedEmailAddress: null,
    twilioNumbers: [],
    accountCount: 0,
    contactCount: 0,
    callCount: 0,
    emailCount: 0,
    taskCount: 0,
    billCount: 0,
    invoiceCount: 0,
    usageCount: 0,
    totalDocuments: 0,
    lastCallAt: null,
    lastEmailAt: null,
    lastBillAt: null,
    lastActivityAt: null,
    activeNumbers: 0,
    goals: null,
    performance: null,
  }
}

function finalizeAccumulator(acc: OwnerAccumulator): AgentProgressRow {
  return {
    key: acc.key,
    displayName: acc.displayName,
    kind: acc.kind,
    userId: acc.userId,
    email: acc.email,
    firstName: acc.firstName,
    lastName: acc.lastName,
    aliases: Array.from(acc.aliasesSet),
    title: acc.title,
    territory: acc.territory,
    status: acc.status,
    role: acc.role,
    assignedPhoneNumber: acc.assignedPhoneNumber,
    assignedEmailAddress: acc.assignedEmailAddress,
    twilioNumbers: acc.twilioNumbers,
    accountCount: acc.accountCount,
    contactCount: acc.contactCount,
    callCount: acc.callCount,
    emailCount: acc.emailCount,
    taskCount: acc.taskCount,
    billCount: acc.billCount,
    invoiceCount: acc.invoiceCount,
    usageCount: acc.usageCount,
    totalDocuments: acc.totalDocuments,
    lastCallAt: acc.lastCallAt,
    lastEmailAt: acc.lastEmailAt,
    lastBillAt: acc.lastBillAt,
    lastActivityAt: acc.lastActivityAt,
    activeNumbers: acc.activeNumbers,
    goals: acc.goals,
    performance: acc.performance,
  }
}

function buildBaseAccumulator(
  rawKey: string,
  index: ReturnType<typeof buildOwnerIndex>,
  fallback?: string | null,
) {
  const entry = buildOwnerDirectoryEntry(rawKey, index, fallback)
  return createAccumulator(entry)
}

function upsertAlias(map: Map<string, OwnerAccumulator>, canonicalKey: string, rawKey: string, index: ReturnType<typeof buildOwnerIndex>) {
  const normalizedRawKey = getOwnerKey(rawKey)
  const targetKey = canonicalKey || normalizedRawKey || 'unassigned'
  let accumulator = map.get(targetKey)
  if (!accumulator) {
    accumulator = buildBaseAccumulator(targetKey, index, rawKey)
    map.set(targetKey, accumulator)
  }
  if (normalizedRawKey) {
    accumulator.aliasesSet.add(normalizedRawKey)
  }
  if (rawKey && rawKey !== normalizedRawKey) {
    accumulator.aliasesSet.add(rawKey.trim())
  }
  return accumulator
}

function applyUserMetadata(acc: OwnerAccumulator, user: UserRow) {
  const settings = getSettings(user)
  const twilioNumbers = getAssignedNumbers(settings)
  const selectedPhoneNumber =
    toStringValue(settings.selectedPhoneNumber) ||
    toStringValue(settings.assignedPhoneNumber) ||
    twilioNumbers.find((entry) => entry.selected)?.number ||
    twilioNumbers[0]?.number ||
    acc.assignedPhoneNumber

  acc.title = user.job_title || toStringValue(settings.title) || acc.title
  acc.territory = toStringValue(settings.territory) || toStringValue(settings.region) || acc.territory
  acc.role = toStringValue(settings.role) || acc.role
  acc.status = toStringValue(settings.status) || acc.status
  acc.assignedPhoneNumber = selectedPhoneNumber || acc.assignedPhoneNumber
  acc.assignedEmailAddress = normalizeEmail(user.email) || acc.assignedEmailAddress
  acc.activeNumbers = twilioNumbers.length
  acc.twilioNumbers = twilioNumbers
  acc.goals = isRecord(settings.goals) ? settings.goals : acc.goals
  acc.performance = isRecord(settings.performance) ? settings.performance : acc.performance
}

function computeLastActivity(acc: OwnerAccumulator) {
  acc.lastActivityAt = pickLatest([
    acc.lastCallAt,
    acc.lastEmailAt,
    acc.lastBillAt,
    acc.lastActivityAt,
  ])

  const lastActivity = acc.lastActivityAt ? Date.parse(acc.lastActivityAt) : NaN
  if (!Number.isNaN(lastActivity)) {
    const daysSince = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24)
    if (daysSince <= 7) {
      acc.status = acc.status || 'Active'
    } else if (daysSince <= 30) {
      acc.status = acc.status || 'Warm'
    } else {
      acc.status = acc.status || 'Stale'
    }
    return
  }

  if (!acc.status) {
    acc.status = acc.accountCount || acc.contactCount || acc.callCount || acc.emailCount || acc.billCount ? 'Idle' : 'No Data'
  }
}

function sortOwners(rows: AgentProgressRow[]) {
  return [...rows].sort((a, b) => {
    if (a.kind === 'unassigned' && b.kind !== 'unassigned') return 1
    if (b.kind === 'unassigned' && a.kind !== 'unassigned') return -1

    const aScore = a.callCount + a.emailCount + a.billCount + a.accountCount + a.contactCount + a.taskCount
    const bScore = b.callCount + b.emailCount + b.billCount + b.accountCount + b.contactCount + b.taskCount
    if (bScore !== aScore) return bScore - aScore

    return a.displayName.localeCompare(b.displayName)
  })
}

export async function buildOwnerDirectoryPayload() {
  const data = await loadAdminProgressData()
  const ownerIndex = buildOwnerIndex(data.users as UserIdentityRecord[])
  const ownerMap = new Map<string, OwnerAccumulator>()

  for (const user of data.users) {
    const baseEntry = buildOwnerDirectoryEntry(user.id, ownerIndex, user.email || user.id)
    const acc = createAccumulator(baseEntry)
    acc.aliasesSet.add(user.id)
    const normalizedEmail = normalizeEmail(user.email)
    if (normalizedEmail) acc.aliasesSet.add(normalizedEmail)
    applyUserMetadata(acc, user)
    ownerMap.set(acc.key, acc)
  }

  for (const account of data.accounts) {
    const rawOwner = getOwnerKey(account.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.accountCount += 1
  }

  for (const contact of data.contacts) {
    const rawOwner = getOwnerKey(contact.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.contactCount += 1
  }

  for (const call of data.calls) {
    const rawOwner = getOwnerKey(call.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.callCount += 1
  }

  for (const email of data.emails) {
    const rawOwner = getEmailOwnerKey(email)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.emailCount += 1
  }

  for (const task of data.tasks) {
    const rawOwner = getOwnerKey(task.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.taskCount += 1
  }

  for (const document of data.documents) {
    if (!document.document_type || !['INVOICE', 'USAGE_DATA'].includes(document.document_type)) continue
    const account = document.account_id
      ? data.accounts.find((row) => row.id === document.account_id)
      : null
    const rawOwner = getOwnerKey(account?.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.billCount += 1
    acc.totalDocuments += 1
    if (document.document_type === 'INVOICE') acc.invoiceCount += 1
    if (document.document_type === 'USAGE_DATA') acc.usageCount += 1
    if (document.created_at && (!acc.lastBillAt || document.created_at > acc.lastBillAt)) {
      acc.lastBillAt = document.created_at
    }
  }

  for (const acc of ownerMap.values()) {
    computeLastActivity(acc)
  }

  const owners = sortOwners(Array.from(ownerMap.values()).map(finalizeAccumulator)).map((entry) => ({
    ...entry,
    aliases: Array.from(new Set(entry.aliases || [])),
  }))

  return {
    generatedAt: new Date().toISOString(),
    owners,
  }
}

export async function buildAgentProgressReport() {
  const data = await loadAdminProgressData()
  const ownerIndex = buildOwnerIndex(data.users as UserIdentityRecord[])
  const ownerMap = new Map<string, OwnerAccumulator>()

  for (const user of data.users) {
    const baseEntry = buildOwnerDirectoryEntry(user.id, ownerIndex, user.email || user.id)
    const acc = createAccumulator(baseEntry)
    acc.aliasesSet.add(user.id)
    const normalizedEmail = normalizeEmail(user.email)
    if (normalizedEmail) acc.aliasesSet.add(normalizedEmail)
    applyUserMetadata(acc, user)
    ownerMap.set(acc.key, acc)
  }

  for (const account of data.accounts) {
    const rawOwner = getOwnerKey(account.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.accountCount += 1
  }

  for (const contact of data.contacts) {
    const rawOwner = getOwnerKey(contact.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.contactCount += 1
  }

  for (const call of data.calls) {
    const rawOwner = getOwnerKey(call.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.callCount += 1
    const timestamp = getCallTimestamp(call)
    if (timestamp && (!acc.lastCallAt || timestamp > acc.lastCallAt)) {
      acc.lastCallAt = timestamp
    }
  }

  for (const email of data.emails) {
    const rawOwner = getEmailOwnerKey(email)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.emailCount += 1
    const timestamp = getEmailTimestamp(email)
    if (timestamp && (!acc.lastEmailAt || timestamp > acc.lastEmailAt)) {
      acc.lastEmailAt = timestamp
    }
  }

  for (const task of data.tasks) {
    const rawOwner = getOwnerKey(task.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.taskCount += 1
    const timestamp = getTaskTimestamp(task)
    if (timestamp && (!acc.lastActivityAt || timestamp > acc.lastActivityAt)) {
      acc.lastActivityAt = timestamp
    }
  }

  for (const document of data.documents) {
    if (!document.document_type || !['INVOICE', 'USAGE_DATA'].includes(document.document_type)) continue
    const account = document.account_id
      ? data.accounts.find((row) => row.id === document.account_id)
      : null
    const rawOwner = getOwnerKey(account?.ownerId)
    const canonicalKey = canonicalizeOwnerKey(rawOwner, ownerIndex)
    const acc = upsertAlias(ownerMap, canonicalKey, rawOwner, ownerIndex)
    acc.billCount += 1
    acc.totalDocuments += 1
    if (document.document_type === 'INVOICE') acc.invoiceCount += 1
    if (document.document_type === 'USAGE_DATA') acc.usageCount += 1
    if (document.created_at && (!acc.lastBillAt || document.created_at > acc.lastBillAt)) {
      acc.lastBillAt = document.created_at
    }
  }

  for (const acc of ownerMap.values()) {
    computeLastActivity(acc)
  }

  const rows = sortOwners(Array.from(ownerMap.values()).map(finalizeAccumulator))
  const totals: AgentProgressTotals = rows.reduce<AgentProgressTotals>(
    (acc, row) => ({
      owners: acc.owners + 1,
      accounts: acc.accounts + row.accountCount,
      contacts: acc.contacts + row.contactCount,
      calls: acc.calls + row.callCount,
      emails: acc.emails + row.emailCount,
      tasks: acc.tasks + row.taskCount,
      bills: acc.bills + row.billCount,
      assignedNumbers: acc.assignedNumbers + row.activeNumbers,
    }),
    {
      owners: 0,
      accounts: 0,
      contacts: 0,
      calls: 0,
      emails: 0,
      tasks: 0,
      bills: 0,
      assignedNumbers: 0,
    }
  )

  return {
    generatedAt: new Date().toISOString(),
    totals,
    agents: rows,
  } satisfies AgentProgressReport
}

export async function buildAgentProgressDetail(ownerKey: string) {
  const report = await buildAgentProgressReport()
  const normalizedKey = getOwnerKey(ownerKey)
  const owner =
    report.agents.find((row) => row.key === normalizedKey) ||
    report.agents.find((row) => (row.aliases || []).includes(normalizedKey)) ||
    null

  if (!owner) return null

  return owner
}
