/**
 * Shared shape for the hero visual: one building's electricity use across a year.
 * `hour` runs 0-24 across the day, `day` runs 0-1 across the year.
 * Used by both the WebGL scene and the static SVG fallback so they match.
 */

export type Spike = { day: number; hour: number; height: number }

/** The few hours that set peak charges. These are what the visual highlights. */
export const SPIKES: Spike[] = [
  { day: 0.2, hour: 9, height: 0.55 },
  { day: 0.53, hour: 16.5, height: 1 },
  { day: 0.66, hour: 15.5, height: 0.8 },
  { day: 0.86, hour: 18, height: 0.6 },
]

/** How much of a spike's height is added on top of normal use. */
export const SPIKE_LIFT = 0.62

function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * `base` is normal use, `lift` is the extra height from a peak event (0 almost everywhere),
 * `mark` is 0-1 for how close this point is to the centre of a peak, `height` is base + lift.
 */
export function sampleLoad(hour: number, day: number) {
  const workday = Math.exp(-(((hour - 13) / 4.4) ** 2))
  const summer = 0.5 + 0.5 * Math.exp(-(((day - 0.58) / 0.22) ** 2))
  const cooling = Math.exp(-(((hour - 16.5) / 1.8) ** 2)) * summer * summer * 0.45
  const noise = (hash(Math.round(hour * 8), Math.round(day * 400)) - 0.5) * 0.012
  const base = 0.12 + workday * (0.35 + 0.25 * summer) + cooling + noise

  let lift = 0
  let mark = 0
  for (const spike of SPIKES) {
    const g = Math.exp(-(((hour - spike.hour) / 0.42) ** 2) - ((day - spike.day) / 0.02) ** 2)
    lift = Math.max(lift, g * spike.height * SPIKE_LIFT)
    mark = Math.max(mark, g)
  }

  return { base, lift, mark, height: base + lift }
}
