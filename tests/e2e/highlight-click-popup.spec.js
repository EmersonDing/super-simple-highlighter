// @ts-check
const { test, expect, chromium } = require('@playwright/test')
const http = require('http')
const fs = require('fs')
const path = require('path')

const EXTENSION_PATH = path.resolve(__dirname, '..', '..')
const FIXTURE_PATH = path.resolve(__dirname, '..', 'fixtures')
const DEFAULT_CLASSNAME = 'default-red-aa94e3d5-ab2f-4205-b74e-18ce31c7c0ce'

let server, port, context, sw

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const filePath = path.join(FIXTURE_PATH, req.url === '/' ? 'test-page.html' : req.url)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--window-position=800,0',
    ],
  })

  sw = context.serviceWorkers().find(w => w.url().includes('chrome-extension://'))
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', {
      predicate: w => w.url().includes('chrome-extension://'),
    })
  }
})

test.afterAll(async () => {
  if (context) await context.close()
  if (server) server.close()
})

async function cleanupHighlights() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await sw.evaluate(async (url) => {
    const db = new DB()
    await db.removeMatchingDocuments(url).catch(() => {})
  }, pageUrl)
}

async function setupPage() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await cleanupHighlights()
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab) await new ChromeTabs(tab.id).sendMessage('ping', {}).catch(() => {})
  }, pageUrl)
  await page.waitForTimeout(300)
  return { page, pageUrl }
}

async function createHighlight(page) {
  // Programmatically select text and dispatch mouseup, mirroring the selectText helper
  // used in selection-toolbar.spec.js (plain page.mouse drag doesn't fire the right events)
  await page.evaluate(() => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, 23)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const rects = Array.from(range.getClientRects())
    const lastRect = rects[rects.length - 1]
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: Math.round(lastRect.right),
      clientY: Math.round(lastRect.bottom),
    }))
  })
  await page.waitForTimeout(200)

  // Click the pen button to create a highlight
  const pen = page.locator('.ssh-toolbar-pen')
  await pen.waitFor({ timeout: 3000 })
  await pen.click()
  await page.waitForTimeout(300)

  // Return the first mark element
  return page.locator('mark').first()
}

test('clicking a highlight shows delete and comment popup', async () => {
  const { page } = await setupPage()
  const mark = await createHighlight(page)

  // Click the highlight
  await mark.click()
  await page.waitForTimeout(200)

  // Popup should appear with two buttons
  const popup = page.locator('.ssh-highlight-popup')
  await expect(popup).toBeVisible()
  const buttons = popup.locator('.ssh-highlight-popup-btn')
  await expect(buttons).toHaveCount(2)

  await page.close()
})

test('clicking delete button removes the highlight', async () => {
  const { page } = await setupPage()
  await createHighlight(page)

  const mark = page.locator('mark').first()
  await mark.click()
  await page.waitForTimeout(200)

  // Click the first button (delete)
  const deleteBtn = page.locator('.ssh-highlight-popup-btn').first()
  await deleteBtn.click()
  await page.waitForTimeout(500)

  // Highlight should be removed
  await expect(page.locator('mark')).toHaveCount(0)

  // Popup should be dismissed
  await expect(page.locator('.ssh-highlight-popup')).toHaveCount(0)

  await page.close()
})

test('clicking comment button opens comment editor', async () => {
  const { page } = await setupPage()
  await createHighlight(page)

  const mark = page.locator('mark').first()
  await mark.click()
  await page.waitForTimeout(200)

  // Click the second button (comment)
  const commentBtn = page.locator('.ssh-highlight-popup-btn').nth(1)
  await commentBtn.click()
  await page.waitForTimeout(300)

  // Comment editor toolbar should appear
  const input = page.locator('.ssh-toolbar-input')
  await expect(input).toBeVisible()

  await page.close()
})

test('popup dismisses on click outside', async () => {
  const { page } = await setupPage()
  await createHighlight(page)

  const mark = page.locator('mark').first()
  await mark.click()
  await page.waitForTimeout(200)
  await expect(page.locator('.ssh-highlight-popup')).toBeVisible()

  // Click outside
  await page.mouse.click(10, 10)
  await page.waitForTimeout(200)
  await expect(page.locator('.ssh-highlight-popup')).toHaveCount(0)

  await page.close()
})

test('popup does not appear when text is selected', async () => {
  const { page } = await setupPage()
  await createHighlight(page)

  // Select text that overlaps the highlight
  const mark = page.locator('mark').first()
  const box = await mark.boundingBox()
  await page.mouse.move(box.x, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width, box.y + box.height / 2)
  await page.mouse.up()
  await page.waitForTimeout(300)

  // Selection toolbar should show, not the click popup
  await expect(page.locator('.ssh-toolbar-root')).toBeVisible()
  await expect(page.locator('.ssh-highlight-popup')).toHaveCount(0)

  await page.close()
})
