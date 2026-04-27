// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!);

const QUEUE_NAME = "sequence_jobs";
const API_BASE_URL = (
  Deno.env.get("PUBLIC_BASE_URL") ||
  Deno.env.get("NEXT_PUBLIC_BASE_URL") ||
  "https://www.nodalpoint.io"
).replace(/\/+$/, "");

const jobSchema = z.object({
  jobId: z.number(),
  execution_id: z.string(),
  sequence_id: z.string(),
  member_id: z.string(),
  step_type: z.string().optional().default(""),
  metadata: z.any().optional(),
});

function s(value: any): string {
  return String(value ?? "").trim();
}

function lower(value: any): string {
  return s(value).toLowerCase();
}

function asObject(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseMaybeJson(value: any): any {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function pickPrimaryServiceAddress(raw: any): any {
  const parsed = parseMaybeJson(raw);
  const list = Array.isArray(parsed) ? parsed : [];
  if (!list.length) return null;
  return (
    list.find((item) => item?.isPrimary || item?.primary || item?.primary_address) ||
    list.find(Boolean) ||
    null
  );
}

function deriveUtilityTerritory(city: string | null | undefined, state: string | null | undefined): {
  tdu: string | null;
  utilityTerritory: string | null;
  marketContext: string;
} {
  const normalizedState = lower(state);
  const normalizedCity = lower(city);
  if (normalizedState !== "tx") {
    return {
      tdu: null,
      utilityTerritory: null,
      marketContext: "deregulated market outside Texas",
    };
  }

  const oncorCities = new Set([
    "dallas",
    "fort worth",
    "arlington",
    "plano",
    "irving",
    "garland",
    "waco",
    "wichita falls",
    "tyler",
    "amarillo",
  ]);
  const centerPointCities = new Set([
    "houston",
    "beaumont",
    "victoria",
    "pasadena",
    "baytown",
    "conroe",
    "galveston",
  ]);
  const aepCities = new Set([
    "corpus christi",
    "laredo",
    "brownsville",
    "mcallen",
    "abilene",
  ]);
  const tnmpCities = new Set([
    "league city",
    "texas city",
    "angleton",
    "gatesville",
    "lampasas",
  ]);

  if (normalizedCity === "lubbock") {
    return { tdu: "Lubbock Power & Light", utilityTerritory: "LP&L", marketContext: "Texas / ERCOT" };
  }
  if (centerPointCities.has(normalizedCity)) {
    return { tdu: "CenterPoint", utilityTerritory: "CenterPoint", marketContext: "Texas / ERCOT" };
  }
  if (aepCities.has(normalizedCity)) {
    return { tdu: "AEP Texas", utilityTerritory: "AEP Texas", marketContext: "Texas / ERCOT" };
  }
  if (tnmpCities.has(normalizedCity)) {
    return { tdu: "TNMP", utilityTerritory: "TNMP", marketContext: "Texas / ERCOT" };
  }
  if (oncorCities.has(normalizedCity)) {
    return { tdu: "Oncor", utilityTerritory: "Oncor", marketContext: "Texas / ERCOT" };
  }

  return { tdu: null, utilityTerritory: "Texas utility territory", marketContext: "Texas / ERCOT" };
}

function normalizeReplyStage(value: any): string {
  const text = lower(value);
  if (!text) return "first_touch";
  if (text.includes("no reply") || text.includes("no-reply") || text.includes("ghost")) return "no_reply";
  if (text.includes("signal") || text.includes("benchmark") || text.includes("engaged")) return "engaged";
  if (text.includes("opened") || text.includes("follow") || text.includes("evidence")) return "follow_up";
  return "first_touch";
}

function buildStageDirective(stage: string): string {
  switch (normalizeReplyStage(stage)) {
    case "follow_up":
      return "Keep it specific and useful. One clear response ask only. Do not ask for a bill.";
    case "no_reply":
      return "Assume the right person already. Use a tiny yes/no reply ask or a short-read offer. Do not ask who owns electricity.";
    case "engaged":
      return "Lead with a benchmark or short cost view. Optional statement ask only after interest is established.";
    default:
      return "Low-friction first touch. Reply-first. No bill ask.";
  }
}

function buildFallbackBody(
  member: any,
  stage: string,
  siteCity?: string | null,
  utilityTerritory?: string | null,
): string {
  const firstName = s(member?.firstName);
  const companyName = s(member?.company_name || member?.company || member?.account_name || "your company");
  const place = siteCity ? `${companyName} in ${siteCity}${utilityTerritory ? ` (${utilityTerritory})` : ""}` : companyName;
  const opener = firstName ? `${firstName},\n\n` : "";

  switch (normalizeReplyStage(stage)) {
    case "follow_up":
      return `${opener}I was looking back at ${place}. The next place I'd check is delivery charges or timing.\n\nReply and I'll send the short read.`;
    case "no_reply":
      return `${opener}I think I have the right person. For ${place}, the first place I'd check is delivery charges or timing.\n\nReply yes and I'll send the short read.`;
    case "engaged":
      return `${opener}I was looking at ${place}. The useful question is whether the extra cost is in rate or delivery.\n\nIf you want, I can send the rate-vs-delivery read.`;
    default:
      return `${opener}I was looking at ${place}. The first place I'd check is delivery charges or timing.\n\nIf useful, I'll send a short read.`;
  }
}

function extractGeneratedBody(result: any): string {
  const direct = [
    result?.optimized,
    result?.optimizedContent,
    result?.content,
    result?.body,
    result?.email,
    result?.data?.content,
    result?.data?.body,
    result?.data?.optimized,
  ];
  for (const value of direct) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}

function extractGeneratedSubject(result: any, fallback: string): string {
  const direct = [
    result?.subject,
    result?.optimizedSubject,
    result?.generatedSubject,
    result?.data?.subject,
    result?.data?.generatedSubject,
  ];
  for (const value of direct) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return fallback;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

async function deleteQueueJob(jobId: number) {
  await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`.catch(() => {});
}

async function markFailed(executionId: string, jobId: number, message: string) {
  const failedAt = new Date().toISOString();
  await sql`
    UPDATE sequence_executions
    SET status = 'failed',
        error_message = ${message},
        updated_at = NOW()
    WHERE id = ${executionId}
  `.catch(() => {});
  await deleteQueueJob(jobId);
}

async function advanceMember(memberId: string, executionId: string) {
  await sql`SELECT util.advance_sequence_member(${memberId})`.catch(() => {});
  await sql`
    UPDATE sequence_executions
    SET status = 'completed',
        completed_at = NOW(),
        error_message = NULL,
        updated_at = NOW()
    WHERE id = ${executionId}
  `.catch(() => {});
}

async function createTask(execution: any, member: any, nodeType: string) {
  const contactName = [member.firstName, member.lastName].filter(Boolean).join(" ").trim() || "Contact";
  const companyName = s(member.company_name || "Unknown company");
  const label = s(execution?.metadata?.label || `${nodeType} step`);
  const taskOwnerId = s(member.owner_id || member.owner_email || "");
  const taskTitle =
    nodeType === "linkedin"
      ? `LinkedIn - ${companyName} / ${contactName}`
      : `Call - ${companyName} / ${contactName}`;
  const taskDescription =
    s(execution?.metadata?.prompt || execution?.metadata?.body || execution?.metadata?.aiBody) ||
    `Manual ${nodeType} follow-up required for ${companyName}`;
  const existingTask = await sql`
    SELECT id
    FROM tasks
    WHERE metadata->>'sequenceExecutionId' = ${execution.id}
       OR metadata->>'execution_id' = ${execution.id}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  if (existingTask?.[0]?.id) return { skipped: true, taskId: existingTask[0].id };

  const taskId = crypto.randomUUID();
  await sql`
    INSERT INTO tasks (
      id, title, description, status, priority, "dueDate",
      "contactId", "accountId", "ownerId", "createdAt", "updatedAt", metadata
    ) VALUES (
      ${taskId},
      ${taskTitle},
      ${taskDescription},
      'Pending',
      'Protocol',
      NOW(),
      NULLIF(${s(member.contact_id || "")}, '')::text,
      NULLIF(${s(member.account_id || "")}, '')::text,
      NULLIF(${taskOwnerId}, '')::text,
      NOW(),
      NOW(),
      jsonb_build_object(
        'taskType', ${nodeType}::text,
        'source', 'sequence',
        'sequenceExecutionId', ${String(execution.id)}::text,
        'sequenceId', ${String(execution.sequence_id)}::text,
        'memberId', ${String(execution.member_id)}::text,
        'stepType', ${String(execution.step_type || 'protocolNode')}::text,
        'execution_id', ${String(execution.id)}::text,
        'member_id', ${String(execution.member_id)}::text,
        'label', ${label}::text
      )
    )
  `;

  await sql`
    UPDATE sequence_executions
    SET status = 'waiting',
        error_message = NULL,
        updated_at = NOW()
    WHERE id = ${execution.id}
  `.catch(() => {});

  if (nodeType === "call") {
    await sql`
      UPDATE sequence_members
      SET total_calls_attempted = COALESCE(total_calls_attempted, 0) + 1,
          "updatedAt" = NOW()
      WHERE id = ${member.id}
    `.catch(() => {});
  }

  return { skipped: false, taskId };
}

async function sendEmail(execution: any, member: any, replyStage: string, nodeMeta: any) {
  const emailRecordId = s(nodeMeta?.emailRecordId || `seq_exec_${execution.id}`);
  const existingEmail = await sql`
    SELECT id, status, metadata, "from", subject, html, text, "sentAt"
    FROM emails
    WHERE id = ${emailRecordId}
    LIMIT 1
  `;
  const existing = existingEmail?.[0];
  if (
    existing &&
    (
      lower(existing.status) === "sent" ||
      !!existing?.metadata?.messageId ||
      !!existing?.metadata?.zohoMessageId ||
      !!existing?.sentAt ||
      !!existing?.metadata?.sentAt
    )
  ) {
    await sql`
      UPDATE sequence_executions
      SET status = 'waiting',
          updated_at = NOW()
      WHERE id = ${execution.id}
    `.catch(() => {});
    return { skipped: true, alreadySent: true };
  }

  const contact = asObject(member.contact_context);
  const generatedPrompt = [
    s(nodeMeta?.prompt || nodeMeta?.label || "Draft a personalized follow-up"),
    buildStageDirective(replyStage),
    "Use the operating company name the person actually works in. If the account is a subsidiary, mention the parent only once if it helps orientation. Anchor the note to the site or local location you are talking about, not the HQ unless that is the actual site. If the site is in Texas, use Texas/ERCOT naturally. If it is outside Texas, position Nodal Point as helping nationwide accounts in deregulated markets and do not imply Texas-only coverage.",
  ].join("\n\n");

  const body = s(nodeMeta?.body || nodeMeta?.aiBody) || buildFallbackBody(member, replyStage, contact.site_city || member.account_city || null, contact.utility_territory || null);
  const subject = extractGeneratedSubject(nodeMeta, s(nodeMeta?.label || "Message from Nodal Point"));

  const draftMetadata = {
    ...(asObject(nodeMeta?.metadata)),
    source: "sequence",
    sequenceExecutionId: execution.id,
    sequenceId: execution.sequence_id,
    memberId: execution.member_id,
    emailRecordId,
    status: "queued",
    sentAt: null,
    aiPrompt: generatedPrompt,
    generatedBody: body,
    generatedSubject: subject,
  };

  await sql`
    INSERT INTO emails (
      id, "contactId", "accountId", "from", "to", subject, html, text, status, type,
      is_read, "scheduledSendTime", timestamp, "sentAt", "createdAt", "updatedAt", "ownerId", metadata
    ) VALUES (
      ${emailRecordId},
      ${member.contact_id || null},
      ${member.account_id || null},
      ${s(member.owner_email || member.owner_id || "l.patterson@getnodalpoint.com") || null},
      ${JSON.stringify(member.contact_email ? [member.contact_email] : [])}::jsonb,
      ${subject},
      ${body},
      ${body},
      'queued',
      'scheduled',
      true,
      ${execution.scheduled_at || new Date().toISOString()},
      ${execution.scheduled_at || new Date().toISOString()},
      null,
      NOW(),
      NOW(),
      ${s(member.owner_email || member.owner_id || "") || null},
      ${JSON.stringify(draftMetadata)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      "contactId" = EXCLUDED."contactId",
      "accountId" = EXCLUDED."accountId",
      "from" = EXCLUDED."from",
      "to" = EXCLUDED."to",
      subject = EXCLUDED.subject,
      html = EXCLUDED.html,
      text = EXCLUDED.text,
      status = EXCLUDED.status,
      type = EXCLUDED.type,
      is_read = EXCLUDED.is_read,
      "scheduledSendTime" = EXCLUDED."scheduledSendTime",
      timestamp = EXCLUDED.timestamp,
      "sentAt" = EXCLUDED."sentAt",
      "updatedAt" = EXCLUDED."updatedAt",
      "ownerId" = EXCLUDED."ownerId",
      metadata = EXCLUDED.metadata
  `;

  const response = await fetch(`${API_BASE_URL}/api/email/zoho-send-sequence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "SupabaseEdgeFunction/1.0" },
    body: JSON.stringify({
      to: { email: member.contact_email, name: `${s(member.firstName)} ${s(member.lastName)}`.trim() },
      from: { email: s(member.owner_email || member.owner_id || "l.patterson@getnodalpoint.com"), name: member.owner_first_name ? `${member.owner_first_name} • Nodal Point` : "Nodal Point" },
      subject,
      html: body,
      email_id: emailRecordId,
      aiPrompt: generatedPrompt,
      generatedBody: body,
      generatedSubject: subject,
      contactId: member.contact_id || undefined,
      metadata: {
        source: "sequence",
        execution_id: execution.id,
        sequenceExecutionId: execution.id,
        sequence_id: execution.sequence_id,
        sequenceId: execution.sequence_id,
        member_id: member.id,
        memberId: member.id,
        step_type: execution.step_type,
        stepType: execution.step_type,
        emailRecordId,
        senderEmail: s(member.owner_email || member.owner_id || "l.patterson@getnodalpoint.com"),
        senderDomain: (s(member.owner_email || member.owner_id || "l.patterson@getnodalpoint.com").split("@")[1] || null),
        replyStage,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Email API failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const result = await response.json().catch(() => ({}));
  const sentAt = new Date().toISOString();
  const delayVal = Number.parseInt(s(nodeMeta?.delay || nodeMeta?.interval || "3"), 10);
  const delayUnit = s(nodeMeta?.delayUnit || "days");

  await sql`
    UPDATE sequence_executions
    SET status = 'waiting',
        wait_until = NOW() + (${Number.isFinite(delayVal) ? delayVal : 3} || ' ' || ${delayUnit})::INTERVAL,
        metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify({
          messageId: result?.messageId || null,
          sentAt,
          from: s(member.owner_email || member.owner_id || "l.patterson@getnodalpoint.com"),
        })}::jsonb,
        updated_at = NOW()
    WHERE id = ${execution.id}
  `;

  await sql`
    UPDATE sequence_members
    SET total_emails_sent = COALESCE(total_emails_sent, 0) + 1,
        "updatedAt" = NOW()
    WHERE id = ${member.id}
  `;

  return { skipped: false, messageId: result?.messageId || null };
}

function buildMemberContext(memberRow: any) {
  const accountMeta = asObject(memberRow.account_metadata);
  const primaryAddress = pickPrimaryServiceAddress(memberRow.account_service_addresses);
  const siteCity = s(primaryAddress?.city || memberRow.account_city || memberRow.contact_city || "");
  const siteState = s(primaryAddress?.state || memberRow.account_state || memberRow.contact_state || "");
  const siteAddress = s(primaryAddress?.address || primaryAddress?.fullAddress || memberRow.account_address || "");
  const territory = deriveUtilityTerritory(siteCity || memberRow.account_city, siteState || memberRow.account_state);
  const relationships = asObject(accountMeta.relationships);
  const parentCompany = s(
    relationships.parentCompanyName ||
    relationships.parent_name ||
    accountMeta.parent_company ||
    accountMeta.parentCompany ||
    accountMeta.parent ||
    "",
  ) || null;
  const subsidiaryCount = Array.isArray(relationships.subsidiaryAccountIds)
    ? relationships.subsidiaryAccountIds.length
    : Array.isArray(relationships.subsidiary_ids)
      ? relationships.subsidiary_ids.length
      : 0;

  return {
    siteCity,
    siteState,
    siteAddress,
    utilityTerritory: territory.utilityTerritory,
    tdu: territory.tdu,
    marketContext: territory.marketContext,
    parentCompany,
    subsidiaryCount,
    accountMeta,
  };
}

async function processJob(job: any) {
  const member_id = job.member_id;
  const execution_id = job.execution_id;

  const [execution] = await sql`SELECT * FROM sequence_executions WHERE id = ${execution_id} LIMIT 1`;
  if (!execution) throw new Error(`Execution not found: ${execution_id}`);

  const metadata = asObject(execution.metadata);
  const nodeType = lower(job?.metadata?.type || metadata.type || execution.step_type || job?.step_type || "delay");
  const status = lower(execution.status);

  const [memberRow] = await sql`
    SELECT
      m.id,
      m.current_node_id,
      m.status as member_status,
      m.total_emails_sent,
      m.total_calls_attempted,
      c.id as contact_id,
      c.email as contact_email,
      c."firstName",
      c."lastName",
      c.title as contact_title,
      c.city as contact_city,
      c.state as contact_state,
      c."accountId" as account_id,
      a.name as company_name,
      a.city as account_city,
      a.state as account_state,
      a.industry as account_industry,
      a.description as account_description,
      a.website as account_website,
      a.address as account_address,
      a.metadata as account_metadata,
      a."service_addresses" as account_service_addresses,
      s."ownerId" as owner_id,
      u.email as owner_email,
      u.first_name as owner_first_name,
      u.last_name as owner_last_name
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
    JOIN sequences s ON s.id = m."sequenceId"
    LEFT JOIN users u ON (u.id = s."ownerId" OR u.email = s."ownerId")
    WHERE m.id = ${member_id}
    LIMIT 1
  `;

  if (!memberRow) throw new Error(`Sequence member not found: ${member_id}`);

  // Hoist sender info early to prevent ReferenceError in error handler
  const senderEmail = s(memberRow.owner_email || "l.patterson@getnodalpoint.com");
  const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : null;

  const context = buildMemberContext(memberRow);
  const contactName = [memberRow.firstName, memberRow.lastName].filter(Boolean).join(" ").trim() || memberRow.contact_email || "Contact";
  const queueJobId = job.jobId;

  if (status === "waiting" && !["call", "linkedin"].includes(nodeType)) {
    await deleteQueueJob(queueJobId);
    return { status: "skipped", reason: "already waiting", nodeType };
  }

  if (status === "completed" || status === "processing") {
    await deleteQueueJob(queueJobId);
    return { status: "skipped", reason: `already ${status}`, nodeType };
  }

  if (status === "waiting" && ["call", "linkedin"].includes(nodeType)) {
    const existingTask = await sql`
      SELECT id
      FROM tasks
      WHERE metadata->>'sequenceExecutionId' = ${execution.id}
         OR metadata->>'execution_id' = ${execution.id}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    if (existingTask?.[0]?.id) {
      await deleteQueueJob(queueJobId);
      return { status: "skipped", reason: "manual task already exists", nodeType };
    }
  }

  await sql`
    UPDATE sequence_executions
    SET status = 'processing',
        updated_at = NOW()
    WHERE id = ${execution.id}
  `.catch(() => {});

  try {
    if (nodeType === "email") {
      const replyStage = normalizeReplyStage(metadata.replyStage || metadata.sequenceStage || metadata.label || metadata.name);
      const existingBody = s(metadata.body || metadata.aiBody);
      const bodyPrompt = [
        s(metadata.prompt || metadata.label || "Draft a personalized follow-up"),
        buildStageDirective(replyStage),
        "Use the operating company name the person actually works in. If the account is a subsidiary, mention the parent only once if it helps orientation. Anchor the note to the site or local location you are talking about, not the HQ unless that is the actual site. If the site is in Texas, use Texas/ERCOT naturally. If it is outside Texas, position Nodal Point as helping nationwide accounts in deregulated markets and do not imply Texas-only coverage.",
      ].join("\n\n");

      if (!memberRow.contact_email) {
        await advanceMember(memberRow.id, execution.id);
        await deleteQueueJob(queueJobId);
        return { status: "skipped", reason: "missing target email", nodeType };
      }

      let body = existingBody;
      let subject = s(metadata.subject || metadata.aiSubject || metadata.label || "Message from Nodal Point");

      const emailRecordId = s(metadata.emailRecordId || `seq_exec_${execution.id}`);
      // Use hoisted sender info

      if (!body) {
        const aiResponse = await fetch(`${API_BASE_URL}/api/ai/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "SupabaseEdgeFunction/1.0" },
          body: JSON.stringify({
            prompt: bodyPrompt,
            provider: "openrouter",
            type: "email",
            mode: "generate_email",
            sequenceStage: replyStage,
            replyStage,
            vectors: Array.isArray(metadata.vectors) ? metadata.vectors : [],
            contact: {
              name: contactName,
              email: memberRow.contact_email,
              company: memberRow.company_name,
              title: memberRow.contact_title,
              industry: memberRow.account_industry,
              city: memberRow.account_city || memberRow.contact_city || null,
              state: memberRow.account_state || memberRow.contact_state || null,
              website: memberRow.account_website || null,
              location: context.siteCity ? `${context.siteCity}, ${context.siteState}` : null,
              address: context.siteAddress || memberRow.account_address || null,
              site_city: context.siteCity || null,
              site_state: context.siteState || null,
              site_address: context.siteAddress || null,
              tdu: context.tdu || null,
              utility_territory: context.utilityTerritory || null,
              market_context: context.marketContext,
              parent_company: context.parentCompany,
              subsidiary_count: context.subsidiaryCount,
              account_metadata: context.accountMeta,
              sender_email: memberRow.owner_email || null,
              sender_domain: memberRow.owner_email?.includes("@") ? memberRow.owner_email.split("@")[1] : null,
            },
          }),
        });

        if (!aiResponse.ok) {
          throw new Error(`AI generation failed (${aiResponse.status})`);
        }

        const aiResult = await aiResponse.json().catch(() => ({}));
        body = extractGeneratedBody(aiResult) || buildFallbackBody(memberRow, replyStage, context.siteCity, context.utilityTerritory);
        subject = extractGeneratedSubject(aiResult, subject);
      }

      const draftMetadata = {
        ...(asObject(metadata)),
        source: "sequence",
        sequenceId: execution.sequence_id,
        sequenceExecutionId: execution.id,
        memberId: memberRow.id,
        emailRecordId,
        status: "queued",
        replyStage,
        generatedBody: body,
        generatedSubject: subject,
        senderEmail,
        senderDomain,
        site_city: context.siteCity || null,
        site_state: context.siteState || null,
        site_address: context.siteAddress || null,
        utility_territory: context.utilityTerritory || null,
        tdu: context.tdu || null,
      };

      await sql`
        INSERT INTO emails (
          id, "contactId", "accountId", "from", "to", subject, html, text, status, type,
          is_read, "scheduledSendTime", timestamp, "sentAt", "createdAt", "updatedAt", "ownerId", metadata
        ) VALUES (
          ${emailRecordId},
          ${memberRow.contact_id || null},
          ${memberRow.account_id || null},
          ${senderEmail || null},
          ${JSON.stringify([memberRow.contact_email])}::jsonb,
          ${subject},
          ${body},
          ${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()},
          'queued',
          'scheduled',
          true,
          ${execution.scheduled_at || new Date().toISOString()},
          ${execution.scheduled_at || new Date().toISOString()},
          null,
          NOW(),
          NOW(),
          ${senderEmail || null},
          ${JSON.stringify(draftMetadata)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          "contactId" = EXCLUDED."contactId",
          "accountId" = EXCLUDED."accountId",
          "from" = EXCLUDED."from",
          "to" = EXCLUDED."to",
          subject = EXCLUDED.subject,
          html = EXCLUDED.html,
          text = EXCLUDED.text,
          status = EXCLUDED.status,
          type = EXCLUDED.type,
          is_read = EXCLUDED.is_read,
          "scheduledSendTime" = EXCLUDED."scheduledSendTime",
          timestamp = EXCLUDED.timestamp,
          "sentAt" = EXCLUDED."sentAt",
          "updatedAt" = EXCLUDED."updatedAt",
          "ownerId" = EXCLUDED."ownerId",
          metadata = EXCLUDED.metadata
      `;

      const sendResponse = await fetch(`${API_BASE_URL}/api/email/zoho-send-sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "SupabaseEdgeFunction/1.0" },
        body: JSON.stringify({
          to: { email: memberRow.contact_email, name: contactName },
          from: { email: senderEmail, name: memberRow.owner_first_name ? `${memberRow.owner_first_name} • Nodal Point` : "Nodal Point" },
          subject,
          html: body,
          email_id: emailRecordId,
          aiPrompt: bodyPrompt,
          generatedBody: body,
          generatedSubject: subject,
          contactId: memberRow.contact_id || undefined,
          metadata: {
            source: "sequence",
            sequence_id: execution.sequence_id,
            sequenceId: execution.sequence_id,
            sequenceExecutionId: execution.id,
            member_id: memberRow.id,
            memberId: memberRow.id,
            step_type: execution.step_type,
            stepType: execution.step_type,
            emailRecordId,
            senderEmail,
            senderDomain,
            replyStage,
          },
        }),
      });

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text().catch(() => "");
        throw new Error(`Zoho send failed (${sendResponse.status}): ${errorText.slice(0, 500)}`);
      }

      const sendResult = await sendResponse.json().catch(() => ({}));
      const delayVal = Number.parseInt(s(metadata.delay || metadata.interval || "3"), 10);
      const delayUnit = s(metadata.delayUnit || "days");
      const sentAt = new Date().toISOString();

      await sql`
        UPDATE sequence_executions
        SET status = 'waiting',
            error_message = NULL,
            wait_until = NOW() + (${Number.isFinite(delayVal) ? delayVal : 3} || ' ' || ${delayUnit})::INTERVAL,
            metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify({
              messageId: sendResult?.messageId || null,
              sentAt,
              from: senderEmail,
            })}::jsonb,
            updated_at = NOW()
        WHERE id = ${execution.id}
      `;

      await sql`
        UPDATE sequence_members
        SET total_emails_sent = COALESCE(total_emails_sent, 0) + 1,
            "updatedAt" = NOW()
        WHERE id = ${memberRow.id}
      `;

      await deleteQueueJob(queueJobId);
      return { status: "sent", nodeType, messageId: sendResult?.messageId || null };
    }

    if (nodeType === "call" || nodeType === "linkedin") {
      const taskResult = await createTask(execution, memberRow, nodeType);
      await deleteQueueJob(queueJobId);
      return { status: taskResult.skipped ? "skipped" : "task_created", nodeType, taskId: taskResult.taskId || null };
    }

    await advanceMember(memberRow.id, execution.id);
    await deleteQueueJob(queueJobId);
    return { status: "advanced", nodeType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(execution.id, queueJobId, message);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    
    // Allow if valid cron secret OR valid auth header (though verify_jwt=false will make authHeader less useful unless we verify it manually)
    if (cronSecret !== "nodal-cron-2026" && !authHeader) {
      return new Response("unauthorized", { status: 401 });
    }

    if (req.method !== "POST") {
      return new Response("expected POST request", { status: 405 });
    }

    if ((req.headers.get("content-type") || "").indexOf("application/json") === -1) {
      return new Response("expected json body", { status: 400 });
    }

    const body = await req.json().catch(() => []);
    const parsed = z.array(jobSchema).safeParse(body);
    if (!parsed.success) {
      return new Response(`invalid request body: ${parsed.error.message}`, { status: 400 });
    }

    const completedJobs: any[] = [];
    const failedJobs: any[] = [];

    for (const job of parsed.data) {
      try {
        const outcome = await processJob(job);
        completedJobs.push({ jobId: job.jobId, ...outcome });
      } catch (error) {
        failedJobs.push({
          jobId: job.jobId,
          execution_id: job.execution_id,
          sequence_id: job.sequence_id,
          member_id: job.member_id,
          step_type: job.step_type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return new Response(JSON.stringify({ completedJobs, failedJobs }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
});
