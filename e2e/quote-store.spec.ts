import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Each Playwright test has a fresh browser context. Serve an empty same-origin
// harness, not the application: no UI imports, user storage, or external traffic.
async function harness(page: Page) {
  await page.route('https://**', route => route.abort())
  await page.route('**/__quote-store-test', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Synthetic public quote store test</title>',
  }))
  await page.goto('/__quote-store-test')
}

test('real IndexedDB persists public catalog, sets and per-printing chronological quotes across reload', async ({ page }) => {
  await harness(page)
  const first = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const { printingKey, readScryfallCard } = await import('/src/scryfall.ts')
    const { syntheticPricedResponse, syntheticPrinting } = await import('/src/test-fixtures.ts')
    const store = createQuoteStore()
    const card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const first = { ...card, pricing: { cents: { Nonfoil: 0, Foil: null, Etched: 123 }, retrievedAt: '2020-01-01T00:00:00Z', error: null } }
    const second = { ...first, pricing: { ...first.pricing, retrievedAt: '2020-01-02T00:00:00Z', cents: { Nonfoil: null, Foil: null, Etched: null } } }
    const other = { ...first, printing: { ...first.printing, language: 'English' } }
    let storageAccess = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function () { storageAccess++; throw new Error('Storage access forbidden in isolated service') }
    try {
      const later = await store.saveCards([second])
      // Reversed insertion order deliberately tests chronological reads.
      const earlier = await store.saveCards([{ ...first, quantity: 999, tags: 'synthetic private', printing: { ...first.printing, cost: 400 } }, first, other])
      const duplicates = await store.saveCards([first, other])
      await store.saveSets({ tst: { code: 'tst', name: 'Synthetic Set', releasedAt: null } })
      return {
        key: printingKey(first.printing), otherKey: printingKey(other.printing),
        later: later.length, earlier: earlier.length, duplicates, storageAccess,
      }
    } finally { Storage.prototype.setItem = original; store.close() }
  })
  expect(first).toMatchObject({ later: 1, earlier: 2, duplicates: [], storageAccess: 0 })
  await page.reload()
  const persisted = await page.evaluate(async ({ key, otherKey }) => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const store = createQuoteStore()
    try {
      return {
        catalog: await store.readCatalog(), sets: await store.readSets(),
        history: await store.readHistory(key), otherHistory: await store.readHistory(otherKey),
        absent: await store.readHistory('absent'),
      }
    } finally { store.close() }
  }, first)
  expect(Object.keys(persisted.catalog)).toHaveLength(2)
  expect(persisted.sets).toEqual({ tst: { code: 'tst', name: 'Synthetic Set', releasedAt: null } })
  expect(persisted.history.map(q => q.retrievedAt)).toEqual(['2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z'])
  expect(persisted.history.map(q => q.cents)).toEqual([{ Nonfoil: 0, Foil: null, Etched: 123 }, { Nonfoil: null, Foil: null, Etched: null }])
  expect(persisted.otherHistory).toHaveLength(1)
  expect(persisted.absent).toEqual([])
  expect(JSON.stringify(persisted)).not.toMatch(/quantity|tags|synthetic private|cost/)
})

test('invalid/error/undated pricing creates no history; conflicts and quota failures roll back catalog atomically', async ({ page }) => {
  await harness(page)
  const result = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const { printingKey, readScryfallCard } = await import('/src/scryfall.ts')
    const { syntheticPricedResponse, syntheticPrinting } = await import('/src/test-fixtures.ts')
    const store = createQuoteStore(), card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const key = printingKey(card.printing)
    const invalid = [
      { ...card, pricing: { ...card.pricing, retrievedAt: null } },
      { ...card, pricing: { ...card.pricing, retrievedAt: 'unreadable' } },
      { ...card, pricing: { ...card.pricing, retrievedAt: '2999-01-01T00:00:00Z' } },
      { ...card, pricing: { ...card.pricing, error: 'Synthetic price error' } },
      { ...card, pricing: { ...card.pricing, cents: { Nonfoil: -1, Foil: null, Etched: null } } },
      readScryfallCard({ ...syntheticPricedResponse(), prices: { usd: 'unreadable' } }, syntheticPrinting),
    ]
    const skipped = []
    for (const item of invalid) skipped.push(await store.saveCards([item]))
    const before = await store.readHistory(key)
    const retained = (await store.readCatalog())[key]
    await store.saveCards([card])
    const conflict = { ...card, rules: 'must roll back', pricing: { ...card.pricing, cents: { Nonfoil: 999, Foil: null, Etched: null } } }
    let conflictError = ''
    try { await store.saveCards([conflict]) } catch (error) { conflictError = String(error) }
    const afterConflict = await store.readCatalog()
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'observations') throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
      return original.apply(this, args)
    }
    let quotaError = ''
    try {
      await store.saveCards([{ ...card, rules: 'must also roll back', pricing: { ...card.pricing, retrievedAt: '2020-01-01T00:00:00Z' } }])
    } catch (error) { quotaError = String(error) }
    finally { IDBObjectStore.prototype.add = original }
    const afterQuota = await store.readCatalog(), history = await store.readHistory(key)
    store.close()
    return { skipped, before, retained, conflictError, quotaError, afterConflict: afterConflict[key].rules, afterQuota: afterQuota[key].rules, rules: card.rules, history }
  })
  expect(result.skipped).toEqual([[], [], [], [], [], []])
  expect(result.before).toEqual([])
  expect(result.retained.faces[0].image).toBe('https://cards.scryfall.io/normal/front/test.jpg')
  expect(result.retained.pricing.error).toContain('Pricing is invalid')
  expect(result.retained.pricing.cents).toEqual({ Nonfoil: null, Foil: null, Etched: null })
  expect(result.conflictError).toContain('Conflicting public quotes')
  expect(result.quotaError).toContain('QuotaExceededError')
  expect(result.afterConflict).toBe(result.rules)
  expect(result.afterQuota).toBe(result.rules)
  expect(result.history).toHaveLength(1)
})

test('concurrent stores deduplicate observations and versionchange closes stale connections', async ({ page }) => {
  await harness(page)
  const result = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const { readScryfallCard, printingKey } = await import('/src/scryfall.ts')
    const { syntheticPricedResponse, syntheticPrinting } = await import('/src/test-fixtures.ts')
    const a = createQuoteStore(), b = createQuoteStore(), card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const saved = await Promise.all([a.saveCards([card]), b.saveCards([card])])
    const history = await a.readHistory(printingKey(card.printing))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('bmc-public-pricing', 2)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Versionchange handler did not close the store'))
      request.onsuccess = () => { request.result.close(); resolve() }
    })
    let reopened = ''
    try { await a.readCatalog() } catch (error) { reopened = String(error) }
    const fresh = createQuoteStore()
    let version = ''
    try { await fresh.readCatalog() } catch (error) { version = String(error) }
    a.close(); b.close(); fresh.close()
    return { counts: saved.map(items => items.length).sort(), history, reopened, version }
  })
  expect(result.counts).toEqual([0, 1])
  expect(result.history).toHaveLength(1)
  expect(result.reopened).toContain('VersionError')
  expect(result.version).toContain('VersionError')
})

test('the same store reopens after repeated close and StrictMode-style pending-open cleanup', async ({ page }) => {
  await harness(page)
  const result = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const { readScryfallCard, printingKey } = await import('/src/scryfall.ts')
    const { syntheticPricedResponse, syntheticPrinting } = await import('/src/test-fixtures.ts')
    const store = createQuoteStore(), card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    const key = printingKey(card.printing)
    const first = store.readCatalog().then(() => 'Unexpected success', error => String(error))
    // Effect cleanup and immediate replay before the first IDB open resolves.
    store.close()
    const replay = Promise.all([
      store.saveCards([card]), store.saveSets({ tst: { code: 'tst', name: 'Synthetic Set', releasedAt: null } }),
    ])
    const interrupted = await first
    const [written] = await replay
    const reopened = []
    for (let i = 0; i < 3; i++) {
      store.close()
      store.close() // Cleanup is idempotent and does not open storage.
      const [catalog, sets, history] = await Promise.all([store.readCatalog(), store.readSets(), store.readHistory(key)])
      reopened.push({ cards: Object.keys(catalog).length, set: sets.tst.name, quotes: history.length })
    }
    const duplicate = await store.saveCards([card])
    store.close()
    return { interrupted, written: written.length, reopened, duplicates: duplicate.length }
  })
  expect(result.interrupted).toContain('closed while opening')
  expect(result.written).toBe(1)
  expect(result.reopened).toEqual(Array.from({ length: 3 }, () => ({ cards: 1, set: 'Synthetic Set', quotes: 1 })))
  expect(result.duplicates).toBe(0)
})

test('corrupt catalog, sets and targeted history reject rather than silently dropping data', async ({ page }) => {
  await harness(page)
  const result = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const store = createQuoteStore()
    await store.readCatalog()
    store.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('bmc-public-pricing', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['catalog', 'sets', 'observations'], 'readwrite')
        tx.objectStore('catalog').put({ unexpected: 'Synthetic corruption' }, 'bad')
        tx.objectStore('sets').put({ tst: { code: 'tst', name: 'Synthetic', releasedAt: 'invalid' } }, 'directory')
        tx.objectStore('observations').put({ id: 'bad', printingKey: 'targeted-key', cents: {} })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onabort = () => reject(tx.error)
      }
    })
    const reopened = createQuoteStore(), errors = []
    for (const operation of [() => reopened.readCatalog(), () => reopened.readSets(), () => reopened.readHistory('targeted-key')]) {
      try { await operation(); errors.push('Unexpected success') } catch (error) { errors.push(String(error)) }
    }
    const unrelated = await reopened.readHistory('unrelated-key')
    reopened.close()
    return { errors, unrelated }
  })
  expect(result.errors[0]).toContain('Invalid public catalog printing')
  expect(result.errors[1]).toContain('Invalid public set directory')
  expect(result.errors[2]).toContain('Invalid captured public quote')
  expect(result.unrelated).toEqual([])
})

test('2,000 synthetic printings persist without localStorage or whole-history scans', async ({ page }) => {
  await harness(page)
  const result = await page.evaluate(async () => {
    const { createQuoteStore } = await import('/src/quote-store.ts')
    const { readScryfallCard, printingKey } = await import('/src/scryfall.ts')
    const { syntheticPricedResponse, syntheticPrinting } = await import('/src/test-fixtures.ts')
    const store = createQuoteStore()
    const cards = Array.from({ length: 2000 }, (_, i) => {
      const printing = { ...syntheticPrinting, collectorNumber: String(i) }
      return readScryfallCard({ ...syntheticPricedResponse(), collector_number: String(i) }, printing)
    })
    const original = IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'observations') throw new Error('Unbounded history scan')
      return original.apply(this, args)
    }
    try {
      const written = await store.saveCards(cards)
      const catalog = await store.readCatalog()
      const history = await store.readHistory(printingKey(cards[1999].printing))
      return { written: written.length, catalog: Object.keys(catalog).length, history: history.length, key: history[0].printingKey }
    } finally { IDBObjectStore.prototype.getAll = original; store.close() }
  })
  expect(result).toEqual({ written: 2000, catalog: 2000, history: 1, key: '["tst","1999","ko"]' })
})
