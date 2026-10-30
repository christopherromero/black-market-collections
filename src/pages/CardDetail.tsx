import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { CardArt, ColorPips, EmptyState, PageTitle, Panel } from '../components'
import { allocated, money, summarize } from '../domain'
import { decks, holdings, priceObservations } from '../fixtures'

const Trend = lazy(() => import('../Chart'))

export default function CardDetail() {
  const { holdingId } = useParams()
  const selected = holdings.find(row => row.id === holdingId)
  if (!selected) return <EmptyState title="This printing is not in the demo vault."><p>No card was substituted for the missing identifier.</p><Link className="button ghost" to="/collection">Back to collection</Link></EmptyState>
  return <Detail key={selected.id} holdingId={selected.id} />
}

function Detail({ holdingId }: { holdingId: string }) {
  const selected = holdings.find(row => row.id === holdingId)!
  const [tab, setTab] = useState('holdings')
  const [finishId, setFinishId] = useState(selected.id)
  const [back, setBack] = useState(false)
  const copies = holdings.filter(row => row.card.id === selected.card.id)
  const priceHolding = copies.find(row => row.id === finishId)!
  const relatedDecks = decks.filter(deck => deck.entries.some(entry => entry.cardId === selected.card.id))
  const summary = summarize(copies)
  const points = useMemo(() => priceObservations(holdings.find(row => row.id === finishId)!), [finishId])
  const totalAllocated = copies.reduce((sum, row) => sum + allocated(row), 0)
  const requested = relatedDecks.reduce((sum, deck) => sum + (deck.entries.find(entry => entry.cardId === selected.card.id)?.quantity ?? 0), 0)
  const tabs = [{ id: 'holdings', label: 'Holdings' }, { id: 'decks', label: 'Deck usage' }, { id: 'prices', label: 'Price history' }, { id: 'rules', label: 'Card info' }]
  return <>
    <Link to="/collection" className="text-link back-link"><ArrowLeft size={15} />Back to collection / view retained</Link>
    <PageTitle eyebrow={`${selected.set} / #${selected.collectorNumber} / SYNTHETIC PRINTING`} title={selected.card.name}><ColorPips card={selected.card} /></PageTitle>
    <div className="detail-layout"><aside className="detail-image"><CardArt card={selected.card} back={back} />{selected.card.reverseName && <button className="button ghost" onClick={() => setBack(!back)}><RotateCw size={15} />Show {back ? 'front' : 'back'} face</button>}<p className="art-credit">Original, full synthetic card illustration. No official card art or rules are reproduced.</p><div className="notice small"><ShieldCheck size={16} />Fictional demo card / not legal for play</div></aside>
      <div className="detail-content"><div className="detail-summary"><p className="eyebrow gold">IN YOUR DEMO VAULT</p><div className="spread"><strong>{summary.copies} copies<span className="small muted"> across {summary.binders} binders</span></strong><strong className="positive">{money(summary.valueCents)}</strong></div><p className="small muted">{summary.pricedCopies}/{summary.copies} copies priced / combined estimate, finishes itemized below</p><div className="detail-facts"><span>{selected.card.type}</span><span>Mana value {selected.card.manaValue}</span><span>{selected.card.rarity}</span></div></div>
        <div className="detail-tabs" role="tablist" aria-label="Card sections">{tabs.map((item, index) => <button role="tab" id={`tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={e => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus()
        }}>{item.label}</button>)}</div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'holdings' && <Panel title="Holdings & locations" note="Exact printing, finish, language, and condition stay separate."><div className="holding-list">{copies.map(row => <article key={row.id} className="holding-row"><div className="spread"><h3>{row.binder}</h3><span className="badge">{row.quantity} copies</span></div><p className="muted small">{row.set} #{row.collectorNumber} / {row.finish} / {row.condition} / {row.language}</p><p className="small"><span className="positive">{allocated(row)} allocated / {row.quantity - allocated(row)} available</span></p><p className="small">{money(row.priceCents)} per copy / <strong>{money(row.priceCents === null ? null : row.priceCents * row.quantity)}</strong> total</p></article>)}</div><p className="notice small">{totalAllocated} allocated + {summary.copies - totalAllocated} available = {summary.copies} owned copies. Prices are synthetic USD estimates, not condition- or language-adjusted.</p></Panel>}
          {tab === 'decks' && <Panel title="Where this card connects" note="Equivalent-printing match / all fixture entries">{relatedDecks.length ? relatedDecks.map(deck => {
            const demand = deck.entries.find(entry => entry.cardId === selected.card.id)!.quantity
            const reserved = copies.flatMap(row => row.allocations).filter(a => a.deckId === deck.id).reduce((sum, a) => sum + a.quantity, 0)
            return <article className="holding-row" key={deck.id}><h3>{deck.name}</h3><p className="small muted">Requests {demand} / allocated {reserved} / owned shortfall {Math.max(0, demand - summary.copies)}</p><Link to={`/decks#${deck.id}`} className="text-link">Inspect demo deck <ArrowRight size={14} /></Link></article>
          }) : <p className="muted">Not used by any imported demo deck.</p>}<div className={`notice ${requested > summary.copies ? 'warning' : ''}`}><div><strong>{Math.max(0, requested - summary.copies)}-copy simultaneous-build shortfall</strong><p className="small">Decks request {requested} equivalent copies; {summary.copies} are owned. Building each deck individually is not the same as keeping them all assembled. Existing reservations are not double-counted.</p></div></div></Panel>}
          {tab === 'prices' && <Panel title="A finish-specific view" note="Synthetic observations / USD per copy"><label>Printing & finish<select value={finishId} onChange={e => setFinishId(e.target.value)}>{copies.map(row => <option value={row.id} key={row.id}>{row.set} #{row.collectorNumber} / {row.finish} / {row.language}</option>)}</select></label><div className="price-readout">{money(priceHolding.priceCents)}<span className="small muted"> per copy / {priceHolding.finish}</span></div>{priceHolding.priceCents === null ? <div className="notice warning">No price available for this printing and finish. It is not $0 and is excluded from priced value.</div> : <Suspense fallback={<p role="status">Loading price history...</p>}><Trend points={points} label={`${selected.card.name}: ${priceHolding.set} ${priceHolding.collectorNumber}, ${priceHolding.finish}, synthetic USD per-copy observations`} /></Suspense>}<p className="small muted">Source: synthetic fixture, not a live Scryfall quote. Last observation: Oct 29, 2026, 06:00 UTC. Missing observations are shown as gaps. 30/90-day change unavailable: insufficient history.</p></Panel>}
          {tab === 'rules' && <Panel title="Card information" note="Original fictional metadata"><h3>{back ? selected.card.reverseName : selected.card.name}</h3><p>{selected.card.rules}</p><dl className="metadata"><dt>Color identity</dt><dd>{selected.card.colors.join(' / ')}</dd><dt>Legality</dt><dd>Not applicable - fictional fixture</dd><dt>Printing</dt><dd>{selected.set} #{selected.collectorNumber}</dd><dt>Provenance</dt><dd>Bundled synthetic fixture / no import performed</dd><dt>External source links</dt><dd>Not available for fictional cards. No fabricated provider links.</dd></dl></Panel>}
        </div>
      </div>
    </div>
  </>
}
