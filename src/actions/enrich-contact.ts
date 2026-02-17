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
 * Resolve Identity: Supabase First -> Apollo Enrichment
 */
export async function resolveIdentity(email: string): Promise<IdentityData | null> {
    if (!email) return null;

    try {
        // 1. Check local DB first (Fastest)
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('contacts')
            .select('*, accounts(name)') // Join with accounts to get company name
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
                phone: existing.phone
            };
        }

        // 2. Not found, enrich via Apollo
        console.log('Identity not found in DB, enriching via Apollo:', email);
        const apolloPerson = await apolloMatchByEmail(email);

        if (!apolloPerson) {
            return {
                name: 'Unknown Entity',
                title: 'Professional',
                company: email.split('@')[1].split('.')[0].toUpperCase(),
                email: email,
                location: 'CST'
            };
        }

        // 3. Map Apollo data
        const identity: IdentityData = {
            name: apolloPerson.name || `${apolloPerson.first_name} ${apolloPerson.last_name}`.trim(),
            firstName: apolloPerson.first_name,
            lastName: apolloPerson.last_name,
            title: apolloPerson.title || 'N/A',
            company: apolloPerson.organization?.name || 'Unknown Corp',
            email: apolloPerson.email || email,
            location: [apolloPerson.city, apolloPerson.state, apolloPerson.country].filter(Boolean).join(', '),
            linkedinUrl: apolloPerson.linkedin_url,
            phone: apolloPerson.phone_numbers?.[0]?.sanitized_number || apolloPerson.phone_numbers?.[0]?.raw_number
        };

        // 4. Save to Supabase for next time
        // Note: we don't have an account ID here necessarily, so we might just save to contacts
        // In a real flow, we might want to also create/find an account.
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
