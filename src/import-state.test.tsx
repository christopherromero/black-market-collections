import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CollectionProvider, useCollection } from './state'
import { COLLECTION_KEY, loadCollection, SAVED_KEY, storeCollection } from './storage'
import { EMPTY_QUERY, matchesQuery, summarize } from './domain'
import { syntheticCsv, syntheticRow } from './test-fixtures'
import Decks from './pages/Decks'
import CardDetail from './pages/CardDetail'

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const wrapper = CollectionProvider
const alternate = () => { const row = [...syntheticRow]; row[0] = '5'; row[2] = 'Other Synthetic Card'; return syntheticCsv([row]) }

describe('transactional local collection state', () => {
  it('starts empty without fixture holdings, binders, decks, prices or provider requests', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(useCollection, { wrapper })
    expect(result.current.source).toBe('empty')
    expect(result.current.holdings).toEqual([])
    expect(result.current.decks).toEqual([])
    expect(result.current.binders).toEqual([])
    expect(result.current.message).toBeNull()
    act(() => { result.current.watchImages([])() })
    expect(fetcher).not.toHaveBeenCalled()
    expect(localStorage.getItem(COLLECTION_KEY)).toBeNull()
  })

  it('updates the shared dataset, counts, binders, filters and decks, then survives reload', () => {
    const first = renderHook(useCollection, { wrapper })
    expect(first.result.current.source).toBe('empty')
    act(() => {
      first.result.current.setQuery({ ...EMPTY_QUERY, search: 'previous search' })
      first.result.current.setSorting([{ id: 'quantity', desc: true }])
      first.result.current.setPage(3)
      first.result.current.scroll.current = 300
    })
    act(() => { expect(first.result.current.applyImport(syntheticCsv())).toBe(true) })
    const state = first.result.current
    expect(state.source).toBe('moxfield')
    expect(state.holdings).toHaveLength(1)
    expect(state.decks).toEqual([])
    expect(state.binders).toEqual(['Unassigned (Moxfield)'])
    expect(state.query).toEqual(EMPTY_QUERY)
    expect(state.page).toBe(0)
    expect(state.sorting).toEqual([{ id: 'name', desc: false }])
    expect(state.scroll.current).toBe(0)
    expect(summarize(state.holdings)).toMatchObject({ copies: 2, pricedCopies: 0 })
    expect(state.holdings.filter(row => matchesQuery(row, { ...EMPTY_QUERY, usage: 'used' }, state.decks))).toEqual([])
    first.unmount()
    const second = renderHook(useCollection, { wrapper })
    expect(second.result.current.source).toBe('moxfield')
    expect(second.result.current.holdings).toEqual(state.holdings)
    act(() => { expect(second.result.current.clearCollection()).toBe(true) })
    expect(localStorage.getItem(COLLECTION_KEY)).toBeNull()
    expect(second.result.current.source).toBe('empty')
    expect(second.result.current.holdings).toEqual([])
    second.unmount()
    expect(renderHook(useCollection, { wrapper }).result.current.source).toBe('empty')
  })

  it('requires explicit demo opt-in, can exit to empty, and never restores demo on reload', () => {
    const first = renderHook(useCollection, { wrapper })
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    act(() => first.result.current.enableDemo())
    expect(first.result.current.source).toBe('demo')
    expect(first.result.current.holdings).toHaveLength(48)
    expect(first.result.current.decks.length).toBeGreaterThan(0)
    act(() => first.result.current.exitDemo())
    expect(first.result.current.source).toBe('empty')
    expect(first.result.current.holdings).toEqual([])
    expect(first.result.current.decks).toEqual([])
    act(() => first.result.current.enableDemo())
    first.unmount()
    expect(renderHook(useCollection, { wrapper }).result.current.source).toBe('empty')
    expect(remove).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the saved import intact through demo entry, exit and reload without storage writes', () => {
    storeCollection(localStorage, syntheticCsv())
    const original = localStorage.getItem(COLLECTION_KEY)
    const first = renderHook(useCollection, { wrapper })
    const imported = first.result.current.holdings
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    act(() => first.result.current.enableDemo())
    expect(first.result.current.source).toBe('demo')
    act(() => first.result.current.exitDemo())
    expect(first.result.current.source).toBe('moxfield')
    expect(first.result.current.holdings).toEqual(imported)
    act(() => first.result.current.enableDemo())
    first.unmount()
    const second = renderHook(useCollection, { wrapper })
    expect(second.result.current.source).toBe('moxfield')
    expect(second.result.current.holdings).toEqual(imported)
    expect(localStorage.getItem(COLLECTION_KEY)).toBe(original)
    expect(write).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps saved filters separate when clearing a collection', () => {
    storeCollection(localStorage, syntheticCsv())
    const { result } = renderHook(useCollection, { wrapper })
    act(() => result.current.setQuery({ ...EMPTY_QUERY, search: 'saved search' }))
    act(() => { expect(result.current.save('Saved')).toBe(true) })
    const filters = localStorage.getItem(SAVED_KEY)
    act(() => { expect(result.current.clearCollection()).toBe(true) })
    expect(localStorage.getItem(SAVED_KEY)).toBe(filters)
    expect(result.current.query).toEqual(EMPTY_QUERY)
    expect(result.current.saved?.query.search).toBe('saved search')
  })

  it('never applies an invalid file or replaces stored good data', () => {
    storeCollection(localStorage, syntheticCsv())
    const { result } = renderHook(useCollection, { wrapper })
    const original = localStorage.getItem(COLLECTION_KEY)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { expect(result.current.applyImport('not a valid CSV')).toBe(false) })
    expect(write).not.toHaveBeenCalled()
    expect(result.current.holdings[0].quantity).toBe(2)
    expect(localStorage.getItem(COLLECTION_KEY)).toBe(original)
    expect(result.current.message).toContain('not applied')
  })

  it('keeps current and stored data on quota/permission failure and reports failure visibly', () => {
    storeCollection(localStorage, syntheticCsv())
    const { result } = renderHook(useCollection, { wrapper })
    const original = localStorage.getItem(COLLECTION_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    act(() => { expect(result.current.applyImport(alternate())).toBe(false) })
    expect(result.current.holdings[0].quantity).toBe(2)
    expect(localStorage.getItem(COLLECTION_KEY)).toBe(original)
    expect(result.current.message).toContain('storage permissions/space')
  })

  it('does not claim a clear when removal fails', () => {
    storeCollection(localStorage, syntheticCsv())
    const { result } = renderHook(useCollection, { wrapper })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    act(() => { expect(result.current.clearCollection()).toBe(false) })
    expect(result.current.source).toBe('moxfield')
    expect(result.current.message).toContain('Clear failed')
    expect(localStorage.getItem(COLLECTION_KEY)).not.toBeNull()
  })

  it('surfaces corrupt/inaccessible storage without logging private text or deleting it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const getItem of [() => '{"version":1,"csv":"private-invalid-data"}', () => '{private-invalid-json', () => { throw new Error('denied') }]) {
      expect(loadCollection({ getItem })).toMatchObject({ preview: null, error: expect.stringContaining('could not be read') })
    }
    expect(log).not.toHaveBeenCalled()
    localStorage.setItem(COLLECTION_KEY, '{private-invalid-json')
    const { result } = renderHook(useCollection, { wrapper })
    expect(result.current.source).toBe('empty')
    expect(result.current.holdings).toEqual([])
    expect(result.current.decks).toEqual([])
    expect(result.current.message).toContain('stored collection has not been deleted')
    expect(localStorage.getItem(COLLECTION_KEY)).toBe('{private-invalid-json')
    act(() => result.current.enableDemo())
    act(() => result.current.exitDemo())
    expect(result.current.source).toBe('empty')
    expect(localStorage.getItem(COLLECTION_KEY)).toBe('{private-invalid-json')
  })

  it('falls back to empty when storage access is unavailable and never deletes saved data', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    storeCollection(localStorage, syntheticCsv())
    const original = localStorage.getItem(COLLECTION_KEY)
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    const access = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    const { result } = renderHook(useCollection, { wrapper })
    expect(result.current.source).toBe('empty')
    expect(result.current.holdings).toEqual([])
    expect(result.current.decks).toEqual([])
    expect(result.current.message).toContain('Check browser storage permissions')
    act(() => { expect(result.current.applyImport(alternate())).toBe(false) })
    expect(result.current.source).toBe('empty')
    act(() => result.current.enableDemo())
    expect(result.current.source).toBe('demo')
    act(() => result.current.exitDemo())
    expect(result.current.source).toBe('empty')
    expect(remove).not.toHaveBeenCalled()
    access.mockRestore()
    expect(localStorage.getItem(COLLECTION_KEY)).toBe(original)
    log.mockRestore()
  })
})

describe('source-aware pages', () => {
  it('does not label empty decks or missing cards as imported or demo data', () => {
    const page = render(<MemoryRouter><CollectionProvider><Decks /></CollectionProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'No decks loaded' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import collection' })).toHaveAttribute('href', '/import')
    expect(screen.queryByText('The Drowned Observatory')).not.toBeInTheDocument()
    page.unmount()
    render(<MemoryRouter initialEntries={['/cards/aetherwell-0']}><CollectionProvider><Routes><Route path="/cards/:holdingId" element={<CardDetail />} /></Routes></CollectionProvider></MemoryRouter>)
    expect(screen.getByText('No collection is loaded. Import a Moxfield export to browse your cards.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import collection' })).toBeInTheDocument()
  })

  it('uses the imported holding in details and never associates demo decks', () => {
    storeCollection(localStorage, syntheticCsv())
    const page = render(<MemoryRouter initialEntries={['/cards/moxfield-2']}><CollectionProvider><Routes><Route path="/cards/:holdingId" element={<CardDetail />} /></Routes></CollectionProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Example, "Mapkeeper"' })).toBeInTheDocument()
    expect(screen.getByText('Mana value unknown')).toBeInTheDocument()
    expect(screen.getByText(/7.2500/)).toBeInTheDocument()
    expect(screen.queryByText(/synthetic USD estimates/)).not.toBeInTheDocument()
    page.unmount()
    render(<MemoryRouter><CollectionProvider><Decks /></CollectionProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'No decks imported' })).toBeInTheDocument()
    expect(screen.queryByText('The Drowned Observatory')).not.toBeInTheDocument()
  })
})
