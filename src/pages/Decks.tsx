import { useEffect } from 'react'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { EmptyState, PageTitle, Panel } from '../components'
import { EMPTY_QUERY, allocationConflicts, deckSummary, money } from '../domain'
import { useCollection } from '../state'

export default function Decks() {
  const { setQuery, source, decks, holdings } = useCollection()
  const { hash } = useLocation()
  const conflicts = allocationConflicts(decks, holdings)
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [hash])
  if (source !== 'demo') return <><PageTitle title="Commander decks" /><EmptyState title={source === 'empty' ? 'No decks loaded' : 'No decks imported'}><p>{source === 'empty' ? 'Import your holdings to get started. Deck import is not available.' : 'The Moxfield export contains holdings, not deck lists or allocations. Sample decks are not mixed with your collection.'}</p><Link className="text-link" to={source === 'empty' ? '/import' : '/collection'}>{source === 'empty' ? 'Import collection' : 'Browse your collection'}</Link></EmptyState></>
  return <>
    <PageTitle title="Commander decks"><Link className="button ghost" to="/collection" onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'available' })}><BookOpen size={16} />Find available copies</Link></PageTitle>
    <p className="page-description">Partial sample lists. Any printing counts toward ownership. Estimates are in USD.</p>
    <div className="deck-workspace">{decks.map(deck => {
      const stats = deckSummary(deck, holdings)
      const hasPricedMissing = stats.missing > stats.unpricedMissing
      const estimate = stats.missing === 0 ? 'No missing copies' : hasPricedMissing ? money(stats.missingCost) : 'Estimate unavailable'
      return <section className="deck-workspace-card" id={deck.id} key={deck.id}><div className="deck-workspace-heading"><h2>{deck.name}</h2><p className="small muted">{deck.theme}</p></div><div className="deck-workspace-body">
        <div className="deck-stats"><div><strong>{stats.owned}/{stats.requested}</strong><span>copies owned</span></div><div><strong>{stats.missing}</strong><span>missing copies</span></div><div><strong>{stats.reserved}</strong><span>copies reserved</span></div><div><strong className={hasPricedMissing ? undefined : 'estimate-status'}>{estimate}</strong><span>{hasPricedMissing && stats.unpricedMissing > 0 ? 'Estimated cost of priced missing cards' : 'Estimated cost of missing cards'}</span></div></div>
        {stats.unpricedMissing > 0 && <p className="small muted">{stats.unpricedMissing} missing {stats.unpricedMissing === 1 ? 'copy has' : 'copies have'} no price{hasPricedMissing ? ` and ${stats.unpricedMissing === 1 ? 'is' : 'are'} excluded from this estimate` : ''}.</p>}
        <details className="deck-entries"><summary>View {deck.entries.length} cards</summary><ul>{deck.entries.map(entry => {
        const first = holdings.find(row => row.card.id === entry.cardId)!
        const owned = holdings.filter(row => row.card.id === entry.cardId).reduce((sum, row) => sum + row.quantity, 0)
        return <li key={entry.cardId}><Link className="text-link" to={`/cards/${first.id}`}>{first.card.name}</Link><span>{entry.quantity} requested / {owned} owned</span></li>
      })}</ul></details></div></section>
    })}</div>
    <Panel title="Cards needed to build all decks" note="Extra copies needed to keep every listed deck assembled."><p className="muted">Owning enough copies for one deck does not mean you can build all decks at once.</p>{conflicts.length ? <ul className="conflicts">{conflicts.map(conflict => <li key={conflict.cardId}><div><strong>{conflict.name}</strong><span className="small muted">{conflict.requested} requested / {conflict.owned} owned</span></div><span className="badge warning">{conflict.shortage} short</span></li>)}</ul> : <p className="positive">You have enough copies to build all listed decks at once.</p>}<Link className="text-link" to="/collection" onClick={() => setQuery({ ...EMPTY_QUERY, usage: 'used' })}>View cards used in decks <ArrowRight size={15} /></Link></Panel>
  </>
}
