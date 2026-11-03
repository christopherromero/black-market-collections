import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { syntheticCsv, syntheticPricedResponse, syntheticRow } from '../src/test-fixtures'

const numbers = ['10', '2', '136a', '44', '3']
const rows = Array.from({ length: 10 }, (_, index) => {
  const row = [...syntheticRow]
  row[0] = '1'; row[2] = `Card ${String(index).padStart(2, '0')}`; row[3] = index < 5 ? 'aaa' : 'bbb'
  row[5] = 'English'; row[6] = ''; row[9] = numbers[index % 5]
  return row
})

async function setup(page: Page) {
  let unitPrice = '2.00'
  let setRequests = 0
  const batches: { set: string; collector_number: string }[][] = []
  const catalog = (set: string, number: string) => ({
    ...syntheticPricedResponse(), set, collector_number: number, lang: 'en',
    scryfall_uri: `https://scryfall.com/card/${set}/${number}/en/example`,
    prices: { usd: set === 'bbb' && number === '3' ? null : unitPrice, usd_foil: '4.00', usd_etched: null },
  })
  await page.route('https://api.scryfall.com/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/sets') {
      setRequests++
      await route.fulfill({ json: { object: 'list', data: [
        { object: 'set', code: 'aaa', name: 'Alpha Archive', released_at: '2020-01-01' },
        { object: 'set', code: 'bbb', name: 'Beta Bazaar', released_at: '2025-01-01' },
      ], has_more: false } })
    } else if (url.pathname === '/cards/collection') {
      const body: { identifiers: { set: string; collector_number: string }[] } = route.request().postDataJSON()
      expect(Object.keys(body)).toEqual(['identifiers'])
      for (const identifier of body.identifiers) expect(Object.keys(identifier).sort()).toEqual(['collector_number', 'set'])
      batches.push(body.identifiers)
      await route.fulfill({ json: { object: 'list', data: body.identifiers.map(item => catalog(item.set, item.collector_number)).reverse(), not_found: [] } })
    } else {
      const [, , set, number, language] = url.pathname.split('/')
      expect(language).toBe('en')
      await route.fulfill({ json: catalog(set, decodeURIComponent(number)) })
    }
  })
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/></svg>',
  }))
  await page.goto('/import')
  await page.getByLabel('Moxfield export').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(syntheticCsv(rows)) })
  await page.getByRole('button', { name: 'Replace collection with 10 entries' }).click()
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
  await expect(page.getByRole('region', { name: 'External card images' })).toContainText('Checked 8 of 8')
  return { batches, changePrice: (price: string) => { unitPrice = price }, setRequests: () => setRequests }
}

test('whole-collection prices include off-page cards and persist real finish-specific history', async ({ page }) => {
  const api = await setup(page)
  const pricing = page.getByRole('region', { name: 'Collection pricing' })
  await expect(pricing).toContainText('8 of 10 copies priced')
  await pricing.getByRole('button', { name: 'Update all prices' }).click()
  await expect(pricing).toContainText('Checked 10 of 10 printings')
  await expect(pricing.getByRole('button', { name: 'Update all prices' })).toBeEnabled()
  await expect(pricing).toContainText('9 of 10 copies priced')
  await expect(pricing.getByRole('heading')).toContainText('$18.00')
  expect(api.batches[0]).toHaveLength(10)

  await page.getByRole('button', { name: /^Sets/ }).click()
  const sets = page.getByRole('dialog', { name: 'Choose sets' })
  await sets.getByRole('checkbox', { name: /Alpha Archive/ }).check()
  await sets.getByRole('button', { name: 'Apply sets' }).click()
  await expect(page.locator('.result-summary')).toContainText('5 entries')
  api.changePrice('4.00')
  await pricing.getByRole('button', { name: 'Update all prices' }).click()
  await expect(pricing.getByRole('button', { name: 'Update all prices' })).toBeEnabled()
  await expect(pricing.getByRole('heading')).toContainText('$36.00')
  expect(api.batches.at(-1)).toHaveLength(10)
  await expect(pricing).not.toContainText('could not be saved')

  await page.goto('/cards/moxfield-2')
  await expect(page.locator('.detail-layout')).toBeVisible()
  await expect(page.locator('.detail-image, .full-card-image')).toHaveCount(0)
  const comparison = page.getByRole('region', { name: 'Finish price comparison' })
  await expect(comparison.locator('dl > div').nth(0)).toContainText('$4.00')
  await expect(comparison.locator('dl > div').nth(1)).toContainText('$4.00')
  await expect(comparison.locator('dl > div').nth(2)).toContainText('Unavailable')
  await expect(comparison).toContainText('fresh (under 24h)')
  await page.getByRole('tab', { name: 'Price history' }).click()
  const history = page.getByRole('region', { name: 'Captured price history' })
  await expect(history).toContainText('Captured change: +$2.00 (+100.0%)')
  await history.getByRole('combobox', { name: 'History finish' }).selectOption('Etched')
  await expect(history).toContainText('Change unavailable')
  await page.reload()
  await page.getByRole('tab', { name: 'Price history' }).click()
  await expect(page.getByRole('region', { name: 'Captured price history' })).toContainText('Captured change: +$2.00 (+100.0%)')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Finish price comparison' }).locator('dl > div').first()).toContainText('$4.00')
})

test('set inclusion, exclusion, natural collector sorting and release-date grouping combine', async ({ page }) => {
  const api = await setup(page)
  if (page.viewportSize()!.width >= 768) {
    await page.getByRole('columnheader', { name: 'Set', exact: true }).getByRole('button').click()
    await expect.poll(api.setRequests).toBe(1)
  }
  await page.getByRole('button', { name: /^Sets/ }).click()
  const sets = page.getByRole('dialog', { name: 'Choose sets' })
  await sets.getByRole('checkbox', { name: /Alpha Archive/ }).check()
  await sets.getByRole('button', { name: 'Sort set / collector' }).click()
  await sets.getByRole('button', { name: 'Apply sets' }).click()
  await page.getByRole('button', { name: 'Gallery view' }).click()
  await expect(page.locator('.card-tile')).toHaveCount(5)
  expect(await page.locator('.gallery-card-actions a').allTextContents()).toEqual(numbers.slice().sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(number => `AAA #${number} · English`))
  await page.getByRole('searchbox', { name: 'Search cards or rules' }).fill('Card 00')
  await expect(page.locator('.result-summary')).toContainText('1 entry')
  await page.getByRole('searchbox', { name: 'Search cards or rules' }).fill('')

  await page.getByRole('button', { name: /^Sets/ }).click()
  await sets.getByRole('combobox', { name: 'Selected sets' }).selectOption('exclude')
  await sets.getByRole('button', { name: 'Apply sets' }).click()
  await expect(page.locator('.card-tile')).toHaveCount(5)
  for (const text of await page.locator('.gallery-card-actions a').allTextContents()) expect(text).toContain('BBB #')

  await page.getByRole('button', { name: /^Sets/ }).click()
  await sets.getByRole('button', { name: 'Clear set choices' }).click()
  await sets.getByRole('button', { name: 'Newest sets first' }).click()
  await sets.getByRole('button', { name: 'Apply sets' }).click()
  await page.getByRole('checkbox', { name: 'Group gallery by set' }).check()
  await expect(page.locator('.gallery-set-heading').first()).toContainText('Beta Bazaar')
  await expect(page.locator('.gallery-set-heading').first()).toContainText('2025-01-01')
  await expect(page.locator('.card-tile')).toHaveCount(8)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.locator('.gallery-set-heading').first()).toContainText('Alpha Archive')
  await expect(page.locator('.card-tile')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
