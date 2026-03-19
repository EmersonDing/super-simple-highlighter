# Hover Color Picker — Design Spec

**Date:** 2026-03-19
**Method:** Claude Code superpowers brainstorming
**Status:** Approved

## Overview

When the user hovers the pen (highlight) or comment button in the selection toolbar for 500ms, a compact color picker popup appears flush above the button. Clicking a color swatch highlights the selected text in that color. A toggle in Options → Styles → "Comment setting" lets the user disable this feature.

## Visual Design

- Popup size: **26×26px** — identical to the button it covers
- Layout: **2×2 grid** of 4 color swatches (~9×9px each), 3px padding, 2px gap, border-radius 3px per swatch
- Background: `#2c2c2c` (matches toolbar), border-radius 8px, `box-shadow: 0 -2px 10px rgba(0,0,0,0.4)`
- Position: `position:absolute; bottom:100%; left:0` relative to the button's wrapper div — flush directly above, no gap
- Active color (current `_activeClassName`) gets `outline: 1.5px solid #fff` on its swatch
- No caret — popup and button share the same x-position
- CSS added to the existing `_injectStyles()` block as named classes (`ssh-toolbar-picker`, `ssh-toolbar-picker-swatch`), consistent with the rest of the toolbar

## Color Data

- **Source:** first 4 entries of `highlightDefinitions` array as stored (the order the user arranged them in options)
- Stored as `this._pickerDefinitions` (array of up to 4 `HighlightDefinition` objects)
- If fewer than 4 definitions exist, show however many are available

## Storage

### `chrome_storage.js`
Add to `ChromeStorage.KEYS` (flat, camelCase — consistent with all other keys):
```js
ENABLE_TOOLBAR_COLOR_SELECTION: 'enableToolbarColorSelection',
```
Add to `ChromeStorage.DEFAULTS`:
```js
[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION]: true,
```

## Options Page

### `styles.js`
Add `ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION` to the `ChromeStorage().get()` call at init:
```js
return new ChromeStorage().get([
  ChromeStorage.KEYS.UNSELECT_AFTER_HIGHLIGHT,
  ChromeStorage.KEYS.ENABLE_HIGHLIGHT_BOX_SHADOW,
  ChromeStorage.KEYS.HIGHLIGHT_BACKGROUND_ALPHA,
  ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION,  // new
])
```
The existing `$watchCollection('options', ...) → ChromeStorage.set(newOptions)` persists it automatically.

### `options.html`
Inside the existing **"Comment setting"** panel body div (after the pen button style selector `<div class="form-group">`), add:
```html
<div class="checkbox" style="margin-top:8px;">
  <label>
    <input type="checkbox" ng-model="options.enableToolbarColorSelection">
    Enable hover color picker in toolbar
  </label>
</div>
```

## `selection_toolbar.js` Changes

### Constructor
Add instance fields:
```js
this._pickerDefinitions = []         // first 4 HighlightDefinition objects
this._hoverColorPickerEnabled = true // read once at init, refreshed via storage change listener
```

### Init — storage reads

**`_resolveActiveClassName()`** — extend to also read `_pickerDefinitions`. This method is called at `init()` and on every `_dismiss()`. It uses `ChromeHighlightStorage().getAll()`. Add:
```js
// after resolving _activeClassName and _activeBgColor:
this._pickerDefinitions = (highlightDefinitions || []).slice(0, 4)
```
No second storage call here — `_pickerDefinitions` comes from the same `getAll()` result.

**`_hoverColorPickerEnabled`** is read **once at init** (not on every dismiss, to avoid repeated async reads). In `init()`, after the existing `_resolveActiveClassName()` call, add:
```js
new ChromeStorage().get(ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION)
  .then(enabled => { this._hoverColorPickerEnabled = enabled })
  .catch(() => {})
```
Note: `ChromeStorage.get()` called with a single string key returns the scalar value directly (not an object — see `chrome_storage.js` line 68), so assign directly to `_hoverColorPickerEnabled`.

To pick up changes without a page reload, add a `chrome.storage.onChanged` listener in `init()`:
```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION]) {
    this._hoverColorPickerEnabled = changes[ChromeStorage.KEYS.ENABLE_TOOLBAR_COLOR_SELECTION].newValue
  }
})
```
This listener is intentionally permanent for the content script lifetime — `SelectionToolbar` is instantiated once per page injection and never explicitly destroyed, so no `removeListener` teardown is needed or expected.

### `_showIdle(range, anchor)`
Before appending to the toolbar, conditionally wrap the pen and comment buttons:
```
if (_hoverColorPickerEnabled && _pickerDefinitions.length > 0):
  penWrapper   = _createHoverZone(pen, range, 'pen')
  commentWrapper = _createHoverZone(comment, range, 'comment')
  // IMPORTANT: do NOT call pen.addEventListener or comment.addEventListener here.
  // The existing direct click-listener lines from the original _showIdle must be
  // absent from this branch. All click wiring for pen and comment goes exclusively
  // through _createHoverZone.
  toolbar.append(search, searchDivider, penWrapper, divider, commentWrapper, caret)
else:
  // existing behavior: attach { once: true } click listeners on pen and comment
  pen.addEventListener('click', () => _onPenClick(range), { once: true })
  comment.addEventListener('click', () => _onCommentClick(range), { once: true })
  toolbar.append(search, searchDivider, pen, divider, comment, caret)
```

### `_createHoverZone(btn, range, mode)` → returns wrapper div

```
1. wrapper = div, styles: position:relative; width:26px; height:26px; display:inline-flex
2. Attach the button's direct-click listener with { once: true }:
   btn.addEventListener('click', () => {
     mode === 'pen' ? _onPenClick(range) : _onCommentClick(range)
   }, { once: true })
3. hoverTimer = null  (closure-local)
   pickerVisible = false  (closure-local)
4. wrapper.addEventListener('mouseenter', () => {
     hoverTimer = setTimeout(() => _showPickerPopup(wrapper, range, mode, setVisible), 500)
   })
   // setVisible is a closure setter: (v) => { pickerVisible = v }
5. wrapper.addEventListener('mouseleave', (e) => {
     if (!wrapper.contains(e.relatedTarget)) {
       clearTimeout(hoverTimer)
       hoverTimer = null
       if (pickerVisible) _removePickerPopup(wrapper, setVisible)
     }
   })
6. wrapper.appendChild(btn)
7. return wrapper
```

The popup is appended inside `wrapper`, which is inside `_toolbarElm`. The existing mousedown dismiss listener (`_toolbarElm.contains(e.target)`) covers the popup automatically — no extra dismiss guard is needed.

### `_showPickerPopup(wrapper, range, mode, setVisible)`

Guard against double-append at the top:
```
if (wrapper.querySelector('.ssh-toolbar-picker')) return
```

Then:
```
1. popup = div with class ssh-toolbar-picker
   CSS: position:absolute; bottom:100%; left:0; width:26px; height:26px;
        display:grid; grid-template-columns:1fr 1fr; gap:2px; padding:3px; z-index:1;
        (background, border-radius, box-shadow from injected class)
2. For each def in _pickerDefinitions:
   swatch = div with class ssh-toolbar-picker-swatch
   swatch.style.background = def.style['background-color']
   if def.className === _activeClassName:
     swatch.style.outline = '1.5px solid #fff'
   swatch.addEventListener('click', (e) => {
     e.stopPropagation()
     _onPickerSwatchClick(def, range, mode)
   })
   popup.appendChild(swatch)
3. wrapper.appendChild(popup)
4. setVisible(true)
```

### `_removePickerPopup(wrapper, setVisible)`
```
const popup = wrapper.querySelector('.ssh-toolbar-picker')
if (popup) popup.remove()
setVisible(false)
```

### `_onPickerSwatchClick(def, range, mode)`

**Pen mode:**
```js
this._activeClassName = def.className
this._activeBgColor = def.style['background-color']

// Persist new default, then dismiss. Await ensures _resolveActiveClassName()
// triggered by _dismiss() sees the updated value in storage, avoiding a race.
new ChromeHighlightStorage().setPenButtonClassName(def.className).then(() => {
  // Full message payload — mirrors _onPenClick:
  ChromeRuntimeHandler.sendMessage({
    id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
    xrange: RangeUtils.toObject(range),
    text: range.toString(),
    className: def.className,
  }).catch(console.error)
  this._dismiss()
})
```

**Comment mode:**
```js
const xrange = RangeUtils.toObject(range)
const text = range.toString()
ChromeRuntimeHandler.sendMessage({
  id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
  xrange, text, className: def.className,
}).then(highlightId => {
  if (highlightId) this._showCommentInput(highlightId)
  else this._dismiss()
}).catch(() => this._dismiss())
```

**Race condition note (pen mode):** `setPenButtonClassName()` is awaited before calling `_dismiss()`. This ensures the storage write flushes before `_dismiss()` triggers `_resolveActiveClassName()`, which re-reads `penButtonClassName` from storage. Without this await, `_resolveActiveClassName()` could read the old value and overwrite `_activeClassName` back.

### Selection preservation
Hovering the button/popup does not collapse the text selection. The `range` object is captured in a closure before any async call, so it remains valid. No special handling needed.

## Files Changed

| File | Change |
|------|--------|
| `js/shared/chrome_storage.js` | Add `ENABLE_TOOLBAR_COLOR_SELECTION: 'enableToolbarColorSelection'` key and `true` default |
| `js/content_script/selection_toolbar.js` | Constructor fields; extend `_resolveActiveClassName()`; add `chrome.storage.onChanged` listener in `init()`; read `_hoverColorPickerEnabled` once at init; update `_showIdle()`; add `_createHoverZone()`, `_showPickerPopup()`, `_removePickerPopup()`, `_onPickerSwatchClick()`; add CSS classes to `_injectStyles()` |
| `js/options/controllers/styles.js` | Add `ENABLE_TOOLBAR_COLOR_SELECTION` to init keys array |
| `options.html` | Add checkbox inside "Comment setting" panel body, after pen button selector |

## Out of Scope

- Hover picker on the search (Google) button
- Popup open/close animation
- Keyboard accessibility for the picker
