# Floating Selection Toolbar — Design Spec

**Date:** 2026-03-17
**Project:** Super Simple Highlighter (Chrome Extension MV3)
**Feature:** Diigo-style floating toolbar for highlighting and commenting on selected text

---

## Overview

When a user selects text on any web page, a small floating toolbar appears above the selection. It offers two actions: highlight with the active style (pen), or highlight and add a comment (chat bubble). Comments are stored alongside highlights in PouchDB and surfaced as hover tooltips with a blue dot indicator on the highlight.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `js/content_script/selection_toolbar.js` | `SelectionToolbar` class — selection detection, toolbar DOM lifecycle, comment input state |

No separate CSS file. Toolbar styles are injected by `SelectionToolbar.init()` as a `<style>` element appended to `document.head`. This is fully self-contained and requires no manifest changes or `StyleSheetManager` involvement.

### Modified Files

| File | Change |
|------|--------|
| `js/shared/chrome_tabs.js` | (1) Add `selection_toolbar.js` to `DEFAULT_SCRIPTS` before `main.js`. (2) Add `SET_HIGHLIGHT_COMMENT` to `ChromeTabs.MESSAGE_ID`. (3) Add `ChromeTabs.setHighlightComment(highlightId, comment)` instance method. (4) Extend `createHighlight()` to forward `comment` inside the `sendMessage` payload object (not as a positional argument — `options` remains the fifth positional param). (5) Extend `playbackDocuments()` to read `doc[DB.DOCUMENT.NAME.COMMENT]` and pass it in the `createHighlight()` message payload. |
| `js/background/chrome_runtime_handler.js` | Add `CREATE_HIGHLIGHT_FROM_PAGE` and `UPDATE_HIGHLIGHT_COMMENT` to `ChromeRuntimeHandler.MESSAGE`. Add handler cases in `onMessage` for both (both async). Use `sender.tab.id` and `sender.tab.url` — not `queryActiveTab()`. |
| `js/content_script/chrome_runtime_handler.js` | (1) Add `CREATE_HIGHLIGHT_FROM_PAGE` and `UPDATE_HIGHLIGHT_COMMENT` to `ChromeRuntimeHandler.MESSAGE_ID`. (2) Add `SET_HIGHLIGHT_COMMENT` case to `onMessage` switch. (3) Extend `createHighlight()` to accept `comment`, set `data-comment` on first `<mark>`, and append the dot indicator. (4) After `updateHighlight()`, re-apply `data-comment` if the mark element had it. |
| `js/shared/db.js` | Add `COMMENT: 'comment'` to `DB.DOCUMENT.NAME`. Extend `putCreateDocument()` and `updateCreateDocument()` to accept optional `comment`. Fix `updateCreateDocument()` early-return guard to include `comment` in the no-op check. |
| `js/content_script/main.js` | Instantiate and init `SelectionToolbar`. |
| `js/content_script/dom_events_handler.js` | On hover over a `<mark>` element, if `data-comment` is set, show tooltip appended to `document.body`. On `mouseleave`, remove the tooltip. |

---

## Message Reference

> **Note:** Two separate classes are both named `ChromeRuntimeHandler` — one in the background, one in the content script. This section disambiguates all message constants by file path.

### Content Script → Background (new)

These message IDs originate in the content script and are handled by the background.

```js
// js/content_script/chrome_runtime_handler.js — ChromeRuntimeHandler.MESSAGE_ID
// (messages sent FROM content script TO background)
ChromeRuntimeHandler.MESSAGE_ID = {
  DELETE_HIGHLIGHT:           'delete_highlight',          // existing
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page', // new
  UPDATE_HIGHLIGHT_COMMENT:   'update_highlight_comment',   // new
}

// js/background/chrome_runtime_handler.js — ChromeRuntimeHandler.MESSAGE
// (string constants the background's onMessage switch matches against)
ChromeRuntimeHandler.MESSAGE = {
  DELETE_HIGHLIGHT:           'delete_highlight',          // existing
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page', // new
  UPDATE_HIGHLIGHT_COMMENT:   'update_highlight_comment',   // new
}
```

### Background → Content Script (new)

```js
// js/shared/chrome_tabs.js — ChromeTabs.MESSAGE_ID
// (messages sent FROM background TO content script via tabs.sendMessage)
ChromeTabs.MESSAGE_ID = {
  ...existing...,
  SET_HIGHLIGHT_COMMENT: 'set_highlight_comment',  // new
}
```

---

## Message Flow

### Creating a Highlight (pen button)

`SelectionToolbar` serializes the current `Selection` using `RangeUtils.toObject()` (available via `js/shared/utils.js` in `DEFAULT_SCRIPTS`). It reads `selection.toString()` for the text. Both are sent to the background.

```
SelectionToolbar (content script)
  └─ uses content ChromeRuntimeHandler.sendMessage({
       id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
       xrange: RangeUtils.toObject(selection.getRangeAt(0)),
       text:   selection.toString(),
       className: activeClassName
     })
       └─► js/background/chrome_runtime_handler.js  onMessage(msg, sender)
             match = DB.formatMatch(sender.tab.url)   // NOT queryActiveTab()
             └─► new Highlighter(sender.tab.id).create(msg.xrange, match, msg.text, msg.className)
                   ├─► db.putCreateDocument(match, xrange, className, text, {title})
                   └─► new ChromeTabs(sender.tab.id).createHighlight(xrange, className, docId, version)
                         └─► content ChromeRuntimeHandler.onMessage (CREATE_HIGHLIGHT case)
                               └─► createHighlight(range, highlightId, className, version)
```

### Creating a Highlight + Comment (comment save)

Same as above, `comment` added to the message and threaded through:

```
SelectionToolbar
  └─ content ChromeRuntimeHandler.sendMessage({
       id: ..CREATE_HIGHLIGHT_FROM_PAGE,
       xrange, text, className,
       comment: <string>
     })
       └─► background onMessage
             └─► new Highlighter(sender.tab.id).create(xrange, match, text, className, { comment })
                   ├─► db.putCreateDocument(match, xrange, className, text, { title, comment })
                   └─► new ChromeTabs(id).createHighlight(xrange, className, docId, version)
                         // comment forwarded in sendMessage payload, not as a positional arg
                         └─► content createHighlight(..., comment)
                               ├─► sets data-comment on first <mark>
                               └─► appends dot indicator child (data-foreign set)
```

`Highlighter.create()` gains an optional fifth argument `{ comment } = {}`, which it passes into `db.putCreateDocument()` and then forwards in the `ChromeTabs.createHighlight()` call.

### Updating a Comment

```
SelectionToolbar
  └─ content ChromeRuntimeHandler.sendMessage({
       id: ..UPDATE_HIGHLIGHT_COMMENT,
       highlightId: <string>,
       comment: <string>   // empty string = clear comment
     })
       └─► background onMessage  [asynchronous = true]
             ├─► db.updateCreateDocument(highlightId, { comment })
             └─► new ChromeTabs(sender.tab.id).setHighlightComment(highlightId, comment)
                   └─► content ChromeRuntimeHandler.onMessage (SET_HIGHLIGHT_COMMENT case)
                         └─► update data-comment on first <mark>
                               └─► add/remove dot indicator child accordingly
```

Both `CREATE_HIGHLIGHT_FROM_PAGE` and `UPDATE_HIGHLIGHT_COMMENT` background handlers are **asynchronous**: they set `asynchronous = true`, return `true` from `onMessage`, and call `sendResponse` inside `.then()/.catch()` — identical to the existing `DELETE_HIGHLIGHT` handler pattern.

### Comment Restoration on Page Reload

`ChromeTabs.playbackDocuments()` is extended to read `doc[DB.DOCUMENT.NAME.COMMENT]` and forward it in the `sendMessage` payload inside `createHighlight()`. The updated call in `playbackDocuments()` is:

```js
return this.createHighlight(
  doc[DB.DOCUMENT.NAME.RANGE],
  doc[DB.DOCUMENT.NAME.CLASS_NAME],
  doc._id,
  version,
  // options param — comment travels inside message payload via createHighlight() internals
)
// createHighlight() internally adds comment to the sendMessage payload
```

This ensures `data-comment` and the dot indicator are restored on every page revisit, not only at initial creation.

---

## Data Model

```js
// New field in 'create' documents:
{
  verb: 'create',
  match: '...',
  range: { ... },
  className: '...',
  text: '...',
  comment: 'Optional annotation text.',  // NEW — optional string, max 1000 chars
  date: ...,
  v: 4
}
```

`DB.DOCUMENT.NAME` gains: `COMMENT: 'comment'`

`updateCreateDocument()` accepts `comment` in the values object alongside `className` and `title`. Two implementation details:

1. The early-return no-op guard is updated to include `comment` in its comparison, so that passing an empty string (clearing a comment) always reaches `putDB`.
2. The conditional assignment for `comment` inside the method must use `typeof comment === 'string'` (not `if (comment)`) so that an empty string correctly clears an existing comment rather than being skipped as falsy. This matches the pattern already used for `title` in `putCreateDocument()`.

---

## Active Style Resolution

`SelectionToolbar` calls `new ChromeHighlightStorage().getAll()` on init and caches the first entry in `highlightDefinitions` as `activeClassName`. On each toolbar show, `getAll()` is called again to pick up any style changes; during the async resolution, the **cached value from init** is used as a fallback so the pen button is never disabled waiting for the refresh. The refreshed value is applied before the next toolbar show.

---

## UI & Behavior

### Toolbar States

**State 1 — Text selected:**
A compact dark pill (`.ssh-toolbar-root`) appears `position: fixed`, centered above the selection, with a downward caret. Contains:
- Pen button — background color matches active highlight style
- Vertical divider
- Chat bubble button (neutral)

**State 2 — Comment mode (after chat bubble click):**
Text is immediately highlighted. Toolbar expands in-place:
- Chat bubble icon
- Vertical divider
- Auto-focused `<input>` (`placeholder="Add a comment…"`, `maxlength="1000"`)
- Save `<button>` — disabled until ≥ 1 non-whitespace character
- × close button

`selectionchange` dismissal listener is **removed** when transitioning to State 2 (clicking the input collapses the selection). It is reinstated when State 2 is exited.

Enter or Save → commits comment, closes toolbar. × → discards input, highlight stays.

**State 3 — Hover on commented highlight:**
A blue dot (8px, `border: 1.5px solid white`, `data-foreign` set) is appended to the first `<mark>` as an absolutely-positioned child.

On `mouseenter`, a tooltip `<div>` is appended to `document.body` (`position: fixed`) and positioned using `mark.getBoundingClientRect()`. Text is set via `element.textContent` (never `innerHTML`). On `mouseleave`, the tooltip is removed from `document.body`.

The dot indicator and `data-comment` are set inside content script `createHighlight()` — applied on both initial creation and `playbackDocuments()` replay.

### Toolbar Positioning

- `position: fixed` — coordinates from raw `getBoundingClientRect()`, **no** `window.scrollX/Y` offset
- Centered: `left = rect.left + rect.width / 2 − toolbarWidth / 2`
- If fewer than 60px from viewport top, flip below selection

### CSS Isolation

`SelectionToolbar.init()` injects a `<style>` element with all toolbar CSS. All classes use the `ssh-toolbar-` prefix. The root element uses `all: initial` to prevent page style inheritance.

### Error Handling

`SelectionToolbar` uses the existing static `ChromeRuntimeHandler.sendMessage()` helper. On rejection (e.g. inactive service worker), the toolbar is silently dismissed and no highlight is created.

### Dismissal

Toolbar is removed when:
- User clicks outside it (one-time `mousedown` capture listener on `document`)
- Selection collapses via `selectionchange` (**only in State 1** — suppressed in State 2)
- Page scrolls (`scroll` on `window`, `{ passive: true }`)

---

## `DEFAULT_SCRIPTS` Load Order

`selection_toolbar.js` is inserted in `ChromeTabs.DEFAULT_SCRIPTS` **immediately before** `js/content_script/main.js`:

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
  "js/content_script/selection_toolbar.js",   // NEW
  "js/content_script/main.js",
]
```

All dependencies (`ChromeHighlightStorage`, `RangeUtils`, `ChromeRuntimeHandler`) are declared earlier in the list.

---

## Edge Cases

| Scenario | Behavior |
|----------|---------|
| Click outside toolbar | Toolbar dismissed, no highlight created |
| Empty/whitespace comment | Save disabled; no action |
| Comment cancelled (×) | Highlight stays, no comment stored |
| Comment > 1000 chars | `maxlength` prevents input beyond limit |
| Selection inside existing highlight | New highlight created (existing behavior) |
| Multi-element selection | `Marker.mark()` handles; no change needed |
| Page scrolls while toolbar open | `scroll` listener dismisses toolbar |
| Input focused (State 2) + selection collapses | `selectionchange` suppressed; toolbar stays |
| `Marker.update()` called after comment set | Attributes on existing elements are preserved; `updateHighlight()` explicitly re-reads and re-applies `data-comment` as a safeguard |
| `UPDATE_HIGHLIGHT_COMMENT` sent | Background updates DB, sends `SET_HIGHLIGHT_COMMENT` to content script to sync DOM |
| Page reload with commented highlight | `playbackDocuments()` forwards `doc.comment`; dot and tooltip restored |
| Highlight deleted | `[data-foreign]` cleanup removes dot; tooltip removed on `mouseleave` |
| Service worker inactive | `sendMessage` rejects; toolbar dismissed silently |

---

## Testing

New Playwright test file: `tests/selection-toolbar.spec.js`

### Test Cases

1. Select text → toolbar appears above selection (`position: fixed`, viewport-relative)
2. Click pen → highlight created with active style, toolbar dismissed
3. Click comment → toolbar expands, type text, press Enter → highlight + comment created, blue dot visible
4. Hover commented highlight → tooltip shows correct text (from `data-comment`)
5. Click × in comment mode → highlight stays, no comment in DB
6. Click outside toolbar → toolbar dismissed, no highlight created
7. Save button disabled for empty/whitespace-only input
8. Page scroll while toolbar open → toolbar dismissed
9. Page reload with commented highlight → dot and tooltip restored
10. Re-open comment input on existing commented highlight, edit text, save → `UPDATE_HIGHLIGHT_COMMENT` fires, `data-comment` updated in DOM, tooltip shows new text

### Regression

No changes to existing highlight creation/deletion paths. Existing Playwright tests should pass without modification.

---

## Out of Scope

- Editing an existing comment (deferred)
- Comments visible in the extension popup (deferred)
- Multiple highlight color selection from the toolbar (deferred — uses active style only)
- Comment threading or replies
