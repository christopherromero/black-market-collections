import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuoteStore } from './quote-store'
import { readScryfallCard } from './scryfall'
import { syntheticPricedResponse, syntheticPrinting } from './test-fixtures'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('public quote store without a browser database', () => {
  it('is safe to import and construct without indexedDB; each attempted operation fails explicitly', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const store = createQuoteStore()
    const card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    for (const operation of [
      () => store.readCatalog(), () => store.readSets(), () => store.readHistory('synthetic'),
      () => store.saveCards([card]), () => store.saveSets({}),
    ]) await expect(operation()).rejects.toThrow('Public pricing storage is unavailable')
    expect(storage).not.toHaveBeenCalled()
    store.close()
  })

  it('does not open a database before a method call; close does not retire the instance', async () => {
    const open = vi.fn(() => { throw new Error('Synthetic unavailable database') })
    vi.stubGlobal('indexedDB', { open })
    const store = createQuoteStore()
    expect(open).not.toHaveBeenCalled()
    store.close()
    expect(open).not.toHaveBeenCalled()
    await expect(store.readCatalog()).rejects.toThrow('is unavailable')
    expect(open).toHaveBeenCalledOnce()
  })

  it('rejects invalid catalog and set inputs without attempting to open storage', async () => {
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })
    const store = createQuoteStore()
    const card = readScryfallCard(syntheticPricedResponse(), syntheticPrinting)
    await expect(store.saveCards([{ ...card, sourceUrl: 'https://untrusted.example/card' }])).rejects.toThrow('Invalid cached metadata')
    await expect(store.saveSets({ tst: { code: 'tst', name: 'Synthetic', releasedAt: '2025-02-29' } })).rejects.toThrow('Invalid public set directory')
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects blocked opens promptly and closes a late successful connection', async () => {
    const db = { close: vi.fn() }
    const request = { onblocked: null as (() => void) | null, onsuccess: null as (() => void) | null, result: db }
    const open = vi.fn(() => request)
    vi.stubGlobal('indexedDB', { open })
    const store = createQuoteStore()
    const rejected = expect(store.readCatalog()).rejects.toThrow('upgrade is blocked')
    request.onblocked!()
    await rejected
    request.onsuccess!()
    expect(db.close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('bmc-public-pricing', 1)
    store.close()
  })

  it('times out a stalled open and cancels an outstanding open on close', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: vi.fn(() => ({})) })
    const timed = createQuoteStore()
    const rejected = expect(timed.readCatalog()).rejects.toThrow('open timed out')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    const closed = createQuoteStore()
    const cancelled = expect(closed.readSets()).rejects.toThrow('closed while opening')
    closed.close()
    await cancelled
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reopens immediately after pending-open cleanup without stale callbacks clearing the new attempt', async () => {
    const request = () => ({
      onblocked: null as (() => void) | null, onsuccess: null as (() => void) | null,
      result: { close: vi.fn() },
    })
    const oldRequest = request(), newRequest = request()
    const open = vi.fn().mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest)
    vi.stubGlobal('indexedDB', { open })
    const store = createQuoteStore()
    const cancelled = expect(store.readCatalog()).rejects.toThrow('closed while opening')
    store.close()
    const second = store.readCatalog(), third = store.readSets()
    await cancelled
    oldRequest.onsuccess!()
    expect(oldRequest.result.close).toHaveBeenCalledOnce()
    const fourth = store.readHistory('synthetic')
    expect(open).toHaveBeenCalledTimes(2)
    const blocked = expect(Promise.all([second, third, fourth])).rejects.toThrow('upgrade is blocked')
    newRequest.onblocked!()
    await blocked
    store.close()
  })
})
