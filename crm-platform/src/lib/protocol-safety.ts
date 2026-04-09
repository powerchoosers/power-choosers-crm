export type ProtocolGraphNodeLike = {
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

export type ProtocolGraphEdgeLike = {
  id?: string
  source?: string
  target?: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: unknown
  data?: Record<string, unknown> | null
}

export type ProtocolCooldownIssue = {
  sourceNodeId: string
  sourceNodeLabel: string
  targetNodeId: string
  targetNodeLabel: string
  gapHours: number
  pathNodeIds: string[]
  pathLabels: string[]
  pathSummary: string
}

export type ProtocolCooldownAnalysis = {
  issues: ProtocolCooldownIssue[]
  issueCount: number
  hasRisk: boolean
  tightestGapHours: number | null
  riskyNodeIds: string[]
}

const DEFAULT_MINIMUM_GAP_HOURS = 24

function toText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeNodeType(node: ProtocolGraphNodeLike): string {
  return toText(node?.data?.type) || toText(node?.type)
}

function normalizeNodeLabel(node: ProtocolGraphNodeLike, fallbackIndex: number): string {
  return toText(node?.data?.label)
    || toText(node?.label)
    || toText(node?.id)
    || `Step ${fallbackIndex + 1}`
}

function parseDelayHours(node: ProtocolGraphNodeLike): number {
  const rawDelay = toNumber(node?.data?.delay ?? node?.delay)
  const delayValue = rawDelay == null ? 0 : Math.max(0, rawDelay)
  const unit = toText(node?.data?.delayUnit ?? node?.delayUnit).toLowerCase() || 'days'

  switch (unit) {
    case 'minutes':
      return delayValue / 60
    case 'hours':
      return delayValue
    case 'days':
      return delayValue * 24
    case 'weeks':
      return delayValue * 24 * 7
    case 'months':
      return delayValue * 24 * 30
    default:
      return delayValue * 24
  }
}

function formatDurationHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  if (!Number.isFinite(totalMinutes)) return '0 minutes'
  if (totalMinutes === 0) return 'under 1 minute'
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`
  }

  const wholeHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60
  if (wholeHours < 24) {
    if (remainingMinutes === 0) {
      return `${wholeHours} hour${wholeHours === 1 ? '' : 's'}`
    }
    return `${wholeHours} hour${wholeHours === 1 ? '' : 's'} ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
  }

  const days = Math.floor(wholeHours / 24)
  const remainingHours = wholeHours % 24
  if (remainingHours === 0) {
    return `${days} day${days === 1 ? '' : 's'}`
  }

  return `${days} day${days === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`
}

export function analyzeProtocolEmailCooldownRisk(
  nodes: ProtocolGraphNodeLike[] = [],
  edges: ProtocolGraphEdgeLike[] = [],
  minimumGapHours = DEFAULT_MINIMUM_GAP_HOURS
): ProtocolCooldownAnalysis {
  const nodeMap = new Map<string, ProtocolGraphNodeLike>()
  const outgoing = new Map<string, ProtocolGraphEdgeLike[]>()
  const incomingCount = new Map<string, number>()

  nodes.forEach((node) => {
    if (!node?.id) return
    nodeMap.set(node.id, node)
    if (!outgoing.has(node.id)) {
      outgoing.set(node.id, [])
    }
    if (!incomingCount.has(node.id)) {
      incomingCount.set(node.id, 0)
    }
  })

  edges.forEach((edge) => {
    if (!edge?.source || !edge?.target) return
    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, [])
    }
    outgoing.get(edge.source)!.push(edge)
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1)
  })

  const roots = nodes.filter((node) => node?.id && (incomingCount.get(node.id) || 0) === 0)
  const startNodes = roots.length > 0 ? roots : nodes.filter((node) => !!node?.id)

  const issueMap = new Map<string, ProtocolCooldownIssue>()

  type EmailState = {
    nodeId: string
    nodeLabel: string
    elapsedHours: number
    pathIndex: number
  }

  const walk = (
    nodeId: string,
    elapsedHours: number,
    lastEmail: EmailState | null,
    path: Array<{ id: string; label: string }>,
    pathNodeIds: string[]
  ) => {
    const node = nodeMap.get(nodeId)
    if (!node) return

    const nodeIndex = path.length
    const nodeLabel = normalizeNodeLabel(node, nodeIndex)
    const nodeType = normalizeNodeType(node).toLowerCase()
    const currentPath = path.concat({ id: nodeId, label: nodeLabel })
    const currentPathNodeIds = pathNodeIds.concat(nodeId)

    let currentLastEmail = lastEmail
    if (nodeType === 'email') {
      if (lastEmail) {
        const gapHours = elapsedHours - lastEmail.elapsedHours
        if (gapHours < minimumGapHours) {
          const issuePath = currentPath.slice(lastEmail.pathIndex)
          const issuePathIds = currentPathNodeIds.slice(lastEmail.pathIndex)
          const sourceNodeLabel = lastEmail.nodeLabel
          const targetNodeLabel = nodeLabel
          const key = `${lastEmail.nodeId}->${nodeId}|${issuePathIds.join('>')}`

          if (!issueMap.has(key)) {
            issueMap.set(key, {
              sourceNodeId: lastEmail.nodeId,
              sourceNodeLabel,
              targetNodeId: nodeId,
              targetNodeLabel,
              gapHours,
              pathNodeIds: issuePathIds,
              pathLabels: issuePath.map((step) => step.label),
              pathSummary: issuePath.map((step) => step.label).join(' → '),
            })
          }
        }
      }

      currentLastEmail = {
        nodeId,
        nodeLabel,
        elapsedHours,
        pathIndex: currentPath.length - 1,
      }
    }

    const nextEdges = outgoing.get(nodeId) || []
    for (const edge of nextEdges) {
      if (!edge?.target || currentPathNodeIds.includes(edge.target)) continue
      const child = nodeMap.get(edge.target)
      if (!child?.id) continue
      const childElapsedHours = elapsedHours + parseDelayHours(child)
      walk(child.id, childElapsedHours, currentLastEmail, currentPath, currentPathNodeIds)
    }
  }

  startNodes.forEach((node) => {
    if (!node?.id) return
    walk(node.id, parseDelayHours(node), null, [], [])
  })

  const issues = Array.from(issueMap.values()).sort((a, b) => a.gapHours - b.gapHours)
  const riskyNodeIds = Array.from(new Set(issues.map((issue) => issue.targetNodeId)))
  const tightestGapHours = issues.length > 0 ? issues[0].gapHours : null

  return {
    issues,
    issueCount: issues.length,
    hasRisk: issues.length > 0,
    tightestGapHours,
    riskyNodeIds,
  }
}

export function formatCooldownDuration(hours: number): string {
  return formatDurationHours(hours)
}
