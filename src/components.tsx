import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Layers3, RotateCw, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Card, Holding } from './domain'
import { COLOR_NAMES, money, summarize, totalValue } from './domain'
import { needsCatalogRefresh } from './scryfall'

export function Mark() {
  return <span className="brand-mark" aria-hidden="true"><img src="/enchanters-satchel.png" alt="" width={137} height={137} /></span>
}

export function Landscape({ variant = 0, className = '' }: { variant?: number; className?: string }) {
  const id = useId().replaceAll(':', '')
  const green = variant === 1
  return <svg className={`landscape ${className}`} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Original fictional ${green ? 'gilded forest sanctuary' : variant === 2 ? 'midnight market citadel' : 'drowned observatory'} illustration`}>
    <defs>
      <linearGradient id={`${id}sky`} x2="0.7" y2="1"><stop stopColor={green ? '#1b3c34' : '#102d46'} /><stop offset="1" stopColor="#060d17" /></linearGradient>
      <radialGradient id={`${id}glow`}><stop stopColor={green ? '#ddc77d' : '#84d9d0'} stopOpacity=".65" /><stop offset="1" stopColor="#0d322e" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}water`} x2="0" y2="1"><stop stopColor="#3a8b7c" stopOpacity=".5" /><stop offset="1" stopColor="#081826" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="1200" height="700" fill={`url(#${id}sky)`} />
    <ellipse cx="820" cy="210" rx="340" ry="280" fill={`url(#${id}glow)`} />
    <circle cx="850" cy="150" r="48" fill={green ? '#ccb87b' : '#a9d2cd'} opacity=".65" />
    <path d="M0 400 160 160 290 360 440 110 640 400 800 260 1000 380 1200 150V700H0Z" fill="#163943" />
    <path d="M0 470 190 320 400 460 570 290 820 470 1050 350 1200 460V700H0Z" fill={green ? '#1d4940' : '#163947'} />
    {Array.from({ length: 7 }, (_, i) => <g key={i} transform={`translate(${550 + i * 65} ${210 + Math.abs(3 - i) * 28})`}>
      <path d="M0 260V50L22 15 44 50V260" fill={green ? '#577968' : '#466a70'} />
      <path d="M-10 55 22 0 54 55Z" fill={green ? '#b49b5b' : '#77999a'} />
      <path d="M15 88H29V118H15Z" fill="#80cbbc" opacity=".8" />
      <path d="M15 145H29V170H15Z" fill="#132f35" />
    </g>)}
    <path d="M530 490Q785 350 1040 490L1080 540H490Z" fill="#1b4348" />
    <path d="M625 500V375Q780 270 935 375V500M685 500V398Q780 340 875 398V500" fill="none" stroke="#71918a" strokeWidth="13" opacity=".6" />
    <path d="M0 590Q280 470 530 550T1200 520V700H0Z" fill="#0c242a" />
    <path d="M730 525Q790 500 850 525L1010 700H540Z" fill={`url(#${id}water)`} />
    {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M${690 - i * 7} ${550 + i * 9}h${130 + i * 13}`} stroke="#6da799" opacity=".18" />)}
    {green && <g fill="none" stroke="#0a251f" strokeWidth="30"><path d="M90 700Q280 330 170 0M160 300Q390 180 400 0M1100 700Q910 340 1070 0M1020 280Q820 150 800 0" /></g>}
    {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={(i * 193 + 43) % 1200} cy={(i * 73 + 29) % 650} r={i % 3 === 0 ? 2.5 : 1} fill="#b9dcc5" opacity=".5" />)}
  </svg>
}

export function CardArt({ card, back = false, compact = false, to, onOpen }: { card: Card; back?: boolean; compact?: boolean; to?: string; onOpen?: () => void }) {
  const face = card.catalog?.faces[back ? 1 : 0]
  const name = face?.name ?? (back ? card.reverseName ?? card.name : card.name)
  const printing = card.printing
  const alt = `${name} — ${back ? 'back' : 'front'} face${printing ? `, ${printing.set} #${printing.collectorNumber}, ${printing.language}` : ', fictional demo card'}`
  if (face?.image)
    return <FullCardImage key={face.image} url={face.image} alt={alt} artist={face.artist} compact={compact} to={to} onOpen={onOpen} />
  const reason = !printing ? 'Demo card — no card image' : 'Exact card image unavailable'
  const placeholder = <div className="card-image-placeholder" role="img" aria-label={`${alt}: ${reason}`}>
    <Layers3 aria-hidden="true" size={24} /><span>{reason}</span><span className="small">{name}</span>
  </div>
  return to ? <Link className="card-image-link" to={to} onClick={onOpen}>{placeholder}</Link> : placeholder
}

function FullCardImage({ url, alt, artist, compact, to, onOpen }: { url: string; alt: string; artist: string | null; compact: boolean; to?: string; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false)
  const image = <img className="full-card-image" src={url} alt={alt} loading={compact ? 'lazy' : 'eager'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  return <div className="full-card">
    {failed ? <div className="card-image-placeholder" role="img" aria-label={`${alt}: image failed to load`}><span>Image failed to load.</span>{compact && !to ? <span className="small">Open the gallery to retry.</span> : <button className="button ghost" onClick={() => setFailed(false)}>Retry image</button>}</div>
      : to ? <Link className="card-image-link" to={to} onClick={onOpen}>{image}</Link> : image}
    <p className="art-credit">Art: {artist ?? 'artist unavailable'} · Scryfall / © Wizards of the Coast</p>
  </div>
}

export function ColorPips({ card }: { card: Card }) {
  if (!card.colors.length) return <span className="small muted">Identity unknown</span>
  return <span className="pips" aria-label={card.colors.map(color => COLOR_NAMES[color]).join(', ')}>
    {card.colors.map(color => <span className={`pip pip-${color}`} key={color} aria-hidden="true">{color}</span>)}
  </span>
}

export function CardTile({ holding, onOpen }: { holding: Holding; onOpen?: () => void }) {
  const [back, setBack] = useState(false)
  const to = `/cards/${holding.id}`
  const hasBack = holding.card.catalog?.faces.length === 2 || Boolean(holding.card.reverseName)
  return <article className="card-tile" aria-label={`${holding.card.name}, ${holding.set} #${holding.collectorNumber}`}>
    <div className="tile-image"><CardArt card={holding.card} back={back} compact to={to} onOpen={onOpen} /></div>
    <div className="tile-meta">
      <PriceLine holding={holding} />
      <span>{holding.quantity} owned · {holding.finish} · {holding.condition}</span>
      <div className="gallery-card-actions">
        <Link to={to} onClick={onOpen} aria-label={`Details for ${holding.card.name}, ${holding.set} #${holding.collectorNumber}, ${holding.language}`}>{holding.set.toUpperCase()} #{holding.collectorNumber} · {holding.language}</Link>
        {hasBack && <button className="icon-button" onClick={() => setBack(value => !value)} aria-label={`Show ${back ? 'front' : 'back'} face of ${holding.card.name}`}><RotateCw size={16} /></button>}
      </div>
    </div>
  </article>
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{children}</div>
}

export function SourceNotice({ source }: { source: 'empty' | 'demo' | 'moxfield' }) {
  if (source === 'empty') return null
  return <div className="sample-notice">
    <span className="badge">{source === 'demo' ? 'Sample data' : 'Local collection'}</span>
    <p>{source === 'demo' ? 'Temporary demo · fictional cards and prices · any saved import is unchanged.' : 'Moxfield import · browser-only storage · Scryfall USD reference estimates.'}</p>
    <div className="source-notice-links">{source === 'demo' && <Link to="/import">Exit demo</Link>}<Link to="/about">Details</Link></div>
  </div>
}

export function PriceLine({ holding }: { holding: Holding }) {
  return <span className="price-line">{money(holding.priceCents)} per copy · {money(totalValue(holding))} total</span>
}

export function EstimateSummary({ rows }: { rows: Holding[] }) {
  const summary = summarize(rows)
  return <p className="estimate-summary small" role="status"><strong>Priced subtotal: {money(summary.valueCents)}</strong> · {summary.pricedCopies} of {summary.copies} copies priced · USD reference estimate. {summary.unpricedCopies} unpriced copies excluded{summary.unpricedCopies ? '; partial coverage' : ''}.</p>
}

export function QuoteNote({ holding }: { holding: Holding }) {
  const pricing = holding.card.catalog?.pricing
  return <p className="quote-note small muted">{pricing?.error ?? (pricing?.retrievedAt
    ? `Scryfall USD reference estimate · ${holding.finish} · ${needsCatalogRefresh(holding.card.catalog) ? 'stale (24h+)' : 'fresh (under 24h)'} · retrieved ${new Date(pricing.retrievedAt).toLocaleString()}. Not a live quote or condition-adjusted price.`
    : 'Reference estimate not loaded. Open this printing or refresh to check.')}</p>
}

export function PriceComparison({ holding }: { holding: Holding }) {
  const pricing = holding.card.catalog?.pricing
  return <section className="price-comparison" aria-label="Finish price comparison">
    <h3>USD reference prices by finish</h3>
    <dl>{(['Nonfoil', 'Foil', 'Etched'] as const).map(finish => <div key={finish} data-owned={holding.finish === finish}><dt>{finish}{holding.finish === finish && <span className="small"> · your finish</span>}</dt><dd>{money(pricing && !pricing.error ? pricing.cents[finish] : null)}</dd></div>)}</dl>
    <QuoteNote holding={holding} />
  </section>
}

export function Panel({ title, note, children, action }: { title: string; note?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-title"><div><h2>{title}</h2>{note && <p className="muted small">{note}</p>}</div>{action}</div>{children}</section>
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><Layers3 size={32} /><h2>{title}</h2><div className="muted">{children}</div></div>
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    const previous = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose}>
    <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={20} /></button></div>
    {children}
  </dialog>
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-link" to={to}>{children}<ArrowUpRight size={15} /></Link>
}
