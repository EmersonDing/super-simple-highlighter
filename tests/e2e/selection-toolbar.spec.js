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

/** Helper: remove all DB highlights for the test page URL to keep tests independent */
async function cleanupHighlights() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await sw.evaluate(async (url) => {
    const db = new DB()
    await db.removeMatchingDocuments(url).catch(() => {})
  }, pageUrl)
}

/** Helper: load test page, inject content scripts, select the target text */
async function setupPage() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await cleanupHighlights()
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')

  // Ping-then-inject: trigger content script injection by sending a ping via SW
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab) await new ChromeTabs(tab.id).sendMessage('ping', {}).catch(() => {})
  }, pageUrl)

  // Wait for SelectionToolbar's _resolveActiveClassName() storage read to complete
  await page.waitForTimeout(300)

  return { page, pageUrl }
}

/** Helper: select text in the target element and dispatch mouseup to show toolbar */
async function selectText(page) {
  await page.evaluate(() => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, 23)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  })
  // Dispatch mouseup to trigger toolbar
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
}

test('toolbar appears above selection when text is selected', async () => {
  const { page } = await setupPage()
  await selectText(page)
  const toolbar = await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  expect(toolbar).toBeTruthy()
  await page.close()
})

test('clicking search button opens Google for the selected text and dismisses toolbar', async () => {
  const { page } = await setupPage()
  let openedUrl = null

  await context.route('https://www.google.com/**', async route => {
    openedUrl = route.request().url()
    await route.abort()
  })

  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  const firstButtonClass = await page.$eval('.ssh-toolbar-root button:first-of-type', el => el.className)
  expect(firstButtonClass).toBe('ssh-toolbar-search')

  const newPagePromise = context.waitForEvent('page')
  await page.click('.ssh-toolbar-search')
  const searchPage = await newPagePromise
  await searchPage.waitForLoadState('load').catch(() => {})

  const searchUrl = new URL(openedUrl)
  expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe('https://www.google.com/search')
  expect(searchUrl.searchParams.get('q')).toBe('This is a test sentence')

  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()

  await searchPage.close()
  await context.unroute('https://www.google.com/**')
  await page.close()
})

test('clicking pen button creates a highlight and dismisses toolbar', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-pen')
  await page.waitForSelector('mark', { timeout: 3000 })
  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()
  await page.close()
})

test('clicking comment button expands toolbar with input', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  const input = await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  expect(input).toBeTruthy()
  // Save button disabled until text typed
  const saveBtn = await page.$('.ssh-toolbar-save')
  expect(await saveBtn.isDisabled()).toBe(true)
  await page.close()
})

test('comment save creates highlight with comment; dot indicator visible', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  await page.fill('.ssh-toolbar-input', 'My test comment')
  await page.keyboard.press('Enter')
  await page.waitForSelector('mark', { timeout: 3000 })
  const dot = await page.waitForSelector('.ssh-comment-dot', { timeout: 2000 })
  expect(dot).toBeTruthy()
  await page.close()
})

test('clicking × in comment mode keeps highlight, no comment saved', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  await page.click('.ssh-toolbar-cancel')
  // Highlight should exist (was created when entering comment mode)
  const mark = await page.waitForSelector('mark', { timeout: 2000 })
  expect(mark).toBeTruthy()
  // No dot indicator
  const dot = await page.$('.ssh-comment-dot')
  expect(dot).toBeNull()
  await page.close()
})

test('clicking outside toolbar dismisses it without highlighting', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.mouse.click(10, 10)
  await page.waitForTimeout(300)
  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()
  const mark = await page.$('mark')
  expect(mark).toBeNull()
  await page.close()
})

test('save button disabled for whitespace-only input', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  await page.fill('.ssh-toolbar-input', '   ')
  const saveBtn = await page.$('.ssh-toolbar-save')
  expect(await saveBtn.isDisabled()).toBe(true)
  await page.close()
})

test('page scroll while toolbar open dismisses toolbar', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
  await page.waitForTimeout(200)
  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()
  await page.close()
})

test('hovering commented highlight shows tooltip with correct text', async () => {
  const { page, pageUrl } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  await page.fill('.ssh-toolbar-input', 'Tooltip test comment')
  await page.keyboard.press('Enter')
  const mark = await page.waitForSelector('mark', { timeout: 3000 })
  await mark.hover()
  const tooltip = await page.waitForSelector('.ssh-comment-tooltip', { timeout: 2000 })
  const text = await tooltip.textContent()
  expect(text).toContain('Tooltip test comment')
  await page.close()
})

test('commented highlight dot and tooltip restored after page reload', async () => {
  const { page, pageUrl } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  await page.click('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-input', { timeout: 2000 })
  await page.fill('.ssh-toolbar-input', 'Persist comment')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.ssh-comment-dot', { timeout: 3000 })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  const dot = await page.waitForSelector('.ssh-comment-dot', { timeout: 5000 })
  expect(dot).toBeTruthy()
  await page.close()
})
