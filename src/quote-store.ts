import type { CatalogCard, Finish } from './domain'
import type { CatalogCache } from './scryfall'
import { printingKey, readCatalogCache } from './scryfall'
import type { SetDirectory } from './catalog-services'
import { readSetDirectory } from './catalog-services'

export interface QuoteObservation {
  id: string
  printingKey: string
  retrievedAt: string
  cents: Record<Finish, number | null>
  sourceUrl: string
}
export interface QuoteStore {
  readCatalog(): Promise<CatalogCache>
  readSets(): Promise<SetDirectory>
  readHistory(key: string): Promise<QuoteObservation[]>
  saveCards(cards: CatalogCard[]): Promise<QuoteObservation[]>
  saveSets(sets: SetDirectory): Promise<void>
  close(): void
}

const DB_NAME = 'bmc-public-pricing'
const VERSION = 1
const TIMEOUT = 15_000
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const observationId = (key: string, at: string) => JSON.stringify([key, at])
const storageError = (action: string, error?: unknown) =>
  new Error(`Public pricing storage ${action}${error instanceof DOMException ? ` (${error.name})` : ''}.`)

// Explicit projection is necessary: readCatalogCache validates public fields but
// intentionally retains other fields for its existing callers.
function publicCard(value: unknown, expectedKey?: string): CatalogCard {
  const raw = record(value), p = record(raw.printing), pricing = record(raw.pricing), cents = record(pricing.cents)
  const projected = {
    printing: { set: p.set, collectorNumber: p.collectorNumber, language: p.language },
    faces: Array.isArray(raw.faces) ? raw.faces.map(value => {
      const face = record(value)
      return { name: face.name, image: face.image, artist: face.artist }
    }) : raw.faces,
    colors: raw.colors, manaValue: raw.manaValue, type: raw.type, rarity: raw.rarity, rules: raw.rules,
    sourceUrl: raw.sourceUrl, imageStatus: raw.imageStatus,
    pricing: { retrievedAt: pricing.retrievedAt, error: pricing.error,
      cents: { Nonfoil: cents.Nonfoil, Foil: cents.Foil, Etched: cents.Etched } },
  }
  if (typeof p.set !== 'string' || typeof p.collectorNumber !== 'string' || typeof p.language !== 'string')
    throw new Error('Invalid public catalog printing.')
  const key = printingKey({ set: p.set, collectorNumber: p.collectorNumber, language: p.language })
  if (expectedKey !== undefined && expectedKey !== key) throw new Error('Invalid public catalog key.')
  return readCatalogCache(JSON.stringify({ [key]: projected }))[key]
}

function readObservation(value: unknown, expectedKey?: string): QuoteObservation {
  const raw = record(value), cents = record(raw.cents)
  if (typeof raw.printingKey !== 'string' || (expectedKey !== undefined && raw.printingKey !== expectedKey) ||
    typeof raw.retrievedAt !== 'string' || !Number.isFinite(Date.parse(raw.retrievedAt)) || Date.parse(raw.retrievedAt) > Date.now() ||
    raw.id !== observationId(raw.printingKey, raw.retrievedAt) ||
    !['Nonfoil', 'Foil', 'Etched'].every(f => cents[f] === null || (Number.isSafeInteger(cents[f]) && (cents[f] as number) >= 0)))
    throw new Error('Invalid captured public quote.')
  let printing: unknown
  try { printing = JSON.parse(raw.printingKey) }
  catch { throw new Error('Invalid captured public quote printing.') }
  if (!Array.isArray(printing) || printing.length !== 3 || !printing.every(part => typeof part === 'string') ||
    printingKey({ set: printing[0], collectorNumber: printing[1], language: printing[2] }) !== raw.printingKey)
    throw new Error('Invalid captured public quote printing.')
  let url: URL
  try { url = new URL(String(raw.sourceUrl)) }
  catch { throw new Error('Invalid captured public quote source.') }
  if (typeof raw.sourceUrl !== 'string' || url.protocol !== 'https:' || url.hostname !== 'scryfall.com' ||
    url.port || url.username || url.password || !url.pathname.startsWith('/card/'))
    throw new Error('Invalid captured public quote source.')
  return {
    id: raw.id as string, printingKey: raw.printingKey, retrievedAt: raw.retrievedAt,
    cents: { Nonfoil: cents.Nonfoil as number | null, Foil: cents.Foil as number | null, Etched: cents.Etched as number | null },
    sourceUrl: raw.sourceUrl,
  }
}

/** Public-only storage. No localStorage access, migration of private snapshots,
 * synthetic observations, pruning, or in-memory success fallback. */
export function createQuoteStore(): QuoteStore {
  let database: IDBDatabase | undefined
  let opening: Promise<IDBDatabase> | undefined
  let cancelOpen: (() => void) | undefined
  let generation = 0

  function close() {
    // Release, do not retire, this instance: React effect replay may reuse it.
    // Native close lets already-started transactions finish atomically.
    generation++
    const cancel = cancelOpen, db = database
    cancelOpen = undefined
    opening = undefined
    database = undefined
    cancel?.()
    db?.close()
  }

  function open(): Promise<IDBDatabase> {
    if (database) return Promise.resolve(database)
    if (opening) return opening
    const currentGeneration = generation
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (generation === currentGeneration) cancelOpen = undefined
        reject(error)
      }
      const timer = setTimeout(() => fail(storageError('open timed out')), TIMEOUT)
      cancelOpen = () => fail(storageError('was closed while opening'))
      let request: IDBOpenDBRequest
      try {
        if (typeof globalThis.indexedDB === 'undefined') throw new Error('Unavailable')
        request = globalThis.indexedDB.open(DB_NAME, VERSION)
      } catch { fail(storageError('is unavailable in this browser')); return }
      request.onblocked = () => fail(storageError('upgrade is blocked; close other tabs and retry'))
      request.onerror = () => fail(storageError('could not open', request.error))
      request.onupgradeneeded = () => {
        if (settled || generation !== currentGeneration) { request.transaction?.abort(); return }
        // Additive version-one schema. Future versions must migrate in this
        // transaction; never delete the database to recover from schema errors.
        const db = request.result
        if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog')
        if (!db.objectStoreNames.contains('sets')) db.createObjectStore('sets')
        const quotes = db.objectStoreNames.contains('observations')
          ? request.transaction!.objectStore('observations')
          : db.createObjectStore('observations', { keyPath: 'id' })
        if (!quotes.indexNames.contains('printingKey')) quotes.createIndex('printingKey', 'printingKey', { unique: false })
      }
      request.onsuccess = () => {
        const db = request.result
        if (settled || generation !== currentGeneration) { db.close(); return }
        settled = true
        clearTimeout(timer)
        cancelOpen = undefined
        database = db
        db.onversionchange = () => { if (database === db) close(); else db.close() }
        db.onclose = () => { if (database === db) close() }
        resolve(db)
      }
    })
    opening = attempt
    // A failed attempt can be explicitly retried, without deleting any data.
    // Its rejection must not clear a newer open started after close().
    void attempt.catch(() => { if (opening === attempt) opening = undefined })
    return attempt
  }

  async function transaction<T>(
    stores: string[], mode: IDBTransactionMode, initial: T,
    work: (tx: IDBTransaction, set: (value: T) => void, guard: (fn: () => void) => void) => void,
  ): Promise<T> {
    const currentGeneration = generation
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction
      try {
        if (generation !== currentGeneration || database !== db) throw new Error('Connection released')
        tx = db.transaction(stores, mode)
      } catch (error) { reject(storageError('transaction could not start', error)); return }
      let result = initial, failure: unknown, settled = false
      const fail = (error: unknown) => {
        if (settled) return
        failure = error
        try { tx.abort() } catch { /* Already aborted; still reject explicitly. */ }
        settled = true
        clearTimeout(timer)
        reject(error)
      }
      const timer = setTimeout(() => fail(storageError('transaction timed out')), TIMEOUT)
      tx.oncomplete = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      tx.onabort = () => fail(failure ?? storageError('transaction failed', tx.error))
      // Request errors deliberately keep their default abort behavior.
      const guard = (fn: () => void) => { try { fn() } catch (error) { fail(error) } }
      guard(() => work(tx, value => { result = value }, guard))
    })
  }

  return {
    close,
    readCatalog: () => transaction<CatalogCache>(['catalog'], 'readonly', {}, (tx, set, guard) => {
      const cache: CatalogCache = {}
      const request = tx.objectStore('catalog').openCursor()
      request.onsuccess = () => guard(() => {
        const cursor = request.result
        if (!cursor) { set(cache); return }
        if (typeof cursor.key !== 'string') throw new Error('Invalid public catalog key.')
        cache[cursor.key] = publicCard(cursor.value, cursor.key)
        cursor.continue()
      })
    }),
    readSets: () => transaction<SetDirectory>(['sets'], 'readonly', {}, (tx, set, guard) => {
      const request = tx.objectStore('sets').get('directory')
      request.onsuccess = () => guard(() => set(request.result === undefined ? {} : readSetDirectory(request.result)))
    }),
    readHistory: key => transaction<QuoteObservation[]>(['observations'], 'readonly', [], (tx, set, guard) => {
      const request = tx.objectStore('observations').index('printingKey').getAll(key)
      request.onsuccess = () => guard(() => set(request.result.map(value => readObservation(value, key))
        .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt) || a.id.localeCompare(b.id))))
    }),
    async saveCards(cards) {
      const catalog = cards.map(card => publicCard(card))
      const observations = new Map<string, QuoteObservation>()
      for (const card of catalog) {
        if (!card.pricing.retrievedAt || card.pricing.error !== null) continue
        const key = printingKey(card.printing), at = card.pricing.retrievedAt
        const observation = readObservation({
          id: observationId(key, at), printingKey: key, retrievedAt: at,
          cents: card.pricing.cents, sourceUrl: card.sourceUrl,
        })
        const previous = observations.get(observation.id)
        if (previous && JSON.stringify(previous) !== JSON.stringify(observation))
          throw new Error('Conflicting public quotes share a capture timestamp.')
        observations.set(observation.id, observation)
      }
      return transaction<QuoteObservation[]>(['catalog', 'observations'], 'readwrite', [], (tx, set, guard) => {
        const written: QuoteObservation[] = []
        set(written)
        for (const card of catalog) tx.objectStore('catalog').put(card, printingKey(card.printing))
        const store = tx.objectStore('observations')
        for (const observation of observations.values()) {
          const request = store.get(observation.id)
          request.onsuccess = () => guard(() => {
            if (request.result !== undefined) {
              if (JSON.stringify(readObservation(request.result)) !== JSON.stringify(observation))
                throw new Error('Conflicting public quotes share a capture timestamp.')
              return
            }
            store.add(observation)
            written.push(observation)
          })
        }
      })
    },
    async saveSets(sets) {
      const directory = readSetDirectory(sets)
      return transaction(['sets'], 'readwrite', undefined, tx => { tx.objectStore('sets').put(directory, 'directory') })
    },
  }
}
