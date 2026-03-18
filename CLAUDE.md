# Super Simple Highlighter

Chrome extension (Manifest V3) that lets users highlight text on web pages. Highlights persist in PouchDB and are restored on page revisit.

## Docs

- `CLAUDE.md`: contributor and agent-facing project guide
- `docs/design.md`: concise design overview
- `docs/designs/`: detailed design specs
- `docs/plans/`: execution and implementation plans

## Architecture

- **Service worker** (`js/background/main.js`): Loads all shared/background modules via `importScripts()`. Handles context menus, commands, storage, and web navigation events.
- **Content scripts** (`js/content_script/`): Injected on demand via ping-then-inject pattern in `chrome_tabs.js`. Create/remove `<mark>` elements in the page DOM.
- **Shared modules** (`js/shared/`): Database (`db.js` using PouchDB), highlight coordination (`highlighter.js`), Chrome API wrappers.
- **UI**: Popup (`popup.html`), options page (`options.html`), floating selection toolbar (`js/content_script/selection_toolbar.js`).

## Key patterns

- **Ping-then-inject**: `ChromeTabs.sendMessage()` pings the content script first; if no response, injects all default scripts before sending the actual message.
- **PouchDB without map/reduce**: DB queries use `allDocs()` + in-memory filtering (not `db.query()`) to avoid `Function()` calls that violate MV3's CSP.
- **Context menu highlight**: `ChromeContextMenusHandler.onClicked()` parses `menuItemId` format `create_highlight.<className>` to determine the highlight style.
- **Selection toolbar flow**: Selection UI runs in the content script, while persistence and tab-opening operations are routed through background runtime messages.
- **Hermetic toolbar tests**: Toolbar E2E coverage should stay local/self-contained and avoid depending on third-party responses.

## Testing

See `tests/CLAUDE.md` for full details. Run E2E tests after modifying highlighting-related code:

```bash
npx playwright test
```

First-time setup: `npm install && npx playwright install chromium`
