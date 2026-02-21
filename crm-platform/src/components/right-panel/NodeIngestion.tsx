'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Building2, User, Link2, MapPin,
  Sparkles, AlertTriangle, CheckCircle, ArrowRight, Loader2, Lock, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/uiStore';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { formatPhoneNumber } from '@/lib/formatPhone';
import { useQueryClient } from '@tanstack/react-query';

// REAL API ENRICHMENT
const enrichNode = async (identifier: string, type: 'ACCOUNT' | 'CONTACT') => {
  try {
    if (type === 'ACCOUNT') {
      const response = await fetch(`/api/apollo/company?domain=${encodeURIComponent(identifier)}`);
      if (!response.ok) return null;
      const data = await response.json();

      return {
        id: data.id,
        name: data.name,
        domain: data.domain,
        industry: data.industry,
        employees: data.employees,
        revenue: data.revenue,
        description: data.description, // Apollo returns short_description
        logo: data.logoUrl,
        address: data.address, // Full raw_address from Apollo
        city: data.city,
        state: data.state,
        country: data.country,
        zip: data.zip,
        phone: data.companyPhone, // Fixed: was data.phone, should be data.companyPhone
        linkedin: data.linkedin // Fixed: was data.linkedin_url, Apollo returns as 'linkedin'
      };
    } else {
      // For contacts, we try to match by email or linkedin url
      const body: any = {};
      if (identifier.includes('@')) {
        body.email = identifier;
      } else if (identifier.includes('linkedin.com')) {
        body.linkedinUrl = identifier;
      } else {
        // Fallback to name search if it's not email/url? 
        // For now, only support specific identifiers for precision
        return null;
      }

      const response = await fetch('/api/apollo/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) return null;
      const data = await response.json();

      if (data.contacts && data.contacts.length > 0) {
        const person = data.contacts[0];
        return {
          id: person.id,
          name: `${person.firstName} ${person.lastName}`.trim(),
          firstName: person.firstName,
          lastName: person.lastName,
          title: person.title,
          location: person.location,
          email: person.email,
          phone: person.phone,
          linkedin: person.linkedin_url,
          accountId: person.accountId,
          organization: person.organization
        };
      }
      return null;
    }
  } catch (error) {
    console.error('Enrichment error:', error);
    return null;
  }
};

export function NodeIngestion() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { rightPanelMode, setRightPanelMode, ingestionContext, setIngestionContext, ingestionIdentifier, setIngestionIdentifier, ingestionSignal, setIngestionSignal } = useUIStore();
  const type = rightPanelMode === 'INGEST_ACCOUNT' ? 'ACCOUNT' : 'CONTACT';
  const isRapidContactInjection = type === 'CONTACT' && !!ingestionContext?.accountId;

  const [step, setStep] = useState<'SIGNAL' | 'VERIFY' | 'COMMIT'>('SIGNAL');
  const [identifier, setIdentifier] = useState(ingestionIdentifier || '');
  const [isScanning, setIsScanning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isManual, setIsManual] = useState(false);

  // Auto-scan if identifier is pre-filled from external signal
  useEffect(() => {
    if (ingestionIdentifier && step === 'SIGNAL') {
      handleScan();
      // Clear after one-time use to prevent loops/stale data on next open
      setIngestionIdentifier(null);
    }
  }, [ingestionIdentifier]);

  const firstNameInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [entityName, setEntityName] = useState('');
  const [description, setDescription] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [revenue, setRevenue] = useState('');
  const [employees, setEmployees] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [nodeTopology, setNodeTopology] = useState<'PARENT' | 'SUBSIDIARY'>('PARENT');

  // Apollo Search & Enrichment State (Rapid Injection)
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Rapid Contact Injection: focus First Name when context is set
  useEffect(() => {
    if (isRapidContactInjection && step === 'SIGNAL') {
      const timer = setTimeout(() => firstNameInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isRapidContactInjection, step]);

  // Fetch account data for Apollo search context
  useEffect(() => {
    if (isRapidContactInjection && ingestionContext?.accountId) {
      const fetchAccountData = async () => {
        try {
          const { data, error } = await supabase
            .from('accounts')
            .select('name, website, industry')
            .eq('id', ingestionContext.accountId)
            .single();

          if (data && !error) {
            setAccountData(data);
          }
        } catch (err) {
          console.error('Error fetching account data:', err);
        }
      };
      fetchAccountData();
    }
  }, [isRapidContactInjection, ingestionContext?.accountId]);

  // Apollo Search: Debounced search when typing first name
  useEffect(() => {
    if (!isRapidContactInjection || !accountData || !firstName || firstName.length < 2) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setPotentialMatches([]);

      try {
        // Extract domain from website URL
        let domain = null;
        if (accountData.website) {
          try {
            const url = accountData.website.startsWith('http')
              ? accountData.website
              : `https://${accountData.website}`;
            domain = new URL(url).hostname.replace('www.', '');
          } catch (e) {
            console.error('Invalid website URL:', e);
          }
        }

        // Use Apollo mixed_people/search to find contacts
        const searchBody: any = {
          page: 1,
          per_page: 10,
          q_keywords: firstName // Search by first name
        };

        // Add company context if we have domain
        if (domain) {
          searchBody.q_organization_domains = [domain];
        } else if (accountData.name) {
          searchBody.q_organization_name = accountData.name;
        }

        const response = await fetch('/api/apollo/search-people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchBody)
        });

        if (response.ok) {
          const data = await response.json();
          const people = data.people || [];

          // Filter to matches where first name matches (case insensitive)
          const matches = people.filter((p: any) =>
            p.firstName?.toLowerCase() === firstName.toLowerCase()
          );

          // If we have lastName input, further filter by last name initial
          if (lastName && matches.length > 0) {
            const lastInitial = lastName.charAt(0).toLowerCase();
            const filteredByInitial = matches.filter((p: any) =>
              p.lastName?.charAt(0).toLowerCase() === lastInitial
            );

            if (filteredByInitial.length > 0) {
              setPotentialMatches(filteredByInitial);
              setShowVerifyModal(true);
            }
          } else if (matches.length > 0) {
            // Just first name - show all matches
            setPotentialMatches(matches);
            setShowVerifyModal(true);
          }
        }
      } catch (error) {
        console.error('Apollo search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 1200); // 1.2s debounce

    return () => clearTimeout(timer);
  }, [firstName, lastName, isRapidContactInjection, accountData]);

  // Handle match selection and enrichment
  const handleSelectMatch = async (match: any) => {
    setShowVerifyModal(false);
    setIsEnriching(true);

    try {
      // Enrich using the person's ID to reveal email
      const enrichBody = {
        contactIds: [match.id],
        revealEmails: true,
        revealPhones: false // Only enrich email, not phone
      };

      const response = await fetch('/api/apollo/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichBody)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.contacts && data.contacts.length > 0) {
          const contact = data.contacts[0];

          // Auto-populate all fields with enriched data
          setFirstName(contact.firstName || firstName);
          setLastName(contact.lastName || lastName);
          setTitle(contact.jobTitle || title);
          setEmail(contact.email || email);
          setCity(contact.city || city);
          setState(contact.state || state);

          toast.success(`Enriched ${contact.firstName} ${contact.lastName}`, {
            description: contact.email ? `Email: ${contact.email}` : contact.jobTitle
          });
        }
      }
    } catch (error) {
      console.error('Apollo enrichment error:', error);
      toast.error('Failed to enrich contact');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleScan = async () => {
    if (!identifier) return;
    setIsScanning(true);
    try {
      const data = await enrichNode(identifier, type);
      if (data) {
        setScanResult(data);
        setEntityName(data.name || '');
        setDescription(data.description || '');
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setTitle(data.title || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        setRevenue(data.revenue || '');
        setEmployees(data.employees || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setState(data.state || '');
        setStep('VERIFY');
        setIsManual(false);
      } else {
        setStep('VERIFY');
        setIsManual(true);
        setEntityName('');
      }
    } catch (e) {
      setIsManual(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      if (type === 'ACCOUNT') {
        // Build service_addresses array if we have address data
        const serviceAddresses = [];
        if (address || city || state) {
          serviceAddresses.push({
            address: address || '',
            city: city || '',
            state: state || '',
            country: scanResult?.country || '',
            type: 'headquarters',
            isPrimary: true
          });
        }

        // Build meters array with service address
        const meters = address ? [{
          id: crypto.randomUUID(),
          esiId: '',
          address: address,
          rate: '',
          endDate: ''
        }] : [];

        const { error } = await supabase.from('accounts').insert({
          id,
          name: entityName,
          domain: identifier.includes('.') ? identifier : scanResult?.domain,
          industry: scanResult?.industry,
          description: description || scanResult?.description,
          revenue: revenue,
          employees: parseInt(employees) || 0,
          address: address, // Populate uplink address
          city: city,
          state: state,
          country: scanResult?.country,
          service_addresses: serviceAddresses, // Save to service_addresses JSONB array
          logo_url: scanResult?.logo,
          phone: formatPhoneNumber(phone || scanResult?.phone) || null,
          linkedin_url: scanResult?.linkedin,
          status: 'active',
          metadata: {
            meters: meters // Save meter with service address to metadata
          },
          createdAt: now,
          updatedAt: now
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.from('contacts').insert({
          id,
          firstName: firstName,
          lastName: lastName,
          name: entityName || `${firstName} ${lastName}`.trim(),
          email: email,
          phone: formatPhoneNumber(phone) || null,
          title: title,
          linkedinUrl: identifier.includes('linkedin.com') ? identifier : scanResult?.linkedin,
          accountId: ingestionContext?.accountId ?? scanResult?.accountId,
          city: city,
          state: state,
          status: 'active',
          createdAt: now,
          updatedAt: now
        });

        if (error) throw error;
      }

      // If we initialized from an intelligence signal (Account), persist it to the News Vector
      if (type === 'ACCOUNT' && ingestionSignal) {
        try {
          const domainKey = identifier.includes('.') ? identifier : scanResult?.domain;
          if (domainKey) {
            await supabase.from('apollo_news_articles').upsert({
              domain: domainKey,
              apollo_article_id: ingestionSignal.id || crypto.randomUUID(),
              title: ingestionSignal.headline || '',
              url: ingestionSignal.source_url || null,
              source_domain: ingestionSignal.entity_domain || domainKey,
              snippet: ingestionSignal.summary || null,
              published_at: ingestionSignal.created_at || now,
              event_categories: ingestionSignal.signal_type ? [ingestionSignal.signal_type] : [],
              updated_at: now
            }, { onConflict: 'domain,apollo_article_id' });
          }
        } catch (e) {
          console.error('Failed to commit signal to news vector', e);
        }

        try {
          if (ingestionSignal.id) {
            await supabase.from('market_intelligence').update({
              crm_account_id: id,
              crm_match_type: 'exact_domain'
            }).eq('id', ingestionSignal.id);
            // Invalidate signals so the matrix updates automatically
            queryClient.invalidateQueries({ queryKey: ['market-recon-signals'] });
          }
        } catch (e) {
          console.error('Failed to update intelligence signal', e);
        }
      }

      toast.success(`${type} Node Initialized`, {
        description: `${entityName || firstName + ' ' + lastName} has been committed to the database.`,
        className: "bg-zinc-950 nodal-monolith-edge text-white font-mono",
      });

      // Invalidate queries to refresh the lists immediately
      if (type === 'ACCOUNT') {
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        router.push(`/network/accounts/${id}`);
      } else {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        if (ingestionContext?.accountId) {
          queryClient.invalidateQueries({ queryKey: ['account-contacts', ingestionContext.accountId] });
        }
        router.push(`/network/contacts/${id}`);
      }

      resetProtocol();
    } catch (error: any) {
      console.error('Commit error:', error);
      toast.error('Commit Failed', {
        description: error.message || 'An unknown error occurred.',
        className: "bg-zinc-950 nodal-monolith-edge border-red-500/50 text-white font-mono",
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const resetProtocol = () => {
    setRightPanelMode('DEFAULT');
    setIngestionContext(null);
    setIngestionSignal(null);
    setStep('SIGNAL');
    setIdentifier('');
    setScanResult(null);
    setIsManual(false);
    setEntityName('');
    setDescription('');
    setFirstName('');
    setLastName('');
    setTitle('');
    setEmail('');
    setPhone('');
    setRevenue('');
    setEmployees('');
    setAddress('');
    setCity('');
    setState('');
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden">

      {/* HEADER - Forensic Style */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 nodal-recessed">
        <div className="flex items-center gap-2">
          {type === 'ACCOUNT' ? <Building2 className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
          <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
            INITIALIZE_{type}_NODE
          </span>
        </div>
        <button onClick={resetProtocol} className="text-zinc-500 hover:text-white text-[10px] font-mono tracking-wider transition-colors">
          [ ESC ]
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <AnimatePresence mode="wait">

          {/* STEP 1: SIGNAL ACQUISITION (or Rapid Contact Injection with Context Lock) */}
          {step === 'SIGNAL' && (
            <motion.div
              key="signal"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {isRapidContactInjection ? (
                <>
                  <div className="space-y-2">
                    {/* Context Lock: contact hard-linked to this account */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/30">
                      <Lock className="w-4 h-4 text-white shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-widest truncate">
                        {ingestionContext?.accountName ?? 'Account'}
                      </span>
                    </div>

                    {/* Apollo Search/Enrichment Indicator */}
                    {(isSearching || isEnriching) && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <Loader2 className="w-3 h-3 text-emerald-500 shrink-0 animate-spin" />
                        <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">
                          {isSearching ? 'Searching Apollo...' : 'Enriching Email...'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">First Name</label>
                        <input
                          ref={firstNameInputRef}
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="First Name"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Last Name</label>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="Last Name"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Job Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="e.g. CEO, Energy Manager"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Email</label>
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Phone</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <Button
                      onClick={handleCommit}
                      disabled={isCommitting || (!firstName && !lastName)}
                      className="w-full bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold h-10 tracking-tight flex items-center justify-center gap-2"
                    >
                      {isCommitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          COMMITTING...
                        </>
                      ) : (
                        '[ COMMIT_NODE_TO_DB ]'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse" />
                    Signal Source
                  </label>
                  <div className="relative group">
                    <input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                      placeholder={type === 'ACCOUNT' ? "company.com" : "linkedin.com/in/..."}
                      className="w-full bg-black/40 nodal-monolith-edge rounded-lg p-4 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 outline-none transition-all"
                      autoFocus
                    />
                    <div className="absolute right-4 top-4">
                      {isScanning ? (
                        <div className="w-4 h-4 border-2 border-zinc-600 border-t-[#002FA7] rounded-full animate-spin" />
                      ) : (
                        <button onClick={handleScan} className="text-zinc-600 hover:text-[#002FA7] transition-colors">
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-600 pl-1">
                    Input vector required for probabilistic enrichment.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2: VERIFICATION & TOPOLOGY */}
          {step === 'VERIFY' && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* STATUS INDICATOR */}
              {isManual ? (
                <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-widest">
                      SIGNAL_LOST // DARK_NODE
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Target has no digital footprint.
                      <span className="text-amber-200/70 block mt-1">Initiating Manual Override Protocol.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#002FA7]/10 border border-[#002FA7]/30 p-3 rounded flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-white mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono text-white font-bold uppercase tracking-widest">
                      INTELLIGENCE_ACQUIRED
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Enrichment successful. Verify vector data below.
                    </div>
                  </div>
                </div>
              )}

              {/* DATA PAYLOAD */}
              <div className="space-y-4">
                {type === 'ACCOUNT' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Entity Name</label>
                      <input
                        value={entityName}
                        onChange={(e) => setEntityName(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="Legal Entity Name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="nodal-input w-full min-h-[60px] resize-none"
                        placeholder="Company overview..."
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">First Name</label>
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="First Name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Last Name</label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="Last Name"
                      />
                    </div>
                  </div>
                )}

                {type === 'CONTACT' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Job Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="e.g. CEO, Energy Manager"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Email</label>
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Phone</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="nodal-input w-full"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                  </>
                )}

                {type === 'ACCOUNT' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Revenue</label>
                      <input
                        value={revenue}
                        onChange={(e) => setRevenue(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="Unknown"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Headcount</label>
                      <input
                        value={employees}
                        onChange={(e) => setEmployees(e.target.value)}
                        className="nodal-input w-full"
                        placeholder="Unknown"
                      />
                    </div>
                  </div>
                )}

                {type === 'ACCOUNT' && (
                  <div className="pt-4 border-t border-white/5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-3">Node Topology</span>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button
                        onClick={() => setNodeTopology('PARENT')}
                        className={`text-xs font-mono py-2 rounded border transition-all ${nodeTopology === 'PARENT' ? 'bg-[#002FA7]/20 border-[#002FA7] text-white shadow-[0_0_10px_-3px_#002FA7]' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}
                      >
                        [ PARENT ]
                      </button>
                      <button
                        onClick={() => setNodeTopology('SUBSIDIARY')}
                        className={`text-xs font-mono py-2 rounded border transition-all ${nodeTopology === 'SUBSIDIARY' ? 'bg-[#002FA7]/20 border-[#002FA7] text-white shadow-[0_0_10px_-3px_#002FA7]' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}
                      >
                        [ SUBSIDIARY ]
                      </button>
                    </div>

                    {nodeTopology === 'SUBSIDIARY' && (
                      <div className="animate-in fade-in slide-in-from-top-2 p-3 bg-black/20 rounded border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 className="w-3 h-3 text-zinc-500" />
                          <span className="text-[10px] text-zinc-400 font-mono">LINK PARENT NODE</span>
                        </div>
                        <input
                          placeholder="Search existing database..."
                          className="w-full bg-transparent border-b border-white/10 text-xs font-mono text-white focus:border-[#002FA7] outline-none pb-1"
                        />
                      </div>
                    )}
                  </div>
                )}

                {type === 'ACCOUNT' && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Grid Coordinates</label>
                      {!isManual && (
                        <button className="text-[9px] font-mono text-white hover:text-zinc-300 transition-colors">
                          [ SYNC_HQ_ADDRESS ]
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600 group-focus-within:text-white transition-colors" />
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Service Address (Meter Location)"
                        className="w-full bg-black/40 nodal-monolith-edge rounded p-2 pl-10 text-xs font-mono text-white focus:border-[#002FA7] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER */}
              <div className="pt-6 mt-6 border-t border-white/10">
                <Button
                  onClick={handleCommit}
                  disabled={isCommitting || (type === 'ACCOUNT' ? !entityName : (!firstName && !lastName))}
                  className="w-full bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold h-10 tracking-tight flex items-center justify-center gap-2"
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      COMMITTING...
                    </>
                  ) : (
                    '[ COMMIT_NODE_TO_DB ]'
                  )}
                </Button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* VERIFICATION MODAL: Confirm Apollo Match */}
      <AnimatePresence>
        {showVerifyModal && potentialMatches.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => setShowVerifyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-950 nodal-monolith-edge rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono text-white uppercase tracking-widest">
                    Verify Match
                  </h3>
                  <button
                    onClick={() => setShowVerifyModal(false)}
                    className="icon-button-forensic w-8 h-8"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs font-mono text-zinc-400">
                  Found {potentialMatches.length} potential match{potentialMatches.length !== 1 ? 'es' : ''} for <span className="text-white">{firstName}</span> at <span className="text-white">{accountData?.name}</span>
                </p>

                <div className="space-y-2">
                  {potentialMatches.map((match, index) => (
                    <button
                      key={match.id || index}
                      onClick={() => handleSelectMatch(match)}
                      className="w-full p-4 rounded-xl nodal-monolith-edge bg-black/40 hover:bg-black/60 hover:border-[#002FA7]/50 transition-all text-left group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-mono text-white">
                              {match.firstName} {match.lastName}
                            </span>
                            {match.emailStatus === 'verified' && (
                              <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                            )}
                          </div>
                          {match.title && (
                            <p className="text-xs font-mono text-zinc-400 mb-1">
                              {match.title}
                            </p>
                          )}
                          {match.location && (
                            <p className="text-[10px] font-mono text-zinc-500">
                              {match.location}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-white shrink-0 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={() => setShowVerifyModal(false)}
                    className="w-full py-2 text-xs font-mono text-zinc-500 hover:text-white transition-colors"
                  >
                    [ CANCEL ]
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
