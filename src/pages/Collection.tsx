import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Grid2X2, List, Search, SlidersHorizontal, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, RowSelectionState, VisibilityState } from '@tanstack/react-table'
import { CardArt, CardTile, ColorPips, EmptyState, EstimateSummary, Modal, PageTitle, PriceLine, SourceNotice } from '../components'
import { COLOR_NAMES, EMPTY_QUERY, activeFilters, compareCollectorNumbers, exportCsv, isQuery, matchesQuery, money, summarize, totalValue } from '../domain'
import type { Color, Deck, Holding, Query } from '../domain'
import { useCollection } from '../state'
import { ImageResolution } from '../ImageResolution'
import type { SetDirectory } from '../catalog-services'
import PricingOverview from '../PricingOverview'

const SORTS = [{ id: 'name', name: 'Card name' }, { id: 'set', name: 'Set name' }, { id: 'collectorNumber', name: 'Collector number' }, { id: 'releaseDate', name: 'Set release date' }, { id: 'quantity', name: 'Quantity' }, { id: 'price', name: 'Price per copy' }, { id: 'total', name: 'Total price' }, { id: 'manaValue', name: 'Mana value' }]

function columns(onOpen: () => void, decks: Deck[], sets: SetDirectory): ColumnDef<Holding>[] {
  return [
    { id: 'select', header: '', enableHiding: false, cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.card.name} ${row.original.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> },
    { id: 'name', accessorFn: row => row.card.name, header: 'Card name', enableHiding: false, cell: ({ row }) => <Link className="card-name" to={`/cards/${row.original.id}`} onClick={onOpen}>{row.original.card.printing && <span className="table-card-image"><CardArt card={row.original.card} compact /></span>}<strong>{row.original.card.name}</strong><span>{row.original.card.type || 'Type unknown'}</span></Link> },
    { id: 'printing', accessorFn: row => `${row.set} #${row.collectorNumber}`, header: 'Printing', enableSorting: false },
    { id: 'set', accessorFn: row => `${sets[row.set.toLowerCase()]?.name ?? row.set.toUpperCase()} · ${row.set.toLowerCase()}`, header: 'Set', cell: ({ row }) => <span title={sets[row.original.set.toLowerCase()]?.name}>{row.original.set.toUpperCase()}</span> },
    { id: 'collectorNumber', accessorKey: 'collectorNumber', header: 'Collector #', sortingFn: (left, right) => compareCollectorNumbers(left.original.collectorNumber, right.original.collectorNumber) },
    { id: 'releaseDate', accessorFn: row => sets[row.set.toLowerCase()]?.releasedAt ?? undefined, header: 'Set release', sortUndefined: 'last', cell: ({ row }) => sets[row.original.set.toLowerCase()]?.releasedAt ?? 'Unknown' },
    { id: 'quantity', accessorKey: 'quantity', header: 'Qty' },
    { id: 'finish', accessorKey: 'finish', header: 'Finish', enableSorting: false },
    { id: 'binder', accessorKey: 'binder', header: 'Binder', enableSorting: false },
    { id: 'price', accessorFn: row => row.priceCents ?? undefined, header: 'Unit USD', sortUndefined: 'last', cell: ({ row }) => <span className={row.original.priceCents === null ? 'gold' : ''}>{money(row.original.priceCents)}</span> },
    { id: 'total', accessorFn: row => totalValue(row) ?? undefined, header: 'Total USD', sortUndefined: 'last', cell: ({ row }) => <strong className={totalValue(row.original) === null ? 'gold' : 'positive'}>{money(totalValue(row.original))}</strong> },
    { id: 'manaValue', accessorFn: row => row.card.manaValue ?? undefined, header: 'Mana value', sortUndefined: 'last', cell: ({ row }) => row.original.card.manaValue ?? 'Unknown' },
    { id: 'usage', header: 'Deck usage', enableSorting: false, cell: ({ row }) => <span>{decks.filter(deck => deck.entries.some(e => e.cardId === row.original.card.id)).length} decks</span> },
    { id: 'id', accessorKey: 'id', header: 'Holding ID' },
  ]
}

export default function Collection() {
  'use no memo'
  const state = useCollection()
  const { query, setQuery, sorting, setSorting, page, setPage, scroll, layout, setLayout, holdings, decks, binders, setDirectory, groupBySet, setGroupBySet } = state
  const [dialog, setDialog] = useState<'filters' | 'sets' | 'sort' | 'save' | 'columns' | null>(null)
  const [draft, setDraft] = useState(query)
  const [filterError, setFilterError] = useState('')
  const [saveName, setSaveName] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({ printing: false, releaseDate: false, manaValue: false, usage: false, id: false })
  const [setSearch, setSetSearch] = useState('')
  const [compact, setCompact] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const options = useRef<HTMLDetailsElement>(null)
  const filtered = useMemo(() => holdings.filter(row => matchesQuery(row, query, decks)), [query, holdings, decks])
  const stableSorting = useMemo(() => {
    if (!groupBySet) return [...sorting, { id: 'id', desc: false }]
    const release = sorting.find(item => item.id === 'releaseDate')
    const set = sorting.find(item => item.id === 'set') ?? { id: 'set', desc: false }
    return [...(release ? [release] : []), set, ...sorting.filter(item => item.id !== 'releaseDate' && item.id !== 'set'), { id: 'id', desc: false }]
  }, [sorting, groupBySet])
  const summary = summarize(filtered)
  const tableColumns = useMemo(() => columns(() => { scroll.current = window.scrollY }, decks, setDirectory), [scroll, decks, setDirectory])
  const setOptions = useMemo(() => [...new Set(holdings.map(row => row.set.toLowerCase()))].map(code => ({
    code, name: setDirectory[code]?.name ?? code.toUpperCase(), releasedAt: setDirectory[code]?.releasedAt,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code)), [holdings, setDirectory])
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
  function openSets() { setDraft(query); setSetSearch(''); setDialog('sets'); void state.loadSets() }
  function closeOptions() {
    if (options.current) {
      options.current.open = false
      options.current.querySelector('summary')?.focus()
    }
  }
  function download() {
    const allMatches = table.getPrePaginationRowModel().rows.map(row => row.original)
    const url = URL.createObjectURL(new Blob(['\uFEFF', exportCsv(allMatches)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'black-market-collection.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportMessage(`Exported all ${allMatches.length} matching ${allMatches.length === 1 ? 'entry' : 'entries'} in the current sort order.`)
  }
  function updateSort(index: number, patch: { id?: string; desc?: boolean }) {
    setSorting(sorting.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  const count = activeFilters(query)
  const pageRows = table.getRowModel().rows
  const selectedCount = table.getSelectedRowModel().rows.length
  const pageGroups = new Map<string, Holding[]>()
  for (const row of pageRows) {
    const key = groupBySet ? row.original.set.toLowerCase() : ''
    const group = pageGroups.get(key) ?? []
    group.push(row.original); pageGroups.set(key, group)
  }
  if (state.source === 'empty') return <>
    <header className="collection-header">
      <div className="collection-header-art" aria-hidden="true"><img src="/collection-banner-acr-087.jpg" alt="" /></div>
      <PageTitle eyebrow="Magic: The Gathering" title="My collection" />
    </header>
    <EmptyState title="Your collection is empty"><p>Import a Moxfield export to start browsing your cards.</p><Link className="button primary" to="/import">Import collection</Link></EmptyState>
  </>
  return <>
    <header className="collection-header">
      <div className="collection-header-art" aria-hidden="true"><img src="/collection-banner-acr-087.jpg" alt="" /></div>
      <PageTitle eyebrow="Magic: The Gathering" title="My collection"><Link className="button ghost" to="/import">Import collection</Link></PageTitle>
      <SourceNotice source={state.source} />
    </header>
    <PricingOverview />
    <div className="collection-search"><label className="search-field"><Search size={18} /><input type="search" aria-label="Search cards or rules" placeholder="Search names, rules, or types" value={query.search} onChange={e => setQuery({ ...query, search: e.target.value })} /></label></div>
    {query.sets.length > 0 && <p className="small muted">{query.excludeSets ? 'Excluding' : 'Including'}: {query.sets.map(code => setDirectory[code]?.name ?? code.toUpperCase()).join(', ')}.</p>}
    {state.setsError && <p className="notice warning" role="status">{state.setsError} <button className="text-link" onClick={() => void state.loadSets(true)}>Retry set details</button></p>}
    <div className="saved-tabs" aria-label="Quick filters"><button aria-pressed={count === 0} onClick={() => setQuery(EMPTY_QUERY)}>All cards</button><button aria-pressed={count === 1 && query.usage === 'available'} onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'available' })}>Available copies</button><button aria-pressed={count === 1 && query.usage === 'unused'} onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'unused' })}>Not in decks</button>{state.saved && <button onClick={() => setQuery(state.saved!.query)}><Bookmark size={13} /> {state.saved.name}</button>}</div>
    <div className="collection-toolbar"><div className="toolbar-group"><button className="button ghost" onClick={openFilters}><SlidersHorizontal size={16} /> Filters {count > 0 && <span className="count-badge">{count}</span>}</button><button className="button ghost" onClick={() => setDialog('sort')}><ArrowUpDown size={16} /> Sort</button><button className="button ghost" onClick={openSets}>Sets{query.sets.length ? ` (${query.sets.length})` : ''}</button></div><div className="toolbar-group"><div className="segmented" aria-label="Collection layout"><button aria-label="Table view" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><List size={18} /></button><button aria-label="Gallery view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={18} /></button></div>
      <details className="collection-options" ref={options} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeOptions() } }}><summary>More options <ChevronDown size={15} /></summary><div className="collection-options-menu">
        <button className="button" onClick={() => { closeOptions(); setDialog('save') }}><Bookmark size={16} />Save filters</button>
        <button className="button" onClick={() => { download(); closeOptions() }} disabled={!filtered.length}><ArrowDownToLine size={16} />Export {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</button>
        <p className="small muted">Exports all matching entries, not just this page or selection.</p>
        <button className="button desktop-only" onClick={() => { closeOptions(); setDialog('columns') }}><Columns3 size={16} />Columns</button>
        <button className="button desktop-only" onClick={() => setCompact(!compact)} aria-pressed={compact}>Compact rows</button>
      </div></details>
    </div></div>
    {layout === 'grid' && <label className="check-label gallery-group-control"><input type="checkbox" checked={groupBySet} onChange={event => { setGroupBySet(event.target.checked); if (event.target.checked) void state.loadSets() }} />Group gallery by set</label>}
    {count > 0 && <div className="active-query"><span>Match ALL conditions{query.colors.length ? ` / identity ${query.excludeColors ? 'excludes' : 'matches'} ${query.colorMode.toUpperCase()} of ${query.colors.join(', ')}` : ''}</span>{query.multicolorOnly && <span className="chip">Multicolor only</span>}{query.monocolorOnly && <span className="chip">{query.colors.includes('C') ? 'Colorless only' : 'Single-color only'}</span>}{query.binder && <span className="chip">{query.binder}</span>}{query.finish && <span className="chip">{query.finish}</span>}{query.usage !== 'all' && <span className="chip">{query.usage}</span>}<button className="text-link" onClick={() => setQuery(EMPTY_QUERY)}>Clear filters <X size={14} /></button></div>}
    <div className="result-summary" role="status"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'entry' : 'entries'} <span className="separator">/</span> {summary.copies} {summary.copies === 1 ? 'copy' : 'copies'}</span></div>
    {(state.source === 'demo' || count > 0) && <EstimateSummary rows={filtered} />}
    <ImageResolution key={JSON.stringify([query, sorting, page, groupBySet, state.setsRevision])} rows={pageRows.map(row => row.original)} fixedScope />
    {exportMessage && <p className="notice" role="status">{exportMessage}</p>}
    {!filtered.length ? <EmptyState title="No matching cards"><p>Try a different search or clear your filters.</p><button className="button ghost" onClick={() => setQuery(EMPTY_QUERY)}>Clear filters</button></EmptyState> : <>
      {layout === 'grid' ? [...pageGroups].map(([code, rows]) => <section key={code || 'all'} className="gallery-group" aria-label={code ? `${setDirectory[code]?.name ?? code.toUpperCase()} cards` : 'Card gallery'}>
        {code && <h2 className="gallery-set-heading">{setDirectory[code]?.name ?? code.toUpperCase()} <span className="small muted">{code.toUpperCase()} · {rows.length} on this page{setDirectory[code]?.releasedAt ? ` · Released ${setDirectory[code].releasedAt}` : ''}</span></h2>}
        <div className="collection-grid">{rows.map(row => <CardTile key={row.id} holding={row} onOpen={() => { scroll.current = window.scrollY }} />)}</div>
      </section>) : <>
        <div className={`collection-table ${compact ? 'dense' : ''}`}><table aria-label="Filtered collection"><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}>{header.id === 'select' ? <input aria-label="Select this page" type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} /> : header.column.getCanSort() ? <button onClick={() => setSorting([{ id: header.column.id, desc: header.column.getIsSorted() !== 'desc' }])}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? <ArrowUp size={12} /> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={12} /> : null}</button> : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{pageRows.map(row => <tr key={row.id} data-selected={row.getIsSelected()}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>
        <div className="mobile-card-list">{pageRows.map(row => <Link className="mobile-card-row" key={row.id} to={`/cards/${row.id}`} onClick={() => { scroll.current = window.scrollY }}><div className="mini-art"><CardArt card={row.original.card} compact /></div><div><strong>{row.original.card.name}</strong><span>{row.original.set} #{row.original.collectorNumber} / {row.original.finish} / {row.original.language}</span><span>{row.original.binder} / {row.original.quantity} copies</span><PriceLine holding={row.original} /></div><ColorPips card={row.original.card} /></Link>)}</div>
      </>}
      <div className="collection-footer">{selectedCount > 0 && <div className="selection-summary small"><span>{selectedCount} selected of {filtered.length} matches</span><button className="text-link" onClick={() => table.toggleAllRowsSelected(true)}>Select all {filtered.length}</button><button className="text-link" onClick={() => table.resetRowSelection()}>Clear selection</button></div>}<div className="pagination"><span className="small muted">{table.getState().pagination.pageIndex * 8 + 1}-{Math.min((table.getState().pagination.pageIndex + 1) * 8, filtered.length)} of {filtered.length}</span><button className="icon-button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label="Previous page"><ChevronLeft size={18} /></button><button className="icon-button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label="Next page"><ChevronRight size={18} /></button></div></div>
    </>}
    <Modal open={dialog === 'sets'} onClose={() => setDialog(null)} title="Choose sets"><form onSubmit={event => { event.preventDefault(); setQuery(draft); setDialog(null) }}>
      <div className="modal-body">
        <label>Find a set<input type="search" value={setSearch} onChange={event => setSetSearch(event.target.value)} /></label>
        <label>Selected sets<select value={draft.excludeSets ? 'exclude' : 'include'} onChange={event => setDraft({ ...draft, excludeSets: event.target.value === 'exclude' })}><option value="include">Include any selected set</option><option value="exclude">Exclude selected sets</option></select></label>
        <div className="toolbar-group"><button type="button" className="text-link" onClick={() => setSorting([{ id: 'set', desc: false }, { id: 'collectorNumber', desc: false }])}>Sort set / collector</button><button type="button" className="text-link" onClick={() => setSorting([{ id: 'releaseDate', desc: true }, { id: 'set', desc: false }, { id: 'collectorNumber', desc: false }])}>Newest sets first</button></div>
        <p className="small muted">Set choices combine with your other filters. No selection means all sets.</p>
        {state.setsLoading && <p role="status">Loading set names and release dates...</p>}
        <div className="set-options">{setOptions.filter(option => `${option.name} ${option.code}`.toLowerCase().includes(setSearch.toLowerCase())).map(option => <label className="check-label" key={option.code}>
          <input type="checkbox" checked={draft.sets.includes(option.code)} onChange={event => setDraft({ ...draft, sets: event.target.checked ? [...draft.sets, option.code] : draft.sets.filter(code => code !== option.code) })} />
          <span>{option.name} <span className="small muted">({option.code.toUpperCase()}){option.releasedAt ? ` · ${option.releasedAt}` : ''}</span></span>
        </label>)}</div>
      </div>
      <div className="modal-footer"><button type="button" className="button ghost" onClick={() => setDraft({ ...draft, sets: [], excludeSets: false })}>Clear set choices</button><button type="submit" className="button primary">Apply sets</button></div>
    </form></Modal>
    <Modal open={dialog === 'filters'} onClose={() => setDialog(null)} title="Advanced filters"><form onSubmit={e => {
      e.preventDefault()
      if (!isQuery(draft)) { setFilterError('Check your ranges. Values must be nonnegative and the minimum cannot exceed the maximum.'); return }
      setQuery(draft); setDialog(null)
    }}><div className="modal-body"><p className="small muted">Match ALL conditions across the complete dataset. Color identity has its own ANY / ALL group.</p><div className="filter-grid"><label>Binder<select value={draft.binder} onChange={e => setDraft({ ...draft, binder: e.target.value })}><option value="">All binders</option>{binders.map(b => <option key={b}>{b}</option>)}</select></label><label>Finish<select value={draft.finish} onChange={e => setDraft({ ...draft, finish: e.target.value })}><option value="">All finishes</option>{['Nonfoil', 'Foil', 'Etched'].map(f => <option key={f}>{f}</option>)}</select></label><label>Deck usage<select value={draft.usage} onChange={e => setDraft({ ...draft, usage: e.target.value as Query['usage'] })}><option value="all">Any usage</option><option value="used">Used in a deck</option><option value="unused">Not used in a deck</option><option value="available">Unallocated copies available</option></select></label><label>Price coverage<select value={draft.pricing} onChange={e => setDraft({ ...draft, pricing: e.target.value as Query['pricing'] })}><option value="all">All prices</option><option value="priced">Priced only</option><option value="missing">Missing price</option></select></label><label>Minimum quantity<input type="number" min="0" step="1" value={draft.minQuantity} onChange={e => setDraft({ ...draft, minQuantity: Number(e.target.value) })} /></label><label>Maximum mana value<input type="number" min="0" step="1" value={draft.maxMana} onChange={e => setDraft({ ...draft, maxMana: e.target.value })} placeholder="No limit" /></label><label>Minimum total value (USD)<input type="number" min="0" step=".01" value={draft.minValue} onChange={e => setDraft({ ...draft, minValue: e.target.value })} placeholder="No minimum" /></label><label>Maximum total value (USD)<input type="number" min="0" step=".01" value={draft.maxValue} onChange={e => setDraft({ ...draft, maxValue: e.target.value })} placeholder="No maximum" /></label></div><fieldset><legend>Color identity group</legend><div className="identity-controls">{(Object.keys(COLOR_NAMES) as Color[]).map(color => <button type="button" className={`identity pip-${color}`} aria-label={COLOR_NAMES[color]} aria-pressed={draft.colors.includes(color)} onClick={() => setDraft({ ...draft, colors: draft.colors.includes(color) ? draft.colors.filter(c => c !== color) : [...draft.colors, color] })} key={color}>{color}</button>)}</div><label>Combine colors<select value={draft.colorMode} onChange={e => setDraft({ ...draft, colorMode: e.target.value as Query['colorMode'] })}><option value="any">ANY selected color (OR)</option><option value="all">ALL selected colors (AND)</option></select></label><label className="check-label"><input type="checkbox" checked={draft.excludeColors} onChange={e => setDraft({ ...draft, excludeColors: e.target.checked })} /> Exclude the matching color group</label></fieldset>{filterError && <p className="notice warning" role="alert">{filterError}</p>}</div><div className="modal-footer"><button type="button" className="button ghost" onClick={() => setDraft(EMPTY_QUERY)}>Clear</button><button className="button primary" type="submit">Apply / {holdings.filter(row => matchesQuery(row, draft, decks)).length} results</button></div></form></Modal>
    <Modal open={dialog === 'sort'} onClose={() => setDialog(null)} title="Sort priorities"><div className="modal-body"><p className="small muted">Applied to every matching holding. Changes apply immediately.</p>{sorting.map((sort, i) => <div className="sort-rule" key={i}><label>Priority {i + 1}<select value={sort.id} onChange={e => updateSort(i, { id: e.target.value })}>{SORTS.map(option => <option value={option.id} key={option.id} disabled={sorting.some((s, j) => j !== i && s.id === option.id)}>{option.name}</option>)}</select></label><label>Direction<select value={sort.desc ? 'desc' : 'asc'} onChange={e => updateSort(i, { desc: e.target.value === 'desc' })}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label><button className="icon-button" disabled={sorting.length === 1} aria-label={`Remove priority ${i + 1}`} onClick={() => setSorting(sorting.filter((_, j) => i !== j))}><X size={16} /></button></div>)}<button className="button ghost" disabled={sorting.length === SORTS.length} onClick={() => { const next = SORTS.find(option => !sorting.some(s => s.id === option.id)); if (next) setSorting([...sorting, { id: next.id, desc: false }]) }}>Add sort priority</button><p className="notice small">Holding ID ascending is the stable final tie-breaker. Missing prices stay last in both directions.</p></div><div className="modal-footer"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>
    <Modal open={dialog === 'save'} onClose={() => setDialog(null)} title="Save filters"><form onSubmit={e => { e.preventDefault(); if (state.save(saveName)) setDialog(null) }}><div className="modal-body"><label>Filter name<input value={saveName} onChange={e => setSaveName(e.target.value)} maxLength={60} required placeholder="e.g. Available Sultai cards" /></label><p className="small muted">Saved in this browser only. Replaces your previous filter set. Sorting and layout are not saved.</p></div><div className="modal-footer"><button type="submit" className="button primary"><Check size={16} />Save filters</button></div></form></Modal>
    <Modal open={dialog === 'columns'} onClose={() => setDialog(null)} title="Visible columns"><div className="modal-body">{table.getAllLeafColumns().filter(column => column.getCanHide() && column.id !== 'id').map(column => <label className="check-label" key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{String(column.columnDef.header)}</label>)}</div><div className="modal-footer"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>
  </>
}
