import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Holding } from '../domain'
import { cards, decks, holdings } from '../fixtures'
import { CollectionProvider, useCollection } from '../state'
import Decks from './Decks'

vi.mock('../fixtures', async importOriginal => {
  const fixtures = await importOriginal<typeof import('../fixtures')>()
  return { ...fixtures, holdings: [], decks: [] }
})

beforeEach(() => {
  localStorage.clear()
  holdings.length = 0
  decks.length = 0
  const priced: Holding = {
    id: 'priced', card: cards[0], set: 'TST', collectorNumber: '001',
    quantity: 1, finish: 'Nonfoil', condition: 'NM', language: 'English',
    binder: 'Main binder', priceCents: 125, allocations: [],
  }
  holdings.push(priced, { ...priced, id: 'unpriced', card: cards[1], priceCents: null })
  decks.push({
    id: 'test-deck', name: 'Test deck', theme: 'Test collection', art: 0,
    entries: cards.slice(0, 2).map(card => ({ cardId: card.id, quantity: 1 })),
  })
})

afterEach(cleanup)

function renderDecks() {
  const { result } = renderHook(useCollection, {
    wrapper: ({ children }) => <MemoryRouter><CollectionProvider>{children}<Decks /></CollectionProvider></MemoryRouter>,
  })
  act(() => result.current.enableDemo())
}

describe('missing-card estimate copy', () => {
  it('reports no missing copies without a misleading zero-cost estimate', () => {
    renderDecks()
    expect(screen.getByText('No missing copies')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.queryByText(/missing copies have no price/)).not.toBeInTheDocument()
  })

  it('reports an unavailable estimate when every missing copy is unpriced', () => {
    decks[0].entries[1].quantity = 4
    renderDecks()
    expect(screen.getByText('Estimate unavailable')).toBeInTheDocument()
    expect(screen.getByText('3 missing copies have no price.')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('shows the full estimate when all missing copies have prices', () => {
    decks[0].entries[0].quantity = 3
    renderDecks()
    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('Estimated cost of missing cards')).toBeInTheDocument()
    expect(screen.queryByText('Estimate unavailable')).not.toBeInTheDocument()
  })

  it('labels a partial estimate and states exactly which copies are excluded', () => {
    decks[0].entries[0].quantity = 3
    decks[0].entries[1].quantity = 2
    renderDecks()
    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('Estimated cost of priced missing cards')).toBeInTheDocument()
    expect(screen.getByText('1 missing copy has no price and is excluded from this estimate.')).toBeInTheDocument()
  })

  it('does not confuse a known zero price with an unknown price', () => {
    decks[0].entries[0].quantity = 3
    holdings[0].priceCents = 0
    renderDecks()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.queryByText('Estimate unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText('No missing copies')).not.toBeInTheDocument()
  })
})
