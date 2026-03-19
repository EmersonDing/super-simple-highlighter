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
      '--window-position=800,0',
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

// Verifies the options page can render the Advanced tab's storage usage UI for the extension database.
test('options page advanced tab displays database storage size', async () => {
  // Get extension ID from service worker URL
  const extId = sw.url().split('/')[2]
  const optionsUrl = `chrome-extension://${extId}/options.html`

  const page = await context.newPage()
  await page.goto(optionsUrl)
  await page.waitForLoadState('domcontentloaded')

  // Click the Advanced tab
  await page.click('a[href="#advanced"]')

  // Wait for Angular to render the storage display with a formatted size (e.g. "1.2 MB used", "345.0 KB used")
  const storageText = page.locator('#advanced .list-group-item strong')
  await expect(storageText.first()).toHaveText(/[\d.]+ (B|KB|MB|GB) used/, { timeout: 5000 })

  // Verify progress bar exists (width may be near-zero for small databases)
  const progressBar = page.locator('#advanced .progress-bar')
  await expect(progressBar).toBeAttached()

  await page.close()
})

// Verifies export, import, and merge controls use the same visible button styling in the Advanced tab.
test('options page advanced tab backup controls share button styling', async () => {
  const extId = sw.url().split('/')[2]
  const optionsUrl = `chrome-extension://${extId}/options.html`

  const page = await context.newPage()
  await page.goto(optionsUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.click('a[href="#advanced"]')

  const classes = await page.evaluate(() => {
    const exportButton = document.querySelector('[data-ng-click="onClickExport()"]')
    const importButton = document.querySelector('label[for="files"]')
    const mergeButton = document.querySelector('label[for="mergeFiles"]')

    return {
      export: exportButton && exportButton.className,
      import: importButton && importButton.className,
      merge: mergeButton && mergeButton.className,
    }
  })

  expect(classes.export).toContain('btn')
  expect(classes.export).toContain('btn-default')
  expect(classes.import).toContain('btn')
  expect(classes.import).toContain('btn-default')
  expect(classes.import).toContain('btn-file')
  expect(classes.merge).toContain('btn')
  expect(classes.merge).toContain('btn-default')
  expect(classes.merge).toContain('btn-file')
  expect(classes.merge).not.toContain('btn-lg')

  await page.close()
})

// Verifies a selected text range is highlighted through the extension flow and restored after a page reload.
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
