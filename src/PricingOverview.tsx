import { money, summarize } from './domain'
import { needsCatalogRefresh, printingKey } from './scryfall'
import { useCollection } from './state'

export default function PricingOverview() {
  const state = useCollection()
  if (state.source !== 'moxfield') return null
  const summary = summarize(state.holdings)
  const staleCopies = state.holdings.filter(row => row.priceCents !== null && needsCatalogRefresh(row.card.catalog)).reduce((sum, row) => sum + row.quantity, 0)
  const latest = state.holdings.map(row => row.card.catalog?.pricing.retrievedAt).filter((time): time is string => Boolean(time)).sort().at(-1)
  const errors = Object.entries(state.fullRefreshErrors)
  return <section className="pricing-overview" aria-label="Collection pricing">
    <div className="pricing-overview-heading">
      <h2>Collection estimate <strong>{money(summary.valueCents)}</strong></h2>
      {state.fullRefresh.running
        ? <button className="button ghost" onClick={state.stopFullRefresh}>Stop full-price refresh</button>
        : <button className="button ghost" onClick={() => void state.refreshAllPrices()}>Update all prices</button>}
    </div>
    <p className="small muted">{summary.pricedCopies} of {summary.copies} copies priced · {summary.unpricedCopies} unpriced copies excluded{staleCopies > 0 && <span className="badge warning"> · {staleCopies} stale</span>}</p>
    <details className="pricing-explanation"><summary>Coverage and history</summary>
      <p className="small">{staleCopies} priced copies have stale estimates. USD reference values, not sale offers.</p>
      <p className="small">Update all prices checks every printing, not just this page or the current filters. Missing prices never count as zero. {latest ? `Latest retrieved quote: ${new Date(latest).toLocaleString()}.` : 'No quotes retrieved yet.'}</p>
      <p className="small">Price history is saved in this browser from actual retrieved quotes. It is not historical trading data or a cloud backup. Compare finishes and recorded changes on each card's details page.</p>
    </details>
    {state.fullRefresh.running && <progress aria-label="Collection price refresh progress" max={Math.max(1, state.fullRefresh.total)} value={state.fullRefresh.completed} />}
    {state.fullRefreshMessage && <p className="small" role="status">{state.fullRefreshMessage}</p>}
    {errors.length > 0 && <details className="pricing-errors"><summary>{errors.length} unresolved printings</summary><ul className="small">{errors.slice(0, 30).map(([key, error]) => {
      const row = state.holdings.find(holding => printingKey(holding) === key)
      return <li key={key}>{row ? `${row.set.toUpperCase()} #${row.collectorNumber} / ${row.language}` : 'Printing'}: {error}</li>
    })}</ul>{errors.length > 30 && <p className="small">Showing the first 30. All unresolved holdings remain in your collection.</p>}</details>}
    {state.priceStoreError && <p className="notice warning small" role="status">{state.priceStoreError}</p>}
  </section>
}
