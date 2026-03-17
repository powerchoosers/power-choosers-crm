const QUOTE_PATTERN = /["']/g;

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize Apollo organization names that sometimes arrive with stray wrapping
 * or doubled quote characters.
 */
export function normalizeOrganizationName(value: unknown): string {
  const text = cleanText(value);
  if (!text) return '';

  const hasOddQuotes = /^["']+/.test(text) || /["']+$/.test(text) || /''/.test(text);
  if (!hasOddQuotes) return text;

  return text.replace(QUOTE_PATTERN, '').replace(/\s+/g, ' ').trim();
}

type ProspectLocationInput = {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

/**
 * Prefer the full street address when we have it. Otherwise fall back to a
 * city/state/zip summary. This is what the dashboard should show for asset recon.
 */
export function formatProspectLocationLabel(input: ProspectLocationInput): string {
  const address = cleanText(input.address);
  if (address) return address;

  const parts = [cleanText(input.city), cleanText(input.state), cleanText(input.zip)].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
}

/**
 * Build the service address block used by account ingest. This mirrors the
 * org intelligence enrichment flow and keeps the HQ address in one place.
 */
export function buildProspectServiceAddresses(input: ProspectLocationInput & { country?: unknown }) {
  const address = cleanText(input.address);
  const city = cleanText(input.city);
  const state = cleanText(input.state);
  const country = cleanText(input.country);

  if (!address && !city && !state && !country) return [];

  return [
    {
      address: address || [city, state, country].filter(Boolean).join(', '),
      city: city || '',
      state: state || '',
      country: country || '',
      type: 'headquarters',
      isPrimary: true,
    },
  ];
}

type ApolloEnrichableOrg = {
  id?: string;
  name?: string;
  primary_domain?: string;
  domain?: string;
  website_url?: string;
};

/**
 * Domain-based Apollo enrichment. This is the same source OrgIntelligence uses
 * when it has a real domain to look up.
 */
export async function enrichApolloOrganizationByDomain(
  org: ApolloEnrichableOrg,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  const rawDomain = org.primary_domain || org.domain || '';
  const domain = cleanText(rawDomain).toLowerCase();
  if (!domain) return null;

  try {
    const resp = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    return data?.organization || null;
  } catch {
    return null;
  }
}
