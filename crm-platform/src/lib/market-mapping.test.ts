import { describe, expect, it } from 'vitest'
import { ERCOT_ZONES, mapLocationToZone } from './market-mapping'

describe('mapLocationToZone', () => {
  it('does not misclassify Southlake as South', () => {
    expect(mapLocationToZone('Southlake', 'Texas')).toBe(ERCOT_ZONES.NORTH)
    expect(mapLocationToZone(undefined, 'Texas', 'Southlake, TX')).toBe(ERCOT_ZONES.NORTH)
  })
})
