import type { Holding } from './domain'
import { printingKey } from './scryfall'
import { useCollection } from './state'
import { useEffect, useState } from 'react'

export function ImageResolution({ rows, fixedScope = false }: { rows: Holding[]; fixedScope?: boolean }) {
  const state = useCollection()
  const currentIds = JSON.stringify(rows.map(row => row.id).sort())
  // Price/metadata filters can remove resolved rows. Do not chase those changes
  // into an accidental whole-collection scan; navigation mounts a new scope.
  const [scopeIds, setScopeIds] = useState(currentIds)
  const ids = fixedScope ? scopeIds : currentIds
  const { watchImages } = state
  useEffect(() => watchImages(JSON.parse(ids) as string[]), [watchImages, ids])
  if (state.source !== 'moxfield') return null
  const failed = [...new Map(rows.map(row => [printingKey(row), row])).values()].filter(row => state.resolutionErrors[printingKey(row)] || row.card.catalog?.pricing.error)
  return <section className="image-resolution" aria-label="External card images">
    <div className="image-refresh-row">
    {state.resolutionMessage ? <p role="status" className="small">{state.resolutionMessage}</p> : <p className="small muted">Card data and prices load automatically.</p>}
    <div className="toolbar-group">
      {(state.resolutionPaused || failed.length > 0) && <button className="button ghost" disabled={state.resolving || state.fullRefresh.running || !rows.length} onClick={() => { setScopeIds(currentIds); state.resumeImages(rows) }}>Retry / resume visible images</button>}
      <button className="button ghost" disabled={state.resolving || state.fullRefresh.running || !rows.length} onClick={() => { setScopeIds(currentIds); state.resumeImages(rows, true) }}>Refresh visible estimates</button>
    </div>
    </div>
    {state.resolutionPaused && <p className="small">Loading for these cards is paused. Retry / resume to continue. Completed images remain available.</p>}
    {failed.length > 0 && <ul className="small" role="status">{failed.map(row => <li key={row.id}>{row.set} #{row.collectorNumber} / {row.language}: {state.resolutionErrors[printingKey(row)] ?? row.card.catalog?.pricing.error}</li>)}</ul>}
  </section>
}
