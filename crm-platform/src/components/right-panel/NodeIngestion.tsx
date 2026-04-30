'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Building2, User, MapPin,
  Target, AlertTriangle, CheckCircle, ArrowRight, Loader2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/uiStore';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { ensureFreshSupabaseSession, getFreshSupabaseAccessToken } from '@/lib/auth/supabase-session';
import { useRouter } from 'next/navigation';
import { formatPhoneNumber } from '@/lib/formatPhone';
import { useQueryClient } from '@tanstack/react-query';
import { CompanyIcon } from '@/components/ui/CompanyIcon';
import { ForensicClose } from '@/components/ui/ForensicClose';
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme';
import { headcountMetadata, parseHeadcount } from '@/lib/headcount';

// REAL API ENRICHMENT
const getApolloAuthHeaders = async (includeContentType: boolean = false): Promise<Record<string, string>> => {
  const token = await getFreshSupabaseAccessToken();
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const resolveCurrentOwnerId = async (): Promise<string | null> => {
  const session = await ensureFreshSupabaseSession();
  return session?.user?.email?.toLowerCase() || null;
};

const enrichNode = async (identifier: string, type: 'ACCOUNT' | 'CONTACT') => {
  const authHeaders = await getApolloAuthHeaders();
  try {
    if (type === 'ACCOUNT') {
      const response = await fetch(`/api/apollo/company?domain=${encodeURIComponent(identifier)}`, { headers: authHeaders });
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
        logoUrl: data.logoUrl,
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
        headers: await getApolloAuthHeaders(true),
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
  const [identifier, setIdentifier] = useState(type === 'CONTACT' && ingestionIdentifier ? ingestionIdentifier : '');
  const [isScanning, setIsScanning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isManual, setIsManual] = useState(false);

  // Auto-scan if identifier is pre-filled from external signal
  useEffect(() => {
    if (ingestionIdentifier && step === 'SIGNAL') {
      if (type === 'ACCOUNT') {
        handleSmartSearch();
      } else {
        handleScan();
      }
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
  const [mobile, setMobile] = useState('');
  const [workDirect, setWorkDirect] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [revenue, setRevenue] = useState('');
  const [employees, setEmployees] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isExistingRecord, setIsExistingRecord] = useState(false);

  // Apollo Search & Enrichment State (Rapid Injection)
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Account Name Search State
  const [accountSearchQuery, setAccountSearchQuery] = useState(type === 'ACCOUNT' && ingestionIdentifier ? ingestionIdentifier : '');
  const [isSearchingName, setIsSearchingName] = useState(false);
  const [accountSearchResults, setAccountSearchResults] = useState<any[]>([]);

  // Rapid Contact Injection: focus First Name when context is set
  useEffect(() => {
    if (isRapidContactInjection && step === 'SIGNAL') {
      const timer = setTimeout(() => firstNameInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isRapidContactInjection, step]);

  // Duplicate check: flag isExistingRecord when we enter VERIFY step
  useEffect(() => {
    if (step !== 'VERIFY') return;
    const checkDuplicate = async () => {
      if (type === 'ACCOUNT') {
        const domainKey = identifier.includes('.') ? identifier : scanResult?.domain;
        if (domainKey) {
          const { data } = await supabase.from('accounts').select('id').eq('domain', domainKey).maybeSingle();
          if (data) { setIsExistingRecord(true); return; }
        }
        if (entityName) {
          const { data } = await supabase.from('accounts').select('id').ilike('name', entityName).maybeSingle();
          if (data) { setIsExistingRecord(true); return; }
        }
      } else {
        if (email) {
          const { data } = await supabase.from('contacts').select('id').eq('email', email).maybeSingle();
          if (data) { setIsExistingRecord(true); return; }
        }
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) {
          const { data } = await supabase.from('contacts').select('id').ilike('name', fullName).maybeSingle();
          if (data) { setIsExistingRecord(true); return; }
        }
      }
      setIsExistingRecord(false);
    };
    checkDuplicate();
  }, [step]);

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
          headers: await getApolloAuthHeaders(true),
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
        headers: await getApolloAuthHeaders(true),
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
        setMobile(data.phone || '');
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

  const handleSmartSearch = async () => {
    const query = accountSearchQuery.trim();
    if (!query) return;

    // Domain detection: no spaces, contains a dot, TLD at least 2 chars
    const isDomain = /^[^\s]+\.[^\s]{2,}$/.test(query) && !query.includes(' ');

    if (isDomain) {
      // Domain path: enrich directly and advance to VERIFY
      setIdentifier(query);
      setIsScanning(true);
      try {
        const data = await enrichNode(query, 'ACCOUNT');
        if (data) {
          setScanResult(data);
          setEntityName(data.name || '');
          setDescription(data.description || '');
          setPhone(data.phone || '');
          setRevenue(data.revenue || '');
          setEmployees(data.employees || '');
          setAddress(data.address || '');
          setCity(data.city || '');
          setState(data.state || '');
          setIsManual(false);
        } else {
          setIsManual(true);
          setEntityName('');
        }
        setStep('VERIFY');
      } catch (e) {
        setIsManual(true);
        setStep('VERIFY');
      } finally {
        setIsScanning(false);
      }
    } else {
      // Name path: search Apollo, show results or auto-advance if empty
      setIsSearchingName(true);
      setAccountSearchResults([]);
      try {
        const response = await fetch('/api/apollo/search-organizations', {
          method: 'POST',
          headers: await getApolloAuthHeaders(true),
          body: JSON.stringify({ q_organization_name: query, per_page: 5 })
        });
        if (response.ok) {
          const data = await response.json();
          const results = data.organizations || [];
          if (results.length === 0) {
            setEntityName(query);
            setIsManual(true);
            setStep('VERIFY');
          } else {
            setAccountSearchResults(results);
          }
        } else {
          setEntityName(query);
          setIsManual(true);
          setStep('VERIFY');
        }
      } catch (error) {
        console.error('Failed to search organizations by name:', error);
        setEntityName(query);
        setIsManual(true);
        setStep('VERIFY');
      } finally {
        setIsSearchingName(false);
      }
    }
  };

  const handleSelectOrganization = (org: any) => {
    setScanResult(org);
    setEntityName(org.name || '');
    setDescription(org.description || '');
    setPhone(org.phone || '');
    setRevenue(''); // Apollo mixed_companies doesn't usually return exact revenue directly
    setEmployees(org.employees ? String(org.employees) : '');
    setAddress(org.location || '');

    // Attempt to parse city/state from location string if it exists
    if (org.location) {
      const parts = org.location.split(',').map((p: string) => p.trim());
      if (parts.length >= 2) {
        setCity(parts[0]);
        setState(parts[1].split(' ')[0]); // try to grab state abbreviation before zip
      } else {
        setCity(org.location);
      }
    }

    setIdentifier(org.domain || ''); // Sets the identifier so it saves correctly
    setStep('VERIFY');
    setIsManual(false);
  };

  const handleManualFallback = () => {
    setEntityName(accountSearchQuery);
    setStep('VERIFY');
    setIsManual(true);
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      await ensureFreshSupabaseSession(true);
      const now = new Date().toISOString();
      const currentOwnerId = await resolveCurrentOwnerId();

      if (type === 'ACCOUNT') {
        const domainKey = identifier.includes('.') ? identifier : scanResult?.domain;

        // --- DUPLICATE CHECK: domain first, then name ---
        let existingAccount: { id: string; ownerId?: string | null; metadata?: Record<string, any> | null } | null = null;
        if (domainKey) {
          const { data } = await supabase.from('accounts').select('id, ownerId, metadata').eq('domain', domainKey).maybeSingle();
          if (data) existingAccount = data;
        }
        if (!existingAccount && entityName) {
          const { data } = await supabase.from('accounts').select('id, ownerId, metadata').ilike('name', entityName).maybeSingle();
          if (data) existingAccount = data;
        }

        const existingId = existingAccount?.id ?? null;
        const id = existingId || crypto.randomUUID();

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
        const parsedHeadcount = parseHeadcount(employees);

        const payload = {
          name: entityName,
          domain: domainKey,
          industry: scanResult?.industry,
          description: description || scanResult?.description,
          revenue: revenue,
          employees: parsedHeadcount.value,
          address: address,
          city: city,
          state: state,
          country: scanResult?.country,
          service_addresses: serviceAddresses,
          logo_url: scanResult?.logoUrl || scanResult?.logo,
          phone: formatPhoneNumber(phone || scanResult?.phone) || null,
          linkedin_url: scanResult?.linkedin,
          ownerId: currentOwnerId,
          status: 'active',
          metadata: {
            meters: meters,
            ...headcountMetadata(parsedHeadcount, 'node_ingestion')
          },
          updatedAt: now,
        };

        if (existingId) {
          // Only update fields that are actually set — never overwrite existing data with empty form values
          const enrichUpdate: Record<string, any> = { status: 'active', updatedAt: now };
          const existingOwnerId = String(existingAccount?.ownerId || '').trim();
          if (entityName) enrichUpdate.name = entityName;
          if (domainKey) enrichUpdate.domain = domainKey;
          if (scanResult?.industry) enrichUpdate.industry = scanResult.industry;
          const desc = description || scanResult?.description;
          if (desc) enrichUpdate.description = desc;
          if (revenue) enrichUpdate.revenue = revenue;
          if (parsedHeadcount.value !== null) enrichUpdate.employees = parsedHeadcount.value;
          if (address) enrichUpdate.address = address;
          if (city) enrichUpdate.city = city;
          if (state) enrichUpdate.state = state;
          if (scanResult?.country) enrichUpdate.country = scanResult.country;
          if (serviceAddresses.length > 0) enrichUpdate.service_addresses = serviceAddresses;
          const logo = scanResult?.logoUrl || scanResult?.logo;
          if (logo) enrichUpdate.logo_url = logo;
          const ph = formatPhoneNumber(phone || scanResult?.phone);
          if (ph) enrichUpdate.phone = ph;
          if (scanResult?.linkedin) enrichUpdate.linkedin_url = scanResult.linkedin;
          if (meters.length > 0 || parsedHeadcount.value !== null) {
            const existingMetadata = existingAccount?.metadata && typeof existingAccount.metadata === 'object'
              ? existingAccount.metadata
              : {};
            enrichUpdate.metadata = {
              ...existingMetadata,
              ...(meters.length > 0 ? { meters } : {}),
              ...headcountMetadata(parsedHeadcount, 'node_ingestion')
            };
          }
          if (!existingOwnerId && currentOwnerId) enrichUpdate.ownerId = currentOwnerId;
          const { error } = await supabase.from('accounts').update(enrichUpdate).eq('id', existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('accounts').insert({ id, ...payload, createdAt: now });
          if (error) throw error;
        }

        // Link intelligence signal regardless of new/existing
        if (ingestionSignal) {
          try {
            await fetch('/api/intelligence/link-signal', {
              method: 'POST',
              headers: await getApolloAuthHeaders(true),
              body: JSON.stringify({ signal: ingestionSignal, accountId: id, domainKey: domainKey || '' })
            });
            queryClient.invalidateQueries({ queryKey: ['market-recon-signals'] });
          } catch (e) {
            console.error('Failed to link intelligence signal', e);
          }
        }

        toast.success(existingId ? 'Account Node Enriched' : 'Account Node Initialized', {
          description: existingId
            ? `${entityName} already exists — record enriched with latest intelligence.`
            : `${entityName} has been committed to the database.`,
          className: "bg-zinc-950 nodal-monolith-edge text-white font-mono",
        });

        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        router.push(`/network/accounts/${id}`);

      } else {
        // --- DUPLICATE CHECK: email first, then full name ---
        let existingContact: { id: string; ownerId?: string | null } | null = null;
        if (email) {
          const { data } = await supabase.from('contacts').select('id, ownerId').eq('email', email).maybeSingle();
          if (data) existingContact = data;
        }
        const trimmedFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        if (!existingContact && trimmedFullName) {
          const { data } = await supabase.from('contacts').select('id, ownerId')
            .ilike('name', trimmedFullName)
            .maybeSingle();
          if (data) existingContact = data;
        }

        const existingId = existingContact?.id ?? null;
        const id = existingId || crypto.randomUUID();

        const fName = firstName.trim();
        const lName = lastName.trim();
        const fullName = (entityName || `${fName} ${lName}`).trim();

        if (existingId) {
          // Only update fields that are actually set — never overwrite existing data with empty form values
          const enrichUpdate: Record<string, any> = { status: 'active', updatedAt: now };
          const existingOwnerId = String(existingContact?.ownerId || '').trim();
          if (fName) enrichUpdate.firstName = fName;
          if (lName) enrichUpdate.lastName = lName;
          if (fullName) enrichUpdate.name = fullName;
          if (email) enrichUpdate.email = email;
          const mob = formatPhoneNumber(mobile);
          if (mob) enrichUpdate.mobile = mob;
          const wd = formatPhoneNumber(workDirect);
          if (wd) enrichUpdate.workPhone = wd;
          const other = formatPhoneNumber(otherPhone);
          if (other) enrichUpdate.otherPhone = other;
          if (title) enrichUpdate.title = title;
          if (identifier.includes('linkedin.com')) enrichUpdate.linkedinUrl = identifier;
          else if (scanResult?.linkedin) enrichUpdate.linkedinUrl = scanResult.linkedin;
          if (city) enrichUpdate.city = city;
          if (state) enrichUpdate.state = state;
          if (!existingOwnerId && currentOwnerId) enrichUpdate.ownerId = currentOwnerId;
          const { error } = await supabase.from('contacts').update(enrichUpdate).eq('id', existingId);
          if (error) throw error;
        } else {
          // For new contacts, include all provided fields + accountId link
          const insertPayload = {
            id,
            firstName: fName,
            lastName: lName,
            name: fullName,
            email,
            mobile: formatPhoneNumber(mobile) || null,
            workPhone: formatPhoneNumber(workDirect) || null,
            otherPhone: formatPhoneNumber(otherPhone) || null,
            title,
            linkedinUrl: identifier.includes('linkedin.com') ? identifier : (scanResult?.linkedin || null),
            city,
            state,
            ownerId: currentOwnerId,
            status: 'active',
            accountId: ingestionContext?.accountId || null,
            createdAt: now,
            updatedAt: now,
          };
          const { error } = await supabase.from('contacts').insert(insertPayload);
          if (error) throw error;
        }

        const displayName = fullName || fName || lName;
        toast.success(existingId ? 'Contact Node Enriched' : 'Contact Node Initialized', {
          description: existingId
            ? `${displayName} already exists — record enriched with latest intelligence.`
            : `${displayName} has been committed to the database.`,
          className: "bg-zinc-950 nodal-monolith-edge text-white font-mono",
        });

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
    setIsExistingRecord(false);
    setAccountSearchQuery('');
    setAccountSearchResults([]);
    setScanResult(null);
    setIsManual(false);
    setEntityName('');
    setDescription('');
    setFirstName('');
    setLastName('');
    setTitle('');
    setEmail('');
    setPhone('');
    setMobile('');
    setWorkDirect('');
    setOtherPhone('');
    setRevenue('');
    setEmployees('');
    setAddress('');
    setCity('');
    setState('');
  };

  useEscClose(() => resetProtocol(), showVerifyModal);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
      className={panelTheme.shell}
    >

      {/* HEADER - Forensic Style */}
      <div className={panelTheme.header}>
        <div className={panelTheme.headerTitleWrap}>
          <div className="h-8 w-8 rounded-lg bg-[#002FA7]/40 border border-[#002FA7]/60 flex items-center justify-center">
            {type === 'ACCOUNT' ? <Building2 className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
          </div>
          <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
            INITIALIZE_{type}_NODE
          </span>
        </div>
        <ForensicClose onClick={resetProtocol} size={16} />
      </div>

      <div className={panelTheme.body}>
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
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                      Node_Context
                    </div>
                    <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center gap-4 mb-4">
                      <CompanyIcon
                        logoUrl={ingestionContext?.accountLogoUrl}
                        domain={ingestionContext?.accountDomain}
                        name={ingestionContext?.accountName || 'Account'}
                        size={40}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Account</span>
                        <span className="text-sm font-semibold text-white truncate">{ingestionContext?.accountName || 'Unlabeled Node'}</span>
                      </div>
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
                          className={panelTheme.field}
                          placeholder="First Name"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Last Name</label>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={panelTheme.field}
                          placeholder="Last Name"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Job Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={panelTheme.field}
                        placeholder="e.g. CEO, Energy Manager"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Email</label>
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={panelTheme.field}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Mobile</label>
                        <input
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Work Direct</label>
                        <input
                          value={workDirect}
                          onChange={(e) => setWorkDirect(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Other</label>
                        <input
                          value={otherPhone}
                          onChange={(e) => setOtherPhone(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <Button
                      onClick={handleCommit}
                      disabled={isCommitting || (!firstName.trim() && !lastName.trim())}
                      className={panelTheme.cta}
                    >
                      {isCommitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          COMMITTING...
                        </>
                      ) : isExistingRecord ? (
                        '[ ENRICH_EXISTING_NODE ]'
                      ) : (
                        '[ COMMIT_NODE_TO_DB ]'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {type === 'ACCOUNT' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse" />
                          Signal Source
                        </label>
                        <div className="relative group">
                          <input
                            value={accountSearchQuery}
                            onChange={(e) => {
                              setAccountSearchQuery(e.target.value);
                              if (accountSearchResults.length > 0) setAccountSearchResults([]);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSmartSearch()}
                            placeholder="company.com or Company Name"
                            className={panelTheme.field}
                            autoFocus
                          />
                          <div className="absolute right-3 inset-y-0 flex items-center">
                            {isScanning || isSearchingName ? (
                              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-[#002FA7] rounded-full animate-spin" />
                            ) : (
                              <button onClick={handleSmartSearch} className="text-zinc-600 hover:text-[#002FA7] transition-colors">
                                <Search className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-600 pl-1">
                          Enter a domain for direct enrichment, or a company name to search.
                        </p>
                      </div>

                      {accountSearchResults.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono text-zinc-500 uppercase">Suggested Targets</label>
                          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                            {accountSearchResults.map((org: any) => (
                              <button
                                key={org.id}
                                onClick={() => handleSelectOrganization(org)}
                                className="w-full text-left bg-zinc-900 border border-white/5 hover:border-[#002FA7]/50 rounded-lg p-3 transition-colors group"
                              >
                                <div className="flex items-start gap-3">
                                  <CompanyIcon
                                    logoUrl={org.logoUrl}
                                    domain={org.domain}
                                    name={org.name}
                                    size={40}
                                    roundedClassName="rounded-lg"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-sm font-semibold truncate group-hover:text-blue-400 transition-colors">
                                        {org.name}
                                      </h4>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                                      <span className="truncate max-w-[120px]">{org.domain}</span>
                                      <span>•</span>
                                      <span className="truncate">{org.industry || 'Unknown Sector'}</span>
                                    </div>
                                    {org.location && (
                                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-zinc-600">
                                        <MapPin className="w-3 h-3" />
                                        <span className="truncate">{org.location}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                            <Button
                              onClick={handleManualFallback}
                              className="w-full bg-transparent border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 font-mono text-xs h-10"
                            >
                              [ PROCEED_WITHOUT_DIGITAL_FOOTPRINT ]
                            </Button>
                          </div>
                        </div>
                      )}
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
                          placeholder="linkedin.com/in/..."
                          className={panelTheme.field}
                          autoFocus
                        />
                        <div className="absolute right-3 inset-y-0 flex items-center">
                          {isScanning ? (
                            <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-[#002FA7] rounded-full animate-spin" />
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
                  <Target className="w-4 h-4 text-white mt-0.5" />
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
                        className={panelTheme.field}
                        placeholder="Legal Entity Name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={`${panelTheme.textarea} min-h-[60px]`}
                        placeholder="Company overview..."
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">First Name</label>
                        <input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className={panelTheme.field}
                          placeholder="First Name"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Last Name</label>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={panelTheme.field}
                          placeholder="Last Name"
                        />
                      </div>
                    </div>
                    {ingestionContext?.accountName && (
                      <div className="px-3 py-2 rounded bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Link →</span>
                        <span className="text-xs font-mono text-white truncate">{ingestionContext.accountName}</span>
                      </div>
                    )}
                  </>
                )}

                {type === 'CONTACT' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Job Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={panelTheme.field}
                        placeholder="e.g. CEO, Energy Manager"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Email</label>
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={panelTheme.field}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Mobile</label>
                        <input
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Work Direct</label>
                        <input
                          value={workDirect}
                          onChange={(e) => setWorkDirect(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Other</label>
                        <input
                          value={otherPhone}
                          onChange={(e) => setOtherPhone(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">City</label>
                        <input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className={panelTheme.field}
                          placeholder="City"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">State</label>
                        <input
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className={panelTheme.field}
                          placeholder="TX"
                        />
                      </div>
                    </div>
                  </>
                )}

                {type === 'ACCOUNT' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Revenue</label>
                        <input
                          value={revenue}
                          onChange={(e) => setRevenue(e.target.value)}
                          className={panelTheme.field}
                          placeholder="Unknown"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Headcount</label>
                        <input
                          value={employees}
                          onChange={(e) => setEmployees(e.target.value)}
                          className={panelTheme.field}
                          placeholder="Unknown"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">Phone</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={panelTheme.field}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase">LinkedIn</label>
                        <input
                          value={scanResult?.linkedin || ''}
                          readOnly
                          className={`${panelTheme.field} opacity-60`}
                          placeholder="linkedin.com/company/..."
                        />
                      </div>
                    </div>
                  </>
                )}

                {type === 'ACCOUNT' && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">Grid Coordinates</label>
                      {!isManual && scanResult?.address && (
                        <button
                          onClick={() => {
                            if (scanResult?.address) setAddress(scanResult.address);
                            if (scanResult?.city) setCity(scanResult.city);
                            if (scanResult?.state) setState(scanResult.state);
                          }}
                          className="text-[9px] font-mono text-white hover:text-[#002FA7] transition-colors"
                        >
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
                        className={`${panelTheme.field} pl-10 text-xs`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER */}
              <div className="pt-6 mt-6 border-t border-white/10 space-y-2">
                <Button
                  onClick={handleCommit}
                  disabled={isCommitting || (type === 'ACCOUNT' ? !entityName : (!firstName.trim() && !lastName.trim()))}
                  className={panelTheme.cta}
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      COMMITTING...
                    </>
                  ) : isExistingRecord ? (
                    '[ ENRICH_EXISTING_NODE ]'
                  ) : (
                    '[ COMMIT_NODE_TO_DB ]'
                  )}
                </Button>
                <button
                  onClick={() => setStep('SIGNAL')}
                  className="w-full py-2 text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  [ ← RESCAN ]
                </button>
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
                  <ForensicClose onClick={() => setShowVerifyModal(false)} size={16} />
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
                    [ NONE OF THESE — PROCEED MANUALLY ]
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
