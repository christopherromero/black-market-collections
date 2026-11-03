import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { EMPTY_QUERY } from './domain'
import type { CatalogCard, Deck, Holding, Printing, Query } from './domain'
import { COLLECTION_KEY, loadCollection, loadSavedView, SAVED_KEY, storeCollection } from './storage'
import type { SavedView } from './storage'
import { holdings as demoHoldings, decks as demoDecks } from './fixtures'
import { CATALOG_KEY, CatalogRequestError, createScryfallClient, enrichCard, needsCatalogRefresh, printingKey, quoteForFinish, readCatalogCache } from './scryfall'
import type { CatalogCache } from './scryfall'
import { createCollectionCatalogClient, fetchSetDirectory } from './catalog-services'
import type { PriceRefreshProgress, SetDirectory } from './catalog-services'
import { createQuoteStore } from './quote-store'
import type { QuoteObservation } from './quote-store'

interface CollectionState {
  source: 'empty' | 'demo' | 'moxfield'
  holdings: Holding[]
  decks: Deck[]
  binders: string[]
  setDirectory: SetDirectory
  setsLoading: boolean
  setsError: string | null
  setsRevision: number
  loadSets: (force?: boolean) => Promise<void>
  groupBySet: boolean
  setGroupBySet: (group: boolean) => void
  fullRefresh: PriceRefreshProgress & { running: boolean }
  fullRefreshMessage: string
  fullRefreshErrors: Record<string, string>
  refreshAllPrices: () => Promise<void>
  stopFullRefresh: () => void
  historyRevision: number
  priceStoreError: string | null
  loadPriceHistory: (printing: Printing) => Promise<QuoteObservation[]>
  revision: number
  applyImport: (csv: string) => boolean
  enableDemo: () => void
  exitDemo: () => void
  clearCollection: () => boolean
  watchImages: (ids: string[]) => () => void
  resumeImages: (rows: Holding[], refresh?: boolean) => void
  resolutionPaused: boolean
  resolving: boolean
  resolutionMessage: string
  resolutionErrors: Record<string, string>
  query: Query
  setQuery: (query: Query) => void
  sorting: SortingState
  setSorting: (sorting: SortingState) => void
  page: number
  setPage: (page: number) => void
  layout: 'table' | 'grid'
  setLayout: (layout: 'table' | 'grid') => void
  saved: SavedView | null
  save: (name: string) => boolean
  message: string | null
  dismiss: () => void
  scroll: RefObject<number>
}

const Context = createContext<CollectionState | null>(null)
const NO_DECKS: Deck[] = []
const NO_HOLDINGS: Holding[] = []

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [local] = useState(() => {
    try { return loadCollection(localStorage) }
    catch { return { preview: null, error: 'Browser storage is unavailable. No collection loaded; nothing has been deleted. Check browser storage permissions before importing.' } }
  })
  const [cached] = useState(() => {
    try { return { data: readCatalogCache(localStorage.getItem(CATALOG_KEY)), error: null } }
    catch { return { data: {} as CatalogCache, error: 'Cached public metadata could not be read. You can resolve images again.' } }
  })
  const [source, setSource] = useState<CollectionState['source']>(local.preview ? 'moxfield' : 'empty')
  const [imported, setImported] = useState<Holding[] | null>(local.preview?.holdings ?? null)
  const [catalog, setCatalog] = useState(cached.data)
  const catalogRef = useRef(catalog)
  const legacyCache = useRef(cached.data)
  const [quoteStore] = useState(createQuoteStore)
  const [refreshCatalog] = useState(() => createCollectionCatalogClient())
  const [setDirectory, setSetDirectory] = useState<SetDirectory>({})
  const setDirectoryRef = useRef(setDirectory)
  const [setsLoading, setSetsLoading] = useState(false)
  const [setsError, setSetsError] = useState<string | null>(null)
  const [setsRevision, setSetsRevision] = useState(0)
  const setsController = useRef<AbortController | null>(null)
  const [groupBySet, updateGroupBySet] = useState(false)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [priceStoreError, setPriceStoreError] = useState<string | null>(null)
  const [fullRefresh, setFullRefresh] = useState<PriceRefreshProgress & { running: boolean }>({ running: false, total: 0, completed: 0, failed: 0 })
  const [fullRefreshMessage, setFullRefreshMessage] = useState('')
  const [fullRefreshErrors, setFullRefreshErrors] = useState<Record<string, string>>({})
  const fullController = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const refreshKeys = useRef(new Set<string>())
  const [pausedScope, setPausedScope] = useState<string | null>(null)
  const resolutionPaused = pausedScope !== null
  const [retry, setRetry] = useState(0)
  const [resolvePrinting] = useState(() => createScryfallClient())
  const [revision, setRevision] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [resolutionMessage, setResolutionMessage] = useState('')
  const [resolutionErrors, setResolutionErrors] = useState<Record<string, string>>({})
  const errorsRef = useRef<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort(); controller.current = null
      fullController.current?.abort(); fullController.current = null
      setsController.current?.abort(); setsController.current = null
      quoteStore.close()
    }
  }, [quoteStore])
  const mergeCatalog = useCallback((cards: CatalogCard[]) => {
    const next = { ...catalogRef.current }
    for (const card of cards) {
      const key = printingKey(card.printing)
      const previousTime = Date.parse(next[key]?.pricing.retrievedAt ?? '') || 0
      const nextTime = Date.parse(card.pricing.retrievedAt ?? '') || 0
      if (!next[key] || nextTime >= previousTime) next[key] = card
    }
    catalogRef.current = next; setCatalog(next)
  }, [])
  const persistCards = useCallback(async (cards: CatalogCard[]) => {
    if (!cards.length) return
    try {
      await quoteStore.saveCards(cards)
      if (mounted.current) { setPriceStoreError(null); setHistoryRevision(value => value + 1) }
    } catch (error) {
      console.error('Public quote history could not be saved', error)
      if (mounted.current) setPriceStoreError('Prices work for this session, but quote history could not be saved. Check browser storage permissions and space.')
    }
  }, [quoteStore])
  useEffect(() => {
    let active = true
    void Promise.all([quoteStore.readCatalog(), quoteStore.readSets()]).then(async ([cards, sets]) => {
      if (!active) return
      mergeCatalog(Object.values(cards))
      if (Object.keys(setDirectoryRef.current).length === 0 && Object.keys(sets).length) {
        setDirectoryRef.current = sets; setSetDirectory(sets); setSetsRevision(value => value + 1)
      }
      setHistoryRevision(value => value + 1)
      await persistCards(Object.values(cached.data).filter(card => {
        const saved = cards[printingKey(card.printing)]
        return !saved || (Date.parse(card.pricing.retrievedAt ?? '') || 0) > (Date.parse(saved.pricing.retrievedAt ?? '') || 0)
      }))
    }).catch(error => {
      if (!active) return
      console.error('Public pricing storage could not be opened', error)
      setPriceStoreError('Saved quote history is unavailable in this browser. Check storage permissions; current reference prices can still load.')
    })
    return () => { active = false }
  }, [quoteStore, cached.data, mergeCatalog, persistCards])
  const loadPriceHistory = useCallback((printing: Printing) => quoteStore.readHistory(printingKey(printing)), [quoteStore])
  const holdings = useMemo(() => source === 'demo' ? demoHoldings : source === 'empty' ? NO_HOLDINGS : (imported ?? NO_HOLDINGS).map(row => {
    const data = catalog[printingKey(row)]
    return data ? { ...row, card: enrichCard(row.card, data), priceCents: quoteForFinish(data, row.finish) } : row
  }), [source, imported, catalog])
  const decks = source === 'demo' ? demoDecks : NO_DECKS
  const binders = useMemo(() => [...new Set(holdings.map(row => row.binder))], [holdings])
  const [initial] = useState(() => {
    try { return loadSavedView(localStorage) }
    catch (error) {
      console.error('Browser local storage is unavailable', error)
      return { view: null, error: 'Browser storage is unavailable. Saved filters cannot be restored.' }
    }
  })
  const [query, updateQuery] = useState<Query>(initial.view?.query ?? EMPTY_QUERY)
  const [sorting, updateSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [page, setPage] = useState(0)
  const [layout, setLayout] = useState<'table' | 'grid'>('table')
  const [saved, setSaved] = useState<SavedView | null>(initial.view)
  const [message, setMessage] = useState<string | null>([local.error, cached.error, initial.error].filter(Boolean).join(' ') || null)
  const scroll = useRef(0)
  const setQuery = (next: Query) => { updateQuery(next); setPage(0); scroll.current = 0 }
  const setSorting = (next: SortingState) => {
    updateSorting(next); setPage(0)
    if (next.some(item => item.id === 'set' || item.id === 'releaseDate')) void loadSets()
  }
  const setGroupBySet = (group: boolean) => { updateGroupBySet(group); setPage(0); scroll.current = 0 }
  function abortResolution() {
    controller.current?.abort()
    controller.current = null
    setResolving(false)
  }
  function resumeImages(rows: Holding[], refresh = false) {
    abortResolution()
    const next = { ...errorsRef.current }
    for (const row of rows) delete next[printingKey(row)]
    for (const row of rows) if (refresh || errorsRef.current[printingKey(row)] || catalogRef.current[printingKey(row)]?.pricing.error) refreshKeys.current.add(printingKey(row))
    errorsRef.current = next; setResolutionErrors(next)
    setPausedScope(null); setRetry(value => value + 1)
  }
  function switchDataset() {
    abortResolution()
    fullController.current?.abort(); fullController.current = null
    setsController.current?.abort(); setsController.current = null
    setFullRefresh({ running: false, total: 0, completed: 0, failed: 0 }); setFullRefreshMessage(''); setFullRefreshErrors({})
    setSetsLoading(false); setSetsError(null); updateGroupBySet(false)
    setPausedScope(null)
    setQuery(EMPTY_QUERY); setSorting([{ id: 'name', desc: false }])
    errorsRef.current = {}
    refreshKeys.current.clear()
    setRevision(value => value + 1); setResolutionErrors({}); setResolutionMessage('')
  }
  function applyImport(csv: string) {
    try {
      const preview = storeCollection(localStorage, csv)
      switchDataset(); setImported(preview.holdings); setSource('moxfield')
      setMessage(`Imported ${preview.rows} entries / ${preview.copies} copies locally.`)
      return true
    } catch {
      setMessage('Import was not applied. Fix file errors or check browser storage permissions/space. Your current collection is unchanged.')
      return false
    }
  }
  // Demo is session-only and never writes or removes the saved snapshot.
  function enableDemo() {
    switchDataset(); setSource('demo')
    setMessage('Temporary demo enabled. Any saved collection is unchanged. Exit demo or reload to return.')
  }
  function exitDemo() {
    switchDataset(); setSource(imported ? 'moxfield' : 'empty')
    setMessage(imported ? 'Demo closed. Your imported collection is active again.' : 'Demo closed. No collection loaded; import a Moxfield export to get started.')
  }
  function clearCollection() {
    try {
      localStorage.removeItem(COLLECTION_KEY)
      switchDataset(); setImported(null); setSource('empty')
      setMessage('Saved collection removed. The collection is now empty. Saved filters and public image metadata may remain cached.')
      return true
    } catch {
      setMessage('Clear failed: check browser storage permissions and retry. Your current collection and saved snapshot are unchanged.')
      return false
    }
  }
  async function loadSets(force = false) {
    if (source !== 'moxfield' || setsController.current) return
    if (!force && imported?.every(row => Boolean(setDirectoryRef.current[row.set.toLowerCase()]))) return
    const run = new AbortController()
    setsController.current = run; setSetsLoading(true); setSetsError(null)
    try {
      const sets = await fetchSetDirectory(run.signal)
      if (run.signal.aborted || setsController.current !== run) return
      setDirectoryRef.current = sets; setSetDirectory(sets); setSetsRevision(value => value + 1)
      try { await quoteStore.saveSets(sets) }
      catch (error) {
        console.error('Public set metadata could not be saved', error)
        if (mounted.current) setSetsError('Set details loaded, but could not be saved for next time. Check browser storage permissions.')
      }
    } catch (error) {
      if (!run.signal.aborted && mounted.current) setSetsError(error instanceof Error ? error.message : 'Set details could not load. Set codes still work; release dates remain unknown.')
    } finally {
      if (setsController.current === run) { setsController.current = null; setSetsLoading(false) }
    }
  }
  function stopFullRefresh() {
    fullController.current?.abort(); fullController.current = null
    setFullRefresh(previous => ({ ...previous, running: false }))
    setFullRefreshMessage('Full-price refresh stopped. Completed quotes and history are kept; visible cards continue loading.')
    setRetry(value => value + 1)
  }
  async function refreshAllPrices() {
    if (source !== 'moxfield' || !imported?.length || fullController.current) return
    abortResolution(); setPausedScope(null)
    const printings = imported.map(({ set, collectorNumber, language }) => ({ set, collectorNumber, language }))
    const total = new Set(printings.map(printingKey)).size
    const run = new AbortController()
    fullController.current = run
    setFullRefresh({ running: true, total, completed: 0, failed: 0 }); setFullRefreshErrors({})
    setFullRefreshMessage('Updating reference prices for the entire collection...')
    void loadSets()
    try {
      await refreshCatalog(printings, run.signal, async batch => {
        if (run.signal.aborted || fullController.current !== run) return
        mergeCatalog(batch.cards)
        const errors = { ...errorsRef.current, ...batch.errors }
        for (const card of batch.cards) {
          const key = printingKey(card.printing)
          if (card.pricing.error) errors[key] = card.pricing.error
          else delete errors[key]
        }
        errorsRef.current = errors; setResolutionErrors(errors)
        setFullRefreshErrors(previous => ({ ...previous, ...batch.errors }))
        setFullRefresh({ ...batch.progress, running: true })
        setFullRefreshMessage(`Checked ${batch.progress.completed} of ${batch.progress.total} printings; ${batch.progress.failed} unresolved.`)
        await persistCards(batch.cards)
      })
    } catch (error) {
      if (!run.signal.aborted && mounted.current) setFullRefreshMessage(error instanceof Error ? error.message : 'Price refresh failed. Completed quotes were kept; retry later.')
    } finally {
      if (fullController.current === run) {
        fullController.current = null
        setFullRefresh(previous => ({ ...previous, running: false }))
        setRetry(value => value + 1)
      }
    }
  }
  const watchImages = useCallback((ids: string[]) => {
    if (source !== 'moxfield' || fullRefresh.running) return () => {}
    const scope = JSON.stringify([...ids].sort())
    if (pausedScope !== null) {
      if (pausedScope !== scope) setPausedScope(null)
      return () => {}
    }
    const visible = new Set(ids)
    const unique = [...new Map((imported ?? []).filter(row => visible.has(row.id)).map(row => [printingKey(row), row])).values()]
    const pending = unique.filter(row => (needsCatalogRefresh(catalogRef.current[printingKey(row)]) || refreshKeys.current.has(printingKey(row))) && !errorsRef.current[printingKey(row)])
    const run = new AbortController()
    controller.current?.abort()
    controller.current = run
    const current = () => controller.current === run && !run.signal.aborted
    // Defer startup past effect replay: StrictMode must not issue duplicate requests.
    void (async () => {
      await Promise.resolve()
      if (!current()) return
      let completed = unique.length - pending.length
      let failed = unique.filter(row => errorsRef.current[printingKey(row)]).length
      setResolving(pending.length > 0)
      setResolutionMessage(`Resolving ${completed} of ${unique.length} visible printings…`)
      for (const row of pending) {
        if (!current()) return
        const key = printingKey(row)
        refreshKeys.current.delete(key)
        let stop = false
        try {
          const data = await resolvePrinting({ set: row.set, collectorNumber: row.collectorNumber, language: row.language }, run.signal)
          if (!current()) return
          // Commit each success, not the batch: navigation/cancel keeps completed work.
          mergeCatalog([data])
          if (data.pricing.error) {
            failed++
            const errors = { ...errorsRef.current, [key]: data.pricing.error }
            errorsRef.current = errors; setResolutionErrors(errors)
          }
          legacyCache.current = Object.fromEntries(Object.entries({ ...legacyCache.current, [key]: data }).slice(-64))
          try { localStorage.setItem(CATALOG_KEY, JSON.stringify(legacyCache.current)) }
          catch { setMessage('Public image metadata could not be cached. Images work for this session; your saved collection is unchanged. Check browser storage space/permissions.') }
          await persistCards([data])
        } catch (error) {
          if (!current()) return
          failed++
          const next = { ...errorsRef.current, [key]: error instanceof Error ? error.message : 'Metadata unavailable. Retry later.' }
          errorsRef.current = next; setResolutionErrors(next)
          stop = error instanceof CatalogRequestError && error.stopBatch
        }
        if (!current()) return
        completed++
        setResolutionMessage(`Resolving ${completed} of ${unique.length} visible printings; ${failed} failed.`)
        if (stop) {
          setPausedScope(scope)
          break
        }
      }
      if (!current()) return
      setResolutionMessage(`Checked ${completed} of ${unique.length} visible printings; ${failed} failed.${failed ? ' Retry / resume when ready; rate limits may require waiting.' : ''}`)
      controller.current = null; setResolving(false)
    })()
    return () => {
      run.abort()
      // An old cleanup/result must never clear a newer route's controller.
      if (controller.current === run) { controller.current = null; setResolving(false) }
    }
  // Explicit retry replaces the watcher even when the paused scope did not change.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [source, imported, pausedScope, retry, resolvePrinting, fullRefresh.running, mergeCatalog, persistCards])
  function save(name: string) {
    if (!name.trim()) { setMessage('Enter a name for your filters.'); return false }
    try {
      const view = { name: name.trim(), query }
      localStorage.setItem(SAVED_KEY, JSON.stringify(view))
      setSaved(view)
      setMessage(`Saved filters "${view.name}" in this browser.`)
      return true
    } catch (error) {
      console.error('Unable to save filters', error)
      setMessage('Filters could not be saved. Check browser storage permissions; your current filters are still applied.')
      return false
    }
  }
  return <Context.Provider value={{ source, holdings, decks, binders, setDirectory, setsLoading, setsError, setsRevision, loadSets, groupBySet, setGroupBySet, fullRefresh, fullRefreshMessage, fullRefreshErrors, refreshAllPrices, stopFullRefresh, historyRevision, priceStoreError, loadPriceHistory, revision, applyImport, enableDemo, exitDemo, clearCollection, watchImages, resumeImages, resolutionPaused, resolving, resolutionMessage, resolutionErrors, query, setQuery, sorting, setSorting, page, setPage, layout, setLayout, saved, save, message, dismiss: () => setMessage(null), scroll }}>{children}</Context.Provider>
}

export function useCollection() {
  const value = useContext(Context)
  if (!value) throw new Error('Collection state must be used inside CollectionProvider')
  return value
}
