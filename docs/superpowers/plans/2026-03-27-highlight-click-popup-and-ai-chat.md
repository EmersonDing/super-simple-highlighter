# Highlight Click Popup & AI Chat Side Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-manage popup on highlights (delete + comment) and an embedded AI chat side panel with BYOK for GPT/Gemini.

**Architecture:** Feature 1 modifies `DOMEventsHandler` to show a click popup instead of hover ×. Feature 2 adds a new `ChatPanel` content script for the side panel UI, a background `onConnect` handler for streaming API relay, and settings page fields for API keys. The AI toolbar button switches from URL-open to opening the chat panel.

**Tech Stack:** Chrome Extension MV3, plain JavaScript, AngularJS (options page), chrome.runtime.Port (streaming), OpenAI & Gemini REST APIs with SSE.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/content/dom_events_handler.js` | Replace hover × with click popup (delete + comment) |
| Modify | `src/shared/style_sheet_manager.js` | Remove CLOSE button styles, keep COMMENT_DOT |
| Create | `src/content/chat_panel.js` | Side panel DOM, floating tab, message rendering, streaming, port |
| Modify | `src/content/selection_toolbar.js` | Replace AI URL-open with chat panel open; remove old AI helpers |
| Modify | `src/content/main.js` | Init ChatPanel |
| Modify | `src/background/chrome_runtime_handler.js` | Add `onConnect` for chat streaming |
| Modify | `src/background/main.js` | Register `onConnect` listener |
| Modify | `src/shared/chrome_storage.js` | Add CHAT_PROVIDER, CHAT_API_KEY_GPT, CHAT_API_KEY_GEMINI keys |
| Modify | `src/shared/chrome_tabs.js` | Add `chat_panel.js` to DEFAULT_SCRIPTS |
| Modify | `src/options/options.html` | Replace AI search dropdown with AI Chat settings section |
| Modify | `src/options/controllers/styles.js` | Load/save chat API keys from chrome.storage.local |
| Modify | `manifest.json` | Add host_permissions for OpenAI + Gemini APIs |
| Create | `tests/e2e/highlight-click-popup.spec.js` | E2E tests for click popup |
| Create | `tests/e2e/chat-panel.spec.js` | E2E tests for chat panel UI |
| Modify | `tests/e2e/CLAUDE.md` | Document new spec files |

---

## Task 1: Remove hover × close button from DOMEventsHandler

**Files:**
- Modify: `src/shared/style_sheet_manager.js:79-113` (remove CLOSE rules from `init()`)
- Modify: `src/shared/style_sheet_manager.js:239-244` (remove CLASS_NAME.CLOSE)
- Modify: `src/shared/style_sheet_manager.js:264-277` (remove DECLARATIONS.CLOSE)
- Modify: `src/shared/style_sheet_manager.js:291-293` (remove DECLARATIONS.CLOSE_HOVER_FOCUS)
- Modify: `src/shared/style_sheet_manager.js:296-315` (remove ANIMATION_KEYFRAMES)
- Modify: `src/content/dom_events_handler.js`

- [ ] **Step 1: Remove CLOSE button CSS from StyleSheetManager**

In `src/shared/style_sheet_manager.js`, remove the following from `init()` rules array (lines 86-93):

```javascript
// REMOVE these two rules from the rules array:
`.${this.sharedHighlightClassName} .${StyleSheetManager.CLASS_NAME.CLOSE} {
    ${StyleSheetManager.DECLARATIONS.CLOSE}
    animation-name: ${buttonPopInAnimationName}
}`,

`.${this.sharedHighlightClassName} .${StyleSheetManager.CLASS_NAME.CLOSE}:hover,
 .${this.sharedHighlightClassName} .${StyleSheetManager.CLASS_NAME.CLOSE}:focus {
    ${StyleSheetManager.DECLARATIONS.CLOSE_HOVER_FOCUS}
}`,
```

Also remove the two `@keyframes` rules (lines 107-112) and the `buttonPopInAnimationName`, `buttonPopOutAnimationName` variables (lines 73-77), and `this.buttonPopOutAnimation` (line 77).

Remove from static properties:
- `StyleSheetManager.CLASS_NAME.CLOSE` (line 241)
- `StyleSheetManager.DECLARATIONS.CLOSE` (lines 264-277)
- `StyleSheetManager.DECLARATIONS.CLOSE_HOVER_FOCUS` (lines 291-293)
- `StyleSheetManager.ANIMATION_KEYFRAMES` (lines 296-315)

- [ ] **Step 2: Strip hover × logic from DOMEventsHandler**

Replace the entire body of `src/content/dom_events_handler.js` with click-popup logic. Remove `onEnterInDocument` hover logic (the close-button creation), `onLeaveOutDocument` timer logic, `onClickClose`, and `DOMEventsHandler.CLOSE_BUTTON` static. Keep `_showCommentTooltip` and `_hideCommentTooltip` (hover tooltip stays).

New `DOMEventsHandler`:

```javascript
class DOMEventsHandler {
  constructor(styleSheetManager, document = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = document
    this._popupElm = null
    this._dismissListeners = []
  }

  init() {
    // Click listener for highlight action popup
    this.document.addEventListener('click', this._onClick.bind(this), { capture: true, passive: true })

    // Hover listeners for comment tooltip (read-only preview)
    const listenerOptions = { capture: true, passive: true }
    for (const type of ['mouseenter', 'focusin']) {
      this.document.addEventListener(type, this._onEnter.bind(this), listenerOptions)
    }
    for (const type of ['mouseleave', 'focusout']) {
      this.document.addEventListener(type, this._onLeave.bind(this), listenerOptions)
    }

    return this
  }

  _onClick(event) {
    const target = event.target

    // Dismiss existing popup if clicking outside it
    if (this._popupElm && !this._popupElm.contains(target)) {
      this._dismissPopup()
    }

    // Only open popup on highlight mark elements
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) {
      return
    }

    // Selection guard: don't interfere with the selection toolbar
    const sel = this.document.getSelection()
    if (sel && !sel.isCollapsed) return

    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) return

    const firstElm = elms[0]
    const rect = target.getBoundingClientRect()
    this._showActionPopup(firstElm.id, rect, firstElm.dataset.comment)
  }

  _showActionPopup(highlightId, anchorRect, existingComment) {
    this._dismissPopup()

    const popup = this.document.createElement('div')
    popup.className = 'ssh-highlight-popup'

    const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M8 10h16M13 10V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 10v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10" stroke="#e5e5ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const COMMENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="${existingComment ? '#4a90d9' : '#e5e5ea'}"/><path d="M10 23 L9 30 L18 23" fill="${existingComment ? '#4a90d9' : '#e5e5ea'}"/></svg>`

    const deleteBtn = this.document.createElement('button')
    deleteBtn.className = 'ssh-highlight-popup-btn'
    deleteBtn.title = 'Delete highlight'
    deleteBtn.innerHTML = TRASH_SVG
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      ChromeRuntimeHandler.deleteHighlight(highlightId).catch(console.error)
      this._dismissPopup()
    }, { once: true })

    const divider = this.document.createElement('span')
    divider.className = 'ssh-highlight-popup-divider'

    const commentBtn = this.document.createElement('button')
    commentBtn.className = 'ssh-highlight-popup-btn'
    commentBtn.title = existingComment ? 'Edit comment' : 'Add comment'
    commentBtn.innerHTML = COMMENT_SVG
    commentBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const markElm = this.document.getElementById(highlightId)
      this.document.dispatchEvent(new CustomEvent('ssh-edit-comment', {
        detail: {
          highlightId,
          comment: markElm ? markElm.dataset.comment || '' : '',
          anchorRect: anchorRect,
        }
      }))
      this._dismissPopup()
    }, { once: true })

    const caret = this.document.createElement('span')
    caret.className = 'ssh-highlight-popup-caret'

    popup.append(deleteBtn, divider, commentBtn, caret)

    // Position above the clicked element
    this.document.body.appendChild(popup)
    const popupRect = popup.getBoundingClientRect()
    const verticalOffset = 8
    const top = anchorRect.top < popupRect.height + verticalOffset
      ? anchorRect.bottom + verticalOffset
      : anchorRect.top - popupRect.height - verticalOffset
    const maxLeft = Math.max(0, window.innerWidth - popupRect.width - 8)
    const left = Math.min(Math.max(0, anchorRect.left), maxLeft)
    popup.style.left = `${Math.round(left)}px`
    popup.style.top = `${Math.round(top)}px`

    this._popupElm = popup
    this._attachDismissListeners()
  }

  _attachDismissListeners() {
    this._detachDismissListeners()

    const onKeyDown = (e) => { if (e.key === 'Escape') this._dismissPopup() }
    const onScroll = () => this._dismissPopup()

    this.document.addEventListener('keydown', onKeyDown, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    this._dismissListeners.push(
      () => this.document.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('scroll', onScroll),
    )
  }

  _detachDismissListeners() {
    for (const fn of this._dismissListeners) fn()
    this._dismissListeners = []
  }

  _dismissPopup() {
    this._detachDismissListeners()
    if (this._popupElm) {
      this._popupElm.remove()
      this._popupElm = null
    }
  }

  _onEnter(event) {
    const target = event.target
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) return

    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) return

    const firstElm = elms[0]
    if (firstElm.dataset.comment) {
      this._showCommentTooltip(firstElm)
    }
  }

  _onLeave(event) {
    const target = event.target
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) return
    this._hideCommentTooltip()
  }

  _showCommentTooltip(markElm) {
    this._hideCommentTooltip()

    const tooltip = this.document.createElement('div')
    tooltip.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_TOOLTIP)
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

  _hideCommentTooltip() {
    if (this._commentTooltip) {
      this._commentTooltip.remove()
      this._commentTooltip = null
    }
  }
}
```

- [ ] **Step 3: Add click popup CSS**

Add these styles to `SelectionToolbar._injectStyles()` (in `src/content/selection_toolbar.js`) since it already injects content-script CSS:

```css
.ssh-highlight-popup {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  background: #2c2c2c;
  border-radius: 16px;
  padding: 3px 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  font-family: -apple-system, sans-serif;
  white-space: nowrap;
}
.ssh-highlight-popup-btn {
  all: initial;
  cursor: pointer;
  border-radius: 11px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
}
.ssh-highlight-popup-divider {
  all: initial;
  display: inline-block;
  width: 1px;
  height: 15px;
  background: #555;
}
.ssh-highlight-popup-caret {
  all: initial;
  display: block;
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #2c2c2c;
}
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npx playwright test tests/e2e/selection-toolbar.spec.js`
Expected: All existing tests pass (hover × removal doesn't affect toolbar tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/dom_events_handler.js src/shared/style_sheet_manager.js src/content/selection_toolbar.js
git commit -m "feat: replace hover × with click-to-manage highlight popup"
```

---

## Task 2: Write E2E tests for click popup

**Files:**
- Create: `tests/e2e/highlight-click-popup.spec.js`

- [ ] **Step 1: Write click popup E2E tests**

Create `tests/e2e/highlight-click-popup.spec.js`:

```javascript
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

async function createHighlight(page, sw, pageUrl) {
  const target = page.locator('#test-text')
  const box = await target.boundingBox()
  await page.mouse.move(box.x + 5, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
  await page.mouse.up()
  await page.waitForTimeout(200)

  // Click the pen button to create a highlight
  const pen = page.locator('.ssh-toolbar-pen')
  await pen.click()
  await page.waitForTimeout(300)

  // Return the first mark element
  return page.locator('mark').first()
}

test('clicking a highlight shows delete and comment popup', async () => {
  const { page } = await setupPage()
  const mark = await createHighlight(page, sw, `http://127.0.0.1:${port}/test-page.html`)

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
  await createHighlight(page, sw, `http://127.0.0.1:${port}/test-page.html`)

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
  await createHighlight(page, sw, `http://127.0.0.1:${port}/test-page.html`)

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
  await createHighlight(page, sw, `http://127.0.0.1:${port}/test-page.html`)

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
  await createHighlight(page, sw, `http://127.0.0.1:${port}/test-page.html`)

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
```

- [ ] **Step 2: Run tests**

Run: `npx playwright test tests/e2e/highlight-click-popup.spec.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/highlight-click-popup.spec.js
git commit -m "test: add E2E tests for highlight click popup"
```

---

## Task 3: Add chat storage keys and manifest permissions

**Files:**
- Modify: `src/shared/chrome_storage.js:122-169`
- Modify: `manifest.json:79-81`

- [ ] **Step 1: Add chat storage keys**

In `src/shared/chrome_storage.js`, add to `ChromeStorage.KEYS` (after `AI_PROVIDER` at line 130):

```javascript
CHAT_PROVIDER: 'chatProvider',
CHAT_API_KEY_GPT: 'chatApiKeyGpt',
CHAT_API_KEY_GEMINI: 'chatApiKeyGemini',
```

Add defaults in `ChromeStorage.DEFAULTS` (after `AI_PROVIDER` default at line 161):

```javascript
[ChromeStorage.KEYS.CHAT_PROVIDER]: 'gemini',
[ChromeStorage.KEYS.CHAT_API_KEY_GPT]: '',
[ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]: '',
```

- [ ] **Step 2: Add host permissions for API endpoints**

In `manifest.json`, the existing `host_permissions` already has `"<all_urls>"` which covers all hosts. No change needed — OpenAI and Gemini API calls from the background worker are already permitted.

Verify by reading `manifest.json` line 79-81:
```json
"host_permissions": [
    "<all_urls>"
]
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/chrome_storage.js
git commit -m "feat: add chat provider and API key storage keys"
```

---

## Task 4: Add AI Chat settings to options page

**Files:**
- Modify: `src/options/options.html:227-243`
- Modify: `src/options/controllers/styles.js:91-124`

- [ ] **Step 1: Replace AI search dropdown with AI Chat settings**

In `src/options/options.html`, replace the AI panel (lines 227-243) with:

```html
<!-- Panel: AI Chat -->
<div class="panel panel-default">
    <div class="panel-heading">AI Chat</div>
    <div class="panel-body">
        <div class="form-group">
            <label class="control-label" style="font-weight:normal;">Chat provider:
                <select class="form-control input-sm" style="display:inline-block; width:auto; margin-left:8px;"
                    ng-model="chatOptions.chatProvider"
                    ng-change="onChangeChatOption()">
                    <option value="gemini">Gemini</option>
                    <option value="gpt">ChatGPT</option>
                </select>
            </label>
        </div>
        <div class="form-group">
            <label class="control-label" style="font-weight:normal;">OpenAI API Key:</label>
            <div class="input-group" style="max-width:400px;">
                <input class="form-control input-sm" ng-type="showGptKey ? 'text' : 'password'"
                    ng-model="chatOptions.chatApiKeyGpt"
                    ng-change="onChangeChatOption()"
                    placeholder="sk-...">
                <span class="input-group-btn">
                    <button class="btn btn-default btn-sm" type="button"
                        ng-click="showGptKey = !showGptKey">
                        {{showGptKey ? 'Hide' : 'Show'}}
                    </button>
                </span>
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <label class="control-label" style="font-weight:normal;">Gemini API Key:</label>
            <div class="input-group" style="max-width:400px;">
                <input class="form-control input-sm" ng-type="showGeminiKey ? 'text' : 'password'"
                    ng-model="chatOptions.chatApiKeyGemini"
                    ng-change="onChangeChatOption()"
                    placeholder="AIza...">
                <span class="input-group-btn">
                    <button class="btn btn-default btn-sm" type="button"
                        ng-click="showGeminiKey = !showGeminiKey">
                        {{showGeminiKey ? 'Hide' : 'Show'}}
                    </button>
                </span>
            </div>
        </div>
        <div class="help-block" style="margin-bottom:0; margin-top:8px;">API keys are stored locally and never synced across devices.</div>
    </div>
</div>
```

- [ ] **Step 2: Add chat options load/save to styles controller**

In `src/options/controllers/styles.js`, after the existing `init()` chain resolves (at the end of `.then(items => { ... })` around line 123), add loading of chat options from `chrome.storage.local`:

```javascript
// At the end of init(), after the existing return:
// Add a separate chain for local storage chat options
new ChromeStorage('local').get([
  ChromeStorage.KEYS.CHAT_PROVIDER,
  ChromeStorage.KEYS.CHAT_API_KEY_GPT,
  ChromeStorage.KEYS.CHAT_API_KEY_GEMINI,
]).then(chatItems => {
  this.scope.chatOptions = chatItems
  this.scope.$apply()
}).catch(() => {
  this.scope.chatOptions = {
    [ChromeStorage.KEYS.CHAT_PROVIDER]: 'gemini',
    [ChromeStorage.KEYS.CHAT_API_KEY_GPT]: '',
    [ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]: '',
  }
})
```

Add to the scope methods (in the constructor or wherever scope methods are defined):

```javascript
this.scope.onChangeChatOption = () => {
  new ChromeStorage('local').set(this.scope.chatOptions)
}
```

Also remove `ChromeStorage.KEYS.AI_PROVIDER` from the sync storage `get()` call (line 104) since the old AI search dropdown is being removed.

- [ ] **Step 3: Run the options page tests to verify no regressions**

Run: `npx playwright test tests/e2e/options-pages.spec.js`
Expected: Existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/options/options.html src/options/controllers/styles.js
git commit -m "feat: add AI Chat settings with BYOK API key fields"
```

---

## Task 5: Create chat panel UI (content script)

**Files:**
- Create: `src/content/chat_panel.js`

- [ ] **Step 1: Create ChatPanel class**

Create `src/content/chat_panel.js`:

```javascript
const CHAT_AI_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 32 32" fill="none"><path d="M16 3 18.8 10.2 26 13 18.8 15.8 16 23 13.2 15.8 6 13l7.2-2.8L16 3Z" fill="#e5e5ea"/><path d="M24.5 19 25.8 22.2 29 23.5 25.8 24.8 24.5 28 23.2 24.8 20 23.5 23.2 22.2 24.5 19Z" fill="#e5e5ea" opacity="0.8"/><circle cx="10" cy="23" r="2" fill="#e5e5ea" opacity="0.75"/></svg>`
const SEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M4 16l24-12-8 12 8 12L4 16z" fill="#e5e5ea"/></svg>`

class ChatPanel {
  constructor(doc = window.document) {
    this.document = doc
    this._panelElm = null
    this._tabElm = null
    this._messagesElm = null
    this._inputElm = null
    this._isOpen = false
    this._messages = [] // { role: 'user'|'assistant', content: string }
    this._port = null
    this._pendingText = ''
    this._selectedContext = null
    this._chatProvider = 'gemini'
  }

  init() {
    this._injectStyles()
    this._createTab()
    this._loadChatProvider()

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes[ChromeStorage.KEYS.CHAT_PROVIDER]) {
        this._chatProvider = changes[ChromeStorage.KEYS.CHAT_PROVIDER].newValue || 'gemini'
      }
    })

    return this
  }

  _loadChatProvider() {
    new ChromeStorage('local').get([ChromeStorage.KEYS.CHAT_PROVIDER]).then(items => {
      this._chatProvider = items[ChromeStorage.KEYS.CHAT_PROVIDER] || 'gemini'
    }).catch(() => {})
  }

  _injectStyles() {
    const style = this.document.createElement('style')
    style.textContent = `
      .ssh-chat-tab {
        all: initial;
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 40px;
        background: #2c2c2c;
        border-radius: 6px 0 0 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483646;
        box-shadow: -2px 0 8px rgba(0,0,0,0.3);
        transition: width 0.15s ease;
      }
      .ssh-chat-tab:hover { width: 16px; }
      .ssh-chat-panel {
        all: initial;
        position: fixed;
        right: 0;
        top: 0;
        width: 350px;
        height: 100vh;
        background: #2c2c2c;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        box-shadow: -4px 0 20px rgba(0,0,0,0.4);
        font-family: -apple-system, sans-serif;
        transition: transform 0.2s ease;
      }
      .ssh-chat-panel.ssh-chat-hidden { transform: translateX(100%); }
      .ssh-chat-panel * { box-sizing: border-box; }
      .ssh-chat-header {
        all: initial;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #444;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-title {
        all: initial;
        color: #e5e5ea;
        font-size: 14px;
        font-weight: 600;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-provider-badge {
        all: initial;
        color: #888;
        font-size: 11px;
        margin-left: 8px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-close {
        all: initial;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-messages {
        all: initial;
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-msg {
        all: initial;
        max-width: 85%;
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
        white-space: pre-wrap;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-msg-user {
        align-self: flex-end;
        background: #4a90d9;
        color: #fff;
      }
      .ssh-chat-msg-assistant {
        align-self: flex-start;
        background: #3a3a3c;
        color: #e5e5ea;
      }
      .ssh-chat-msg-error {
        align-self: center;
        background: #5a2020;
        color: #ff9090;
        font-size: 12px;
      }
      .ssh-chat-context-badge {
        all: initial;
        align-self: center;
        background: #3a3a3c;
        color: #888;
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 8px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input-bar {
        all: initial;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #444;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input {
        all: initial;
        flex: 1;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 10px;
        padding: 8px 12px;
        color: #fff;
        font-size: 13px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input::placeholder { color: #666; }
      .ssh-chat-send {
        all: initial;
        background: #4a90d9;
        border: none;
        border-radius: 10px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .ssh-chat-send:disabled { opacity: 0.4; cursor: default; }
    `
    this.document.head.appendChild(style)
  }

  _createTab() {
    const tab = this.document.createElement('div')
    tab.className = 'ssh-chat-tab'
    tab.title = 'Chat with AI'
    tab.innerHTML = CHAT_AI_SVG_SMALL
    tab.addEventListener('click', () => this.toggle())
    this.document.body.appendChild(tab)
    this._tabElm = tab
  }

  toggle(selectedText) {
    if (this._isOpen) {
      this.close()
    } else {
      this.open(selectedText)
    }
  }

  open(selectedText) {
    if (this._isOpen) return
    this._isOpen = true
    this._selectedContext = selectedText || null
    this._messages = []

    if (this._tabElm) {
      this._tabElm.innerHTML = '\u00D7'
      this._tabElm.style.color = '#888'
      this._tabElm.style.fontSize = '14px'
    }

    this._createPanel()
  }

  close() {
    this._isOpen = false
    this._selectedContext = null
    this._messages = []
    this._pendingText = ''

    if (this._port) {
      this._port.disconnect()
      this._port = null
    }

    if (this._panelElm) {
      this._panelElm.remove()
      this._panelElm = null
      this._messagesElm = null
      this._inputElm = null
    }

    if (this._tabElm) {
      this._tabElm.innerHTML = CHAT_AI_SVG_SMALL
      this._tabElm.style.color = ''
      this._tabElm.style.fontSize = ''
    }
  }

  _createPanel() {
    if (this._panelElm) this._panelElm.remove()

    const panel = this.document.createElement('div')
    panel.className = 'ssh-chat-panel'

    // Header
    const header = this.document.createElement('div')
    header.className = 'ssh-chat-header'

    const titleWrap = this.document.createElement('span')
    const title = this.document.createElement('span')
    title.className = 'ssh-chat-title'
    title.textContent = 'Chat with AI'
    const badge = this.document.createElement('span')
    badge.className = 'ssh-chat-provider-badge'
    badge.textContent = this._chatProvider === 'gpt' ? 'GPT' : 'Gemini'
    titleWrap.append(title, badge)

    const closeBtn = this.document.createElement('span')
    closeBtn.className = 'ssh-chat-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => this.close())

    header.append(titleWrap, closeBtn)

    // Messages
    const messages = this.document.createElement('div')
    messages.className = 'ssh-chat-messages'

    // Context badge
    const contextBadge = this.document.createElement('div')
    contextBadge.className = 'ssh-chat-context-badge'
    if (this._selectedContext) {
      const preview = this._selectedContext.length > 60
        ? this._selectedContext.substring(0, 60) + '...'
        : this._selectedContext
      contextBadge.textContent = `Selected: "${preview}"`
    } else {
      contextBadge.textContent = 'Page context'
    }
    messages.appendChild(contextBadge)

    this._messagesElm = messages

    // Input bar
    const inputBar = this.document.createElement('div')
    inputBar.className = 'ssh-chat-input-bar'

    const input = this.document.createElement('input')
    input.className = 'ssh-chat-input'
    input.placeholder = 'Ask about this page...'
    input.type = 'text'

    const sendBtn = this.document.createElement('button')
    sendBtn.className = 'ssh-chat-send'
    sendBtn.innerHTML = SEND_SVG
    sendBtn.disabled = true

    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0
    })

    const doSend = () => {
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      sendBtn.disabled = true
      this._sendMessage(text)
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSend()
    })
    sendBtn.addEventListener('click', doSend)

    inputBar.append(input, sendBtn)
    this._inputElm = input

    panel.append(header, messages, inputBar)
    this.document.body.appendChild(panel)
    this._panelElm = panel

    requestAnimationFrame(() => input.focus())
  }

  _sendMessage(text) {
    this._messages.push({ role: 'user', content: text })
    this._appendBubble('user', text)

    // Create assistant bubble for streaming
    const assistantBubble = this._appendBubble('assistant', '')
    this._pendingText = ''

    // Get page context
    const pageContext = this.document.body.innerText

    // Open port for streaming
    const port = chrome.runtime.connect({ name: 'chat-stream' })
    this._port = port

    port.postMessage({
      messages: this._messages.map(m => ({ role: m.role, content: m.content })),
      provider: this._chatProvider,
      pageContext: pageContext,
      selectedText: this._selectedContext || undefined,
    })

    port.onMessage.addListener((msg) => {
      if (msg.type === 'chunk') {
        this._pendingText += msg.text
        assistantBubble.textContent = this._pendingText
        this._scrollToBottom()
      } else if (msg.type === 'done') {
        this._messages.push({ role: 'assistant', content: this._pendingText })
        this._pendingText = ''
        this._port = null
      } else if (msg.type === 'error') {
        assistantBubble.textContent = msg.message
        assistantBubble.classList.add('ssh-chat-msg-error')
        assistantBubble.classList.remove('ssh-chat-msg-assistant')
        this._port = null
      }
    })

    port.onDisconnect.addListener(() => {
      this._port = null
    })
  }

  _appendBubble(role, text) {
    const bubble = this.document.createElement('div')
    bubble.className = `ssh-chat-msg ssh-chat-msg-${role}`
    bubble.textContent = text
    this._messagesElm.appendChild(bubble)
    this._scrollToBottom()
    return bubble
  }

  _scrollToBottom() {
    if (this._messagesElm) {
      this._messagesElm.scrollTop = this._messagesElm.scrollHeight
    }
  }
}
```

- [ ] **Step 2: Register ChatPanel in content script init and DEFAULT_SCRIPTS**

In `src/content/main.js`, add after the `SelectionToolbar` init:

```javascript
new ChatPanel(document).init()
```

In `src/shared/chrome_tabs.js`, add `"src/content/chat_panel.js"` to `DEFAULT_SCRIPTS` array (before `"src/content/main.js"`):

```javascript
ChromeTabs.DEFAULT_SCRIPTS = [
  "src/shared/chrome_tabs.js",
  "src/shared/chrome_storage.js",
  "src/shared/chrome_highlight_storage.js",
  "src/shared/utils.js",
  "src/shared/style_sheet_manager.js",
  "src/content/marker.js",
  "src/content/dom_events_handler.js",
  "src/content/chrome_storage_handler.js",
  "src/content/chrome_runtime_handler.js",
  "src/content/selection_toolbar.js",
  "src/content/chat_panel.js",  // <-- add this line
  "src/content/main.js",
]
```

- [ ] **Step 3: Commit**

```bash
git add src/content/chat_panel.js src/content/main.js src/shared/chrome_tabs.js
git commit -m "feat: add AI chat panel UI with floating tab trigger"
```

---

## Task 6: Replace AI toolbar button with chat panel opener

**Files:**
- Modify: `src/content/selection_toolbar.js`
- Modify: `src/content/main.js`

- [ ] **Step 1: Store ChatPanel reference and wire AI button**

In `src/content/main.js`, store the `ChatPanel` instance so `SelectionToolbar` can access it:

```javascript
const sharedStyleSheetManager = new StyleSheetManager(window.document).init()

new DOMEventsHandler(sharedStyleSheetManager, document).init()
new ChromeRuntimeHandler(sharedStyleSheetManager, document).init()
new ChromeStorageHandler(sharedStyleSheetManager).init()

const chatPanel = new ChatPanel(document).init()
new SelectionToolbar(sharedStyleSheetManager, document, chatPanel).init()
```

- [ ] **Step 2: Update SelectionToolbar constructor and AI click handler**

In `src/content/selection_toolbar.js`:

Update constructor to accept chatPanel:

```javascript
constructor(styleSheetManager, doc = window.document, chatPanel = null) {
    this.styleSheetManager = styleSheetManager
    this.document = doc
    this._chatPanel = chatPanel
    // ... rest of existing constructor
```

Replace `_onAIClick` method:

```javascript
_onAIClick(range) {
    const text = range.toString().trim()
    this._dismiss()
    if (this._chatPanel) {
      this._chatPanel.open(text || undefined)
    }
}
```

- [ ] **Step 3: Remove old AI URL helpers**

Remove these methods from `SelectionToolbar`:
- `_getAIProviderLabel()` (lines 300-306)
- `_buildAIUrl()` (lines 308-319)
- `_normalizeAIProvider()` (lines 186-188)

Remove `_aiProvider` from constructor (line 35).

Remove AI_PROVIDER from `_resolveToolbarSettings()` (lines 176-183) — remove the `ChromeStorage.KEYS.AI_PROVIDER` from the `.get()` call and the `this._aiProvider = ...` assignment.

Remove AI_PROVIDER from the `chrome.storage.onChanged` listener (lines 52-54).

Update the AI button title in `_showIdle()` (line 261) from:
```javascript
ai.title = `Search ${this._getAIProviderLabel()} AI`
```
to:
```javascript
ai.title = 'Chat with AI'
```

- [ ] **Step 4: Run existing toolbar tests**

Run: `npx playwright test tests/e2e/selection-toolbar.spec.js`
Expected: Tests pass (AI button still renders, behavior changes don't break positioning tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/selection_toolbar.js src/content/main.js
git commit -m "feat: wire AI toolbar button to chat panel instead of URL open"
```

---

## Task 7: Background service worker chat streaming handler

**Files:**
- Modify: `src/background/chrome_runtime_handler.js`
- Modify: `src/background/main.js`

- [ ] **Step 1: Add onConnect handler for chat streaming**

In `src/background/chrome_runtime_handler.js`, add a static method after `addListeners()`:

```javascript
static addConnectListener() {
    chrome.runtime.onConnect.addListener(ChromeRuntimeHandler.onConnect)
}

static onConnect(port) {
    if (port.name !== 'chat-stream') return

    port.onMessage.addListener(async (request) => {
      try {
        const storage = new ChromeStorage('local')
        const keys = await new Promise((resolve, reject) => {
          storage.storage.get({
            [ChromeStorage.KEYS.CHAT_PROVIDER]: 'gemini',
            [ChromeStorage.KEYS.CHAT_API_KEY_GPT]: '',
            [ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]: '',
          }, (items) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve(items)
          })
        })

        const provider = request.provider || keys[ChromeStorage.KEYS.CHAT_PROVIDER]
        const apiKey = provider === 'gpt'
          ? keys[ChromeStorage.KEYS.CHAT_API_KEY_GPT]
          : keys[ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]

        if (!apiKey) {
          port.postMessage({ type: 'error', message: `No API key configured for ${provider === 'gpt' ? 'OpenAI' : 'Gemini'}. Set it in Settings > AI Chat.` })
          return
        }

        // Build system message with page context
        let systemContent = 'You are a helpful assistant. The user is reading a web page. Here is the page content:\n\n'
        // Truncate page context to ~50k chars to be safe with API limits
        const pageCtx = (request.pageContext || '').substring(0, 50000)
        systemContent += pageCtx

        if (request.selectedText) {
          systemContent += '\n\nThe user has highlighted this text:\n\n' + request.selectedText
        }

        if (provider === 'gpt') {
          await ChromeRuntimeHandler._streamGPT(port, apiKey, systemContent, request.messages)
        } else {
          await ChromeRuntimeHandler._streamGemini(port, apiKey, systemContent, request.messages)
        }
      } catch (e) {
        try {
          port.postMessage({ type: 'error', message: e.message || 'Unknown error' })
        } catch (_) { /* port disconnected */ }
      }
    })
}

static async _streamGPT(port, apiKey, systemContent, messages) {
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...messages,
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      port.postMessage({ type: 'error', message: `OpenAI API error (${response.status}): ${errText}` })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            port.postMessage({ type: 'chunk', text: delta })
          }
        } catch (_) { /* skip malformed JSON */ }
      }
    }

    port.postMessage({ type: 'done' })
}

static async _streamGemini(port, apiKey, systemContent, messages) {
    // Convert messages to Gemini format
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemContent }] },
          contents: contents,
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      port.postMessage({ type: 'error', message: `Gemini API error (${response.status}): ${errText}` })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)

        try {
          const parsed = JSON.parse(data)
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            port.postMessage({ type: 'chunk', text: text })
          }
        } catch (_) { /* skip malformed JSON */ }
      }
    }

    port.postMessage({ type: 'done' })
}
```

- [ ] **Step 2: Register connect listener in background main.js**

In `src/background/main.js`, add after `ChromeRuntimeHandler.addListeners()` (line 38):

```javascript
ChromeRuntimeHandler.addConnectListener()
```

- [ ] **Step 3: Commit**

```bash
git add src/background/chrome_runtime_handler.js src/background/main.js
git commit -m "feat: add background chat streaming handler for GPT and Gemini APIs"
```

---

## Task 8: Write E2E tests for chat panel

**Files:**
- Create: `tests/e2e/chat-panel.spec.js`

- [ ] **Step 1: Write chat panel UI E2E tests**

Create `tests/e2e/chat-panel.spec.js`:

```javascript
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

async function setupPage() {
  const pageUrl = `http://127.0.0.1:${port}/test-page.html`
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

test('floating tab is visible on page load', async () => {
  const { page } = await setupPage()

  const tab = page.locator('.ssh-chat-tab')
  await expect(tab).toBeVisible()

  await page.close()
})

test('clicking floating tab opens chat panel', async () => {
  const { page } = await setupPage()

  const tab = page.locator('.ssh-chat-tab')
  await tab.click()
  await page.waitForTimeout(200)

  const panel = page.locator('.ssh-chat-panel')
  await expect(panel).toBeVisible()

  // Header should show
  const title = page.locator('.ssh-chat-title')
  await expect(title).toHaveText('Chat with AI')

  // Context badge should show "Page context"
  const badge = page.locator('.ssh-chat-context-badge')
  await expect(badge).toHaveText('Page context')

  // Input should be focused
  const input = page.locator('.ssh-chat-input')
  await expect(input).toBeFocused()

  await page.close()
})

test('clicking tab again closes chat panel', async () => {
  const { page } = await setupPage()

  const tab = page.locator('.ssh-chat-tab')
  await tab.click()
  await page.waitForTimeout(200)
  await expect(page.locator('.ssh-chat-panel')).toBeVisible()

  // Click tab again to close
  await tab.click()
  await page.waitForTimeout(200)
  await expect(page.locator('.ssh-chat-panel')).toHaveCount(0)

  await page.close()
})

test('close button in header closes panel', async () => {
  const { page } = await setupPage()

  await page.locator('.ssh-chat-tab').click()
  await page.waitForTimeout(200)

  const closeBtn = page.locator('.ssh-chat-close')
  await closeBtn.click()
  await page.waitForTimeout(200)

  await expect(page.locator('.ssh-chat-panel')).toHaveCount(0)

  await page.close()
})

test('typing a message and pressing Enter adds user bubble', async () => {
  const { page } = await setupPage()

  await page.locator('.ssh-chat-tab').click()
  await page.waitForTimeout(200)

  const input = page.locator('.ssh-chat-input')
  await input.fill('Hello AI')
  await input.press('Enter')
  await page.waitForTimeout(200)

  // User message bubble should appear
  const userMsg = page.locator('.ssh-chat-msg-user')
  await expect(userMsg).toHaveText('Hello AI')

  // Without an API key, an error bubble should appear
  const errorOrAssistant = page.locator('.ssh-chat-msg-error, .ssh-chat-msg-assistant')
  await expect(errorOrAssistant).toBeVisible({ timeout: 5000 })

  await page.close()
})

test('AI button in toolbar opens panel with selected text context', async () => {
  const { page } = await setupPage()

  // Select text
  const target = page.locator('#test-text')
  const box = await target.boundingBox()
  await page.mouse.move(box.x + 5, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
  await page.mouse.up()
  await page.waitForTimeout(200)

  // Click the AI button in the toolbar
  const aiBtn = page.locator('.ssh-toolbar-ai')
  await aiBtn.click()
  await page.waitForTimeout(300)

  // Panel should open with selected text context
  const panel = page.locator('.ssh-chat-panel')
  await expect(panel).toBeVisible()

  const badge = page.locator('.ssh-chat-context-badge')
  const badgeText = await badge.textContent()
  expect(badgeText).toContain('Selected:')

  await page.close()
})
```

- [ ] **Step 2: Run tests**

Run: `npx playwright test tests/e2e/chat-panel.spec.js`
Expected: All tests pass except the send-message test may show an error bubble (no API key set) — that's the expected behavior.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat-panel.spec.js
git commit -m "test: add E2E tests for AI chat panel"
```

---

## Task 9: Clean up old AI_PROVIDER references and update docs

**Files:**
- Modify: `src/shared/chrome_storage.js` — remove `AI_PROVIDER` key and default (keep for now if other code references it, or remove if all references are gone)
- Modify: `src/content/selection_toolbar.js` — verify old AI URL code is fully removed
- Modify: `tests/e2e/CLAUDE.md` — add new spec file descriptions

- [ ] **Step 1: Remove AI_PROVIDER from storage**

In `src/shared/chrome_storage.js`, remove:
```javascript
AI_PROVIDER: 'aiProvider',
```
from `ChromeStorage.KEYS` (line 130) and:
```javascript
[ChromeStorage.KEYS.AI_PROVIDER]: 'gemini',
```
from `ChromeStorage.DEFAULTS` (line 161).

- [ ] **Step 2: Remove AI_PROVIDER listener from SelectionToolbar**

In `src/content/selection_toolbar.js`, in the `chrome.storage.onChanged` listener (lines 45-55), remove the `AI_PROVIDER` change handler block (lines 52-54).

- [ ] **Step 3: Update tests/e2e/CLAUDE.md**

Add to `tests/e2e/CLAUDE.md`:

```markdown
- `highlight-click-popup.spec.js`: click-to-manage popup on existing highlights. Covers popup appearance on click, delete action, comment action, dismiss behavior, and selection guard.
- `chat-panel.spec.js`: AI chat side panel behavior. Covers floating tab visibility, panel open/close, message input, and toolbar AI button integration.
```

- [ ] **Step 4: Run all tests**

Run: `npx playwright test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/chrome_storage.js src/content/selection_toolbar.js tests/e2e/CLAUDE.md
git commit -m "chore: remove deprecated AI_PROVIDER, update test docs"
```

---

## Summary

| Task | Description | Depends on |
|------|-------------|------------|
| 1 | Remove hover ×, add click popup to DOMEventsHandler | — |
| 2 | E2E tests for click popup | 1 |
| 3 | Chat storage keys + manifest check | — |
| 4 | Options page AI Chat settings | 3 |
| 5 | Chat panel UI (content script) | 3 |
| 6 | Wire AI toolbar button to chat panel | 5 |
| 7 | Background streaming handler | 3 |
| 8 | E2E tests for chat panel | 5, 6, 7 |
| 9 | Clean up old AI_PROVIDER, update docs | 6 |

Tasks 1 and 3 are independent and can be started in parallel.
Tasks 5, 6, 7 depend on 3 but are independent of each other.
