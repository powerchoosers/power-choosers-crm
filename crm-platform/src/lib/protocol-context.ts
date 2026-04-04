export type ProtocolNodeLike = {
  id?: string
  type?: string
  data?: Record<string, unknown> & {
    label?: unknown
    type?: unknown
    delay?: unknown
    delayUnit?: unknown
  }
  label?: unknown
  delay?: unknown
  delayUnit?: unknown
}

export type ProtocolStepLike = {
  id?: string
  type?: string
  delayDays?: unknown
  delay?: unknown
  content?: unknown
  subject?: unknown
  label?: unknown
  status?: unknown
}

export type ProtocolSourceLike = {
  id?: string | null
  name?: string | null
  description?: string | null
  steps?: ProtocolStepLike[] | null
  bgvector?: {
    nodes?: ProtocolNodeLike[] | null
    settings?: {
      senderEmail?: string | null
    } | null
  } | null
}

export type ProtocolTaskLike = {
  id?: string | null
  title?: string | null
  description?: string | null
  status?: string | null
  priority?: string | null
  contactId?: string | null
  accountId?: string | null
  relatedTo?: string | null
  relatedType?: string | null
  metadata?: Record<string, unknown> | null
  contacts?: {
    id?: string | null
    name?: string | null
    firstName?: string | null
    lastName?: string | null
    title?: string | null
  } | null
  accounts?: {
    id?: string | null
    name?: string | null
    description?: string | null
    domain?: string | null
    city?: string | null
    state?: string | null
    address?: string | null
  } | null
}

export interface ProtocolContextData extends Record<string, unknown> {
  protocolId: string
  protocolName: string
  description?: string
  stepCount?: number
  stepSummary?: string[]
  targetContactId?: string | null
  targetContactName?: string | null
  targetAccountId?: string | null
  targetAccountName?: string | null
  decisionMakerId?: string | null
  parentCompanyName?: string | null
  parentAccountId?: string | null
  parentCompanyId?: string | null
  subsidiaryAccountIds?: string[]
  subsidiaryCompanyNames?: string[]
  organizationRole?: string
  hierarchySummary?: string
  selectedNode?: { id?: string; label?: string; type?: string } | null
  senderEmail?: string | null
  siteAddress?: string | null
  siteCity?: string | null
  siteState?: string | null
  utilityTerritory?: string | null
  marketContext?: string | null
  taskId?: string | null
  taskTitle?: string | null
  taskPriority?: string | null
  taskStatus?: string | null
}

export type ProtocolContextPayload = {
  type: 'protocol'
  id: string
  label: string
  data: ProtocolContextData
}

function toText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value)
    if (text) return text
  }
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeStepSummary(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || value.length === 0) return []
  return value.slice(0, limit).map((item, index) => {
    if (typeof item === 'string') return item.trim()
    if (isRecord(item)) {
      const label = firstText(item.label, item.subject, item.name, item.title, item.content, item.type) || `Step ${index + 1}`
      const status = firstText(item.status)
      return status ? `${label} [${status}]` : label
    }
    return ''
  }).filter(Boolean)
}

function buildNodeSummary(nodes: ProtocolNodeLike[] | null | undefined, limit: number): string[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return []
  return nodes.slice(0, limit).map((node, index) => {
    const data = node?.data && typeof node.data === 'object' ? node.data : {}
    const label = toText(data.label) || toText(node.label) || toText(node.id) || `Step ${index + 1}`
    const type = toText(data.type) || toText(node.type)
    const delay = toText(data.delay) || toText(node.delay)
    const delayUnit = toText(data.delayUnit) || toText(node.delayUnit) || 'days'
    const delaySuffix = delay ? ` (${delay} ${delayUnit})` : ''
    const typeSuffix = type ? ` [${type}]` : ''
    return `${index + 1}. ${label}${delaySuffix}${typeSuffix}`
  })
}

function buildStepSummary(steps: ProtocolStepLike[] | null | undefined, limit: number): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return []
  return steps.slice(0, limit).map((step, index) => {
    const label = toText(step.subject) || toText(step.content) || toText(step.label) || toText(step.type) || `Step ${index + 1}`
    const delay = toText(step.delayDays) || toText(step.delay)
    const status = toText(step.status)
    const delaySuffix = delay ? ` (${delay} days)` : ''
    const statusSuffix = status ? ` [${status}]` : ''
    return `${index + 1}. ${label}${delaySuffix}${statusSuffix}`
  })
}

export function buildProtocolStepSummary(protocol: ProtocolSourceLike | null | undefined, limit = 12): string[] {
  if (!protocol) return []
  const nodeSummary = buildNodeSummary(protocol.bgvector?.nodes, limit)
  if (nodeSummary.length > 0) return nodeSummary
  return buildStepSummary(protocol.steps, limit)
}

export function buildProtocolContextFromTask(
  task: ProtocolTaskLike | null | undefined,
  extras: Partial<ProtocolContextData> = {},
  limit = 12
): ProtocolContextPayload | null {
  if (!task) return null

  const metadata = (isRecord(task.metadata) ? task.metadata : {}) as Record<string, unknown>
  const protocolMeta = isRecord(metadata.protocol) ? metadata.protocol : null
  const sequenceMeta = isRecord(metadata.sequence) ? metadata.sequence : null
  const selectedNodeMeta = isRecord(metadata.selectedNode) ? metadata.selectedNode : null
  const protocolId = firstText(
    extras.protocolId,
    metadata.protocolId,
    metadata.protocol_id,
    metadata.sequenceId,
    metadata.sequence_id,
    protocolMeta?.id,
    sequenceMeta?.id,
    sequenceMeta?.sequenceId,
    sequenceMeta?.sequence_id
  )
  if (!protocolId) return null

  const protocolName = firstText(
    extras.protocolName,
    metadata.protocolName,
    metadata.protocol_name,
    metadata.sequenceName,
    metadata.sequence_name,
    protocolMeta?.name,
    sequenceMeta?.name,
    task.title,
    `Protocol ${protocolId}`
  )
  const description = firstText(
    extras.description,
    metadata.protocolDescription,
    metadata.protocol_description,
    metadata.description,
    task.description
  ) || undefined

  const stepSummary = Array.isArray(extras.stepSummary) && extras.stepSummary.length > 0
    ? extras.stepSummary
    : normalizeStepSummary(
        metadata.stepSummary ??
        metadata.step_summary ??
        metadata.steps ??
        metadata.protocolSteps ??
        metadata.protocol_steps,
        limit
      )

  const selectedNode = isRecord(extras.selectedNode)
    ? extras.selectedNode
    : selectedNodeMeta
      ? {
          id: firstText(selectedNodeMeta.id),
          label: firstText(selectedNodeMeta.label),
          type: firstText(selectedNodeMeta.type),
        }
      : null

  const targetContactId = firstText(
    extras.targetContactId,
    metadata.targetContactId,
    metadata.target_contact_id,
    metadata.decisionMakerId,
    metadata.decision_maker_id,
    task.contactId
  ) || null
  const targetContactName = firstText(
    extras.targetContactName,
    metadata.targetContactName,
    metadata.target_contact_name,
    metadata.decisionMakerName,
    metadata.decision_maker_name,
    task.contacts?.name,
    [task.contacts?.firstName, task.contacts?.lastName].filter(Boolean).join(' ')
  ) || null

  const parentAccountId = firstText(
    extras.parentAccountId,
    metadata.parentAccountId,
    metadata.parent_account_id,
    metadata.parentCompanyId,
    metadata.parent_company_id
  ) || null
  const parentCompanyName = firstText(
    extras.parentCompanyName,
    metadata.parentCompanyName,
    metadata.parent_company_name,
    metadata.parentCompany,
    metadata.parent_company
  ) || null

  const targetAccountId = firstText(
    extras.targetAccountId,
    metadata.targetAccountId,
    metadata.target_account_id,
    task.accountId,
    parentAccountId,
    metadata.parentCompanyId,
    metadata.parent_company_id
  ) || null
  const targetAccountName = firstText(
    extras.targetAccountName,
    metadata.targetAccountName,
    metadata.target_account_name,
    task.accounts?.name,
    task.relatedTo,
    parentCompanyName,
    metadata.parentCompany,
    metadata.parent_company
  ) || null

  const subsidiaryAccountIds = Array.isArray(extras.subsidiaryAccountIds) && extras.subsidiaryAccountIds.length > 0
    ? extras.subsidiaryAccountIds
    : toStringList(metadata.subsidiaryAccountIds ?? metadata.subsidiary_account_ids)
  const subsidiaryCompanyNames = Array.isArray(extras.subsidiaryCompanyNames) && extras.subsidiaryCompanyNames.length > 0
    ? extras.subsidiaryCompanyNames
    : toStringList(metadata.subsidiaryCompanyNames ?? metadata.subsidiary_company_names)

  const organizationRole = extras.organizationRole
    || firstText(metadata.organizationRole, metadata.organization_role)
    || (parentAccountId ? 'subsidiary' : subsidiaryAccountIds.length > 0 ? 'parent' : 'standalone')

  const hierarchySummary = firstText(
    extras.hierarchySummary,
    metadata.hierarchySummary,
    metadata.hierarchy_summary
  ) || undefined

  const senderEmail = firstText(
    extras.senderEmail,
    metadata.senderEmail,
    metadata.sender_email
  ) || null

  const siteAddress = firstText(
    extras.siteAddress,
    metadata.siteAddress,
    metadata.site_address,
    task.accounts?.address
  ) || null
  const siteCity = firstText(
    extras.siteCity,
    metadata.siteCity,
    metadata.site_city,
    task.accounts?.city
  ) || null
  const siteState = firstText(
    extras.siteState,
    metadata.siteState,
    metadata.site_state,
    task.accounts?.state
  ) || null
  const utilityTerritory = firstText(
    extras.utilityTerritory,
    metadata.utilityTerritory,
    metadata.utility_territory
  ) || null
  const marketContext = firstText(
    extras.marketContext,
    metadata.marketContext,
    metadata.market_context
  ) || null

  return buildProtocolContext(undefined, {
    protocolId,
    protocolName,
    description,
    stepSummary,
    stepCount: typeof extras.stepCount === 'number'
      ? extras.stepCount
      : Array.isArray(stepSummary) && stepSummary.length > 0
        ? stepSummary.length
        : typeof metadata.stepCount === 'number'
          ? metadata.stepCount
          : typeof metadata.step_count === 'number'
            ? metadata.step_count
            : undefined,
    targetContactId,
    targetContactName,
    targetAccountId,
    targetAccountName,
    decisionMakerId: firstText(extras.decisionMakerId, metadata.decisionMakerId, metadata.decision_maker_id, targetContactId) || null,
    parentCompanyName,
    parentAccountId,
    parentCompanyId: firstText(extras.parentCompanyId, metadata.parentCompanyId, metadata.parent_company_id) || null,
    subsidiaryAccountIds,
    subsidiaryCompanyNames,
    organizationRole,
    hierarchySummary,
    selectedNode: selectedNode ? {
      id: firstText(selectedNode.id),
      label: firstText(selectedNode.label),
      type: firstText(selectedNode.type),
    } : null,
    senderEmail,
    siteAddress,
    siteCity,
    siteState,
    utilityTerritory,
    marketContext,
    taskId: firstText(extras.taskId, task.id) || null,
    taskTitle: firstText(extras.taskTitle, task.title) || null,
    taskPriority: firstText(extras.taskPriority, task.priority) || null,
    taskStatus: firstText(extras.taskStatus, task.status) || null,
  }, limit)
}

export function buildProtocolTaskMetadata(
  context: ProtocolContextPayload | null | undefined,
  extras: Partial<Pick<ProtocolContextData, 'taskId' | 'taskTitle' | 'taskPriority' | 'taskStatus'>> & {
    description?: string
    source?: string
  } = {}
): Record<string, unknown> | null {
  if (!context || context.type !== 'protocol') return null

  const data = context.data
  return {
    source: extras.source || 'gemini_chat',
    contextType: 'protocol',
    protocolId: data.protocolId,
    protocolName: data.protocolName,
    protocolDescription: data.description ?? undefined,
    stepCount: data.stepCount ?? undefined,
    stepSummary: Array.isArray(data.stepSummary) ? data.stepSummary : [],
    targetContactId: data.targetContactId ?? undefined,
    targetContactName: data.targetContactName ?? undefined,
    targetAccountId: data.targetAccountId ?? data.parentAccountId ?? data.parentCompanyId ?? undefined,
    targetAccountName: data.targetAccountName ?? data.parentCompanyName ?? undefined,
    decisionMakerId: data.decisionMakerId ?? undefined,
    parentCompanyName: data.parentCompanyName ?? undefined,
    parentAccountId: data.parentAccountId ?? undefined,
    parentCompanyId: data.parentCompanyId ?? undefined,
    subsidiaryAccountIds: Array.isArray(data.subsidiaryAccountIds) ? data.subsidiaryAccountIds : [],
    subsidiaryCompanyNames: Array.isArray(data.subsidiaryCompanyNames) ? data.subsidiaryCompanyNames : [],
    organizationRole: data.organizationRole ?? undefined,
    hierarchySummary: data.hierarchySummary ?? undefined,
    selectedNode: data.selectedNode ?? undefined,
    senderEmail: data.senderEmail ?? undefined,
    siteAddress: data.siteAddress ?? undefined,
    siteCity: data.siteCity ?? undefined,
    siteState: data.siteState ?? undefined,
    utilityTerritory: data.utilityTerritory ?? undefined,
    marketContext: data.marketContext ?? undefined,
    taskId: extras.taskId ?? data.taskId ?? undefined,
    taskTitle: extras.taskTitle ?? data.taskTitle ?? data.protocolName,
    taskDescription: extras.description,
    taskPriority: extras.taskPriority ?? data.taskPriority ?? 'Medium',
    taskStatus: extras.taskStatus ?? data.taskStatus ?? 'Pending',
  }
}

export function buildProtocolContext(
  protocol: ProtocolSourceLike | null | undefined,
  extras: Partial<ProtocolContextData> & { protocolId?: string; label?: string } = {},
  limit = 12
): ProtocolContextPayload | null {
  const protocolId = toText(extras.protocolId) || toText(protocol?.id)
  if (!protocolId) return null

  const protocolName = toText(extras.protocolName) || toText(protocol?.name) || `Protocol ${protocolId}`
  const stepSummary = Array.isArray(extras.stepSummary) && extras.stepSummary.length > 0
    ? extras.stepSummary
    : buildProtocolStepSummary(protocol, limit)

  return {
    type: 'protocol',
    id: protocolId,
    label: extras.label || `PROTOCOL: ${protocolName.toUpperCase()}`,
    data: {
      protocolId,
      protocolName,
      description: toText(extras.description) || toText(protocol?.description) || undefined,
      stepCount: typeof extras.stepCount === 'number'
        ? extras.stepCount
        : stepSummary.length > 0
          ? stepSummary.length
          : undefined,
      stepSummary,
      targetContactId: extras.targetContactId ?? null,
      targetContactName: extras.targetContactName ?? null,
      targetAccountId: extras.targetAccountId ?? null,
      targetAccountName: extras.targetAccountName ?? null,
      decisionMakerId: extras.decisionMakerId ?? null,
      parentCompanyName: extras.parentCompanyName ?? null,
      parentAccountId: extras.parentAccountId ?? null,
      parentCompanyId: extras.parentCompanyId ?? null,
      subsidiaryAccountIds: extras.subsidiaryAccountIds ?? [],
      subsidiaryCompanyNames: extras.subsidiaryCompanyNames ?? [],
      organizationRole: extras.organizationRole,
      hierarchySummary: extras.hierarchySummary,
      selectedNode: extras.selectedNode ?? null,
      senderEmail: extras.senderEmail ?? protocol?.bgvector?.settings?.senderEmail ?? null,
      siteAddress: extras.siteAddress ?? null,
      siteCity: extras.siteCity ?? null,
      siteState: extras.siteState ?? null,
      utilityTerritory: extras.utilityTerritory ?? null,
      marketContext: extras.marketContext ?? null,
      taskId: extras.taskId ?? null,
      taskTitle: extras.taskTitle ?? null,
      taskPriority: extras.taskPriority ?? null,
      taskStatus: extras.taskStatus ?? null,
    },
  }
}
