/**
 * POST /api/intelligence/ingest-prospect
 * One-click: creates a CRM account from a prospect_radar entry,
 * marks the prospect as ingested, and returns the new account ID.
 */
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user } = await requireUser(req);
  if (!user) return;

  const { prospectId } = req.body || {};
  if (!prospectId) {
    res.status(400).json({ error: 'prospectId required' });
    return;
  }

  try {
    if (!supabaseAdmin) {
      res.status(500).json({ error: 'Supabase not configured' });
      return;
    }

    // Fetch the prospect
    const { data: prospect, error: fetchError } = await supabaseAdmin
      .from('prospect_radar')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (fetchError || !prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const now = new Date().toISOString();
    const domain = (prospect.domain || '').toLowerCase().trim() || null;

    // Duplicate check: domain first, then name
    let existingId = null;
    if (domain) {
      const { data } = await supabaseAdmin.from('accounts').select('id').eq('domain', domain).maybeSingle();
      if (data) existingId = data.id;
    }
    if (!existingId && prospect.name) {
      const { data } = await supabaseAdmin.from('accounts').select('id').ilike('name', prospect.name).maybeSingle();
      if (data) existingId = data.id;
    }

    const accountId = existingId || crypto.randomUUID();

    // Build service_addresses
    const serviceAddresses = [];
    if (prospect.city || prospect.state) {
      serviceAddresses.push({
        address: '',
        city: prospect.city || '',
        state: prospect.state || '',
        country: 'United States',
        type: 'headquarters',
        isPrimary: true,
      });
    }

    const payload = {
      name: prospect.name,
      domain: domain,
      industry: prospect.industry || null,
      description: prospect.description || null,
      employees: prospect.employee_count || 0,
      city: prospect.city || null,
      state: prospect.state || null,
      country: 'United States',
      logo_url: prospect.logo_url || null,
      phone: prospect.phone || null,
      linkedin_url: prospect.linkedin_url || null,
      status: 'active',
      service_addresses: serviceAddresses,
      metadata: { meters: [], source: 'prospect_radar' },
      updatedAt: now,
    };

    if (existingId) {
      const { error } = await supabaseAdmin.from('accounts').update(payload).eq('id', existingId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('accounts').insert({ id: accountId, ...payload, createdAt: now });
      if (error) throw error;
    }

    // Mark prospect as ingested
    await supabaseAdmin
      .from('prospect_radar')
      .update({ ingested_at: now, crm_account_id: accountId })
      .eq('id', prospectId);

    res.status(200).json({ accountId, existing: !!existingId });
  } catch (err) {
    console.error('[ingest-prospect] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
