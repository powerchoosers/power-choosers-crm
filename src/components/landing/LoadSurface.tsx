'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { sampleLoad } from './loadProfile'

const LoadSurfaceScene = dynamic(() => import('./LoadSurfaceScene'), { ssr: false })

const SVG_ROWS = 18
const SVG_COLS = 72
const VIEW_W = 800
const VIEW_H = 560

type Ridge = { line: string; area: string; opacity: number; peak: { x: number; y: number } | null }

/** Static drawing of the same data, for screens that do not get the 3D scene. */
function buildRidges(): Ridge[] {
  const ridges: Ridge[] = []
  for (let r = 0; r < SVG_ROWS; r++) {
    const depth = r / (SVG_ROWS - 1)
    const day = depth
    const rowWidth = VIEW_W * (0.62 + 0.38 * depth)
    const left = (VIEW_W - rowWidth) / 2
    const baseY = 190 + depth * 330
    const scale = 90 + depth * 70

    let line = ''
    let peak: Ridge['peak'] = null
    let peakMark = 0.75
    for (let c = 0; c < SVG_COLS; c++) {
      const u = c / (SVG_COLS - 1)
      const { height, mark } = sampleLoad(u * 24, day)
      const x = left + u * rowWidth
      const y = baseY - height * scale
      line += `${c === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      if (mark > peakMark) {
        peakMark = mark
        peak = { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) }
      }
    }
    const area = `${line}L${(left + rowWidth).toFixed(1)},${baseY.toFixed(1)}L${left.toFixed(1)},${baseY.toFixed(1)}Z`
    ridges.push({ line, area, opacity: 0.22 + depth * 0.5, peak })
  }
  return ridges
}

const RIDGES = buildRidges()

type Mode = 'pending' | '3d' | 'static'

/**
 * Hero visual.
 * - Normally: nothing at first, then the 3D scene fades in as it rises from flat. The static
 *   drawing is not shown first, so there is one intro instead of a swap.
 * - Reduced motion or no WebGL: the static drawing fades in instead.
 */
export function LoadSurface() {
  const [mode, setMode] = useState<Mode>('pending')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let webgl = false
    try {
      const canvas = document.createElement('canvas')
      webgl = Boolean(canvas.getContext('webgl2'))
    } catch {
      webgl = false
    }
    setMode(!reduced && webgl ? '3d' : 'static')
  }, [])

  // The drawing only shows when 3D is not available.
  const svgDesktop = mode === 'static' ? 'opacity-100' : 'opacity-0'

  return (
    <div className="absolute inset-0" aria-hidden>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMax meet"
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${svgDesktop}`}
      >
        {RIDGES.map((ridge, i) => (
          <g key={i}>
            <path d={ridge.area} fill="#09090b" />
            <path d={ridge.line} fill="none" stroke="#5b7cff" strokeWidth="1.2" strokeOpacity={ridge.opacity} />
            {ridge.peak ? <circle cx={ridge.peak.x} cy={ridge.peak.y} r="3.5" fill="#ffffff" /> : null}
          </g>
        ))}
      </svg>
      {mode === '3d' ? (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <LoadSurfaceScene onReady={() => setReady(true)} />
        </div>
      ) : null}
    </div>
  )
}
