import { test, expect, type Locator, type Page, type APIRequestContext } from '@playwright/test'

/** Finds the first diff card that renders at least `min` gutter line numbers,
 * scrolling each into view first so the row virtualizer materialises them. */
async function cardWithLines(page: Page, min: number): Promise<Locator> {
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

/** Deletes every comment from the in-memory store so tests stay independent. */
async function clearAllComments(request: APIRequestContext): Promise<void> {
  const all = await (await request.get('/api/comments')).json()
  for (const c of all) await request.delete(`/api/comments/${c.id}`)
}

/** Reveals the gutter + button on an early line of `card` and returns it.
 * The button is only shown while the row is hovered, so we keep re-hovering
 * until the button becomes visible (avoids mouse-move race in headless mode). */
async function revealAddButton(card: Locator, page: Page): Promise<Locator> {
  const lineCell = card.locator('[data-column-number]').nth(1)
  const addBtn = card.locator('.gutter-add-btn').first()
  await expect(async () => {
    await lineCell.hover()
    await expect(addBtn).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
  return addBtn
}

const MD_FILE = 'ARCHITECTURE.md'
const mdCard = (page: Page) => page.locator(`[id="file-${MD_FILE}"]`)

/** Scrolls the markdown card into view and switches it to Rendered mode.
 * Retries scroll+check because the virtualizer may not render the card's
 * header buttons immediately after the initial scroll. */
async function openRendered(page: Page): Promise<Locator> {
  await page.locator('.file-diff-card').first().waitFor()
  const card = mdCard(page)
  const renderedBtn = card.getByRole('button', { name: 'Rendered' }).first()
  // Keep re-scrolling until the virtualizer renders the card header.
  await expect(async () => {
    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await expect(renderedBtn).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  // Use force to bypass actionability checks (sticky header may overlap the toggle).
  await renderedBtn.click({ force: true })
  await expect(card.locator('.rendered-markdown-view')).toBeVisible()
  await card.locator('.markdown-body').first().waitFor()
  return card
}

test.describe('diff line comments', () => {
  test.beforeEach(async ({ page, request }) => {
    await clearAllComments(request)
    await page.goto('/')
    await page.locator('.file-diff-card').first().waitFor()
  })

  test.afterEach(async ({ request }) => {
    await clearAllComments(request)
  })

  test('press-drag on the + button comments a multi-line range, opening only on release', async ({ page }) => {
    const card = await cardWithLines(page, 6)
    const gutter = card.locator('[data-column-number]')

    const addBtn = await revealAddButton(card, page)
    const start = await addBtn.boundingBox()
    const end = await gutter.nth(5).boundingBox()
    if (!start || !end) throw new Error('missing bounding boxes')

    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    expect(await card.locator('.comment-form').count(), 'composer must not open on press').toBe(0)
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 })
    expect(await card.locator('.comment-form').count(), 'composer must not open mid-drag').toBe(0)
    // The covered range highlights while dragging.
    expect(await card.locator('[data-selected-line]').count(), 'range highlights mid-drag').toBeGreaterThan(0)
    await page.mouse.up()

    const header = card.locator('.comment-form-header')
    await expect(header).toBeVisible()
    await expect(header).toContainText(/lines\s+[LR]\d+\s+to\s+[LR]\d+/i)
  })

  test('a plain click on the + comments a single line', async ({ page }) => {
    const card = await cardWithLines(page, 4)
    const addBtn = await revealAddButton(card, page)
    await addBtn.click()
    await expect(card.locator('.comment-form-header')).toContainText(/on line\s+[LR]\d+$/i)
  })

  test('submitting a single-line comment shows an inline bubble that persists after reload', async ({ page, request }) => {
    const body = 'inline diff comment e2e'
    const card = await cardWithLines(page, 4)
    const addBtn = await revealAddButton(card, page)
    await addBtn.click()

    const form = card.locator('.comment-form')
    const commentBtn = form.getByRole('button', { name: 'Comment' })
    // Comment button disabled with no text, enabled once typed.
    await expect(commentBtn).toBeDisabled()
    await form.locator('textarea').fill(body)
    await expect(commentBtn).toBeEnabled()
    await commentBtn.click()

    await expect(card.locator('.comment-bubble', { hasText: body })).toBeVisible()

    // Persisted server-side.
    const stored = await (await request.get('/api/comments')).json()
    expect(stored.some((c: { body: string }) => c.body === body)).toBe(true)

    // Survives a reload: still present in the API after reload.
    await page.reload()
    await page.locator('.file-diff-card').first().waitFor()
    const afterReload = await (await request.get('/api/comments')).json()
    expect(afterReload.some((c: { body: string }) => c.body === body)).toBe(true)
  })

  test('Cancel closes the composer without creating a comment', async ({ page, request }) => {
    const card = await cardWithLines(page, 4)
    const addBtn = await revealAddButton(card, page)
    await addBtn.click()
    await expect(card.locator('.comment-form')).toBeVisible()

    await card.locator('.comment-form').getByRole('button', { name: 'Cancel' }).click()
    expect(await card.locator('.comment-form').count()).toBe(0)
    expect((await (await request.get('/api/comments')).json()).length).toBe(0)
  })

  test('Escape closes the composer without creating a comment', async ({ page, request }) => {
    const card = await cardWithLines(page, 4)
    const addBtn = await revealAddButton(card, page)
    await addBtn.click()
    const textarea = card.locator('.comment-form textarea')
    await expect(textarea).toBeVisible()

    await textarea.press('Escape')
    expect(await card.locator('.comment-form').count()).toBe(0)
    expect((await (await request.get('/api/comments')).json()).length).toBe(0)
  })
})

test.describe('comment bubble actions (edit / resolve / delete)', () => {
  // Rendered comments live in the always-visible right margin (not virtualized
  // like diff rows), giving a stable target for hover-revealed bubble actions.
  async function seedRenderedComment(request: APIRequestContext, selectedText: string, body: string): Promise<string> {
    const res = await request.post('/api/comments', {
      data: {
        filePath: MD_FILE,
        anchorType: 'rendered',
        renderedAnchor: { selectedText, context: '', paragraphIndex: 1, startOffset: 0, endOffset: 0, sourceLine: 3 },
        body,
      },
    })
    return (await res.json()).id
  }

  test.beforeEach(async ({ request }) => {
    await clearAllComments(request)
  })

  test.afterEach(async ({ request }) => {
    await clearAllComments(request)
  })

  test('edit updates the body and persists via PUT', async ({ page, request }) => {
    const original = 'edit me original'
    const updated = 'edited body value'
    const id = await seedRenderedComment(request, 'local code review tool', original)

    await page.goto('/')
    const card = await openRendered(page)
    // The lone margin bubble; don't filter by body text since edit mode moves
    // the text into a textarea (no matchable text content while editing).
    const bubble = card.locator('.comment-margin .comment-bubble')
    await expect(bubble).toContainText(original)

    await bubble.hover()
    await bubble.locator('.comment-bubble-action[title="Edit comment"]').click()
    const editInput = bubble.locator('.comment-edit-input')
    await expect(editInput).toHaveValue(original)
    await editInput.fill(updated)
    await bubble.getByRole('button', { name: 'Save' }).click()

    await expect(card.locator('.comment-margin .comment-bubble', { hasText: updated })).toBeVisible()

    const stored = await (await request.get('/api/comments')).json()
    expect(stored.find((c: { id: string }) => c.id === id).body).toBe(updated)
  })

  test('resolve collapses to a summary and sets server status; unresolve restores it', async ({ page, request }) => {
    const body = 'resolve me e2e'
    const id = await seedRenderedComment(request, 'local code review tool', body)

    await page.goto('/')
    const card = await openRendered(page)
    const bubble = card.locator('.comment-margin .comment-bubble', { hasText: body })
    await bubble.hover()
    await bubble.locator('.comment-bubble-action[title="Resolve conversation"]').click()

    const summary = card.locator('.comment-resolved-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('Resolved')

    await expect
      .poll(async () => {
        const stored = await (await request.get('/api/comments')).json()
        return stored.find((c: { id: string }) => c.id === id).status
      })
      .toBe('resolved')

    await summary.getByRole('button', { name: 'Unresolve' }).click()
    await expect(card.locator('.comment-margin .comment-bubble-body', { hasText: body })).toBeVisible()

    await expect
      .poll(async () => {
        const stored = await (await request.get('/api/comments')).json()
        return stored.find((c: { id: string }) => c.id === id).status
      })
      .toBe('open')
  })

  test('delete removes the bubble and drops it from the API', async ({ page, request }) => {
    const body = 'delete me e2e'
    await seedRenderedComment(request, 'local code review tool', body)

    await page.goto('/')
    const card = await openRendered(page)
    const bubble = card.locator('.comment-margin .comment-bubble', { hasText: body })
    await bubble.hover()
    await bubble.locator('.comment-bubble-delete').click()

    await expect(card.locator('.comment-margin .comment-bubble', { hasText: body })).toHaveCount(0)
    expect((await (await request.get('/api/comments')).json()).length).toBe(0)
  })
})

test.describe('rendered markdown comments', () => {
  test.beforeEach(async ({ page, request }) => {
    await clearAllComments(request)
    await page.goto('/')
    await page.locator('.file-diff-card').first().waitFor()
  })

  test.afterEach(async ({ request }) => {
    await clearAllComments(request)
  })

  /** Seeds a rendered comment anchored to real rendered text in MD_FILE. */
  async function seedRenderedComment(request: APIRequestContext, selectedText: string, body: string): Promise<string> {
    const res = await request.post('/api/comments', {
      data: {
        filePath: MD_FILE,
        anchorType: 'rendered',
        renderedAnchor: { selectedText, context: '', paragraphIndex: 1, startOffset: 0, endOffset: 0, sourceLine: 3 },
        body,
      },
    })
    return (await res.json()).id
  }

  test('a rendered comment shows in the margin and paints a CSS highlight', async ({ page, request }) => {
    const body = 'rendered margin e2e'
    await seedRenderedComment(request, 'local code review tool', body)

    await page.goto('/')
    const card = await openRendered(page)

    await expect(card.locator('.comment-margin .comment-bubble', { hasText: body })).toBeVisible()

    const highlightSupported = await page.evaluate(() => typeof CSS !== 'undefined' && !!CSS.highlights)
    if (highlightSupported) {
      await expect
        .poll(async () => page.evaluate(() => CSS.highlights.get('comment')?.size ?? 0))
        .toBeGreaterThanOrEqual(1)
    }
  })

  test('mermaid renders exactly one svg and stays single after a rendered comment is added', async ({ page, request }) => {
    await page.goto('/')
    const card = await openRendered(page)

    const svg = card.locator('.mermaid-rendered svg')
    await expect(svg).toHaveCount(1)

    // No raw mermaid source leaks into the page.
    expect(await card.getByText('flowchart TD', { exact: false }).count()).toBe(0)

    // Adding a rendered comment (which repaints highlights) must not duplicate it.
    await seedRenderedComment(request, 'Hono server', 'comment near mermaid')
    await expect(card.locator('.comment-margin .comment-bubble', { hasText: 'comment near mermaid' })).toBeVisible()

    await expect(svg).toHaveCount(1)
    expect(await card.getByText('flowchart TD', { exact: false }).count()).toBe(0)
  })
})

test.describe('cross-view comments', () => {
  const body = 'cross-view sync e2e'

  test.beforeEach(async ({ page, request }) => {
    await clearAllComments(request)
    await page.goto('/')
    await page.locator('.file-diff-card').first().waitFor()
  })

  test.afterEach(async ({ request }) => {
    await clearAllComments(request)
  })

  /** Seeds a rendered comment that also maps to source line 3 of MD_FILE. */
  async function seedCrossViewComment(request: APIRequestContext): Promise<string> {
    const res = await request.post('/api/comments', {
      data: {
        filePath: MD_FILE,
        anchorType: 'rendered',
        renderedAnchor: { selectedText: 'local code review tool', context: '', paragraphIndex: 1, startOffset: 0, endOffset: 0, sourceLine: 3 },
        body,
      },
    })
    return (await res.json()).id
  }

  test('a rendered-view comment also shows on its source line in the diff', async ({ page, request }) => {
    await seedCrossViewComment(request)
    await page.goto('/')
    const card = mdCard(page)
    await card.scrollIntoViewIfNeeded()
    const bubble = card.locator('.comment-bubble', { hasText: body })
    await bubble.scrollIntoViewIfNeeded()
    await expect(bubble).toBeVisible()
  })

  test('the same comment shows in both the diff bubble and the rendered margin', async ({ page, request }) => {
    await seedCrossViewComment(request)
    await page.goto('/')

    // Diff view first.
    const card = mdCard(page)
    await card.scrollIntoViewIfNeeded()
    const bubble = card.locator('.comment-bubble', { hasText: body })
    await bubble.scrollIntoViewIfNeeded()
    await expect(bubble).toBeVisible()

    // Switch to rendered: the margin shows the same comment.
    await openRendered(page)
    await expect(card.locator('.comment-margin .comment-bubble', { hasText: body })).toBeVisible()
  })

  test('deleting from the rendered margin removes it from both views after reload', async ({ page, request }) => {
    const id = await seedCrossViewComment(request)
    await page.goto('/')
    const card = await openRendered(page)

    const marginBubble = card.locator('.comment-margin .comment-bubble', { hasText: body })
    await marginBubble.hover()
    await marginBubble.locator('.comment-bubble-delete').click()

    await expect
      .poll(async () => (await (await request.get('/api/comments')).json()).length)
      .toBe(0)
    expect((await (await request.get('/api/comments')).json()).some((c: { id: string }) => c.id === id)).toBe(false)

    // After reload the diff view also has no bubble for it.
    await page.reload()
    const reloaded = mdCard(page)
    await reloaded.scrollIntoViewIfNeeded()
    expect(await reloaded.locator('.comment-bubble', { hasText: body }).count()).toBe(0)
  })
})

test.describe('theme toggle', () => {
  test('flips data-theme, updates --bg, and persists across reload', async ({ page }) => {
    await page.goto('/')
    const toggle = page.locator('.theme-toggle-btn')
    await expect(toggle).toBeVisible()

    const before = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    }))

    await toggle.click()

    const after = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      stored: localStorage.getItem('diffx-theme'),
    }))

    expect(after.theme).not.toBe(before.theme)
    expect([before.theme, after.theme].sort()).toEqual(['dark', 'light'])
    expect(after.bg).not.toBe(before.bg)
    expect(after.stored).toBe(after.theme)

    // Persists across reload (inline script applies it before paint).
    await page.reload()
    const reloaded = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(reloaded).toBe(after.theme)
  })
})

test.describe('copy comments', () => {
  test.afterEach(async ({ request }) => {
    await clearAllComments(request)
  })

  test('the Copy comments button reflects the count and copies formatted output', async ({ page, context, request }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const body = 'copyable comment e2e'
    await request.post('/api/comments', {
      data: { filePath: MD_FILE, anchorType: 'line', side: 'additions', lineNumber: 3, lineContent: 'diffx is a local code review tool', body },
    })

    await page.goto('/')
    const copyBtn = page.getByRole('button', { name: /Copy comments/ })
    await expect(copyBtn).toContainText('(1)')
    // Focus the page so the clipboard write is permitted, then copy.
    await copyBtn.click()

    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('<code-review-comments>')
    expect(clip).toContain(`<file path="${MD_FILE}">`)
    expect(clip).toContain(body)
  })
})
