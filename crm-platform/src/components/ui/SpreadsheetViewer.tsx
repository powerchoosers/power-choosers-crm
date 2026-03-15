'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as XLSX from 'xlsx'
import { Loader2 } from 'lucide-react'

interface SpreadsheetViewerProps {
  url: string
  filename: string
  onLoad?: () => void
}

// Selection stored as col index → Set of row indices
type ColSelection = Map<number, Set<number>>

function selKey(row: number, col: number) { return `${row}:${col}` }

export function SpreadsheetViewer({ url, filename, onLoad }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<Record<string, string[][]>>({})
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selection: flat Set of "row:col" keys
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastRef = useRef<{ row: number; col: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelected(new Set())
    lastRef.current = null

    const load = async () => {
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buf = await resp.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        if (cancelled) return

        const sheetData: Record<string, string[][]> = {}
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          const json = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
          sheetData[name] = json as string[][]
        }

        setSheets(sheetData)
        setSheetNames(wb.SheetNames)
        setActiveSheet(wb.SheetNames[0])
        setLoading(false)
        onLoad?.()
      } catch (e: any) {
        if (!cancelled) { setError(e.message || 'Failed to parse'); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [url])

  // ── Data ─────────────────────────────────────────────────────────────────
  const rawRows = sheets[activeSheet] || []
  const headers = rawRows[0] || []
  const rows = useMemo(
    () => rawRows.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined)),
    [rawRows]
  )

  // ── Virtualizer ───────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 20,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()

  // ── Selection logic ───────────────────────────────────────────────────────
  const selectColumn = useCallback((colIdx: number) => {
    const next = new Set<string>()
    rows.forEach((_, r) => next.add(selKey(r, colIdx)))
    setSelected(next)
    lastRef.current = { row: 0, col: colIdx }
  }, [rows])

  const handleCellClick = useCallback((rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    e.preventDefault()
    const key = selKey(rowIdx, colIdx)

    if (e.shiftKey && lastRef.current) {
      const r1 = Math.min(lastRef.current.row, rowIdx)
      const r2 = Math.max(lastRef.current.row, rowIdx)
      const c1 = Math.min(lastRef.current.col, colIdx)
      const c2 = Math.max(lastRef.current.col, colIdx)
      const base = e.ctrlKey || e.metaKey ? selected : new Set<string>()
      const next = new Set(base)
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++)
          next.add(selKey(r, c))
      setSelected(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelected(next)
    } else {
      setSelected(new Set([key]))
    }
    lastRef.current = { row: rowIdx, col: colIdx }
  }, [selected])

  // ── Status bar stats (memoized) ───────────────────────────────────────────
  const stats = useMemo(() => {
    if (selected.size === 0) return null
    const vals: string[] = []
    selected.forEach(k => {
      const [r, c] = k.split(':').map(Number)
      const v = rows[r]?.[c]
      if (v !== '' && v !== undefined && v !== null) vals.push(String(v))
    })
    const nums = vals.map(v => parseFloat(String(v).replace(/[$,%\s]/g, ''))).filter(n => !isNaN(n))
    const sum = nums.reduce((a, b) => a + b, 0)
    return {
      count: vals.length,
      sum: nums.length > 0 ? sum : null,
      avg: nums.length > 0 ? sum / nums.length : null,
      numericCount: nums.length,
    }
  }, [selected, rows])

  // ── Column widths (estimate) ──────────────────────────────────────────────
  const colWidths = useMemo(() => {
    return headers.map((h, i) => {
      const maxLen = Math.max(
        String(h || '').length,
        ...rows.slice(0, 50).map(r => String(r[i] ?? '').length)
      )
      return Math.max(80, Math.min(240, maxLen * 8 + 24))
    })
  }, [headers, rows])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center w-full h-full gap-2 text-zinc-500">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-[10px] font-mono uppercase tracking-widest">Parsing data matrix…</span>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center w-full h-full text-red-400 font-mono text-xs uppercase tracking-widest">
      Parse error: {error}
    </div>
  )

  if (rows.length === 0) return (
    <div className="flex items-center justify-center w-full h-full text-zinc-600 font-mono text-xs uppercase tracking-widest">
      No data rows found
    </div>
  )

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-zinc-950">

      {/* Sheet tabs */}
      {sheetNames.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 shrink-0 border-b border-white/5 overflow-x-auto">
          {sheetNames.map(name => (
            <button
              key={name}
              onClick={() => { setActiveSheet(name); setSelected(new Set()); lastRef.current = null }}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-t-md transition-colors whitespace-nowrap flex-shrink-0 ${
                activeSheet === name
                  ? 'bg-[#002FA7]/20 text-[#8ba6ff] border border-[#002FA7]/40'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable table */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto np-scroll min-h-0"
        onMouseLeave={() => {/* keep selection on mouse leave */}}
      >
        <table className="border-collapse text-[11px] font-mono" style={{ minWidth: '100%' }}>
          <thead className="sticky top-0 z-20">
            <tr>
              {/* Row-number gutter header */}
              <th className="w-10 px-2 py-2 text-zinc-700 bg-zinc-950 border-b border-r border-white/5 text-right text-[10px] select-none sticky left-0 z-30">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => selectColumn(i)}
                  title="Click to select entire column"
                  style={{ minWidth: colWidths[i], maxWidth: colWidths[i] }}
                  className="px-3 py-2 text-left text-zinc-400 bg-zinc-950 border-b border-r border-white/5 font-medium select-none cursor-pointer hover:bg-[#002FA7]/10 hover:text-[#8ba6ff] transition-colors truncate"
                >
                  {String(h || `Col ${i + 1}`)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualRows.map(vRow => {
              const rowIdx = vRow.index
              const row = rows[rowIdx]
              return (
                <tr
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="hover:bg-white/[0.015]"
                >
                  {/* Row number */}
                  <td className="w-10 px-2 py-1.5 text-zinc-700 bg-zinc-950/80 border-b border-r border-white/[0.04] text-right text-[10px] select-none sticky left-0">
                    {rowIdx + 1}
                  </td>
                  {headers.map((_, colIdx) => {
                    const isSelected = selected.has(selKey(rowIdx, colIdx))
                    return (
                      <td
                        key={colIdx}
                        onMouseDown={e => handleCellClick(rowIdx, colIdx, e)}
                        style={{ minWidth: colWidths[colIdx], maxWidth: colWidths[colIdx] }}
                        className={`px-3 py-1.5 border-b border-r border-white/[0.04] cursor-cell truncate transition-colors ${
                          isSelected
                            ? 'bg-[#002FA7]/25 text-zinc-100'
                            : 'text-zinc-300 hover:bg-white/[0.03]'
                        }`}
                      >
                        {String(row?.[colIdx] ?? '')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-white/5 bg-zinc-950 text-[10px] font-mono">
        <span className="text-zinc-600">{rows.length.toLocaleString()} rows · {headers.length} cols</span>
        {stats ? (
          <>
            <span className="text-zinc-500 border-l border-white/10 pl-4">
              Count: <span className="text-zinc-100 font-medium">{stats.count}</span>
            </span>
            {stats.sum !== null && (
              <>
                <span className="text-zinc-500">
                  Sum: <span className="text-zinc-100 font-medium">{stats.sum.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </span>
                <span className="text-zinc-500">
                  Avg: <span className="text-zinc-100 font-medium">{stats.avg!.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-zinc-700">Click column header to select all · Click cell · Shift+click range · Ctrl+click multi</span>
        )}
      </div>
    </div>
  )
}
