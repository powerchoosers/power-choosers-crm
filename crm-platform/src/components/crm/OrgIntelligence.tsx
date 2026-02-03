'use client'
import { useState, useMemo, useEffect } from 'react';
import { Users, Search, Lock, Unlock, ShieldCheck, Loader2, ChevronLeft, ChevronRight, Globe, MapPin, Linkedin, Phone, ExternalLink, ChevronDown, ChevronUp, Sparkles, Mail } from 'lucide-react';
import Image from 'next/image';
import { CompanyIcon } from '@/components/ui/CompanyIcon';
import { supabase } from '@/lib/supabase';
import { useCallStore } from '@/store/callStore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OrgIntelligenceProps {
  domain?: string;
  companyName?: string;
  website?: string;
  accountId?: string;
}

interface ApolloContactRow {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email: string;
  status: 'verified' | 'unverified';
  isMonitored?: boolean;
  location?: string;
  linkedin?: string;
  crmId?: string;
  phones?: string[];
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
  logoUrl?: string;
  linkedin?: string;
  companyPhone?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export default function OrgIntelligence({ domain: initialDomain, companyName, website, accountId }: OrgIntelligenceProps) {
  const [data, setData] = useState<ApolloContactRow[]>([]);
  const [companySummary, setCompanySummary] = useState<ApolloCompany | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [acquiringEmail, setAcquiringEmail] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const { initiateCall } = useCallStore();
  const CONTACTS_PER_PAGE = 5;

  const handleCompanyCall = (phone: string, name: string) => {
    initiateCall(phone, {
      name: name,
      account: name
    });
    toast.info(`Initiating call to ${name}...`);
  };

  const domain = useMemo(() => {
    if (initialDomain) return initialDomain;
    if (!website) return companyName?.toLowerCase().replace(/\s+/g, '') + '.com';
    try {
      let s = website.trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      const u = new URL(s);
      return (u.hostname || '').replace(/^www\./i, '');
    } catch (_) {
      return website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }, [initialDomain, website, companyName]);

  // Load cache on mount or when domain/company changes
  useEffect(() => {
    async function loadCache() {
      if (typeof window === 'undefined') return;
      
      // Clear current data immediately to prevent stale views when switching entities
      setData([]);
      setCompanySummary(null);
      setScanStatus('idle');
      setSearchTerm('');
      setCurrentPage(1);
      
      const key = domain || companyName;
      if (!key) return;

      // 1. Try Supabase first (Persistent Cloud Cache)
      try {
        const { data: supabaseData, error } = await supabase
          .from('apollo_searches')
          .select('data, created_at')
          .eq('key', key)
          .single();

        if (supabaseData && supabaseData.data) {
          const { company, contacts, timestamp } = supabaseData.data;
          setData(contacts);
          setCompanySummary(company);
          setScanStatus('complete');
          
          const cacheKey = `apollo_cache_${key}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            company,
            contacts,
            timestamp: timestamp || new Date(supabaseData.created_at).getTime()
          }));
          return;
        }
      } catch (err) {
        console.warn('Supabase cache fetch failed:', err);
      }

      // 2. Fallback to LocalStorage
      const cacheKey = `apollo_cache_${key}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const { company, contacts, timestamp } = parsed;
          if (Date.now() - timestamp < 1000 * 60 * 60 * 24) {
            setData(contacts);
            setCompanySummary(company);
            setScanStatus('complete');
            saveToSupabase(key, parsed);
            return;
          }
        } catch (e) {
          console.error('Failed to parse Apollo cache:', e);
        }
      }

      // If no cache, stay in idle mode so the user can trigger the scan manually
      setScanStatus('idle');
    }

    loadCache();
  }, [domain, companyName]);

  const handleEnrichAccount = async () => {
    if (!accountId || !companySummary) {
      toast.error('No account context or summary available for enrichment');
      return;
    }

    setScanStatus('scanning'); // This will trigger the blur overlay
    try {
      // Use the existing companySummary from Apollo to update the CRM account
      const { error } = await supabase
        .from('accounts')
        .update({
          industry: companySummary.industry,
          employees: companySummary.employees?.toString(),
          description: companySummary.description,
          location: [companySummary.city, companySummary.state].filter(Boolean).join(', '),
          address: [companySummary.city, companySummary.state, companySummary.country].filter(Boolean).join(', '),
          linkedinUrl: companySummary.linkedin,
          companyPhone: companySummary.companyPhone,
          metadata: {
            ...((companySummary as any).metadata || {}),
            apollo_enriched_at: new Date().toISOString(),
            apollo_raw_data: companySummary
          }
        })
        .eq('id', accountId);

      if (error) throw error;

      toast.success('DEEP_ENRICHMENT complete. Node profile updated.');
      
      // We don't have a direct way to trigger a refetch of useAccount from here 
      // without passing down a refetch function, but the user will see the 
      // success and can refresh or navigate. For now, we just show the success.
      
    } catch (err) {
      console.error('Enrichment Error:', err);
      toast.error('Enrichment failed. Verification required.');
    } finally {
      setScanStatus('complete');
    }
  };

  async function saveToSupabase(key: string, data: any) {
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

  const saveToCache = (company: ApolloCompany | null, contacts: ApolloContactRow[]) => {
    if (typeof window === 'undefined') return;
    
    const key = domain || companyName;
    if (!key) return;

    const cacheData = {
      company,
      contacts,
      timestamp: Date.now()
    };

    // Local Storage
    const cacheKey = `apollo_cache_${key}`;
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    
    // Supabase Persistence
    saveToSupabase(key, cacheData);
  };

  const handleAcquire = async (person: ApolloContactRow, type: 'email' | 'phone' | 'both' = 'both') => {
    if (!accountId) {
      toast.error('No account ID provided for acquisition');
      return;
    }
    
    const revealEmails = type === 'email' || type === 'both';
    const revealPhones = type === 'phone' || type === 'both';

    setAcquiringEmail(person.id);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 1. Reveal & Enrich (Consume Apollo Credits)
      const enrichResp = await fetch('/api/apollo/enrich', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          contacts: [person],
          revealEmails,
          revealPhones,
          company: { name: companySummary?.name || companyName, domain: domain }
        })
      });

      if (!enrichResp.ok) throw new Error('Enrichment failed');
      const enrichData = await enrichResp.json() as { 
        contacts?: Array<{
          fullName?: string;
          firstName?: string;
          lastName?: string;
          jobTitle?: string;
          email?: string;
          linkedin?: string;
          location?: string;
          phones?: Array<{ number: string }>;
        }>
      };
      const enriched = enrichData.contacts?.[0];

      if (!enriched) throw new Error('No enrichment data available');

      // 2. Insert or Update Supabase
      let crmId = person.crmId;
      
      const contactData = {
        name: enriched.fullName || person.name,
        first_name: enriched.firstName || person.firstName,
        last_name: enriched.lastName || person.lastName,
        title: enriched.jobTitle || person.title,
        email: enriched.email || person.email,
        accountId: accountId,
        company: companySummary?.name || companyName || domain,
        status: 'Active',
        metadata: {
          source: 'Apollo Organizational Intelligence',
          acquired_at: new Date().toISOString(),
          original_apollo_data: enriched
        }
      };

      if (crmId) {
        // Update existing
        const { error } = await supabase
          .from('contacts')
          .update(contactData)
          .eq('id', crmId);
        if (error) throw error;
      } else {
        // Check if email exists to avoid duplicates if not monitored
        if (contactData.email && contactData.email !== 'N/A') {
             const { data: existing } = await supabase
               .from('contacts')
               .select('id')
               .eq('email', contactData.email)
               .single();
             
             if (existing) {
                crmId = existing.id;
                const { error } = await supabase
                  .from('contacts')
                  .update(contactData)
                  .eq('id', crmId);
                if (error) throw error;
             } else {
                // Insert new
                const { data: newContact, error } = await supabase
                  .from('contacts')
                  .insert(contactData)
                  .select()
                  .single();
                if (error) throw error;
                crmId = newContact.id;
             }
        } else {
             // Fallback insert if no email (unlikely for valid contact but possible)
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
      toast.success(`${person.name} ${typeLabel} revealed & synced`);
      
      // 3. Update local state
      // Merge new phones with existing ones, avoiding duplicates
      const newPhones = enriched.phones?.map((ph: { number: string }) => ph.number) || [];
      const existingPhones = person.phones || [];
      const allPhones = Array.from(new Set([...existingPhones, ...newPhones]));

      setData(prev => prev.map(p => 
        p.id === person.id ? { 
          ...p, 
          isMonitored: true,
          crmId: crmId,
          name: enriched.fullName || p.name,
          firstName: enriched.firstName || p.firstName,
          lastName: enriched.lastName || p.lastName,
          email: enriched.email || p.email,
          title: enriched.jobTitle || p.title,
          linkedin: enriched.linkedin || p.linkedin,
          location: enriched.location || p.location,
          phones: allPhones
        } : p
      ));
    } catch (error) {
      console.error('Acquisition Error:', error);
      toast.error('Failed to reveal contact details');
    } finally {
      setAcquiringEmail(null);
    }
  };

  const handleScan = async () => {
    if (!companyName && !domain) {
      toast.error('No company context available for scan.');
      return;
    }

    setScanStatus('scanning');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 1. Fetch Company Summary
      let currentSummary: ApolloCompany | null = null;
      const summaryParams = new URLSearchParams();
      if (domain) summaryParams.append('domain', domain);
      if (companyName) summaryParams.append('company', companyName);
      
      try {
        const summaryResp = await fetch(`/api/apollo/company?${summaryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        
        if (summaryResp.ok) {
          currentSummary = await summaryResp.json();
          setCompanySummary(currentSummary);
        }
      } catch (err) {
        console.warn('Company summary fetch failed:', err);
      }

      // 2. Get Decision Makers (Initial Batch)
      const peopleResp = await fetch('/api/apollo/search-people', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          page: 1,
          per_page: 50,
          q_organization_domains: (initialDomain || website) ? domain : undefined,
          q_organization_name: companyName || undefined,
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

      // Extract all emails to check in Supabase
      const emailsToCheck = apolloContacts
        .map((c) => (isRecord(c) && typeof c.email === 'string' ? c.email : null))
        .filter(Boolean);

      let existingEmails = new Set<string>();

      if (emailsToCheck.length > 0) {
        const { data: existingContacts, error } = await supabase
          .from('contacts')
          .select('email')
          .in('email', emailsToCheck);
        
        if (!error && existingContacts) {
          existingEmails = new Set(existingContacts.map(c => c.email));
        }
      }
      
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
          const name = typeof contact.name === 'string' ? contact.name : ''
          if (!name) return null
          
          const id = typeof contact.id === 'string' ? contact.id : 
                     typeof contact.contactId === 'string' ? contact.contactId : 
                     typeof contact.person_id === 'string' ? contact.person_id : '';
          
          if (!id) return null;

          const firstName = typeof contact.first_name === 'string' ? contact.first_name : name.split(' ')[0]
          const lastName = typeof contact.last_name === 'string' ? contact.last_name : name.split(' ').slice(1).join(' ')
          const title = typeof contact.title === 'string' ? contact.title : undefined
          const email = typeof contact.email === 'string' ? contact.email : 'N/A'
          const emailStatus = typeof contact.email_status === 'string' ? contact.email_status : ''
          const status: ApolloContactRow['status'] = emailStatus === 'verified' ? 'verified' : 'unverified'
          const isMonitored = email !== 'N/A' && existingEmails.has(email)
          
          const location = [
            typeof contact.city === 'string' ? contact.city : null,
            typeof contact.state === 'string' ? contact.state : null
          ].filter(Boolean).join(', ')

          const linkedin = typeof contact.linkedin_url === 'string' ? contact.linkedin_url : undefined
          
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
            location,
            linkedin,
            phones
          }
        })
        .filter((v): v is ApolloContactRow => v !== null)

      setData(mappedData);
      setScanStatus('complete');
      
      // Save to cache
      saveToCache(currentSummary, mappedData);
    } catch (error) {
      console.error('Apollo Scan Error:', error);
      setScanStatus('idle');
      toast.error('Failed to connect to Apollo Intelligence. Verify API configuration.');
    }
  };

  const handleSearch = async () => {
    if (!searchTerm) {
      // If search is empty, just filter local data (or reset to initial scan if we want)
      return;
    }

    setScanStatus('scanning');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/apollo/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          pages: { page: 0, size: 50 },
          filters: { 
            person_name: searchTerm,
            companies: { 
              include: domain ? { domains: [domain] } : { names: [companyName] }
            }
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to search Apollo');
      }

      const result: unknown = await response.json();
      
      // The search-people endpoint used here (contacts.js) returns { contacts: [...] }
      // But let's check for both just in case
      const apolloContacts: unknown[] =
        isRecord(result) 
          ? (Array.isArray(result.contacts) ? (result.contacts as unknown[]) : (Array.isArray(result.people) ? (result.people as unknown[]) : []))
          : []

      // Extract all emails to check in Supabase
      const emailsToCheck = apolloContacts
        .map((c) => (isRecord(c) && typeof c.email === 'string' ? c.email : null))
        .filter(Boolean);

      let existingEmails = new Set<string>();

      if (emailsToCheck.length > 0) {
        const { data: existingContacts, error } = await supabase
          .from('contacts')
          .select('email')
          .in('email', emailsToCheck);
        
        if (!error && existingContacts) {
          existingEmails = new Set(existingContacts.map(c => c.email));
        }
      }

      // Map Apollo results
      const mappedData: ApolloContactRow[] = apolloContacts
        .map((contact): ApolloContactRow | null => {
          if (!isRecord(contact)) return null
          const name = typeof contact.name === 'string' ? contact.name : ''
          if (!name) return null
          
          const id = typeof contact.id === 'string' ? contact.id : 
                     typeof contact.contactId === 'string' ? contact.contactId : 
                     typeof contact.person_id === 'string' ? contact.person_id : '';
          
          if (!id) return null;

          const firstName = typeof contact.first_name === 'string' ? contact.first_name : name.split(' ')[0]
          const lastName = typeof contact.last_name === 'string' ? contact.last_name : name.split(' ').slice(1).join(' ')
          const title = typeof contact.title === 'string' ? contact.title : undefined
          const email = typeof contact.email === 'string' ? contact.email : 'N/A'
          const emailStatus = typeof contact.email_status === 'string' ? contact.email_status : ''
          const status: ApolloContactRow['status'] = emailStatus === 'verified' ? 'verified' : 'unverified'
          const isMonitored = email !== 'N/A' && existingEmails.has(email)
          
          const location = [
            typeof contact.city === 'string' ? contact.city : null,
            typeof contact.state === 'string' ? contact.state : null
          ].filter(Boolean).join(', ')

          const linkedin = typeof contact.linkedin_url === 'string' ? contact.linkedin_url : undefined
          
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
            location,
            linkedin,
            phones
          }
        })
        .filter((v): v is ApolloContactRow => v !== null)

      setData(mappedData);
      setScanStatus('complete');
      setCurrentPage(1);
      
      // MERGE & SAVE STRATEGY
      // 1. Get current cache (to avoid losing existing contacts)
      const key = domain || companyName;
      let existingContacts: ApolloContactRow[] = [];
      
      // Try local storage first for speed (since we sync it on load)
      const cacheKey = `apollo_cache_${key}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          existingContacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
        } catch (e) {}
      }
      
      // 2. Merge new results into existing
      const existingIds = new Set(existingContacts.map(c => c.id));
      const newContacts = mappedData.filter(c => !existingIds.has(c.id));
      const mergedContacts = [...existingContacts, ...newContacts];
      
      // 3. Save merged list
      if (newContacts.length > 0) {
        saveToCache(companySummary, mergedContacts);
      }
      
    } catch (error) {
      console.error('Apollo Search Error:', error);
      setScanStatus('complete'); // Go back to complete so user can try again
      toast.error('Search failed. Please try again.');
    }
  };

  const filteredData = useMemo(() => {
    // If we just searched via API, data is already filtered.
    // But if we are in "browse" mode, we might want to filter locally too?
    // Actually, if we search via API, `data` contains the search results.
    // If we haven't searched (browsing), `data` contains the browse results.
    // The previous logic was ONLY local filtering.
    // Now we want `searchTerm` to trigger API search on Enter.
    // So we should probably remove the local filtering if we are using API search.
    // But for now, let's keep local filtering as a fallback or for refining results?
    // No, if I search "John", I get Johns. If I type "Director" in the box...
    // The user expects the search box to SEARCH APOLLO.
    
    // So I will remove the local filter dependency on searchTerm if I use it for API search.
    // OR, I can use a separate state for "local filter" vs "api search term".
    // Let's assume the input is for API search.
    return data; 
  }, [data]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * CONTACTS_PER_PAGE;
    return filteredData.slice(start, start + CONTACTS_PER_PAGE);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / CONTACTS_PER_PAGE);

  return (
    <div className="relative overflow-hidden rounded-3xl transition-all duration-300 bg-zinc-900/40 border border-white/5 backdrop-blur-xl flex flex-col min-h-[400px]">
      
      {/* HEADER - Status & Controls */}
      <div className="p-4 pb-2 flex justify-between items-center border-b border-white/5 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Users className={cn("w-3.5 h-3.5", scanStatus === 'complete' ? "text-white" : "text-zinc-500")} />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            {scanStatus === 'scanning' ? 'Scanning...' : `Target_Pool [${filteredData.length}]`}
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
                className="w-full bg-black/40 border border-white/5 rounded-lg pl-8 pr-16 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-[#002FA7]/50 transition-all placeholder:text-zinc-700"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && (
                  <button
                    onClick={handleSearch}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-[#002FA7] transition-colors"
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
                className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-mono text-white transition-all flex items-center gap-1.5 group uppercase tracking-widest whitespace-nowrap"
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
        {/* Blur Overlay for Enrichment Scanning */}
        {scanStatus === 'scanning' && data.length > 0 && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in duration-300 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl border border-white/20 bg-zinc-900/50 flex items-center justify-center">
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
            <div className="w-10 h-10 bg-zinc-800/30 rounded-2xl flex items-center justify-center mb-3 text-zinc-600 border border-white/5">
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
              <div className="px-3 py-3 border-b border-white/5 bg-white/5 rounded-xl mx-1 mt-1 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="relative group/logo">
                    <CompanyIcon
                      logoUrl={companySummary.logoUrl}
                      domain={companySummary.domain}
                      name={companySummary.name}
                      size={40}
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-white truncate">{companySummary.name}</h4>
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
                      {companySummary.industry || 'Enterprise'} • {companySummary.employees || '0-50'} Emp
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {(companySummary.city || companySummary.state) && (
                        <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                          <MapPin className="w-2.5 h-2.5" />
                          {[companySummary.city, companySummary.state].filter(Boolean).join(', ')}
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

            {/* CONTACTS LIST */}
            <div className="space-y-1 px-1">
              {paginatedData.length > 0 ? (
                paginatedData.map((person) => (
                  <div 
                    key={person.id} 
                    className="group flex flex-col p-2.5 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col min-w-0 flex-1 mr-2">
                        <span className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                          {person.isMonitored 
                            ? person.name 
                            : `${person.firstName} ${person.lastName?.charAt(0) || ''}.`
                          }
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 truncate uppercase tracking-tighter">
                          {person.title || 'Nodal Analyst'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {person.isMonitored ? (
                          <>
                            {person.linkedin && (
                              <a 
                                href={person.linkedin} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="icon-button-forensic w-7 h-7 flex items-center justify-center"
                              >
                                <Linkedin className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <div className="flex items-center gap-1 text-green-500 text-[8px] font-mono uppercase tracking-widest bg-green-500/10 px-1.5 py-1 rounded-md border border-green-500/20">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Synced
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleAcquire(person, 'email')}
                              disabled={acquiringEmail === person.id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-400 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10 transition-all group/btn disabled:opacity-50 uppercase tracking-widest"
                              title="Reveal Email"
                            >
                              {acquiringEmail === person.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-[#002FA7]" />
                              ) : (
                                <Mail className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-[#002FA7]" />
                              )}
                              Email
                            </button>
                            <button 
                              onClick={() => handleAcquire(person, 'phone')}
                              disabled={acquiringEmail === person.id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-400 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10 transition-all group/btn disabled:opacity-50 uppercase tracking-widest"
                              title="Reveal Phone"
                            >
                              {acquiringEmail === person.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-[#002FA7]" />
                              ) : (
                                <Phone className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-[#002FA7]" />
                              )}
                              Phone
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* GATED DETAILS */}
                    {person.isMonitored ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 border-t border-white/5">
                        {person.email !== 'N/A' ? (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400 uppercase tracking-tighter">
                            <Globe className="w-2.5 h-2.5 text-zinc-600" />
                            {person.email}
                          </div>
                        ) : (
                           <button 
                              onClick={() => handleAcquire(person, 'email')}
                              disabled={acquiringEmail === person.id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-400 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10 transition-all group/btn disabled:opacity-50 uppercase tracking-widest"
                              title="Reveal Email"
                            >
                              {acquiringEmail === person.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-[#002FA7]" />
                              ) : (
                                <Mail className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-[#002FA7]" />
                              )}
                              Email
                            </button>
                        )}
                        {person.location && (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">
                            <MapPin className="w-2.5 h-2.5" />
                            {person.location}
                          </div>
                        )}
                        {person.phones && person.phones.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {person.phones.map((phone) => (
                              <button
                                key={phone}
                                onClick={() => {
                                  initiateCall(phone, {
                                    name: person.name,
                                    account: companyName,
                                    title: person.title
                                  });
                                  toast.info(`Calling ${person.name}...`);
                                }}
                                className="flex items-center gap-1 text-[9px] font-mono text-[#002FA7] hover:text-white transition-colors uppercase tracking-widest"
                              >
                                <Phone className="w-2.5 h-2.5" />
                                {phone}
                              </button>
                            ))}
                          </div>
                        ) : (
                            <button 
                              onClick={() => handleAcquire(person, 'phone')}
                              disabled={acquiringEmail === person.id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-400 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10 transition-all group/btn disabled:opacity-50 uppercase tracking-widest"
                              title="Reveal Phone"
                            >
                              {acquiringEmail === person.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-[#002FA7]" />
                              ) : (
                                <Phone className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-[#002FA7]" />
                              )}
                              Phone
                            </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 opacity-40 select-none pointer-events-none">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                          <Globe className="w-2.5 h-2.5" />
                          ••••••••••••
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                          <Phone className="w-2.5 h-2.5" />
                          ••••••••••••
                        </div>
                      </div>
                    )}
                  </div>
                ))
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
                  <div className="w-1 h-1 rounded-full bg-zinc-800" />
                  <span>Synced: <span className="text-zinc-400 tabular-nums">{data.filter(d => d.isMonitored).length}</span></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: PAGINATION & STATS (Sync_Block Protocol) */}
      {scanStatus === 'complete' && (
        <div className="mt-auto p-3 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-widest bg-zinc-900/50">
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
    </div>
  );
}
