// @ts-check
const { test, expect, chromium } = require('@playwright/test')
const http = require('http')
const fs = require('fs')
const path = require('path')

const EXTENSION_PATH = path.resolve(__dirname, '..', '..')
const FIXTURE_PATH = path.resolve(__dirname, '..', 'fixtures')

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

/** Helper: load test page and inject content scripts */
async function setupPage() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')

  // Ping-then-inject: trigger content script injection by sending a ping via SW
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab) await new ChromeTabs(tab.id).sendMessage('ping', {}).catch(() => {})
  }, pageUrl)

  // Wait for content scripts (including ChatPanel.init()) to settle
  await page.waitForTimeout(300)

  return { page, pageUrl }
}

/** Helper: select text in the target element and dispatch mouseup to show toolbar */
async function selectText(page) {
  return page.evaluate(() => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, 23)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const rects = Array.from(range.getClientRects())
    const lastRect = rects[rects.length - 1]
    const cursor = {
      x: Math.round(lastRect.right),
      y: Math.round(lastRect.bottom),
    }

    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: cursor.x,
      clientY: cursor.y,
    }))

    return cursor
  })
}

test('floating tab is visible on page load', async () => {
  const { page } = await setupPage()

  const tab = await page.waitForSelector('.ssh-chat-tab', { timeout: 3000 })
  expect(tab).toBeTruthy()
  await expect(page.locator('.ssh-chat-tab')).toBeVisible()

  await page.close()
})

test('clicking floating tab opens chat panel', async () => {
  const { page } = await setupPage()

  await page.waitForSelector('.ssh-chat-tab', { timeout: 3000 })
  await page.click('.ssh-chat-tab')

  // Panel should be visible
  await page.waitForSelector('.ssh-chat-panel', { timeout: 3000 })
  await expect(page.locator('.ssh-chat-panel')).toBeVisible()

  // Title should say "Chat with AI"
  const title = page.locator('.ssh-chat-title')
  await expect(title).toBeVisible()
  await expect(title).toHaveText('Chat with AI')

  // Context badge should show "Page context" (no selection)
  const badge = page.locator('.ssh-chat-context-badge')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('Page context')

  // Input should be focused
  const input = page.locator('.ssh-chat-input')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()

  await page.close()
})

test('clicking tab again closes chat panel', async () => {
  const { page } = await setupPage()

  await page.waitForSelector('.ssh-chat-tab', { timeout: 3000 })
  await page.click('.ssh-chat-tab')
  await page.waitForSelector('.ssh-chat-panel', { timeout: 3000 })

  // The open panel can visually overlap the tab, so dispatch the click via JS
  // to bypass Playwright's pointer-interception check
  await page.evaluate(() => {
    document.querySelector('.ssh-chat-tab').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(300)

  await expect(page.locator('.ssh-chat-panel')).toHaveCount(0)

  await page.close()
})

test('close button in header closes panel', async () => {
  const { page } = await setupPage()

  await page.waitForSelector('.ssh-chat-tab', { timeout: 3000 })
  await page.click('.ssh-chat-tab')
  await page.waitForSelector('.ssh-chat-panel', { timeout: 3000 })

  await page.click('.ssh-chat-close')
  await page.waitForTimeout(300)

  await expect(page.locator('.ssh-chat-panel')).toHaveCount(0)

  await page.close()
})

test('typing a message and pressing Enter adds user bubble and shows error without API key', async () => {
  const { page } = await setupPage()

  await page.waitForSelector('.ssh-chat-tab', { timeout: 3000 })
  await page.click('.ssh-chat-tab')
  await page.waitForSelector('.ssh-chat-panel', { timeout: 3000 })

  // Type a message and press Enter
  await page.fill('.ssh-chat-input', 'Hello AI')
  await page.keyboard.press('Enter')

  // User bubble should appear with the message text
  const userBubble = page.locator('.ssh-chat-msg-user')
  await expect(userBubble).toBeVisible()
  await expect(userBubble).toContainText('Hello AI')

  // Without an API key, an error bubble should appear (generous timeout since it goes through the port)
  const errorBubble = page.locator('.ssh-chat-msg-error')
  await expect(errorBubble).toBeVisible({ timeout: 5000 })

  await page.close()
})

test('AI button in toolbar opens panel with selected text context', async () => {
  const { page } = await setupPage()

  // Select text and show toolbar
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  // Click the AI button in the toolbar
  await page.click('.ssh-toolbar-ai')

  // Panel should open
  await page.waitForSelector('.ssh-chat-panel', { timeout: 3000 })
  await expect(page.locator('.ssh-chat-panel')).toBeVisible()

  // Context badge should contain "Selected:" (with the selected text)
  const badge = page.locator('.ssh-chat-context-badge')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('Selected:')

  await page.close()
})
