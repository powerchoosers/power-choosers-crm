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

function selKey(row: number, col: number) { return `${row}:${col}` }

function getRangeKeys(a: { row: number; col: number }, b: { row: number; col: number }): Set<string> {
  const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row)
  const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col)
  const keys = new Set<string>()
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      keys.add(selKey(r, c))
  return keys
}

const ROW_NUM_WIDTH = 48

export function SpreadsheetViewer({ url, filename, onLoad }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<Record<string, string[][]>>({})
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const lastRef = useRef<{ row: number; col: number } | null>(null)
  const dragRef = useRef<{ active: boolean; anchor: { row: number; col: number } | null }>({ active: false, anchor: null })
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

  // Stop drag on mouseup anywhere
  useEffect(() => {
    const up = () => { dragRef.current.active = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ── Data ──────────────────────────────────────────────────────────────────
  const rawRows = sheets[activeSheet] || []
  const headers = rawRows[0] || []
  const rows = useMemo(
    () => rawRows.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined)),
    [rawRows]
  )

  // ── Column widths ─────────────────────────────────────────────────────────
  const colWidths = useMemo(() =>
    headers.map((h, i) => {
      const maxLen = Math.max(
        String(h || '').length,
        ...rows.slice(0, 60).map(r => String(r[i] ?? '').length)
      )
      return Math.max(80, Math.min(220, maxLen * 7.5 + 24))
    }),
    [headers, rows]
  )

  const totalWidth = ROW_NUM_WIDTH + colWidths.reduce((s, w) => s + w, 0)

  // CSS grid template: row-number gutter + one track per column
  const gridCols = `${ROW_NUM_WIDTH}px ${colWidths.map(w => `${w}px`).join(' ')}`

  // ── Virtualizer ───────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 15,
  })

  // ── Selection handlers ────────────────────────────────────────────────────
  const selectColumn = useCallback((colIdx: number) => {
    const next = new Set<string>()
    for (let r = 0; r < rows.length; r++) next.add(selKey(r, colIdx))
    setSelected(next)
    lastRef.current = { row: 0, col: colIdx }
  }, [rows.length])

  const handleCellMouseDown = useCallback((rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { active: true, anchor: { row: rowIdx, col: colIdx } }

    if (e.shiftKey && lastRef.current) {
      setSelected(prev => {
        const base = e.ctrlKey || e.metaKey ? prev : new Set<string>()
        const range = getRangeKeys(lastRef.current!, { row: rowIdx, col: colIdx })
        return new Set([...base, ...range])
      })
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev)
        const key = selKey(rowIdx, colIdx)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    } else {
      setSelected(new Set([selKey(rowIdx, colIdx)]))
    }
    lastRef.current = { row: rowIdx, col: colIdx }
  }, [])

  const handleCellMouseEnter = useCallback((rowIdx: number, colIdx: number) => {
    if (!dragRef.current.active || !dragRef.current.anchor) return
    const range = getRangeKeys(dragRef.current.anchor, { row: rowIdx, col: colIdx })
    setSelected(range)
    lastRef.current = { row: rowIdx, col: colIdx }
  }, [])

  // ── Status bar ────────────────────────────────────────────────────────────
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
    }
  }, [selected, rows])

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

      {/* Scroll container */}
      <div ref={scrollRef} className="flex-1 overflow-auto np-scroll min-h-0 select-none">
        <div style={{ minWidth: totalWidth }}>

          {/* Sticky header */}
          <div
            className="sticky top-0 z-20 bg-zinc-950"
            style={{ display: 'grid', gridTemplateColumns: gridCols }}
          >
            {/* Row number gutter header */}
            <div className="px-2 py-2 text-zinc-700 border-b border-r border-white/10 text-right text-[10px] font-mono select-none" />
            {headers.map((h, i) => (
              <div
                key={i}
                onClick={() => selectColumn(i)}
                title="Click to select entire column"
                className="px-3 py-2 text-left text-zinc-400 border-b border-r border-white/10 font-mono font-medium text-[11px] truncate cursor-pointer hover:bg-[#002FA7]/10 hover:text-[#8ba6ff] transition-colors select-none"
              >
                {String(h || `Col ${i + 1}`)}
              </div>
            ))}
          </div>

          {/* Virtualised body */}
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(vRow => {
              const rowIdx = vRow.index
              const row = rows[rowIdx]
              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gridCols,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="hover:bg-white/[0.012]"
                >
                  {/* Row number */}
                  <div className="px-2 py-1.5 text-zinc-700 bg-zinc-950/80 border-b border-r border-white/[0.06] text-right text-[10px] font-mono select-none">
                    {rowIdx + 1}
                  </div>

                  {headers.map((_, colIdx) => {
                    const isSel = selected.has(selKey(rowIdx, colIdx))
                    return (
                      <div
                        key={colIdx}
                        onMouseDown={e => handleCellMouseDown(rowIdx, colIdx, e)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                        className={`px-3 py-1.5 border-b border-r border-white/[0.06] font-mono text-[11px] truncate cursor-cell transition-colors ${
                          isSel
                            ? 'bg-[#002FA7]/25 text-zinc-100'
                            : 'text-zinc-300 hover:bg-white/[0.03]'
                        }`}
                      >
                        {String(row?.[colIdx] ?? '')}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

        </div>
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
          <span className="text-zinc-700">Click header to select column · Click+drag or Shift+click to select range · Ctrl+click multi</span>
        )}
      </div>
    </div>
  )
}
