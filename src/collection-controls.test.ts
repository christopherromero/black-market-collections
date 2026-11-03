import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY, activeFilters, compareCollectorNumbers, isQuery, matchesQuery } from './domain'
import { holdings } from './fixtures'
import { capturedPriceChange } from './price-history'
import { loadSavedView } from './storage'
import type { QuoteObservation } from './quote-store'

describe('flexible set filters', () => {
  it('includes any selected set, case-insensitively, while retaining other filters', () => {
    const row = { ...holdings[0], set: 'ACR', finish: 'Foil' as const }
    const query = { ...EMPTY_QUERY, sets: ['acr', 'dsk'], finish: 'Foil' }
    expect(matchesQuery(row, query, [])).toBe(true)
    expect(matchesQuery({ ...row, set: 'otj' }, query, [])).toBe(false)
    expect(matchesQuery({ ...row, finish: 'Nonfoil' }, query, [])).toBe(false)
    expect(activeFilters(query)).toBe(2)
  })

  it('supports excluding multiple sets and no-selection means any set', () => {
    const row = { ...holdings[0], set: 'acr' }
    expect(matchesQuery(row, { ...EMPTY_QUERY, sets: ['acr', 'dsk'], excludeSets: true }, [])).toBe(false)
    expect(matchesQuery(row, { ...EMPTY_QUERY, sets: ['dsk'], excludeSets: true }, [])).toBe(true)
    expect(matchesQuery(row, { ...EMPTY_QUERY, excludeSets: true }, [])).toBe(true)
  })

  it('validates set selections and preserves saved filters from before set controls existed', () => {
    expect(isQuery({ ...EMPTY_QUERY, sets: 'acr' })).toBe(false)
    expect(isQuery({ ...EMPTY_QUERY, sets: [' '] })).toBe(false)
    expect(isQuery({ ...EMPTY_QUERY, excludeSets: 'yes' })).toBe(false)
    const legacy = { ...EMPTY_QUERY, search: 'archive' }
    const { sets: _sets, excludeSets: _exclude, ...oldQuery } = legacy
    const saved = loadSavedView({ getItem: () => JSON.stringify({ name: 'Existing view', query: oldQuery }) })
    expect(saved).toEqual({ view: { name: 'Existing view', query: { ...EMPTY_QUERY, search: 'archive' } }, error: null })
    const current = { ...EMPTY_QUERY, sets: ['acr', 'dsk'], excludeSets: true }
    expect(loadSavedView({ getItem: () => JSON.stringify({ name: 'Sets', query: current }) }).view?.query).toEqual(current)
  })

  it('sorts collector numbers naturally, retaining alphanumeric printing identifiers', () => {
    expect(['136', '44', '2', '136a', 'PCY-10', 'PCY-2'].sort(compareCollectorNumbers)).toEqual(['2', '44', '136', '136a', 'PCY-2', 'PCY-10'])
  })
})

const observation = (time: string, value: number | null): QuoteObservation => ({
  id: time, printingKey: 'example', retrievedAt: time,
  cents: { Nonfoil: value, Foil: null, Etched: null }, sourceUrl: 'https://scryfall.com/card/tst/1',
})

describe('captured price changes', () => {
  it('uses chronological actual observations and never invents history from a single quote', () => {
    const first = observation('2026-01-01T12:00:00Z', 100)
    const last = observation('2026-01-03T12:00:00Z', 150)
    expect(capturedPriceChange([last, first], 'Nonfoil')).toEqual({ cents: 50, percent: 50 })
    expect(capturedPriceChange([first], 'Nonfoil')).toBeNull()
    expect(capturedPriceChange([first, last], 'Foil')).toBeNull()
  })

  it('keeps missing latest quotes unknown and cannot divide by a zero starting price', () => {
    expect(capturedPriceChange([observation('2026-01-01', 100), observation('2026-01-02', null)], 'Nonfoil')).toBeNull()
    expect(capturedPriceChange([observation('2026-01-01', 0), observation('2026-01-02', 20)], 'Nonfoil')).toEqual({ cents: 20, percent: null })
  })
})
