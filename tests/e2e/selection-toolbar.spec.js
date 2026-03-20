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


async function getToolbarMetrics(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('.ssh-toolbar-root')
    if (!toolbar) return null

    const toolbarRect = toolbar.getBoundingClientRect()
    return {
      left: toolbarRect.left,
      top: toolbarRect.top,
      width: toolbarRect.width,
      height: toolbarRect.height,
    }
  })
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

test("toolbar appears near the cursor location when text is selected", async () => {
  const { page } = await setupPage()
  const cursor = await selectText(page)
  const toolbarRoot = await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })
  expect(toolbarRoot).toBeTruthy()

  const toolbar = await getToolbarMetrics(page)
  expect(toolbar).toBeTruthy()
  expect(Math.abs(toolbar.left - cursor.x)).toBeLessThanOrEqual(2)
  expect(toolbar.top + toolbar.height).toBeLessThanOrEqual(cursor.y + 2)

  await page.close()
})


test("toolbar follows the mouseup cursor for wrapped selections", async () => {
  const { page } = await setupPage()
  const cursor = await page.evaluate(() => {
    const target = document.getElementById('target')
    const range = document.createRange()
    range.setStart(target.firstChild, 0)
    range.setEnd(target.firstChild, target.firstChild.textContent.length - 1)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const rects = Array.from(range.getClientRects())
    const lastRect = rects[rects.length - 1]
    const cursorPoint = {
      x: Math.round(lastRect.right),
      y: Math.round(lastRect.bottom),
    }

    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: cursorPoint.x,
      clientY: cursorPoint.y,
    }))

    return cursorPoint
  })
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  const toolbar = await getToolbarMetrics(page)
  expect(toolbar).toBeTruthy()
  expect(Math.abs(toolbar.left - cursor.x)).toBeLessThanOrEqual(2)
  expect(toolbar.top + toolbar.height).toBeLessThanOrEqual(cursor.y + 2)

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


test('toolbar includes AI button as the fourth action', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  const buttonClasses = await page.$$eval('.ssh-toolbar-root button', nodes => nodes.map(node => node.className))
  expect(buttonClasses.slice(0, 4)).toEqual([
    'ssh-toolbar-search',
    'ssh-toolbar-pen',
    'ssh-toolbar-comment',
    'ssh-toolbar-ai',
  ])

  await page.close()
})

test('clicking AI button opens Google AI mode by default and dismisses toolbar', async () => {
  const { page } = await setupPage()
  await sw.evaluate(() => {
    self.__testOriginalChromeTabsCreate = ChromeTabs.create
    self.__testOpenedUrls = []
    ChromeTabs.create = (properties) => {
      self.__testOpenedUrls.push(properties.url)
      return Promise.resolve({ id: 999, url: properties.url })
    }
  })

  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  await page.click('.ssh-toolbar-ai')

  await expect.poll(async () => {
    return await sw.evaluate(() => self.__testOpenedUrls[0] || null)
  }).not.toBeNull()
  const aiUrl = new URL(await sw.evaluate(() => self.__testOpenedUrls[0]))
  expect(`${aiUrl.origin}${aiUrl.pathname}`).toBe('https://www.google.com/search')
  expect(aiUrl.searchParams.get('q')).toBe('This is a test sentence')
  expect(aiUrl.searchParams.get('udm')).toBe('50')

  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()

  await sw.evaluate(() => {
    ChromeTabs.create = self.__testOriginalChromeTabsCreate
    delete self.__testOriginalChromeTabsCreate
    delete self.__testOpenedUrls
  })
  await page.close()
})

test('toolbar honors stored AI provider before the first render', async () => {
  await sw.evaluate(async () => {
    await chrome.storage.sync.set({ aiProvider: 'claude' })
    self.__testOriginalChromeTabsCreate = ChromeTabs.create
    self.__testOpenedUrls = []
    ChromeTabs.create = (properties) => {
      self.__testOpenedUrls.push(properties.url)
      return Promise.resolve({ id: 999, url: properties.url })
    }
  })

  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  const aiTitle = await page.getAttribute('.ssh-toolbar-ai', 'title')
  expect(aiTitle).toBe('Search Claude AI')

  await page.click('.ssh-toolbar-ai')

  await expect.poll(async () => {
    return await sw.evaluate(() => self.__testOpenedUrls[0] || null)
  }).not.toBeNull()

  const aiUrl = new URL(await sw.evaluate(() => self.__testOpenedUrls[0]))
  expect(`${aiUrl.origin}${aiUrl.pathname}`).toBe('https://claude.ai/new')
  expect(aiUrl.searchParams.get('q')).toBe('This is a test sentence')

  await page.close()

  await sw.evaluate(async () => {
    ChromeTabs.create = self.__testOriginalChromeTabsCreate
    delete self.__testOriginalChromeTabsCreate
    delete self.__testOpenedUrls
    await chrome.storage.sync.set({ aiProvider: 'gemini' })
  })
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

test('options page has hover color picker toggle in Comment setting panel', async () => {
  const extId = new URL(sw.url()).hostname
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extId}/options.html`)
  await optionsPage.waitForLoadState('domcontentloaded')
  await optionsPage.waitForTimeout(500) // let Angular render

  // The Styles tab is active by default — Comment setting panel is visible
  const checkbox = await optionsPage.$('input[ng-model="options.enableToolbarColorSelection"]')
  expect(checkbox).toBeTruthy()
  expect(await checkbox.isChecked()).toBe(true) // default is true

  await optionsPage.close()
})

test('hovering pen button for 600ms shows color picker popup', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  // Hover over the pen button and wait longer than the 500ms delay
  await page.hover('.ssh-toolbar-pen')
  await page.waitForSelector('.ssh-toolbar-picker', { timeout: 2000 })

  const picker = await page.$('.ssh-toolbar-picker')
  expect(picker).toBeTruthy()

  // Swatch content is verified in Task 4; this test only checks the popup appears
  await page.close()
})

test('color picker shows 4 swatches matching first 4 highlight definitions', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  await page.hover('.ssh-toolbar-pen')
  await page.waitForSelector('.ssh-toolbar-picker', { timeout: 2000 })

  const swatches = await page.$$('.ssh-toolbar-picker-swatch')
  expect(swatches.length).toBe(4)

  // First swatch should be red (#ff8080) — the default first definition
  const firstBg = await swatches[0].evaluate(el => el.style.background)
  expect(firstBg.toLowerCase()).toContain('rgb(255, 128, 128)')

  await page.close()
})

test('picker popup prevents mousedown default to preserve text selection', async () => {
  // Regression: clicking a <div> swatch natively collapses the browser selection,
  // firing selectionchange → _dismiss() before the click event fires. The popup
  // must call e.preventDefault() on mousedown to block this.
  // Note: Playwright's synthetic page.click() does NOT trigger the browser's
  // native selection-collapse, so swatch-click tests pass even without this fix.
  // This test directly verifies that preventDefault() is called on mousedown.
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  await page.hover('.ssh-toolbar-pen')
  await page.waitForSelector('.ssh-toolbar-picker', { timeout: 2000 })

  const defaultPrevented = await page.evaluate(() => {
    const popup = document.querySelector('.ssh-toolbar-picker')
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    popup.dispatchEvent(evt)
    return evt.defaultPrevented
  })
  expect(defaultPrevented).toBe(true)

  await page.close()
})

test('clicking first swatch in pen picker creates a highlight and dismisses toolbar', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  await page.hover('.ssh-toolbar-pen')
  await page.waitForSelector('.ssh-toolbar-picker', { timeout: 2000 })

  // Click the first swatch (red by default)
  await page.click('.ssh-toolbar-picker-swatch:first-child')

  // Highlight should appear
  await page.waitForSelector('mark', { timeout: 3000 })

  // Toolbar should be gone
  const toolbar = await page.$('.ssh-toolbar-root')
  expect(toolbar).toBeNull()

  await page.close()
})

test('clicking first swatch in comment picker creates highlight and opens comment input', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  await page.hover('.ssh-toolbar-comment')
  await page.waitForSelector('.ssh-toolbar-picker', { timeout: 2000 })

  await page.click('.ssh-toolbar-picker-swatch:first-child')

  // Comment input should appear
  const input = await page.waitForSelector('.ssh-toolbar-input', { timeout: 3000 })
  expect(input).toBeTruthy()

  // A mark (highlight) should exist
  await page.waitForSelector('mark', { timeout: 3000 })

  await page.close()
})

test('moving mouse off pen button before 500ms does not show picker', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  // Hover briefly then move away quickly (under 500ms)
  await page.hover('.ssh-toolbar-pen')
  await page.waitForTimeout(200)
  await page.mouse.move(0, 0) // move away
  await page.waitForTimeout(400) // wait past original 500ms mark

  // Toolbar should still be visible (mouse moved, not dismissed)
  expect(await page.$('.ssh-toolbar-root')).toBeTruthy()

  const picker = await page.$('.ssh-toolbar-picker')
  expect(picker).toBeNull()

  await page.close()
})

test('hover color picker does not appear when disabled in options', async () => {
  await sw.evaluate(async () => {
    await chrome.storage.sync.set({ enableToolbarColorSelection: false })
  })

  try {
    const { page } = await setupPage()
    await selectText(page)
    await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

    await page.hover('.ssh-toolbar-pen')
    await page.waitForTimeout(700) // past the 500ms delay

    const picker = await page.$('.ssh-toolbar-picker')
    expect(picker).toBeNull()

    // Direct pen click should still work (falls back to original behavior)
    await page.click('.ssh-toolbar-pen')
    await page.waitForSelector('mark', { timeout: 3000 })

    await page.close()
  } finally {
    // Re-enable for other tests — runs even if assertions fail
    await sw.evaluate(async () => {
      await chrome.storage.sync.set({ enableToolbarColorSelection: true })
    })
  }
})
