// @ts-check
// Tests for the Pages (bookmarks) tab in options.html.
// Verifies that highlights created via the extension appear in the Pages tab
// with the correct page entry and, when text display is toggled on, the
// highlight text itself.

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

test('pages tab shows page entry and highlight text after a highlight is created', async () => {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`

  // Open test page and create a highlight via the service worker
  const contentPage = await context.newPage()
  await contentPage.goto(pageUrl)
  await contentPage.waitForLoadState('domcontentloaded')

  // Set a real DOM selection so the content script can report a non-collapsed XRange
  await contentPage.evaluate((len) => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, len)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }, SELECTION_TEXT.length)

  await sw.evaluate(async ({ pageUrl, className, selectionText }) => {
    const [tab] = await chrome.tabs.query({ url: pageUrl })
    await ChromeContextMenusHandler.onClicked({
      menuItemId: `create_highlight.${className}`,
      editable: false,
      selectionText,
    }, tab)
  }, { pageUrl, className: DEFAULT_CLASSNAME, selectionText: SELECTION_TEXT })

  await contentPage.waitForSelector('mark', { timeout: 5000 })
  await contentPage.close()

  // Open the options page and navigate to the Pages (bookmarks) tab
  const extId = sw.url().split('/')[2]
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extId}/options.html`)
  await optionsPage.waitForLoadState('domcontentloaded')

  // The bookmarks controller defers init until the tab is shown —
  // clicking the tab fires shown.bs.tab which triggers the DB queries
  await optionsPage.click('a[href="#bookmarks"]')

  // A .page entry for our test page should appear
  const pageEntry = optionsPage.locator('.page')
  await expect(pageEntry).toBeVisible({ timeout: 8000 })

  // The page link should reference our test fixture URL
  const pageLink = optionsPage.locator('.page-link').first()
  await expect(pageLink).toHaveText(new RegExp(pageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  // Toggle "show page highlight text" so the highlight text list becomes visible
  await optionsPage.locator('.glyphicon-resize-vertical').click()

  // The highlight text should now be visible in the page entry
  const highlightText = optionsPage.locator('.page-text-list-item').first()
  await expect(highlightText).toBeVisible({ timeout: 3000 })
  await expect(highlightText).toContainText(SELECTION_TEXT)

  await optionsPage.close()
})
