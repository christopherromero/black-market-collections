import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY, exportCsv, matchesQuery, money, summarize } from './domain'
import { parseMoxfield } from './moxfield'
import { needsCatalogRefresh, printingKey, QUOTE_MAX_AGE_MS, quoteForFinish, readCatalogCache, readScryfallCard, readScryfallPrices, readUsdCents } from './scryfall'
import { syntheticCsv, syntheticPricedResponse, syntheticPrinting } from './test-fixtures'

describe('USD reference pricing', () => {
  it.each([['0', 0], ['0.00', 0], ['1.23', 123], ['2.5', 250], ['100', 10000], [null, null], [undefined, null]])('parses %s without floating rounding', (value, cents) => {
    expect(readUsdCents(value)).toBe(cents)
  })

  it.each(['', ' ', '-1', '+1', 'NaN', 'Infinity', '1.001', '1e3', '1,000', '$1', '9007199254740991', 1.23, {}, []])('rejects invalid quote %j', value => {
    expect(() => readUsdCents(value)).toThrow('Pricing is invalid')
    const pricing = readScryfallPrices({ usd: value, usd_foil: '2.00' })
    expect(pricing.error).toContain('unavailable')
    expect(Object.values(pricing.cents)).toEqual([null, null, null])
  })

  it('maps all three finishes exactly, including missing and zero; images survive pricing errors', () => {
    const card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    expect(['Nonfoil', 'Foil', 'Etched'].map(finish => quoteForFinish(card, finish as 'Nonfoil' | 'Foil' | 'Etched'))).toEqual([123, 234, 345])
    const partial = readScryfallCard({ ...syntheticPricedResponse(), prices: { usd: '0.00', usd_foil: null } }, syntheticPrinting)
    expect(quoteForFinish(partial, 'Nonfoil')).toBe(0)
    expect(quoteForFinish(partial, 'Foil')).toBeNull()
    expect(quoteForFinish(partial, 'Etched')).toBeNull()
    const invalid = readScryfallCard({ ...syntheticPricedResponse(), prices: { usd_etched: 'invalid' } }, syntheticPrinting)
    expect(invalid.faces[0].image).toContain('/normal/front/')
    expect(invalid.pricing.error).toBeTruthy()
    expect(readScryfallPrices('invalid').error).toBeTruthy()
  })

  it('refreshes legacy, invalid and stale public caches without discarding valid images', () => {
    const card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const cached = (value: unknown) => readCatalogCache(JSON.stringify({ [printingKey(syntheticPrinting)]: value }))[printingKey(syntheticPrinting)]
    expect(cached(card)).toEqual(card)
    const { pricing: _pricing, ...legacy } = card
    for (const value of [legacy, { ...card, pricing: { ...card.pricing, cents: { Nonfoil: -1, Foil: null, Etched: null } } }, { ...card, pricing: { ...card.pricing, retrievedAt: 'invalid' } }]) {
      const restored = cached(value)
      expect(restored.faces).toEqual(card.faces)
      expect(quoteForFinish(restored, 'Etched')).toBeNull()
      expect(needsCatalogRefresh(restored)).toBe(true)
    }
    expect(cached({ ...card, pricing: {} }).pricing.error).toContain('unavailable')
    const time = Date.parse(card.pricing.retrievedAt!)
    expect(needsCatalogRefresh(card, time + QUOTE_MAX_AGE_MS - 1)).toBe(false)
    expect(needsCatalogRefresh(card, time + QUOTE_MAX_AGE_MS)).toBe(true)
  })

  it('summarizes partial/all-unknown/zero coverage and never conflates purchase cost', () => {
    const row = parseMoxfield(syntheticCsv()).holdings[0]
    expect(row.moxfield?.purchasePrice).toBe('7.2500')
    expect(summarize([row]).valueCents).toBeNull()
    expect(money(summarize([row]).valueCents)).toBe('Unavailable')
    const catalog = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const priced = { ...row, card: { ...row.card, catalog }, priceCents: quoteForFinish(catalog, row.finish) }
    expect(summarize([row, priced])).toMatchObject({ copies: 4, pricedCopies: 2, unpricedCopies: 2, coverage: 0.5, valueCents: 690 })
    expect(summarize([{ ...row, priceCents: 0 }])).toMatchObject({ pricedCopies: 2, valueCents: 0 })
    expect(matchesQuery(priced, { ...EMPTY_QUERY, pricing: 'priced', minValue: '6.90' }, [])).toBe(true)
    expect(matchesQuery(row, { ...EMPTY_QUERY, pricing: 'priced' }, [])).toBe(false)
    const exported = exportCsv([priced, row])
    expect(exported).toContain('"3.45","6.90"')
    expect(exported).toContain('"7.2500"')
    expect(exported).toContain(catalog.pricing.retrievedAt)
    expect(exported).toMatch(/,"",""$/)
  })
})
