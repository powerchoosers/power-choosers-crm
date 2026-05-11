import { describe, expect, it } from 'vitest'
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
})
