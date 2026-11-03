import { Component, lazy, Suspense, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { BookOpen, CircleHelp, Layers3, Menu, X } from 'lucide-react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Mark, PageTitle, Panel, SourceNotice } from './components'
import { CollectionProvider, useCollection } from './state'
import { EMPTY_QUERY } from './domain'

const Collection = lazy(() => import('./pages/Collection'))
const CardDetail = lazy(() => import('./pages/CardDetail'))
const Decks = lazy(() => import('./pages/Decks'))
const ImportCollection = lazy(() => import('./pages/ImportCollection'))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application render failed', error, info.componentStack) }
  render() {
    return this.state.failed ? <main className="fatal"><h1>The collection could not load.</h1><p>Your saved filters have not been deleted. Reload to try again, or check the browser console for details.</p><button className="button primary" onClick={() => location.reload()}>Reload</button></main> : this.props.children
  }
}

function Shell() {
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  const { message, dismiss, setQuery, source, binders, revision } = useCollection()
  const nav = [{ to: '/collection', label: 'Collection', icon: Layers3 }, { to: '/decks', label: 'Commander decks', icon: BookOpen }]
  return <div className="app-shell">
    <header className="mobile-header"><Link to="/collection" className="brand"><Mark /><span>Black Market<small>Collection</small></span></Link><button className="icon-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}>{menu ? <X /> : <Menu />}</button></header>
    {menu && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
      <Link to="/collection" className="brand"><Mark /><span>Black Market<small>Collection</small></span></Link>
      <nav aria-label="Main navigation">{nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => { setMenu(false); window.scrollTo(0, 0) }}><item.icon size={19} />{item.label}</NavLink>)}</nav>
      <details className="sidebar-binders"><summary>Binders</summary>{binders.map((binder, i) => <Link key={binder} to="/collection" onClick={() => { setQuery({ ...EMPTY_QUERY, binder }); setMenu(false) }}><span className={`binder-dot dot-${i}`} />{binder}</Link>)}</details>
      <div className="sidebar-bottom"><Link to="/import" onClick={() => setMenu(false)}>Import / manage collection</Link><Link to="/about" onClick={() => setMenu(false)}><CircleHelp size={17} />About & data</Link></div>
    </aside>
    <div className="app-main">{pathname.replace(/\/+$/, '').toLowerCase() !== '/collection' && <SourceNotice source={source} />}
      {message && <div role="status" className="notice spread"><span>{message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={dismiss}><X size={17} /></button></div>}
      <main id="main" key={`${pathname.startsWith('/cards/') ? 'detail' : 'workspace'}-${pathname === '/import' ? 'import' : revision}`}><Suspense fallback={<div className="loading" role="status"><div className="skeleton" /><h2>Loading...</h2><p>Your filters are unchanged.</p></div>}><Routes>
        <Route path="/" element={<Navigate to="/collection" replace />} />
        <Route path="/overview" element={<Navigate to="/collection" replace />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/cards/:holdingId" element={<CardDetail />} />
        <Route path="/decks" element={<Decks />} />
        <Route path="/about" element={<About />} />
        <Route path="/import" element={<ImportCollection />} />
        <Route path="*" element={<NotFound />} />
      </Routes></Suspense></main>
    </div>
  </div>
}

function About() {
  const { source } = useCollection()
  return <><PageTitle title="About this collection" />
    <Panel title="A personal collection workspace"><p>Find cards, track copies across binders, and check what your Commander decks need.</p><p>Save one named filter set in this browser. Saving replaces the previous set; sorting and layout are not saved.</p></Panel>
    <Panel title={source === 'empty' ? 'No collection loaded' : source === 'demo' ? 'Demo dataset active' : 'Local Moxfield collection active'}><p>{source === 'empty' ? 'Import a Moxfield export to get started. No sample cards or decks are active.' : source === 'demo' ? 'Cards, prices, observations and decks are fictional. Your saved collection is unchanged.' : 'Your imported entries are the source for every collection view. No demo decks or synthetic history are attached.'}</p><p><Link className="text-link" to="/import">Import or manage collection</Link>. Demo is optional and temporary. Replacement and deletion require confirmation.</p><p>Your original export is retained only in this browser, unencrypted. Shared browser profiles and scripts on this origin can access it. There is no cloud backup; keep your original file. Clearing site data removes it.</p></Panel>
    <Panel title="USD reference estimates"><p>Scryfall prices match the exact printing, language and finish: nonfoil, foil or etched, with no finish fallback. They are reference estimates, not real-time execution quotes or condition-adjusted values. Purchase Price remains acquisition cost only.</p><p>Update all prices checks every imported printing, including cards outside the current page and filters. Missing prices stay unavailable; collection values always show priced-copy coverage. Automatic browsing checks only the active page or detail, refreshing quotes older than 24 hours.</p><p>Public quotes and set metadata are saved in this browser using IndexedDB. History records actual retrieved quotes by printing and finish, not past trades or historical ownership. Earlier prices are never invented. Storage errors are visible; keep your original collection export as a backup.</p><p>Whole-collection refresh sends only printing identifiers in bounded batches, never quantities, tags, costs or original file contents. Those identifiers reveal the printings being requested. Other languages retain exact-language lookup; no alternate printing is substituted. Public quote history may remain after clearing the imported collection; clearing browser site data removes all local data.</p></Panel>
    <Panel title="Images, metadata & privacy"><p>Complete card images load automatically. Only public set, collector number and language identifiers go to api.scryfall.com, never your file, quantities, tags, flags or costs. Images contact cards.scryfall.io, even with cached metadata. Both hosts receive your IP address. Empty and demo views make no provider requests.</p><p>Exact printing and language must match; there is no name-based or English fallback. Unresolved metadata remains unknown. Rules are Oracle text, not necessarily localized. Catalog images do not document your copy’s condition, alterations or proxy status.</p><p>Data and images from <a href="https://scryfall.com/docs/api" target="_blank" rel="noreferrer">Scryfall</a>, under its published API guidelines and the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Wizards Fan Content Policy</a>. Complete images preserve artist and copyright credits. Card art © Wizards of the Coast; artists credited beside resolved cards.</p><p>This is unofficial Fan Content, not approved or endorsed by Wizards of the Coast or Scryfall. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.</p></Panel>
    <Panel title="Collection banner attribution"><p>The collection header uses <a href="https://www.mtgpics.com/card?ref=acr087" target="_blank" rel="noreferrer">Black Market Connections (Assassin's Creed, ACR #87)</a>, illustrated by Filipe Pagliuso. Artwork © Wizards of the Coast LLC. The user-supplied <a href="https://www.mtgpics.com/pics/art/acr/087.jpg" target="_blank" rel="noreferrer">MTGPics JPEG</a> is bundled unchanged at 1920×1451, including its copyright notice; CSS crops the display and adds gradients. Displaying it makes no external banner request.</p><p>This is a user-requested local preview, not public redistribution approval. MTGPics identifies Wizards' copyright but provides no asset-specific reuse license; attribution and the Fan Content Policy do not establish permission for this particular use. Reuse/redistribution rights remain unconfirmed and must be checked before public distribution. No artist, MTGPics or Wizards endorsement is implied.</p></Panel>
    <Panel title="App icon attribution"><p>The brand mark and favicon use <a href="https://deadlock.wiki/File:Enchanter%27s_Satchel.png" target="_blank" rel="noreferrer">Enchanter's Satchel</a> from Deadlock, sourced via Deadlock Wiki. Game artwork © Valve Corporation, not project-owned or Wizards of the Coast artwork. The unchanged 137×137 PNG original is bundled locally; displaying it makes no wiki/CDN request.</p><p>The wiki's CC BY-SA notice excludes game content and non-text media. No asset-specific reuse license was provided; reuse/redistribution permission remains unconfirmed. No Valve or Deadlock Wiki endorsement is implied.</p></Panel>
  </>
}

function NotFound() {
  return <div className="empty-state"><h1>Page not found</h1><p>This address does not match a collection page.</p><Link className="button primary" to="/collection">Back to collection</Link></div>
}

export default function App() {
  return <ErrorBoundary><BrowserRouter><CollectionProvider><a className="skip-link" href="#main">Skip to content</a><Shell /></CollectionProvider></BrowserRouter></ErrorBoundary>
}
