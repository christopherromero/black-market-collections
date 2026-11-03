import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Finish, Holding } from './domain'
import { money } from './domain'
import type { QuoteObservation } from './quote-store'
import { useCollection } from './state'
import { capturedPriceChange } from './price-history'

const Trend = lazy(() => import('./Chart'))

const NO_OBSERVATIONS: QuoteObservation[] = []

export default function PriceHistory({ holding }: { holding: Holding }) {
  const { loadPriceHistory, historyRevision } = useCollection()
  const [loaded, setLoaded] = useState<{ key: string; observations: QuoteObservation[]; error: string | null; asOf: number } | null>(null)
  const [finish, setFinish] = useState<Finish>(holding.finish)
  const [days, setDays] = useState('30')
  const { set, collectorNumber, language } = holding
  const requestKey = JSON.stringify([set, collectorNumber, language, historyRevision])
  useEffect(() => {
    let active = true
    void loadPriceHistory({ set, collectorNumber, language }).then(history => {
      if (active) setLoaded({ key: requestKey, observations: history, error: null, asOf: Date.now() })
    }).catch(() => {
      if (active) setLoaded({ key: requestKey, observations: [], error: 'Recorded price history could not be read. Check browser storage permissions; current reference prices are still shown.', asOf: Date.now() })
    })
    return () => { active = false }
  }, [set, collectorNumber, language, loadPriceHistory, requestKey])
  const loading = loaded?.key !== requestKey
  const observations = loaded?.observations ?? NO_OBSERVATIONS
  const asOf = loaded?.asOf ?? 0
  const shown = useMemo(() => observations.filter(observation => days === 'all' || Date.parse(observation.retrievedAt) >= asOf - Number(days) * 86400000), [observations, days, asOf])
  const points = useMemo(() => shown.map(observation => ({ date: observation.retrievedAt, cents: observation.cents[finish] })), [shown, finish])
  const change = capturedPriceChange(shown, finish)
  return <section aria-label="Captured price history">
    <div className="history-controls">
      <label>History finish<select value={finish} onChange={event => setFinish(event.target.value as Finish)}>{(['Nonfoil', 'Foil', 'Etched'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>History window<select value={days} onChange={event => setDays(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All captured quotes</option></select></label>
    </div>
    {loading ? <p role="status">Loading recorded quotes...</p> : loaded?.error ? <p className="notice warning" role="alert">{loaded.error}</p> : <>
      <p className="small muted">{shown.length} captured observations for this exact printing. History begins with retrieved quotes; earlier prices are not invented.</p>
      {change ? <p className="price-change">Captured change: {change.cents > 0 ? '+' : ''}{money(change.cents)}{change.percent === null ? ' · percentage unavailable from a zero starting price' : ` (${change.percent > 0 ? '+' : ''}${change.percent.toFixed(1)}%)`}</p>
        : <p className="small muted">Change unavailable until two comparable priced observations exist in this window.</p>}
      {points.length ? <Suspense fallback={<p role="status">Loading history chart...</p>}><Trend points={points} label={`${holding.card.name}, ${holding.set} #${holding.collectorNumber}, ${holding.language}, ${finish}: captured USD reference estimates`} /></Suspense>
        : <p>No captured history in this window. Refresh estimates to start recording.</p>}
    </>}
    <p className="small muted">Retrieval times are not market observation times. This history reflects reference quotes, not purchases, sales, or changes in the number of copies you own.</p>
  </section>
}
