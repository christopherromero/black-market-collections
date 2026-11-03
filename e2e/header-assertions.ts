import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function expectWorkspaceWidth(page: Page) {
  const width = page.viewportSize()!.width
  const gutter = width < 768 ? 8 : 12
  const sidebar = width > 960 ? (await page.locator('.sidebar').boundingBox())! : null
  const contentLeft = sidebar ? sidebar.x + sidebar.width : 0
  const bounds = (await page.locator('.collection-header').boundingBox())!
  expect(bounds.x - contentLeft).toBeCloseTo(gutter, 0)
  expect(width - bounds.x - bounds.width).toBeCloseTo(gutter, 0)
  expect(bounds.width).toBeCloseTo(width - contentLeft - gutter * 2, 0)
  await expect(page.locator('.app-main')).toHaveCSS('max-width', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

export async function expectSourceInHeader(page: Page, source: 'demo' | 'moxfield') {
  const header = page.locator('.collection-header')
  await expectWorkspaceWidth(page)
  const notice = header.locator('.sample-notice')
  await expect(page.locator('.sample-notice')).toHaveCount(1)
  await expect(page.locator('.app-main > .sample-notice')).toHaveCount(0)
  await expect(notice).toHaveCount(1)
  await expect(notice.locator('.badge')).toHaveText(source === 'demo' ? 'Sample data' : 'Local collection')
  await expect(notice.locator('p')).toHaveText(source === 'demo'
    ? 'Temporary demo · fictional cards and prices · any saved import is unchanged.'
    : 'Moxfield import · browser-only storage · Scryfall USD reference estimates.')
  await expect(notice.getByRole('link', { name: 'Exit demo' })).toHaveCount(source === 'demo' ? 1 : 0)
  await expect(notice.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/about')
  await expect(header.locator('[aria-hidden="true"] .sample-notice')).toHaveCount(0)
  await expect(notice).toHaveCSS('border-bottom-width', '0px')
  await expect(page.getByRole('heading', { name: 'My collection', level: 1 })).toHaveCount(1)
  await expect(header.locator('h1')).toHaveCSS('color', 'rgb(232, 242, 241)')
  expect(await header.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(26)
  await page.evaluate(() => document.fonts.ready)

  const bounds = (await header.boundingBox())!
  // Content-sized, not fixed-height: leave room for wrapped disclosures, not a second hero.
  expect(bounds.height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 768 ? 120 : 160)
  expect(bounds.height).toBeLessThanOrEqual(page.viewportSize()!.width < 768 ? 260 : 220)
  const boxes = []
  for (const element of await header.locator('h1, .eyebrow, .badge, .sample-notice p, a').all()) {
    await expect(element).toBeInViewport({ ratio: 1 })
    const box = (await element.boundingBox())!
    // Include breathing room for the visible keyboard focus ring.
    expect(box.x).toBeGreaterThanOrEqual(bounds.x + 6)
    expect(box.y).toBeGreaterThanOrEqual(bounds.y + 6)
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width - 6)
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height - 6)
    for (const previous of boxes) {
      expect(box.x >= previous.x + previous.width || previous.x >= box.x + box.width
        || box.y >= previous.y + previous.height || previous.y >= box.y + box.height).toBe(true)
    }
    boxes.push(box)
  }
  // Tab through real links in DOM order; the decorative gradient must not catch clicks.
  await header.getByRole('link', { name: 'Import collection', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  for (const [index, link] of (await header.getByRole('link').all()).entries()) {
    if (index) await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    await expect(link).toHaveCSS('outline-style', 'solid')
    await expect(link).toHaveCSS('outline-width', '2px')
    const box = (await link.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await link.click({ trial: true })
  }
  await expect(page.getByRole('searchbox', { name: 'Search cards or rules' })).toBeInViewport({ ratio: 1 })
  const firstCard = page.locator('.collection-table .card-name, .mobile-card-row').filter({ visible: true }).first()
  if (source === 'moxfield' && page.viewportSize()!.width < 768) {
    // The full image/privacy disclosure leaves only the first card's name above the mobile fold.
    await expect(page.getByRole('region', { name: 'External card images' })).toBeInViewport({ ratio: 1 })
    await expect(firstCard).toBeInViewport()
    await expect(firstCard.locator('strong')).toBeInViewport({ ratio: 1 })
  } else await expect(firstCard).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
