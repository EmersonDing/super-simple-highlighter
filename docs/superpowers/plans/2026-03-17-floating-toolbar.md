# Floating Selection Toolbar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Diigo-style floating toolbar that appears on text selection, allowing one-click highlight or highlight-with-comment.

**Architecture:** A new `SelectionToolbar` content script class handles selection detection, toolbar DOM injection, and message dispatch to the background. The background's existing `Highlighter.create()` path is extended to carry an optional `comment` field through DB storage and DOM replay. A tooltip on hover surfaces saved comments via a `data-comment` attribute on `<mark>` elements.

**Tech Stack:** Vanilla JS (no framework), PouchDB (existing), Playwright E2E tests (existing)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `js/shared/db.js` | Modify | Add `COMMENT` field name; extend `putCreateDocument` and `updateCreateDocument` |
| `js/shared/highlighter.js` | Modify | Accept `{comment}` option in `create()`, pass to DB |
| `js/background/chrome_runtime_handler.js` | Modify | Handle `CREATE_HIGHLIGHT_FROM_PAGE` and `UPDATE_HIGHLIGHT_COMMENT` messages |
| `js/shared/chrome_tabs.js` | Modify | Add `SET_HIGHLIGHT_COMMENT` message ID + method; extend `createHighlight` payload; extend `playbackDocuments` |
| `js/content_script/chrome_runtime_handler.js` | Modify | Add message IDs; extend `createHighlight` to set `data-comment` + dot; handle `SET_HIGHLIGHT_COMMENT` |
| `js/content_script/dom_events_handler.js` | Modify | Show comment tooltip on hover |
| `js/content_script/selection_toolbar.js` | **Create** | `SelectionToolbar` class — all toolbar UI and logic |
| `js/content_script/main.js` | Modify | Init `SelectionToolbar` |
| `tests/e2e/selection-toolbar.spec.js` | **Create** | Playwright E2E tests |

---

## Task 1: Worktree and Branch Setup

**Files:** none

- [ ] **Step 1: Pull latest master and create worktree**

```bash
git checkout master
git pull origin master
git worktree add ../super-simple-highlighter-toolbar feature/floating-toolbar
cd ../super-simple-highlighter-toolbar
```

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: clean working tree on branch `feature/floating-toolbar`

---

## Task 2: DB — comment field

**Files:**
- Modify: `js/shared/db.js`

- [ ] **Step 1: Add `COMMENT` to `DB.DOCUMENT.NAME`**

In `js/shared/db.js`, find `DB.DOCUMENT` at the bottom of the file (around line 764). Add `COMMENT` to the `NAME` object:

```js
DB.DOCUMENT = {
  VERB: {
    CREATE: 'create',
    DELETE: 'delete'
  },
  NAME: {
    MATCH: 'match',
    DATE: 'date',
    VERB: 'verb',
    RANGE: 'range',
    CLASS_NAME: 'className',
    TEXT: 'text',
    TITLE: 'title',
    CORRESPONDING_DOC_ID: 'correspondingDocumentId',
    VERSION: 'v',
    COMMENT: 'comment',   // ADD THIS
  }
}
```

- [ ] **Step 2: Extend `putCreateDocument()` to accept `comment`**

Find `putCreateDocument()` (around line 321). The optionals destructuring currently reads `{ title = undefined, date = Date.now() } = {}`. Change to:

```js
putCreateDocument(match, xrange, className, text, {
  title = undefined,
  date = Date.now(),
  comment = undefined,
} = {}, options = {}) {
```

Then inside the method, after the `if (typeof title === 'string')` block, add:

```js
if (typeof comment === 'string') {
  doc[DB.DOCUMENT.NAME.COMMENT] = comment
}
```

- [ ] **Step 3: Extend `updateCreateDocument()` to accept `comment`**

Find `updateCreateDocument()` (around line 358). Change the destructured params:

```js
updateCreateDocument(docId, {
  className=undefined,
  title=undefined,
  comment=undefined,
} = {}, options = {}) {
```

Update the no-op guard to include `comment`:

```js
if (className === doc[DB.DOCUMENT.NAME.CLASS_NAME] &&
    title === doc[DB.DOCUMENT.NAME.TITLE] &&
    comment === doc[DB.DOCUMENT.NAME.COMMENT]) {
  // fake success
  return { ok: true, id: doc._id, rev: doc._rev }
}
```

Add the comment assignment using a type check (not truthiness, so empty string clears the field):

```js
if (typeof comment === 'string') {
  doc[DB.DOCUMENT.NAME.COMMENT] = comment
}
```

- [ ] **Step 4: Verify existing tests still pass**

```bash
npx playwright test
```

Expected: all existing tests pass

- [ ] **Step 5: Commit**

```bash
git add js/shared/db.js
git commit -m "feat: add comment field to DB create document"
```

---

## Task 3: `Highlighter.create()` — thread comment through

**Files:**
- Modify: `js/shared/highlighter.js`

- [ ] **Step 1: Add `comment` option to `create()`**

Find `create(xrange, match, text, className)` (line 44). Change to:

```js
create(xrange, match, text, className, { comment } = {}) {
```

- [ ] **Step 2: Pass `comment` into `putCreateDocument`**

Find the `putCreateDocument` call (around line 75). Change:

```js
return db.putCreateDocument(match, xrange, className, text, optional)
```

to:

```js
if (typeof comment === 'string') {
  optional.comment = comment
}
return db.putCreateDocument(match, xrange, className, text, optional)
```

- [ ] **Step 3: Commit**

```bash
git add js/shared/highlighter.js
git commit -m "feat: thread comment option through Highlighter.create()"
```

---

## Task 4: Background message handler — `CREATE_HIGHLIGHT_FROM_PAGE`

**Files:**
- Modify: `js/background/chrome_runtime_handler.js`

- [ ] **Step 1: Add new message constant**

At the bottom of the file, find `ChromeRuntimeHandler.MESSAGE`. Add:

```js
ChromeRuntimeHandler.MESSAGE = {
  DELETE_HIGHLIGHT: 'delete_highlight',
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page',  // ADD
  UPDATE_HIGHLIGHT_COMMENT:   'update_highlight_comment',    // ADD
}
```

- [ ] **Step 2: Add `CREATE_HIGHLIGHT_FROM_PAGE` handler in `onMessage`**

Inside the `switch (message.id)` block, add a new case before `default:`:

```js
case ChromeRuntimeHandler.MESSAGE.CREATE_HIGHLIGHT_FROM_PAGE:
  asynchronous = true

  ;(async () => {
    try {
      const match = DB.formatMatch(sender.tab.url)
      await new Highlighter(sender.tab.id).create(
        message.xrange,
        match,
        message.text,
        message.className,
        { comment: message.comment }
      )
      sendResponse(true)
    } catch (e) {
      console.error('CREATE_HIGHLIGHT_FROM_PAGE error:', e)
      sendResponse(false)
    }
  })()
  break
```

- [ ] **Step 3: Add `UPDATE_HIGHLIGHT_COMMENT` handler**

```js
case ChromeRuntimeHandler.MESSAGE.UPDATE_HIGHLIGHT_COMMENT:
  asynchronous = true

  ;(async () => {
    try {
      await new DB().updateCreateDocument(message.highlightId, {
        comment: message.comment
      })
      await new ChromeTabs(sender.tab.id).setHighlightComment(
        message.highlightId,
        message.comment
      )
      sendResponse(true)
    } catch (e) {
      console.error('UPDATE_HIGHLIGHT_COMMENT error:', e)
      sendResponse(false)
    }
  })()
  break
```

- [ ] **Step 4: Commit**

```bash
git add js/background/chrome_runtime_handler.js
git commit -m "feat: add CREATE_HIGHLIGHT_FROM_PAGE and UPDATE_HIGHLIGHT_COMMENT background handlers"
```

---

## Task 5: `ChromeTabs` — `SET_HIGHLIGHT_COMMENT` + comment in `createHighlight` + `playbackDocuments`

**Files:**
- Modify: `js/shared/chrome_tabs.js`

- [ ] **Step 1: Add `SET_HIGHLIGHT_COMMENT` to `ChromeTabs.MESSAGE_ID`**

Find `ChromeTabs.MESSAGE_ID` at the bottom of the file (around line 693). Add:

```js
ChromeTabs.MESSAGE_ID = {
  // ... existing ...
  SET_HIGHLIGHT_COMMENT: 'set_highlight_comment',  // ADD
}
```

- [ ] **Step 2: Add `setHighlightComment()` instance method**

After the `getHoveredHighlightID()` method (around line 474), add:

```js
/**
 * Set or clear the comment on a highlight in the DOM
 *
 * @param {string} highlightId - #id of (first) highlight mark element
 * @param {string} comment - comment text; empty string clears the comment
 * @param {MessageOptions} [options] - message options
 * @returns {Promise<boolean>}
 * @memberof ChromeTabs
 */
setHighlightComment(highlightId, comment, options) {
  return this.sendMessage(ChromeTabs.MESSAGE_ID.SET_HIGHLIGHT_COMMENT, {
    highlightId,
    comment,
  }, options)
}
```

- [ ] **Step 3: Extend `createHighlight()` to include `comment` in message payload**

Find `createHighlight(range, className, highlightId, version, options)` (around line 307). Add `comment` to the message payload (not as a positional arg — `options` stays fifth):

```js
createHighlight(range, className, highlightId, version, options) {
  return this.sendMessage(ChromeTabs.MESSAGE_ID.CREATE_HIGHLIGHT, {
    range: range,
    highlightId: highlightId,
    className: className,
    version: version,
    comment: this._pendingComment,  // see step 4
  }, options)
}
```

Actually, passing `comment` cleanly requires it in the method signature. Add it before `options`:

```js
createHighlight(range, className, highlightId, version, comment, options) {
  return this.sendMessage(ChromeTabs.MESSAGE_ID.CREATE_HIGHLIGHT, {
    range: range,
    highlightId: highlightId,
    className: className,
    version: version,
    comment: comment,
  }, options)
}
```

> **Note:** This adds `comment` as the new fifth positional argument. All existing callers that don't pass `comment` (context menu, undo, etc.) will see `undefined` for `comment`, which is safe — `createHighlight` in the content script checks `typeof comment === 'string'` before using it.

- [ ] **Step 4: Extend `playbackDocuments()` to forward comment**

Find `playbackDocuments()` (around line 500). Find the `DB.DOCUMENT.VERB.CREATE` case and update the `createHighlight` call:

```js
case DB.DOCUMENT.VERB.CREATE:
  sum++
  const version = doc[DB.DOCUMENT.NAME.VERSION] || 3
  return this.createHighlight(
    doc[DB.DOCUMENT.NAME.RANGE],
    doc[DB.DOCUMENT.NAME.CLASS_NAME],
    doc._id,
    version,
    doc[DB.DOCUMENT.NAME.COMMENT],  // ADD — undefined if no comment, that's fine
  )
```

- [ ] **Step 5: Add `selection_toolbar.js` to `DEFAULT_SCRIPTS`**

Find `ChromeTabs.DEFAULT_SCRIPTS` (around line 677). Insert before `main.js`:

```js
ChromeTabs.DEFAULT_SCRIPTS = [
  "js/shared/chrome_tabs.js",
  "js/shared/chrome_storage.js",
  "js/shared/chrome_highlight_storage.js",
  "js/shared/utils.js",
  "js/shared/style_sheet_manager.js",
  "js/content_script/marker.js",
  "js/content_script/dom_events_handler.js",
  "js/content_script/chrome_storage_handler.js",
  "js/content_script/chrome_runtime_handler.js",
  "js/content_script/selection_toolbar.js",   // ADD
  "js/content_script/main.js",
]
```

- [ ] **Step 6: Verify existing tests pass**

```bash
npx playwright test
```

Expected: all existing tests pass

- [ ] **Step 7: Commit**

```bash
git add js/shared/chrome_tabs.js
git commit -m "feat: add SET_HIGHLIGHT_COMMENT, extend createHighlight and playbackDocuments for comment"
```

---

## Task 6: Content script `ChromeRuntimeHandler` — comment in `createHighlight` + `SET_HIGHLIGHT_COMMENT`

**Files:**
- Modify: `js/content_script/chrome_runtime_handler.js`

- [ ] **Step 1: Add new message IDs to content `ChromeRuntimeHandler.MESSAGE_ID`**

At the bottom of the file, find `ChromeRuntimeHandler.MESSAGE_ID`. Add:

```js
ChromeRuntimeHandler.MESSAGE_ID = {
  DELETE_HIGHLIGHT: 'delete_highlight',
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page',  // ADD
  UPDATE_HIGHLIGHT_COMMENT:   'update_highlight_comment',    // ADD
}
```

- [ ] **Step 2: Extend `createHighlight()` to accept and apply `comment`**

Find the instance method `createHighlight(range, firstHighlightId, className, version = 4)` (around line 207). Change the signature to:

```js
createHighlight(range, firstHighlightId, className, version = 4, comment) {
```

After all the mark elements are created (after the `elms[0].setAttribute('tabindex', '0')` line, around line 231), add:

```js
// Set comment data and dot indicator
if (typeof comment === 'string' && comment.length > 0) {
  elms[0].dataset.comment = comment

  // Dot indicator — removed by removeHighlight() via [data-foreign] cleanup
  const dot = this.document.createElement('span')
  dot.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_DOT)
  dot.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] = ''
  elms[0].appendChild(dot)
}
```

- [ ] **Step 3: Add `StyleSheetManager.CLASS_NAME.COMMENT_DOT`**

Open `js/shared/style_sheet_manager.js`. Find `StyleSheetManager.CLASS_NAME` (search for `CLASS_NAME`). Add:

```js
StyleSheetManager.CLASS_NAME = {
  // ... existing (CLOSE, etc.) ...
  COMMENT_DOT: 'ssh-comment-dot',  // ADD
}
```

- [ ] **Step 4: Handle `CREATE_HIGHLIGHT` message to pass `comment` through**

In the content `ChromeRuntimeHandler.onMessage()` switch, find the `CREATE_HIGHLIGHT` case (around line 77). It currently calls:

```js
const elms = this.createHighlight(range, highlightId, className, version)
```

Change to pass `comment`:

```js
const elms = this.createHighlight(range, highlightId, className, version, message.comment)
```

- [ ] **Step 5: Add `SET_HIGHLIGHT_COMMENT` case to `onMessage`**

Inside the switch, add before `default:`:

```js
case ChromeTabs.MESSAGE_ID.SET_HIGHLIGHT_COMMENT: {
  const elm = this.document.getElementById(message.highlightId)
  if (!elm) break

  if (typeof message.comment === 'string' && message.comment.length > 0) {
    elm.dataset.comment = message.comment
    // Add dot if not already present
    if (!elm.querySelector(`.${StyleSheetManager.CLASS_NAME.COMMENT_DOT}`)) {
      const dot = this.document.createElement('span')
      dot.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_DOT)
      dot.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] = ''
      elm.appendChild(dot)
    }
  } else {
    // Clear comment
    delete elm.dataset.comment
    const dot = elm.querySelector(`.${StyleSheetManager.CLASS_NAME.COMMENT_DOT}`)
    if (dot) dot.remove()
  }
  response = true
  break
}
```

- [ ] **Step 6: Preserve `data-comment` after `updateHighlight()`**

Find the `updateHighlight(highlightId, newClassName)` method (around line 251). After the `Marker.update()` call, re-apply `data-comment` as a safeguard:

```js
updateHighlight(highlightId, newClassName) {
  const whitelist = [this.styleSheetManager.sharedHighlightClassName]
  const elements = new Marker(this.document).update(highlightId, newClassName, whitelist)

  // Re-apply data-comment — Marker.update() doesn't replace elements but guard defensively
  const firstElm = elements[0]
  if (firstElm && firstElm.dataset.comment) {
    // Already preserved; nothing needed — kept for documentation clarity
  }

  return elements
}
```

> **Note:** `Marker.update()` modifies classList on existing elements without replacing them, so `dataset.comment` is preserved. The re-read is a no-op but documents the invariant explicitly.

- [ ] **Step 7: Commit**

```bash
git add js/content_script/chrome_runtime_handler.js js/shared/style_sheet_manager.js
git commit -m "feat: extend content ChromeRuntimeHandler for comment data-attribute and dot indicator"
```

---

## Task 7: `DOMEventsHandler` — comment tooltip on hover

**Files:**
- Modify: `js/content_script/dom_events_handler.js`

- [ ] **Step 1: Add tooltip show logic to `onEnterInDocument()`**

Find `onEnterInDocument()` (around line 58). After the early return when no close button exists (after `firstElm.appendChild(closeElm)` block), add a check for `data-comment`:

Actually, the tooltip should live independently of the close button logic. After determining `firstElm`, add:

```js
// Show comment tooltip if comment exists
if (firstElm.dataset.comment) {
  this._showCommentTooltip(firstElm)
}
```

- [ ] **Step 2: Add tooltip hide logic to `onLeaveOutDocument()`**

Find `onLeaveOutDocument()` (around line 115). At the end of the method (after the hysteresis timer logic), add:

```js
// Hide comment tooltip
this._hideCommentTooltip()
```

- [ ] **Step 3: Add `_showCommentTooltip()` and `_hideCommentTooltip()` methods**

Add these two private methods to the class:

```js
/**
 * Show a tooltip above the highlight element with the comment text
 *
 * @private
 * @param {HTMLElement} markElm - first <mark> element of the highlight
 */
_showCommentTooltip(markElm) {
  this._hideCommentTooltip()

  const tooltip = this.document.createElement('div')
  tooltip.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_TOOLTIP)
  // textContent — never innerHTML — prevents XSS
  tooltip.textContent = markElm.dataset.comment

  const rect = markElm.getBoundingClientRect()
  tooltip.style.cssText = `
    all: initial;
    position: fixed;
    background: #2c2c2c;
    color: #fff;
    border-radius: 8px;
    padding: 7px 12px;
    font: 13px/1.5 -apple-system, sans-serif;
    max-width: 260px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    pointer-events: none;
    z-index: 2147483647;
    white-space: normal;
    word-break: break-word;
    left: ${Math.round(rect.left)}px;
    top: ${Math.round(rect.top - 48)}px;
  `

  this.document.body.appendChild(tooltip)
  this._commentTooltip = tooltip
}

/**
 * Remove comment tooltip from DOM
 *
 * @private
 */
_hideCommentTooltip() {
  if (this._commentTooltip) {
    this._commentTooltip.remove()
    this._commentTooltip = null
  }
}
```

- [ ] **Step 4: Add `COMMENT_TOOLTIP` to `StyleSheetManager.CLASS_NAME`**

In `js/shared/style_sheet_manager.js`, add to `StyleSheetManager.CLASS_NAME`:

```js
COMMENT_TOOLTIP: 'ssh-comment-tooltip',  // ADD
```

- [ ] **Step 5: Add dot indicator CSS**

In `js/shared/style_sheet_manager.js`, find where the close button CSS is generated (in `updateStyleSheet()` or similar). Add the dot and tooltip CSS alongside the close button styles. The styles need to be inserted via the existing stylesheet injection mechanism.

Find how `StyleSheetManager.CLASS_NAME.CLOSE` is styled (likely in `updateStyleSheet()` or a similar method that builds a CSS string). Add after the close button rules:

```css
.ssh-comment-dot {
  all: initial;
  position: absolute;
  top: -3px;
  right: -4px;
  width: 8px;
  height: 8px;
  background: #4a90d9;
  border-radius: 50%;
  border: 1.5px solid white;
  pointer-events: none;
  display: inline-block;
}
```

> **Note:** Read `js/shared/style_sheet_manager.js` in full before this step to understand exactly how CSS is assembled and inserted. The class uses `document.adoptedStyleSheets` or `document.createElement('style')` — follow the existing pattern precisely.

- [ ] **Step 6: Commit**

```bash
git add js/content_script/dom_events_handler.js js/shared/style_sheet_manager.js
git commit -m "feat: add comment tooltip on highlight hover"
```

---

## Task 8: `SelectionToolbar` — new class

**Files:**
- Create: `js/content_script/selection_toolbar.js`

- [ ] **Step 1: Write the failing E2E test first**

Create `tests/e2e/selection-toolbar.spec.js`:

```js
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

/** Helper: load test page, inject content scripts, select the target text */
async function setupPage() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
  const page = await context.newPage()
  await page.goto(pageUrl)
  await page.waitForLoadState('domcontentloaded')

  // Ping-then-inject: trigger content script injection by sending a ping via SW
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab) await new ChromeTabs(tab.id).sendMessage('ping', {}, { ping: false }).catch(() => {})
  }, pageUrl)

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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx playwright test tests/e2e/selection-toolbar.spec.js
```

Expected: all tests fail (toolbar class doesn't exist yet)

- [ ] **Step 3: Create `js/content_script/selection_toolbar.js`**

```js
/**
 * Floating selection toolbar
 * Appears above text selections with pen (highlight) and comment buttons.
 *
 * @class SelectionToolbar
 */
class SelectionToolbar {
  /**
   * @param {StyleSheetManager} styleSheetManager
   * @param {Document} [doc=window.document]
   */
  constructor(styleSheetManager, doc = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = doc
    this._toolbarElm = null
    this._activeClassName = null
    this._state = 'hidden' // 'hidden' | 'idle' | 'comment'
    this._dismissListeners = []
  }

  /**
   * Initialize: inject styles, resolve active style, attach selection listener
   * @returns {SelectionToolbar}
   */
  init() {
    this._injectStyles()
    this._resolveActiveClassName()
    this.document.addEventListener('mouseup', this._onMouseUp.bind(this), { passive: true })
    return this
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Inject toolbar CSS as a <style> element */
  _injectStyles() {
    const style = this.document.createElement('style')
    style.textContent = `
      .ssh-toolbar-root {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        background: #2c2c2c;
        border-radius: 20px;
        padding: 6px 10px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        font-family: -apple-system, sans-serif;
        white-space: nowrap;
        transform: translateX(-50%);
      }
      .ssh-toolbar-root * { box-sizing: border-box; }
      .ssh-toolbar-pen, .ssh-toolbar-comment, .ssh-toolbar-save, .ssh-toolbar-cancel {
        all: initial;
        cursor: pointer;
        border-radius: 14px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        border: none;
      }
      .ssh-toolbar-comment { background: transparent; color: #ccc; }
      .ssh-toolbar-save {
        all: initial;
        background: #4a90d9;
        border: none;
        border-radius: 10px;
        padding: 5px 14px;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-save:disabled { opacity: 0.4; cursor: default; }
      .ssh-toolbar-cancel {
        all: initial;
        background: transparent;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-divider {
        all: initial;
        display: inline-block;
        width: 1px;
        height: 18px;
        background: #555;
      }
      .ssh-toolbar-input {
        all: initial;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 10px;
        padding: 5px 12px;
        color: #fff;
        font-size: 12px;
        width: 200px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-input::placeholder { color: #666; }
      .ssh-toolbar-caret {
        all: initial;
        display: block;
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #2c2c2c;
      }
    `
    this.document.head.appendChild(style)
  }

  /** Load and cache the active highlight class name */
  _resolveActiveClassName() {
    new ChromeHighlightStorage().getAll().then(({ highlightDefinitions }) => {
      if (highlightDefinitions && highlightDefinitions.length > 0) {
        this._activeClassName = highlightDefinitions[0].className
        this._activeBgColor = (highlightDefinitions[0].style || {})['background-color'] || '#ffffaa'
      }
    }).catch(() => {})
  }

  /** mouseup handler — show toolbar if selection is non-empty */
  _onMouseUp(event) {
    // Ignore clicks inside the toolbar itself
    if (this._toolbarElm && this._toolbarElm.contains(event.target)) return

    const sel = this.document.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this._dismiss()
      return
    }

    const range = sel.getRangeAt(0)
    if (range.collapsed) {
      this._dismiss()
      return
    }

    this._showIdle(range)
  }

  /** Show State 1: pen + comment buttons */
  _showIdle(range) {
    this._dismiss()
    this._state = 'idle'

    const rect = range.getBoundingClientRect()
    const toolbar = this.document.createElement('div')
    toolbar.className = 'ssh-toolbar-root'

    // Pen button
    const pen = this.document.createElement('button')
    pen.className = 'ssh-toolbar-pen'
    pen.title = 'Highlight'
    pen.textContent = '✏️'
    pen.style.background = this._activeBgColor || '#ffffaa'
    pen.addEventListener('click', () => this._onPenClick(range), { once: true })

    // Divider
    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    // Comment button
    const comment = this.document.createElement('button')
    comment.className = 'ssh-toolbar-comment'
    comment.title = 'Comment & Highlight'
    comment.textContent = '💬'
    comment.addEventListener('click', () => this._onCommentClick(range), { once: true })

    // Caret
    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    toolbar.append(pen, divider, comment, caret)
    this._position(toolbar, rect)
    this.document.body.appendChild(toolbar)
    this._toolbarElm = toolbar

    this._attachDismissListeners()
  }

  /** Expand toolbar to State 2: comment input */
  _showCommentInput(highlightId) {
    if (!this._toolbarElm) return
    this._state = 'comment'

    // Remove dismiss listeners while in comment mode (selection collapses on input focus)
    this._detachDismissListeners()

    this._toolbarElm.innerHTML = ''

    const icon = this.document.createElement('span')
    icon.textContent = '💬'
    icon.style.cssText = 'font-size:13px'

    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    const input = this.document.createElement('input')
    input.className = 'ssh-toolbar-input'
    input.placeholder = 'Add a comment…'
    input.maxLength = 1000
    input.type = 'text'

    const save = this.document.createElement('button')
    save.className = 'ssh-toolbar-save'
    save.textContent = 'Save'
    save.disabled = true

    const cancel = this.document.createElement('button')
    cancel.className = 'ssh-toolbar-cancel'
    cancel.textContent = '×'

    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    input.addEventListener('input', () => {
      save.disabled = input.value.trim().length === 0
    })

    const doSave = () => {
      const comment = input.value.trim()
      if (!comment) return
      ChromeRuntimeHandler.sendMessage({
        id: ChromeRuntimeHandler.MESSAGE_ID.UPDATE_HIGHLIGHT_COMMENT,
        highlightId,
        comment,
      }).catch(console.error)
      this._dismiss()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') this._dismiss()
    })
    save.addEventListener('click', doSave)
    cancel.addEventListener('click', () => this._dismiss())

    this._toolbarElm.append(icon, divider, input, save, cancel, caret)

    // Re-attach scroll/outside-click dismiss (but not selectionchange)
    this._attachDismissListeners({ skipSelectionChange: true })

    requestAnimationFrame(() => input.focus())
  }

  /** Pen click: highlight with active style */
  _onPenClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()
    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange,
      text,
      className: this._activeClassName,
    }).catch(console.error)
    this._dismiss()
  }

  /** Comment click: highlight immediately, then expand to comment input */
  _onCommentClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()

    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange,
      text,
      className: this._activeClassName,
    }).then(highlightId => {
      if (highlightId) {
        this._showCommentInput(highlightId)
      } else {
        this._dismiss()
      }
    }).catch(() => this._dismiss())
  }

  /** Position toolbar centered above rect using fixed coords */
  _position(toolbar, rect) {
    // Use rAF to measure toolbar width after it's in DOM flow
    // For now place at selection center; width correction applied after mount in _showIdle
    const top = rect.top < 60
      ? rect.bottom + 10
      : rect.top - 46

    toolbar.style.left = `${Math.round(rect.left + rect.width / 2)}px`
    toolbar.style.top = `${Math.round(top)}px`
  }

  /** Attach one-time dismiss listeners */
  _attachDismissListeners({ skipSelectionChange = false } = {}) {
    this._detachDismissListeners()

    const onMouseDown = (e) => {
      if (this._toolbarElm && !this._toolbarElm.contains(e.target)) {
        this._dismiss()
      }
    }
    const onScroll = () => this._dismiss()

    this.document.addEventListener('mousedown', onMouseDown, { capture: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    this._dismissListeners.push(
      () => this.document.removeEventListener('mousedown', onMouseDown, { capture: true }),
      () => window.removeEventListener('scroll', onScroll),
    )

    if (!skipSelectionChange) {
      const onSelectionChange = () => {
        const sel = this.document.getSelection()
        if (sel && sel.isCollapsed) this._dismiss()
      }
      this.document.addEventListener('selectionchange', onSelectionChange, { passive: true })
      this._dismissListeners.push(
        () => this.document.removeEventListener('selectionchange', onSelectionChange)
      )
    }
  }

  _detachDismissListeners() {
    for (const fn of this._dismissListeners) fn()
    this._dismissListeners = []
  }

  /** Remove toolbar and clean up */
  _dismiss() {
    this._detachDismissListeners()
    if (this._toolbarElm) {
      this._toolbarElm.remove()
      this._toolbarElm = null
    }
    this._state = 'hidden'

    // Refresh active style for next show
    this._resolveActiveClassName()
  }
}
```

> **Note:** `_onCommentClick()` expects the background's `CREATE_HIGHLIGHT_FROM_PAGE` handler to respond with the new highlight's `_id` (the document ID). Verify the background handler calls `sendResponse(response.id)` not just `sendResponse(true)`. If it currently responds with `true`, update the background handler to respond with the document ID.

- [ ] **Step 4: Run E2E tests**

```bash
npx playwright test tests/e2e/selection-toolbar.spec.js
```

Expected: tests pass (or debug failures one by one)

- [ ] **Step 5: Commit**

```bash
git add js/content_script/selection_toolbar.js tests/e2e/selection-toolbar.spec.js
git commit -m "feat: add SelectionToolbar class with pen and comment actions"
```

---

## Task 9: Wire up — `main.js`

**Files:**
- Modify: `js/content_script/main.js`

- [ ] **Step 1: Read `main.js` to understand init pattern**

```bash
cat js/content_script/main.js
```

- [ ] **Step 2: Initialize `SelectionToolbar`**

Following the existing pattern for `DOMEventsHandler` and `ChromeRuntimeHandler`, add:

```js
new SelectionToolbar(styleSheetManager).init()
```

Place it after `DOMEventsHandler` init and before (or after) `ChromeRuntimeHandler` init — order doesn't matter as long as `styleSheetManager` is initialized first.

- [ ] **Step 3: Run full test suite**

```bash
npx playwright test
```

Expected: all tests pass (existing + new)

- [ ] **Step 4: Commit**

```bash
git add js/content_script/main.js
git commit -m "feat: wire up SelectionToolbar in content script main"
```

---

## Task 10: Background handler response — return highlight ID

**Files:**
- Modify: `js/background/chrome_runtime_handler.js`

> This task exists because `SelectionToolbar._onCommentClick()` needs the new document ID to later call `UPDATE_HIGHLIGHT_COMMENT`. The existing `Highlighter.create()` does not currently return the document ID to the caller.

- [ ] **Step 1: Check what `Highlighter.create()` resolves with**

Read `js/shared/highlighter.js` `create()`. Currently it resolves with `undefined` (no explicit return at the end of the chain). It needs to resolve with the document `id`.

- [ ] **Step 2: Update `Highlighter.create()` to resolve with doc ID**

In `js/shared/highlighter.js`, find the `.then(ok => { ... chrome.action.enable(tabs.tabId) })` at the end of `create()`. Change to:

```js
.then(ok => {
  if (!ok) {
    return db.removeDB(doc.id, doc.rev).then(() => {
      return Promise.reject(new Error(`Error creating highlight in DOM - Removing associated document`))
    })
  }
  chrome.action.enable(tabs.tabId)
  return doc.id  // ADD: resolve with the document id
})
```

- [ ] **Step 3: Update background handler to respond with doc ID**

In `js/background/chrome_runtime_handler.js`, the `CREATE_HIGHLIGHT_FROM_PAGE` handler currently does `sendResponse(true)`. Change to:

```js
const docId = await new Highlighter(sender.tab.id).create(...)
sendResponse(docId)  // content script uses this as highlightId for comment
```

- [ ] **Step 4: Run full test suite**

```bash
npx playwright test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add js/background/chrome_runtime_handler.js js/shared/highlighter.js
git commit -m "feat: Highlighter.create() resolves with doc ID for comment linking"
```

---

## Task 11: Final integration check

- [ ] **Step 1: Run full test suite one last time**

```bash
npx playwright test
```

Expected: all tests pass

- [ ] **Step 2: Manual smoke test**
  1. Load the extension in Chrome (`chrome://extensions` → load unpacked)
  2. Navigate to any article page
  3. Select text → toolbar appears
  4. Click pen → highlight created, toolbar dismissed
  5. Select text again → click comment → toolbar expands → type comment → press Enter → highlight created with blue dot
  6. Hover the highlighted text → comment tooltip appears
  7. Reload page → highlight and dot still present, tooltip still works

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feature/floating-toolbar
gh pr create --title "feat: floating selection toolbar with highlight and comment" \
  --body "Adds Diigo-style floating toolbar. Pen button highlights with active style; comment button highlights and attaches an annotation. Comments shown as hover tooltips with a blue dot indicator."
```
