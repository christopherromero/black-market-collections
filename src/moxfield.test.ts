import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY, composition, exportCsv, matchesQuery, summarize } from './domain'
import { MOXFIELD_HEADERS, parseMoxfield } from './moxfield'
import { syntheticCsv, syntheticRow } from './test-fixtures'

describe('Moxfield collection CSV', () => {
  it('reads BOM, CRLF, escaped quotes, commas, multiline cells and a trailing newline', () => {
    const row = [...syntheticRow]; row[7] = 'first\r\nsecond, "third"'
    const preview = parseMoxfield('\uFEFF' + syntheticCsv([row]) + '\r\n')
    expect(preview.errors).toEqual([])
    expect(preview.rows).toBe(1)
    expect(preview.copies).toBe(2)
    expect(preview.holdings[0].card.name).toBe('Example, "Mapkeeper"')
    expect(preview.holdings[0].moxfield?.tags).toBe(row[7])
  })

  it('preserves languages, conditions, original finish, flags, costs and nonnumeric collector numbers', () => {
    const finishes = ['', 'foil', 'etched']
    const languages = ['English', 'Korean', 'Japanese']
    const rows = finishes.map((finish, index) => {
      const row = [...syntheticRow]; row[6] = finish; row[5] = languages[index]; return row
    })
    const result = parseMoxfield(syntheticCsv(rows))
    expect(result.errors).toEqual([])
    expect(result.holdings.map(row => row.finish)).toEqual(['Nonfoil', 'Foil', 'Etched'])
    expect(result.holdings.map(row => row.language)).toEqual(languages)
    expect(result.holdings.map(row => row.moxfield?.foil)).toEqual(finishes)
    expect(result.holdings[0]).toMatchObject({
      set: 'TST', collectorNumber: 'PCY-1', quantity: 2, condition: 'Moderately Played', priceCents: null, allocations: [],
      moxfield: { purchasePrice: '7.2500', alter: 'False', proxy: 'True', tradelistCount: 1, tags: 'kept, locally' },
      card: { colors: [], manaValue: null, rarity: null, type: '', rules: '' },
    })
    expect(result.holdings.map(row => row.id)).toEqual(['moxfield-2', 'moxfield-3', 'moxfield-4'])
    expect(summarize(result.holdings)).toMatchObject({ copies: 6, pricedCopies: 0, unpricedCopies: 6 })
    expect(exportCsv(result.holdings)).toContain('"7.2500"')
    expect(exportCsv(result.holdings)).toContain('"Purchase Price (acquisition; currency unspecified)"')
    expect(exportCsv(result.holdings).split('\r\n')[1]).toMatch(/,"",""$/)
  })

  it('supports reordered headers without shifting data', () => {
    const result = parseMoxfield(syntheticCsv([[...syntheticRow].reverse()], [...MOXFIELD_HEADERS].reverse()))
    expect(result.errors).toEqual([])
    expect(result.holdings[0].collectorNumber).toBe('PCY-1')
  })

  it.each([
    ['missing', MOXFIELD_HEADERS.slice(1)],
    ['duplicate', [...MOXFIELD_HEADERS, 'Count']],
    ['unsupported', [...MOXFIELD_HEADERS, 'Mystery']],
  ])('rejects %s headers rather than silently dropping fields', (_, headers) => {
    const result = parseMoxfield(syntheticCsv([syntheticRow], headers))
    expect(result.errors[0].row).toBe(1)
    expect(result.holdings).toEqual([])
  })

  it.each([
    [0, '0', 'Count'], [0, '1.5', 'Count'], [0, '-1', 'Count'], [0, 'NaN', 'Count'], [0, '9007199254740992', 'Count'],
    [1, '3', 'Tradelist Count'], [1, '-1', 'Tradelist Count'], [2, '', 'Name'], [3, '', 'Edition'],
    [4, '', 'Condition'], [5, '', 'Language'], [6, 'glitter', 'Foil'], [6, 'constructor', 'Foil'],
    [9, '', 'Collector Number'], [10, 'yes', 'Alter'], [11, '', 'Proxy'], [12, '$5', 'Purchase Price'], [12, '-2', 'Purchase Price'],
  ])('rejects invalid field %s transactionally', (index, value, field) => {
    const row = [...syntheticRow]; row[Number(index)] = String(value)
    const result = parseMoxfield(syntheticCsv([syntheticRow, row]))
    expect(result.errors).toContainEqual(expect.objectContaining({ row: 3, field }))
    expect(result.rows).toBe(2)
    expect(result.holdings).toEqual([])
    expect(result.copies).toBe(0)
    expect(JSON.stringify(result.errors)).not.toContain('Mapkeeper')
  })

  it.each(['"unclosed', '"closed"unexpected', 'un"quoted'])('rejects malformed quoting: %s', invalid => {
    const result = parseMoxfield(MOXFIELD_HEADERS.join(',') + '\r\n' + invalid)
    expect(result.errors[0]).toMatchObject({ row: 2, field: 'File' })
    expect(result.holdings).toEqual([])
  })

  it('does not silently drop truncated records, empty files, or whitespace-only rows', () => {
    for (const input of ['', syntheticCsv([]), syntheticCsv() + '\r\n ', syntheticCsv() + '\r\n1,2']) {
      expect(parseMoxfield(input).errors.length).toBeGreaterThan(0)
      expect(parseMoxfield(input).holdings).toEqual([])
    }
  })

  it('keeps unknown identity and mana distinct from colorless and zero, including exclusion filters', () => {
    const holding = parseMoxfield(syntheticCsv()).holdings[0]
    expect(matchesQuery(holding, EMPTY_QUERY, [])).toBe(true)
    for (const query of [{ ...EMPTY_QUERY, colors: ['C'] as const }, { ...EMPTY_QUERY, maxMana: '0' }, { ...EMPTY_QUERY, colors: ['U'] as const, excludeColors: true }])
      expect(matchesQuery(holding, { ...query, colors: [...query.colors] }, [])).toBe(false)
    expect(composition([holding])).toEqual([{ name: 'Unknown', copies: 2 }])
    expect(matchesQuery(holding, { ...EMPTY_QUERY, search: 'mapkeeper', pricing: 'missing' }, [])).toBe(true)
  })
})
