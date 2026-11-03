import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Printing } from './domain'
import type { CatalogBatch } from './catalog-services'
import { createCollectionCatalogClient, fetchSetDirectory } from './catalog-services'
import { CatalogRequestError, languageCode, printingKey } from './scryfall'
import { syntheticPricedResponse } from './test-fixtures'

const signal = () => new AbortController().signal
const printing = (number = '1', language = 'English'): Printing => ({ set: 'TST', collectorNumber: number, language })
const rawCard = (p: Printing) => ({
  ...syntheticPricedResponse(), set: p.set.toLowerCase(), collector_number: p.collectorNumber, lang: languageCode(p.language),
})
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const list = (data: unknown[], not_found: unknown[] = []) => ({ object: 'list', has_more: false, data, not_found })
const noPause = async () => {}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const collectingFetcher = (includePagination = true) => vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
  const { identifiers } = JSON.parse(String(init?.body)) as { identifiers: { set: string; collector_number: string }[] }
  return json({
    object: 'list',
    data: identifiers.map(id => rawCard({ set: id.set, collectorNumber: id.collector_number, language: 'en' })).reverse(),
    not_found: [],
    ...(includePagination ? { has_more: false } : {}),
  })
})

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('isolated full-collection catalog client', () => {
  it.each([false, true])('deduplicates >75 printings, matches unordered results and sends only public identifiers (has_more supplied: %s)', async includePagination => {
    const fetcher = collectingFetcher(includePagination), pause = vi.fn(noPause), batches: CatalogBatch[] = []
    const desired = Array.from({ length: 152 }, (_, i) => ({ ...printing(String(i)), quantity: 900, tags: 'synthetic secret', costs: 123 }))
    await createCollectionCatalogClient(fetcher, pause)([...desired, { ...desired[0], set: 'tst', language: 'en' }], signal(), batch => { batches.push(batch) })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(pause.mock.calls).toEqual([[500], [500], [500]])
    expect(batches.map(b => b.cards.length)).toEqual([75, 75, 2])
    expect(batches.map(b => b.errors)).toEqual([{}, {}, {}])
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).identifiers.length)).toEqual([75, 75, 2])
    expect(batches.map(b => b.progress)).toEqual([
      { total: 152, completed: 75, failed: 0 }, { total: 152, completed: 150, failed: 0 }, { total: 152, completed: 152, failed: 0 },
    ])
    expect(batches.flatMap(b => b.cards).map(c => c.printing.collectorNumber)).toEqual(desired.map(p => p.collectorNumber))
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe('https://api.scryfall.com/cards/collection')
      expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })
      const payload = JSON.parse(String(init?.body))
      expect(Object.keys(payload)).toEqual(['identifiers'])
      expect(payload.identifiers.length).toBeLessThanOrEqual(75)
      for (const id of payload.identifiers) expect(Object.keys(id)).toEqual(['set', 'collector_number'])
      expect(String(init?.body)).not.toMatch(/quantity|tags|costs|synthetic secret|language/)
    }
    expect(JSON.stringify(batches)).not.toMatch(/quantity|tags|costs|synthetic secret/)
  })

  it('keeps successes, explicit missing/exact-mismatch/ambiguous/invalid-price errors, and cumulative progress', async () => {
    const requested = Array.from({ length: 77 }, (_, i) => printing(String(i)))
    const data = requested.slice(0, 75).map(rawCard)
    data.splice(1, 2) // One documented not_found and one silently absent result.
    data.find(c => c.collector_number === '3')!.lang = 'fr'
    data.find(c => c.collector_number === '4')!.scryfall_uri = 'https://untrusted.example/card'
    data.push(rawCard(requested[5])) // Duplicate identity is ambiguous, not last-wins.
    data.find(c => c.collector_number === '6')!.prices.usd = 'not a price'
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ object: 'list', data: data.reverse(), not_found: [{ set: 'tst', collector_number: '1' }] }))
      .mockResolvedValueOnce(json(list(requested.slice(75).map(rawCard))))
    const batches: CatalogBatch[] = []
    await createCollectionCatalogClient(fetcher, noPause)(requested, signal(), batch => { batches.push(batch) })
    expect(batches[0].errors[printingKey(requested[1])]).toContain('not found')
    for (const n of [2, 3, 4, 5]) expect(batches[0].errors[printingKey(requested[n])]).toContain('No substitution')
    expect(batches[0].errors[printingKey(requested[6])]).toContain('Pricing is invalid')
    expect(batches[0].cards.find(c => c.printing.collectorNumber === '6')?.pricing.cents).toEqual({ Nonfoil: null, Foil: null, Etched: null })
    expect(batches.map(b => b.progress)).toEqual([{ total: 77, completed: 75, failed: 6 }, { total: 77, completed: 77, failed: 6 }])
    expect(batches[0].cards.some(c => c.printing.collectorNumber === '0')).toBe(true)
  })

  it.each(['English', 'Korean'])('distinguishes malformed prices from valid all-null quotes for %s without losing images', async language => {
    const requested = printing('1', language), key = printingKey(requested)
    for (const invalid of [true, false]) {
      const raw = { ...rawCard(requested), prices: { usd: invalid ? 'unreadable' : null, usd_foil: null, usd_etched: null } }
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(language === 'English' ? list([raw]) : raw))
      const batches: CatalogBatch[] = []
      await createCollectionCatalogClient(fetcher, noPause)([requested], signal(), batch => { batches.push(batch) })
      expect(batches).toHaveLength(1)
      const batch = batches[0]
      expect(batch.progress).toEqual({ total: 1, completed: 1, failed: invalid ? 1 : 0 })
      expect(batch.cards).toHaveLength(1)
      const card = batch.cards[0]
      expect(card.faces[0].image).toBe('https://cards.scryfall.io/normal/front/test.jpg')
      expect(card.pricing.cents).toEqual({ Nonfoil: null, Foil: null, Etched: null })
      expect(card.pricing.retrievedAt).toBeTruthy()
      if (invalid) {
        expect(card.pricing.error).toContain('Pricing is invalid')
        expect(batch.errors).toEqual({ [key]: card.pricing.error })
      } else {
        expect(card.pricing.error).toBeNull()
        expect(batch.errors).toEqual({})
      }
    }
  })

  it('routes non-English to exact encoded GETs, including English-looking mismatches and 404s', async () => {
    const korean = printing('PCY/1 ★', 'Korean'), french = printing('2', 'French'), absent = printing('3', 'Japanese')
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(list([rawCard(printing())])))
      .mockResolvedValueOnce(json(rawCard(korean)))
      .mockResolvedValueOnce(json({ ...rawCard(french), lang: 'en' }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
    const pause = vi.fn(noPause), batches: CatalogBatch[] = []
    await createCollectionCatalogClient(fetcher, pause)([korean, printing(), french, absent], signal(), b => { batches.push(b) })
    expect(fetcher.mock.calls.slice(1).map(call => call[0])).toEqual([
      'https://api.scryfall.com/cards/tst/PCY%2F1%20%E2%98%85/ko', 'https://api.scryfall.com/cards/tst/2/fr', 'https://api.scryfall.com/cards/tst/3/ja',
    ])
    for (const [, init] of fetcher.mock.calls.slice(1)) expect(init).not.toHaveProperty('body')
    expect(pause.mock.calls).toEqual([[500], [150], [150], [150]])
    expect(batches.flatMap(b => b.cards).map(c => c.printing.language)).toEqual(['English', 'Korean'])
    expect(batches[2].errors[printingKey(french)]).toContain('different printing or language')
    expect(batches[3].progress).toEqual({ total: 4, completed: 4, failed: 2 })
  })

  it('does not request unmapped languages or malformed public identifiers; empty jobs are no-ops', async () => {
    const fetcher = collectingFetcher(), callback = vi.fn()
    const client = createCollectionCatalogClient(fetcher, noPause)
    await client([], signal(), callback)
    expect(callback).not.toHaveBeenCalled()
    await client([printing('1', 'constructor'), { ...printing(), set: '../../bad' }, printing('')], signal(), callback)
    expect(fetcher).not.toHaveBeenCalled()
    expect(callback.mock.calls[0][0].progress).toEqual({ total: 3, completed: 3, failed: 3 })
  })

  it('awaits persistence, serializes simultaneous jobs, and recovers after callback rejection', async () => {
    const fetcher = collectingFetcher()
    const client = createCollectionCatalogClient(fetcher, noPause)
    let release!: () => void
    const persisted = new Promise<void>(resolve => { release = resolve })
    const first = client([printing()], signal(), () => persisted)
    const second = client([printing('2')], signal(), () => {})
    await flush()
    expect(fetcher).toHaveBeenCalledOnce()
    release()
    await Promise.all([first, second])
    expect(fetcher).toHaveBeenCalledTimes(2)
    const error = new Error('Synthetic persistence failure')
    await expect(client(Array.from({ length: 76 }, (_, i) => printing(String(i))), signal(), () => { throw error })).rejects.toBe(error)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await client([printing()], signal(), () => {})
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('persists genuine successful partial work before stopping unexpected response identities', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(list([rawCard(printing()), rawCard(printing('unexpected'))])))
    const callback = vi.fn()
    await expect(createCollectionCatalogClient(fetcher, noPause)([printing()], signal(), callback)).rejects.toMatchObject({ stopBatch: true })
    expect(callback.mock.calls[0][0]).toMatchObject({ cards: [{ printing: printing() }], errors: {}, progress: { total: 1, completed: 1, failed: 0 } })
  })

  it('cancels a queued caller promptly without releasing a still-active persistence callback', async () => {
    const fetcher = collectingFetcher(), client = createCollectionCatalogClient(fetcher, noPause)
    let release!: () => void
    const persisted = new Promise<void>(resolve => { release = resolve })
    const first = client([printing()], signal(), () => persisted)
    const controller = new AbortController()
    const queued = client([printing('2')], controller.signal, () => {})
    const third = client([printing('3')], signal(), () => {})
    const rejected = expect(queued).rejects.toThrow('cancelled')
    await flush(); controller.abort(); await rejected
    expect(fetcher).toHaveBeenCalledOnce()
    release()
    await Promise.all([first, third])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[1][1]?.body)).toContain('"collector_number":"3"')
  })

  it('reports every absent identity without stopping when pagination metadata is omitted', async () => {
    const requested = [printing('1'), printing('2')]
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ object: 'list', data: [] })), callback = vi.fn()
    await createCollectionCatalogClient(fetcher, noPause)(requested, signal(), callback)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toEqual({
      cards: [],
      errors: Object.fromEntries(requested.map(p => [printingKey(p), expect.stringContaining('No substitution')])),
      progress: { total: 2, completed: 2, failed: 2 },
    })
  })

  it.each([true, null, 'false', 0])('rejects invalid supplied collection pagination flags: %j', async has_more => {
    const requested = printing()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...list([rawCard(requested)]), has_more })), callback = vi.fn()
    await expect(createCollectionCatalogClient(fetcher, noPause)([requested], signal(), callback))
      .rejects.toMatchObject({ stopBatch: true, message: expect.stringContaining('invalid or incomplete') })
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0]).toEqual({
      cards: [],
      errors: { [printingKey(requested)]: expect.stringContaining('No substitution') },
      progress: { total: 1, completed: 1, failed: 1 },
    })
  })

  it.each([null, { object: 'list', data: null }, list([], [{ set: 'other', collector_number: '99' }])])('reports malformed list responses explicitly: %j', async response => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(response)), callback = vi.fn()
    await expect(createCollectionCatalogClient(fetcher, noPause)([printing()], signal(), callback)).rejects.toBeInstanceOf(CatalogRequestError)
    expect(callback.mock.calls[0][0].errors[printingKey(printing())]).toBeTruthy()
    expect(callback.mock.calls[0][0].progress).toEqual({ total: 1, completed: 1, failed: 1 })
  })

  it.each([401, 403, 500, 503])('stops systemic HTTP %s without sending the rest of the collection', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Do not expose body', { status }))
    const callback = vi.fn()
    await expect(createCollectionCatalogClient(fetcher, noPause)(Array.from({ length: 80 }, (_, i) => printing(String(i))), signal(), callback))
      .rejects.toMatchObject({ message: `Scryfall request failed (HTTP ${status}). Retry later.`, stopBatch: true })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(callback).not.toHaveBeenCalled()
  })

  it('retains the first committed batch when the next request fails without leaking network text', async () => {
    const fetcher = collectingFetcher()
    fetcher.mockImplementationOnce(async () => json(list(Array.from({ length: 75 }, (_, i) => rawCard(printing(String(i)))))))
      .mockRejectedValueOnce(new Error('Sensitive-looking internal transport details'))
    const callback = vi.fn()
    await expect(createCollectionCatalogClient(fetcher, noPause)(Array.from({ length: 76 }, (_, i) => printing(String(i))), signal(), callback))
      .rejects.toMatchObject({ message: 'Scryfall is unavailable or timed out. Check your connection and retry.', stopBatch: true })
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0].progress.completed).toBe(75)
  })

  it('supports cancellation before a job, during pacing, and during an uncooperative fetch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    const aborted = new AbortController(); aborted.abort()
    await expect(createCollectionCatalogClient(fetcher, noPause)([printing()], aborted.signal, () => {})).rejects.toThrow('cancelled')
    const controller = new AbortController()
    const paused = createCollectionCatalogClient(fetcher, () => new Promise(() => {}))([printing()], controller.signal, () => {})
    const rejected = expect(paused).rejects.toThrow('cancelled')
    await flush(); controller.abort(); await rejected
    expect(fetcher).not.toHaveBeenCalled()
    const active = new AbortController()
    const job = createCollectionCatalogClient(fetcher, noPause)([printing()], active.signal, () => {})
    const cancellation = expect(job).rejects.toThrow('cancelled')
    await flush(); active.abort(); await cancellation
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it.each(['fetch', 'body'])('times out a stalled %s in 15 seconds and stops', async stage => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => stage === 'fetch'
      ? new Promise(() => {})
      : Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) } as Response))
    const callback = vi.fn()
    const job = createCollectionCatalogClient(fetcher, noPause)([printing()], signal(), callback)
    const rejected = expect(job).rejects.toMatchObject({ stopBatch: true, message: expect.stringContaining('timed out') })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect(callback).not.toHaveBeenCalled()
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['60', 60_000], ['1', 30_000], ['nonsense', 30_000], [null, 30_000],
    ['Thu, 01 Jan 2026 00:01:30 GMT', 90_000],
  ])('shares 429 cooldown %s across calls, with no automatic retries', async (retry, wait) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const fetcher = collectingFetcher()
    fetcher.mockResolvedValueOnce(new Response('', { status: 429, headers: retry ? { 'Retry-After': retry } : {} }))
    const client = createCollectionCatalogClient(fetcher, noPause)
    await expect(client([printing()], signal(), () => {})).rejects.toMatchObject({ stopBatch: true })
    vi.setSystemTime(Date.now() + Number(wait) - 1)
    await expect(client([printing()], signal(), () => {})).rejects.toThrow('cooldown')
    expect(fetcher).toHaveBeenCalledOnce()
    vi.setSystemTime(Date.now() + 1)
    await client([printing()], signal(), () => {})
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('uses a lazy global-fetch wrapper and reports unreadable JSON safely', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('bad sensitive JSON'))
    vi.stubGlobal('fetch', fetcher)
    await expect(createCollectionCatalogClient(undefined, noPause)([printing()], signal(), () => {})).rejects.toThrow('invalid or incomplete')
    expect(fetcher).toHaveBeenCalledOnce()
  })
})

describe('public set directory', () => {
  it('uses one public /sets request, preserving exact names and release dates or null', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(list([
      { object: 'set', code: 'tst', name: 'Synthetic Set', released_at: '2024-02-29', irrelevant: 'discard' },
      { object: 'set', code: 'nul', name: 'Unknown release', released_at: null },
      { object: 'set', code: 'mis', name: 'Missing release' },
    ])))
    expect(await fetchSetDirectory(signal(), fetcher)).toEqual({
      tst: { code: 'tst', name: 'Synthetic Set', releasedAt: '2024-02-29' },
      nul: { code: 'nul', name: 'Unknown release', releasedAt: null },
      mis: { code: 'mis', name: 'Missing release', releasedAt: null },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('https://api.scryfall.com/sets')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body')
  })

  it.each([
    { code: '../bad' }, { name: '' }, { name: 7 }, { released_at: '2025-02-29' }, { released_at: 'tomorrow' }, { released_at: 4 },
  ])('rejects invalid sets: %j', async patch => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(list([{ object: 'set', code: 'tst', name: 'Synthetic', ...patch }])))
    await expect(fetchSetDirectory(signal(), fetcher)).rejects.toBeInstanceOf(CatalogRequestError)
  })

  it.each([
    { object: 'catalog', data: [] }, { ...list([]), has_more: true, next_page: 'https://untrusted.example' },
    list([{ object: 'set', code: 'tst', name: 'One' }, { object: 'set', code: 'tst', name: 'Two' }]),
  ])('does not silently accept incomplete, duplicate, or unexpected list shapes', async response => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(response))
    await expect(fetchSetDirectory(signal(), fetcher)).rejects.toThrow('invalid or incomplete')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('reports network errors, cancellation, timeout, 404 and 429 explicitly', async () => {
    const controller = new AbortController(); controller.abort()
    const fetcher = vi.fn<typeof fetch>()
    await expect(fetchSetDirectory(controller.signal, fetcher)).rejects.toThrow('cancelled')
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRejectedValueOnce(new Error('private-looking text'))
    await expect(fetchSetDirectory(signal(), fetcher)).rejects.toThrow('unavailable or timed out')
    fetcher.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(fetchSetDirectory(signal(), fetcher)).rejects.toThrow('invalid or incomplete')
    fetcher.mockResolvedValueOnce(new Response('', { status: 429 }))
    await expect(fetchSetDirectory(signal(), fetcher)).rejects.toThrow('rate limit')
    vi.useFakeTimers()
    fetcher.mockImplementationOnce(() => new Promise(() => {}))
    const rejected = expect(fetchSetDirectory(signal(), fetcher)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
  })
})
