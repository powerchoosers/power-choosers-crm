import { useSyncStore } from '@/store/syncStore'
import { motion } from 'framer-motion'
import { Terminal, X, Loader2, Download } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/components/ui/button'
import Papa from 'papaparse'
import { useEffect, useRef } from 'react'

export function IngestionTerminalPanel() {
  const { setRightPanelMode } = useUIStore()
  const { isIngesting, ingestProgress, ingestTotal, ingestVector, ingestLogs, ingestErrors, cancelIngestion } = useSyncStore()
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ingestLogs])

  const handleDownloadQuarantine = () => {
    if (ingestErrors.length === 0) return
    const errorCsv = Papa.unparse(ingestErrors.map(e => ({ Error: e.error, ...e.row })));
    const blob = new Blob([errorCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quarantine_log_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-zinc-950"
    >
      <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-zinc-950/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#002FA7]/10 flex items-center justify-center border border-[#002FA7]/20">
            <Terminal className="w-4 h-4 text-[#002FA7]" />
          </div>
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-300">Ingestion Terminal</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7] animate-pulse" />
              <span className="text-[9px] font-mono text-[#002FA7] uppercase tracking-widest">Global Sync</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setRightPanelMode('DEFAULT')}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
        {/* HUD Stats */}
        <div className="grid grid-cols-2 gap-4 shrink-0">
          <div className="p-4 rounded-xl border border-white/5 bg-black/40">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Vector</div>
            <div className="text-sm font-bold text-white">{ingestVector || 'AWAITING_PAYLOAD'}</div>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-black/40">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Progress</div>
            <div className="text-sm font-bold text-white">{ingestProgress}%</div>
          </div>
          <div className="p-4 rounded-xl border border-white/5 bg-black/40">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Nodes</div>
            <div className="text-sm font-bold text-white">{ingestTotal}</div>
          </div>
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <div className="text-[10px] font-mono text-red-500/70 uppercase tracking-widest mb-1">Anomalies</div>
            <div className="text-sm font-bold text-red-500">{ingestErrors.length}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden shrink-0">
          <motion.div 
            className="h-full bg-[#002FA7]"
            initial={{ width: 0 }}
            animate={{ width: `${ingestProgress}%` }}
            transition={{ ease: "linear", duration: 0.3 }}
          />
        </div>

        {/* Terminal Feed */}
        <div className="flex-1 border border-white/5 bg-[#09090b] rounded-xl overflow-hidden flex flex-col relative">
          <div className="h-8 border-b border-white/5 bg-black/40 flex items-center px-4 shrink-0">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">System Feed</span>
            {isIngesting && <Loader2 className="w-3 h-3 text-zinc-500 animate-spin ml-auto" />}
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-1">
            {ingestLogs.length === 0 ? (
              <div className="text-xs font-mono text-zinc-600 italic">No active feed.</div>
            ) : (
              ingestLogs.map((log, i) => (
                <div key={i} className={`text-[10px] font-mono ${log.includes('[ERROR]') ? 'text-red-400' : log.includes('[SUCCESS]') ? 'text-emerald-400' : log.includes('[WARNING]') ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Controls */}
        <div className="shrink-0 flex gap-3">
          {isIngesting ? (
            <Button 
              variant="outline"
              onClick={() => cancelIngestion()}
              className="flex-1 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-mono text-[10px] uppercase tracking-widest"
            >
              <X className="w-4 h-4 mr-2" /> Abort Ingestion
            </Button>
          ) : (
            ingestErrors.length > 0 && (
              <Button 
                variant="outline"
                onClick={handleDownloadQuarantine}
                className="flex-1 border-amber-500/20 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 font-mono text-[10px] uppercase tracking-widest"
              >
                <Download className="w-4 h-4 mr-2" /> Download Quarantine Log
              </Button>
            )
          )}
        </div>
      </div>
    </motion.div>
  )
}
