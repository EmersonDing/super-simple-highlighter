// @ts-check
const { test, expect, chromium } = require('@playwright/test')
const http = require('http')
const fs = require('fs')
const path = require('path')

const EXTENSION_PATH = path.resolve(__dirname, '..', '..')
const FIXTURE_PATH = path.resolve(__dirname, '..', 'fixtures')
const DEFAULT_CLASSNAME = 'default-red-aa94e3d5-ab2f-4205-b74e-18ce31c7c0ce'
const SELECTION_TEXT = 'This is a test sentence'

let server
let port
let context
let sw

test.beforeAll(async () => {
  // Start local HTTP server for fixtures
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

  // Launch browser with extension loaded
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  // Wait for the extension service worker
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

test('highlight creates mark elements and persists after reload', async () => {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')

  // Select text programmatically
  await page.evaluate(() => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, 23) // "This is a test sentence"
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  })

  // Trigger highlight via service worker
  await sw.evaluate(async ({ pageUrl, className, selectionText }) => {
    const [tab] = await chrome.tabs.query({ url: pageUrl })
    await ChromeContextMenusHandler.onClicked({
      menuItemId: `create_highlight.${className}`,
      editable: false,
      selectionText: selectionText,
    }, tab)
  }, { pageUrl, className: DEFAULT_CLASSNAME, selectionText: SELECTION_TEXT })

  // Assert mark element appears
  const mark = await page.waitForSelector('mark', { timeout: 5000 })
  expect(mark).toBeTruthy()

  const markText = await mark.textContent()
  expect(markText).toBe(SELECTION_TEXT)

  // Reload and verify highlights persist
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const markAfterReload = await page.waitForSelector('mark', { timeout: 5000 })
  expect(markAfterReload).toBeTruthy()

  const markTextAfterReload = await markAfterReload.textContent()
  expect(markTextAfterReload).toBe(SELECTION_TEXT)

  await page.close()
})
