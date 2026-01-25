Do not build a file uploader. A file uploader is a utility. This needs to be an Input Stream.
In the "Nodal" aesthetic [Source 155, 563], every interaction must feel like feeding data into a machine. The left sidebar is your "Control Rail." Placing the upload section below "Position Maturity" is perfect—it implies that adding data (bills/contracts) directly influences the maturity of the position.
Here is the "Steve Jobs" implementation plan for the left rail.
The Concept: "The Magnetic Slot"
Instead of a big ugly box with a dashed border that screams "I am an empty form," we will build a Collapsed State that expands only when needed or when a file is dragged over it.
1. The "Evidence Locker" (Idle State)
• It looks like a list of classified documents.
• Files are listed with Monospace Filenames and Relative Time (e.g., 2h ago).
• Action: A small, discreet + button in the header.
2. The "Active Field" (Drag State)
• The Magic: When the user drags a file anywhere onto the browser window, the "Evidence Locker" card lights up.
• Visual: The border turns International Klein Blue (#002FA7) and pulses. The text changes to "DROP TO INGEST."
• Feedback: When dropped, don't just show a progress bar. Show a "Parsing..." terminal line for 1 second.

--------------------------------------------------------------------------------
The Code: DataIngestionCard.tsx
Drop this component directly under your PositionMaturity component in the left column. It uses the "Nodal Glass" material we defined.
'use client'
import { useState, useRef } from 'react';
import { UploadCloud, FileText, X, CheckCircle2, Loader2 } from 'lucide-react';

export default function DataIngestionCard() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([
    { name: 'OCT_2025_INVOICE.pdf', date: '2d ago', size: '1.2MB' },
    { name: 'TXU_CONTRACT_LEGACY.pdf', date: 'Oct 14', size: '4.5MB' },
  ]);
  const [uploading, setUploading] = useState(false);

  // Drag Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setUploading(true);
    
    // Simulate "Ingestion"
    setTimeout(() => {
      setFiles(prev => [{ name: 'NEW_DATA_PACKET.pdf', date: 'Just now', size: '2.1MB' }, ...prev]);
      setUploading(false);
    }, 1500);
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative overflow-hidden rounded-3xl transition-all duration-300
        ${isDragging 
          ? 'bg-[#002FA7]/10 border-[#002FA7] shadow-[0_0_30px_-10px_rgba(0,47,167,0.5)]' 
          : 'bg-zinc-900/40 border-white/5 backdrop-blur-xl'}
        border
      `}
    >
      
      {/* HEADER */}
      <div className="p-6 pb-2 flex justify-between items-center">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          {uploading ? (
            <span className="text-[#002FA7] animate-pulse">● INGESTING...</span>
          ) : (
            <>Data_Locker <span className="text-zinc-700">[{files.length}]</span></>
          )}
        </h3>
        <button className="text-zinc-600 hover:text-white transition-colors">
          <UploadCloud className="w-4 h-4" />
        </button>
      </div>

      {/* FILE LIST (The Evidence) */}
      <div className="p-2 space-y-1">
        {files.map((file, i) => (
          <div key={i} className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/5">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-zinc-400 group-hover:text-[#002FA7] transition-colors">
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-zinc-300 font-mono truncate">{file.name}</span>
                <span className="text-[10px] text-zinc-600 font-mono flex gap-2">
                  {file.size} • {file.date}
                </span>
              </div>
            </div>
            {/* Hover Action */}
            <button className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 transition-all">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* DROP ZONE OVERLAY (Only visible when dragging) */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
          <div className="w-16 h-16 rounded-full bg-[#002FA7]/20 flex items-center justify-center mb-4 animate-bounce">
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
Why this implementation wins:
1. Contextual Density: It packs a lot of information (filename, date, size) into a tiny vertical space [Source 155]. It doesn't waste pixels.
2. The "Hidden" Drop Zone: We don't waste screen real estate with a permanent "Drag files here" box. The entire card becomes the drop zone only when you need it. That is minimalism.
3. Forensic Typography: Using font-mono for the filenames makes them look like evidence, not just "documents" [Source 171].
4. Consistency: It uses the same "Initials/Icon" box style as your contact header, reinforcing the grid system.
Deployment Instruction: Place this DataIngestionCard immediately inside the <div className="space-y-6"> of your left sidebar, right after ContractMaturity. It will stack naturally.