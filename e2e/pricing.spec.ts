import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { syntheticCsv, syntheticPricedResponse, syntheticRow } from '../src/test-fixtures'
import { expectWorkspaceWidth } from './header-assertions'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.scryfall.com/**', route => route.fulfill({ json: syntheticPricedResponse() }))
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect x="1" y="1" width="318" height="598" fill="#204b45" stroke="white"/><text x="10" y="580" fill="white">Synthetic credit</text></svg>',
  }))
})

async function importRows(page: Page, rows = [syntheticRow]) {
  await page.goto('/import')
  await page.getByLabel('Moxfield export').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(syntheticCsv(rows)) })
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('Replace your entire saved collection?')
  await page.getByRole('button', { name: /^Replace collection with/ }).click()
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
  await expect(page.getByRole('region', { name: 'External card images' })).toContainText('Checked')
}

async function noJargon(page: Page) {
  await expect(page.locator('body')).not.toContainText(/\bcsv\b/i)
  expect(await page.locator('[aria-label], [title], img[alt], input[placeholder]').evaluateAll(elements =>
    elements.flatMap(element => ['aria-label', 'title', 'alt', 'placeholder'].map(attr => element.getAttribute(attr) ?? '')).join(' '))).not.toMatch(/\bcsv\b/i)
}

test('all routes, accessible text and invalid-file states avoid technical import jargon', async ({ page }) => {
  for (const route of ['/collection', '/import', '/cards/missing', '/decks', '/about']) {
    await page.goto(route)
    await expect(page.locator('h1, h2').first()).toBeVisible()
    await noJargon(page)
  }
  await page.goto('/import')
  for (const file of ['', 'bad,header\r\n1,2', '"unfinished']) {
    await page.getByLabel('Moxfield export').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(file) })
    await expect(page.getByRole('alert')).toBeVisible()
    await noJargon(page)
    await expect(page.getByRole('button', { name: /^Replace collection with/ })).toHaveCount(0)
  }
  await importRows(page)
  for (const route of ['/collection', '/import', '/decks', '/about', '/cards/moxfield-2']) {
    await page.goto(route)
    await expect(page.locator('.sample-notice')).toBeVisible()
    await noJargon(page)
  }
  for (const tab of ['Holdings', 'Deck usage', 'Price history', 'Card info']) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await noJargon(page)
  }
})

test('reference pricing is consistent in every layout, finish, subtotal, sort, filter and export', async ({ page }) => {
  let requests = 0
  await page.route('https://api.scryfall.com/**', async route => {
    requests++
    const number = new URL(route.request().url()).pathname.split('/')[3]
    await route.fulfill({ json: { ...syntheticPricedResponse(), collector_number: number,
      prices: number === 'missing' ? { usd: null } : number === 'zero' ? { usd: '0.00' } : syntheticPricedResponse().prices } })
  })
  const rows = ['Nonfoil', 'Foil', 'Etched', 'Missing', 'Zero'].map((finish, index) => {
    const row = [...syntheticRow]
    row[2] = `${String.fromCharCode(65 + index)} ${finish}`
    row[6] = index < 3 ? ['', 'foil', 'etched'][index] : ''
    if (index >= 3) row[9] = finish.toLowerCase()
    return row
  })
  await importRows(page, rows)
  await expect(page.locator('.image-resolution')).toContainText('Checked 3 of 3')
  expect(requests).toBe(3)
  const collectionPrices = page.getByRole('region', { name: 'Collection pricing' })
  await expect(collectionPrices.getByRole('heading')).toContainText('$14.04')
  await expect(collectionPrices).toContainText('8 of 10 copies priced')
  await expect(collectionPrices).toContainText('2 unpriced copies excluded')
  if (test.info().project.name !== 'mobile') {
    await expect(page.getByRole('columnheader', { name: 'Unit USD' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'C Etched' })).toContainText('$3.45')
    await expect(page.getByRole('row').filter({ hasText: 'C Etched' })).toContainText('$6.90')
  } else await expect(page.locator('.mobile-card-row').filter({ hasText: 'C Etched' })).toContainText('$3.45 per copy · $6.90 total')
  await page.getByRole('button', { name: 'Gallery view' }).click()
  await expect(page.getByRole('article', { name: /^C Etched,/ })).toContainText('$3.45 per copy · $6.90 total')
  await expect(page.getByRole('article', { name: /^D Missing,/ })).toContainText('Unavailable per copy')
  await expect(page.getByRole('article', { name: /^E Zero,/ })).toContainText('$0.00 per copy')
  await page.getByRole('button', { name: 'Sort', exact: true }).click()
  const sort = page.getByRole('dialog', { name: 'Sort priorities' })
  await sort.getByRole('combobox', { name: /^Priority 1/ }).selectOption('total')
  await sort.getByLabel('Direction').selectOption('desc')
  await sort.getByRole('button', { name: 'Done' }).click()
  expect(await page.locator('.card-tile').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')?.split(',')[0]))).toEqual(['C Etched', 'B Foil', 'A Nonfoil', 'E Zero', 'D Missing'])
  await page.getByText('More options', { exact: true }).click()
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export 5 entries' }).click()
  const stream = await (await pendingDownload).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const exported = Buffer.concat(chunks).toString('utf8')
  expect(exported).toContain('"Quote retrieved at"')
  expect(exported).toContain('Scryfall USD reference estimate')
  expect(exported.split('\r\n').slice(1).map(line => line.match(/,"([^"]*)"$/)![1])).toEqual(['6.90', '4.68', '2.46', '0.00', ''])
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByLabel('Price coverage').selectOption('priced')
  await page.getByRole('button', { name: /^Apply/ }).click()
  await expect(page.locator('.result-summary')).toContainText('4 entries')
  await expect(page.locator('.estimate-summary')).toContainText('8 of 8 copies priced')
  await page.getByRole('article', { name: /^C Etched,/ }).locator('.card-image-link').click()
  await expect(page.locator('.detail-summary')).toContainText('$3.45 per copy · $6.90 total')
  await expect(page.locator('.detail-summary')).toContainText('retrieved')
  await page.getByRole('tab', { name: 'Price history' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Captured price history')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.detail-summary')).toContainText('$6.90')
  expect(requests).toBe(3)
  await page.getByRole('button', { name: 'Refresh visible estimates' }).click()
  await expect.poll(() => requests).toBe(4)
  await expect(page.locator('.image-resolution')).toContainText('Checked 1 of 1')
})

test('price-driven filtering does not cascade into a whole-collection lookup', async ({ page }) => {
  let requests = 0
  let release = false
  await page.route('https://api.scryfall.com/**', async route => {
    requests++
    const number = new URL(route.request().url()).pathname.split('/')[3]
    await route.fulfill({ json: { ...syntheticPricedResponse(), collector_number: number, prices: release ? syntheticPricedResponse().prices : {} } })
  })
  const rows = Array.from({ length: 25 }, (_, index) => {
    const row = [...syntheticRow]; row[2] = `Card ${String(index).padStart(2, '0')}`; row[9] = String(index); return row
  })
  await importRows(page, rows)
  await expect(page.locator('.image-resolution')).toContainText('Checked 8 of 8')
  await expect(page.getByRole('region', { name: 'Collection pricing' }).getByRole('heading')).toContainText('Unavailable')
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByLabel('Price coverage').selectOption('missing')
  await page.getByRole('button', { name: /^Apply/ }).click()
  release = true
  await page.getByRole('button', { name: 'Refresh visible estimates' }).click()
  await expect(page.locator('.image-resolution')).toContainText('Checked 8 of 8')
  await expect(page.locator('.result-summary')).toContainText('17 entries')
  expect(requests).toBe(16)
  await page.getByRole('button', { name: 'Gallery view' }).click()
  expect(requests).toBe(16)
})

async function measureWidth(element: Locator, parent: Locator, fraction: number, maxWidth = Infinity) {
  const content = await parent.evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    const left = parseFloat(style.paddingLeft), right = parseFloat(style.paddingRight)
    return { width: rect.width - left - right, center: rect.x + left + (rect.width - left - right) / 2 }
  })
  const bounds = (await element.boundingBox())!
  expect(bounds.width).toBeCloseTo(Math.min(content.width * fraction, maxWidth), 1)
  expect(bounds.x + bounds.width / 2).toBeCloseTo(content.center, 0)
  expect(bounds.width).toBeLessThanOrEqual(content.width)
  return { available: Number(content.width.toFixed(2)), actual: Number(bounds.width.toFixed(2)) }
}

async function measureImage(image: Locator, parent: Locator, fraction = 1, maxWidth = Infinity) {
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320)
  const measurement = await measureWidth(image, parent, fraction, maxWidth)
  const bounds = (await image.boundingBox())!
  expect(bounds.width / bounds.height).toBeCloseTo(320 / 600, 3)
  await expect(image).toHaveCSS('object-fit', 'contain')
  await expect(image).toHaveAccessibleName(/face, TST #PCY-1, Korean/)
  return measurement
}

test('gallery sizing is image-first with larger cards while details have no card images', async ({ page }) => {
  await page.route('https://api.scryfall.com/cards/tst/missing/**', route => route.fulfill({ status: 404, json: { object: 'error', status: 404, details: 'Synthetic missing image' } }))
  const missingRow = [...syntheticRow]
  missingRow[2] = 'Z Missing image'
  missingRow[9] = 'missing'
  await importRows(page, [syntheticRow, missingRow])
  const widths = test.info().project.name === 'desktop' ? [1024, 1440, 1920, 2560]
    : test.info().project.name === 'mobile' ? [320, 390] : [page.viewportSize()!.width]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 })
    await expectWorkspaceWidth(page)
    const thumbnail = page.locator('.table-card-image img, .mini-art img').filter({ visible: true }).first()
    await expect(thumbnail).toBeVisible()
    expect((await thumbnail.boundingBox())!.width).toBeCloseTo(42, 0)
    await page.getByRole('button', { name: 'Gallery view' }).click()
    const imageWell = page.locator('.collection-grid .tile-image').filter({ has: page.locator('img') })
    const gallery = await measureImage(imageWell.locator('img'), imageWell)
    const expectedWidth = width < 768 ? Math.min((width - 28) / 2, 240) : 240
    expect(gallery.actual).toBeCloseTo(expectedWidth, 1)
    await measureWidth(imageWell.locator('.full-card'), imageWell, 1)
    await expect(page.locator('.card-tile').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.locator('.card-tile').first()).toHaveCSS('border-top-width', '0px')
    const placeholder = page.locator('.collection-grid .card-image-placeholder')
    await expect(placeholder).toContainText('Exact card image unavailable')
    const missing = await measureWidth(placeholder, placeholder.locator('..'), 1)
    expect(missing.actual).toBeCloseTo(expectedWidth, 1)
    await expect(imageWell).toContainText('Example Artist A')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: /Show back face of/ }).click()
    await measureImage(imageWell.locator('img'), imageWell)
    await expect(imageWell).toContainText('Example Artist B')
    await imageWell.locator('.card-image-link').click()
    await expect(page.locator('.detail-image, .full-card-image')).toHaveCount(0)
    await measureWidth(page.locator('.detail-content'), page.locator('.detail-layout'), 1)
    await expect(page.getByRole('region', { name: 'Finish price comparison' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Back to collection', exact: true }).click()
    await page.locator('.card-tile').filter({ hasText: 'Z Missing image' }).locator('.card-image-link').click()
    await expect(page.locator('.detail-image, .card-image-placeholder, .full-card-image')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    console.log(JSON.stringify({ viewport: width, gallery, missing, detailImages: 0, thumbnail: 42 }))
    await page.getByRole('link', { name: 'Back to collection', exact: true }).click()
    await page.getByRole('button', { name: 'Table view' }).click()
  }
})
