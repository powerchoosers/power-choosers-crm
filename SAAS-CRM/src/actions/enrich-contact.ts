'use server'

import { supabaseAdmin } from '@/lib/supabase';
import { formatPhoneNumber } from '@/lib/formatPhone';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

type ResolveIdentityOptions = {
    ownerId?: string | null;
};

type UpdateContactManualDataOptions = {
    ownerId?: string | null;
};

function normalizeOwnerId(ownerId?: string | null) {
    const value = String(ownerId || '').trim().toLowerCase();
    return value || null;
}

interface IdentityData {
    name: string;
    firstName?: string;
    lastName?: string;
    title: string;
    company: string;
    email: string;
    location: string;
    linkedinUrl?: string;
    phone?: string;
    accountId?: string;
    logoUrl?: string;
}

/**
 * Apollo People Match Utility
 */
async function apolloMatchByEmail(email: string) {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) throw new Error('APOLLO_API_KEY not configured');

    const response = await fetch(`${APOLLO_BASE_URL}/people/match`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey
        },
        body: JSON.stringify({
            email,
            reveal_personal_emails: true
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Apollo Match Error:', errorText);
        return null;
    }

    const data = await response.json();
    return data.person || null;
}

/**
 * Find or Create Account based on Domain/Apollo Data
 */
async function ensureAccount(
    domain: string,
    apolloOrg: any,
    companyName: string,
    ownerId?: string | null
): Promise<string | null> {
    if (!domain || domain === 'gmail.com' || domain === 'outlook.com' || domain === 'yahoo.com') return null;
    const resolvedOwnerId = normalizeOwnerId(ownerId);

    try {
        // 1. Try to find by domain
        const { data: existing } = await supabaseAdmin
            .from('accounts')
            .select('id, ownerId')
            .eq('domain', domain)
            .maybeSingle();

        if (existing) {
            if (!String(existing.ownerId || '').trim() && resolvedOwnerId) {
                const { error: ownerUpdateError } = await supabaseAdmin
                    .from('accounts')
                    .update({ ownerId: resolvedOwnerId })
                    .eq('id', existing.id);

                if (ownerUpdateError) {
                    console.warn('Failed to backfill account ownerId:', ownerUpdateError);
                }
            }

            return existing.id;
        }

        // 2. Create new Account
        console.log(`Creating new account for domain: ${domain}`);

        const newAccount = {
            id: crypto.randomUUID(),
            name: apolloOrg?.name || companyName,
            domain: domain,
            ownerId: resolvedOwnerId,
            industry: apolloOrg?.industry || 'Unknown',
            description: apolloOrg?.short_description || '',
            logo_url: apolloOrg?.logo_url || '',
            phone: apolloOrg?.phone || '',
            linkedin_url: apolloOrg?.linkedin_url || '',
            employees: apolloOrg?.estimated_num_employees || null,
            city: apolloOrg?.city,
            state: apolloOrg?.state,
            address: apolloOrg?.address,
            status: 'PROSPECT',
            updatedAt: new Date().toISOString(),
            metadata: {
                source: 'Bill Debugger Auto-Creation',
                apollo_raw_data: apolloOrg
            }
        };

        const { data: created, error } = await supabaseAdmin
            .from('accounts')
            .insert(newAccount)
            .select('id')
            .single();

        if (error) {
            console.error('Failed to create account:', error);
            return null;
        }

        return created.id;

    } catch (e) {
        console.error('Account Resolution Error:', e);
        return null;
    }
}

/**
 * Resolve Identity: Supabase First -> Apollo Enrichment
 */
export async function resolveIdentity(email: string, options: ResolveIdentityOptions = {}): Promise<IdentityData | null> {
    if (!email) return null;
    const resolvedOwnerId = normalizeOwnerId(options.ownerId);

    try {
        // 1. Check local DB first (Fastest)
        const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        console.log(`[resolveIdentity] Looking up ${email} | service_key=${hasServiceKey}`);

        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('contacts')
            .select('*, accounts!contacts_accountId_fkey(id, name, logo_url)')
            .eq('email', email)
            .maybeSingle();

        console.log(`[resolveIdentity] Supabase result: data=${existing ? 'FOUND' : 'NULL'}, error=${fetchError?.message || 'none'}`);

        if (fetchError) {
            console.error('[resolveIdentity] Supabase lookup failed:', fetchError.message, fetchError.code, fetchError.details);
        }

        if (existing) {
            if (!String(existing.ownerId || '').trim() && resolvedOwnerId) {
                const { error: ownerUpdateError } = await supabaseAdmin
                    .from('contacts')
                    .update({ ownerId: resolvedOwnerId })
                    .eq('id', existing.id);

                if (ownerUpdateError) {
                    console.warn('Failed to backfill contact ownerId:', ownerUpdateError);
                }
            }

            console.log('[resolveIdentity] Resolved via Supabase:', email, existing.name);
            return {
                name: existing.name || 'Unknown Entity',
                firstName: existing.firstName,
                lastName: existing.lastName,
                title: existing.title || 'N/A',
                company: (existing.accounts as any)?.name || 'Unknown Corp',
                email: existing.email,
                location: [existing.city, existing.state].filter(Boolean).join(', ') || 'Unknown Location',
                linkedinUrl: existing.linkedinUrl,
                phone: existing.phone,
                accountId: (existing.accounts as any)?.id,
                logoUrl: (existing.accounts as any)?.logo_url || undefined
            };
        }

        // 2. Not found, enrich via Apollo
        console.log('Identity not found in DB, enriching via Apollo:', email);
        const apolloPerson = await apolloMatchByEmail(email);

        const domain = email.split('@')[1];
        const companyName = apolloPerson?.organization?.name || domain.split('.')[0].toUpperCase();

        // 3. Ensure Account Exists
        const accountId = await ensureAccount(domain, apolloPerson?.organization, companyName, resolvedOwnerId);

        if (!apolloPerson) {
            // Fallback for non-Apollo matches
            const identity = {
                name: 'Unknown Entity',
                title: 'Professional',
                company: companyName,
                email: email,
                location: 'CST',
                accountId: accountId || undefined
            };

            // Save minimalist contact
            const contactId = crypto.randomUUID();
            await supabaseAdmin.from('contacts').insert({
                id: contactId,
                name: identity.name,
                email: identity.email,
                ownerId: resolvedOwnerId,
                accountId: accountId, // Link to account if created
                status: 'Active',
                metadata: { source: 'Bill Debugger (Raw)' }
            });

            return identity;
        }

        // 4. Map Apollo data
        const apFirstName = apolloPerson.first_name || undefined;
        const apLastName = apolloPerson.last_name || undefined;
        const apName = apolloPerson.name?.trim() ||
            (apFirstName && apLastName ? `${apFirstName} ${apLastName}` : apFirstName || apLastName) ||
            'Unknown Entity';

        const identity: IdentityData = {
            name: apName,
            firstName: apFirstName,
            lastName: apLastName,
            title: apolloPerson.title || 'N/A',
            company: apolloPerson.organization?.name || 'Unknown Corp',
            email: apolloPerson.email || email,
            location: [apolloPerson.city, apolloPerson.state, apolloPerson.country].filter(Boolean).join(', '),
            linkedinUrl: apolloPerson.linkedin_url,
            phone: apolloPerson.phone_numbers?.[0]?.sanitized_number || apolloPerson.phone_numbers?.[0]?.raw_number,
            accountId: accountId || undefined
        };

        // 5. Save to Supabase for next time
        const contactData = {
            id: crypto.randomUUID(),
            name: apName,
            firstName: apFirstName,
            lastName: apLastName,
            title: identity.title,
            email: identity.email,
            ownerId: resolvedOwnerId,
            phone: identity.phone ? formatPhoneNumber(identity.phone) : null,
            linkedinUrl: identity.linkedinUrl,
            city: apolloPerson.city,
            state: apolloPerson.state,
            status: 'Active',
            accountId: accountId, // LINK THE CONTACT TO THE ACCOUNT
            metadata: {
                source: 'Bill Debugger Identity Resolution',
                acquired_at: new Date().toISOString(),
                apollo_raw_data: apolloPerson
            }
        };

        const { error: insertError } = await supabaseAdmin
            .from('contacts')
            .insert(contactData);

        if (insertError) {
            console.error('Failed to save enriched contact:', insertError);
        }

        return identity;

    } catch (error) {
        console.error('Resolve Identity Error:', error);
        return null;
    }
}

/**
 * Patch a contact record with manually entered identity data (Apollo-miss fallback)
 */
export async function updateContactManualData(
    email: string,
    data: { name?: string; title?: string; phone?: string },
    options: UpdateContactManualDataOptions = {}
): Promise<void> {
    if (!email) return;
    const resolvedOwnerId = normalizeOwnerId(options.ownerId);

    const updates: Record<string, string | undefined> = {};
    if (data.name) {
        const parts = data.name.trim().split(' ');
        updates.name = data.name.trim();
        updates.firstName = parts[0];
        updates.lastName = parts.slice(1).join(' ') || undefined;
    }
    if (data.title) updates.title = data.title;
    if (data.phone) updates.phone = data.phone;

    if (Object.keys(updates).length === 0) return;

    if (resolvedOwnerId) {
        const { data: existing } = await supabaseAdmin
            .from('contacts')
            .select('id, ownerId')
            .eq('email', email)
            .maybeSingle();

        if (existing && !String(existing.ownerId || '').trim()) {
            updates.ownerId = resolvedOwnerId;
        }
    }

    const { error } = await supabaseAdmin
        .from('contacts')
        .update(updates)
        .eq('email', email);

    if (error) console.error('updateContactManualData error:', error);
}
