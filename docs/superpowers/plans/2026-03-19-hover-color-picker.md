# Hover Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user hovers the pen or comment button in the selection toolbar for 500ms, a compact 26×26px popup with 4 color swatches appears above the button; clicking a swatch highlights in that color.

**Architecture:** The feature is self-contained in `selection_toolbar.js`. A new storage key (`enableToolbarColorSelection`) gates the feature and is toggled via a new checkbox in `options.html`. The hover zone wraps each button in a relative-positioned div; the popup is appended inside that wrapper so the existing dismiss logic works without changes.

**Tech Stack:** Vanilla JS (content script), Chrome storage API (sync), Playwright (E2E tests), AngularJS (options page)

**Spec:** `docs/superpowers/specs/2026-03-19-hover-color-picker-design.md`

---

## File Map

| File | Change |
|------|--------|
| `js/shared/chrome_storage.js` | Add `ENABLE_TOOLBAR_COLOR_SELECTION` key + default |
| `js/options/controllers/styles.js` | Add key to `ChromeStorage().get()` init call |
| `options.html` | Add checkbox inside "Comment setting" panel body |
| `js/content_script/selection_toolbar.js` | Constructor fields, `_resolveActiveClassName`, `init()`, CSS, `_showIdle`, 4 new methods |
| `tests/e2e/selection-toolbar.spec.js` | New tests for hover picker and toggle |

---

## Task 1: Add storage key

**Files:**
- Modify: `js/shared/chrome_storage.js`

- [ ] **Step 1: Add key and default**

In `ChromeStorage.KEYS` (around line 124), add after `POPUP_HIGHLIGHT_TEXT_MAX_LENGTH`:
```js
ENABLE_TOOLBAR_COLOR_SELECTION: 'enableToolbarColorSelection',
```

In `ChromeStorage.DEFAULTS` (around line 152), add after the `POPUP_HIGHLIGHT_TEXT_MAX_LENGTH` default:
```js
[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION]: true,
```

- [ ] **Step 2: Commit**
```bash
git add js/shared/chrome_storage.js
git commit -m "feat: add enableToolbarColorSelection storage key"
```

---

## Task 2: Options page toggle (TDD)

**Files:**
- Modify: `js/options/controllers/styles.js`
- Modify: `options.html`
- Modify: `tests/e2e/selection-toolbar.spec.js`

- [ ] **Step 1: Write failing E2E test**

Add to the bottom of `tests/e2e/selection-toolbar.spec.js` (before the last line):
```js
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
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "hover color picker toggle"
```
Expected: FAIL — checkbox not found.

- [ ] **Step 3: Add key to styles.js init fetch**

In `js/options/controllers/styles.js`, in `init()`, find the `ChromeStorage().get([...])` call (around line 97) and add the new key:
```js
return new ChromeStorage().get([
    ChromeStorage.KEYS.UNSELECT_AFTER_HIGHLIGHT,
    ChromeStorage.KEYS.ENABLE_HIGHLIGHT_BOX_SHADOW,
    ChromeStorage.KEYS.HIGHLIGHT_BACKGROUND_ALPHA,
    ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION,
])
```

- [ ] **Step 4: Add checkbox to options.html**

In `options.html`, find the "Comment setting" panel body (around line 207). Inside the `<div class="panel-body">`, after the closing `</div>` of the `.form-group` pen button selector, add:
```html
<div class="checkbox" style="margin-top:8px;">
  <label>
    <input type="checkbox" ng-model="options.enableToolbarColorSelection">
    Enable hover color picker in toolbar
  </label>
</div>
```

The panel body should look like:
```html
<div class="panel-body">
  <div class="form-group" style="margin-bottom:0;">
    <label class="control-label" style="font-weight:normal;">Pen button default style:
      <select ...>...</select>
    </label>
  </div>
  <!-- NEW: -->
  <div class="checkbox" style="margin-top:8px;">
    <label>
      <input type="checkbox" ng-model="options.enableToolbarColorSelection">
      Enable hover color picker in toolbar
    </label>
  </div>
</div>
```

- [ ] **Step 5: Run test to verify it passes**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "hover color picker toggle"
```
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add js/options/controllers/styles.js options.html tests/e2e/selection-toolbar.spec.js
git commit -m "feat: add hover color picker toggle to options page"
```

---

## Task 3: Toolbar init + CSS infrastructure (TDD)

**Files:**
- Modify: `js/content_script/selection_toolbar.js`
- Modify: `tests/e2e/selection-toolbar.spec.js`

This task adds the constructor fields, extends `_resolveActiveClassName`, adds the `init()` reads, injects CSS classes, and branches `_showIdle` to call `_createHoverZone`. The picker popup methods are stubs here (filled in Task 4).

- [ ] **Step 1: Write failing E2E test**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "hovering pen button"
```
Expected: FAIL — `.ssh-toolbar-picker` never appears.

- [ ] **Step 3: Add constructor fields**

In `selection_toolbar.js`, in the `constructor()` method, after `this._dismissListeners = []`, add:
```js
this._pickerDefinitions = []
this._hoverColorPickerEnabled = true
```

- [ ] **Step 4: Extend `_resolveActiveClassName()`**

In `_resolveActiveClassName()`, inside the `.then(({ highlightDefinitions, penButtonClassName }) => {` callback, after setting `this._activeBgColor`, add:
```js
this._pickerDefinitions = (highlightDefinitions || []).slice(0, 4)
```

The updated section looks like:
```js
this._activeClassName = def.className
this._activeBgColor = (def.style || {})['background-color'] || '#ffd2AA'
this._pickerDefinitions = (highlightDefinitions || []).slice(0, 4)  // NEW
```

- [ ] **Step 5: Add `_hoverColorPickerEnabled` read and storage listener in `init()`**

In `init()`, after `this._resolveActiveClassName()` is called, add:
```js
// Read hover-picker enabled flag once; refresh via storage change listener
new ChromeStorage().get(ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION)
  .then(enabled => { this._hoverColorPickerEnabled = enabled })
  .catch(() => {})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION]) {
    this._hoverColorPickerEnabled = changes[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION].newValue
  }
})
```

Note: `ChromeStorage.get(singleStringKey)` returns the scalar value directly (a boolean), not an object.

- [ ] **Step 6: Add picker CSS classes to `_injectStyles()`**

In `_injectStyles()`, append to the `style.textContent` template string, before the closing backtick:
```css
.ssh-toolbar-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 26px;
  height: 26px;
  background: #2c2c2c;
  border-radius: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 3px;
  z-index: 1;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.4);
}
.ssh-toolbar-picker-swatch {
  border-radius: 3px;
  cursor: pointer;
}
```

- [ ] **Step 7: Update `_showIdle()` to branch on hover picker**

In `_showIdle()`, find this exact block (currently lines ~220–243):

```js
    // Pen button
    const pen = this.document.createElement('button')
    pen.className = 'ssh-toolbar-pen'
    pen.title = 'Highlight'
    pen.innerHTML = HIGHLIGHT_SVG
    pen.style.background = this._activeBgColor || '#ffffaa'
    pen.addEventListener('click', () => this._onPenClick(range), { once: true })

    // Divider
    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    // Comment button
    const comment = this.document.createElement('button')
    comment.className = 'ssh-toolbar-comment'
    comment.title = 'Comment & Highlight'
    comment.innerHTML = COMMENT_SVG_16
    comment.addEventListener('click', () => this._onCommentClick(range), { once: true })

    // Caret
    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    toolbar.append(search, searchDivider, pen, divider, comment, caret)
```

Replace it with (`search` and `searchDivider` are declared earlier in the method and remain unchanged):

```js
    // Pen button
    const pen = this.document.createElement('button')
    pen.className = 'ssh-toolbar-pen'
    pen.title = 'Highlight'
    pen.innerHTML = HIGHLIGHT_SVG
    pen.style.background = this._activeBgColor || '#ffffaa'

    // Divider
    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    // Comment button
    const comment = this.document.createElement('button')
    comment.className = 'ssh-toolbar-comment'
    comment.title = 'Comment & Highlight'
    comment.innerHTML = COMMENT_SVG_16

    // Caret
    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    if (this._hoverColorPickerEnabled && this._pickerDefinitions.length > 0) {
      const penWrapper = this._createHoverZone(pen, range, 'pen')
      const commentWrapper = this._createHoverZone(comment, range, 'comment')
      // NOTE: do NOT attach click listeners directly on pen/comment here —
      // _createHoverZone handles all click wiring for those buttons.
      toolbar.append(search, searchDivider, penWrapper, divider, commentWrapper, caret)
    } else {
      pen.addEventListener('click', () => this._onPenClick(range), { once: true })
      comment.addEventListener('click', () => this._onCommentClick(range), { once: true })
      toolbar.append(search, searchDivider, pen, divider, comment, caret)
    }
```

- [ ] **Step 8: Add stub `_createHoverZone()` (to be filled in Task 4)**

Add this method to the class (before `_onPenClick`):
```js
_createHoverZone(btn, range, mode) {
  const wrapper = this.document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:26px;height:26px;display:inline-flex;'

  btn.addEventListener('click', () => {
    mode === 'pen' ? this._onPenClick(range) : this._onCommentClick(range)
  }, { once: true })

  let hoverTimer = null
  let pickerVisible = false
  const setVisible = (v) => { pickerVisible = v }

  wrapper.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => this._showPickerPopup(wrapper, range, mode, setVisible), 500)
  })
  wrapper.addEventListener('mouseleave', (e) => {
    if (!wrapper.contains(e.relatedTarget)) {
      clearTimeout(hoverTimer)
      hoverTimer = null
      if (pickerVisible) this._removePickerPopup(wrapper, setVisible)
    }
  })

  wrapper.appendChild(btn)
  return wrapper
}
```

- [ ] **Step 9: Add stub `_showPickerPopup()` and `_removePickerPopup()` (to be filled in Task 4)**

```js
_showPickerPopup(wrapper, range, mode, setVisible) {
  if (wrapper.querySelector('.ssh-toolbar-picker')) return
  // TODO: implement in Task 4
  const popup = this.document.createElement('div')
  popup.className = 'ssh-toolbar-picker'
  wrapper.appendChild(popup)
  setVisible(true)
}

_removePickerPopup(wrapper, setVisible) {
  const popup = wrapper.querySelector('.ssh-toolbar-picker')
  if (popup) popup.remove()
  setVisible(false)
}
```

- [ ] **Step 10: Run test to verify it passes**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "hovering pen button"
```
Expected: PASS — picker div appears after hover. (Swatches inside it are verified in Task 4.)

- [ ] **Step 11: Commit**
```bash
git add js/content_script/selection_toolbar.js tests/e2e/selection-toolbar.spec.js
git commit -m "feat: add hover picker infrastructure and CSS to selection toolbar"
```

---

## Task 4: Implement picker popup with swatches (TDD)

**Files:**
- Modify: `js/content_script/selection_toolbar.js`
- Modify: `tests/e2e/selection-toolbar.spec.js`

- [ ] **Step 1: Write failing E2E test for swatch content**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
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
  expect(firstBg.toLowerCase()).toContain('ff8080')

  await page.close()
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "4 swatches"
```
Expected: FAIL — no swatches in the popup.

- [ ] **Step 3: Implement `_showPickerPopup()` with real swatches**

Replace the stub `_showPickerPopup()` with the full implementation:
```js
_showPickerPopup(wrapper, range, mode, setVisible) {
  if (wrapper.querySelector('.ssh-toolbar-picker')) return

  const popup = this.document.createElement('div')
  popup.className = 'ssh-toolbar-picker'

  for (const def of this._pickerDefinitions) {
    const swatch = this.document.createElement('div')
    swatch.className = 'ssh-toolbar-picker-swatch'
    swatch.style.background = (def.style || {})['background-color'] || '#ccc'
    if (def.className === this._activeClassName) {
      swatch.style.outline = '1.5px solid #fff'
    }
    swatch.addEventListener('click', (e) => {
      e.stopPropagation()
      this._onPickerSwatchClick(def, range, mode)
    })
    popup.appendChild(swatch)
  }

  wrapper.appendChild(popup)
  setVisible(true)
}
```

Also add a stub for `_onPickerSwatchClick` (filled in Task 5):
```js
_onPickerSwatchClick(def, range, mode) {
  // TODO: implement in Task 5
  this._dismiss()
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "4 swatches"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add js/content_script/selection_toolbar.js tests/e2e/selection-toolbar.spec.js
git commit -m "feat: implement color picker popup swatches"
```

---

## Task 5: Implement swatch click actions (TDD)

**Files:**
- Modify: `js/content_script/selection_toolbar.js`
- Modify: `tests/e2e/selection-toolbar.spec.js`

### Pen mode

- [ ] **Step 1: Write failing E2E test — pen swatch click creates highlight**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
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
```

- [ ] **Step 2: Run to verify fail**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "first swatch in pen picker"
```
Expected: FAIL — `mark` never appears (stub just calls `_dismiss()`).

- [ ] **Step 3: Implement `_onPickerSwatchClick()` — pen mode**

Replace the stub `_onPickerSwatchClick()`:
```js
_onPickerSwatchClick(def, range, mode) {
  if (mode === 'pen') {
    this._activeClassName = def.className
    this._activeBgColor = (def.style || {})['background-color'] || '#ffd2AA'

    // Persist new pen default, then highlight and dismiss.
    // Awaiting setPenButtonClassName ensures _resolveActiveClassName() triggered
    // by _dismiss() reads the updated value — avoiding a stale-read race.
    new ChromeHighlightStorage().setPenButtonClassName(def.className).then(() => {
      ChromeRuntimeHandler.sendMessage({
        id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
        xrange: RangeUtils.toObject(range),
        text: range.toString(),
        className: def.className,
      }).catch(console.error)
      this._dismiss()
    }).catch(console.error)

  } else if (mode === 'comment') {
    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange: RangeUtils.toObject(range),
      text: range.toString(),
      className: def.className,
    }).then(highlightId => {
      if (highlightId) this._showCommentInput(highlightId)
      else this._dismiss()
    }).catch(() => this._dismiss())
  }
}
```

- [ ] **Step 4: Run pen test to verify pass**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "first swatch in pen picker"
```
Expected: PASS.

### Comment mode

- [ ] **Step 5: Write failing E2E test — comment swatch click opens comment input**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
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
```

- [ ] **Step 6: Run to verify it passes immediately**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "comment picker"
```
Expected: PASS — the comment path was already included in `_onPickerSwatchClick` in Step 3 above. No additional implementation is needed.

- [ ] **Step 8: Commit**
```bash
git add js/content_script/selection_toolbar.js tests/e2e/selection-toolbar.spec.js
git commit -m "feat: implement swatch click for pen and comment modes"
```

---

## Task 6: Edge case tests and disable toggle (TDD)

**Files:**
- Modify: `tests/e2e/selection-toolbar.spec.js`

- [ ] **Step 1: Write failing test — no picker if mouse leaves before 500ms**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
test('moving mouse off pen button before 500ms does not show picker', async () => {
  const { page } = await setupPage()
  await selectText(page)
  await page.waitForSelector('.ssh-toolbar-root', { timeout: 3000 })

  // Hover briefly then move away quickly (under 500ms)
  await page.hover('.ssh-toolbar-pen')
  await page.waitForTimeout(200)
  await page.mouse.move(0, 0) // move away
  await page.waitForTimeout(400) // wait past original 500ms mark

  const picker = await page.$('.ssh-toolbar-picker')
  expect(picker).toBeNull()

  await page.close()
})
```

- [ ] **Step 2: Run to verify it passes (no implementation needed)**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "before 500ms"
```
Expected: PASS — timer is cleared on mouseleave already.

- [ ] **Step 3: Write failing test — hover picker disabled by toggle**

Add to `tests/e2e/selection-toolbar.spec.js`:
```js
test('hover color picker does not appear when disabled in options', async () => {
  // Disable the feature via storage
  await sw.evaluate(async () => {
    await chrome.storage.sync.set({ enableToolbarColorSelection: false })
  })

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

  // Re-enable for other tests
  await sw.evaluate(async () => {
    await chrome.storage.sync.set({ enableToolbarColorSelection: true })
  })

  await page.close()
})
```

- [ ] **Step 4: Run to verify it passes**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js --grep "disabled in options"
```
Expected: PASS — when `_hoverColorPickerEnabled` is false, `_showIdle` falls through to the original path with no hover zone.

Note: Because `_hoverColorPickerEnabled` is cached at `init()` time and updated via `chrome.storage.onChanged`, the new page opened by `setupPage()` will read the updated value when injecting content scripts. The `waitForTimeout(300)` in `setupPage()` ensures the async storage read has completed.

- [ ] **Step 5: Run the full toolbar spec to verify no regressions**
```bash
npx playwright test tests/e2e/selection-toolbar.spec.js
```
Expected: All tests pass.

- [ ] **Step 6: Run all E2E tests**
```bash
npx playwright test
```
Expected: All tests pass.

- [ ] **Step 7: Commit**
```bash
git add tests/e2e/selection-toolbar.spec.js
git commit -m "test: add edge case E2E coverage for hover color picker"
```
