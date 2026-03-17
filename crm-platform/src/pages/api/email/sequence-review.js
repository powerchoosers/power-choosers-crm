import { cors } from '../_cors.js';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import logger from '../_logger.js';
import { generateForensicSignature } from '@/lib/signature';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildSourceTruthLine(linkedInUrl, website) {
  if (linkedInUrl) return 'SOURCE_TRUTH: LinkedIn available. You may reference LinkedIn once if natural.';
  if (website) return 'SOURCE_TRUTH: LinkedIn not available. Do NOT mention LinkedIn. You may reference company website/public company info.';
  return 'SOURCE_TRUTH: LinkedIn and website not available. Do NOT mention LinkedIn or website; use generic public company research wording.';
}

function senderDomainFromEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return 'nodalpoint.io';
  const domain = raw.split('@')[1] || 'nodalpoint.io';
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'nodalpoint.io';
}

function appendPreviewUnsubscribeFooter(html, email) {
  const content = String(html || '');
  const recipient = String(email || '').trim();
  if (!content || !recipient) return content;
  if (content.includes('data-nodal-unsubscribe-footer="1"') || content.includes('Unsubscribe or manage preferences')) {
    return content;
  }
  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app').replace(/\/+$/, '');
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipient)}`;
  const footer =
    `<div data-nodal-unsubscribe-footer="1" style="margin-top:32px;padding-top:16px;border-top:1px solid #3f3f46;font-family:sans-serif;font-size:11px;color:#71717a;text-align:center;line-height:1.6;">` +
    `<p style="margin:0 0 4px 0;">Nodal Point &middot; Energy Intelligence &middot; Fort Worth, TX</p>` +
    `<p style="margin:0;">You received this because we identified a potential opportunity for your energy portfolio. ` +
    `<a href="${unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe or manage preferences</a></p>` +
    `</div>`;
  return `${content}${footer}`;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { executionId, emailId, action } = req.body || {};
  const normalizedAction = String(action || '').toLowerCase().trim();

  if (!executionId || !['generate', 'regenerate', 'accept'].includes(normalizedAction)) {
    res.status(400).json({ error: 'executionId and valid action are required' });
    return;
  }

  try {
    const { data: execution, error: executionError } = await supabase
      .from('sequence_executions')
      .select('id, sequence_id, member_id, step_type, status, metadata, scheduled_at')
      .eq('id', executionId)
      .single();

    if (executionError || !execution) {
      res.status(404).json({ error: 'Sequence execution not found' });
      return;
    }

    const executionMeta = asObject(execution.metadata);
    const effectiveType = execution.step_type === 'protocolNode'
      ? String(executionMeta.type || '').toLowerCase()
      : String(execution.step_type || '').toLowerCase();

    if (effectiveType !== 'email') {
      res.status(400).json({ error: 'Only email executions support review actions' });
      return;
    }

    if (normalizedAction === 'accept') {
      const acceptedPatch = {
        reviewAccepted: true,
        reviewAcceptedAt: new Date().toISOString(),
      };

      const nextExecutionMeta = { ...executionMeta, ...acceptedPatch };
      const { error: updateExecutionError } = await supabase
        .from('sequence_executions')
        .update({ metadata: nextExecutionMeta, updated_at: new Date().toISOString() })
        .eq('id', execution.id);

      if (updateExecutionError) throw updateExecutionError;

      const targetEmailId = emailId || `seq_exec_${execution.id}`;
      const { data: existingScheduledEmail } = await supabase
        .from('emails')
        .select('id, metadata')
        .eq('id', targetEmailId)
        .maybeSingle();

      const mergedEmailMeta = {
        ...asObject(existingScheduledEmail?.metadata),
        reviewAccepted: true,
        reviewAcceptedAt: acceptedPatch.reviewAcceptedAt,
      };

      const { error: emailAcceptError } = await supabase
        .from('emails')
        .update({
          metadata: mergedEmailMeta,
          updatedAt: new Date().toISOString()
        })
        .eq('id', targetEmailId);
      if (emailAcceptError) {
        logger.warn('[Sequence Review] Accept metadata patch warning:', emailAcceptError.message);
      }

      res.status(200).json({ success: true, action: normalizedAction });
      return;
    }

    const { data: memberData, error: memberError } = await supabase
      .from('sequence_members')
      .select('id, "targetId", "sequenceId"')
      .eq('id', execution.member_id)
      .single();

    if (memberError || !memberData?.targetId) {
      res.status(404).json({ error: 'Member/contact context not found' });
      return;
    }

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, email, "firstName", "lastName", title, city, state, "linkedinUrl", "accountId"')
      .eq('id', memberData.targetId)
      .maybeSingle();

    if (contactError || !contact) {
      res.status(404).json({ error: 'Contact context not found' });
      return;
    }
    let account = null;
    if (contact.accountId) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('name, domain, website, linkedin_url, industry, description, employees, revenue, annual_usage, load_factor, city, state, electricity_supplier, current_rate, contract_end_date')
        .eq('id', contact.accountId)
        .maybeSingle();
      account = acc || null;
    }

    const { data: sequence } = await supabase
      .from('sequences')
      .select('id, bgvector, metadata, "ownerId"')
      .eq('id', execution.sequence_id)
      .maybeSingle();

    const sequenceSender = sequence?.bgvector?.settings?.senderEmail || sequence?.metadata?.sender_email || null;
    let senderFirstName = null;
    if (sequence?.ownerId) {
      const { data: ownerUser } = await supabase
        .from('users')
        .select('first_name')
        .or(`id.eq.${sequence.ownerId},email.eq.${sequence.ownerId}`)
        .maybeSingle();
      senderFirstName = ownerUser?.first_name || null;
    }

    const linkedInUrl = contact.linkedinUrl || account?.linkedin_url || null;
    const accountDomain = account?.domain || null;
    const website = account?.website || (accountDomain ? `https://${accountDomain}` : null);
    // Prefer account city over contact city (mirrors edge function logic)
    const accountCity = account?.city ? account.city.trim() : null;
    const accountState = account?.state ? account.state.trim() : null;
    const contactCity = contact.city ? contact.city.trim() : null;
    const contactState = contact.state ? contact.state.trim() : null;
    const location = accountCity
      ? `${accountCity}${accountState ? `, ${accountState}` : ''}`
      : contactCity
      ? `${contactCity}${contactState ? `, ${contactState}` : ''}`
      : null;
    const sourceTruthLine = buildSourceTruthLine(linkedInUrl, website);
    const researchFacts = [
      account?.description ? `Company summary: ${account.description}` : null,
      account?.industry ? `Industry: ${account.industry}` : null,
      account?.employees ? `Scale: ${account.employees} employees` : null,
      account?.revenue ? `Revenue: ${account.revenue}` : null,
      (accountCity || accountState) ? `HQ: ${[accountCity, accountState].filter(Boolean).join(', ')}` : null,
      account?.website || accountDomain ? `Website: ${account.website || accountDomain}` : null,
      account?.linkedin_url ? 'LinkedIn: available' : null,
      contact.title ? `Contact title: ${contact.title}` : null,
      contact.city || contact.state ? `Contact location: ${[contact.city, contact.state].filter(Boolean).join(', ')}` : null,
      contact.notes ? `Contact notes: ${contact.notes.slice(0, 250)}` : null
    ].filter(Boolean).join('\n');

    // Resolve sender email and domain before the AI call so they can be passed as contact context
    const preferredFrom = String(sequenceSender || '').trim();
    const fromEmail = preferredFrom || String(executionMeta.from || '').trim() || 'l.patterson@nodalpoint.io';
    const senderDomain = senderDomainFromEmail(fromEmail);

    // Calculate contract end year (mirrors edge function logic)
    const contractEndYear = account?.contract_end_date
      ? new Date(account.contract_end_date).getUTCFullYear()
      : null;

    const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
    const host = req.headers.host;
    const optimizeUrl = `${protocol}://${host}/api/ai/optimize`;

    const optimizeRes = await fetch(optimizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${executionMeta?.prompt || 'Draft a personalized follow-up'}\n\n${sourceTruthLine}`,
        provider: 'openrouter',
        type: 'email',
        vectors: Array.isArray(executionMeta?.vectors) ? executionMeta.vectors : [],
        mode: 'generate_email',
        contact: {
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          company: account?.name || null,
          website: account?.website || accountDomain || null,
          linkedin_url: account?.linkedin_url || linkedInUrl || null,
          company_description: account?.description || null,
          employees: account?.employees ?? null,
          revenue: account?.revenue ?? null,
          annual_usage: account?.annual_usage ?? null,
          load_factor: account?.load_factor ?? null,
          research_summary: researchFacts || null,
          title: contact.title || null,
          industry: account?.industry || null,
          electricity_supplier: account?.electricity_supplier || null,
          current_rate: account?.current_rate || null,
          contract_end_date: account?.contract_end_date || null,
          contract_end_year: Number.isFinite(contractEndYear) ? contractEndYear : null,
          city: accountCity || contactCity || null,
          state: accountState || contactState || null,
          location,
          linkedin_url: linkedInUrl,
          domain: accountDomain,
          website,
          has_linkedin: !!linkedInUrl,
          has_website: !!website,
          source_label: linkedInUrl ? 'linkedin' : (website ? 'website' : 'public_company_info'),
          sender_email: fromEmail,
          sender_domain: senderDomain,
          sender_first_name: senderFirstName
        }
      })
    });

    if (!optimizeRes.ok) {
      const optimizeText = await optimizeRes.text();
      throw new Error(`AI generation failed: ${optimizeText}`);
    }

    const optimizeData = await optimizeRes.json();
    const generatedBody = String(
      optimizeData.optimized || optimizeData.optimizedContent || optimizeData.content || ''
    ).trim();
    const generatedSubject = String(
      optimizeData.subject || executionMeta.subject || executionMeta.aiSubject || 'Message from Nodal Point'
    ).trim();

    if (!generatedBody) {
      throw new Error('AI generation returned empty body');
    }

    let finalBody = generatedBody;

    if (!finalBody.includes('NODAL_FORENSIC_SIGNATURE') && !finalBody.includes('nodal-signature')) {
      const lookupEmail = fromEmail.endsWith('@getnodalpoint.com')
        ? fromEmail.replace('@getnodalpoint.com', '@nodalpoint.io')
        : fromEmail;
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name, job_title, hosted_photo_url')
        .eq('email', lookupEmail)
        .maybeSingle();

      const profile = userData
        ? {
          firstName: userData.first_name,
          lastName: userData.last_name,
          jobTitle: userData.job_title,
          hostedPhotoUrl: userData.hosted_photo_url,
          email: fromEmail
        }
        : {
          firstName: 'Lewis',
          lastName: 'Patterson',
          jobTitle: 'Market Architect',
          email: fromEmail
        };
      const signature = generateForensicSignature(profile, { senderEmail: fromEmail, websiteDomain: senderDomain });
      finalBody = `${finalBody}${signature}`;
    }

    finalBody = appendPreviewUnsubscribeFooter(finalBody, contact.email);

    const nowIso = new Date().toISOString();

    const nextExecutionMeta = {
      ...executionMeta,
      body: finalBody,
      subject: generatedSubject,
      from: fromEmail,
      senderEmail: fromEmail,
      senderDomain,
      previewGeneratedAt: nowIso,
      reviewAccepted: false,
      emailRecordId: executionMeta.emailRecordId || `seq_exec_${execution.id}`,
    };

    const { error: saveExecutionError } = await supabase
      .from('sequence_executions')
      .update({
        metadata: nextExecutionMeta,
        status: 'pending_send',
        updated_at: nowIso
      })
      .eq('id', execution.id);

    if (saveExecutionError) throw saveExecutionError;

    const targetEmailId = String(emailId || nextExecutionMeta.emailRecordId || `seq_exec_${execution.id}`);
    const { data: existingEmail } = await supabase
      .from('emails')
      .select('id, metadata, "from"')
      .eq('id', targetEmailId)
      .maybeSingle();

    const nextEmailMeta = {
      ...asObject(existingEmail?.metadata),
      source: 'sequence',
      sequenceExecutionId: execution.id,
      sequenceId: execution.sequence_id,
      memberId: execution.member_id,
      reviewAccepted: false,
      previewGeneratedAt: nowIso,
      emailRecordId: targetEmailId,
      status: 'pending_send'
    };
    // Always use the sequence-configured fromEmail (from bgvector.settings.senderEmail).
    // Do NOT preserve the existing `from` — the DB trigger writes the owner's primary email
    // as a placeholder, which is wrong when a burner account (getnodalpoint.com) is configured.
    const preservedOwner = typeof nextEmailMeta.ownerId === 'string' ? nextEmailMeta.ownerId : null;

    const baseEmailPayload = {
      id: targetEmailId,
      contactId: contact.id || null,
      accountId: contact.accountId || null,
      from: fromEmail,
      to: contact.email ? [contact.email] : [],
      subject: generatedSubject,
      html: finalBody,
      text: finalBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      status: 'pending_send',
      type: 'scheduled',
      is_read: true,
      scheduledSendTime: execution.scheduled_at,
      timestamp: execution.scheduled_at,
      updatedAt: nowIso,
      ownerId: preservedOwner,
      metadata: nextEmailMeta
    };

    const { error: upsertEmailError } = await supabase
      .from('emails')
      .upsert(baseEmailPayload, { onConflict: 'id' });

    if (upsertEmailError) {
      logger.warn('[Sequence Review] email upsert warning:', upsertEmailError.message);
    }

    res.status(200).json({
      success: true,
      action: normalizedAction,
      subject: generatedSubject,
      generated: !!generatedBody
    });
  } catch (error) {
    logger.error('[Sequence Review] Failed:', error);
    res.status(500).json({ error: error?.message || 'Failed to process sequence review action' });
  }
}
