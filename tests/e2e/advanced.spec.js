// @ts-check
// E2E tests for the Advanced tab backup features: export, import, and merge.
//
// Merge test uses two backup files:
//   backup1 — contains only page-1's highlight
//   backup2 — contains page-1's highlight + page-2's highlight
//
// The merge test first merges backup2 into a DB that only has page-1 →
// page-2's highlight is new so it gets added (total: 2 pages).
// Then merges backup1 into that same DB → page-1 is already present so
// nothing is added (total remains 2 pages, duplicate skipped).

const { test, expect, chromium } = require('@playwright/test')
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

const EXTENSION_PATH = path.resolve(__dirname, '..', '..')
const FIXTURE_PATH = path.resolve(__dirname, '..', 'fixtures')
const DEFAULT_CLASSNAME = 'default-red-aa94e3d5-ab2f-4205-b74e-18ce31c7c0ce'
const PAGE_1_TEXT_A = 'This is a test sentence'
const PAGE_1_TEXT_B = 'highlighting and'
const PAGE_1_TEXT_C = 'multiple wrapped lines'
const PAGE_2_TEXT_A = 'Second page'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function selectTextOnPage(page, selectionText) {
  await page.evaluate((text) => {
    const target = document.getElementById('target')
    const content = target.textContent
    const start = content.indexOf(text)

    if (start === -1) {
      throw new Error(`Selection text not found in fixture: ${text}`)
    }

    const textNodes = []
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode)
    }

    const resolveOffset = (offset) => {
      let remaining = offset

      for (const node of textNodes) {
        const length = node.textContent.length
        if (remaining <= length) {
          return { node, offset: remaining }
        }
        remaining -= length
      }

      const lastNode = textNodes[textNodes.length - 1]
      return { node: lastNode, offset: lastNode.textContent.length }
    }

    const startPoint = resolveOffset(start)
    const endPoint = resolveOffset(start + text.length)

    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }, selectionText)
}

/** Open a test page, create one or more exact-substring highlights, then close the page. */
async function createHighlightsOnPage(pageUrl, selectionTexts) {
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')

  for (let index = 0; index < selectionTexts.length; index += 1) {
    const selectionText = selectionTexts[index]
    await selectTextOnPage(page, selectionText)

    await sw.evaluate(async ({ pageUrl, className, selectionText }) => {
      const [tab] = await chrome.tabs.query({ url: pageUrl })
      await ChromeContextMenusHandler.onClicked({
        menuItemId: `create_highlight.${className}`,
        editable: false,
        selectionText,
      }, tab)
    }, { pageUrl, className: DEFAULT_CLASSNAME, selectionText })

    await expect(page.locator('mark')).toHaveCount(index + 1, { timeout: 5000 })
  }

  await page.close()
}

async function createHighlightOnPage(pageUrl, selectionText) {
  await createHighlightsOnPage(pageUrl, [selectionText])
}

async function getPageHighlightTexts(optionsPage) {
  return optionsPage.locator('.page-text-list-item').evaluateAll(elements => {
    return elements.map(el => el.textContent.replace(/\s+/g, ' ').replace(/💬/g, '').trim())
  })
}

/** Destroy and recreate the PouchDB database via the service worker. */
async function clearDB() {
  await sw.evaluate(async () => {
    await new DB().destroyDB()
  })
}

/**
 * Open the options page, navigate to the Advanced tab, click Export, and
 * return the downloaded file's text content.
 */
async function exportDB(extId) {
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extId}/options.html`)
  await optionsPage.waitForLoadState('domcontentloaded')
  await optionsPage.click('a[href="#advanced"]')

  const downloadPromise = optionsPage.waitForEvent('download')
  await optionsPage.locator('[data-ng-click="onClickExport()"]').click()
  const download = await downloadPromise

  const filePath = await download.path()
  const content = fs.readFileSync(filePath, 'utf-8')

  await optionsPage.close()
  return content
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('export downloads a backup file with a valid header', async () => {
  await clearDB()

  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await createHighlightOnPage(pageUrl, PAGE_1_TEXT_A)

  const extId = sw.url().split('/')[2]
  const content = await exportDB(extId)

  // First line must be a valid header JSON object
  const header = JSON.parse(content.split('\n')[0])
  expect(header.magic).toBe('Super Simple Highlighter Exported Database')
  expect(header.version).toBe(1)

  // Second line must be a valid JSON object (style storage items)
  const storageItems = JSON.parse(content.split('\n')[1])
  expect(typeof storageItems).toBe('object')
})

test('import restores highlights from a backup file', async () => {
  await clearDB()

  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  await createHighlightOnPage(pageUrl, PAGE_1_TEXT_B)

  const extId = sw.url().split('/')[2]

  // Export current DB so we have a backup to import from
  const exportedContent = await exportDB(extId)

  // Wipe the DB — highlights are gone
  await clearDB()

  // Write the backup to a temp file
  const tmpFile = path.join(os.tmpdir(), `ssh_import_test_${Date.now()}.ldjson`)
  fs.writeFileSync(tmpFile, exportedContent)

  try {
    const optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${extId}/options.html`)
    await optionsPage.waitForLoadState('domcontentloaded')
    await optionsPage.click('a[href="#advanced"]')

    // setInputFiles triggers the change listener; the import logic ends with location.reload()
    const navigationPromise = optionsPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
    await optionsPage.locator('#files').setInputFiles(tmpFile)
    await navigationPromise

    // After reload, navigate to the Pages tab and verify the page entry was restored
    await optionsPage.click('a[href="#bookmarks"]')
    const pageEntry = optionsPage.locator('.page')
    await expect(pageEntry).toBeVisible({ timeout: 8000 })

    // The restored page's URL should match our fixture
    const pageLink = optionsPage.locator('.page-link').first()
    await expect(pageLink).toHaveText(new RegExp(pageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    await optionsPage.close()
  } finally {
    fs.unlinkSync(tmpFile)
  }
})

test('merge combines same-page backups and skips duplicates', async () => {
  await clearDB()

  const extId = sw.url().split('/')[2]
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`

  // backup1 = {A, C}
  await createHighlightsOnPage(pageUrl, [PAGE_1_TEXT_A, PAGE_1_TEXT_C])
  const backup1Content = await exportDB(extId)

  // backup2 = {A, B}
  await clearDB()
  await createHighlightsOnPage(pageUrl, [PAGE_1_TEXT_A, PAGE_1_TEXT_B])
  const backup2Content = await exportDB(extId)

  const tmpDir = os.tmpdir()
  const backup1Path = path.join(tmpDir, `ssh_merge_same_page_backup1_${Date.now()}.ldjson`)
  const backup2Path = path.join(tmpDir, `ssh_merge_same_page_backup2_${Date.now()}.ldjson`)
  fs.writeFileSync(backup1Path, backup1Content)
  fs.writeFileSync(backup2Path, backup2Content)

  try {
    // Start from backup1 state: {A, C}
    await clearDB()
    await createHighlightsOnPage(pageUrl, [PAGE_1_TEXT_A, PAGE_1_TEXT_C])

    const optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${extId}/options.html`)
    await optionsPage.waitForLoadState('domcontentloaded')
    await optionsPage.click('a[href="#advanced"]')

    optionsPage.on('dialog', dialog => dialog.accept())
    const navigationPromise = optionsPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
    await optionsPage.locator('#mergeFiles').setInputFiles(backup2Path)
    await navigationPromise

    await optionsPage.click('a[href="#bookmarks"]')
    await expect(optionsPage.locator('.page')).toHaveCount(1, { timeout: 8000 })

    await optionsPage.locator('.glyphicon-resize-vertical').click()
    await expect(optionsPage.locator('.page-text-list-item')).toHaveCount(3, { timeout: 8000 })
    const highlightTexts = await getPageHighlightTexts(optionsPage)
    expect(highlightTexts).toEqual(expect.arrayContaining([PAGE_1_TEXT_A, PAGE_1_TEXT_B, PAGE_1_TEXT_C]))

    await optionsPage.close()
  } finally {
    fs.unlinkSync(backup1Path)
    fs.unlinkSync(backup2Path)
  }
})

test('merge adds new highlights from another page and skips duplicates', async () => {
  await clearDB()

  const extId = sw.url().split('/')[2]
  const pageUrl1 = `http://127.0.0.1:${port}/test-page.html`
  const pageUrl2 = `http://127.0.0.1:${port}/test-page-2.html`

  // --- Build backup1: DB contains only page-1's highlight ---
  await createHighlightOnPage(pageUrl1, PAGE_1_TEXT_A)
  const backup1Content = await exportDB(extId)

  // --- Build backup2: DB contains page-1 + page-2 highlights ---
  await createHighlightOnPage(pageUrl2, PAGE_2_TEXT_A)
  const backup2Content = await exportDB(extId)

  // Write both backup files to temp paths
  const tmpDir = os.tmpdir()
  const backup1Path = path.join(tmpDir, `ssh_merge_backup1_${Date.now()}.ldjson`)
  const backup2Path = path.join(tmpDir, `ssh_merge_backup2_${Date.now()}.ldjson`)
  fs.writeFileSync(backup1Path, backup1Content)
  fs.writeFileSync(backup2Path, backup2Content)

  try {
    // --- Reset: DB has only page-1's highlight ---
    await clearDB()
    await createHighlightOnPage(pageUrl1, PAGE_1_TEXT_A)

    // --- Merge test 1: merge backup2 (page-1 + page-2) into DB (page-1 only) ---
    // page-2's highlight is new → gets added; page-1's highlight is a duplicate → skipped
    // Expected result: 2 pages visible
    let optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${extId}/options.html`)
    await optionsPage.waitForLoadState('domcontentloaded')
    await optionsPage.click('a[href="#advanced"]')

    optionsPage.on('dialog', dialog => dialog.accept())
    const nav1 = optionsPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
    await optionsPage.locator('#mergeFiles').setInputFiles(backup2Path)
    await nav1

    await optionsPage.click('a[href="#bookmarks"]')
    await expect(optionsPage.locator('.page')).toHaveCount(2, { timeout: 8000 })
    await optionsPage.close()

    // --- Merge test 2: merge backup1 (page-1 only) into DB (page-1 + page-2) ---
    // page-1's highlight is already present → nothing added
    // Expected result: still 2 pages (duplicate skipped)
    optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${extId}/options.html`)
    await optionsPage.waitForLoadState('domcontentloaded')
    await optionsPage.click('a[href="#advanced"]')

    optionsPage.on('dialog', dialog => dialog.accept())
    const nav2 = optionsPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
    await optionsPage.locator('#mergeFiles').setInputFiles(backup1Path)
    await nav2

    await optionsPage.click('a[href="#bookmarks"]')
    await expect(optionsPage.locator('.page')).toHaveCount(2, { timeout: 8000 })
    await optionsPage.close()
  } finally {
    fs.unlinkSync(backup1Path)
    fs.unlinkSync(backup2Path)
  }
})
