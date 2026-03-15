'use client'

import { useState, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import { Loader2 } from 'lucide-react'

interface SpreadsheetViewerProps {
  url: string
  filename: string
  onLoad?: () => void
}

export function SpreadsheetViewer({ url, filename, onLoad }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<Record<string, string[][]>>({})
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<{ row: number; col: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelectedCells(new Set())
    setLastSelected(null)

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
        if (!cancelled) {
          setError(e.message || 'Failed to parse spreadsheet')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [url])

  const rawRows = sheets[activeSheet] || []
  const headers = rawRows[0] || []
  const rows = rawRows.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined))

  const columns: ColumnDef<string[]>[] = headers.map((h, i) => ({
    id: String(i),
    header: String(h || `Col ${i + 1}`),
    accessorFn: (row) => row[i] ?? '',
  }))

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // Status bar stats
  const selectedValues = [...selectedCells]
    .map(key => {
      const [r, c] = key.split('-').map(Number)
      return rows[r]?.[c]
    })
    .filter(v => v !== '' && v !== undefined && v !== null)

  const numericValues = selectedValues
    .map(v => parseFloat(String(v).replace(/[$,%\s]/g, '')))
    .filter(n => !isNaN(n))

  const count = selectedValues.length
  const sum = numericValues.reduce((a, b) => a + b, 0)
  const avg = numericValues.length > 0 ? sum / numericValues.length : 0

  const handleCellClick = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    const key = `${rowIdx}-${colIdx}`

    if (e.shiftKey && lastSelected) {
      const r1 = Math.min(lastSelected.row, rowIdx)
      const r2 = Math.max(lastSelected.row, rowIdx)
      const c1 = Math.min(lastSelected.col, colIdx)
      const c2 = Math.max(lastSelected.col, colIdx)
      const next = new Set(e.ctrlKey || e.metaKey ? selectedCells : new Set<string>())
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) next.add(`${r}-${c}`)
      }
      setSelectedCells(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedCells)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedCells(next)
    } else {
      setSelectedCells(new Set([key]))
    }
    setLastSelected({ row: rowIdx, col: colIdx })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full gap-2 text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[10px] font-mono uppercase tracking-widest">Parsing data matrix...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-red-400 font-mono text-xs uppercase tracking-widest">
        Parse error: {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-zinc-600 font-mono text-xs uppercase tracking-widest">
        No data rows found
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Sheet tabs */}
      {sheetNames.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 shrink-0 border-b border-white/5">
          {sheetNames.map(name => (
            <button
              key={name}
              onClick={() => { setActiveSheet(name); setSelectedCells(new Set()); setLastSelected(null) }}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-t-md transition-colors ${
                activeSheet === name
                  ? 'bg-[#002FA7]/20 text-[#8ba6ff] border border-[#002FA7]/40 border-b-transparent'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto np-scroll min-h-0">
        <table className="w-full border-collapse text-[11px] font-mono">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                <th className="w-10 px-2 py-2 text-zinc-700 bg-zinc-950 border-b border-r border-white/5 text-right text-[10px] select-none">#</th>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className="px-3 py-2 text-left text-zinc-400 bg-zinc-950 border-b border-r border-white/5 whitespace-nowrap font-medium min-w-[80px] select-none"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIdx) => (
              <tr key={row.id} className="group hover:bg-white/[0.015]">
                <td className="px-2 py-1.5 text-zinc-700 bg-zinc-950/50 border-b border-r border-white/[0.04] text-right text-[10px] select-none">
                  {rowIdx + 1}
                </td>
                {row.getVisibleCells().map((cell, colIdx) => {
                  const isSelected = selectedCells.has(`${rowIdx}-${colIdx}`)
                  return (
                    <td
                      key={cell.id}
                      onClick={e => handleCellClick(rowIdx, colIdx, e)}
                      className={`px-3 py-1.5 border-b border-r border-white/[0.04] cursor-cell select-none transition-colors whitespace-nowrap max-w-[240px] truncate ${
                        isSelected
                          ? 'bg-[#002FA7]/20 text-zinc-100 outline outline-1 outline-[#002FA7]/50'
                          : 'text-zinc-300 hover:bg-white/[0.03]'
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-white/5 bg-zinc-950 text-[10px] font-mono">
        <span className="text-zinc-600">{rows.length.toLocaleString()} rows · {headers.length} cols</span>
        {count > 0 ? (
          <>
            <span className="text-zinc-500 border-l border-white/10 pl-4">
              Count: <span className="text-zinc-200">{count}</span>
            </span>
            {numericValues.length > 0 && (
              <>
                <span className="text-zinc-500">
                  Sum: <span className="text-zinc-200">{sum.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </span>
                <span className="text-zinc-500">
                  Avg: <span className="text-zinc-200">{avg.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-zinc-700">Click to select · Shift+click range · Ctrl+click multi</span>
        )}
      </div>
    </div>
  )
}
