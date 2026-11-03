import type { Card, CatalogCard, Color, Finish, Printing, ReferencePricing } from './domain'

const LANGUAGES: Record<string, string> = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', japanese: 'ja', korean: 'ko', russian: 'ru',
  'chinese simplified': 'zhs', 'simplified chinese': 'zhs',
  'chinese traditional': 'zht', 'traditional chinese': 'zht',
  hebrew: 'he', latin: 'la', 'ancient greek': 'grc', arabic: 'ar', sanskrit: 'sa', phyrexian: 'ph',
}
export function languageCode(language: string) {
  const lower = language.toLowerCase()
  return Object.hasOwn(LANGUAGES, lower) ? LANGUAGES[lower] : Object.values(LANGUAGES).includes(lower) ? lower : null
}
export const printingKey = (p: Printing) => JSON.stringify([p.set.toLowerCase(), p.collectorNumber, languageCode(p.language) ?? p.language])
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : null
export function isFullCardUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cards.scryfall.io' && !url.port &&
      !url.username && !url.password && /^\/(normal|large|png)\/(front|back)\//.test(url.pathname)
  } catch { return false }
}
function isSourceUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'scryfall.com' && !url.port && !url.username && !url.password && url.pathname.startsWith('/card/')
  } catch { return false }
}

const unknownCents = (): ReferencePricing['cents'] => ({ Nonfoil: null, Foil: null, Etched: null })
const PRICING_ERROR = 'Pricing is invalid or unreadable. Reference estimates are unavailable; refresh to retry.'
export const QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Decimal strings only: no floats, negative values, rounding, or finish fallback.
export function readUsdCents(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(PRICING_ERROR)
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error(PRICING_ERROR)
  return cents
}

export function readScryfallPrices(value: unknown, retrievedAt = new Date().toISOString()): ReferencePricing {
  try {
    if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new Error(PRICING_ERROR)
    const prices = object(value)
    return { cents: { Nonfoil: readUsdCents(prices.usd), Foil: readUsdCents(prices.usd_foil), Etched: readUsdCents(prices.usd_etched) }, retrievedAt, error: null }
  } catch { return { cents: unknownCents(), retrievedAt, error: PRICING_ERROR } }
}

export const quoteForFinish = (catalog: CatalogCard, finish: Finish) => catalog.pricing.error ? null : catalog.pricing.cents[finish]
export function needsCatalogRefresh(card: CatalogCard | undefined, now = Date.now()) {
  const retrieved = card?.pricing.retrievedAt ? Date.parse(card.pricing.retrievedAt) : NaN
  return !Number.isFinite(retrieved) || retrieved > now || now - retrieved >= QUOTE_MAX_AGE_MS
}

export function readScryfallCard(value: unknown, printing: Printing): CatalogCard {
  const data = object(value)
  if (data.object !== 'card' || data.set !== printing.set.toLowerCase() ||
    data.collector_number !== printing.collectorNumber || data.lang !== languageCode(printing.language))
    throw new Error('Provider returned a different printing or language. No substitution was applied.')
  if (!isSourceUrl(data.scryfall_uri)) throw new Error('Provider returned an invalid source link.')
  const imageStatus = text(data.image_status) ?? 'unknown'
  const fullImage = (value: unknown) => {
    if (imageStatus === 'placeholder' || imageStatus === 'missing') return null
    const uris = object(value)
    return [uris.normal, uris.large, uris.png].find(isFullCardUrl) ?? null
  }
  // Split/adventure cards use the single complete image; only separately imaged
  // faces get a flip control. Never guess a reverse printing or use art_crop.
  const faces = data.image_uris ? [data] : Array.isArray(data.card_faces) ? data.card_faces.map(object) : [data]
  if (!faces.length || faces.length > 2 || faces.some(face => !text(face.name)))
    throw new Error('Provider returned unsupported card faces.')
  const identity = data.color_identity
  const colors: Color[] = Array.isArray(identity) && identity.every(c => typeof c === 'string' && ['W', 'U', 'B', 'R', 'G'].includes(c))
    ? identity.length ? identity as Color[] : ['C'] : []
  return {
    printing, faces: faces.map(face => ({ name: text(face.printed_name) ?? String(face.name), image: fullImage(face.image_uris), artist: text(face.artist) ?? text(data.artist) })),
    colors, manaValue: typeof data.cmc === 'number' && Number.isFinite(data.cmc) && data.cmc >= 0 ? data.cmc : null,
    type: text(data.type_line) ?? '', rarity: text(data.rarity),
    rules: text(data.oracle_text) ?? faces.map(face => text(face.oracle_text) ?? '').join('\n//\n'),
    sourceUrl: data.scryfall_uri, imageStatus, pricing: readScryfallPrices(data.prices),
  }
}

export function enrichCard(card: Card, catalog: CatalogCard): Card {
  return { ...card, catalog, colors: catalog.colors, manaValue: catalog.manaValue, type: catalog.type, rarity: catalog.rarity, rules: catalog.rules, reverseName: catalog.faces[1]?.name }
}

export class CatalogRequestError extends Error {
  stopBatch: boolean
  constructor(message: string, stopBatch = false) { super(message); this.stopBatch = stopBatch }
}

export function createScryfallClient(fetcher: typeof fetch = (...args) => fetch(...args), pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  let blockedUntil = 0
  return async (printing: Printing, signal: AbortSignal): Promise<CatalogCard> => {
    const lang = languageCode(printing.language)
    if (!lang) throw new CatalogRequestError('Language is not mapped to Scryfall. The holding remains unchanged; no English fallback was used.')
    if (!/^[a-z0-9]{2,8}$/i.test(printing.set)) throw new CatalogRequestError('Edition is not a supported set code. No name-based printing substitution was attempted.')
    if (Date.now() < blockedUntil) throw new CatalogRequestError('Scryfall rate limit: wait at least 30 seconds before retrying.', true)
    await pause(150) // Sequential batches, below the documented 10 requests/second.
    signal.throwIfAborted()
    const timeout = AbortSignal.timeout(15000)
    let response: Response
    try {
      response = await fetcher(`https://api.scryfall.com/cards/${encodeURIComponent(printing.set.toLowerCase())}/${encodeURIComponent(printing.collectorNumber)}/${lang}`, {
        headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
        signal: AbortSignal.any([signal, timeout]),
      })
    } catch {
      if (signal.aborted) throw new CatalogRequestError('Resolution cancelled.')
      throw new CatalogRequestError('Scryfall is unavailable or timed out. Check your connection and retry.', true)
    }
    if (response.status === 429) {
      const retry = response.headers.get('Retry-After')
      const seconds = Number(retry)
      const wait = retry && Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 30000
      blockedUntil = Date.now() + Math.max(30000, Number.isFinite(wait) ? wait : 30000)
      throw new CatalogRequestError('Scryfall rate limit reached. Batch stopped; wait at least 30 seconds before retrying.', true)
    }
    if (response.status === 404) throw new CatalogRequestError('Exact set, collector number and language were not found. No alternative printing was used.')
    if (!response.ok) throw new CatalogRequestError(`Scryfall request failed (HTTP ${response.status}). Retry later.`, true)
    try { return readScryfallCard(await response.json(), printing) }
    catch (error) {
      if (error instanceof SyntaxError) throw new CatalogRequestError('Provider returned unreadable metadata. Retry later.', true)
      throw error
    }
  }
}

export const CATALOG_KEY = 'bmc:scryfall:catalog:v1'
export type CatalogCache = Record<string, CatalogCard>

// Cached public responses are validated as strictly as live URLs before use.
export function readCatalogCache(raw: string | null): CatalogCache {
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid cached metadata')
  const entries = object(parsed)
  const cache: CatalogCache = {}
  for (const [key, value] of Object.entries(entries)) {
    const card = object(value), p = object(card.printing)
    if (typeof p.set !== 'string' || typeof p.collectorNumber !== 'string' || typeof p.language !== 'string') throw new Error('Invalid cached printing')
    const printing = { set: p.set, collectorNumber: p.collectorNumber, language: p.language }
    if (key !== printingKey(printing) || !isSourceUrl(card.sourceUrl) || !Array.isArray(card.faces) || card.faces.length < 1 || card.faces.length > 2 ||
      card.faces.some(value => { const face = object(value); return typeof face.name !== 'string' || (face.image !== null && !isFullCardUrl(face.image)) || (face.artist !== null && typeof face.artist !== 'string') }) ||
      !Array.isArray(card.colors) || card.colors.some(c => !['W', 'U', 'B', 'R', 'G', 'C'].includes(c)) ||
      (card.manaValue !== null && (typeof card.manaValue !== 'number' || !Number.isFinite(card.manaValue) || card.manaValue < 0)) ||
      typeof card.type !== 'string' || (card.rarity !== null && typeof card.rarity !== 'string') || typeof card.rules !== 'string' || typeof card.imageStatus !== 'string')
      throw new Error('Invalid cached metadata')
    // Keep old images usable, but refresh legacy/invalid pricing on the next visit.
    const pricing = object(card.pricing), cents = object(pricing.cents)
    const valid = typeof pricing.retrievedAt === 'string' && Number.isFinite(Date.parse(pricing.retrievedAt)) && Date.parse(pricing.retrievedAt) <= Date.now() &&
      (pricing.error === null || pricing.error === PRICING_ERROR) &&
      ['Nonfoil', 'Foil', 'Etched'].every(finish => cents[finish] === null || (typeof cents[finish] === 'number' && Number.isSafeInteger(cents[finish]) && cents[finish] >= 0))
    cache[key] = { ...value as CatalogCard, pricing: valid
      ? { cents: pricing.error ? unknownCents() : cents as ReferencePricing['cents'], retrievedAt: pricing.retrievedAt as string, error: pricing.error as string | null }
      : { cents: unknownCents(), retrievedAt: null, error: card.pricing === undefined ? null : PRICING_ERROR } }
  }
  return cache
}
