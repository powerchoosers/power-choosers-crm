'use client'
import { useState, useMemo } from 'react';
import { Users, Search, Lock, ShieldCheck, Loader2, ChevronLeft, ChevronRight, Globe, MapPin, Linkedin, Phone, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
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
  useMemo(() => {
    if (typeof window === 'undefined') return;
    
    const cacheKey = `apollo_cache_${domain || companyName}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const { company, contacts, timestamp } = JSON.parse(cached);
        // Cache valid for 24 hours
        if (Date.now() - timestamp < 1000 * 60 * 60 * 24) {
          setData(contacts);
          setCompanySummary(company);
          setScanStatus('complete');
        }
      } catch (e) {
        console.error('Failed to parse Apollo cache:', e);
      }
    }
  }, [domain, companyName]);

  const saveToCache = (company: ApolloCompany | null, contacts: ApolloContactRow[]) => {
    if (typeof window === 'undefined') return;
    const cacheKey = `apollo_cache_${domain || companyName}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      company,
      contacts,
      timestamp: Date.now()
    }));
  };

  const handleAcquire = async (person: ApolloContactRow) => {
    if (!accountId) {
      toast.error('No account ID provided for acquisition');
      return;
    }
    
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
          contactIds: [person.id],
          revealEmails: true,
          revealPhones: true,
          company: { name: companyName, domain: domain }
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

      // 2. Insert into Supabase
      const { error } = await supabase
        .from('contacts')
        .insert({
          name: enriched.fullName || person.name,
          first_name: enriched.firstName || person.firstName,
          last_name: enriched.lastName || person.lastName,
          title: enriched.jobTitle || person.title,
          email: enriched.email || person.email,
          accountId: accountId,
          companyName: companyName,
          status: 'Active',
          metadata: {
            source: 'Apollo Organizational Intelligence',
            acquired_at: new Date().toISOString(),
            original_apollo_data: enriched
          }
        });

      if (error) throw error;

      toast.success(`${person.name} revealed & synced`);
      
      // 3. Update local state
      setData(prev => prev.map(p => 
        p.id === person.id ? { 
          ...p, 
          isMonitored: true,
          name: enriched.fullName || p.name,
          firstName: enriched.firstName || p.firstName,
          lastName: enriched.lastName || p.lastName,
          email: enriched.email || p.email,
          title: enriched.jobTitle || p.title,
          linkedin: enriched.linkedin || p.linkedin,
          location: enriched.location || p.location,
          phones: enriched.phones?.map((ph: { number: string }) => ph.number) || p.phones
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

      // 2. Fetch Contacts
      const response = await fetch('/api/apollo/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          pages: { page: 0, size: 50 },
          filters: { 
            companies: { 
              include: domain ? { domains: [domain] } : { names: [companyName] }
            }
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch from Apollo');
      }

      const result: unknown = await response.json();
      const apolloContacts: unknown[] =
        isRecord(result) && Array.isArray(result.contacts) ? (result.contacts as unknown[]) : []

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

  const filteredData = useMemo(() => {
    return data.filter(person => 
      person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

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
          <Users className={cn("w-3.5 h-3.5", scanStatus === 'complete' ? "text-[#002FA7]" : "text-zinc-500")} />
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
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 group-focus-within:text-[#002FA7] transition-colors" />
            <input 
              type="text"
              placeholder="Search decision makers..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-black/40 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-[#002FA7]/50 transition-all placeholder:text-zinc-700"
            />
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 p-1">
        {/* STATE 1: IDLE */}
        {scanStatus === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-10 h-10 bg-zinc-800/30 rounded-full flex items-center justify-center mb-3 text-zinc-600 border border-white/5">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Target_Locked</h4>
            <p className="text-[9px] font-mono text-zinc-600 uppercase leading-relaxed mb-4">
              Apollo API gateway closed. Initiate scan to extract organizational hierarchy.
            </p>
            <Button 
              onClick={handleScan}
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-8 px-4 rounded-lg text-[10px] uppercase tracking-widest"
            >
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
                      className="w-10 h-10 rounded-2xl nodal-glass p-1 border border-white/10 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)] transition-all"
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
                      <h4 className="text-xs font-semibold text-white truncate">{companySummary.name}</h4>
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
                          className="flex items-center gap-1 text-[9px] font-mono text-[#002FA7] hover:text-white transition-colors uppercase tracking-widest"
                        >
                          <Phone className="w-2.5 h-2.5" />
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
                paginatedData.map((person, i) => (
                  <div 
                    key={i} 
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
                          <button 
                            onClick={() => handleAcquire(person)}
                          disabled={acquiringEmail === person.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-400 hover:text-white hover:border-[#002FA7] hover:bg-[#002FA7]/10 transition-all group/btn disabled:opacity-50 uppercase tracking-widest"
                          title="Reveal & Monitor"
                        >
                          {acquiringEmail === person.id ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-[#002FA7]" />
                          ) : (
                            <Lock className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-[#002FA7]" />
                          )}
                          Reveal
                        </button>
                        )}
                      </div>
                    </div>

                    {/* GATED DETAILS */}
                    {person.isMonitored ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 border-t border-white/5">
                        {person.email !== 'N/A' && (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400 uppercase tracking-tighter">
                            <Globe className="w-2.5 h-2.5 text-zinc-600" />
                            {person.email}
                          </div>
                        )}
                        {person.location && (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">
                            <MapPin className="w-2.5 h-2.5" />
                            {person.location}
                          </div>
                        )}
                        {person.phones && person.phones.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            {person.phones.map((phone, idx) => (
                              <button
                                key={idx}
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
