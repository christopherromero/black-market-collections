import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Bookmark, Check, ChevronLeft, ChevronRight, Columns3, Grid2X2, List, Search, SlidersHorizontal, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, RowSelectionState, VisibilityState } from '@tanstack/react-table'
import { CardTile, ColorPips, EmptyState, Modal, PageTitle } from '../components'
import { COLOR_NAMES, EMPTY_QUERY, activeFilters, exportCsv, isQuery, matchesQuery, money, summarize, totalValue } from '../domain'
import type { Color, Holding, Query } from '../domain'
import { binders, decks, holdings } from '../fixtures'
import { useCollection } from '../state'

const SORTS = [{ id: 'total', name: 'Total value' }, { id: 'name', name: 'Card name' }, { id: 'quantity', name: 'Quantity' }, { id: 'price', name: 'Unit value' }, { id: 'manaValue', name: 'Mana value' }]

function columns(onOpen: () => void): ColumnDef<Holding>[] {
  return [
    { id: 'select', header: '', enableHiding: false, cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.card.name} ${row.original.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> },
    { id: 'name', accessorFn: row => row.card.name, header: 'Card name', enableHiding: false, cell: ({ row }) => <Link className="card-name" to={`/cards/${row.original.id}`} onClick={onOpen}><strong>{row.original.card.name}</strong><span>{row.original.card.type}</span></Link> },
    { id: 'printing', accessorFn: row => `${row.set} #${row.collectorNumber}`, header: 'Printing', enableSorting: false },
    { id: 'quantity', accessorKey: 'quantity', header: 'Qty' },
    { id: 'finish', accessorKey: 'finish', header: 'Finish', enableSorting: false },
    { id: 'binder', accessorKey: 'binder', header: 'Binder', enableSorting: false },
    { id: 'price', accessorFn: row => row.priceCents ?? undefined, header: 'Unit USD', sortUndefined: 'last', cell: ({ row }) => <span className={row.original.priceCents === null ? 'gold' : ''}>{money(row.original.priceCents)}</span> },
    { id: 'total', accessorFn: row => totalValue(row) ?? undefined, header: 'Total USD', sortUndefined: 'last', cell: ({ row }) => <strong className={totalValue(row.original) === null ? 'gold' : 'positive'}>{money(totalValue(row.original))}</strong> },
    { id: 'manaValue', accessorFn: row => row.card.manaValue, header: 'Mana value' },
    { id: 'usage', header: 'Deck usage', enableSorting: false, cell: ({ row }) => <span>{decks.filter(deck => deck.entries.some(e => e.cardId === row.original.card.id)).length} decks</span> },
    { id: 'id', accessorKey: 'id', header: 'Holding ID' },
  ]
}

export default function Collection() {
  'use no memo'
  const state = useCollection()
  const { query, setQuery, sorting, setSorting, page, setPage, scroll, layout, setLayout } = state
  const [dialog, setDialog] = useState<'filters' | 'sort' | 'save' | 'columns' | null>(null)
  const [draft, setDraft] = useState(query)
  const [filterError, setFilterError] = useState('')
  const [saveName, setSaveName] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({ manaValue: false, usage: false, id: false })
  const [compact, setCompact] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const filtered = useMemo(() => holdings.filter(row => matchesQuery(row, query, decks)), [query])
  const stableSorting = useMemo(() => [...sorting, { id: 'id', desc: false }], [sorting])
  const summary = summarize(filtered)
  const tableColumns = useMemo(() => columns(() => { scroll.current = window.scrollY }), [scroll])
  // TanStack v8 exposes mutable table methods; this component opts out of compiler memoization.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: filtered, columns: tableColumns,
    state: { sorting: stableSorting, pagination: { pageIndex: Math.min(page, Math.max(0, Math.ceil(filtered.length / 8) - 1)), pageSize: 8 }, columnVisibility: visibility, rowSelection },
    autoResetPageIndex: false,
    onColumnVisibilityChange: setVisibility, onRowSelectionChange: setRowSelection,
    getRowId: row => row.id, getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: updater => {
      const current = { pageIndex: page, pageSize: 8 }
      setPage((typeof updater === 'function' ? updater(current) : updater).pageIndex)
      scroll.current = 0
    },
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo(0, scroll.current))
    return () => cancelAnimationFrame(frame)
  }, [scroll])

  function openFilters() { setDraft(query); setFilterError(''); setDialog('filters') }
  function toggleColor(color: Color) {
    setQuery({ ...query, colors: query.colors.includes(color) ? query.colors.filter(c => c !== color) : [...query.colors, color] })
  }
  function download() {
    const allMatches = table.getPrePaginationRowModel().rows.map(row => row.original)
    const url = URL.createObjectURL(new Blob(['\uFEFF', exportCsv(allMatches)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'black-market-demo-filtered.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportMessage(`Exported all ${allMatches.length} filtered holding rows, in the current sort order. Not just this page.`)
  }
  function updateSort(index: number, patch: { id?: string; desc?: boolean }) {
    setSorting(sorting.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  const count = activeFilters(query)
  const pageRows = table.getRowModel().rows
  const selectedCount = table.getSelectedRowModel().rows.length
  return <>
    <PageTitle eyebrow="THE DEMO VAULT / COLLECTION" title="Know what you hold."><button className="button ghost" onClick={() => setDialog('save')}><Bookmark size={16} /> Save view</button></PageTitle>
    <div className="saved-tabs" aria-label="Collection views"><button onClick={() => setQuery(EMPTY_QUERY)}>All cards</button><button onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'available' })}>Available copies</button><button onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'unused' })}>Waiting for a deck</button>{state.saved && <button onClick={() => setQuery(state.saved!.query)}><Bookmark size={13} /> {state.saved.name}</button>}</div>
    <div className="collection-search"><label className="search-field"><Search size={18} /><input type="search" aria-label="Search cards or rules" placeholder="Search cards, rules text, or types..." value={query.search} onChange={e => setQuery({ ...query, search: e.target.value })} /></label><div className="identity-controls" aria-label="Color identity filters">{(Object.keys(COLOR_NAMES) as Color[]).map(color => <button aria-label={`Filter ${COLOR_NAMES[color]}`} aria-pressed={query.colors.includes(color)} className={`identity pip-${color} ${query.colors.includes(color) ? 'selected' : ''}`} onClick={() => toggleColor(color)} key={color}>{color}</button>)}</div></div>
    <div className="collection-toolbar"><div className="toolbar-group"><button className="button ghost" onClick={openFilters}><SlidersHorizontal size={16} /> Filters {count > 0 && <span className="count-badge">{count}</span>}</button><button className="button ghost" onClick={() => setDialog('sort')}><ArrowUpDown size={16} /> Sort ({sorting.length})</button><button className="button ghost desktop-only" onClick={() => setDialog('columns')}><Columns3 size={16} /> Columns</button><button className="button ghost desktop-only" onClick={() => setCompact(!compact)} aria-pressed={compact}>Density</button></div><div className="toolbar-group"><div className="segmented" aria-label="Collection layout"><button aria-label="Table view" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><List size={18} /></button><button aria-label="Gallery view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={18} /></button></div><button className="button ghost export-button" onClick={download} disabled={!filtered.length}><ArrowDownToLine size={16} /> Export <span className="export-count">{filtered.length}</span></button></div></div>
    {count > 0 && <div className="active-query"><span>Match ALL conditions{query.colors.length ? ` / identity ${query.excludeColors ? 'excludes' : 'matches'} ${query.colorMode.toUpperCase()} of ${query.colors.join(', ')}` : ''}</span>{query.multicolorOnly && <span className="chip">Multicolor only</span>}{query.monocolorOnly && <span className="chip">{query.colors.includes('C') ? 'Colorless only' : 'Single-color only'}</span>}{query.binder && <span className="chip">{query.binder}</span>}{query.finish && <span className="chip">{query.finish}</span>}{query.usage !== 'all' && <span className="chip">{query.usage}</span>}<button className="text-link" onClick={() => setQuery(EMPTY_QUERY)}>Clear filters <X size={14} /></button></div>}
    <div className="result-summary" role="status"><span><strong>{filtered.length}</strong> results <span className="separator">/</span> {summary.copies} copies <span className="separator">/</span> <b>{money(summary.valueCents)}</b> priced value</span><span className="small muted">Coverage {(summary.coverage * 100).toFixed(1)}% ({summary.pricedCopies}/{summary.copies}) / {summary.unpricedCopies} unpriced</span></div>
    <p className="sort-summary small muted">Sort: {sorting.map((sort, i) => `${i + 1}. ${SORTS.find(s => s.id === sort.id)?.name} ${sort.desc ? 'descending' : 'ascending'}`).join(' / ')} / Holding ID tie-break / Missing prices last</p>
    {exportMessage && <p className="notice" role="status">{exportMessage}</p>}
    {!filtered.length ? <EmptyState title="No cards match this connection."><p>Your demo collection has not changed. Try a broader search.</p><button className="button ghost" onClick={() => setQuery(EMPTY_QUERY)}>Clear filters</button></EmptyState> : <>
      {layout === 'grid' ? <div className="collection-grid">{pageRows.map(row => <CardTile key={row.id} holding={row.original} onOpen={() => { scroll.current = window.scrollY }} />)}</div> : <>
        <div className={`collection-table ${compact ? 'dense' : ''}`}><table aria-label="Filtered collection"><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}>{header.id === 'select' ? <input aria-label="Select this page" type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} /> : header.column.getCanSort() ? <button onClick={() => setSorting([{ id: header.column.id, desc: header.column.getIsSorted() !== 'desc' }])}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? <ArrowUp size={12} /> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={12} /> : null}</button> : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{pageRows.map(row => <tr key={row.id} data-selected={row.getIsSelected()}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>
        <div className="mobile-card-list">{pageRows.map(row => <Link className="mobile-card-row" key={row.id} to={`/cards/${row.id}`} onClick={() => { scroll.current = window.scrollY }}><div className="mini-art"><CardArtMini art={row.original.card.art} /></div><div><strong>{row.original.card.name}</strong><span>{row.original.set} #{row.original.collectorNumber} / {row.original.finish}</span><span>{row.original.binder} / {row.original.quantity} copies</span><b>{money(totalValue(row.original))}</b></div><ColorPips card={row.original.card} /></Link>)}</div>
      </>}
      <div className="collection-footer"><div className="selection-summary small"><span>{selectedCount} selected of {filtered.length} matches</span><button className="text-link" onClick={() => table.toggleAllRowsSelected(true)}>Select all {filtered.length}</button>{selectedCount > 0 && <button className="text-link" onClick={() => table.resetRowSelection()}>Clear selection</button>}</div><div className="pagination"><span className="small muted">{table.getState().pagination.pageIndex * 8 + 1}-{Math.min((table.getState().pagination.pageIndex + 1) * 8, filtered.length)} of {filtered.length}</span><button className="icon-button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label="Previous page"><ChevronLeft size={18} /></button><button className="icon-button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label="Next page"><ChevronRight size={18} /></button></div></div>
    </>}
    <p className="small muted data-footnote">Full synthetic dataset query / Export includes every matching holding, not the current page or selection. View preferences stay in this browser, not in the URL.</p>
    <Modal open={dialog === 'filters'} onClose={() => setDialog(null)} title="Advanced filters"><form onSubmit={e => {
      e.preventDefault()
      if (!isQuery(draft)) { setFilterError('Check your ranges. Values must be nonnegative and the minimum cannot exceed the maximum.'); return }
      setQuery(draft); setDialog(null)
    }}><div className="modal-body"><p className="small muted">Match ALL conditions across the complete dataset. Color identity has its own ANY / ALL group.</p><div className="filter-grid"><label>Binder<select value={draft.binder} onChange={e => setDraft({ ...draft, binder: e.target.value })}><option value="">All binders</option>{binders.map(b => <option key={b}>{b}</option>)}</select></label><label>Finish<select value={draft.finish} onChange={e => setDraft({ ...draft, finish: e.target.value })}><option value="">All finishes</option>{['Nonfoil', 'Foil', 'Etched'].map(f => <option key={f}>{f}</option>)}</select></label><label>Deck usage<select value={draft.usage} onChange={e => setDraft({ ...draft, usage: e.target.value as Query['usage'] })}><option value="all">Any usage</option><option value="used">Used in a deck</option><option value="unused">Not used in a deck</option><option value="available">Unallocated copies available</option></select></label><label>Price coverage<select value={draft.pricing} onChange={e => setDraft({ ...draft, pricing: e.target.value as Query['pricing'] })}><option value="all">All prices</option><option value="priced">Priced only</option><option value="missing">Missing price</option></select></label><label>Minimum quantity<input type="number" min="0" step="1" value={draft.minQuantity} onChange={e => setDraft({ ...draft, minQuantity: Number(e.target.value) })} /></label><label>Maximum mana value<input type="number" min="0" step="1" value={draft.maxMana} onChange={e => setDraft({ ...draft, maxMana: e.target.value })} placeholder="No limit" /></label><label>Minimum total value (USD)<input type="number" min="0" step=".01" value={draft.minValue} onChange={e => setDraft({ ...draft, minValue: e.target.value })} placeholder="No minimum" /></label><label>Maximum total value (USD)<input type="number" min="0" step=".01" value={draft.maxValue} onChange={e => setDraft({ ...draft, maxValue: e.target.value })} placeholder="No maximum" /></label></div><fieldset><legend>Color identity group</legend><div className="identity-controls">{(Object.keys(COLOR_NAMES) as Color[]).map(color => <button type="button" className={`identity pip-${color}`} aria-label={COLOR_NAMES[color]} aria-pressed={draft.colors.includes(color)} onClick={() => setDraft({ ...draft, colors: draft.colors.includes(color) ? draft.colors.filter(c => c !== color) : [...draft.colors, color] })} key={color}>{color}</button>)}</div><label>Combine colors<select value={draft.colorMode} onChange={e => setDraft({ ...draft, colorMode: e.target.value as Query['colorMode'] })}><option value="any">ANY selected color (OR)</option><option value="all">ALL selected colors (AND)</option></select></label><label className="check-label"><input type="checkbox" checked={draft.excludeColors} onChange={e => setDraft({ ...draft, excludeColors: e.target.checked })} /> Exclude the matching color group</label></fieldset>{filterError && <p className="notice warning" role="alert">{filterError}</p>}</div><div className="modal-footer"><button type="button" className="button ghost" onClick={() => setDraft(EMPTY_QUERY)}>Clear</button><button className="button primary" type="submit">Apply / {holdings.filter(row => matchesQuery(row, draft, decks)).length} results</button></div></form></Modal>
    <Modal open={dialog === 'sort'} onClose={() => setDialog(null)} title="Sort priorities"><div className="modal-body"><p className="small muted">Applied to every matching holding. Changes apply immediately.</p>{sorting.map((sort, i) => <div className="sort-rule" key={i}><label>Priority {i + 1}<select value={sort.id} onChange={e => updateSort(i, { id: e.target.value })}>{SORTS.map(option => <option value={option.id} key={option.id} disabled={sorting.some((s, j) => j !== i && s.id === option.id)}>{option.name}</option>)}</select></label><label>Direction<select value={sort.desc ? 'desc' : 'asc'} onChange={e => updateSort(i, { desc: e.target.value === 'desc' })}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label><button className="icon-button" disabled={sorting.length === 1} aria-label={`Remove priority ${i + 1}`} onClick={() => setSorting(sorting.filter((_, j) => i !== j))}><X size={16} /></button></div>)}<button className="button ghost" disabled={sorting.length === SORTS.length} onClick={() => { const next = SORTS.find(option => !sorting.some(s => s.id === option.id)); if (next) setSorting([...sorting, { id: next.id, desc: false }]) }}>Add sort priority</button><p className="notice small">Holding ID ascending is the stable final tie-breaker. Missing prices stay last in both directions.</p></div><div className="modal-footer"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>
    <Modal open={dialog === 'save'} onClose={() => setDialog(null)} title="Save this view"><form onSubmit={e => { e.preventDefault(); if (state.save(saveName)) setDialog(null) }}><div className="modal-body"><label>View name<input value={saveName} onChange={e => setSaveName(e.target.value)} maxLength={60} required placeholder="e.g. Available Sultai cards" /></label><p className="small muted">Saves filters in this browser. Replaces your previous custom demo view. No account or cloud storage is involved.</p></div><div className="modal-footer"><button type="submit" className="button primary"><Check size={16} />Save view</button></div></form></Modal>
    <Modal open={dialog === 'columns'} onClose={() => setDialog(null)} title="Visible columns"><div className="modal-body">{table.getAllLeafColumns().filter(column => column.getCanHide() && column.id !== 'id').map(column => <label className="check-label" key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{String(column.columnDef.header)}</label>)}</div><div className="modal-footer"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>
  </>
}

function CardArtMini({ art }: { art: number }) {
  return <div className={`mini-illustration art-${art}`} aria-hidden="true"><span /><i /></div>
}
