import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Layers3, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Card, Holding } from './domain'
import { COLOR_NAMES, money, totalValue } from './domain'

export function Mark() {
  return <span className="brand-mark" aria-hidden="true"><Layers3 size={23} strokeWidth={1.5} /></span>
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

export function CardArt({ card, back = false, compact = false }: { card: Card; back?: boolean; compact?: boolean }) {
  return <div className={`card-art art-${card.art} ${compact ? 'compact-art' : ''}`} role="img" aria-label={`Original synthetic card illustration: ${back ? card.reverseName ?? card.name : card.name}`}>
    <div className="card-art-heading"><span>{back ? card.reverseName : card.name}</span><span>{card.manaValue}</span></div>
    <div className="card-art-window"><Landscape variant={back ? (card.art + 1) % 3 : card.art} /></div>
    <div className="card-art-type">{back ? 'Land - Observatory' : card.type}</div>
    <div className="card-art-rules"><p>{card.rules}</p><i>Some secrets are worth keeping.</i></div>
    <div className="card-art-footer"><span>TST / ORIGINAL DEMO ART</span><span>{card.rarity}</span></div>
  </div>
}

export function ColorPips({ card }: { card: Card }) {
  return <span className="pips" aria-label={card.colors.map(color => COLOR_NAMES[color]).join(', ')}>
    {card.colors.map(color => <span className={`pip pip-${color}`} key={color} aria-hidden="true">{color}</span>)}
  </span>
}

export function CardTile({ holding, onOpen }: { holding: Holding; onOpen?: () => void }) {
  return <Link to={`/cards/${holding.id}`} className="card-tile" onClick={onOpen}>
    <div className="tile-image"><CardArt card={holding.card} compact /><span className="copy-badge">{holding.quantity} owned</span></div>
    <div className="tile-meta"><strong>{holding.card.name}</strong><span>{holding.set} #{holding.collectorNumber} / {holding.finish}</span><div className="spread"><b>{money(totalValue(holding))}</b><ColorPips card={holding.card} /></div></div>
  </Link>
}

export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children}</div>
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
