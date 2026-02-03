'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Building2, User, Link2, MapPin, 
  Sparkles, AlertTriangle, CheckCircle, ArrowRight, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/uiStore';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

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
        industry: data.industry,
        employees: data.employees,
        revenue: data.revenue,
        logo: data.logoUrl,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        linkedin: data.linkedin_url
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
  const { rightPanelMode, setRightPanelMode } = useUIStore();
  const type = rightPanelMode === 'INGEST_ACCOUNT' ? 'ACCOUNT' : 'CONTACT';
  
  const [step, setStep] = useState<'SIGNAL' | 'VERIFY' | 'COMMIT'>('SIGNAL');
  const [identifier, setIdentifier] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isManual, setIsManual] = useState(false);
  
  // Form State
  const [entityName, setEntityName] = useState('');
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

  const handleScan = async () => {
    if (!identifier) return;
    setIsScanning(true);
    try {
      const data = await enrichNode(identifier, type);
      if (data) {
        setScanResult(data);
        setEntityName(data.name || '');
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
        const { error } = await supabase.from('accounts').insert({
          id,
          name: entityName,
          domain: identifier.includes('.') ? identifier : scanResult?.domain,
          industry: scanResult?.industry,
          revenue: revenue,
          employees: parseInt(employees) || 0,
          address: address,
          city: city,
          state: state,
          logo_url: scanResult?.logo,
          phone: phone || scanResult?.phone,
          linkedin_url: scanResult?.linkedin,
          status: 'active',
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
          phone: phone,
          title: title,
          linkedinUrl: identifier.includes('linkedin.com') ? identifier : scanResult?.linkedin,
          accountId: scanResult?.accountId,
          city: city,
          state: state,
          status: 'active',
          createdAt: now,
          updatedAt: now
        });

        if (error) throw error;
      }

      toast.success(`${type} Node Initialized`, {
        description: `${entityName || firstName + ' ' + lastName} has been committed to the database.`,
        className: "bg-zinc-900 border-white/10 text-white font-mono",
      });
      
      resetProtocol();
    } catch (error: any) {
      console.error('Commit error:', error);
      toast.error('Commit Failed', {
        description: error.message || 'An unknown error occurred.',
        className: "bg-zinc-900 border-red-500/50 text-white font-mono",
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const resetProtocol = () => {
    setRightPanelMode('DEFAULT');
    setStep('SIGNAL');
    setIdentifier('');
    setScanResult(null);
    setIsManual(false);
    setEntityName('');
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
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
        <div className="flex items-center gap-2">
          {type === 'ACCOUNT' ? <Building2 className="w-4 h-4 text-[#002FA7]" /> : <User className="w-4 h-4 text-[#002FA7]" />}
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
          
          {/* STEP 1: SIGNAL ACQUISITION */}
          {step === 'SIGNAL' && (
            <motion.div 
              key="signal"
              initial={{ opacity: 0, x: 20 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
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
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg p-4 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 outline-none transition-all"
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
                  <Sparkles className="w-4 h-4 text-[#002FA7] mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono text-[#002FA7] font-bold uppercase tracking-widest">
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase">Entity Name</label>
                    <input 
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                      className="nodal-input w-full"
                      placeholder="Legal Entity Name"
                    />
                  </div>
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
                        <button className="text-[9px] font-mono text-[#002FA7] hover:text-white transition-colors">
                          [ SYNC_HQ_ADDRESS ]
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600 group-focus-within:text-[#002FA7] transition-colors" />
                      <input 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Service Address (Meter Location)"
                        className="w-full bg-zinc-900 border border-white/10 rounded p-2 pl-10 text-xs font-mono text-white focus:border-[#002FA7] outline-none"
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
    </div>
  );
}
