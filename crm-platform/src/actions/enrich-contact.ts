'use server'

import { supabaseAdmin } from '@/lib/supabase';
import { formatPhoneNumber } from '@/lib/formatPhone';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

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
async function ensureAccount(domain: string, apolloOrg: any, companyName: string): Promise<string | null> {
    if (!domain || domain === 'gmail.com' || domain === 'outlook.com' || domain === 'yahoo.com') return null;

    try {
        // 1. Try to find by domain
        const { data: existing } = await supabaseAdmin
            .from('accounts')
            .select('id')
            .eq('domain', domain)
            .maybeSingle();

        if (existing) return existing.id;

        // 2. Create new Account
        console.log(`Creating new account for domain: ${domain}`);

        const newAccount = {
            id: crypto.randomUUID(),
            name: apolloOrg?.name || companyName,
            domain: domain,
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
export async function resolveIdentity(email: string): Promise<IdentityData | null> {
    if (!email) return null;

    try {
        // 1. Check local DB first (Fastest)
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('contacts')
            .select('*, accounts(id, name)')
            .eq('email', email)
            .maybeSingle();

        if (existing) {
            console.log('Identity resolved via Supabase:', email);
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
                accountId: (existing.accounts as any)?.id
            };
        }

        // 2. Not found, enrich via Apollo
        console.log('Identity not found in DB, enriching via Apollo:', email);
        const apolloPerson = await apolloMatchByEmail(email);

        const domain = email.split('@')[1];
        const companyName = apolloPerson?.organization?.name || domain.split('.')[0].toUpperCase();

        // 3. Ensure Account Exists
        const accountId = await ensureAccount(domain, apolloPerson?.organization, companyName);

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
                account_id: accountId, // Link to account if created
                status: 'Active',
                metadata: { source: 'Bill Debugger (Raw)' }
            });

            return identity;
        }

        // 4. Map Apollo data
        const identity: IdentityData = {
            name: apolloPerson.name || `${apolloPerson.first_name} ${apolloPerson.last_name}`.trim(),
            firstName: apolloPerson.first_name,
            lastName: apolloPerson.last_name,
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
            name: identity.name,
            firstName: identity.firstName,
            lastName: identity.lastName,
            title: identity.title,
            email: identity.email,
            phone: identity.phone ? formatPhoneNumber(identity.phone) : null,
            linkedinUrl: identity.linkedinUrl,
            city: apolloPerson.city,
            state: apolloPerson.state,
            status: 'Active',
            account_id: accountId, // LINK THE CONTACT TO THE ACCOUNT
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
