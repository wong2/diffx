import { test, expect, type Locator } from '@playwright/test'

/** Finds the first diff card that renders at least `min` gutter line numbers,
 * scrolling each into view first so the row virtualizer materialises them. */
async function cardWithLines(page: import('@playwright/test').Page, min: number): Promise<Locator> {
  const cards = page.locator('.file-diff-card')
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    await card.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(250)
    if ((await card.locator('[data-column-number]').count()) >= min) return card
  }
  throw new Error(`no diff card with >= ${min} lines`)
}

test.describe('diff line comments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('.file-diff-card').first().waitFor()
  })

  test('press-drag on the + button comments a multi-line range, opening only on release', async ({ page }) => {
    const card = await cardWithLines(page, 6)
    const gutter = card.locator('[data-column-number]')

    // Reveal the + on an early line, then grab it and a line further down.
    await gutter.nth(1).hover()
    const addBtn = card.locator('.gutter-add-btn').first()
    await expect(addBtn).toBeVisible()

    const start = await addBtn.boundingBox()
    const end = await gutter.nth(5).boundingBox()
    if (!start || !end) throw new Error('missing bounding boxes')

    // Real mouse press-drag-release across the gutter.
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    expect(await card.locator('.comment-form').count(), 'composer must not open on press').toBe(0)
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 })
    expect(await card.locator('.comment-form').count(), 'composer must not open mid-drag').toBe(0)
    await page.mouse.up()

    // Only now does it open, anchored to the full multi-line range.
    const header = card.locator('.comment-form-header')
    await expect(header).toBeVisible()
    await expect(header).toContainText(/lines\s+\w+\s+to\s+\w+/i)
  })

  test('a plain click on the + comments a single line', async ({ page }) => {
    const card = await cardWithLines(page, 4)
    await card.locator('[data-column-number]').nth(1).hover()
    const addBtn = card.locator('.gutter-add-btn').first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()
    await expect(card.locator('.comment-form-header')).toContainText(/on line\s+\w+$/i)
  })
})
