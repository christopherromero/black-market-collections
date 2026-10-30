import { useEffect } from 'react'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Landscape, PageTitle, Panel } from '../components'
import { EMPTY_QUERY, allocationConflicts, deckSummary, money } from '../domain'
import { decks, holdings } from '../fixtures'
import { useCollection } from '../state'

export default function Decks() {
  const { setQuery } = useCollection()
  const { hash } = useLocation()
  const conflicts = allocationConflicts(decks, holdings)
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [hash])
  return <>
    <PageTitle eyebrow="COMMANDER / DEMO DECK WORKSPACE" title="Make the connections."><Link className="button ghost" to="/collection" onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'available' })}><BookOpen size={16} />Find available copies</Link></PageTitle>
    <div className="notice"><div><strong>Build individually. Allocate together.</strong><p className="small muted">These are partial synthetic deck fixtures, not complete 100-card Commander lists. Match mode: any equivalent printing / all listed entries. Real Archidekt imports and source URLs come in a later milestone.</p></div></div>
    <div className="deck-workspace">{decks.map(deck => {
      const stats = deckSummary(deck, holdings)
      return <section className="deck-workspace-card" id={deck.id} key={deck.id}><div className="deck-workspace-art"><Landscape variant={deck.art} /><div><p className="eyebrow gold">COMMANDER / SYNTHETIC VERSION 1</p><h2>{deck.name}</h2><p>{deck.theme}</p></div></div><div className="deck-workspace-body"><div className="deck-stats"><div><strong>{stats.owned}/{stats.requested}</strong><span>copies owned</span></div><div><strong>{stats.missing}</strong><span>missing copies</span></div><div><strong>{stats.reserved}</strong><span>physically reserved</span></div><div><strong>{money(stats.missingCost)}</strong><span>priced completion estimate</span></div></div><p className="small muted">{stats.unpricedMissing ? `${stats.unpricedMissing} missing copies have no price and are excluded from that estimate.` : 'All missing copies have a synthetic price estimate.'} Exact printing and real provider refresh are not implemented yet.</p><details className="deck-entries"><summary>Inspect {deck.entries.length} fixture entries</summary><ul>{deck.entries.map(entry => {
        const first = holdings.find(row => row.card.id === entry.cardId)!
        const owned = holdings.filter(row => row.card.id === entry.cardId).reduce((sum, row) => sum + row.quantity, 0)
        return <li key={entry.cardId}><Link className="text-link" to={`/cards/${first.id}`}>{first.card.name}</Link><span>{entry.quantity} requested / {owned} owned</span></li>
      })}</ul></details></div></section>
    })}</div>
    <Panel title="Shared-card pressure" note="All listed decks assembled simultaneously / equivalent copies"><p className="muted">The following shortages compare combined demand with physical copies owned, not with per-deck availability.</p>{conflicts.length ? <ul className="conflicts">{conflicts.map(conflict => <li key={conflict.cardId}><div><strong>{conflict.name}</strong><span className="small muted">{conflict.requested} requested / {conflict.owned} owned</span></div><span className="badge warning">{conflict.shortage} short</span></li>)}</ul> : <p className="positive">No shared-copy shortages in these demo fixtures.</p>}<Link className="text-link" to="/collection" onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'used' })}>Inspect cards used in decks <ArrowRight size={15} /></Link></Panel>
  </>
}
