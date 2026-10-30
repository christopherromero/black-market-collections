import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { EMPTY_QUERY } from './domain'
import type { Query } from './domain'
import { loadSavedView, SAVED_KEY } from './storage'
import type { SavedView } from './storage'

interface CollectionState {
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

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try { return loadSavedView(localStorage) }
    catch (error) {
      console.error('Browser local storage is unavailable', error)
      return { view: null, error: 'Browser storage is unavailable. Saved views cannot be restored.' }
    }
  })
  const [query, updateQuery] = useState<Query>(initial.view?.query ?? EMPTY_QUERY)
  const [sorting, updateSorting] = useState<SortingState>([{ id: 'total', desc: true }, { id: 'name', desc: false }])
  const [page, setPage] = useState(0)
  const [layout, setLayout] = useState<'table' | 'grid'>('table')
  const [saved, setSaved] = useState<SavedView | null>(initial.view)
  const [message, setMessage] = useState<string | null>(initial.error)
  const scroll = useRef(0)
  const setQuery = (next: Query) => { updateQuery(next); setPage(0); scroll.current = 0 }
  const setSorting = (next: SortingState) => { updateSorting(next); setPage(0) }
  function save(name: string) {
    if (!name.trim()) { setMessage('Enter a name for your saved view.'); return false }
    try {
      const view = { name: name.trim(), query }
      localStorage.setItem(SAVED_KEY, JSON.stringify(view))
      setSaved(view)
      setMessage(`Saved "${view.name}" in this browser. Synthetic demo data only.`)
      return true
    } catch (error) {
      console.error('Unable to save the demo view', error)
      setMessage('The view could not be saved. Check browser storage permissions; your current filters are still applied.')
      return false
    }
  }
  return <Context.Provider value={{ query, setQuery, sorting, setSorting, page, setPage, layout, setLayout, saved, save, message, dismiss: () => setMessage(null), scroll }}>{children}</Context.Provider>
}

export function useCollection() {
  const value = useContext(Context)
  if (!value) throw new Error('Collection state must be used inside CollectionProvider')
  return value
}
