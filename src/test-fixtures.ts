// Synthetic test data only. Never replace with a private export.
import { MOXFIELD_HEADERS } from './moxfield'

export const syntheticRow = ['2', '1', 'Example, "Mapkeeper"', 'TST', 'Moderately Played', 'Korean', 'etched', 'kept, locally', '2026-01-02T03:04:05Z', 'PCY-1', 'False', 'True', '7.2500']
export function syntheticCsv(rows: string[][] = [syntheticRow], headers: readonly string[] = MOXFIELD_HEADERS) {
  return [headers, ...rows].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n')
}
export const syntheticPrinting = { set: 'TST', collectorNumber: 'PCY-1', language: 'Korean' }
export function syntheticResponse() {
  return {
    object: 'card', set: 'tst', collector_number: 'PCY-1', lang: 'ko', name: 'Example Mapkeeper // Example Gate',
    cmc: 3, color_identity: ['U', 'G'], type_line: 'Creature // Land', rarity: 'rare', image_status: 'highres_scan',
    scryfall_uri: 'https://scryfall.com/card/tst/PCY-1/ko/example',
    card_faces: [
      { name: 'Example Mapkeeper', artist: 'Example Artist A', oracle_text: 'Synthetic front text.', image_uris: { normal: 'https://cards.scryfall.io/normal/front/test.jpg', art_crop: 'https://cards.scryfall.io/art_crop/front/test.jpg' } },
      { name: 'Example Gate', artist: 'Example Artist B', oracle_text: 'Synthetic back text.', image_uris: { normal: 'https://cards.scryfall.io/normal/back/test.jpg' } },
    ],
  }

}

export function syntheticPricedResponse() {
  return { ...syntheticResponse(), prices: { usd: '1.23', usd_foil: '2.34', usd_etched: '3.45' } }
}
