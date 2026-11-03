import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY, activeFilters, allocated, allocationConflicts, composition, deckSummary, exportCsv, isQuery, matchesQuery, summarize, totalValue } from './domain'
import { cards, decks, holdings, priceObservations } from './fixtures'

describe('synthetic collection invariants', () => {
  it('uses unique holdings, reconciles quantities, and never overallocates copies', () => {
    expect(new Set(holdings.map(row => row.id)).size).toBe(holdings.length)
    expect(new Set(cards.map(card => card.id)).size).toBe(cards.length)
    for (const row of holdings) {
      expect(row.quantity).toBeGreaterThan(0)
      expect(allocated(row)).toBeLessThanOrEqual(row.quantity)
      if (row.priceCents !== null) expect(Number.isInteger(row.priceCents)).toBe(true)
    }
    const stats = summarize(holdings)
    expect(stats.copies).toBe(stats.pricedCopies + stats.unpricedCopies)
    expect(stats.identities).toBe(cards.length)
    expect(stats.valueCents).toBe(holdings.reduce((sum, row) => sum + (totalValue(row) ?? 0), 0))
    expect(composition(holdings).reduce((sum, group) => sum + group.copies, 0)).toBe(stats.copies)
    expect(composition(holdings).find(group => group.name === 'Multicolor')?.copies).toBeGreaterThan(0)
  })

  it('does not present missing prices as zero', () => {
    const missing = holdings.filter(row => row.priceCents === null)
    expect(missing.length).toBeGreaterThan(0)
    expect(summarize(missing).valueCents).toBeNull()
    expect(summarize(missing).coverage).toBe(0)
    expect(totalValue(missing[0])).toBeNull()
    expect(summarize([]).coverage).toBe(0)
  })

  it('keeps finish series distinct and gaps null', () => {
    const nonfoil = holdings.find(row => row.card.id === 'aetherwell' && row.finish === 'Nonfoil')!
    const foil = holdings.find(row => row.card.id === 'aetherwell' && row.finish === 'Foil')!
    expect(priceObservations(nonfoil).at(-1)?.cents).toBe(nonfoil.priceCents)
    expect(priceObservations(foil).at(-1)?.cents).toBe(foil.priceCents)
    expect(nonfoil.priceCents).not.toBe(foil.priceCents)
    expect(priceObservations(nonfoil)[7].cents).toBeNull()
  })
})

describe('full-dataset query semantics', () => {
  it('searches names, rules, and types case-insensitively', () => {
    expect(holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, search: '  AETHERWELL ' }, decks))).toHaveLength(3)
    expect(holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, search: 'patient' }, decks))).toHaveLength(3)
    expect(holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, search: 'not-a-card' }, decks))).toHaveLength(0)
  })
  it('supports OR/AND color groups, exclusions, and outer AND conditions', () => {
    const any = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, colors: ['U', 'G'] }, decks))
    const all = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, colors: ['U', 'G'], colorMode: 'all' }, decks))
    expect(any.length).toBeGreaterThan(all.length)
    expect(all.every(row => row.card.colors.includes('U') && row.card.colors.includes('G'))).toBe(true)
    const multicolor = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, multicolorOnly: true }, decks))
    expect(multicolor.every(row => row.card.colors.length > 1)).toBe(true)
    expect(summarize(multicolor).copies).toBe(composition(holdings).find(bucket => bucket.name === 'Multicolor')?.copies)
    const blueBucket = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, colors: ['U'], monocolorOnly: true }, decks))
    expect(summarize(blueBucket).copies).toBe(composition(holdings).find(bucket => bucket.name === 'Blue')?.copies)
    const excluded = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, colors: ['U', 'G'], excludeColors: true, minQuantity: 2 }, decks))
    expect(excluded.every(row => !row.card.colors.includes('U') && !row.card.colors.includes('G') && row.quantity >= 2)).toBe(true)
  })
  it('applies quantity, binder, finish, usage, mana and price ranges before pagination', () => {
    const query = { ...EMPTY_QUERY, binder: 'Main binder', finish: 'Nonfoil', minQuantity: 3, minValue: '1', maxValue: '200', maxMana: '4' }
    const rows = holdings.filter(row => matchesQuery(row, query, decks))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.binder === 'Main binder' && row.quantity >= 3 && row.card.manaValue !== null && row.card.manaValue <= 4 && totalValue(row)! >= 100 && totalValue(row)! <= 20000)).toBe(true)
    const missing = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, pricing: 'missing' }, decks))
    expect(missing.every(row => row.priceCents === null)).toBe(true)
    const unused = holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, usage: 'unused' }, decks))
    expect(unused.every(row => decks.every(deck => deck.entries.every(entry => entry.cardId !== row.card.id)))).toBe(true)
    expect(activeFilters(query)).toBe(5)
  })
  it('rejects invalid saved query shapes and inverted or nonnumeric ranges', () => {
    expect(isQuery(EMPTY_QUERY)).toBe(true)
    for (const value of [null, {}, { ...EMPTY_QUERY, minValue: '-1' }, { ...EMPTY_QUERY, minValue: '100', maxValue: '20' }, { ...EMPTY_QUERY, colors: ['invalid'] }, { ...EMPTY_QUERY, minQuantity: NaN }, { ...EMPTY_QUERY, maxMana: 'Infinity' }]) expect(isQuery(value)).toBe(false)
  })
})

describe('CSV exports', () => {
  it('exports all matching holding rows, not just a page, with exact identifiers', () => {
    const rows = holdings.filter(row => matchesQuery(row, EMPTY_QUERY, decks))
    const csv = exportCsv(rows)
    expect(csv.split('\r\n')).toHaveLength(rows.length + 1)
    expect(csv).toContain('"014"')
    expect(csv).toContain('"Holding ID"')
    expect(csv).not.toContain('"Unavailable"')
    const missing = holdings.find(row => row.priceCents === null)!
    expect(exportCsv([missing]).split('\r\n')[1]).toMatch(/,"",""$/)
  })
  it('escapes quotes and neutralizes spreadsheet formulas', () => {
    const row = { ...holdings[0], binder: '=HYPERLINK("example")' }
    expect(exportCsv([row])).toContain(`"'=HYPERLINK(""example"")"`)
  })
})

describe('physical allocations and deck matching', () => {
  it('caps ownership per entry and separates reservations from missing copies', () => {
    for (const deck of decks) {
      const summary = deckSummary(deck, holdings)
      expect(summary.owned + summary.missing).toBe(summary.requested)
      expect(summary.reserved).toBeLessThanOrEqual(summary.owned)
      expect(summary.missingCost).toBeGreaterThanOrEqual(0)
    }
    const conflicts = allocationConflicts(decks, holdings)
    expect(conflicts.length).toBeGreaterThan(0)
    for (const conflict of conflicts) expect(conflict.requested - conflict.owned).toBe(conflict.shortage)
  })
})
