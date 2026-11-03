import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ColorPips, EmptyState, EstimateSummary, PageTitle, Panel, PriceComparison, PriceLine, QuoteNote } from '../components'
import { allocated, money, summarize } from '../domain'
import { priceObservations } from '../fixtures'
import { useCollection } from '../state'
import { ImageResolution } from '../ImageResolution'
import type { Holding } from '../domain'
import PriceHistory from '../PriceHistory'

const Trend = lazy(() => import('../Chart'))

export default function CardDetail() {
  const { holdings, source } = useCollection()
  const { holdingId } = useParams()
  const selected = holdings.find(row => row.id === holdingId)
  if (!selected) return <EmptyState title="Card not found"><p>{source === 'empty' ? 'No collection is loaded. Import a Moxfield export to browse your cards.' : 'This printing is not in the active collection.'}</p>{source === 'empty' && <Link className="button primary" to="/import">Import collection</Link>}<Link className="button ghost" to="/collection">Back to collection</Link></EmptyState>
  if (source === 'moxfield') return <ImportedDetail key={selected.id} selected={selected} />
  return <Detail key={selected.id} holdingId={selected.id} />
}

function Detail({ holdingId }: { holdingId: string }) {
  const { holdings, decks } = useCollection()
  const selected = holdings.find(row => row.id === holdingId)!
  const [tab, setTab] = useState('holdings')
  const [finishId, setFinishId] = useState(selected.id)
  const copies = holdings.filter(row => row.card.id === selected.card.id)
  const priceHolding = copies.find(row => row.id === finishId)!
  const relatedDecks = decks.filter(deck => deck.entries.some(entry => entry.cardId === selected.card.id))
  const summary = summarize(copies)
  const points = useMemo(() => priceObservations(holdings.find(row => row.id === finishId)!), [finishId, holdings])
  const totalAllocated = copies.reduce((sum, row) => sum + allocated(row), 0)
  const requested = relatedDecks.reduce((sum, deck) => sum + (deck.entries.find(entry => entry.cardId === selected.card.id)?.quantity ?? 0), 0)
  const tabs = [{ id: 'holdings', label: 'Holdings' }, { id: 'decks', label: 'Deck usage' }, { id: 'prices', label: 'Price history' }, { id: 'rules', label: 'Card info' }]
  return <>
    <Link to="/collection" className="text-link back-link"><ArrowLeft size={15} />Back to collection</Link>
    <PageTitle eyebrow={`${selected.set} / #${selected.collectorNumber}`} title={selected.card.name}><ColorPips card={selected.card} /></PageTitle>
    <div className="detail-layout">
      <div className="detail-content"><div className="detail-summary"><p className="eyebrow">YOUR COPIES</p><div className="spread"><strong>{summary.copies} copies<span className="small muted"> across {summary.binders} binders</span></strong><strong>{money(summary.pricedCopies > 0 ? summary.valueCents : null)}</strong></div><p className="small muted">{summary.pricedCopies} of {summary.copies} copies priced. Estimated total in USD; finishes listed below.</p><div className="detail-facts"><span>{selected.card.type}</span><span>Mana value {selected.card.manaValue}</span><span>{selected.card.rarity}</span></div></div>
        <div className="detail-tabs" role="tablist" aria-label="Card sections">{tabs.map((item, index) => <button role="tab" id={`tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={e => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus()
        }}>{item.label}</button>)}</div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'holdings' && <Panel title="Holdings & locations" note="Exact printing, finish, language, and condition stay separate."><div className="holding-list">{copies.map(row => <article key={row.id} className="holding-row"><div className="spread"><h3>{row.binder}</h3><span className="badge">{row.quantity} copies</span></div><p className="muted small">{row.set} #{row.collectorNumber} / {row.finish} / {row.condition} / {row.language}</p><p className="small"><span className="positive">{allocated(row)} allocated / {row.quantity - allocated(row)} available</span></p><p className="small">{money(row.priceCents)} per copy / <strong>{money(row.priceCents === null ? null : row.priceCents * row.quantity)}</strong> total</p></article>)}</div><p className="notice small">{totalAllocated} allocated + {summary.copies - totalAllocated} available = {summary.copies} owned copies. Prices are synthetic USD estimates, not condition- or language-adjusted.</p></Panel>}
          {tab === 'decks' && <Panel title="Decks using this card" note="Any printing counts toward ownership.">{relatedDecks.length ? relatedDecks.map(deck => {
            const demand = deck.entries.find(entry => entry.cardId === selected.card.id)!.quantity
            const reserved = copies.flatMap(row => row.allocations).filter(a => a.deckId === deck.id).reduce((sum, a) => sum + a.quantity, 0)
            return <article className="holding-row" key={deck.id}><h3>{deck.name}</h3><p className="small muted">Requests {demand} / allocated {reserved} / owned shortfall {Math.max(0, demand - summary.copies)}</p><Link to={`/decks#${deck.id}`} className="text-link">View deck <ArrowRight size={14} /></Link></article>
          }) : <p className="muted">Not used in any sample deck.</p>}<div className={`notice ${requested > summary.copies ? 'warning' : ''}`}><div><strong>{Math.max(0, requested - summary.copies)}-copy simultaneous-build shortfall</strong><p className="small">Decks request {requested} equivalent copies; {summary.copies} are owned. Building each deck individually is not the same as keeping them all assembled. Existing reservations are not double-counted.</p></div></div></Panel>}
          {tab === 'prices' && <Panel title="A finish-specific view" note="Synthetic observations / USD per copy"><label>Printing & finish<select value={finishId} onChange={e => setFinishId(e.target.value)}>{copies.map(row => <option value={row.id} key={row.id}>{row.set} #{row.collectorNumber} / {row.finish} / {row.language}</option>)}</select></label><div className="price-readout">{money(priceHolding.priceCents)}<span className="small muted"> per copy / {priceHolding.finish}</span></div>{priceHolding.priceCents === null ? <div className="notice warning">No price available for this printing and finish. It is not $0 and is excluded from priced value.</div> : <Suspense fallback={<p role="status">Loading price history...</p>}><Trend points={points} label={`${selected.card.name}: ${priceHolding.set} ${priceHolding.collectorNumber}, ${priceHolding.finish}, synthetic USD per-copy observations`} /></Suspense>}<p className="small muted">Demo prices, not live quotes. Last observation: Oct 29, 2026, 06:00 UTC. Gaps mark missing observations. 30/90-day change unavailable: insufficient history.</p></Panel>}
          {tab === 'rules' && <Panel title="Card information" note="Original fictional metadata"><h3>{selected.card.name}{selected.card.reverseName && ` // ${selected.card.reverseName}`}</h3><p>{selected.card.rules}</p><dl className="metadata"><dt>Color identity</dt><dd>{selected.card.colors.join(' / ')}</dd><dt>Legality</dt><dd>Not applicable - fictional fixture</dd><dt>Printing</dt><dd>{selected.set} #{selected.collectorNumber}</dd><dt>Provenance</dt><dd>Bundled synthetic fixture / no import performed</dd><dt>External source links</dt><dd>Not available for fictional cards. No fabricated provider links.</dd></dl></Panel>}
        </div>
      </div>
    </div>
  </>
}

function ImportedDetail({ selected }: { selected: Holding }) {
  const { holdings } = useCollection()
  const [tab, setTab] = useState('holdings')
  const copies = holdings.filter(row => row.card.id === selected.card.id)
  const summary = summarize(copies)
  const catalog = selected.card.catalog
  const tabs = [{ id: 'holdings', label: 'Holdings' }, { id: 'decks', label: 'Deck usage' }, { id: 'prices', label: 'Price history' }, { id: 'rules', label: 'Card info' }]
  return <>
    <Link to="/collection" className="text-link back-link"><ArrowLeft size={15} />Back to collection</Link>
    <PageTitle eyebrow={`${selected.set} / #${selected.collectorNumber} / ${selected.language}`} title={selected.card.name}><ColorPips card={selected.card} /></PageTitle>
    <ImageResolution rows={[selected]} />
    <div className="detail-layout">
      <div className="detail-content">
        <div className="detail-summary"><p className="eyebrow">YOUR IMPORTED COPIES</p><strong>{summary.copies} copies / {copies.length} entries with this name</strong><EstimateSummary rows={copies} /><PriceLine holding={selected} /><QuoteNote holding={selected} /><p className="muted small">Acquisition costs are not market prices. Locations are unassigned; no deck allocations were imported.</p>
          <div className="detail-facts"><span>{selected.card.type || 'Type unknown'}</span><span>Mana value {selected.card.manaValue ?? 'unknown'}</span><span>{selected.card.rarity ?? 'Rarity unknown'}</span></div>
        </div>
        <PriceComparison holding={selected} />
        <div className="detail-tabs" role="tablist" aria-label="Card sections">{tabs.map((item, index) => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus()
        }}>{item.label}</button>)}</div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'holdings' && <Panel title="Imported holdings" note="Rows sharing the exact imported name; no inferred oracle identity or merged printings.">
            {copies.map(row => <article className="holding-row" key={row.id}><h3>{row.set} #{row.collectorNumber} · {row.quantity} copies</h3><p>{row.finish} / {row.condition} / {row.language}</p>
              <PriceLine holding={row} /><QuoteNote holding={row} />
              <dl className="metadata"><dt>Location</dt><dd>{row.binder}</dd><dt>Tags (raw)</dt><dd>{row.moxfield?.tags || 'None'}</dd>
                <dt>Tradelist copies</dt><dd>{row.moxfield?.tradelistCount}</dd><dt>Alter flag</dt><dd>{row.moxfield?.alter}</dd><dt>Proxy flag</dt><dd>{row.moxfield?.proxy}</dd>
                <dt>Foil field (raw)</dt><dd>{row.moxfield?.foil || '(blank = nonfoil)'}</dd>
                <dt>Acquisition cost (raw)</dt><dd>{row.moxfield?.purchasePrice || 'Not supplied'} — currency and per-copy/total basis unspecified</dd>
                <dt>Last modified (raw)</dt><dd>{row.moxfield?.lastModified || 'Not supplied'}</dd><dt>Provenance</dt><dd>Local Moxfield export, row {row.moxfield?.row}</dd>
              </dl>{row.id !== selected.id && <Link className="text-link" to={`/cards/${row.id}`}>Inspect this exact printing</Link>}</article>)}
          </Panel>}
          {tab === 'decks' && <Panel title="No deck allocations imported"><p>This collection export contains holdings, not deck lists. No sample decks are associated with your collection.</p></Panel>}
          {tab === 'prices' && <Panel title="Captured price history"><PriceHistory holding={selected} /></Panel>}
          {tab === 'rules' && <Panel title="Card information" note={catalog ? 'Public metadata from Scryfall; rules are Oracle text, not necessarily localized.' : 'Metadata unresolved — no values inferred from the name.'}>
            {catalog && <><p className="small"><a href={catalog.sourceUrl} target="_blank" rel="noreferrer">Exact printing on Scryfall</a></p><p className="art-credit">{catalog.faces.map(face => `${face.name}: ${face.artist ?? 'artist unavailable'}`).join(' · ')} · Art © Wizards of the Coast</p></>}
            <p>{selected.card.rules || 'Rules unknown'}</p><dl className="metadata"><dt>Color identity</dt><dd>{selected.card.colors.join(' / ') || 'Unknown'}</dd><dt>Legality</dt><dd>Not tracked; check the provider</dd><dt>Printing</dt><dd>{selected.set} #{selected.collectorNumber} / {selected.language}</dd><dt>Provenance</dt><dd>Holdings: local Moxfield export. Metadata: {catalog ? 'Scryfall exact-printing response' : 'unresolved'}.</dd></dl>
          </Panel>}
        </div>
      </div>
    </div>
  </>
}
