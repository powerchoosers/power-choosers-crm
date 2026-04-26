'use client'
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type ComponentType,
  type SVGProps
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Lock, Unlock, ShieldCheck, Loader2, ChevronLeft, ChevronRight, Globe, MapPin, Linkedin, Phone, ExternalLink, ChevronDown, ChevronUp, Sparkles, Mail } from 'lucide-react';
import Image from 'next/image';
import { CompanyIcon } from '@/components/ui/CompanyIcon';
import { supabase } from '@/lib/supabase';
import { useCallStore } from '@/store/callStore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ContactAvatar } from '@/components/ui/ContactAvatar';
import { resolveContactPhotoUrl } from '@/lib/contactAvatar';
import type { ComposeContext } from '@/components/emails/ComposeModal';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/formatPhone';
import { useQueryClient } from '@tanstack/react-query';
import { useComposeStore } from '@/store/composeStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getFreshSupabaseAccessToken } from '@/lib/auth/supabase-session';
import { formatHeadcountLabel, headcountMetadata, parseHeadcount } from '@/lib/headcount';

interface OrgIntelligenceProps {
  domain?: string;
  companyName?: string;
  website?: string;
  accountId?: string;
  /** CRM account logo URL – always prioritized over Apollo companySummary.logoUrl */
  accountLogoUrl?: string;
  /** CRM account domain – used for favicon fallback when logo is blank; preferred over Apollo domain for icon */
  accountDomain?: string;
}

/** Phone as string (legacy/cache) or { number, type } from Apollo (type: mobile, direct, work, etc.) */
type PhoneEntry = string | { number: string; type?: string };
type RevealedPhone = { number: string; type?: string };

function phoneDisplayNumber(entry: PhoneEntry): string {
  return typeof entry === 'string' ? entry : entry.number;
}

/** Returns human-readable phone type label for display in revealed results */
function phoneTypeLabel(entry: PhoneEntry, index: number): 'MOBILE' | 'WORK DIRECT' | 'OTHER' {
  const type = typeof entry === 'string' ? '' : (entry.type || '').toLowerCase();
  if (type.includes('mobile')) return 'MOBILE';
  if (type.includes('direct') || type.includes('work')) return 'WORK DIRECT';
  if (type.includes('other') || type.includes('home')) return 'OTHER';
  if (typeof entry === 'string') return (['MOBILE', 'WORK DIRECT', 'OTHER'] as const)[index] ?? 'OTHER';
  return 'OTHER';
}

function normalizeRevealedPhones(entries: PhoneEntry[]): RevealedPhone[] {
  const out: RevealedPhone[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const rawNumber = phoneDisplayNumber(entry);
    const formatted = formatPhoneNumber(rawNumber);
    if (!formatted) return;
    const label = phoneTypeLabel(entry, index);
    const type = label === 'MOBILE' ? 'mobile' : label === 'WORK DIRECT' ? 'work_direct' : 'other';
    const key = `${formatted}|${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ number: formatted, type });
  });

  return out;
}

function assignRevealedPhonesToContactFields(phones: RevealedPhone[]) {
  const patch: Record<string, string> = {};
  const extras: RevealedPhone[] = [];
  const slotsUsed = {
    mobile: false,
    work_direct: false,
    other: false
  };

  for (const phone of phones) {
    const t = (phone.type || '').toLowerCase();
    if (t.includes('mobile')) {
      if (!slotsUsed.mobile) {
        patch.mobile = phone.number;
        patch.phone = phone.number;
        slotsUsed.mobile = true;
      } else {
        extras.push(phone);
      }
      continue;
    }

    if (t.includes('direct') || t.includes('work')) {
      if (!slotsUsed.work_direct) {
        patch.workPhone = phone.number;
        slotsUsed.work_direct = true;
      } else {
        extras.push(phone);
      }
      continue;
    }

    if (!slotsUsed.other) {
      patch.otherPhone = phone.number;
      slotsUsed.other = true;
    } else {
      extras.push(phone);
    }
  }

  if (!patch.mobile && phones[0]?.number) {
    patch.mobile = phones[0].number;
  }

  if (!patch.phone) {
    patch.phone = patch.mobile || phones[0]?.number || patch.workPhone || patch.otherPhone || '';
  }

  return { patch, extras };
}

async function getApolloBearerToken(forceRefresh = false): Promise<string> {
  const token = await getFreshSupabaseAccessToken(forceRefresh);
  if (!token) {
    throw new Error('Authentication session expired. Please refresh.');
  }
  return token;
}

const PHONE_REVEAL_WARNING_MS = 60_000;
const PHONE_REVEAL_TIMEOUT_MS = 120_000;
const PHONE_REVEAL_POLL_INTERVAL_MS = 10_000;
const PHONE_REVEAL_MAX_ATTEMPTS = Math.ceil(PHONE_REVEAL_TIMEOUT_MS / PHONE_REVEAL_POLL_INTERVAL_MS);
const PHONE_REVEAL_WARNING_SECONDS = PHONE_REVEAL_WARNING_MS / 1000;
const PHONE_REVEAL_TIMEOUT_SECONDS = PHONE_REVEAL_TIMEOUT_MS / 1000;

type RevealIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface RevealActionButtonProps {
  icon: RevealIcon;
  revealing: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}

function RevealActionButton({
  icon: Icon,
  revealing,
  disabled,
  onClick,
  title,
}: RevealActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'group/field relative overflow-hidden flex items-center gap-2 px-2.5 py-1.5 rounded-xl border',
        'font-mono uppercase transition-all duration-200 w-full justify-center min-w-0',
        revealing
          ? 'border-[#002FA7]/40 text-[#8ba6ff] bg-[#002FA7]/10'
          : 'border-white/5 text-zinc-500 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10',
        disabled && 'opacity-70 pointer-events-none'
      )}
    >
      <div className="relative z-10 flex items-center gap-2 w-full justify-center min-w-0">
        {revealing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[#8ba6ff]" />
            <span className="text-[9px] font-mono tracking-[0.2em] text-[#8ba6ff] whitespace-nowrap">Revealing</span>
          </>
        ) : (
          <>
            <Icon className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
            <div className="relative flex-1 min-w-0 flex items-center justify-center">
              <span className="block w-full text-center text-[10px] tracking-[0.16em] text-zinc-500 whitespace-nowrap overflow-hidden transition-opacity duration-150 group-hover/field:opacity-0">
                •••••••••
              </span>
              <span className="absolute inset-0 flex items-center justify-center text-[#8ba6ff] text-[9px] font-semibold tracking-[0.28em] opacity-0 transition-opacity duration-200 group-hover/field:opacity-100">
                REVEAL
              </span>
            </div>
          </>
        )}
      </div>
      <AnimatePresence initial={false}>
        {revealing && (
          <motion.span
            key="reveal-glow"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.45, scale: 1.05 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#002FA7]/60 via-transparent to-[#002FA7]/40 blur-2xl"
          />
        )}
      </AnimatePresence>
    </button>
  );
}

interface ApolloContactRow {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  title?: string;
  email: string;
  status: 'verified' | 'unverified';
  isMonitored?: boolean;
  location?: string;
  linkedin?: string;
  crmId?: string;
  phones?: PhoneEntry[];
}

interface ApolloCompany {
  name: string;
  domain: string;
  description?: string;
  employees?: string | number;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string; // Full street address from Apollo (raw_address or street_address)
  logoUrl?: string;
  website?: string;
  linkedin?: string;
  companyPhone?: string;
  zip?: string;
  revenue?: string;
}

interface ApolloSearchCache {
  company: ApolloCompany | null;
  contacts: ApolloContactRow[];
  timestamp: number;
  searchTerm?: string;
  currentPage?: number;
}

interface RevealState {
  revealingEmail: boolean;
  revealingPhone: boolean;
  phoneTimedOut: boolean;
  phoneWarned: boolean;
}

type MeterRecord = {
  id: string;
  esiId: string;
  address: string;
  rate: string;
  endDate: string;
  [key: string]: unknown;
};

type ServiceAddressRecord = {
  address: string;
  city: string;
  state: string;
  country: string;
  type: string;
  isPrimary: boolean;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeContactText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return '';
  return trimmed;
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function normalizeAddressKey(value: unknown): string {
  return coerceString(value)
    .toLowerCase()
    .replace(/[,\s]+/g, ' ')
    .trim();
}

function buildApolloFullAddress(company: ApolloCompany): string {
  const explicitAddress = coerceString(company.address);
  if (explicitAddress) return explicitAddress;

  return [company.city, company.state, company.country]
    .map(coerceString)
    .filter(Boolean)
    .join(', ');
}

function normalizeMeters(value: unknown): MeterRecord[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const address = coerceString(entry);
      if (!address) return [];
      return [{
        id: crypto.randomUUID(),
        esiId: '',
        address,
        rate: '',
        endDate: ''
      }];
    }

    if (!isRecord(entry)) return [];

    return [{
      ...entry,
      id: coerceString(entry.id) || crypto.randomUUID(),
      esiId: coerceString(entry.esiId ?? entry.esid),
      address: coerceString(entry.address ?? entry.service_address),
      rate: coerceString(entry.rate),
      endDate: coerceString(entry.endDate ?? entry.end_date)
    }];
  });
}

function mergeApolloAddressIntoMeters(existingMeters: MeterRecord[], fullAddress: string): MeterRecord[] {
  const addressKey = normalizeAddressKey(fullAddress);
  if (!addressKey) return existingMeters;

  const alreadyPresent = existingMeters.some((meter) => normalizeAddressKey(meter.address) === addressKey);
  if (alreadyPresent) return existingMeters;

  const blankAddressIndex = existingMeters.findIndex((meter) => !normalizeAddressKey(meter.address));
  if (blankAddressIndex >= 0) {
    return existingMeters.map((meter, index) =>
      index === blankAddressIndex
        ? { ...meter, address: fullAddress }
        : meter
    );
  }

  return [
    ...existingMeters,
    {
      id: crypto.randomUUID(),
      esiId: '',
      address: fullAddress,
      rate: '',
      endDate: ''
    }
  ];
}

function normalizeServiceAddresses(value: unknown): ServiceAddressRecord[] {
  if (!Array.isArray(value)) return [];

  const normalized = value.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const address = coerceString(entry);
      if (!address) return [];
      return [{
        address,
        city: '',
        state: '',
        country: '',
        type: index === 0 ? 'headquarters' : 'service',
        isPrimary: index === 0
      }];
    }

    if (!isRecord(entry)) return [];

    const address = coerceString(entry.address);
    const city = coerceString(entry.city);
    const state = coerceString(entry.state);
    const country = coerceString(entry.country);
    const fallbackAddress = address || [city, state, country].filter(Boolean).join(', ');

    if (!fallbackAddress && !city && !state && !country) return [];

    return [{
      ...entry,
      address: fallbackAddress,
      city,
      state,
      country,
      type: coerceString(entry.type) || (index === 0 ? 'headquarters' : 'service'),
      isPrimary: typeof entry.isPrimary === 'boolean' ? entry.isPrimary : index === 0
    }];
  });

  if (normalized.length > 0 && !normalized.some((entry) => entry.isPrimary)) {
    normalized[0] = { ...normalized[0], isPrimary: true };
  }

  return normalized;
}

function mergeApolloAddressIntoServiceAddresses(
  existingServiceAddresses: ServiceAddressRecord[],
  fullAddress: string,
  company: ApolloCompany
): ServiceAddressRecord[] {
  const addressKey = normalizeAddressKey(fullAddress);
  if (!addressKey) return existingServiceAddresses;

  const apolloEntry: ServiceAddressRecord = {
    address: fullAddress,
    city: coerceString(company.city),
    state: coerceString(company.state),
    country: coerceString(company.country),
    type: existingServiceAddresses.length === 0 ? 'headquarters' : 'service',
    isPrimary: existingServiceAddresses.length === 0
  };

  const existingIndex = existingServiceAddresses.findIndex(
    (entry) => normalizeAddressKey(entry.address) === addressKey
  );

  if (existingIndex >= 0) {
    return existingServiceAddresses.map((entry, index) =>
      index === existingIndex
        ? {
          ...entry,
          address: entry.address || apolloEntry.address,
          city: entry.city || apolloEntry.city,
          state: entry.state || apolloEntry.state,
          country: entry.country || apolloEntry.country,
          type: entry.type || apolloEntry.type,
          isPrimary: entry.isPrimary || apolloEntry.isPrimary
        }
        : entry
    );
  }

  return [...existingServiceAddresses, apolloEntry];
}

function buildIdentityName(input: { name?: unknown; firstName?: unknown; lastName?: unknown }) {
  let name = sanitizeContactText(input.name);
  let firstName = sanitizeContactText(input.firstName);
  let lastName = sanitizeContactText(input.lastName);

  if ((!firstName || !lastName) && name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (!firstName && parts.length > 0) firstName = parts[0];
    if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ');
  }

  if (!name) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim();
  }

  return {
    name,
    firstName,
    lastName
  };
}

function buildNameKey(firstName?: unknown, lastName?: unknown): string {
  const first = sanitizeContactText(firstName).toLowerCase();
  const last = sanitizeContactText(lastName).toLowerCase();
  if (!first || !last) return '';
  return `${first}::${last}`;
}

function normalizeLinkedinUrl(value: unknown): string {
  const text = sanitizeContactText(value);
  if (!text) return '';

  try {
    const parsed = new URL(text.includes('://') ? text : `https://${text.replace(/^\/+/, '')}`);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${hostname}${pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
  }
}

function contactCacheKey(contact: ApolloContactRow): string {
  return (
    sanitizeContactText(contact.email || '').toLowerCase() ||
    normalizeLinkedinUrl(contact.linkedin || '') ||
    sanitizeContactText(contact.crmId || '') ||
    sanitizeContactText(contact.id || '') ||
    buildNameKey(contact.firstName, contact.lastName) ||
    sanitizeContactText(contact.name || '').toLowerCase()
  );
}

function mergeApolloContactRows(primary: ApolloContactRow[], secondary: ApolloContactRow[]): ApolloContactRow[] {
  const byKey = new Map<string, ApolloContactRow>();
  const extras: ApolloContactRow[] = [];

  const insert = (contact: ApolloContactRow) => {
    const key = contactCacheKey(contact);
    if (!key) {
      extras.push(contact);
      return;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, contact);
      return;
    }

    byKey.set(key, mergeApolloContact(existing, contact));
  };

  primary.forEach(insert);
  secondary.forEach(insert);

  return [...extras, ...byKey.values()];
}

function mergeApolloContact(existing: ApolloContactRow, fresh: ApolloContactRow): ApolloContactRow {
  const mergedPhones: PhoneEntry[] = [];
  const seen = new Set<string>();

  const addPhone = (value: unknown, fallback?: PhoneEntry) => {
    const number = typeof value === 'string'
      ? value
      : isRecord(value) && typeof value.number === 'string'
        ? value.number
        : typeof fallback === 'string'
          ? fallback
          : '';
    const normalized = sanitizeContactText(number);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (isRecord(value) && typeof value.number === 'string') {
      mergedPhones.push({
        number: value.number,
        type: typeof value.type === 'string' ? value.type : undefined,
      });
      return;
    }
    mergedPhones.push(normalized);
  };

  (Array.isArray(existing.phones) ? existing.phones : []).forEach((entry) => addPhone(entry));
  (Array.isArray(fresh.phones) ? fresh.phones : []).forEach((entry) => addPhone(entry));

  return {
    ...existing,
    ...fresh,
    id: sanitizeContactText(fresh.id || existing.id || ''),
    crmId: sanitizeContactText(fresh.crmId || existing.crmId || '') || undefined,
    name: sanitizeContactText(fresh.name || existing.name || '') || 'Contact',
    firstName: sanitizeContactText(fresh.firstName || existing.firstName || '') || undefined,
    lastName: sanitizeContactText(fresh.lastName || existing.lastName || '') || undefined,
    title: sanitizeContactText(fresh.title || existing.title || '') || undefined,
    email: sanitizeContactText(fresh.email || '') || sanitizeContactText(existing.email || '') || 'N/A',
    photoUrl: sanitizeContactText(fresh.photoUrl || existing.photoUrl || '') || undefined,
    location: sanitizeContactText(fresh.location || existing.location || '') || undefined,
    linkedin: sanitizeContactText(fresh.linkedin || existing.linkedin || '') || undefined,
    status: fresh.status === 'verified' || existing.status === 'verified'
      ? 'verified'
      : fresh.status || existing.status,
    isMonitored: Boolean(fresh.isMonitored || existing.isMonitored || fresh.crmId || existing.crmId),
    phones: mergedPhones,
  };
}

function hydrateApolloContactsWithCache(current: ApolloContactRow[], cached: ApolloContactRow[]): ApolloContactRow[] {
  if (current.length === 0 || cached.length === 0) return current;

  const cachedByKey = new Map<string, ApolloContactRow>();
  cached.forEach((contact) => {
    const key = contactCacheKey(contact);
    if (key && !cachedByKey.has(key)) {
      cachedByKey.set(key, contact);
    }
  });

  return current.map((contact) => {
    const cachedMatch = cachedByKey.get(contactCacheKey(contact));
    return cachedMatch ? mergeApolloContact(cachedMatch, contact) : contact;
  });
}

export default function OrgIntelligence({ domain: initialDomain, companyName, website, accountId, accountLogoUrl, accountDomain }: OrgIntelligenceProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ApolloContactRow[]>([]);
  const [companySummary, setCompanySummary] = useState<ApolloCompany | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [revealStates, setRevealStates] = useState<Record<string, RevealState>>({});
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const phoneRevealTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const phoneRevealWarningTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cacheLoadVersionRef = useRef(0);
  const { initiateCall } = useCallStore();
  const openCompose = useComposeStore((s) => s.openCompose);
  const queryClient = useQueryClient();
  const setLastEnrichedAccountId = useUIStore((s) => s.setLastEnrichedAccountId);
  const setLastEnrichedContactId = useUIStore((s) => s.setLastEnrichedContactId);
  const CONTACTS_PER_PAGE = 5;

  const patchRevealState = (personId: string, patch: Partial<RevealState>) => {
    setRevealStates((prev) => {
    const current = prev[personId] || {
      revealingEmail: false,
      revealingPhone: false,
      phoneTimedOut: false,
      phoneWarned: false
    };
      return {
        ...prev,
        [personId]: { ...current, ...patch }
      };
    });
  };

  const clearPhoneRevealTimeout = (personId: string) => {
    const timer = phoneRevealTimeouts.current[personId];
    if (timer) {
      clearTimeout(timer);
      delete phoneRevealTimeouts.current[personId];
    }
  };

  const clearPhoneRevealWarningTimeout = (personId: string) => {
    const timer = phoneRevealWarningTimeouts.current[personId];
    if (timer) {
      clearTimeout(timer);
      delete phoneRevealWarningTimeouts.current[personId];
    }
  };

  const clearAllPhoneRevealTimers = (personId: string) => {
    clearPhoneRevealTimeout(personId);
    clearPhoneRevealWarningTimeout(personId);
  };

  const handleCompanyCall = (phone: string, name: string) => {
    const logoUrl = (accountLogoUrl && accountLogoUrl.trim()) || companySummary?.logoUrl;
    const domainForCall = (accountDomain && accountDomain.trim()) || companySummary?.domain || domain;
    initiateCall(phone, {
      name,
      account: name,
      logoUrl: logoUrl || undefined,
      domain: domainForCall || undefined,
      isAccountOnly: true,
    });
    toast.info(`Initiating call to ${name}...`);
  };

  const domain = useMemo(() => {
    if (initialDomain) return initialDomain;
    if (!website) {
      // Only create fallback domain if companyName exists
      if (!companyName) return undefined;
      return companyName.toLowerCase().replace(/\s+/g, '') + '.com';
    }
    try {
      let s = website.trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      const u = new URL(s);
      return (u.hostname || '').replace(/^www\./i, '');
    } catch (_) {
      return website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }, [initialDomain, website, companyName]);

  /** Normalize cache key to hostname only; full URLs can cause Supabase 406. */
  const cacheKeyFromDomainOrName = (d: string | undefined, name: string | undefined) => {
    const raw = d || name;
    if (!raw) return undefined;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return (u.hostname || '').replace(/^www\./i, '') || raw;
      }
      return raw;
    } catch {
      return raw;
    }
  };

  // Load cache on mount or when domain/company changes
  useEffect(() => {
    const loadVersion = ++cacheLoadVersionRef.current;
    let cancelled = false;

    const applyCachedData = (cacheData: ApolloSearchCache) => {
      if (cancelled || cacheLoadVersionRef.current !== loadVersion) return;

      const cachedContacts = Array.isArray(cacheData.contacts) ? cacheData.contacts : [];
      setData(cachedContacts);
      setCompanySummary(cacheData.company || null);
      setScanStatus('complete');
      if (typeof cacheData.searchTerm === 'string') {
        setSearchTerm(cacheData.searchTerm);
      }
      if (typeof cacheData.currentPage === 'number' && cacheData.currentPage > 0) {
        setCurrentPage(cacheData.currentPage);
      }
      setContactsLoading(false);
    };

    async function loadCache() {
      if (typeof window === 'undefined') return;

      setContactsLoading(false);

      const keysToCheck: string[] = [];
      if (accountId) keysToCheck.push(`ACCOUNT_${accountId}`);
      const domainKey = cacheKeyFromDomainOrName(domain, companyName);
      if (domainKey) keysToCheck.push(domainKey);
      if (companyName && !keysToCheck.includes(companyName)) keysToCheck.push(companyName);

      if (keysToCheck.length === 0) return;

      const readLocalCache = (cacheKey: string): ApolloSearchCache | null => {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;

        try {
          const parsed = JSON.parse(cached) as Partial<ApolloSearchCache>;
          if (parsed && Array.isArray(parsed.contacts)) {
            const timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
            if (Date.now() - timestamp < 1000 * 60 * 60 * 24) {
              return {
                company: (parsed.company as ApolloCompany | null) || null,
                contacts: parsed.contacts as ApolloContactRow[],
                timestamp,
                searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : undefined,
                currentPage: typeof parsed.currentPage === 'number' ? parsed.currentPage : undefined
              };
            }
          }
        } catch (err) {
          console.error('Failed to parse Apollo cache:', err);
        }

        return null;
      };

      const keyPriority = (key: string) => {
        if (accountId && key === `ACCOUNT_${accountId}`) return 3;
        if (domainKey && key.toLowerCase() === domainKey.toLowerCase()) return 2;
        if (companyName && key.toLowerCase() === companyName.toLowerCase()) return 1;
        return 0;
      };

      const localCandidates = keysToCheck
        .map((key) => {
          const cached = readLocalCache(`apollo_cache_${key}`);
          if (!cached) return null;
          return {
            key,
            source: 'local' as const,
            cache: cached,
            timestamp: cached.timestamp || 0,
            priority: keyPriority(key),
          };
        })
        .filter((candidate): candidate is {
          key: string;
          source: 'local';
          cache: ApolloSearchCache;
          timestamp: number;
          priority: number;
        } => Boolean(candidate));

      let supabaseCandidates: Array<{
        key: string;
        source: 'supabase';
        cache: ApolloSearchCache;
        timestamp: number;
        priority: number;
      }> = [];

      try {
        const { data: supabaseItems, error } = await supabase
          .from('apollo_searches')
          .select('key, data, created_at')
          .in('key', keysToCheck);

        if (supabaseItems && supabaseItems.length > 0) {
          supabaseCandidates = supabaseItems
            .filter((item) => item && item.data)
            .map((item) => {
              const cacheData = item.data as ApolloSearchCache;
              const timestamp = typeof cacheData.timestamp === 'number'
                ? cacheData.timestamp
                : new Date(item.created_at).getTime() || 0;
              return {
                key: item.key,
                source: 'supabase' as const,
                cache: cacheData,
                timestamp,
                priority: keyPriority(item.key),
              };
            });
        }
      } catch (err) {
        console.warn('Supabase cache fetch failed:', err);
      }

      const bestCandidate = [...supabaseCandidates, ...localCandidates].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
        return a.key.localeCompare(b.key);
      })[0];

      if (bestCandidate?.cache) {
        applyCachedData(bestCandidate.cache);

        // Keep all related keys in sync so account/contact flips stay on the same cached node.
        const serializedCache = JSON.stringify(bestCandidate.cache);
        keysToCheck.forEach((key) => {
          localStorage.setItem(`apollo_cache_${key}`, serializedCache);
        });
        return;
      }

      if (cancelled || cacheLoadVersionRef.current !== loadVersion) return;

      // If no cache, stay in idle mode so the user can trigger the scan manually
      setData([]);
      setCompanySummary(null);
      setScanStatus('idle');
      setSearchTerm('');
      setCurrentPage(1);
      setContactsLoading(false);
    }

    loadCache();

    return () => {
      cancelled = true;
      cacheLoadVersionRef.current += 1;
    };
  }, [domain, companyName, accountId]);

  useEffect(() => {
    return () => {
      Object.keys(phoneRevealTimeouts.current).forEach((personId) => {
        clearAllPhoneRevealTimers(personId);
      });
      Object.keys(phoneRevealWarningTimeouts.current).forEach((personId) => {
        clearAllPhoneRevealTimers(personId);
      });
    };
  }, []);

  const handleEnrichAccount = async () => {
    if (!accountId || !companySummary) {
      toast.error('No account context or summary available for enrichment');
      return;
    }

    setScanStatus('scanning'); // This will trigger the blur overlay
    try {
      const parsedHeadcount = parseHeadcount(companySummary.employees);
      const employeesValue = parsedHeadcount.value;

      // Pull existing account shape so Apollo enrichment can merge instead of replace.
      const { data: existingAccount, error: existingAccountError } = await supabase
        .from('accounts')
        .select('service_addresses, metadata')
        .eq('id', accountId)
        .single();

      if (existingAccountError) {
        console.error('Failed to load existing account before Apollo enrichment:', existingAccountError);
        throw existingAccountError;
      }

      const currentMetadata = isRecord(existingAccount?.metadata) ? existingAccount.metadata : {};
      const fullAddress = buildApolloFullAddress(companySummary);
      const serviceAddresses = mergeApolloAddressIntoServiceAddresses(
        normalizeServiceAddresses(existingAccount?.service_addresses),
        fullAddress,
        companySummary
      );
      const meters = mergeApolloAddressIntoMeters(
        normalizeMeters(currentMetadata.meters),
        fullAddress
      );

      // Use the existing companySummary from Apollo to update the CRM account
      const { data, error } = await supabase
        .from('accounts')
        .update({
          industry: companySummary.industry || null,
          employees: employeesValue,
          description: companySummary.description || null,
          city: companySummary.city || null,
          state: companySummary.state || null,
          country: companySummary.country || null,
          address: fullAddress || null, // Populate uplink address
          service_addresses: serviceAddresses, // Update service_addresses with HQ location
          logo_url: companySummary.logoUrl || null, // Replace with Apollo logo when enriching
          linkedin_url: companySummary.linkedin || null,
          phone: formatPhoneNumber(companySummary.companyPhone) || null,
          revenue: companySummary.revenue || null,
          zip: companySummary.zip || null,
          metadata: {
            ...currentMetadata,
            meters: meters, // Save meter with service address
            apollo_enriched_at: new Date().toISOString(),
            ...headcountMetadata(parsedHeadcount, 'apollo_enrichment'),
            apollo_raw_data: companySummary
          }
        })
        .eq('id', accountId)
        .select();

      if (error) {
        console.error('Supabase enrichment error:', error);
        throw error;
      }

      console.log('Enrichment successful:', data);
      toast.success('DEEP_ENRICHMENT complete. Node profile updated.');

      // Invalidate and refetch so dossier, people, accounts, targets see changes immediately
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === accountId });
      await queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === accountId });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['targets'] });

      // Trigger blur-in on account dossier for enriched fields
      setLastEnrichedAccountId(accountId ?? null);
      setTimeout(() => setLastEnrichedAccountId(null), 3500);
    } catch (err) {
      console.error('Enrichment Error:', err);
      toast.error(`Enrichment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setScanStatus('complete');
    }
  };

  async function saveToSupabase(key: string, data: ApolloSearchCache) {
    try {
      await supabase
        .from('apollo_searches')
        .upsert({
          key,
          data,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch (err) {
      console.warn('Failed to persist to Supabase:', err);
    }
  }

  const saveToCache = (
    company: ApolloCompany | null,
    contacts: ApolloContactRow[],
    options?: { searchTerm?: string; currentPage?: number }
  ) => {
    if (typeof window === 'undefined') return;

    const key = cacheKeyFromDomainOrName(domain, companyName);

    const cacheData: ApolloSearchCache = {
      company,
      contacts,
      timestamp: Date.now(),
      searchTerm: options?.searchTerm ?? searchTerm,
      currentPage: options?.currentPage ?? currentPage
    };

    // Save by Account ID if available for maximum stability
    if (accountId) {
      saveToSupabase(`ACCOUNT_${accountId}`, cacheData);
    }

    // Save by Domain/Name for global caching
    if (key) {
      const cacheKey = `apollo_cache_${key}`;
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      saveToSupabase(key, cacheData);
    }
  };

  const syncContactCachesImmediately = (
    crmId: string,
    phonePatch: Record<string, unknown>,
    metadataPatch?: Record<string, unknown>
  ) => {
    const mergedPatch = {
      ...phonePatch,
      ...(phonePatch.workPhone !== undefined ? { workDirectPhone: phonePatch.workPhone } : {}),
      ...(metadataPatch ? { metadata: metadataPatch } : {})
    } as Record<string, unknown>;

    queryClient.setQueriesData(
      { predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === crmId },
      (old: any) => {
        if (!old) return old;
        return {
          ...old,
          ...mergedPatch
        };
      }
    );

    if (accountId) {
      queryClient.setQueriesData(
        { predicate: (q) => q.queryKey[0] === 'account-contacts' && q.queryKey[1] === accountId },
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((c: any) => (c?.id === crmId ? { ...c, ...mergedPatch } : c));
        }
      );
    }

    queryClient.setQueriesData(
      { predicate: (q) => q.queryKey[0] === 'contacts' },
      (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            contacts: Array.isArray(page.contacts)
              ? page.contacts.map((c: any) => (c?.id === crmId ? { ...c, ...mergedPatch } : c))
              : page.contacts
          }))
        };
      }
    );
  };

  const buildExistingContactLookups = async () => {
    const empty = {
      emailToCrmId: new Map<string, string>(),
      apolloIdToCrmId: new Map<string, string>(),
      linkedinToCrmId: new Map<string, string>(),
      nameToCrmId: new Map<string, string>()
    };

    try {
      let query = supabase
        .from('contacts')
        .select('id, email, firstName, lastName, name, linkedinUrl, metadata');

      if (accountId) {
        query = query.eq('accountId', accountId);
      }

      const { data: existingContacts, error } = await query.limit(1000);
      if (error || !existingContacts) return empty;

      existingContacts.forEach((contact) => {
        if (!contact?.id) return;

        const email = sanitizeContactText(contact.email).toLowerCase();
        if (email && !empty.emailToCrmId.has(email)) {
          empty.emailToCrmId.set(email, contact.id);
        }

        const linkedin = normalizeLinkedinUrl(contact.linkedinUrl);
        if (linkedin && !empty.linkedinToCrmId.has(linkedin)) {
          empty.linkedinToCrmId.set(linkedin, contact.id);
        }

        const metadata = isRecord(contact.metadata) ? contact.metadata : {};
        const apolloPersonId = sanitizeContactText(metadata.apollo_person_id);
        if (apolloPersonId && !empty.apolloIdToCrmId.has(apolloPersonId)) {
          empty.apolloIdToCrmId.set(apolloPersonId, contact.id);
        }

        const contactIdentity = buildIdentityName({
          name: contact.name,
          firstName: contact.firstName,
          lastName: contact.lastName
        });
        const nameKey = buildNameKey(contactIdentity.firstName, contactIdentity.lastName);
        if (nameKey && !empty.nameToCrmId.has(nameKey)) {
          empty.nameToCrmId.set(nameKey, contact.id);
        }
      });
    } catch (err) {
      console.warn('Failed to build contact lookups:', err);
    }

    return empty;
  };

  const handleAcquire = async (person: ApolloContactRow, type: 'email' | 'phone' | 'both' = 'both') => {
    if (!accountId) {
      toast.error('No account ID provided for acquisition');
      return;
    }

    // Email button: only reveal email (fast)
    // Phone button: reveal BOTH email AND phone (slower, reveals everything)
    const revealEmails = type === 'email' || type === 'phone' || type === 'both';
    const revealPhones = type === 'phone' || type === 'both';

    const shouldAnimateEmailOnPhoneReveal = type === 'phone' && (!person.email || person.email === 'N/A');
    patchRevealState(person.id, {
      revealingEmail: type === 'email' || type === 'both' || shouldAnimateEmailOnPhoneReveal,
      revealingPhone: type === 'phone' || type === 'both',
      phoneTimedOut: false,
      phoneWarned: false
    });

    if (type === 'phone' || type === 'both') {
      clearAllPhoneRevealTimers(person.id);
      phoneRevealWarningTimeouts.current[person.id] = setTimeout(() => {
        patchRevealState(person.id, { phoneWarned: true });
      }, PHONE_REVEAL_WARNING_MS);
      phoneRevealTimeouts.current[person.id] = setTimeout(() => {
        patchRevealState(person.id, {
          revealingPhone: false,
          revealingEmail: false,
          phoneTimedOut: true,
          phoneWarned: true
        });
        toast.warning(
          `No phone data returned for ${person.firstName || person.name || 'this contact'} after ${PHONE_REVEAL_TIMEOUT_MS / 1000} seconds.`
        );
      }, PHONE_REVEAL_TIMEOUT_MS);
    }

    try {
      const token = await getApolloBearerToken(true);

      // 1. Reveal & Enrich (Consume Apollo Credits)
      const enrichResp = await fetch('/api/apollo/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          contactIds: [person.id],  // Array of Apollo person IDs
          contacts: [person],       // Full contact objects for context
          revealEmails,
          revealPhones,
          company: { name: companySummary?.name || companyName, domain: domain }
        })
      });

      if (!enrichResp.ok) {
        const errorText = await enrichResp.text();
        console.error('Apollo enrich API error:', errorText);
        throw new Error(`Enrichment failed: ${enrichResp.status} ${errorText}`);
      }
      const enrichData = await enrichResp.json() as {
        contacts?: Array<{
          fullName?: string;
          firstName?: string;
          lastName?: string;
          photoUrl?: string;
          jobTitle?: string;
          email?: string;
          linkedin?: string;
          location?: string;
          phones?: Array<{ number: string }>;
        }>
      };
      const enriched = enrichData.contacts?.[0];

      if (!enriched) {
        throw new Error('No enrichment data available');
      }

      // 2. Insert or Update Supabase
      // Use contact's own city/state (person location), not company location. LinkedIn from enriched or person.
      let crmId = person.crmId;
      const contactCity = (enriched as { city?: string }).city ?? person.location?.split(',')[0]?.trim() ?? null;
      const contactState = (enriched as { state?: string }).state ?? (person.location?.includes(',') ? person.location.split(',')[1]?.trim() : null) ?? null;
      const linkedinUrl = (enriched as { linkedin?: string }).linkedin || person.linkedin || null;
      const linkedinLookup = normalizeLinkedinUrl(linkedinUrl);
      const rawImmediatePhones: PhoneEntry[] = (enriched.phones || [])
        .map((ph: { number?: string; type?: string; type_cd?: string }) => {
          if (!ph?.number) return null;
          return { number: ph.number, type: ph.type || ph.type_cd };
        })
        .filter(Boolean) as PhoneEntry[];
      const immediatePhones = normalizeRevealedPhones(rawImmediatePhones);
      const assignedImmediatePhones = assignRevealedPhonesToContactFields(immediatePhones);
      const enrichedIdentity = buildIdentityName({
        name: enriched.fullName,
        firstName: enriched.firstName,
        lastName: enriched.lastName
      });
      const personIdentity = buildIdentityName({
        name: person.name,
        firstName: person.firstName,
        lastName: person.lastName
      });
      const resolvedIdentity = {
        name: enrichedIdentity.name || personIdentity.name || 'Unknown Contact',
        firstName: enrichedIdentity.firstName || personIdentity.firstName || undefined,
        lastName: enrichedIdentity.lastName || personIdentity.lastName || undefined
      };
      const safeEmail = sanitizeContactText(enriched.email) || sanitizeContactText(person.email) || 'N/A';

      const contactIdentityPatch: Record<string, unknown> = {
        name: resolvedIdentity.name,
        firstName: resolvedIdentity.firstName,
        lastName: resolvedIdentity.lastName,
      };

      const contactBaseData: Record<string, unknown> = {
        title: enriched.jobTitle || person.title,
        email: safeEmail,
        accountId: accountId,
        ownerId: user?.email?.toLowerCase() || null,
        status: 'Active',
        ...(linkedinUrl ? { linkedinUrl } : {}),
        ...(contactCity ? { city: contactCity } : {}),
        ...(contactState ? { state: contactState } : {}),
        ...assignedImmediatePhones.patch,
        metadata: {
          source: 'Apollo Organizational Intelligence',
          acquired_at: new Date().toISOString(),
          company: companySummary?.name || companyName || domain,
          apollo_person_id: person.id,
          photoUrl: enriched.photoUrl || person.photoUrl || '',
          apollo_revealed_phones: immediatePhones,
          apollo_overflow_phones: assignedImmediatePhones.extras,
          original_apollo_data: enriched
        }
      };

      if (crmId) {
        const { data: currentContact } = await supabase
          .from('contacts')
          .select('name, firstName, lastName')
          .eq('id', crmId)
          .maybeSingle();

        const hasExistingName =
          sanitizeContactText(currentContact?.name) ||
          sanitizeContactText(currentContact?.firstName) ||
          sanitizeContactText(currentContact?.lastName);

        const updateData = hasExistingName
          ? contactBaseData
          : { ...contactBaseData, ...contactIdentityPatch };

        const { error } = await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', crmId);
        if (error) throw error;
      } else {
        const contactData = { ...contactBaseData, ...contactIdentityPatch };

        // Try to find existing contact by Apollo person id (from a previous reveal) or by email
        const { data: byApolloId } = await supabase
          .from('contacts')
          .select('id')
          .eq('metadata->>apollo_person_id', person.id)
          .maybeSingle();
        if (byApolloId?.id) {
            crmId = byApolloId.id;
            const { error } = await supabase
              .from('contacts')
              .update(contactData)
            .eq('id', crmId);
          if (error) throw error;
        } else if (linkedinLookup) {
          const linkedinPattern = `%${linkedinLookup.split('linkedin.com/').pop() || linkedinLookup}%`;
          const { data: byLinkedin } = await supabase
            .from('contacts')
            .select('id')
            .eq('accountId', accountId)
            .ilike('linkedinUrl', linkedinPattern)
            .maybeSingle();
          if (byLinkedin?.id) {
            crmId = byLinkedin.id;
            const { error } = await supabase
              .from('contacts')
              .update(contactData)
              .eq('id', crmId);
            if (error) throw error;
          }
        }

        if (!crmId && resolvedIdentity.firstName && resolvedIdentity.lastName) {
          const { data: byName } = await supabase
            .from('contacts')
            .select('id')
            .eq('accountId', accountId)
            .ilike('firstName', resolvedIdentity.firstName)
            .ilike('lastName', resolvedIdentity.lastName)
            .maybeSingle();
          if (byName?.id) {
            crmId = byName.id;
            const { error } = await supabase
              .from('contacts')
              .update(contactData)
              .eq('id', crmId);
            if (error) throw error;
          }
        }

        const contactEmail = sanitizeContactText(contactData.email);
        if (!crmId && contactEmail && contactEmail !== 'N/A') {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .ilike('email', contactEmail)
            .maybeSingle();
          if (existing?.id) {
            crmId = existing.id;
            const { error } = await supabase
              .from('contacts')
              .update(contactData)
              .eq('id', crmId);
            if (error) throw error;
          } else {
            contactData.id = crypto.randomUUID();
            const { data: newContact, error } = await supabase
              .from('contacts')
              .insert(contactData)
              .select()
              .single();
            if (error) throw error;
            crmId = newContact.id;
          }
        } else {
          contactData.id = crypto.randomUUID();
          const { data: newContact, error } = await supabase
            .from('contacts')
            .insert(contactData)
            .select()
            .single();
          if (error) throw error;
          crmId = newContact.id;
        }
      }

      const typeLabel = type === 'both' ? 'details' : type === 'email' ? 'email' : 'phone';
      toast.success(`${resolvedIdentity.name} ${typeLabel} revealed & synced`);

      // Immediate local cache hydration so dossier Uplinks updates without waiting for refetch.
      if (crmId) {
        syncContactCachesImmediately(
          crmId,
          assignedImmediatePhones.patch,
          contactBaseData.metadata as Record<string, unknown>
        );
      }

      // Invalidate and refetch so dossier, people, accounts, targets see changes immediately
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === crmId });
      await queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === crmId });
      if (accountId) {
        await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'account-contacts' && q.queryKey[1] === accountId });
        await queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === 'account-contacts' && q.queryKey[1] === accountId });
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === accountId });
        queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === accountId });
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['targets'] });

      // Trigger blur-in on contact dossier for enriched fields
      setLastEnrichedContactId(crmId ?? null);
      setTimeout(() => setLastEnrichedContactId(null), 3500);

      // 3. Update local state (phones from immediate response; keep type for W/M/O display)
      const immediatePhonesToPersist: PhoneEntry[] = [];
      if (assignedImmediatePhones.patch.mobile) {
        immediatePhonesToPersist.push({ number: assignedImmediatePhones.patch.mobile, type: 'mobile' });
      }
      if (assignedImmediatePhones.patch.workPhone) {
        immediatePhonesToPersist.push({ number: assignedImmediatePhones.patch.workPhone, type: 'work' });
      }
      if (assignedImmediatePhones.patch.otherPhone) {
        immediatePhonesToPersist.push({ number: assignedImmediatePhones.patch.otherPhone, type: 'other' });
      }
      const newPhonesTyped: PhoneEntry[] = (enriched.phones || []).map((ph: { number?: string; type?: string }) =>
        ph?.number ? { number: ph.number, type: ph.type } : null
      ).filter(Boolean) as PhoneEntry[];
      const hasImmediatePhones = newPhonesTyped.length > 0;
      const existingNormalized: PhoneEntry[] = (person.phones || []).map((e) => (typeof e === 'string' ? e : e));
      const mergedPhones = normalizeRevealedPhones([
        ...existingNormalized,
        ...immediatePhonesToPersist,
        ...newPhonesTyped
      ]);

      const updatedData = data.map(p =>
        p.id === person.id ? {
          ...p,
          isMonitored: true,
          crmId: crmId,
          name: resolvedIdentity.name,
          firstName: resolvedIdentity.firstName || p.firstName,
          lastName: resolvedIdentity.lastName || p.lastName,
          photoUrl: enriched.photoUrl || p.photoUrl,
          email: safeEmail || p.email,
          title: enriched.jobTitle || p.title,
          linkedin: sanitizeContactText(enriched.linkedin) || p.linkedin,
          location: enriched.location || p.location,
          phones: mergedPhones
        } : p
      );

      setData(updatedData);
      patchRevealState(person.id, {
        revealingEmail: false,
        revealingPhone: type === 'phone' || type === 'both' ? !hasImmediatePhones : false,
        phoneTimedOut: false,
        phoneWarned: false
      });
      if (hasImmediatePhones) {
        clearAllPhoneRevealTimers(person.id);
      }

      // 4. Save updated contact list to cache so refresh doesn't lose revealed data
      saveToCache(companySummary, updatedData, {
        searchTerm: searchTerm.trim(),
        currentPage,
      });

      // 5. If we requested phone reveal, Apollo delivers phones asynchronously via webhook (can take several minutes).
      // Poll phone-retrieve until ready, then update contact and local state.
      if ((type === 'phone' || type === 'both') && crmId) {
        toast.info('Phone numbers can take a few minutes. Checking in background.', { duration: 5000 });
        const apolloPersonId = person.id;
        const maxAttempts = PHONE_REVEAL_MAX_ATTEMPTS;
        const intervalMs = PHONE_REVEAL_POLL_INTERVAL_MS;
        let attempts = 0;
        const pollForPhones = async () => {
          if (attempts >= maxAttempts) {
            patchRevealState(person.id, {
              revealingPhone: false,
              revealingEmail: false,
              phoneTimedOut: true,
              phoneWarned: true
            });
            clearAllPhoneRevealTimers(person.id);
            return;
          }
          attempts += 1;
          try {
            const pollToken = await getApolloBearerToken();
            const res = await fetch(`/api/apollo/phone-retrieve?personId=${encodeURIComponent(apolloPersonId)}`, {
              headers: { Authorization: `Bearer ${pollToken}` },
            });
            if (!res.ok) return;
            const json = await res.json();
            if (json.ready && Array.isArray(json.phones) && json.phones.length > 0) {
              const incomingRaw: PhoneEntry[] = json.phones
                .map((p: { sanitized_number?: string; raw_number?: string; type?: string; type_cd?: string }) => {
                  const raw = p.sanitized_number || p.raw_number;
                  if (!raw) return null;
                  return { number: raw, type: p.type || p.type_cd } as PhoneEntry;
                })
                .filter(Boolean) as PhoneEntry[];
              const incoming = normalizeRevealedPhones(incomingRaw);
              if (incoming.length === 0) return;

              const assignedIncomingPhones = assignRevealedPhonesToContactFields(incoming);

              const { data: existingContact } = await supabase
                .from('contacts')
                .select('metadata')
                .eq('id', crmId)
                .maybeSingle();

              const existingMetadata = isRecord(existingContact?.metadata) ? existingContact.metadata : {};
              const metadataPatch = {
                ...existingMetadata,
                apollo_revealed_phones: incoming,
                apollo_overflow_phones: assignedIncomingPhones.extras
              };

              const { error: updateError } = await supabase
                .from('contacts')
                .update({
                  ...assignedIncomingPhones.patch,
                  metadata: metadataPatch
                })
                .eq('id', crmId);
              if (!updateError) {
                syncContactCachesImmediately(
                  crmId,
                  assignedIncomingPhones.patch,
                  metadataPatch
                );
                setData(prev => {
                  const existing = prev.find(p => p.id === person.id)?.phones || [];
                  const existingNums = new Set(existing.map(phoneDisplayNumber));
                  const merged: PhoneEntry[] = [...existing];
                  incoming.forEach((entry) => {
                    const num = phoneDisplayNumber(entry);
                    if (!existingNums.has(num)) {
                      existingNums.add(num);
                      merged.push(entry);
                    }
                  });
                  const updatedDataWithPhones = prev.map(p =>
                    p.id === person.id ? { ...p, phones: merged } : p
                  );
                  saveToCache(companySummary, updatedDataWithPhones, {
                    searchTerm: searchTerm.trim(),
                    currentPage,
                  });
                  return updatedDataWithPhones;
                });
                const displayName = person.name || [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Contact';
                toast.success(`Phone numbers for ${displayName} received & saved.`);
                patchRevealState(person.id, {
                  revealingPhone: false,
                  revealingEmail: false,
                  phoneTimedOut: false,
                  phoneWarned: false
                });
                clearAllPhoneRevealTimers(person.id);
              }
              return;
            }
          } catch (_) { }
          setTimeout(pollForPhones, intervalMs);
        };
        setTimeout(pollForPhones, intervalMs);
      }
    } catch (error) {
      console.error('Acquisition Error:', error);
      clearAllPhoneRevealTimers(person.id);
      patchRevealState(person.id, {
        revealingEmail: false,
        revealingPhone: false,
        phoneTimedOut: false,
        phoneWarned: false
      });
      toast.error('Failed to reveal contact details');
    }
  };

  const buildComposeContext = (person: ApolloContactRow): ComposeContext => {
    const contactName =
      person.name ||
      [person.firstName, person.lastName].filter(Boolean).join(' ').trim() ||
      undefined;
    const accountDisplayName = companySummary?.name || companyName || domain;
    const contextPieces: string[] = [];
    const description = companySummary?.description?.trim();
    if (description) contextPieces.push(description);
    if (companySummary?.industry) contextPieces.push(`Industry: ${companySummary.industry}`);
    if (companySummary?.revenue) contextPieces.push(`Revenue: ${companySummary.revenue}`);
    if (companySummary?.website) contextPieces.push(`Website: ${companySummary.website}`);
    if (companySummary?.linkedin) contextPieces.push(`LinkedIn: ${companySummary.linkedin}`);
    const locationParts = [companySummary?.city, companySummary?.state, companySummary?.country].filter(Boolean);
    if (locationParts.length) contextPieces.push(`HQ: ${locationParts.join(', ')}`);
    if (person.title) contextPieces.push(`Contact Title: ${person.title}`);
    if (person.location) contextPieces.push(`Contact Location: ${person.location}`);

    return {
      contactId: person.crmId || undefined,
      accountId: accountId ?? undefined,
      contactName,
      contactTitle: person.title || undefined,
      companyName: accountDisplayName || undefined,
      accountName: accountDisplayName || undefined,
      industry: companySummary?.industry || undefined,
      accountDescription: description || undefined,
      contextForAi: contextPieces.length ? contextPieces.join('\n') : undefined
    };
  };

  const handleContactEmailClick = (person: ApolloContactRow) => {
    if (!person.email || person.email === 'N/A') return;
    openCompose({
      to: person.email,
      subject: '',
      context: buildComposeContext(person)
    });
  };

  const handleScan = async () => {
    if (!companyName && !domain) {
      toast.error('No company context available for scan.');
      return;
    }

    setScanStatus('scanning');
    const previousData = data;
    try {
      const token = await getApolloBearerToken(true);

      // 1. Fetch Company Summary
      let currentSummary: ApolloCompany | null = null;
      const summaryParams = new URLSearchParams();
      if (domain) summaryParams.append('domain', domain);
      if (companyName) summaryParams.append('company', companyName);

      try {
        const summaryResp = await fetch(`/api/apollo/company?${summaryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (summaryResp.ok) {
          currentSummary = await summaryResp.json();
          setCompanySummary(currentSummary);
        }
      } catch (err) {
        console.warn('Company summary fetch failed:', err);
      }

      // 2. Get Decision Makers (Initial Batch)
      const hasDomainScope = Boolean(domain && domain.trim());
      const peopleResp = await fetch('/api/apollo/search-people', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          page: 1,
          per_page: 50,
          q_organization_domains: hasDomainScope ? domain : undefined,
          q_organization_name: !hasDomainScope ? companyName || undefined : undefined,
          person_titles: ['owner', 'founder', 'c-level', 'vp', 'director', 'manager']
        }),
      });

      if (!peopleResp.ok) {
        throw new Error('Failed to fetch from Apollo');
      }

      const result: unknown = await peopleResp.json();

      // The search-people endpoint returns { people: [...], pagination: {...} }
      // while handleScan previously expected { contacts: [...] }
      const apolloContacts: unknown[] =
        isRecord(result) && Array.isArray(result.people) ? (result.people as unknown[]) : []

      const lookups = await buildExistingContactLookups();

      // Fallback: If company summary is still null, try to derive it from the first contact
      if (!currentSummary && apolloContacts.length > 0) {
        const first = apolloContacts[0];
        if (isRecord(first)) {
          currentSummary = {
            name: (first.organization_name as string) || (first.companyName as string) || companyName || '',
            domain: (first.organization_domain as string) || (first.companyDomain as string) || domain || '',
            industry: (first.organization_industry as string) || undefined,
            city: (first.organization_city as string) || undefined,
            state: (first.organization_state as string) || undefined,
            country: (first.organization_country as string) || undefined,
            address: (first.organization_raw_address as string) || (first.organization_street_address as string) || undefined,
            description: (first.organization_description as string) || undefined,
            linkedin: (first.organization_linkedin_url as string) || undefined,
            companyPhone: (first.organization_phone as string) || undefined,
            employees: (first.organization_num_employees as string) || undefined,
          };
          setCompanySummary(currentSummary);
        }
      }

      // Map Apollo results to our table format with monitored status
      const mappedData: ApolloContactRow[] = apolloContacts
        .map((contact): ApolloContactRow | null => {
          if (!isRecord(contact)) return null
          const identity = buildIdentityName({
            name: contact.name,
            firstName: contact.first_name,
            lastName: contact.last_name
          });
          const name = identity.name || 'Contact';

          const id = typeof contact.id === 'string' ? contact.id :
            typeof contact.contactId === 'string' ? contact.contactId :
              typeof contact.person_id === 'string' ? contact.person_id : '';

          if (!id) return null;

          const firstName = identity.firstName || name.split(' ')[0] || ''
          const lastName = identity.lastName || name.split(' ').slice(1).join(' ')
          const title = typeof contact.title === 'string' ? contact.title : undefined
          const email = typeof contact.email === 'string' ? contact.email : 'N/A'
          const emailStatus = typeof contact.email_status === 'string' ? contact.email_status : ''
          const status: ApolloContactRow['status'] = emailStatus === 'verified' ? 'verified' : 'unverified'
          const emailKey = sanitizeContactText(email).toLowerCase();
          const linkedin = sanitizeContactText(contact.linkedin_url);
          const linkedInKey = normalizeLinkedinUrl(linkedin);
          const nameKey = buildNameKey(firstName, lastName);
          const crmId =
            lookups.apolloIdToCrmId.get(id) ||
            (emailKey ? lookups.emailToCrmId.get(emailKey) : undefined) ||
            (linkedInKey ? lookups.linkedinToCrmId.get(linkedInKey) : undefined) ||
            (nameKey ? lookups.nameToCrmId.get(nameKey) : undefined);
          const isMonitored = Boolean(crmId);

          const location = [
            typeof contact.city === 'string' ? contact.city : null,
            typeof contact.state === 'string' ? contact.state : null
          ].filter(Boolean).join(', ')

          const photoUrl = resolveContactPhotoUrl(contact)

          // Apollo phone numbers are often in a 'phones' array
          const phones: string[] = []
          if (Array.isArray(contact.phones)) {
            contact.phones.forEach(p => {
              if (isRecord(p) && typeof p.sanitized_number === 'string') {
                phones.push(p.sanitized_number)
              }
            })
          }

          return {
            id,
            name,
            firstName,
            lastName,
            title,
            email,
            status,
            isMonitored,
            crmId,
            location,
            linkedin,
            photoUrl,
            phones
          }
        })
        .filter((v): v is ApolloContactRow => v !== null)

      const hydratedData = hydrateApolloContactsWithCache(mappedData, previousData);
      const mergedCacheData = mergeApolloContactRows(previousData, mappedData);

      setData(hydratedData);
      setScanStatus('complete');

      // Save to cache
      saveToCache(currentSummary, mergedCacheData, {
        searchTerm: '',
        currentPage: 1,
      });
    } catch (error) {
      console.error('Apollo Scan Error:', error);
      setScanStatus('idle');
      toast.error('Failed to connect to Apollo Intelligence. Verify API configuration.');
    }
  };

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setCurrentPage(1);
      return;
    }
    if (!domain && !companyName) {
      toast.error('No company context. Open an account first so we can scope the search.');
      return;
    }

    setContactsLoading(true);
    const previousData = data;
    try {
      const token = await getApolloBearerToken(true);
      const hasDomainScope = Boolean(domain && domain.trim());

      // Domain-first query avoids false negatives when CRM account name differs from Apollo org name.
      const runApolloSearch = async (includeCompanyName: boolean): Promise<unknown[]> => {
        const peopleResp = await fetch('/api/apollo/search-people', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            page: 1,
            per_page: 50,
            q_keywords: term,
            q_organization_domains: hasDomainScope ? domain : undefined,
            q_organization_domains_list: hasDomainScope ? [domain] : undefined,
            q_organization_name: (!hasDomainScope || includeCompanyName) ? companyName || undefined : undefined
            // Intentionally omit person_titles so search returns anyone at the org matching the term
          }),
        });

        if (!peopleResp.ok) {
          const errBody = await peopleResp.json().catch(() => ({}));
          throw new Error(typeof errBody?.error === 'string' ? errBody.error : 'Failed to search Apollo');
        }

        const result: unknown = await peopleResp.json();
        return isRecord(result) && Array.isArray(result.people) ? (result.people as unknown[]) : [];
      };

      let apolloContacts: unknown[] = await runApolloSearch(false);
      if (apolloContacts.length === 0 && hasDomainScope && companyName) {
        // Fallback: add company-name constraint only if domain-only query came back empty.
        apolloContacts = await runApolloSearch(true);
      }

      const lookups = await buildExistingContactLookups();

      const mappedData: ApolloContactRow[] = apolloContacts
        .map((contact): ApolloContactRow | null => {
          if (!isRecord(contact)) return null;
          const c = contact as Record<string, unknown>;
          const identity = buildIdentityName({
            name: c.name,
            firstName: typeof c.first_name === 'string' ? c.first_name : c.firstName,
            lastName: typeof c.last_name === 'string' ? c.last_name : c.lastName
          });
          const name = identity.name || 'Contact';

          const id = typeof c.id === 'string' ? c.id :
            typeof c.contactId === 'string' ? c.contactId :
              typeof c.person_id === 'string' ? c.person_id : '';
          if (!id) return null;

          const firstName = identity.firstName || name.split(' ')[0] || '';
          const lastName = identity.lastName || name.split(' ').slice(1).join(' ');
          const title = typeof c.title === 'string' ? c.title : undefined;
          const email = typeof c.email === 'string' ? c.email : 'N/A';
          const emailStatus = typeof c.email_status === 'string' ? c.email_status : '';
          const status: ApolloContactRow['status'] = emailStatus === 'verified' ? 'verified' : 'unverified';
          const linkedin = sanitizeContactText(typeof c.linkedin_url === 'string' ? c.linkedin_url : typeof c.linkedin === 'string' ? c.linkedin : '');
          const emailKey = sanitizeContactText(email).toLowerCase();
          const linkedInKey = normalizeLinkedinUrl(linkedin);
          const nameKey = buildNameKey(firstName, lastName);
          const crmId =
            lookups.apolloIdToCrmId.get(id) ||
            (emailKey ? lookups.emailToCrmId.get(emailKey) : undefined) ||
            (linkedInKey ? lookups.linkedinToCrmId.get(linkedInKey) : undefined) ||
            (nameKey ? lookups.nameToCrmId.get(nameKey) : undefined);
          const isMonitored = Boolean(crmId);

          const location = [
            typeof c.city === 'string' ? c.city : null,
            typeof c.state === 'string' ? c.state : null
          ].filter(Boolean).join(', ');

          const photoUrl = resolveContactPhotoUrl(c);

          const phones: PhoneEntry[] = [];
          if (Array.isArray(c.phones)) {
            c.phones.forEach((p: unknown) => {
              if (!isRecord(p)) return;
              if (typeof p.number === 'string') {
                phones.push({
                  number: p.number,
                  type: typeof p.type === 'string' ? p.type : undefined
                });
                return;
              }
              if (typeof p.sanitized_number === 'string') {
                phones.push({
                  number: p.sanitized_number,
                  type: typeof p.type === 'string' ? p.type : undefined
                });
              }
            });
          } else if (Array.isArray(c.phone_numbers)) {
            (c.phone_numbers as Array<{ sanitized_number?: string; number?: string; type?: string; type_cd?: string }>).forEach(p => {
              const num = p?.sanitized_number ?? p?.number;
              if (typeof num === 'string') {
                phones.push({ number: num, type: p.type || p.type_cd });
              }
            });
          }

          return {
            id,
            name,
            firstName,
            lastName,
            title,
            email,
            status,
            isMonitored,
            crmId,
            location,
            linkedin: linkedin || undefined,
            photoUrl,
            phones
          };
        })
        .filter((v): v is ApolloContactRow => v !== null);

      const mergedCacheData = mergeApolloContactRows(previousData, mappedData);
      const hydratedData = hydrateApolloContactsWithCache(mappedData, previousData);

      if (mappedData.length > 0) {
        setData(hydratedData);
        setCurrentPage(1);
        saveToCache(companySummary, mergedCacheData, {
          searchTerm: term,
          currentPage: 1,
        });
      } else {
        let crmFallback: ApolloContactRow[] = [];

        if (accountId) {
          const { data: crmContacts, error: crmError } = await supabase
            .from('contacts')
            .select('id, firstName, lastName, name, email, title, city, state, linkedinUrl, phone, mobile, workPhone, otherPhone, metadata')
            .eq('accountId', accountId)
            .limit(200);

          if (!crmError && Array.isArray(crmContacts) && crmContacts.length > 0) {
            const lowerTerm = term.toLowerCase();
            crmFallback = crmContacts
              .filter((c) => {
                const values = [
                  sanitizeContactText(c.firstName),
                  sanitizeContactText(c.lastName),
                  sanitizeContactText(c.name),
                  sanitizeContactText(c.email),
                  sanitizeContactText(c.title),
                ];
                return values.some((v) => v.toLowerCase().includes(lowerTerm));
              })
              .map((c): ApolloContactRow => {
                const identity = buildIdentityName({
                  name: c.name,
                  firstName: c.firstName,
                  lastName: c.lastName
                });
                const phones = [
                  sanitizeContactText(c.mobile),
                  sanitizeContactText(c.workPhone),
                  sanitizeContactText(c.phone),
                  sanitizeContactText(c.otherPhone)
                ].filter(Boolean);

                return {
                  id: c.id,
                  crmId: c.id,
                  name: identity.name || 'Contact',
                  firstName: identity.firstName || '',
                  lastName: identity.lastName || '',
                  title: sanitizeContactText(c.title) || undefined,
                  email: sanitizeContactText(c.email) || 'N/A',
                  status: sanitizeContactText(c.email) ? 'verified' : 'unverified',
                  isMonitored: true,
                  location: [sanitizeContactText(c.city), sanitizeContactText(c.state)].filter(Boolean).join(', ') || undefined,
                  linkedin: sanitizeContactText(c.linkedinUrl) || undefined,
                  photoUrl: resolveContactPhotoUrl(c, c.metadata),
                  phones
                };
              });
          }
        }

        if (crmFallback.length > 0) {
          const hydratedFallback = hydrateApolloContactsWithCache(crmFallback, previousData);
          const mergedFallbackCache = mergeApolloContactRows(previousData, crmFallback);
          setData(hydratedFallback);
          setCurrentPage(1);
          saveToCache(companySummary, mergedFallbackCache, {
            searchTerm: term,
            currentPage: 1,
          });
          toast.info('No live Apollo matches for this search. Showing synced CRM contacts for this account.');
        } else if (previousData.length > 0) {
          saveToCache(companySummary, previousData, {
            searchTerm: term,
            currentPage: 1,
          });
          toast.info('No additional matches from Apollo. Showing filtered list from current results.');
        } else {
          saveToCache(companySummary, previousData, {
            searchTerm: term,
            currentPage: 1,
          });
          toast.info('No people found for this search.');
        }
      }
    } catch (error) {
      console.error('Apollo Search Error:', error);
      toast.error(error instanceof Error ? error.message : 'Search failed. Please try again.');
    } finally {
      setContactsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return data;
    return data.filter((p) => {
      const name = (p.name ?? '').toLowerCase();
      const first = (p.firstName ?? '').toLowerCase();
      const last = (p.lastName ?? '').toLowerCase();
      const title = (p.title ?? '').toLowerCase();
      return name.includes(term) || first.includes(term) || last.includes(term) || title.includes(term);
    });
  }, [data, searchTerm]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * CONTACTS_PER_PAGE;
    return filteredData.slice(start, start + CONTACTS_PER_PAGE);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / CONTACTS_PER_PAGE);

  const contentExpanded = scanStatus === 'complete';

  return (
    <motion.div
      className="relative overflow-hidden rounded-3xl transition-all duration-300 nodal-module-glass nodal-monolith-edge flex flex-col"
      initial={false}
      animate={{ minHeight: contentExpanded ? 400 : 140 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >

      {/* HEADER - Status & Controls */}
      <div className="p-4 pb-2 flex justify-between items-center border-b border-white/5 nodal-recessed">
        <div className="flex items-center gap-2">
          <Users className={cn("w-3.5 h-3.5", scanStatus === 'complete' ? "text-white" : "text-zinc-500")} />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            {contactsLoading ? 'Searching...' : scanStatus === 'scanning' ? 'Scanning...' : `Target_Pool [${filteredData.length}]`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {scanStatus === 'complete' && (
            <button
              onClick={() => {
                setScanStatus('idle');
                setData([]);
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="text-[10px] font-mono text-zinc-600 hover:text-white transition-colors uppercase tracking-widest"
            >
              Reset
            </button>
          )}
          <ShieldCheck className={cn("w-3.5 h-3.5", scanStatus === 'complete' ? "text-green-500" : "text-zinc-700")} />
        </div>
      </div>

      {/* SEARCH BAR (Visible when complete) */}
      {scanStatus === 'complete' && (
        <div className="px-4 py-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 group-focus-within:text-[#002FA7] transition-colors" />
              <input
                type="text"
                placeholder="Search decision makers..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="w-full bg-zinc-950/40 border border-white/5 rounded-lg pl-8 pr-16 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-[#002FA7]/50 transition-all placeholder:text-zinc-700"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && (
                  <button
                    onClick={handleSearch}
                    className="p-1 rounded bg-zinc-950/20 hover:bg-zinc-950/40 text-[#002FA7] transition-colors"
                    title="Search Apollo"
                  >
                    <Search className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
            {accountId && (
              <button
                onClick={handleEnrichAccount}
                className="px-2 py-1.5 rounded-lg bg-zinc-950/20 hover:bg-zinc-950/40 border border-white/5 text-[9px] font-mono text-white transition-all flex items-center gap-1.5 group uppercase tracking-widest whitespace-nowrap"
                title="Deep_Enrich Account Profile"
              >
                <Sparkles className="w-2.5 h-2.5 text-blue-400 group-hover:animate-pulse" />
                Enrich
              </button>
            )}
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className={cn(
        "flex-1 p-1 relative min-h-0 transition-opacity duration-500",
        scanStatus === 'idle' ? "opacity-50" : "opacity-100"
      )}>
        {/* Blur Overlay only for initial scan (enrichment); not for search */}
        {scanStatus === 'scanning' && data.length > 0 && !contactsLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in duration-300 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl border border-white/20 nodal-module-glass flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-[#002FA7] animate-pulse" />
                </div>
                <div className="absolute -inset-1 rounded-2xl bg-[#002FA7]/20 animate-ping" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-white uppercase tracking-[0.2em] animate-pulse">
                  Enrichment_Commencing
                </span>
                <span className="text-[8px] font-mono text-zinc-500 uppercase mt-1">
                  Synchronizing_Nodes...
                </span>
              </div>
            </div>
          </div>
        )}
        {/* STATE 1: IDLE */}
        {scanStatus === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-10 h-10 bg-zinc-950/30 rounded-2xl flex items-center justify-center mb-3 text-zinc-600 border border-white/5">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Target_Locked</h4>
            <p className="text-[9px] font-mono text-zinc-600 uppercase leading-relaxed mb-4">
              Apollo API gateway closed. Initiate scan to extract organizational hierarchy.
            </p>
            <Button
              onClick={handleScan}
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-8 px-6 rounded-lg text-[10px] uppercase tracking-widest transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.6)] group/btn flex items-center gap-2"
            >
              <div className="relative w-3.5 h-3.5">
                <Lock className="w-3.5 h-3.5 absolute inset-0 transition-all duration-300 group-hover/btn:opacity-0 group-hover/btn:scale-50" />
                <Unlock className="w-3.5 h-3.5 absolute inset-0 transition-all duration-300 opacity-0 scale-50 group-hover/btn:opacity-100 group-hover/btn:scale-100" />
              </div>
              Initiate Scan
            </Button>
          </div>
        )}

        {/* STATE 2: SCANNING */}
        {scanStatus === 'scanning' && (
          <div className="p-4 space-y-2 font-mono text-[9px] text-green-500/70 uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="animate-pulse">_</span>
              <span>Initializing Protocol...</span>
            </div>
            <div className="flex items-center gap-2 delay-75">
              <span className="animate-pulse">_</span>
              <span>Target: {domain}</span>
            </div>
            <div className="flex items-center gap-2 delay-150">
              <span className="animate-pulse">_</span>
              <span>Decrypting...</span>
            </div>
            <div className="pt-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#002FA7]" />
            </div>
          </div>
        )}

        {/* STATE 3: COMPLETE */}
        {scanStatus === 'complete' && (
          <div className="space-y-3">
            {/* COMPANY SUMMARY SECTION */}
            {companySummary && (
              <div className="px-3 py-3 border border-white/5 nodal-recessed rounded-xl mx-1 mt-1 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="relative group/logo">
                    {/* Key by account logo/domain so when CRM account loads we remount and show same logo as dossier header (avoids wrong Apollo fallback) */}
                    <CompanyIcon
                      key={`org-logo-${accountId || initialDomain || companyName || 'static'}`}
                      logoUrl={accountLogoUrl && accountLogoUrl.trim() ? accountLogoUrl.trim() : companySummary.logoUrl}
                      domain={accountDomain && accountDomain.trim() ? accountDomain.trim() : companySummary.domain}
                      name={companySummary.name || companyName || ''}
                      size={40}
                      roundedClassName="rounded-[14px]"
                      className="w-10 h-10 transition-all"
                    />
                    {companySummary.domain && (
                      <a
                        href={`https://${companySummary.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#002FA7] rounded-full flex items-center justify-center text-white opacity-0 group-hover/logo:opacity-100 transition-opacity shadow-lg"
                      >
                        <ExternalLink className="w-2 h-2" />
                      </a>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-white truncate block w-full" title={companySummary.name}>{companySummary.name}</h4>
                      </div>
                      {companySummary.linkedin && (
                        <a
                          href={companySummary.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-button-forensic w-6 h-6 flex items-center justify-center"
                        >
                          <Linkedin className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-zinc-400 truncate uppercase tracking-tighter">
                      {companySummary.industry || 'Enterprise'} • {formatHeadcountLabel(companySummary.employees) || '0-50'} Emp
                      {companySummary.revenue && ` • ${companySummary.revenue}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {(companySummary.city || companySummary.state || companySummary.zip) && (
                        <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                          <MapPin className="w-2.5 h-2.5" />
                          {[companySummary.city, companySummary.state, companySummary.zip].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {companySummary.companyPhone && (
                        <button
                          onClick={() => handleCompanyCall(companySummary.companyPhone!, companySummary.name)}
                          className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 hover:text-white transition-colors uppercase tracking-widest"
                        >
                          <Phone className="w-2.5 h-2.5 text-zinc-500" />
                          {companySummary.companyPhone}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {companySummary.description && (
                  <div className="space-y-1">
                    <p className={cn(
                      "text-[9px] font-mono text-zinc-500 leading-relaxed uppercase transition-all duration-300",
                      !isDescriptionExpanded && "line-clamp-2"
                    )}>
                      {companySummary.description}
                    </p>
                    {companySummary.description.length > 100 && (
                      <button
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        className="flex items-center gap-1 text-[8px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest"
                      >
                        {isDescriptionExpanded ? (
                          <><ChevronUp className="w-2.5 h-2.5" /> Show Less</>
                        ) : (
                          <><ChevronDown className="w-2.5 h-2.5" /> Show More</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CONTACTS LIST — loading only here; company block above stays static */}
            <div className="space-y-1 px-1">
              {contactsLoading ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <Loader2 className="w-6 h-6 animate-spin text-[#002FA7] mb-2" />
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Searching...</span>
                </div>
              ) : paginatedData.length > 0 ? (
                <AnimatePresence initial={false} mode="popLayout">
                  {paginatedData.map((person) => (
                    (() => {
                      const revealState = revealStates[person.id] || {
                        revealingEmail: false,
                        revealingPhone: false,
                        phoneTimedOut: false
                      };
                      const identity = buildIdentityName({
                        name: person.name,
                        firstName: person.firstName,
                        lastName: person.lastName
                      });
                      const contactFullName = identity.name || 'Contact';
                      const compactName = `${identity.firstName || contactFullName} ${identity.lastName ? `${identity.lastName.charAt(0)}.` : ''}`.trim();
                      return (
                    <motion.div
                      key={person.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: -10 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                        layout: { duration: 0.3 }
                      }}
                      className={cn(
                        'flex flex-col p-2.5 rounded-xl transition-all border border-transparent hover:border-white/5 hover:bg-zinc-950/40 space-y-2',
                        person.isMonitored && 'bg-zinc-950/40 border-white/5'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        {person.isMonitored && person.crmId ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/network/contacts/${person.crmId}`)}
                            aria-label={`Open dossier for ${contactFullName}`}
                            className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-left rounded-lg transition-colors hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7]"
                          >
                            <ContactAvatar
                              name={person.name || [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Contact'}
                              photoUrl={person.photoUrl}
                              size={36}
                              className="w-9 h-9 rounded-[10px]"
                              textClassName="text-[10px]"
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                                {contactFullName}
                              </span>
                              <ShieldCheck className="w-3 h-3 text-green-500 shrink-0" aria-label="Synced" />
                              </div>
                              <span className="text-[9px] font-mono text-zinc-500 truncate uppercase tracking-tighter">
                                {person.title || 'Nodal Analyst'}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <ContactAvatar
                              name={person.name || [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Contact'}
                              photoUrl={person.photoUrl}
                              size={36}
                              className="w-9 h-9 rounded-[10px]"
                              textClassName="text-[10px]"
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                                {compactName}
                              </span>
                              </div>
                              <span className="text-[9px] font-mono text-zinc-500 truncate uppercase tracking-tighter">
                                {person.title || 'Nodal Analyst'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          {person.isMonitored ? (
                            person.linkedin ? (
                              <a
                                href={person.linkedin}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="icon-button-forensic w-7 h-7 flex items-center justify-center"
                              >
                                <Linkedin className="w-2.5 h-2.5" />
                              </a>
                            ) : null
                          ) : null}
                        </div>
                      </div>

                      {/* GATED DETAILS */}
                      {person.isMonitored ? (
                        <div className="flex flex-col gap-y-1.5 pt-1 border-t border-white/5">
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center">
                            {/* Email Column */}
                            {person.email !== 'N/A' ? (
                              <motion.div
                                initial={{ opacity: 0.8, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                                className="flex flex-col items-start gap-0.5 min-w-0 w-full group/email"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleContactEmailClick(person)}
                                  aria-label={`Email ${contactFullName}`}
                                  className="w-full flex items-center gap-1.5 min-w-0 text-left transition duration-200 transform hover:scale-[1.02] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7] group"
                                >
                                  <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0 transition-colors duration-200 group-hover:text-white" />
                                  <span className="truncate text-[9px] font-mono uppercase tracking-tighter text-zinc-300 transition-colors duration-200 group-hover:text-white">
                                    {person.email}
                                  </span>
                                </button>
                                <span className="pl-5 text-[8px] font-mono text-zinc-500 tracking-[0.18em] uppercase transition duration-200 group-hover/email:text-white">
                                  EMAIL
                                </span>
                              </motion.div>
                            ) : (
                              <RevealActionButton
                                icon={Globe}
                                revealing={revealState.revealingEmail}
                                disabled={revealState.revealingEmail || revealState.revealingPhone}
                                onClick={() => handleAcquire(person, 'email')}
                                title="Reveal Email"
                              />
                            )}

                            {/* Phone Column */}
                            {person.phones && person.phones.length > 0 ? (
                              <motion.div
                                initial={{ opacity: 0.8, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                                className="flex flex-col gap-1 min-w-0 w-full"
                              >
                                {person.phones.map((entry, idx) => {
                                  const num = phoneDisplayNumber(entry);
                                  const label = phoneTypeLabel(entry, idx);
                                  return (
                                    <button
                                      key={num}
                                      type="button"
                                      aria-label={`Call ${contactFullName} (${label})`}
                                      onClick={() => {
                                        const callName = contactFullName;
                                        const logoUrl = (accountLogoUrl && accountLogoUrl.trim()) || companySummary?.logoUrl;
                                        const domainForCall =
                                          (accountDomain && accountDomain.trim()) ||
                                          companySummary?.domain ||
                                          domain;
                                        initiateCall(num, {
                                          name: callName,
                                          photoUrl: person.photoUrl,
                                          account: companyName,
                                          title: person.title,
                                          logoUrl: logoUrl || undefined,
                                          domain: domainForCall || undefined,
                                        });
                                        toast.info(`Calling ${callName}...`);
                                      }}
                                      className="w-full flex flex-col items-start gap-0.5 text-zinc-400 uppercase min-w-0 transition duration-200 transform hover:scale-[1.02] hover:text-white cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7] group"
                                    >
                                      <div className="flex items-center gap-1.5 w-full min-w-0">
                                        <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0 transition-colors duration-200 group-hover:text-white" />
                                        <span className="font-mono text-[9px] text-zinc-300 whitespace-nowrap transition-colors duration-200 group-hover:text-white">
                                          {num}
                                        </span>
                                      </div>
                                      <span className="pl-5 font-mono text-[8px] text-zinc-500 tracking-[0.18em] transition-colors duration-200 group-hover:text-white">
                                        {label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </motion.div>
                            ) : (
                              <RevealActionButton
                                icon={Phone}
                                revealing={revealState.revealingPhone}
                                disabled={revealState.revealingPhone || revealState.revealingEmail}
                                onClick={() => handleAcquire(person, 'phone')}
                                title="Reveal Phone"
                              />
                            )}
                          </div>

                          {(revealState.phoneTimedOut || (revealState.phoneWarned && revealState.revealingPhone)) && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-[8px] font-mono uppercase tracking-[0.2em] text-amber-500"
                            >
                              {revealState.phoneTimedOut
                                ? `Phone reveal returned no data after ${PHONE_REVEAL_TIMEOUT_SECONDS} seconds.`
                                : `Phone reveal still pending after ${PHONE_REVEAL_WARNING_SECONDS} seconds; continuing to poll.`}
                            </motion.div>
                          )}

                          {/* Location Row */}
                          {person.location && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">
                              <MapPin className="w-2.5 h-2.5" />
                              {person.location}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 items-center">
                          <RevealActionButton
                            icon={Globe}
                            revealing={revealState.revealingEmail}
                            disabled={revealState.revealingEmail || revealState.revealingPhone}
                            onClick={() => handleAcquire(person, 'email')}
                            title="Reveal email (fast)"
                          />
                          <RevealActionButton
                            icon={Phone}
                            revealing={revealState.revealingPhone}
                            disabled={revealState.revealingPhone || revealState.revealingEmail}
                            onClick={() => handleAcquire(person, 'phone')}
                            title="Reveal phone + email (full reveal)"
                          />
                          {(revealState.phoneTimedOut || (revealState.phoneWarned && revealState.revealingPhone)) && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="col-span-2 text-[8px] font-mono uppercase tracking-[0.2em] text-amber-500"
                            >
                              {revealState.phoneTimedOut
                                ? `Phone reveal returned no data after ${PHONE_REVEAL_TIMEOUT_SECONDS} seconds.`
                                : `Phone reveal still pending after ${PHONE_REVEAL_WARNING_SECONDS} seconds; continuing to poll.`}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </motion.div>
                      );
                    })()
                  ))}
                </AnimatePresence>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-widest">
                    No decision makers found
                  </p>
                </div>
              )}

              {/* USAGE SUMMARY FOOTER */}
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#002FA7] shadow-[0_0_8px_rgba(0,47,167,0.6)]" />
                  Apollo_Node_Link
                </div>
                <div className="flex items-center gap-2">
                  <span>Found: <span className="text-zinc-400 tabular-nums">{data.length}</span></span>
                  <div className="w-1 h-1 rounded-full bg-black/40" />
                  <span>Synced: <span className="text-zinc-400 tabular-nums">{data.filter(d => d.isMonitored).length}</span></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: PAGINATION & STATS (Sync_Block Protocol) */}
      {scanStatus === 'complete' && (
        <div className="mt-auto p-3 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-widest nodal-recessed">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-[#002FA7]" />
              {((currentPage - 1) * CONTACTS_PER_PAGE + 1).toString().padStart(2, '0')}–{Math.min(currentPage * CONTACTS_PER_PAGE, filteredData.length).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="icon-button-forensic w-6 h-6 flex items-center justify-center disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="icon-button-forensic w-6 h-6 flex items-center justify-center disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* GRID PATTERN OVERLAY */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
    </motion.div>
  );
}
