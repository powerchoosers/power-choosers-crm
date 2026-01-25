'use client'
import { useState } from 'react';
import { Users, Search, Lock, ShieldCheck, Download, Plus, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface OrgIntelligenceProps {
  domain?: string;
  companyName?: string;
  website?: string;
  accountId?: string;
}

type ApolloContactRow = {
  name: string
  title?: string
  email: string
  status: 'verified' | 'unverified'
  isMonitored: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export default function OrgIntelligence({ domain: initialDomain, companyName, website, accountId }: OrgIntelligenceProps) {
  const domain = initialDomain || (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : companyName?.toLowerCase().replace(/\s+/g, '') + '.com');
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [data, setData] = useState<ApolloContactRow[]>([]); 
  const [acquiringEmail, setAcquiringEmail] = useState<string | null>(null);

  const handleAcquire = async (person: ApolloContactRow) => {
    if (!accountId) {
      toast.error('No account ID provided for acquisition');
      return;
    }
    
    setAcquiringEmail(person.email);
    
    try {
      const names = person.name.split(' ');
      const firstName = names[0] || '';
      const lastName = names.slice(1).join(' ') || '';

      const { error } = await supabase
        .from('contacts')
        .insert({
          name: person.name,
          first_name: firstName,
          last_name: lastName,
          title: person.title,
          email: person.email,
          accountId: accountId,
          companyName: companyName,
          status: 'Active',
          metadata: {
            source: 'Apollo Organizational Intelligence',
            acquired_at: new Date().toISOString(),
            original_apollo_data: person
          }
        });

      if (error) throw error;

      toast.success(`${person.name} added to monitoring`);
      
      // Update local state to show as monitored
      setData(prev => prev.map(p => 
        p.email === person.email ? { ...p, isMonitored: true } : p
      ));
    } catch (error) {
      console.error('Acquisition Error:', error);
      toast.error('Failed to acquire contact');
    } finally {
      setAcquiringEmail(null);
    }
  };

  const handleScan = async () => {
    setScanStatus('scanning');
    
    try {
      const response = await fetch('/api/apollo/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: {
            companies: {
              include: {
                domains: [domain]
              }
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
      
      // Map Apollo results to our table format with monitored status
      const mappedData: ApolloContactRow[] = apolloContacts
        .map((contact): ApolloContactRow | null => {
          if (!isRecord(contact)) return null
          const name = typeof contact.name === 'string' ? contact.name : ''
          if (!name) return null
          const title = typeof contact.title === 'string' ? contact.title : undefined
          const email = typeof contact.email === 'string' ? contact.email : 'N/A'
          const emailStatus = typeof contact.email_status === 'string' ? contact.email_status : ''
          const status: ApolloContactRow['status'] = emailStatus === 'verified' ? 'verified' : 'unverified'
          const isMonitored = email !== 'N/A' && existingEmails.has(email)
          return { name, title, email, status, isMonitored }
        })
        .filter((v): v is ApolloContactRow => v !== null)

      setData(mappedData);
      setScanStatus('complete');
    } catch (error) {
      console.error('Apollo Scan Error:', error);
      setScanStatus('idle');
      alert('Failed to connect to Apollo Intelligence. Verify API configuration.');
    }
  };

  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 mt-6 min-h-[300px]">
      
      <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-white" /> Organizational Intelligence
        </h3>
        <span className="text-xs font-mono text-zinc-500">{domain || 'No Domain Provided'}</span>
      </div>

      {/* STATE 1: IDLE (Gated) */}
      {scanStatus === 'idle' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4 text-zinc-500">
            <Lock className="w-6 h-6" />
          </div>
          <h4 className="text-zinc-300 font-medium mb-2">Target Data Secure</h4>
          <p className="text-zinc-500 text-sm max-w-sm mb-6">
            Apollo API access is restricted to save resources. Initiate a scan to identify key decision makers associated with this domain.
          </p>
          <button 
            onClick={handleScan}
            className="group flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all"
          >
            <Search className="w-4 h-4" />
            Initiate Apollo Scan
          </button>
        </div>
      )}

      {/* STATE 2: SCANNING (Animation) */}
      {scanStatus === 'scanning' && (
        <div className="font-mono text-xs text-green-500 space-y-2 p-4 bg-black/20 rounded-xl">
          <p>&gt; INITIALIZING APOLLO GATEWAY...</p>
          <p>&gt; TARGETING DOMAIN: {domain}...</p>
          <p>&gt; FILTERING FOR DECISION MAKERS...</p>
          <p className="animate-pulse">&gt; DECRYPTING CONTACTS_</p>
        </div>
      )}

      {/* STATE 3: RESULTS (The Table) */}
      {scanStatus === 'complete' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-zinc-500 uppercase tracking-widest">
                <th className="pb-3 pl-2">Identity</th>
                <th className="pb-3">Role</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {data.map((person, i) => (
                <tr key={i} className="border-t border-white/5 group hover:bg-white/5 transition-colors">
                  <td className="py-4 pl-2 text-white">{person.name}</td>
                  <td className="py-4 text-zinc-400">{person.title}</td>
                  <td className="py-4 text-right">
                    {person.isMonitored ? (
                      <div className="flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-widest justify-end pr-2">
                        <CheckCircle className="w-3 h-3" />
                        Monitored
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleAcquire(person)}
                        disabled={acquiringEmail === person.email}
                        className="text-[10px] border border-white/10 hover:border-[#002FA7]/50 hover:bg-[#002FA7]/10 text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ml-auto uppercase tracking-widest group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {acquiringEmail === person.email ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3 group-hover/btn:scale-110 transition-transform" />
                        )} 
                        {acquiringEmail === person.email ? 'Acquiring...' : 'Acquire'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
