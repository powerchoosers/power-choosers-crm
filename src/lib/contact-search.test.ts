import { describe, expect, it } from 'vitest'
import { matchesContactSearch } from './contact-search'

describe('matchesContactSearch', () => {
  const marjorie = {
    name: 'Marjorie Si***s',
    firstName: 'Marjorie',
    lastName: 'Si***s',
    title: 'Accounting Controller',
  }

  it('matches a full surname against Apollo asterisk masking', () => {
    expect(matchesContactSearch(marjorie, 'Marjorie Sims')).toBe(true)
  })

  it('still supports Apollo initial-only surname masking', () => {
    expect(matchesContactSearch({ firstName: 'John', lastName: 'S.' }, 'John Smith')).toBe(true)
  })

  it('matches first-name-only searches', () => {
    expect(matchesContactSearch(marjorie, 'Marjorie')).toBe(true)
  })

  it('does not accept a surname that conflicts with the visible masked letters', () => {
    expect(matchesContactSearch(marjorie, 'Marjorie Sanders')).toBe(false)
  })

  it('continues to match job titles', () => {
    expect(matchesContactSearch(marjorie, 'Accounting Controller')).toBe(true)
  })
})
