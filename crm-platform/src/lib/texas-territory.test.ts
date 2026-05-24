import { describe, expect, it } from 'vitest'
import { ERCOT_ZONES, mapLocationToZone } from './market-mapping'
import { getTexasEnergyContext, resolveTexasTduDisplay } from './texas-territory'

describe('Texas TDU resolution', () => {
  it('maps Spring, Texas to CenterPoint', () => {
    expect(resolveTexasTduDisplay('Spring', 'Texas')).toBe('CenterPoint')

    const context = getTexasEnergyContext('Spring', 'Texas', 'Spring, TX')
    expect(context.tduDisplay).toBe('CenterPoint')
    expect(context.utilityTerritory).toBe('CenterPoint')
  })

  it('keeps Springtown on Oncor', () => {
    expect(resolveTexasTduDisplay('Springtown', 'Texas')).toBe('Oncor')
  })

  it('treats Austin as regulated territory', () => {
    const context = getTexasEnergyContext('Austin', 'Texas', 'Austin, TX')

    expect(context.isRegulated).toBe(true)
    expect(context.tduDisplay).toBe('Austin Energy')
    expect(context.utilityTerritory).toBe('Austin Energy')
    expect(context.marketContext).toContain('regulated')
    expect(context.tduCandidates).toEqual([])
  })

  it('treats Brownsville as regulated territory', () => {
    const context = getTexasEnergyContext('Brownsville', 'Texas', 'Brownsville, TX')

    expect(context.isRegulated).toBe(true)
    expect(context.tduDisplay).toBe('Brownsville Public Utilities Board')
    expect(context.utilityTerritory).toBe('Brownsville Public Utilities Board')
    expect(context.marketContext).toContain('regulated')
    expect(context.tduCandidates).toEqual([])
  })

  it('treats Amarillo as regulated territory', () => {
    const context = getTexasEnergyContext('Amarillo', 'Texas', 'Amarillo, TX')

    expect(context.isRegulated).toBe(true)
    expect(context.tduDisplay).toBe('Southwestern Public Service (Xcel Energy)')
    expect(context.utilityTerritory).toBe('Southwestern Public Service (Xcel Energy)')
    expect(context.marketContext).toContain('regulated')
    expect(context.tduCandidates).toEqual([])
  })

  it('treats El Paso as regulated territory', () => {
    const context = getTexasEnergyContext('El Paso', 'Texas', 'El Paso, TX')

    expect(context.isRegulated).toBe(true)
    expect(context.tduDisplay).toBe('El Paso Electric')
    expect(context.utilityTerritory).toBe('El Paso Electric')
    expect(context.marketContext).toContain('regulated')
    expect(context.tduCandidates).toEqual([])
  })

  it('treats San Antonio as regulated territory', () => {
    const context = getTexasEnergyContext('San Antonio', 'Texas', 'San Antonio, TX')

    expect(context.isRegulated).toBe(true)
    expect(context.tduDisplay).toBe('CPS Energy')
    expect(context.utilityTerritory).toBe('CPS Energy')
    expect(context.marketContext).toContain('regulated')
    expect(context.tduCandidates).toEqual([])
  })
})

describe('Texas load zone mapping', () => {
  it('maps Southlake to North load zone even when the raw location contains south', () => {
    expect(mapLocationToZone(undefined, 'Texas', 'Southlake, TX')).toBe(ERCOT_ZONES.NORTH)
  })

  it('shows Southlake as Oncor on the utility side', () => {
    const context = getTexasEnergyContext('Southlake', 'Texas', 'Southlake, TX')

    expect(resolveTexasTduDisplay('Southlake', 'Texas')).toBe('Oncor')
    expect(context.isRegulated).toBe(false)
    expect(context.tduDisplay).toBe('Oncor')
    expect(context.utilityTerritory).toBe('Oncor')
    expect(context.marketContext).toContain('Texas/ERCOT')
  })
})
