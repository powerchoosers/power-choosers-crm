'use client'

import { useState, useEffect, useCallback } from 'react';
import { UploadCloud, FileText, X, Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Document {
  id: string;
  name: string;
  size: string;
  url: string;
  storage_path: string;
  created_at: string;
}

interface DataIngestionCardProps {
  accountId?: string;
  onIngestionComplete?: () => void; // Callback to trigger parent animation
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function DataIngestionCard({ accountId, onIngestionComplete }: DataIngestionCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const queryClient = useQueryClient();

  // Fetch Documents
  useEffect(() => {
    if (!accountId) return;
    
    const fetchDocuments = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error fetching documents:', error);
      } else {
        setFiles(data || []);
      }
      setLoading(false);
    };

    fetchDocuments();
    
    // Realtime subscription
    const channel = supabase
      .channel('documents_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'documents',
        filter: `account_id=eq.${accountId}`
      }, () => {
        fetchDocuments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId]);

  // Drag Handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!accountId) return;
    setIsDragging(true);
  }, [accountId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Check if we're actually leaving the container (prevent flickering)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!accountId) {
      toast.error('No account context found');
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    setUploading(true);
    const toastId = toast.loading('Ingesting data packets...');

    try {
      for (const file of droppedFiles) {
        // 1. Upload to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `accounts/${accountId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('vault')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Insert into DB (url is optional as we'll use signed URLs for private vault)
        const { error: dbError } = await supabase
          .from('documents')
          .insert({
            account_id: accountId,
            name: file.name,
            size: formatBytes(file.size),
            type: file.type,
            storage_path: filePath,
            url: '' // Placeholder for private files
          });

        if (dbError) throw dbError;

        // 3. AI Analysis
        toast.loading('Neuro-Processing Document...', { id: toastId });

        try {
          const response = await fetch('/api/analyze-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              filePath,
              fileName: file.name
            })
          });

          const result = await response.json();

          if (!response.ok) {
            console.error('AI Error:', result);
            toast.error('AI Extraction Failed', { id: toastId });
          } else {
            const type = result.analysis?.type === 'SIGNED_CONTRACT' ? 'CONTRACT SECURED' : 'BILL ANALYZED';
            toast.success(`${type}: Data Nodes Updated`, { id: toastId });
            
            // ============================================
            // THE REFRACTION EVENT (from build.md)
            // ============================================
            
            // 1. Trigger blur/desaturation state
            setIsRecalibrating(true);
            
            // 2. Animate Klein Blue scan line
            setScanProgress(0);
            const scanDuration = 800; // ms
            const scanInterval = 20; // ms
            const scanSteps = scanDuration / scanInterval;
            const scanIncrement = 100 / scanSteps;
            
            let currentScan = 0;
            const scanTimer = setInterval(() => {
              currentScan += scanIncrement;
              if (currentScan >= 100) {
                setScanProgress(100);
                clearInterval(scanTimer);
              } else {
                setScanProgress(currentScan);
              }
            }, scanInterval);
            
            // 3. Invalidate queries to trigger data refresh
            queryClient.invalidateQueries({ queryKey: ['account', accountId] });
            
            // 4. Callback to trigger parent component animations
            onIngestionComplete?.();
            
            // 5. Clear refraction state after animation completes
            setTimeout(() => {
              setIsRecalibrating(false);
              setScanProgress(0);
            }, 1500);
          }
        } catch (aiErr) {
          console.error('AI Request Failed:', aiErr);
          // Don't fail the whole upload if AI fails
          toast.warning('Document Saved (AI Offline)', { id: toastId });
        }
      }
      // toast.success('Ingestion complete', { id: toastId }); // Handled above
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Ingestion failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  }, [accountId]);

  const handleDelete = async (doc: Document) => {
    try {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from('vault')
        .remove([doc.storage_path]);
      
      if (storageError) {
        console.error('Storage delete error:', storageError);
      }

      // 2. Delete from DB
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;
      toast.success('Document purged');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Purge failed');
    }
  };

  const handleDownload = async (doc: Document) => {
     try {
       const { data, error } = await supabase.storage
         .from('vault')
         .createSignedUrl(doc.storage_path, 60); // 60 seconds access

       if (error) throw error;
       if (data?.signedUrl) {
         window.open(data.signedUrl, '_blank');
       }
     } catch (err) {
       console.error('Signed URL error:', err);
       toast.error('Failed to access file');
     }
  };

  if (!accountId) {
    return (
      <div className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl overflow-hidden flex flex-col opacity-50 cursor-not-allowed">
        <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/[0.02]">
          <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            Data_Locker <span className="text-zinc-700">[OFFLINE]</span>
          </h3>
        </div>
        <div className="p-6">
          <div className="text-xs text-zinc-600 font-mono uppercase tracking-widest">
            Account link missing.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative overflow-hidden rounded-2xl transition-all duration-300
        ${isDragging 
          ? 'bg-[#002FA7]/10 border-[#002FA7] shadow-[0_0_30px_-10px_rgba(0,47,167,0.5)]' 
          : 'bg-zinc-900/40 border-white/5 backdrop-blur-xl'}
        border flex flex-col
        ${isRecalibrating ? 'grayscale' : ''}
      `}
    >
      {/* THE REFRACTION EVENT OVERLAY */}
      {isRecalibrating && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          {/* High-Intensity Blur Layer */}
          <div className="absolute inset-0 backdrop-blur-xl bg-black/30 animate-in fade-in duration-200" />
          
          {/* Klein Blue Laser Scan Line */}
          <div 
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#002FA7] to-transparent shadow-[0_0_20px_#002FA7] transition-all duration-100 ease-linear"
            style={{ top: `${scanProgress}%` }}
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-[#002FA7] blur-md opacity-70" />
          </div>
          
          {/* Scan line trail effect */}
          {scanProgress > 10 && (
            <div 
              className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#002FA7]/30 to-transparent transition-all duration-100"
              style={{ top: `${scanProgress - 5}%` }}
            />
          )}
        </div>
      )}
    
      {/* HEADER - NOW INSIDE CONTAINER */}
      <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/[0.02]">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          {uploading ? (
            <span className="text-[#002FA7] animate-pulse">● INGESTING...</span>
          ) : (
            <>Data_Locker <span className="text-zinc-700">[{files.length}]</span></>
          )}
        </h3>
        <label className="text-zinc-600 hover:text-white transition-colors cursor-pointer">
          <UploadCloud className="w-4 h-4" />
          <input 
            type="file" 
            className="hidden" 
            multiple 
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const fakeEvent = {
                  preventDefault: () => {},
                  dataTransfer: { files: e.target.files }
                } as unknown as React.DragEvent;
                handleDrop(fakeEvent);
              }
            }}
          />
        </label>
      </div>

      {/* FILE LIST (The Evidence) */}
      <div className="p-2 space-y-1 flex-1">
          {loading && files.length === 0 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-700" />
            </div>
          ) : files.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-widest">
                No Evidence Found
              </p>
            </div>
          ) : (
            files.map((file) => (
              <div key={file.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/5">
                <div 
                  className="flex items-center gap-3 overflow-hidden flex-1"
                  onClick={() => handleDownload(file)}
                >
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-zinc-400 group-hover:text-[#002FA7] transition-colors">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-zinc-300 font-mono truncate">{file.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono flex gap-2">
                      {file.size} • {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                {/* Hover Action */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* DROP ZONE OVERLAY (Only visible when dragging) */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-[#002FA7]/20 flex items-center justify-center mb-4 animate-bounce">
              <UploadCloud className="w-8 h-8 text-[#002FA7]" />
            </div>
            <p className="text-[#002FA7] font-mono text-sm tracking-widest">RELEASE TO INGEST</p>
          </div>
        )}

        {/* UPLOADING STATE (Terminal Effect) */}
        {uploading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div className="h-full bg-[#002FA7] animate-progress w-full origin-left" />
          </div>
        )}
      </div>
    );
}
