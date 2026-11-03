export type Color = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
export type Finish = 'Nonfoil' | 'Foil' | 'Etched'

export interface Card {
  id: string
  name: string
  colors: Color[]
  type: string
  manaValue: number | null
  rarity: string | null
  rules: string
  art?: number
  reverseName?: string
  printing?: Printing
  catalog?: CatalogCard
}

export interface Printing { set: string; collectorNumber: string; language: string }
export interface CardFace { name: string; image: string | null; artist: string | null }
export interface ReferencePricing {
  cents: Record<Finish, number | null>
  retrievedAt: string | null
  error: string | null
}
export interface CatalogCard {
  printing: Printing
  faces: CardFace[]
  colors: Color[]
  manaValue: number | null
  type: string
  rarity: string | null
  rules: string
  sourceUrl: string
  imageStatus: string
  pricing: ReferencePricing
}
export interface MoxfieldFields {
  row: number
  foil: string
  tags: string
  lastModified: string
  alter: string
  proxy: string
  tradelistCount: number
  purchasePrice: string
}

export interface Holding {
  id: string
  card: Card
  set: string
  collectorNumber: string
  quantity: number
  finish: Finish
  condition: string
  language: string
  binder: string
  priceCents: number | null
  allocations: { deckId: string; quantity: number }[]
  moxfield?: MoxfieldFields
}

export interface Deck {
  id: string
  name: string
  theme: string
  art: number
  entries: { cardId: string; quantity: number }[]
}

export interface Query {
  search: string
  sets: string[]
  excludeSets: boolean
  colors: Color[]
  colorMode: 'any' | 'all'
  excludeColors: boolean
  multicolorOnly: boolean
  monocolorOnly: boolean
  binder: string
  finish: string
  usage: 'all' | 'used' | 'unused' | 'available'
  pricing: 'all' | 'priced' | 'missing'
  minQuantity: number
  minValue: string
  maxValue: string
  maxMana: string
}

export const EMPTY_QUERY: Query = {
  search: '', sets: [], excludeSets: false, colors: [], colorMode: 'any', excludeColors: false, multicolorOnly: false, monocolorOnly: false,
  binder: '', finish: '', usage: 'all', pricing: 'all',
  minQuantity: 0, minValue: '', maxValue: '', maxMana: '',
}

export const COLOR_NAMES: Record<Color, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless',
}

export const money = (cents: number | null) => cents === null ? 'Unavailable'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export const allocated = (holding: Holding) => holding.allocations.reduce((sum, item) => sum + item.quantity, 0)
export const totalValue = (holding: Holding) => holding.priceCents === null ? null : holding.priceCents * holding.quantity
const collectorOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
export const compareCollectorNumbers = (left: string, right: string) => collectorOrder.compare(left, right)

export function summarize(rows: Holding[]) {
  const copies = rows.reduce((sum, row) => sum + row.quantity, 0)
  const pricedCopies = rows.filter(row => row.priceCents !== null).reduce((sum, row) => sum + row.quantity, 0)
  return {
    copies, pricedCopies, unpricedCopies: copies - pricedCopies,
    coverage: copies ? pricedCopies / copies : 0,
    identities: new Set(rows.map(row => row.card.id)).size,
    printings: new Set(rows.map(row => `${row.card.id}:${row.set}:${row.collectorNumber}`)).size,
    valueCents: pricedCopies ? rows.reduce((sum, row) => sum + (totalValue(row) ?? 0), 0) : null,
    binders: new Set(rows.map(row => row.binder)).size,
  }
}

export function matchesQuery(row: Holding, query: Query, decks: Deck[]) {
  const search = query.search.trim().toLocaleLowerCase()
  if (search && !`${row.card.name} ${row.card.rules} ${row.card.type} ${row.set}`.toLocaleLowerCase().includes(search)) return false
  if (query.sets.length) {
    const selected = query.sets.some(set => set.toLowerCase() === row.set.toLowerCase())
    if (query.excludeSets ? selected : !selected) return false
  }
  if (query.colors.length) {
    if (!row.card.colors.length) return false
    const colorMatch = query.colorMode === 'all'
      ? query.colors.every(color => row.card.colors.includes(color))
      : query.colors.some(color => row.card.colors.includes(color))
    if (query.excludeColors ? colorMatch : !colorMatch) return false
  }
  if (query.multicolorOnly && row.card.colors.length < 2) return false
  if (query.monocolorOnly && row.card.colors.length !== 1) return false
  if (query.binder && row.binder !== query.binder) return false
  if (query.finish && row.finish !== query.finish) return false
  if (row.quantity < query.minQuantity) return false
  const used = decks.some(deck => deck.entries.some(entry => entry.cardId === row.card.id))
  if (query.usage === 'used' && !used) return false
  if (query.usage === 'unused' && used) return false
  if (query.usage === 'available' && row.quantity <= allocated(row)) return false
  if (query.pricing === 'missing' && row.priceCents !== null) return false
  if (query.pricing === 'priced' && row.priceCents === null) return false
  const value = totalValue(row)
  if (query.minValue !== '' && (value === null || value < Math.round(Number(query.minValue) * 100))) return false
  if (query.maxValue !== '' && (value === null || value > Math.round(Number(query.maxValue) * 100))) return false
  if (query.maxMana !== '' && (row.card.manaValue === null || row.card.manaValue > Number(query.maxMana))) return false
  return true
}

export function activeFilters(query: Query) {
  return Number(Boolean(query.search.trim())) + Number(query.sets.length > 0) + Number(query.colors.length > 0 || query.multicolorOnly || query.monocolorOnly) +
    Number(Boolean(query.binder)) + Number(Boolean(query.finish)) + Number(query.usage !== 'all') +
    Number(query.pricing !== 'all') + Number(query.minQuantity > 0) +
    Number(query.minValue !== '' || query.maxValue !== '') + Number(query.maxMana !== '')
}

export function composition(rows: Holding[]) {
  const buckets = new Map<string, number>()
  for (const row of rows) {
    const key = row.card.colors.length > 1 ? 'Multicolor' : COLOR_NAMES[row.card.colors[0]] ?? 'Unknown'
    buckets.set(key, (buckets.get(key) ?? 0) + row.quantity)
  }
  return [...buckets].map(([name, copies]) => ({ name, copies })).sort((a, b) => b.copies - a.copies)
}

export function deckSummary(deck: Deck, rows: Holding[]) {
  let owned = 0, requested = 0, reserved = 0, missingCost = 0, unpricedMissing = 0
  for (const entry of deck.entries) {
    const holdings = rows.filter(row => row.card.id === entry.cardId)
    const quantity = holdings.reduce((sum, row) => sum + row.quantity, 0)
    const prices = holdings.map(row => row.priceCents).filter((price): price is number => price !== null)
    const missing = Math.max(0, entry.quantity - quantity)
    requested += entry.quantity
    owned += Math.min(entry.quantity, quantity)
    reserved += holdings.flatMap(row => row.allocations).filter(a => a.deckId === deck.id).reduce((sum, a) => sum + a.quantity, 0)
    if (prices.length) missingCost += missing * Math.min(...prices)
    else unpricedMissing += missing
  }
  return { owned, requested, reserved, missing: requested - owned, missingCost, unpricedMissing }
}

export function allocationConflicts(decks: Deck[], rows: Holding[]) {
  const requests = new Map<string, number>()
  for (const deck of decks) for (const entry of deck.entries) requests.set(entry.cardId, (requests.get(entry.cardId) ?? 0) + entry.quantity)
  return [...requests].flatMap(([cardId, requested]) => {
    const copies = rows.filter(row => row.card.id === cardId)
    const owned = copies.reduce((sum, row) => sum + row.quantity, 0)
    return requested > owned ? [{ cardId, name: copies[0]?.card.name ?? cardId, requested, owned, shortage: requested - owned }] : []
  })
}

function csvCell(value: string | number) {
  let safe = String(value)
  if (/^[\s]*[=+\-@]/.test(safe)) safe = `'${safe}`
  return `"${safe.replaceAll('"', '""')}"`
}

export function exportCsv(rows: Holding[]) {
  const header = ['Holding ID', 'Card name', 'Set', 'Collector number', 'Quantity', 'Finish', 'Binder', 'Condition', 'Language', 'Moxfield Foil', 'Tags', 'Tradelist Count', 'Alter', 'Proxy', 'Purchase Price (acquisition; currency unspecified)', 'Last Modified', 'Price basis', 'Quote retrieved at', 'Unit USD', 'Total USD']
  return [header, ...rows.map(row => [
    row.id, row.card.name, row.set, row.collectorNumber, row.quantity, row.finish,
    row.binder, row.condition, row.language,
    row.moxfield?.foil ?? '', row.moxfield?.tags ?? '', row.moxfield?.tradelistCount ?? '',
    row.moxfield?.alter ?? '', row.moxfield?.proxy ?? '', row.moxfield?.purchasePrice ?? '', row.moxfield?.lastModified ?? '',
    row.card.catalog ? 'Scryfall USD reference estimate; exact finish; unpriced excluded' : row.moxfield ? 'Reference estimate unavailable' : 'Synthetic demo estimate',
    row.card.catalog?.pricing.retrievedAt ?? '',
    row.priceCents === null ? '' : (row.priceCents / 100).toFixed(2),
    row.priceCents === null ? '' : (row.priceCents * row.quantity / 100).toFixed(2),
  ])].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function isQuery(value: unknown): value is Query {
  if (!value || typeof value !== 'object') return false
  const q = value as Record<string, unknown>
  return typeof q.search === 'string' && Array.isArray(q.colors) &&
    Array.isArray(q.sets) && q.sets.every(set => typeof set === 'string' && set.trim().length > 0) && typeof q.excludeSets === 'boolean' &&
    q.colors.every(c => typeof c === 'string' && Object.hasOwn(COLOR_NAMES, c)) &&
    typeof q.colorMode === 'string' && ['any', 'all'].includes(q.colorMode) && typeof q.excludeColors === 'boolean' &&
    typeof q.multicolorOnly === 'boolean' && typeof q.monocolorOnly === 'boolean' &&
    !(q.multicolorOnly && q.monocolorOnly) && typeof q.binder === 'string' &&
    typeof q.finish === 'string' && ['', 'Nonfoil', 'Foil', 'Etched'].includes(q.finish) &&
    typeof q.usage === 'string' && ['all', 'used', 'unused', 'available'].includes(q.usage) &&
    typeof q.pricing === 'string' && ['all', 'priced', 'missing'].includes(q.pricing) &&
    typeof q.minQuantity === 'number' && Number.isInteger(q.minQuantity) && q.minQuantity >= 0 &&
    ['minValue', 'maxValue', 'maxMana'].every(key => typeof q[key] === 'string' &&
      (q[key] === '' || (/^\d+(\.\d{1,2})?$/.test(q[key]) && Number.isFinite(Number(q[key]))))) &&
    !(q.minValue !== '' && q.maxValue !== '' && Number(q.minValue) > Number(q.maxValue))
}
