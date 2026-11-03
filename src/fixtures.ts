import type { Card, Deck, Holding } from './domain'

export const cards: Card[] = [
  { id: 'aetherwell', name: 'Aetherwell Cartographer', colors: ['U'], type: 'Creature - Wayfinder', manaValue: 3, rarity: 'Rare', rules: 'When this enters, chart a course. An original fictional card for this demo.', art: 0 },
  { id: 'orrery', name: 'Verdant Orrery', colors: ['G'], type: 'Artifact - Orrery', manaValue: 4, rarity: 'Mythic', rules: 'At the beginning of your turn, awaken the oldest grove.', art: 1 },
  { id: 'sentinel', name: 'Mistglass Sentinel', colors: ['U', 'B'], type: 'Creature - Spirit', manaValue: 5, rarity: 'Rare', rules: 'Flying. The archive remembers what the living forget.', art: 2 },
  { id: 'echoes', name: 'Grove of Echoes', colors: ['G'], type: 'Land', manaValue: 0, rarity: 'Rare', rules: 'Tap: add green mana. The roots keep their own counsel.', art: 1 },
  { id: 'astrolabe', name: 'Rootbound Astrolabe', colors: ['C'], type: 'Artifact', manaValue: 2, rarity: 'Uncommon', rules: 'Tap: add one mana of any color. Only the patient see the path.', art: 2 },
  { id: 'archivist', name: 'Tidepool Archivist', colors: ['U'], type: 'Creature - Scholar', manaValue: 2, rarity: 'Uncommon', rules: 'Whenever you draw your second card, investigate the depths.', art: 0 },
  { id: 'fieldnotes', name: 'Moonlit Fieldnotes', colors: ['B'], type: 'Enchantment', manaValue: 3, rarity: 'Rare', rules: 'Trade a secret for a forgotten treasure.', art: 2 },
  { id: 'broker', name: 'Veyra, Midnight Broker', colors: ['U', 'B', 'G'], type: 'Legendary Creature - Advisor', manaValue: 4, rarity: 'Mythic', rules: 'A fictional Commander. At dusk, exchange a secret for a new opportunity.', art: 2 },
  { id: 'canopy', name: 'Canopy Covenant', colors: ['G', 'B'], type: 'Enchantment', manaValue: 3, rarity: 'Rare', rules: 'Whenever a creature returns, the forest grows another memory.', art: 1 },
  { id: 'lantern', name: 'Lantern of Lost Hours', colors: ['C'], type: 'Artifact', manaValue: 2, rarity: 'Rare', rules: 'Untap a memory. Light the way for the next arrival.', art: 2 },
  { id: 'dawn', name: 'Dawnmarket Envoy', colors: ['W'], type: 'Creature - Advisor', manaValue: 2, rarity: 'Common', rules: 'When this enters, welcome another traveler.', art: 1 },
  { id: 'ember', name: 'Ember Archive', colors: ['R'], type: 'Sorcery', manaValue: 4, rarity: 'Uncommon', rules: 'Uncover a story hidden beneath the ashes.', art: 2 },
  { id: 'tidebound', name: 'Tidebound Navigator', reverseName: 'Observatory at Dusk', colors: ['U', 'G'], type: 'Creature - Navigator // Land', manaValue: 3, rarity: 'Rare', rules: 'Front: chart the passage. Back: preserve the map. A fictional double-faced card.', art: 0 },
  { id: 'moss', name: 'Mossworn Familiar', colors: ['G'], type: 'Creature - Beast', manaValue: 1, rarity: 'Common', rules: 'The smallest guardian keeps the oldest secrets.', art: 1 },
  { id: 'mire', name: 'Whispering Mire', colors: ['B'], type: 'Land', manaValue: 0, rarity: 'Uncommon', rules: 'Tap: add black mana. Listen before you step.', art: 2 },
  { id: 'torrent', name: 'Silent Torrent', colors: ['U'], type: 'Instant', manaValue: 2, rarity: 'Common', rules: 'Return a lost possibility to its owner.', art: 0 },
]

const prices: (number | null)[] = [840, 3040, 1920, 780, 950, 540, null, 4275, 1160, 2310, 35, 175, 650, 20, 125, 65]
export const binders = ['Main binder', 'Showcase', 'Trade archive', 'Commander box']

export const holdings: Holding[] = cards.flatMap((card, i) => [0, 1, 2].map(variant => {
  const basePrice = prices[i]
  const quantity = variant === 0 ? 2 + i % 5 : variant === 1 ? 1 + i % 3 : 1
  return {
    id: `${card.id}-${variant}`,
    card, set: variant === 2 ? 'ARC' : 'TST',
    collectorNumber: String(i * 7 + 14 + (variant === 2 ? 100 : 0)).padStart(3, '0'),
    quantity, finish: variant === 1 ? 'Foil' : variant === 2 && i % 3 === 0 ? 'Etched' : 'Nonfoil',
    condition: variant === 2 ? 'LP' : 'NM', language: variant === 2 && i % 4 === 0 ? 'Japanese' : 'English',
    binder: binders[variant === 0 ? 0 : variant === 1 ? 1 : 2 + i % 2],
    priceCents: basePrice === null || (i === 10 && variant === 2) ? null : Math.round(basePrice * (variant === 1 ? 1.5 : variant === 2 ? 0.9 : 1)),
    allocations: variant === 0 && i < 10 ? [{ deckId: i % 2 === 0 ? 'tidal' : 'covenant', quantity: Math.min(quantity, 2) }] : [],
  } satisfies Holding
}))

export const decks: Deck[] = [
  { id: 'tidal', name: 'The Drowned Observatory', theme: 'Sultai / secrets & sea monsters', art: 0,
    entries: cards.slice(0, 10).map((card, i) => ({ cardId: card.id, quantity: i === 6 ? 8 : 3 })) },
  { id: 'covenant', name: 'The Gilded Canopy', theme: 'Golgari / roots & recursion', art: 1,
    entries: cards.filter(card => card.colors.includes('G') || card.colors.includes('B')).map(card => ({ cardId: card.id, quantity: 4 })) },
  { id: 'nightfall', name: 'The Nightfall Syndicate', theme: 'Dimir / artifacts & intrigue', art: 2,
    entries: cards.filter(card => card.colors.includes('U') || card.colors.includes('C')).map(card => ({ cardId: card.id, quantity: 4 })) },
]

export const OBSERVED_AT = '2026-10-29T06:00:00Z'
export const priceObservations = (row: Holding) => Array.from({ length: 14 }, (_, day) => ({
  date: `Oct ${day + 16}`,
  cents: row.priceCents === null || day === 7 || day === 8 ? null :
    Math.round(row.priceCents * (0.91 + day * 0.09 / 13 + (day % 3 === 0 ? 0.012 : 0))),
})).map((point, i) => i === 13 ? { ...point, cents: row.priceCents } : point)
