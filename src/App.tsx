import { Component, lazy, Suspense, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ArrowRight, BookOpen, CircleHelp, LayoutDashboard, Layers3, Menu, ShieldCheck, Sparkles, X } from 'lucide-react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { CardTile, Landscape, Mark, PageTitle, Panel, TextLink } from './components'
import { cards, holdings, showcases } from './fixtures'
import { CollectionProvider, useCollection } from './state'
import { EMPTY_QUERY } from './domain'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Collection = lazy(() => import('./pages/Collection'))
const CardDetail = lazy(() => import('./pages/CardDetail'))
const Decks = lazy(() => import('./pages/Decks'))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application render failed', error, info.componentStack) }
  render() {
    return this.state.failed ? <main className="fatal"><h1>The archive could not open.</h1><p>Your demo preferences have not been deleted. Reload to try again, or check the browser console for details.</p><button className="button primary" onClick={() => location.reload()}>Reload application</button></main> : this.props.children
  }
}

function Landing({ initialShowcase, initialError }: { initialShowcase: number; initialError: string | null }) {
  const [index, setIndex] = useState(initialShowcase)
  const showcase = showcases[index]
  return <div className="landing">
    <header className="public-header"><Link to="/" className="brand"><Mark /><span>BLACK MARKET<small>COLLECTION</small></span></Link><nav aria-label="Public navigation"><a href="#inside">Inside the vault</a><Link to="/overview" className="button primary">Explore the demo <ArrowUpRightIcon /></Link></nav></header>
    {initialError && <p role="status" className="notice warning">{initialError}</p>}
    <main id="main">
      <section className="landing-hero">
        <Landscape variant={showcase.art} className="hero-landscape" />
        <div className="hero-shade" />
        <div className="hero-copy"><p className="eyebrow gold"><span className="tiny-diamond" /> A LITTLE KNOWLEDGE. A LOT OF POSSIBILITIES.</p><h1>Know what<br />you <em>hold.</em></h1><p>Your next Commander deck might already be in your binder. Make the connections. Uncover the value. Open your vault.</p><div className="hero-actions"><Link to="/overview" className="button primary">Enter the demo vault <ArrowRight size={17} /></Link><a className="button ghost" href="#inside">Take a look inside</a></div><div className="hero-proof"><ShieldCheck size={15} /> Personal by design.<span /> No account connected.<span /> Synthetic data only.</div></div>
        <div className="showcase-caption"><span className="eyebrow">CURATED DEMO / {String(index + 1).padStart(2, '0')}</span><h2>{showcase.title}</h2><p>{showcase.theme}</p><button className="text-link" onClick={() => setIndex((index + 1) % showcases.length)}>Another connection <ArrowRight size={15} /></button></div>
        <div className="hero-number">U / B / G</div>
      </section>
      <section className="landing-intro" id="inside"><div><p className="eyebrow gold">YOUR CARDS. YOUR CONNECTIONS.</p><h2>More than a list.<br />A collection of possibilities.</h2></div><p>Bring your binders and Commander plans into focus. See what you own, what is waiting for a deck, and where every physical copy belongs.</p></section>
      <section className="feature-grid">
        {[{ icon: Layers3, title: 'Every card accounted for.', body: 'Exact printings, finishes, binders, and quantities. A collection explorer that knows the details matter.' }, { icon: BookOpen, title: 'Find your next 99.', body: 'Connect your collection to Commander plans. See missing cards and distinguish buildable decks from decks you can keep assembled.' }, { icon: Sparkles, title: 'A little market intelligence.', body: 'Estimated values with honest coverage, separate finish prices, and visible gaps. Missing never means zero.' }].map(feature => <article key={feature.title}><feature.icon size={22} /><h3>{feature.title}</h3><p>{feature.body}</p></article>)}
      </section>
      <section className="landing-spotlights"><div className="spread"><div><p className="eyebrow gold">A DIFFERENT CONNECTION, EVERY VISIT</p><h2>{showcase.eyebrow}</h2></div><span className="badge">Fictional Commander showcase</span></div><p className="muted">{showcase.description}</p><div className="spotlight-grid">{showcase.cards.map(id => <CardTile key={id} holding={holdings.find(row => row.card.id === id && row.finish === 'Nonfoil')!} />)}</div><p className="art-credit">Original synthetic illustrations. No MTGPics artwork, real collection data, power rankings, or popularity statistics are used. Showcase changes on page load; saved holdings do not.</p></section>
      <section className="landing-cta"><p className="eyebrow gold">THE NEXT GREAT DECK STARTS HERE.</p><h2>Open the binder.<br />See the bigger picture.</h2><Link to="/collection" className="button primary">Browse the demo collection <ArrowRight size={17} /></Link></section>
    </main>
    <footer className="public-footer"><span>BLACK MARKET COLLECTION</span><p>A personal MTG collection & Commander project. Unofficial and not affiliated with Wizards of the Coast.</p><span>Built for your own little empire.</span></footer>
  </div>
}

function ArrowUpRightIcon() { return <ArrowRight size={16} className="diagonal-arrow" /> }

function Shell() {
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  const { message, dismiss, setQuery } = useCollection()
  const nav = [{ to: '/overview', label: 'Overview', icon: LayoutDashboard }, { to: '/collection', label: 'Collection', icon: Layers3 }, { to: '/decks', label: 'Commander decks', icon: BookOpen }]
  return <div className="app-shell">
    <header className="mobile-header"><Link to="/" className="brand"><Mark /><span>BLACK MARKET<small>COLLECTION</small></span></Link><button className="icon-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}>{menu ? <X /> : <Menu />}</button></header>
    {menu && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
      <Link to="/" className="brand"><Mark /><span>BLACK MARKET<small>COLLECTION</small></span></Link>
      <div className="workspace-label"><span className="status-dot" /> THE DEMO VAULT <span className="badge">DEMO</span></div>
      <nav aria-label="Main navigation">{nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => { setMenu(false); window.scrollTo(0, 0) }}><item.icon size={19} />{item.label}</NavLink>)}</nav>
      <div className="sidebar-binders"><p className="eyebrow">YOUR DEMO BINDERS</p>{['Main binder', 'Showcase', 'Trade archive', 'Commander box'].map((binder, i) => <Link key={binder} to="/collection" onClick={() => { setQuery({ ...EMPTY_QUERY, binder }); setMenu(false) }}><span className={`binder-dot dot-${i}`} />{binder}</Link>)}</div>
      <div className="sidebar-bottom"><Link to="/about"><CircleHelp size={17} />About this milestone</Link><p>No account connected.<br />No private inventory loaded.</p><Link to="/" className="text-link">Back to the front door <ArrowRight size={14} /></Link></div>
    </aside>
    <div className="app-main"><div className="demo-strip"><span><ShieldCheck size={14} /> Synthetic demo workspace</span><span className="desktop-only">USD estimates / no live services</span></div>
      {message && <div role="status" className="notice spread"><span>{message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={dismiss}><X size={17} /></button></div>}
      <main id="main" key={pathname.startsWith('/cards/') ? 'detail' : 'workspace'}><Suspense fallback={<div className="loading" role="status"><div className="skeleton" /><h2>Opening the vault...</h2><p>Loading this screen. Your demo filters are retained.</p></div>}><Routes>
        <Route path="/overview" element={<Dashboard />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/cards/:holdingId" element={<CardDetail />} />
        <Route path="/decks" element={<Decks />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes></Suspense></main><footer className="app-footer">Synthetic data. Real possibilities.<span>BLACK MARKET COLLECTION / FIRST LOOK</span></footer>
    </div>
  </div>
}

function About() {
  return <><PageTitle eyebrow="THE FINE PRINT" title="A personal vault, in the making." /><Panel title="This is a working UI milestone"><p>All {cards.length} card identities, illustrations, prices, deck names, and holdings are fictional. Demo routes are public, not authenticated private collection routes. No credentials or real files are accepted.</p><p>Working now: rotating landing showcase, responsive dashboard, collection filtering, multi-sort, pagination, table/gallery views, CSV export, browser-saved views, card details, finish-specific observations, and allocation-aware deck summaries.</p><p>Next: choose an identity provider, add server-side authorization, SQLite, staged snapshot imports, and approved card data adapters. Do not load private collection data or deploy this milestone publicly as a production service.</p></Panel><Panel title="Source and artwork boundaries"><p>Moxfield will remain the collection source of truth; Archidekt will remain the deck-editing source of truth. This demo makes no provider requests. It does not claim automatic synchronization or real market history.</p><p>MTGPics images are not bundled. The original SVG artwork is a placeholder until image permissions, artist attribution, and permitted retrieval are verified. No official card text or artwork is reproduced.</p><TextLink to="/">See the public landing page</TextLink></Panel></>
}

function NotFound() {
  return <div className="empty-state"><h1>This room is not in the archive.</h1><p>The address does not match a demo screen.</p><Link className="button primary" to="/overview">Return to overview</Link></div>
}

export default function App({ showcase, showcaseError }: { showcase: number; showcaseError: string | null }) {
  return <ErrorBoundary><BrowserRouter><CollectionProvider><a className="skip-link" href="#main">Skip to content</a><Routes><Route path="/" element={<Landing initialShowcase={showcase} initialError={showcaseError} />} /><Route path="*" element={<Shell />} /></Routes></CollectionProvider></BrowserRouter></ErrorBoundary>
}
