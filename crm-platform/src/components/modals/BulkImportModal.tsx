'use client'

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, ArrowRight, AlertCircle, CheckCircle, X, Database, User, Building2, Loader2, Plus } from 'lucide-react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'; 
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUpsertContact } from '@/hooks/useContacts';
import { useUpsertAccount } from '@/hooks/useAccounts';
import { useTargets, useCreateTarget } from '@/hooks/useTargets';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { formatPhoneNumber } from '@/lib/formatPhone';

// --- FORENSIC TYPES ---
type ImportVector = 'CONTACTS' | 'ACCOUNTS';
type ImportStep = 'VECTOR_SELECT' | 'UPLOAD' | 'CALIBRATION' | 'ROUTING' | 'PROCESSING';

interface CsvHeader {
  raw: string;
  sample: string;
}

// Nodal Point Field Schemas
const CONTACT_FIELDS = [
  { id: 'first_name', label: 'First Name', required: true },
  { id: 'last_name', label: 'Last Name', required: true },
  { id: 'email', label: 'Email Address', required: true },
  { id: 'phone', label: 'Primary Phone', required: false },
  { id: 'mobile_phone', label: 'Mobile Phone', required: false },
  { id: 'work_direct', label: 'Work Direct', required: false },
  { id: 'other_phone', label: 'Other Phone', required: false },
  { id: 'job_title', label: 'Position / Title', required: false },
  { id: 'city', label: 'City', required: false },
  { id: 'state', label: 'State', required: false },
  { id: 'linkedin_url', label: 'LinkedIn Vector', required: false },
  { id: 'company_name', label: 'Company Name', required: false },
];

const ACCOUNT_FIELDS = [
  { id: 'name', label: 'Company Name', required: true },
  { id: 'industry', label: 'Industry Sector', required: false },
  { id: 'website', label: 'Domain / Website', required: true }, 
  { id: 'logo_url', label: 'Logo URL', required: false },
  { id: 'company_phone', label: 'Company Phone', required: false },
  { id: 'linkedin_url', label: 'Company LinkedIn', required: false },
  { id: 'service_address', label: 'Service Address', required: false },
  { id: 'city', label: 'City', required: false },
  { id: 'state', label: 'State', required: false },
  { id: 'annual_revenue', label: 'Annual Revenue', required: false },
  { id: 'employee_count', label: 'Headcount', required: false },
  { id: 'energy_supplier', label: 'Current Supplier', required: false },
  { id: 'annual_usage', label: 'Annual Usage (kWh)', required: false },
  { id: 'contract_end', label: 'Contract End Date', required: false },
  { id: 'description', label: 'Forensic Log / Description', required: false },
];

export function BulkImportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<ImportStep>('VECTOR_SELECT');
  const [importVector, setImportVector] = useState<ImportVector | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<CsvHeader[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [isEnriching, setIsEnriching] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hygieneStats, setHygieneStats] = useState({ valid: 0, invalid: 0, total: 0 });
  
  // New List State
  const [isAddingNewList, setIsAddingNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

  const queryClient = useQueryClient();
  const { data: targets } = useTargets();
  const createTargetList = useCreateTarget();
  const upsertContact = useUpsertContact();
  const upsertAccount = useUpsertAccount();

  const [analysis, setAnalysis] = useState<{ new: number; existing: number; total: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- LOGIC: ANALYZE CSV FOR ENRICHMENT ---
  const runPreImportAnalysis = async () => {
    if (!csvData.length || !importVector) return;
    
    setIsAnalyzing(true);
    let existingCount = 0;
    
    try {
      // Process in batches
      const batchSize = 25;
      for (let i = 0; i < csvData.length; i += batchSize) {
        const batch = csvData.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (row) => {
          const mappedData: any = {};
          Object.entries(fieldMapping).forEach(([csvHeader, nodalId]) => {
            if (nodalId && nodalId !== 'skip') {
              mappedData[nodalId] = row[csvHeader];
            }
          });

          if (importVector === 'ACCOUNTS') {
            const domain = mappedData.website;
            const name = mappedData.name;

            // Try domain match
            if (domain) {
              const { data } = await supabase
                .from('accounts')
                .select('id')
                .eq('domain', domain)
                .maybeSingle();
              if (data) return true;
            }

            // Try name match
            if (name) {
              const { data } = await supabase
                .from('accounts')
                .select('id')
                .ilike('name', name)
                .maybeSingle();
              if (data) return true;
            }
          } else {
            const email = mappedData.email;
            const fName = mappedData.first_name;
            const lName = mappedData.last_name;
            const company = mappedData.company_name;

            // Try email match
            if (email) {
              const { data } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', email)
                .maybeSingle();
              if (data) return true;
            }

            // Try name + company match
            if (fName && lName && company) {
              const { data: nameMatches } = await supabase
                .from('contacts')
                .select('id, metadata')
                .ilike('firstName', fName)
                .ilike('lastName', lName);
              
              if (nameMatches && nameMatches.length > 0) {
                const companyMatch = nameMatches.find(m => {
                  const existingCompany = m.metadata?.company || m.metadata?.companyName;
                  return existingCompany && existingCompany.toLowerCase() === company.toLowerCase();
                });
                if (companyMatch) return true;
              }
            }
          }
          return false;
        });

        const results = await Promise.all(batchPromises);
        existingCount += results.filter(Boolean).length;
      }

      setAnalysis({
        total: csvData.length,
        existing: existingCount,
        new: csvData.length - existingCount
      });
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Run analysis when mapping or data changes
  useEffect(() => {
    if (step === 'CALIBRATION' && csvData.length > 0 && Object.keys(fieldMapping).length > 0) {
      runPreImportAnalysis();
    }
  }, [step, fieldMapping]);

  // --- LOGIC: CACHED MAPPINGS ---
  const getCacheKey = (vector: ImportVector | null) => `nodal_import_mapping_${vector}`;

  const saveMappingToCache = (vector: ImportVector | null, mapping: Record<string, string>) => {
    if (!vector) return;
    try {
      localStorage.setItem(getCacheKey(vector), JSON.stringify(mapping));
    } catch (e) {
      console.error('Failed to cache mapping:', e);
    }
  };

  const loadMappingFromCache = (vector: ImportVector | null): Record<string, string> => {
    if (!vector) return {};
    try {
      const cached = localStorage.getItem(getCacheKey(vector));
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      console.error('Failed to load cached mapping:', e);
      return {};
    }
  };

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setStep('VECTOR_SELECT');
      setImportVector(null);
      setFile(null);
      setCsvHeaders([]);
      setCsvData([]);
      setFieldMapping({});
      setSelectedListId('');
      setIsProcessing(false);
      setProcessingStage(0);
      setProgress(0);
      setHygieneStats({ valid: 0, invalid: 0, total: 0 });
    }
  }, [isOpen]);

  // Cycle through processing stages for visual effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing && step === 'UPLOAD') {
      interval = setInterval(() => {
        setProcessingStage(prev => (prev < 3 ? prev + 1 : prev));
      }, 400);
    }
    return () => clearInterval(interval);
  }, [isProcessing, step]);

  // Reset selected list when vector changes
  useEffect(() => {
    setSelectedListId('');
  }, [importVector]);

  // --- LOGIC: HYGIENE CHECK ---
  const runHygieneCheck = (data: any[], vector: ImportVector) => {
    let valid = 0;
    let invalid = 0;
    
    data.forEach(row => {
      if (vector === 'CONTACTS') {
        const email = row.Email || row.email || row['Email Address'];
        const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (isValidEmail) valid++; else invalid++;
      } else {
        const website = row.Website || row.website || row.Domain || row.domain;
        const isValidDomain = website && website.includes('.');
        if (isValidDomain) valid++; else invalid++;
      }
    });

    setHygieneStats({ valid, invalid, total: data.length });
  };

  // --- LOGIC: HANDLE FILE UPLOAD ---
  const handleFile = (uploadedFile: File) => {
    if (uploadedFile) {
      setFile(uploadedFile);
      setIsProcessing(true);
      setProcessingStage(0);
      
      // Delay slightly to show neural scan animation
      setTimeout(() => {
        Papa.parse(uploadedFile, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.meta.fields) {
              const headers = results.meta.fields.map(f => ({
                raw: f,
                sample: results.data[0] ? (results.data[0] as any)[f] || '' : ''
              }));
              
              setCsvHeaders(headers);
              setCsvData(results.data);
              
              if (importVector) {
                runHygieneCheck(results.data, importVector);
                
                // --- PRE-CALIBRATE MAPPING BEFORE TRANSITION ---
                const newMapping: Record<string, string> = {};
                const cachedMapping = loadMappingFromCache(importVector);
                const targetFields = importVector === 'CONTACTS' ? CONTACT_FIELDS : ACCOUNT_FIELDS;
                
                headers.forEach(header => {
                  // 1. Try Cached Mapping First
                  if (cachedMapping[header.raw]) {
                    newMapping[header.raw] = cachedMapping[header.raw];
                    return;
                  }

                  // 2. Fallback to Auto-Detection
                  const headerLower = header.raw.toLowerCase();
                  const match = targetFields.find(f => 
                    headerLower.includes(f.label.toLowerCase()) || 
                    headerLower.includes(f.id.replace('_', '')) ||
                    headerLower.includes(f.id)
                  );
                  if (match) newMapping[header.raw] = match.id;
                });
                setFieldMapping(newMapping);
                saveMappingToCache(importVector, newMapping);
              }
              
              // Only transition once everything is ready
              setIsProcessing(false);
              setStep('CALIBRATION');
            }
          },
          error: (error) => {
            setIsProcessing(false);
            toast.error(`CSV Parsing Error: ${error.message}`);
          }
        });
      }, 1500);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) handleFile(uploadedFile);
  };

  const handleCreateList = async () => {
    if (!newListName.trim() || !importVector) return;

    try {
      const kind = importVector === 'CONTACTS' ? 'people' : 'account';
      const result = await createTargetList.mutateAsync({ 
        name: newListName.trim(), 
        kind 
      });
      
      if (result?.id) {
        setSelectedListId(result.id);
        setNewListName('');
        setIsAddingNewList(false);
        toast.success(`Created list: ${result.name}`);
      }
    } catch (err) {
      // Error handled by mutation
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      handleFile(droppedFile);
    } else {
      toast.error('Invalid payload. CSV required.');
    }
  };

  // --- LOGIC: EXECUTE IMPORT ---
  const handleInitiateIngestion = async () => {
    setIsProcessing(true);
    setStep('PROCESSING');
    let successCount = 0;
    let errorCount = 0;
    let listAddCount = 0;
    let listAddErrors = 0;

    const total = csvData.length;
    const selectedListName = targets?.find(t => t.id === selectedListId)?.name;
    
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const mappedData: any = {};
      
      // Map fields
      Object.entries(fieldMapping).forEach(([csvHeader, nodalId]) => {
        if (nodalId && nodalId !== 'skip') {
          mappedData[nodalId] = row[csvHeader];
        }
      });

      try {
        if (importVector === 'CONTACTS') {
          // Process Contact
          const contactData = {
            name: `${mappedData.first_name || ''} ${mappedData.last_name || ''}`.trim(),
            firstName: mappedData.first_name || '',
            lastName: mappedData.last_name || '',
            email: mappedData.email || '',
            phone: formatPhoneNumber(mappedData.phone) || '',
            mobile: formatPhoneNumber(mappedData.mobile_phone) || '',
            workPhone: formatPhoneNumber(mappedData.work_direct) || '',
            otherPhone: formatPhoneNumber(mappedData.other_phone) || '',
            status: 'Lead',
            company: mappedData.company_name || '',
            city: mappedData.city || '',
            state: mappedData.state || '',
            // Add metadata fields
            metadata: {
              job_title: mappedData.job_title,
              linkedin_url: mappedData.linkedin_url,
              import_batch: new Date().toISOString(),
              enriched: isEnriching,
              // Keep original field names in metadata for backup
              mobile_phone: mappedData.mobile_phone,
              work_direct: mappedData.work_direct,
              other_phone: mappedData.other_phone
            }
          };

          const result = await upsertContact.mutateAsync(contactData as any);
          
          // Add to list if selected
          if (selectedListId && result.id) {
            // Check if already in list
            const { data: existing } = await supabase
              .from('list_members')
              .select('id')
              .eq('listId', selectedListId)
              .eq('targetId', result.id)
              .maybeSingle();
            
            if (!existing) {
              const { error: listError } = await supabase.from('list_members').insert({
                id: crypto.randomUUID(),
                listId: selectedListId,
                targetId: result.id,
                targetType: 'people'
              });
              
              if (listError) {
                console.error('Error adding to list:', listError);
                listAddErrors++;
              } else {
                listAddCount++;
              }
            } else {
              // Already in list, count as skipped duplicate
              listAddErrors++;
            }
          }
        } else {
          // Process Account
          const accountData = {
            name: mappedData.name || '',
            industry: mappedData.industry || '',
            domain: mappedData.website || '',
            logoUrl: mappedData.logo_url || '',
            companyPhone: formatPhoneNumber(mappedData.company_phone) || '',
            linkedinUrl: mappedData.linkedin_url || '',
            address: mappedData.service_address || '', // Populate uplink address
            serviceAddresses: mappedData.service_address ? [mappedData.service_address] : [],
            city: mappedData.city || '',
            state: mappedData.state || '',
            contractEnd: mappedData.contract_end || null,
            employees: mappedData.employee_count || '',
            annualUsage: mappedData.annual_usage || '',
            description: mappedData.description || '',
            metadata: {
              linkedin_url: mappedData.linkedin_url,
              service_address: mappedData.service_address,
              annual_revenue: mappedData.annual_revenue,
              energy_supplier: mappedData.energy_supplier,
              city: mappedData.city,
              state: mappedData.state,
              import_batch: new Date().toISOString(),
              enriched: isEnriching,
              // Create initial meter with service address
              meters: mappedData.service_address ? [{
                id: crypto.randomUUID(),
                esiId: '',
                address: mappedData.service_address,
                rate: mappedData.current_rate || '',
                endDate: mappedData.contract_end || ''
              }] : []
            }
          };

          const result = await upsertAccount.mutateAsync(accountData as any);
          
          // Add to list if selected
          if (selectedListId && result.id) {
            // Check if already in list
            const { data: existing } = await supabase
              .from('list_members')
              .select('id')
              .eq('listId', selectedListId)
              .eq('targetId', result.id)
              .maybeSingle();
            
            if (!existing) {
              const { error: listError } = await supabase.from('list_members').insert({
                id: crypto.randomUUID(),
                listId: selectedListId,
                targetId: result.id,
                targetType: 'account'
              });
              
              if (listError) {
                console.error('Error adding to list:', listError);
                listAddErrors++;
              } else {
                listAddCount++;
              }
            } else {
              // Already in list, count as skipped duplicate
              listAddErrors++;
            }
          }
        }
        successCount++;
      } catch (err) {
        console.error('Import error for row:', i, err);
        errorCount++;
      }
      
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    // Invalidate queries to refresh counts
    queryClient.invalidateQueries({ queryKey: ['targets'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });

    // Show success toasts
    toast.success(`Import complete: ${successCount} ${importVector === 'CONTACTS' ? 'contacts' : 'accounts'} processed${errorCount > 0 ? `, ${errorCount} failed` : ''}.`);
    
    if (selectedListId && listAddCount > 0) {
      toast.success(`${listAddCount} ${importVector === 'CONTACTS' ? 'contacts' : 'accounts'} added to list: "${selectedListName}"${listAddErrors > 0 ? ` (${listAddErrors} duplicates skipped)` : ''}`);
    }
    
    setIsProcessing(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="max-w-5xl w-full max-h-[90vh] flex flex-col bg-zinc-950/95 border-white/10 backdrop-blur-2xl text-white p-0 overflow-hidden shadow-2xl">
        <DialogTitle className="sr-only">Bulk Data Ingestion</DialogTitle>
        <DialogDescription className="sr-only">
          Map and import CSV data into the Nodal Point CRM.
        </DialogDescription>
        
        {/* HEADER: OBSIDIAN & GLASS */}
        <div className="h-14 border-b border-white/5 flex-none flex items-center justify-between px-6 bg-white/5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-white" />
            <span className="font-mono text-sm tracking-wider text-zinc-300 uppercase">
              DATA_INGESTION_PROTOCOL // {step}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <motion.div 
          layout
          initial={false}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
          className="flex-1 flex flex-col min-h-0 relative"
        >
          <AnimatePresence mode="wait">
            
            {/* PHASE 0: VECTOR SELECTION */}
            {step === 'VECTOR_SELECT' && (
              <motion.div 
                key="vector-select"
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="p-6 grid grid-cols-2 gap-4"
              >
                <button
                  onClick={() => { setImportVector('CONTACTS'); setStep('UPLOAD'); }}
                  className="group relative py-12 px-8 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-900 hover:border-[#002FA7]/50 transition-all flex flex-col items-center justify-center gap-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center group-hover:bg-[#002FA7]/20 transition-colors">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">People Vector</div>
                    <div className="text-xs text-zinc-500 font-mono mt-1 uppercase tracking-widest">CONTACTS // LEADS // HUMANS</div>
                  </div>
                </button>

                <button
                  onClick={() => { setImportVector('ACCOUNTS'); setStep('UPLOAD'); }}
                  className="group relative py-12 px-8 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-900 hover:border-[#002FA7]/50 transition-all flex flex-col items-center justify-center gap-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center group-hover:bg-[#002FA7]/20 transition-colors">
                    <Building2 className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">Entity Vector</div>
                    <div className="text-xs text-zinc-500 font-mono mt-1 uppercase tracking-widest">ACCOUNTS // COMPANIES // ASSETS</div>
                  </div>
                </button>
              </motion.div>
            )}

            {/* PHASE 1: UPLOAD AIRLOCK */}
            {step === 'UPLOAD' && (
              <motion.div 
                key="upload" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="p-6 flex flex-col items-center justify-center min-h-[300px]"
              >
                {(!isProcessing && !file) ? (
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all duration-300 py-12 ${
                      isDragging 
                        ? 'border-[#002FA7] bg-[#002FA7]/10 scale-[1.02]' 
                        : 'border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-zinc-700'
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      id="csv-upload" 
                    />
                    <label htmlFor="csv-upload" className="flex flex-col items-center cursor-pointer">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
                        isDragging ? 'bg-[#002FA7] text-white' : 'bg-zinc-900 border border-white/10 text-zinc-400'
                      }`}>
                        <Upload className={`w-6 h-6 ${isDragging ? 'animate-bounce' : ''}`} />
                      </div>
                      <span className="text-zinc-300 font-medium">Drop CSV Payload</span>
                      <span className="text-xs text-zinc-500 font-mono mt-2 uppercase tracking-widest">
                        TARGET VECTOR: {importVector}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="w-full flex flex-col items-center justify-center py-12">
                    <div className="w-64 h-1 bg-zinc-900 rounded-full overflow-hidden relative mb-6">
                      <motion.div 
                        initial={{ left: "-100%" }}
                        animate={{ left: "100%" }}
                        transition={{ 
                          repeat: Infinity, 
                          duration: 1.5, 
                          ease: "linear" 
                        }}
                        className="absolute top-0 bottom-0 w-1/2 bg-[#002FA7] shadow-[0_0_15px_#002FA7]"
                      />
                    </div>
                    <div className="space-y-1 text-center font-mono">
                      <div className={`text-[10px] uppercase tracking-tighter transition-colors duration-300 ${processingStage === 0 ? 'text-[#002FA7] animate-pulse' : 'text-zinc-500'}`}>
                        PARSING_PAYLOAD...
                      </div>
                      <div className={`text-[10px] uppercase tracking-tighter transition-colors duration-300 ${processingStage === 1 ? 'text-[#002FA7] animate-pulse' : 'text-zinc-500'}`}>
                        READING STREAM...
                      </div>
                      <div className={`text-[10px] uppercase tracking-tighter transition-colors duration-300 ${processingStage === 2 ? 'text-[#002FA7] animate-pulse' : 'text-zinc-500'}`}>
                        PARSING CSV HEADERS...
                      </div>
                      <div className={`text-[10px] uppercase tracking-tighter transition-colors duration-300 ${processingStage === 3 ? 'text-[#002FA7] animate-pulse' : 'text-zinc-500'}`}>
                        DETECTING ENCODING...
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* PHASE 2: CALIBRATION (MAPPING) */}
            {step === 'CALIBRATION' && (
              <motion.div 
                key="calibration"
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="p-6 flex flex-col h-[70vh] min-h-0"
              >
                
                {/* HEADS UP DISPLAY: METADATA */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div>
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Field Calibration Protocol</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        DETECTED {csvHeaders.length} COLUMNS
                      </span>
                      <div className="h-3 w-[1px] bg-zinc-700"></div>
                      <span className="text-[10px] font-mono text-[#002FA7]">
                        INTEGRITY: 100%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs font-mono text-emerald-500">READY</span>
                  </div>
                </div>

                {/* THE SCROLL CONTAINER */}
                <div className="flex-1 min-h-0 overflow-hidden border border-white/5 rounded-xl bg-black/40 relative">
                  
                  {/* Neural Line: Visual Indicator of Scrollability */}
                  <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-[#002FA7] z-10 opacity-30" />

                  <div className="h-full overflow-y-auto custom-scrollbar p-4">
                    <div className="space-y-2">
                      {csvHeaders.map((header, idx) => (
                        <div 
                          key={idx} 
                          className="group grid grid-cols-[1fr_48px_1fr] items-center gap-4 p-2.5 rounded-lg bg-zinc-900/40 border border-white/5 hover:border-white/20 hover:bg-zinc-900/60 transition-all duration-300"
                        >
                          {/* LEFT: SOURCE (CSV) */}
                          <div className="flex flex-col min-w-0">
                            <div className="text-[9px] font-mono text-zinc-500 mb-1 uppercase tracking-widest">
                              SOURCE_HEADER
                            </div>
                            <div className="text-sm text-zinc-200 font-bold truncate">
                              {header.raw}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-1 flex items-center gap-2">
                              <span className="opacity-50">SAMPLE:</span>
                              <span className="text-zinc-400 truncate bg-white/5 px-1.5 py-0.5 rounded">{header.sample || 'NULL'}</span>
                            </div>
                          </div>
                          
                          {/* CENTER: ARROW (The Nodal Point) */}
                          <div className="flex justify-center">
                            <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center border border-white/5 group-hover:border-[#002FA7]/50 group-hover:bg-[#002FA7]/10 transition-all">
                              <ArrowRight className="w-4 h-4 text-[#002FA7] opacity-40 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          
                          {/* RIGHT: DESTINATION (NODAL) */}
                          <div className="flex flex-col items-end min-w-0">
                            <div className="text-[9px] font-mono text-zinc-500 mb-1 uppercase tracking-widest text-right w-full">
                              TARGET_FIELD
                            </div>
                            <Select 
                              value={fieldMapping[header.raw]} 
                              onValueChange={(val) => {
                                const updatedMapping = { ...fieldMapping, [header.raw]: val };
                                setFieldMapping(updatedMapping);
                                saveMappingToCache(importVector, updatedMapping);
                              }}
                            >
                              <SelectTrigger className="h-9 w-full max-w-[240px] bg-black/40 border-white/10 text-xs font-mono focus:ring-1 focus:ring-[#002FA7] focus:border-[#002FA7] text-right">
                                <SelectValue placeholder="-- SKIP --" />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-950 border-white/10 text-zinc-200">
                                <SelectItem value="skip" className="text-zinc-500 font-mono text-[10px]">-- SKIP COLUMN --</SelectItem>
                                {(importVector === 'CONTACTS' ? CONTACT_FIELDS : ACCOUNT_FIELDS).map(field => (
                                  <SelectItem key={field.id} value={field.id} className="font-mono text-xs">
                                    {field.label} {field.required && <span className="text-[#002FA7]">*</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* FOOTER ACTIONS */}
                <div className="mt-4 flex justify-end pt-4 border-t border-white/5">
                  <Button 
                    onClick={() => setStep('ROUTING')}
                    className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs shadow-[0_0_15px_-3px_#002FA7] px-8"
                  >
                    CONFIRM_CALIBRATION <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* PHASE 3: ROUTING MATRIX */}
            {step === 'ROUTING' && (
              <motion.div 
                key="routing" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="p-6 flex flex-col"
              >
                <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-widest flex-none">Routing Matrix</h3>
                
                <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
                  {/* ENRICHMENT TOGGLE */}
                  <div className="flex items-center justify-between p-4 rounded bg-zinc-900/50 border border-white/5">
                    <div>
                      <div className="text-sm font-medium text-white">Apollo Enrichment</div>
                      <div className="text-xs text-zinc-500 max-w-sm mt-1">
                        Use domain/email to pull firmographic data (Industry, Revenue) during ingestion.
                      </div>
                    </div>
                    <div 
                      className={`h-5 w-9 rounded-full relative cursor-pointer transition-colors duration-200 ${isEnriching ? 'bg-[#002FA7]' : 'bg-zinc-800'}`}
                      onClick={() => setIsEnriching(!isEnriching)}
                    >
                      <motion.div 
                        animate={{ x: isEnriching ? 16 : 4 }}
                        className="absolute top-1 h-3 w-3 bg-white rounded-full shadow-sm" 
                      />
                    </div>
                  </div>

                  {/* LIST ASSIGNMENT */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Destination List</label>
                      <button 
                        onClick={() => setIsAddingNewList(!isAddingNewList)}
                        className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 uppercase tracking-widest"
                      >
                        {isAddingNewList ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {isAddingNewList ? 'Cancel' : 'New List'}
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {isAddingNewList ? (
                        <motion.div 
                          key="new-list-input"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex gap-2"
                        >
                          <Input 
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            placeholder="Enter list name..."
                            className="bg-zinc-900/50 border-white/10 text-white h-9 text-xs font-mono focus-visible:ring-0 focus-visible:border-white/40 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                            autoFocus
                          />
                          <Button 
                            onClick={handleCreateList}
                            disabled={!newListName.trim() || createTargetList.isPending}
                            className="bg-[#002FA7] hover:bg-blue-600 text-white h-9 px-4"
                          >
                            {createTargetList.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="select-list"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                        >
                          <Select value={selectedListId} onValueChange={setSelectedListId}>
                            <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white focus:ring-0 focus:border-white/40 transition-colors">
                              <SelectValue placeholder="Select Target List..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10">
                              {targets?.filter(t => {
                                const kind = (t.kind || '').toLowerCase();
                                if (importVector === 'CONTACTS') {
                                  return kind === 'people' || kind === 'person' || kind === 'contacts' || kind === 'contact';
                                } else {
                                  return kind === 'accounts' || kind === 'account' || kind === 'companies' || kind === 'company';
                                }
                              }).map(target => (
                                <SelectItem key={target.id} value={target.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="truncate">{target.name}</span>
                                    <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                                      {`// ${target.kind.toUpperCase()}`}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                              {(!targets || targets.length === 0 || targets.filter(t => {
                                const kind = (t.kind || '').toLowerCase();
                                if (importVector === 'CONTACTS') {
                                  return kind === 'people' || kind === 'person' || kind === 'contacts' || kind === 'contact';
                                } else {
                                  return kind === 'accounts' || kind === 'account' || kind === 'companies' || kind === 'company';
                                }
                              }).length === 0) && (
                                <SelectItem value="none" disabled>No suitable lists found</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* PROTOCOL ACTIVATION (Only for Contacts) */}
                  {importVector === 'CONTACTS' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-[#002FA7]">Activate Protocol (Sequence)</label>
                      <Select>
                        <SelectTrigger className="bg-zinc-900/50 border-[#002FA7]/30 text-white focus:ring-0 focus:border-[#002FA7]/60 transition-colors">
                          <SelectValue placeholder="Do Not Enroll" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10">
                          <SelectItem value="seq_4cp">Sequence: 4CP Defense</SelectItem>
                          <SelectItem value="seq_ratchet">Sequence: Ratchet Audit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex flex-col gap-4 flex-none pt-4 border-t border-white/5">
                  {analysis && (
                    <div className="flex items-center justify-between px-4 py-3 bg-[#002FA7]/5 border border-[#002FA7]/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#002FA7]/20 flex items-center justify-center">
                          <Database className="w-4 h-4 text-[#002FA7]" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Ingestion Analysis</div>
                          <div className="text-sm font-bold text-white">
                            {analysis.new} New Nodes // {analysis.existing} Enrichments
                          </div>
                        </div>
                      </div>
                      {isAnalyzing && (
                        <Loader2 className="w-4 h-4 text-[#002FA7] animate-spin" />
                      )}
                    </div>
                  )}
                  
                  <Button 
                    className="w-full bg-white text-black hover:bg-zinc-200 font-mono text-[10px] font-bold uppercase tracking-[0.2em]"
                    onClick={handleInitiateIngestion}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? '[ ANALYZING_PAYLOAD... ]' : '[ INITIATE_INGESTION ]'}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* PHASE 4: PROCESSING HUD */}
            {step === 'PROCESSING' && (
              <motion.div 
                key="processing" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }}
                className="p-6 flex flex-col items-center justify-center text-center"
              >
                <Loader2 className="w-12 h-12 text-[#002FA7] animate-spin mb-6" />
                <div className="text-xl font-bold mb-2">Processing Ingestion...</div>
                <div className="w-full max-w-md bg-zinc-900 rounded-full h-2 mb-4 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-[#002FA7]"
                  />
                </div>
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                  SYNC_PROGRESS: {progress}% // NODES: {csvData.length}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
