import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { syntheticCsv, syntheticResponse, syntheticRow } from '../src/test-fixtures'
import { expectSourceInHeader } from './header-assertions'

// Never use the live provider, even in tests focused on import/storage behavior.
test.beforeEach(async ({ page }) => {
  await page.route('https://api.scryfall.com/**', route => route.fulfill({ status: 404, body: '' }))
  await page.route('https://cards.scryfall.io/**', route => route.abort())
})

async function chooseCsv(page: Page, csv = syntheticCsv()) {
  await page.getByLabel('Moxfield export').setInputFiles({ name: 'synthetic-collection.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + csv) })
}
async function importSynthetic(page: Page) {
  await page.goto('/import')
  await chooseCsv(page)
  await page.getByRole('button', { name: 'Replace collection with 1 entry' }).click()
  await expect(page.getByText('Collection saved locally.')).toBeVisible()
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
}

test('local source disclosure is inside both collection URLs and standalone on other routes', async ({ page }, testInfo) => {
  await page.route('https://api.scryfall.com/**', route => route.fulfill({ json: syntheticResponse() }))
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/><text x="10" y="580" fill="white">Synthetic test credit</text></svg>' }))
  await importSynthetic(page)
  for (const path of ['/collection', '/collection/']) {
    await page.goto(path)
    await expect(page.getByRole('region', { name: 'External card images' })).toContainText('Checked 1 of 1')
    await page.screenshot({ path: testInfo.outputPath('header-local.png') })
    await expectSourceInHeader(page, 'moxfield')
    await expect(page.locator('.result-summary')).toContainText('1 entry / 2 copies')
  }
  await page.screenshot({ path: testInfo.outputPath('header-local.png') })
  await page.keyboard.press('Enter') // Keyboard activation of Details.
  await expect(page.getByRole('heading', { name: 'About this collection' })).toBeVisible()
  for (const path of ['/about', '/decks', '/import']) {
    await page.goto(path)
    await expect(page.locator('.sample-notice')).toHaveCount(1)
    await expect(page.locator('.app-main > .sample-notice .badge')).toHaveText('Local collection')
    await expect(page.locator('.sample-notice p')).toHaveText('Moxfield import · browser-only storage · Scryfall USD reference estimates.')
    await expect(page.locator('.sample-notice a')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.goto('/collection')
  await page.locator('.collection-header').getByRole('link', { name: 'Import collection' }).click()
  await expect(page.getByLabel('Moxfield export')).toBeVisible()
  await page.getByRole('link', { name: 'Back to collection', exact: true }).click()
  const firstCard = page.locator('.collection-table .card-name, .mobile-card-row').filter({ visible: true }).first()
  await firstCard.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect(firstCard).toBeInViewport({ ratio: 1 })
  await firstCard.click()
  await expect(page.locator('.app-main > .sample-notice .badge')).toHaveText('Local collection')
  await expect(page.getByRole('heading', { name: 'Example, "Mapkeeper"', exact: true })).toBeVisible()
})

test('fresh import preview, explicit replacement, consistency, export, persistence and confirmed clear', async ({ page }) => {
  const external: string[] = []
  await page.route(/https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, async route => {
    external.push(route.request().url())
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('/collection')
  await expect(page.getByRole('heading', { name: 'Your collection is empty' })).toBeVisible()
  await page.getByRole('link', { name: 'Import collection', exact: true }).click()
  const second = [...syntheticRow]; second[0] = '3'; second[2] = 'Second Synthetic Example'; second[3] = 'PLST'; second[6] = ''
  await chooseCsv(page, syntheticCsv([syntheticRow, second]))
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('2 entries / 5 copies')
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('Entries are saved records, not unique names')
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('1 entry can hold 4 copies')
  await expect(page.locator('.sample-notice')).toHaveCount(0)
  expect(external).toEqual([])
  await page.getByRole('button', { name: 'Replace collection with 2 entries' }).click()
  await expect(page.locator('.sample-notice .badge')).toHaveText('Local collection')
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
  await expect(page.locator('.result-summary')).toContainText('2 entries / 5 copies')
  await expect(page.locator('main')).not.toContainText('Aetherwell')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('searchbox').fill('Mapkeeper')
  await expect(page.locator('.result-summary')).toContainText('1 entry / 2 copies')
  await page.getByText('More options', { exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export 1 entry' }).click()
  const stream = await (await downloadPromise).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const csv = Buffer.concat(chunks).toString('utf8')
  expect(csv).toContain('"PCY-1"')
  expect(csv).toContain('"Korean"')
  expect(csv).toContain('"7.2500"')
  expect(csv).toMatch(/,"",""$/)
  await page.getByRole('button', { name: 'Gallery view' }).click()
  await expect(page.locator('.card-tile')).toHaveCount(1)
  await page.locator('.card-image-link').click()
  await expect(page.locator('.detail-summary')).toContainText('Mana value unknown')
  await expect(page.getByRole('tabpanel')).toContainText('Moderately Played / Korean')
  await expect(page.getByRole('tabpanel')).toContainText('kept, locally')
  await page.getByRole('tab', { name: 'Price history' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Captured price history')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.goto('/decks')
  await expect(page.getByRole('heading', { name: 'No decks imported' })).toBeVisible()
  await page.goto('/collection')
  await page.reload()
  await expect(page.locator('.result-summary')).toContainText('2 entries / 5 copies')
  await page.getByRole('button', { name: /^Filters/ }).click()
  const binder = page.getByRole('dialog', { name: 'Advanced filters' }).getByRole('combobox', { name: 'Binder', exact: true })
  await expect(binder).toContainText('Unassigned (Moxfield)')
  await expect(binder).not.toContainText('Main binder')
  await page.keyboard.press('Escape')
  await page.goto('/import')
  await chooseCsv(page, 'invalid,csv\r\n1,2')
  await expect(page.getByRole('alert')).toContainText('Required header is missing')
  await expect(page.getByRole('button', { name: /Replace collection/ })).toHaveCount(0)
  await page.goto('/collection')
  await expect(page.locator('.result-summary')).toContainText('2 entries / 5 copies')
  expect(external.length).toBeGreaterThan(0)
  expect(external.every(url => /^https:\/\/api\.scryfall\.com\/cards\/(tst|plst)\/PCY-1\/ko$/.test(url))).toBe(true)
  await page.goto('/import')
  await page.getByText('Demo & saved collection', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Clear saved collection' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /I understand/ }).check()
  await page.getByRole('button', { name: 'Clear saved collection' }).click()
  await page.goto('/collection')
  await expect(page.locator('.sample-notice')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your collection is empty' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))).toBeNull()
})

test('automatic exact images and both faces stay in the gallery, with retries and image-free details', async ({ page }) => {
  const requests: string[] = []
  await page.route('https://api.scryfall.com/**', async route => {
    requests.push(route.request().url())
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ json: syntheticResponse() })
  })
  let failBack = true
  await page.route('https://cards.scryfall.io/**', async route => {
    if (failBack && route.request().url().includes('/back/')) { await route.abort(); return }
    // Original synthetic SVG deliberately has a nonstandard ratio to detect stretching/cropping.
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/><rect x="2" y="2" width="316" height="596" fill="none" stroke="white"/><text x="10" y="580" fill="white">Synthetic test credit</text></svg>' })
  })
  await importSynthetic(page)
  await expect(page.getByRole('region', { name: 'External card images' })).toContainText('Checked 1 of 1')
  expect(requests).toEqual(['https://api.scryfall.com/cards/tst/PCY-1/ko'])
  const thumb = page.locator('.collection-table img, .mobile-card-list img').filter({ visible: true }).first()
  await expect(thumb).toHaveAttribute('loading', 'lazy')
  await expect(thumb).toHaveAttribute('src', /\/normal\/front\//)
  await page.getByRole('button', { name: 'Gallery view' }).click()
  const gallery = page.locator('.collection-grid img')
  await expect(gallery).toBeVisible()
  await expect(gallery).toHaveCSS('object-fit', 'contain')
  await expect.poll(async () => gallery.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320)
  const bounds = await gallery.boundingBox()
  expect(bounds!.width / bounds!.height).toBeCloseTo(320 / 600, 2)
  await expect(page.locator('.copy-badge, .card-art-window')).toHaveCount(0)
  await expect(gallery).toHaveAccessibleName(/front face, TST #PCY-1, Korean/)
  await expect(page.locator('.card-tile')).toContainText('Example Artist A')
  await page.getByRole('button', { name: /Show back face of/ }).click()
  await expect(page.getByText('Image failed to load.')).toBeVisible()
  failBack = false
  await page.getByRole('button', { name: 'Retry image' }).click()
  await expect(gallery).toHaveAttribute('src', /\/normal\/back\//)
  await expect(gallery).toHaveAccessibleName(/Example Gate — back face/)
  await expect(page.locator('.card-tile')).toContainText('Example Artist B')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: /^(Enable|Disable) external images$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel resolution' })).toHaveCount(0)
  await page.locator('.card-image-link').click()
  await expect(page.locator('.detail-layout')).toBeVisible()
  await expect(page.locator('.detail-image, .full-card-image')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Card info' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Example Artist A')
  await expect(page.getByRole('tabpanel')).toContainText('Example Artist B')
  await expect(page.getByRole('button', { name: /^(Enable|Disable) external images$/ })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.detail-layout')).toBeVisible()
  await expect(page.locator('.detail-image, .full-card-image')).toHaveCount(0)
  expect(requests).toHaveLength(1)
})

test('only active pages and an uncached detail resolve automatically; reload reuses completed metadata', async ({ page }) => {
  const requests: string[] = []
  await page.route('https://api.scryfall.com/**', async route => {
    const number = new URL(route.request().url()).pathname.split('/')[3]
    requests.push(number)
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ json: { ...syntheticResponse(), collector_number: number } })
  })
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/></svg>',
  }))
  const rows = Array.from({ length: 19 }, (_, index) => {
    const row = [...syntheticRow]
    row[2] = `Synthetic ${String(index).padStart(2, '0')}`; row[9] = String(index)
    return row
  })
  await page.goto('/import')
  await chooseCsv(page, syntheticCsv(rows))
  await page.getByRole('button', { name: 'Replace collection with 19 entries' }).click()
  expect(requests).toEqual([])
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
  const progress = page.getByRole('region', { name: 'External card images' })
  await expect(progress).toContainText('Checked 8 of 8')
  expect(requests).toEqual(Array.from({ length: 8 }, (_, i) => String(i)))
  await page.getByRole('button', { name: 'Gallery view' }).click()
  await expect(page.locator('.collection-grid img')).toHaveCount(8)
  await expect.poll(() => page.locator('.collection-grid img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.locator('.pagination')).toContainText('9-16 of 19')
  await expect.poll(() => requests.length).toBe(16)
  await expect(page.locator('.collection-grid img')).toHaveCount(8)
  expect(requests).toEqual(Array.from({ length: 16 }, (_, i) => String(i)))
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page.locator('.pagination')).toContainText('1-8 of 19')
  await expect(progress).toContainText('Checked 8 of 8')
  expect(requests).toHaveLength(16)
  // Direct route to a printing not on either visited page must resolve just it.
  await page.goto('/cards/moxfield-20')
  await expect(progress).toContainText('Checked 1 of 1')
  await expect(page.locator('.detail-image, .full-card-image')).toHaveCount(0)
  expect(requests).toEqual([...Array.from({ length: 16 }, (_, i) => String(i)), '18'])
  await page.reload()
  await expect(page.locator('.detail-layout')).toBeVisible()
  await expect(progress).toContainText('Checked 1 of 1')
  expect(requests).toHaveLength(17)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('each next page loads its images automatically after a previous page failed', async ({ page }) => {
  const requests: string[] = []
  await page.route('https://api.scryfall.com/**', async route => {
    const number = new URL(route.request().url()).pathname.split('/')[3]
    requests.push(number)
    if (number === '0') await route.fulfill({ status: 503, body: '' })
    else await route.fulfill({ json: { ...syntheticResponse(), collector_number: number } })
  })
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/></svg>',
  }))
  const rows = Array.from({ length: 19 }, (_, index) => {
    const row = [...syntheticRow]
    row[2] = `Synthetic ${String(index).padStart(2, '0')}`; row[9] = String(index)
    return row
  })
  await page.goto('/import')
  await chooseCsv(page, syntheticCsv(rows))
  await page.getByRole('button', { name: 'Replace collection with 19 entries' }).click()
  await page.getByRole('link', { name: 'Browse collection', exact: true }).click()
  await expect(page.getByText('Scryfall request failed (HTTP 503). Retry later.', { exact: false })).toBeVisible()
  expect(requests).toEqual(['0'])
  await page.getByRole('button', { name: 'Gallery view' }).click()
  for (const [pageNumber, count] of [[1, 8], [2, 3]]) {
    await page.getByRole('button', { name: 'Next page' }).click()
    const start = pageNumber * 8
    await expect(page.locator('.pagination')).toContainText(`${start + 1}-${start + count} of 19`)
    await expect(page.getByRole('region', { name: 'External card images' })).toContainText(`Checked ${count} of ${count} visible printings; 0 failed`)
    const images = page.locator('.collection-grid img')
    await expect(images).toHaveCount(count)
    await expect.poll(() => images.first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320)
    await expect(images.first()).toHaveCSS('object-fit', 'contain')
  }
  expect(requests).toEqual(['0', ...Array.from({ length: 11 }, (_, i) => String(i + 8))])
})

test('rate-limit errors pause automatic resolution until manual retry and obey cooldown', async ({ page }) => {
  let requests = 0
  await page.clock.install()
  await page.route('https://api.scryfall.com/**', async route => {
    requests++
    if (requests === 1) await route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, body: '' })
    else await route.fulfill({ json: syntheticResponse() })
  })
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="600"><rect width="320" height="600" fill="#204b45"/></svg>',
  }))
  await importSynthetic(page)
  await expect(page.getByText(/Scryfall rate limit reached/)).toBeVisible()
  await page.getByRole('button', { name: 'Retry / resume visible images' }).click()
  await expect(page.getByText(/wait at least 30 seconds before retrying/)).toBeVisible()
  expect(requests).toBe(1)
  await page.clock.fastForward(61000)
  expect(requests).toBe(1)
  await page.getByRole('button', { name: 'Retry / resume visible images' }).click()
  await expect(page.getByRole('region', { name: 'External card images' })).toContainText('Checked 1 of 1 visible printings; 0 failed')
  await page.getByRole('button', { name: 'Gallery view' }).click()
  await expect(page.locator('.collection-grid img')).toBeVisible()
  expect(requests).toBe(2)
})

test('storage quota failures leave startup empty with an actionable message', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'bmc:local:moxfield:v1') throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/import')
  await chooseCsv(page)
  await page.getByRole('button', { name: 'Replace collection with 1 entry' }).click()
  await expect(page.getByRole('alert')).toContainText('Replacement failed')
  await expect(page.locator('.sample-notice')).toHaveCount(0)
  await page.goto('/collection')
  await expect(page.getByRole('heading', { name: 'Your collection is empty' })).toBeVisible()
})

test('demo entry and exit preserve an import, reload restores it, and failed clear is non-destructive', async ({ page }) => {
  await importSynthetic(page)
  const original = await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))
  await page.getByRole('link', { name: 'Import collection', exact: true }).click()
  await page.getByText('Demo & saved collection', { exact: true }).click()
  await page.getByRole('button', { name: 'Try demo', exact: true }).click()
  await expect(page.locator('.sample-notice .badge')).toHaveText('Sample data')
  expect(await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))).toBe(original)
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click()
  await page.getByRole('link', { name: 'Back to collection', exact: true }).click()
  await expect(page.locator('.result-summary')).toContainText('1 entry / 2 copies')
  await page.getByRole('link', { name: 'Import collection', exact: true }).click()
  await page.getByText('Demo & saved collection', { exact: true }).click()
  await page.getByRole('button', { name: 'Try demo', exact: true }).click()
  await page.reload()
  await expect(page.locator('.sample-notice .badge')).toHaveText('Local collection')
  await page.getByText('Demo & saved collection', { exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))).toBe(original)
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem
    Storage.prototype.removeItem = function(key) {
      if (key === 'bmc:local:moxfield:v1') throw new DOMException('Denied', 'SecurityError')
      return remove.call(this, key)
    }
  })
  await expect(page.getByRole('button', { name: 'Clear saved collection' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /I understand/ }).check()
  await page.getByRole('button', { name: 'Clear saved collection' }).click()
  await expect(page.getByRole('alert')).toContainText('Clear failed')
  await expect(page.locator('.sample-notice .badge')).toHaveText('Local collection')
  expect(await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))).toBe(original)
})

test('unreadable saved snapshots stay intact while the UI stays empty', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bmc:local:moxfield:v1', '{synthetic-invalid-json'))
  await page.goto('/collection')
  await expect(page.getByRole('heading', { name: 'Your collection is empty' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('stored collection has not been deleted')
  await expect(page.locator('.sample-notice, .card-name')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('bmc:local:moxfield:v1'))).toBe('{synthetic-invalid-json')
})
