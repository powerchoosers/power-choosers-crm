import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser, supabaseAdmin } from '@/lib/supabase';
import { resolveContactPhotoUrl } from '@/lib/contactAvatar';

type SequenceIntelRow = {
  memberId: string;
  memberStatus: string | null;
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  contactId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  accountName: string | null;
  updatedAt: string | null;
  totalEmailsSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  executionStatus: string | null;
  executionStepType: string | null;
  executionScheduledAt: string | null;
  executionLabel: string | null;
  avatarUrl: string | null;
  accountId: string | null;
  accountDomain: string | null;
  accountLogoUrl: string | null;
};

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickExecutionLabel(
  execution: Record<string, any> | undefined,
  nodeMap: Map<string, string>
): string | null {
  if (!execution) return null;

  const metadata = execution.metadata && typeof execution.metadata === 'object'
    ? execution.metadata
    : {};

  const explicitLabel =
    metadata.stepLabel ||
    metadata.label ||
    metadata.nodeLabel ||
    metadata.step_label;

  if (typeof explicitLabel === 'string' && explicitLabel.trim()) {
    return explicitLabel.trim();
  }

  const nodeId =
    metadata.nodeId ||
    metadata.node_id ||
    metadata?.node?.id;

  if (typeof nodeId === 'string' && nodeMap.has(nodeId)) {
    return nodeMap.get(nodeId) || null;
  }

  if (typeof execution.step_type === 'string' && execution.step_type.trim()) {
    return execution.step_type;
  }

  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user } = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawId = req.query.id;
  const sequenceId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!sequenceId || typeof sequenceId !== 'string') {
    res.status(400).json({ error: 'Missing sequence id' });
    return;
  }

  try {
    const { data: sequence, error: sequenceError } = await supabaseAdmin
      .from('sequences')
      .select('id, name, bgvector')
      .eq('id', sequenceId)
      .single();

    if (sequenceError || !sequence) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }

    const nodes = Array.isArray(sequence?.bgvector?.nodes) ? sequence.bgvector.nodes : [];
    const nodeLabelMap = new Map<string, string>();
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const nodeId = typeof node.id === 'string' ? node.id : null;
      const label = typeof node?.data?.label === 'string' ? node.data.label : null;
      if (nodeId && label) nodeLabelMap.set(nodeId, label);
    }

    const { data: members, error: membersError } = await supabaseAdmin
      .from('sequence_members')
      .select([
        'id',
        'status',
        'targetId',
        'updatedAt',
        'current_node_id',
        'total_emails_sent',
        'total_opens',
        'total_clicks',
        'total_replies'
      ].join(','))
      .eq('sequenceId', sequenceId)
      .order('updatedAt', { ascending: false })
      .limit(1000);

    if (membersError) {
      throw membersError;
    }

    const safeMembers = Array.isArray(members) ? members : [];
    const memberIds = safeMembers.map((m: any) => m.id).filter((v: any) => typeof v === 'string');
    const contactIds = safeMembers.map((m: any) => m.targetId).filter((v: any) => typeof v === 'string');

    const { data: contacts, error: contactsError } = contactIds.length
      ? await supabaseAdmin
          .from('contacts')
          .select('id, firstName, lastName, email, title, accountId, metadata')
          .in('id', contactIds)
      : { data: [], error: null };

    if (contactsError) {
      throw contactsError;
    }

    const safeContacts = Array.isArray(contacts) ? contacts : [];
    const accountIds = safeContacts
      .map((c: any) => c.accountId)
      .filter((v: any, idx: number, arr: any[]) => typeof v === 'string' && arr.indexOf(v) === idx);

    const { data: accounts, error: accountsError } = accountIds.length
      ? await supabaseAdmin
          .from('accounts')
          .select('id, name, domain, logo_url')
          .in('id', accountIds)
      : { data: [], error: null };

    if (accountsError) {
      throw accountsError;
    }

    const { data: executions, error: executionsError } = memberIds.length
      ? await supabaseAdmin
          .from('sequence_executions')
          .select('id, member_id, step_type, status, scheduled_at, created_at, metadata')
          .eq('sequence_id', sequenceId)
          .in('member_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(5000)
      : { data: [], error: null };

    if (executionsError) {
      throw executionsError;
    }

    const contactById = new Map<string, any>();
    for (const contact of safeContacts) {
      if (contact?.id) contactById.set(contact.id, contact);
    }

    const accountById = new Map<string, any>();
    for (const account of (accounts || [])) {
      if ((account as any)?.id) accountById.set((account as any).id, account);
    }

    const latestExecutionByMember = new Map<string, any>();
    for (const execution of (executions || [])) {
      const memberId = (execution as any)?.member_id;
      if (!memberId || latestExecutionByMember.has(memberId)) continue;
      latestExecutionByMember.set(memberId, execution);
    }

    const rows: SequenceIntelRow[] = safeMembers.map((member: any) => {
      const contact = contactById.get(member.targetId);
      const account = contact?.accountId ? accountById.get(contact.accountId) : null;
      const execution = latestExecutionByMember.get(member.id);
      const currentNodeId = typeof member.current_node_id === 'string' ? member.current_node_id : null;

      return {
        memberId: member.id,
        memberStatus: member.status || null,
        currentNodeId,
        currentNodeLabel: currentNodeId ? nodeLabelMap.get(currentNodeId) || null : null,
        contactId: member.targetId || null,
        firstName: contact?.firstName || null,
        lastName: contact?.lastName || null,
        email: contact?.email || null,
        title: contact?.title || null,
        avatarUrl: resolveContactPhotoUrl(contact, contact?.metadata) || null,
        accountId: contact?.accountId || null,
        accountName: (account as any)?.name || null,
        accountDomain: (account as any)?.domain || null,
        accountLogoUrl: (account as any)?.logo_url || null,
        updatedAt: member.updatedAt || null,
        totalEmailsSent: normalizeNumber(member.total_emails_sent),
        totalOpens: normalizeNumber(member.total_opens),
        totalClicks: normalizeNumber(member.total_clicks),
        totalReplies: normalizeNumber(member.total_replies),
        executionStatus: execution?.status || null,
        executionStepType: execution?.step_type || null,
        executionScheduledAt: execution?.scheduled_at || null,
        executionLabel: pickExecutionLabel(execution, nodeLabelMap),
      };
    });

    const summary = {
      totalMembers: rows.length,
      activeMembers: rows.filter(r => r.memberStatus === 'active').length,
      pausedMembers: rows.filter(r => r.memberStatus === 'paused').length,
      completedMembers: rows.filter(r => r.memberStatus === 'completed').length,
      queuedExecutions: rows.filter(r => r.executionStatus === 'pending' || r.executionStatus === 'queued').length,
      runningExecutions: rows.filter(r => r.executionStatus === 'processing' || r.executionStatus === 'running').length,
      failedExecutions: rows.filter(r => r.executionStatus === 'failed').length,
    };

    res.status(200).json({
      sequence: {
        id: sequence.id,
        name: sequence.name || null,
      },
      summary,
      rows,
    });
  } catch (error: any) {
    console.error('[sequence-intel] failed:', error);
    res.status(500).json({
      error: 'Failed to load sequence intel',
      details: error?.message || 'Unknown error',
    });
  }
}
