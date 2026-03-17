import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

type RemoveContactResponse =
  | {
      success: true
      alreadyRemoved?: boolean
      sequenceId?: string | null
      deleted: {
        tasksByMemberKey: number
        tasksByExecutionKey: number
        tasksBySequenceKey: number
        executions: number
        memberships: number
      }
    }
  | { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<RemoveContactResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user } = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const contactId = String(req.body?.contactId || '').trim()
  const membershipId = String(req.body?.membershipId || '').trim()

  if (!contactId || !membershipId) {
    return res.status(400).json({ error: 'Missing contactId or membershipId' })
  }

  try {
    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from('sequence_members')
      .select('id, sequenceId, targetId')
      .eq('id', membershipId)
      .maybeSingle()

    if (memberErr) throw memberErr
    if (!memberRow) {
      return res.status(200).json({
        success: true,
        alreadyRemoved: true,
        sequenceId: null,
        deleted: {
          tasksByMemberKey: 0,
          tasksByExecutionKey: 0,
          tasksBySequenceKey: 0,
          executions: 0,
          memberships: 0,
        },
      })
    }

    if (memberRow.targetId !== contactId) {
      return res.status(400).json({ error: 'Membership does not belong to this contact' })
    }

    const sequenceId = String(memberRow.sequenceId || '')

    const { data: execRows, error: execReadErr } = await supabaseAdmin
      .from('sequence_executions')
      .select('id')
      .eq('member_id', membershipId)
    if (execReadErr) throw execReadErr

    const executionIds = (execRows || []).map((r: any) => String(r.id)).filter(Boolean)

    let tasksByMemberKey = 0
    let tasksByExecutionKey = 0
    let tasksBySequenceKey = 0

    const { data: byMemberIdA, error: taskErrA } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('contactId', contactId)
      .eq('priority', 'Protocol')
      .eq('metadata->>source', 'sequence')
      .filter('metadata->>memberId', 'eq', membershipId)
      .select('id')
    if (taskErrA) throw taskErrA
    tasksByMemberKey += (byMemberIdA || []).length

    const { data: byMemberIdB, error: taskErrB } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('contactId', contactId)
      .eq('priority', 'Protocol')
      .eq('metadata->>source', 'sequence')
      .filter('metadata->>member_id', 'eq', membershipId)
      .select('id')
    if (taskErrB) throw taskErrB
    tasksByMemberKey += (byMemberIdB || []).length

    for (const executionId of executionIds) {
      const { data: byExecA, error: taskExecErrA } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('contactId', contactId)
        .eq('priority', 'Protocol')
        .eq('metadata->>source', 'sequence')
        .filter('metadata->>sequenceExecutionId', 'eq', executionId)
        .select('id')
      if (taskExecErrA) throw taskExecErrA
      tasksByExecutionKey += (byExecA || []).length

      const { data: byExecB, error: taskExecErrB } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('contactId', contactId)
        .eq('priority', 'Protocol')
        .eq('metadata->>source', 'sequence')
        .filter('metadata->>execution_id', 'eq', executionId)
        .select('id')
      if (taskExecErrB) throw taskExecErrB
      tasksByExecutionKey += (byExecB || []).length
    }

    if (sequenceId) {
      const { data: bySequence, error: taskSeqErr } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('contactId', contactId)
        .eq('priority', 'Protocol')
        .eq('metadata->>source', 'sequence')
        .filter('metadata->>sequenceId', 'eq', sequenceId)
        .select('id')
      if (taskSeqErr) throw taskSeqErr
      tasksBySequenceKey += (bySequence || []).length
    }

    const { data: deletedExecutions, error: execDeleteErr } = await supabaseAdmin
      .from('sequence_executions')
      .delete()
      .eq('member_id', membershipId)
      .select('id')
    if (execDeleteErr) throw execDeleteErr

    const { data: deletedMemberships, error: memberDeleteErr } = await supabaseAdmin
      .from('sequence_members')
      .delete()
      .eq('id', membershipId)
      .eq('targetId', contactId)
      .select('id')
    if (memberDeleteErr) throw memberDeleteErr

    return res.status(200).json({
      success: true,
      sequenceId: sequenceId || null,
      deleted: {
        tasksByMemberKey,
        tasksByExecutionKey,
        tasksBySequenceKey,
        executions: (deletedExecutions || []).length,
        memberships: (deletedMemberships || []).length,
      },
    })
  } catch (error: any) {
    console.error('[protocols/remove-contact] failed:', error)
    return res.status(500).json({ error: error?.message || 'Failed to remove contact from protocol' })
  }
}

