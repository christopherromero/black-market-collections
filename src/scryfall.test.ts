import { describe, expect, it, vi } from 'vitest'
import { createScryfallClient, isFullCardUrl, languageCode, printingKey, readCatalogCache, readScryfallCard } from './scryfall'
import { syntheticPrinting, syntheticResponse } from './test-fixtures'

describe('Scryfall exact-printing adapter', () => {
  it('maps front/back full images, artists and separately typed reference pricing', () => {
    const card = readScryfallCard({ ...syntheticResponse(), prices: { usd: '900' } }, syntheticPrinting)
    expect(card.faces.map(face => face.image)).toEqual(['https://cards.scryfall.io/normal/front/test.jpg', 'https://cards.scryfall.io/normal/back/test.jpg'])
    expect(card.faces.map(face => face.artist)).toEqual(['Example Artist A', 'Example Artist B'])
    expect(card.colors).toEqual(['U', 'G'])
    expect(card).not.toHaveProperty('prices')
    expect(card).not.toHaveProperty('priceCents')
    expect(card.pricing.cents).toEqual({ Nonfoil: 90000, Foil: null, Etched: null })
  })

  it('uses the single full-card image for split cards, not art crops or an invented back', () => {
    const result = readScryfallCard({ ...syntheticResponse(), artist: 'Example Artist', image_uris: { large: 'https://cards.scryfall.io/large/front/test.jpg' } }, syntheticPrinting)
    expect(result.faces).toHaveLength(1)
    expect(result.faces[0].image).toContain('/large/front/')
    const response = syntheticResponse()
    response.card_faces[0].image_uris.normal = 'https://cards.scryfall.io/art_crop/front/test.jpg'
    expect(readScryfallCard(response, syntheticPrinting).faces[0].image).toBeNull()
  })

  it.each([{ set: 'other' }, { collector_number: '1' }, { lang: 'en' }])('refuses alternative printings/languages: %j', patch => {
    expect(() => readScryfallCard({ ...syntheticResponse(), ...patch }, syntheticPrinting)).toThrow('different printing or language')
  })

  it('does not misrepresent placeholders as exact scans, and validates cached URLs', () => {
    for (const raw of ['null', '[]', '"invalid"']) expect(() => readCatalogCache(raw)).toThrow('Invalid cached metadata')
    const card = readScryfallCard({ ...syntheticResponse(), image_status: 'placeholder' }, syntheticPrinting)
    expect(card.faces.every(face => face.image === null)).toBe(true)
    const cache = { [printingKey(syntheticPrinting)]: card }
    expect(readCatalogCache(JSON.stringify(cache))).toEqual(cache)
    card.faces[0].image = 'https://untrusted.example/image.jpg'
    expect(() => readCatalogCache(JSON.stringify(cache))).toThrow('Invalid cached metadata')
    for (const url of ['javascript:alert(1)', 'https://cards.scryfall.io/art_crop/front/test.jpg', 'https://evil.example/normal/front/x.jpg', 'https://cards.scryfall.io@evil.example/normal/front/x.jpg']) expect(isFullCardUrl(url)).toBe(false)
  })

  it('sends only encoded public identifiers, keeps browser User-Agent intact, and paces requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(syntheticResponse())))
    const pause = vi.fn(async () => {})
    await createScryfallClient(fetcher, pause)(syntheticPrinting, new AbortController().signal)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('https://api.scryfall.com/cards/tst/PCY-1/ko')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body')
    expect(pause).toHaveBeenCalledWith(150)
  })

  it('does not send requests for unmapped languages or cancelled work', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const resolve = createScryfallClient(fetcher, async () => {})
    expect(languageCode('constructor')).toBeNull()
    await expect(resolve({ ...syntheticPrinting, language: 'Unknown' }, new AbortController().signal)).rejects.toThrow('no English fallback')
    const controller = new AbortController(); controller.abort()
    await expect(resolve(syntheticPrinting, controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stops on 429 and honors cooldown instead of retrying automatically', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }))
    const resolve = createScryfallClient(fetcher, async () => {})
    await expect(resolve(syntheticPrinting, new AbortController().signal)).rejects.toMatchObject({ stopBatch: true })
    await expect(resolve(syntheticPrinting, new AbortController().signal)).rejects.toThrow('rate limit')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([404, 500])('surfaces HTTP %s as a recoverable error', async status => {
    const resolve = createScryfallClient(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })), async () => {})
    await expect(resolve(syntheticPrinting, new AbortController().signal)).rejects.toThrow(status === 404 ? 'No alternative printing' : 'Retry later')
  })

  it('reports network failures without leaking response bodies', async () => {
    const resolve = createScryfallClient(vi.fn<typeof fetch>().mockRejectedValue(new Error('private-looking network text')), async () => {})
    await expect(resolve(syntheticPrinting, new AbortController().signal)).rejects.toThrow('unavailable or timed out')
  })
})
