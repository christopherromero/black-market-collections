import { lazy, Suspense, useMemo } from 'react'
import { ArrowDownToLine, ArrowRight, BookOpen, CircleDollarSign, Layers3, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CardTile, Landscape, PageTitle, Panel, TextLink } from '../components'
import { COLOR_NAMES, EMPTY_QUERY, composition, deckSummary, money, summarize } from '../domain'
import type { Color } from '../domain'
import { decks, holdings } from '../fixtures'
import { useCollection } from '../state'

const Trend = lazy(() => import('../Chart'))

export default function Dashboard() {
  const { setQuery } = useCollection()
  const summary = summarize(holdings)
  const colors = composition(holdings)
  const highest = [...holdings].filter(row => row.priceCents !== null).sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0)).slice(0, 4)
  const points = useMemo(() => Array.from({ length: 14 }, (_, day) => ({
    date: `Oct ${day + 16}`, cents: day === 7 || day === 8 ? null :
      Math.round(summary.valueCents * (0.95 + 0.05 * day / 13)),
  })), [summary.valueCents])

  function drillColor(name: string) {
    const color = (Object.entries(COLOR_NAMES) as [Color, string][]).find(([, label]) => label === name)?.[0]
    setQuery({ ...EMPTY_QUERY, colors: color ? [color] : [], multicolorOnly: name === 'Multicolor', monocolorOnly: name !== 'Multicolor' })
  }
  return <>
    <PageTitle eyebrow="THE DEMO VAULT / OVERVIEW" title="A little collection intelligence."><Link className="button ghost" to="/collection"><Layers3 size={16} /> Explore collection</Link></PageTitle>
    <section className="overview-hero"><Landscape variant={2} /><div className="overview-hero-copy"><span className="eyebrow gold">YOUR NEXT COMMANDER STORY</span><h2>Every card has<br />a next move.</h2><p>The missing piece might not be missing.<br />Find the connections in what you own.</p><Link className="text-link" to="/decks">Explore your demo decks <ArrowRight size={15} /></Link></div><div className="hero-stamp"><span>U</span><span>B</span><span>G</span></div></section>
    <section className="stats" aria-label="Collection summary">
      {[
        { label: 'Total copies', value: summary.copies.toLocaleString(), detail: `${summary.printings} printings / ${summary.binders} binders`, icon: Layers3, to: '/collection', query: EMPTY_QUERY },
        { label: 'Distinct cards', value: summary.identities.toLocaleString(), detail: 'Rules identities, not printing rows', icon: BookOpen, to: '/collection', query: EMPTY_QUERY },
        { label: 'Estimated value', value: money(summary.valueCents), detail: 'USD / priced copies only', icon: CircleDollarSign, to: '/collection', query: { ...EMPTY_QUERY, pricing: 'priced' as const } },
        { label: 'Valuation coverage', value: `${(summary.coverage * 100).toFixed(1)}%`, detail: `${summary.pricedCopies} priced / ${summary.unpricedCopies} unpriced`, icon: Sparkles, to: '/collection', query: { ...EMPTY_QUERY, pricing: 'missing' as const } },
      ].map(metric => <Link className="stat" to={metric.to} key={metric.label} onClick={() => setQuery(metric.query)}><span className="spread muted small">{metric.label}<metric.icon size={16} /></span><strong>{metric.value}</strong><span className="muted small">{metric.detail}</span></Link>)}
    </section>
    <div className="analysis-grid"><Panel title="Collection value" note="USD / synthetic observations / Oct 16-29" action={<span className="badge">14-day demo</span>}>
      <div className="value-head"><strong>{money(summary.valueCents)}</strong><span className="positive">Illustrative trend, not real market movement</span></div>
      <Suspense fallback={<div className="skeleton chart-skeleton" role="status">Loading chart...</div>}><Trend points={points} label="Synthetic collection value in USD. Observations missing on Oct 23 and Oct 24." /></Suspense>
      <p className="small muted">Demo holdings are fixed. No purchases or removals are implied. Gaps are not interpolated. No pre-installation history.</p>
    </Panel><Panel title="What is in your vault?" note="Measure: copies / exclusive color buckets">
      <div className="composition">{colors.map(bucket => <div key={bucket.name} className="composition-item"><div className="spread"><span>{bucket.name}</span><strong>{bucket.copies} <small className="muted">/ {(bucket.copies / summary.copies * 100).toFixed(1)}%</small></strong></div><div className="bar-track"><span style={{ width: `${bucket.copies / Math.max(...colors.map(c => c.copies)) * 100}%` }} /></div><Link className="bar-link" to="/collection" onClick={() => drillColor(bucket.name)} aria-label={`Explore ${bucket.name} cards`} /></div>)}</div>
      <p className="small muted">All {summary.copies} copies counted once. Multicolor cards have their own bucket.</p>
    </Panel></div>
    <Panel title="Your next Commander deck" note="Equivalent-printing match / all fixture entries / not complete 100-card decks" action={<TextLink to="/decks">Deck workspace</TextLink>}>
      <div className="deck-grid">{decks.map(deck => {
        const stats = deckSummary(deck, holdings)
        return <Link key={deck.id} to={`/decks#${deck.id}`} className="deck-feature"><div className="deck-image"><Landscape variant={deck.art} /><span className="badge">COMMANDER DEMO</span></div><div className="deck-feature-body"><h3>{deck.name}</h3><p className="muted small">{deck.theme}</p><div className="progress"><span style={{ width: `${stats.owned / stats.requested * 100}%` }} /></div><div className="spread small"><span><strong>{stats.owned}/{stats.requested}</strong> copies owned</span><span className={stats.missing ? 'gold' : 'positive'}>{stats.missing} missing</span></div></div></Link>
      })}</div>
    </Panel>
    <Panel title="Treasures in plain sight" note="Highest unit estimates / exact printing and finish" action={<TextLink to="/collection">View collection</TextLink>}><div className="treasure-grid">{highest.map(row => <CardTile holding={row} key={row.id} />)}</div></Panel>
    <section className="health-grid"><div className="notice"><ArrowDownToLine size={20} /><div><strong>Fixture snapshot, not an account import</strong><p className="small muted">{holdings.length} synthetic holding rows. No Moxfield or Archidekt account is connected.</p></div></div><Link className="notice warning" to="/collection" onClick={() => setQuery({ ...EMPTY_QUERY, pricing: 'missing' })}><CircleDollarSign size={20} /><div><strong>{summary.unpricedCopies} copies need a price</strong><p className="small">Excluded from estimated value, never treated as zero. Inspect unpriced cards.</p></div></Link></section>
  </>
}
