import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CardArt, CardTile, Mark, SourceNotice } from './components'
import { parseMoxfield } from './moxfield'
import { enrichCard, readScryfallCard } from './scryfall'
import { syntheticCsv, syntheticPrinting, syntheticResponse } from './test-fixtures'

afterEach(cleanup)
const imported = parseMoxfield(syntheticCsv()).holdings[0].card
const resolved = enrichCard(imported, readScryfallCard(syntheticResponse(), syntheticPrinting))

describe('shared source notice', () => {
  it('keeps the exact source disclosures and links, and removes all status in empty mode', () => {
    const { container, rerender } = render(<MemoryRouter><SourceNotice source="moxfield" /></MemoryRouter>)
    expect(container.querySelectorAll('.sample-notice')).toHaveLength(1)
    expect(screen.getByText('Local collection')).toBeInTheDocument()
    expect(screen.getByText('Moxfield import · browser-only storage · Scryfall USD reference estimates.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/about')
    expect(screen.queryByRole('link', { name: 'Exit demo' })).not.toBeInTheDocument()

    rerender(<MemoryRouter><SourceNotice source="demo" /></MemoryRouter>)
    expect(screen.getByText('Sample data')).toBeInTheDocument()
    expect(screen.getByText('Temporary demo · fictional cards and prices · any saved import is unchanged.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exit demo' })).toHaveAttribute('href', '/import')
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/about')
    expect(screen.queryByText('Local collection')).not.toBeInTheDocument()

    rerender(<MemoryRouter><SourceNotice source="empty" /></MemoryRouter>)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('shared brand mark', () => {
  it('uses the local satchel decoratively without changing the surrounding link name', () => {
    const { container } = render(<a href="/collection"><Mark />Black Market Collection</a>)
    const image = container.querySelector('.brand-mark img')
    expect(image).toHaveAttribute('src', '/enchanters-satchel.png')
    expect(image).toHaveAttribute('width', '137')
    expect(image).toHaveAttribute('height', '137')
    expect(image).toHaveAttribute('alt', '')
    expect(image).not.toHaveAttribute('aria-label')
    expect(container.querySelector('.brand-mark')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAccessibleName('Black Market Collection')
  })
})

describe('complete card imagery', () => {
  it('keeps gallery navigation, face flipping and retries as separate accessible controls', () => {
    const holding = { ...parseMoxfield(syntheticCsv()).holdings[0], card: resolved }
    render(<MemoryRouter><CardTile holding={holding} /></MemoryRouter>)
    expect(screen.getByRole('img').closest('a')).toHaveAttribute('href', `/cards/${holding.id}`)
    fireEvent.click(screen.getByRole('button', { name: /Show back face/ }))
    expect(screen.getByRole('img')).toHaveAccessibleName(/back face/)
    fireEvent.error(screen.getByRole('img'))
    const retry = screen.getByRole('button', { name: 'Retry image' })
    expect(retry.closest('a')).toBeNull()
    fireEvent.click(retry)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/back/test.jpg')
    expect(screen.getByRole('link', { name: /Details for/ })).toHaveAttribute('href', `/cards/${holding.id}`)
  })
  it('renders lazy full-card thumbnails and exact front/back names and artist credits', () => {
    const { rerender, container } = render(<CardArt card={resolved} compact />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/front/test.jpg')
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy')
    expect(screen.getByRole('img')).toHaveAccessibleName(/Example Mapkeeper — front face, TST #PCY-1, Korean/)
    expect(screen.getByText(/Example Artist A/)).toBeInTheDocument()
    expect(container.querySelector('.card-art, .landscape')).toBeNull()
    rerender(<CardArt card={resolved} back />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/back/test.jpg')
    expect(screen.getByRole('img')).toHaveAccessibleName(/Example Gate — back face/)
    expect(screen.getByText(/Example Artist B/)).toBeInTheDocument()
  })

  it('shows missing images explicitly and displays resolved images without a permission flag', () => {
    const { rerender, container } = render(<CardArt card={imported} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Exact card image unavailable/)
    expect(container.querySelector('img')).toBeNull()
    rerender(<CardArt card={resolved} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/front/test.jpg')
  })

  it('shows failed-image state, retries, and resets failure when changing faces', () => {
    const { rerender } = render(<CardArt card={resolved} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('Image failed to load.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry image' }))
    expect(screen.getByRole('img')).toHaveAttribute('src')
    fireEvent.error(screen.getByRole('img'))
    rerender(<CardArt card={resolved} back />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/back/test.jpg')
  })
})
