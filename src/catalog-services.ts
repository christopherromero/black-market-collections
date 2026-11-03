import type { CatalogCard, Printing } from './domain'
import { CatalogRequestError, languageCode, printingKey, readScryfallCard } from './scryfall'

export interface SetInfo { code: string; name: string; releasedAt: string | null }
export type SetDirectory = Record<string, SetInfo>
export interface PriceRefreshProgress { total: number; completed: number; failed: number }
export interface CatalogBatch { cards: CatalogCard[]; errors: Record<string, string>; progress: PriceRefreshProgress }
export type CollectionCatalogClient = (
  printings: Printing[], signal: AbortSignal, onBatch: (batch: CatalogBatch) => void | Promise<void>,
) => Promise<void>

const publicFetch: typeof fetch = (...args) => globalThis.fetch(...args)
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const setCode = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{2,8}$/.test(value)
const cancelled = () => new CatalogRequestError('Catalog refresh cancelled.', true)
const unavailable = () => new CatalogRequestError('Scryfall is unavailable or timed out. Check your connection and retry.', true)
const invalidResponse = () => new CatalogRequestError('Scryfall returned an invalid or incomplete catalog response. Refresh stopped.', true)
const NOT_FOUND = 'Exact set, collector number and language were not found. No alternative printing was used.'
const INVALID_ITEM = 'Catalog item was missing, invalid, or a different printing or language. No substitution was applied.'

// Race the operation as well as aborting fetch: injected fetchers and stalled body
// readers need not implement AbortSignal correctly. Always remove listeners.
function abortable<T>(operation: () => Promise<T>, signal: AbortSignal, error: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(error()); return }
    const abort = () => reject(error())
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => {
      if (signal.aborted) throw error()
      return operation()
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function requestJson(
  url: string, init: RequestInit, signal: AbortSignal, fetcher: typeof fetch,
  rateLimited: (wait: number) => void = () => {},
): Promise<{ status: number; data: unknown }> {
  if (signal.aborted) throw cancelled()
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 15_000)
  try {
    return await abortable(async () => {
      let response: Response
      try {
        response = await fetcher(url, {
          ...init, credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
          headers: { Accept: 'application/json', ...init.headers },
        })
      } catch { throw signal.aborted ? cancelled() : unavailable() }
      if (controller.signal.aborted) throw signal.aborted ? cancelled() : unavailable()
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After')
        const seconds = retry?.trim() ? Number(retry) : NaN
        const wait = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : NaN
        rateLimited(Math.max(30_000, Number.isFinite(wait) ? wait : 30_000))
        throw new CatalogRequestError('Scryfall rate limit reached. Wait at least 30 seconds before retrying.', true)
      }
      if (response.status === 404) return { status: 404, data: null }
      if (!response.ok) throw new CatalogRequestError(`Scryfall request failed (HTTP ${response.status}). Retry later.`, true)
      try { return { status: response.status, data: await response.json() as unknown } }
      catch { throw invalidResponse() }
    }, controller.signal, () => signal.aborted ? cancelled() : unavailable())
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

// Documented /cards/collection identifiers support set + collector_number, not
// language. Its endpoint-specific limit is 2/sec, stricter than ordinary GETs:
// https://scryfall.com/docs/api/cards/collection
export function createCollectionCatalogClient(
  fetcher: typeof fetch = publicFetch, pause: (ms: number) => Promise<void> = sleep,
): CollectionCatalogClient {
  let blockedUntil = 0
  let tail = Promise.resolve()
  const check = (signal: AbortSignal) => {
    if (signal.aborted) throw cancelled()
    if (Date.now() < blockedUntil)
      throw new CatalogRequestError('Scryfall rate limit cooldown is active. Retry after the provider cooldown.', true)
  }
  const request = async (url: string, init: RequestInit, signal: AbortSignal, delay: number) => {
    check(signal)
    await abortable(() => pause(delay), signal, cancelled)
    check(signal)
    return requestJson(url, init, signal, fetcher, wait => { blockedUntil = Date.now() + wait })
  }

  const run: CollectionCatalogClient = async (input, signal, onBatch) => {
    check(signal)
    // Whitelist even structurally wider inputs: no quantities, tags or costs can
    // reach requests, returned catalog cards, or persistence callbacks.
    const unique = [...new Map(input.map(p => {
      const printing = { set: p.set, collectorNumber: p.collectorNumber, language: p.language }
      return [printingKey(printing), printing] as const
    })).values()]
    const progress: PriceRefreshProgress = { total: unique.length, completed: 0, failed: 0 }
    const emit = async (requested: Printing[], cards: CatalogCard[], errors: Record<string, string>) => {
      progress.completed += requested.length
      progress.failed += Object.keys(errors).length
      await onBatch({ cards, errors, progress: { ...progress } })
    }
    const english: Printing[] = [], other: Printing[] = [], invalid: Printing[] = []
    const inputErrors: Record<string, string> = {}
    for (const p of unique) {
      let error: string | undefined
      if (!languageCode(p.language)) error = 'Language is not mapped to Scryfall. No English fallback was used.'
      else if (!setCode(p.set.toLowerCase()) || !p.collectorNumber.trim())
        error = 'An exact set code and collector number are required. No name-based substitution was attempted.'
      if (error) { invalid.push(p); inputErrors[printingKey(p)] = error }
      else (languageCode(p.language) === 'en' ? english : other).push(p)
    }
    if (invalid.length) await emit(invalid, [], inputErrors)

    for (let offset = 0; offset < english.length; offset += 75) {
      const requested = english.slice(offset, offset + 75)
      const response = await request('https://api.scryfall.com/cards/collection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: requested.map(p => ({ set: p.set.toLowerCase(), collector_number: p.collectorNumber })) }),
      }, signal, 500)
      const list = record(response.data)
      const cards: CatalogCard[] = [], errors: Record<string, string> = {}
      let systemic = response.status === 404 || list.object !== 'list' || !Array.isArray(list.data) ||
        (list.has_more !== undefined && list.has_more !== false) || (list.not_found !== undefined && !Array.isArray(list.not_found))
      if (systemic) {
        for (const p of requested) errors[printingKey(p)] = INVALID_ITEM
      } else {
        const identity = (set: unknown, number: unknown) => JSON.stringify([set, number])
        const wanted = new Set(requested.map(p => identity(p.set.toLowerCase(), p.collectorNumber)))
        const found = new Map<string, unknown[]>()
        const missing = new Set<string>()
        for (const raw of list.data as unknown[]) {
          const item = record(raw), key = identity(item.set, item.collector_number)
          if (!wanted.has(key)) { systemic = true; continue }
          found.set(key, [...(found.get(key) ?? []), raw])
        }
        for (const raw of (list.not_found ?? []) as unknown[]) {
          const item = record(raw), key = identity(item.set, item.collector_number)
          if (!wanted.has(key) || missing.has(key)) systemic = true
          missing.add(key)
        }
        for (const p of requested) {
          const key = printingKey(p), id = identity(p.set.toLowerCase(), p.collectorNumber)
          const matches = found.get(id) ?? []
          if (matches.length === 0 && missing.has(id)) { errors[key] = NOT_FOUND; continue }
          if (matches.length !== 1 || missing.has(id)) { errors[key] = INVALID_ITEM; continue }
          try {
            const card = readScryfallCard(matches[0], p)
            cards.push(card)
            if (card.pricing.error) errors[key] = card.pricing.error
          } catch { errors[key] = INVALID_ITEM }
        }
      }
      // Commit genuine partial work before surfacing a systemic protocol error.
      await emit(requested, cards, errors)
      if (systemic) throw invalidResponse()
    }
    for (const p of other) {
      const response = await request(
        `https://api.scryfall.com/cards/${encodeURIComponent(p.set.toLowerCase())}/${encodeURIComponent(p.collectorNumber)}/${languageCode(p.language)}`,
        {}, signal, 150,
      )
      const cards: CatalogCard[] = [], errors: Record<string, string> = {}, key = printingKey(p)
      if (response.status === 404) errors[key] = NOT_FOUND
      else {
        try {
          const card = readScryfallCard(response.data, p)
          cards.push(card)
          if (card.pricing.error) errors[key] = card.pricing.error
        } catch { errors[key] = INVALID_ITEM }
      }
      await emit([p], cards, errors)
    }
  }
  return (printings, signal, onBatch) => {
    // Concurrent callers of this instance are serialized, including persistence.
    // A queued cancellation must not have to wait for an earlier callback.
    // The gate still waits for the previous job, so cancelling a queued caller
    // cannot allow the next caller to overlap that previous job.
    const previous = tail
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    tail = previous.then(() => gate)
    const job = abortable(() => previous, signal, cancelled)
      .then(() => run(printings, signal, onBatch))
      .finally(release)
    return job
  }
}

/** Validate and project the local directory shape, also used at the IDB boundary. */
export function readSetDirectory(value: unknown): SetDirectory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public set directory.')
  const directory: SetDirectory = {}
  for (const [key, raw] of Object.entries(value)) {
    const set = record(raw), released = set.releasedAt ?? null
    if (!setCode(key) || set.code !== key || typeof set.name !== 'string' || !set.name.trim() ||
      (released !== null && (typeof released !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(released) ||
        !Number.isFinite(Date.parse(released)) || new Date(released).toISOString().slice(0, 10) !== released)))
      throw new Error('Invalid public set directory.')
    directory[key] = { code: key, name: set.name, releasedAt: released as string | null }
  }
  return directory
}

export async function fetchSetDirectory(signal: AbortSignal, fetcher: typeof fetch = publicFetch): Promise<SetDirectory> {
  const { status, data } = await requestJson('https://api.scryfall.com/sets', {}, signal, fetcher)
  const list = record(data)
  // GET /sets is documented to return all sets in a List. Reject an incomplete
  // response rather than following an arbitrary provider-supplied URL.
  if (status === 404 || list.object !== 'list' || list.has_more !== false || !Array.isArray(list.data)) throw invalidResponse()
  const directory: Record<string, unknown> = {}
  for (const raw of list.data) {
    const set = record(raw)
    if (set.object !== 'set' || !setCode(set.code) || Object.hasOwn(directory, set.code)) throw invalidResponse()
    directory[set.code] = { code: set.code, name: set.name, releasedAt: set.released_at ?? null }
  }
  try { return readSetDirectory(directory) }
  catch { throw invalidResponse() }
}
