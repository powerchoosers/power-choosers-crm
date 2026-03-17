/**
 * POST /api/intelligence/ingest-prospect
 * One-click: creates a CRM account from a prospect_radar entry,
 * marks the prospect as ingested, and returns the new account ID.
 */
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import { buildProspectServiceAddresses, enrichApolloOrganizationByDomain, formatProspectLocationLabel, normalizeOrganizationName } from '@/lib/apollo-prospect';
import { cors } from '../_cors.js';
import { getApiKey } from '../apollo/_utils.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { user, id: userId } = await requireUser(req);
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
    const apiKey = getApiKey();
    const enrichedOrg = domain ? await enrichApolloOrganizationByDomain({ domain }, apiKey) : null;

    // Duplicate check: domain first, then name
    let existingId = null;
    if (domain) {
      const { data } = await supabaseAdmin.from('accounts').select('id').eq('domain', domain).maybeSingle();
      if (data) existingId = data.id;
    }
    if (!existingId && prospect.name) {
      const { data } = await supabaseAdmin.from('accounts').select('id').ilike('name', normalizeOrganizationName(prospect.name) || prospect.name).maybeSingle();
      if (data) existingId = data.id;
    }

    const accountId = existingId || crypto.randomUUID();

    const accountName = normalizeOrganizationName(enrichedOrg?.name || prospect.name || '') || prospect.name;
    const accountIndustry = enrichedOrg?.industry || enrichedOrg?.industry_category || (enrichedOrg?.industries || [])[0] || prospect.industry || null;
    const accountCity = enrichedOrg?.city || enrichedOrg?.organization_city || prospect.city || null;
    const accountState = enrichedOrg?.state || enrichedOrg?.organization_state || prospect.state || null;
    const accountAddress = enrichedOrg?.formatted_address || enrichedOrg?.raw_address || enrichedOrg?.street_address || enrichedOrg?.organization_raw_address || enrichedOrg?.organization_street_address || prospect.address || null;
    const accountZip = enrichedOrg?.postal_code || enrichedOrg?.organization_postal_code || prospect.zip || null;
    const accountWebsite = enrichedOrg?.website_url || prospect.website || (domain ? `https://${domain}` : null);
    const accountPhone = enrichedOrg?.phone || enrichedOrg?.sanitized_phone || enrichedOrg?.primary_phone?.number || prospect.phone || null;
    const accountLinkedIn = enrichedOrg?.linkedin_url || prospect.linkedin_url || null;
    const accountLogo = enrichedOrg?.logo_url || prospect.logo_url || null;
    const accountDescription = enrichedOrg?.short_description || enrichedOrg?.seo_description || prospect.description || null;
    const accountEmployees = enrichedOrg?.estimated_num_employees || enrichedOrg?.employee_count || prospect.employee_count || null;
    const accountRevenue = enrichedOrg?.annual_revenue_printed || enrichedOrg?.organization_revenue_printed || prospect.annual_revenue_printed || null;
    const serviceAddresses = buildProspectServiceAddresses({
      address: accountAddress,
      city: accountCity,
      state: accountState,
      country: enrichedOrg?.country || null,
    });

    // Build meters entry with full address (mirrors OrgIntelligence enrichment flow)
    const fullAddress = formatProspectLocationLabel({
      address: accountAddress,
      city: accountCity,
      state: accountState,
      zip: accountZip,
    });
    const meters = fullAddress && fullAddress !== 'Unknown Location' ? [{
      id: crypto.randomUUID(),
      esiId: '',
      address: fullAddress,
      rate: '',
      endDate: '',
    }] : [];

    const payload = {
      name: accountName,
      domain: domain,
      website: accountWebsite,
      industry: accountIndustry,
      description: accountDescription,
      employees: accountEmployees,
      revenue: accountRevenue,
      city: accountCity,
      state: accountState,
      country: enrichedOrg?.country || null,
      address: accountAddress || null,
      zip: accountZip,
      logo_url: accountLogo,
      phone: accountPhone,
      linkedin_url: accountLinkedIn,
      ownerId: userId || null,
      status: 'active',
      service_addresses: serviceAddresses,
      metadata: { meters, source: 'prospect_radar', apollo_org_id: prospect.apollo_org_id || null },
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
