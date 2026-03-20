# Super Simple Highlighter

Chrome extension (Manifest V3) that lets users highlight text on web pages. Highlights persist in PouchDB and are restored on page revisit.

## Docs

- `CLAUDE.md`: contributor and agent-facing project guide
- `docs/design.md`: concise design overview
- `docs/designs/`: detailed design specs
- `docs/plans/`: execution and implementation plans

## Architecture

- **Tech stack**: Chrome Extension Manifest V3, plain JavaScript, AngularJS, Bootstrap, PouchDB/IndexedDB, Jest, and Playwright.
- **Background runtime** (`src/background/`): The service worker is the privileged control plane for the extension. It owns Chrome API integrations such as context menus, commands, tab actions, storage coordination, and web-navigation-triggered highlight restoration.
- **Page runtime** (`src/content/`): Content scripts are the in-page execution layer. They translate saved highlight documents into `<mark>` elements, observe user interactions in the DOM, and host the floating selection toolbar UI that appears directly on web pages.
- **Shared core** (`src/shared/`): Shared modules hold the extension's domain logic and cross-context helpers, including persistence, highlight creation/removal flows, style management, and Chrome wrapper utilities used by multiple runtimes.
- **Extension pages** (`src/popup/`, `src/options/`, `src/overview/`): These are the user-facing management surfaces. The popup handles quick highlight actions for the active tab, the options page manages styles/settings/backups, and the overview page renders exported or browsable highlight summaries.
- **Bundled browser dependencies** (`src/vendor/`): Third-party JS and CSS are kept separate from extension-owned logic because they are loaded directly at runtime without a bundling step.
- **Static assets** (`assets/`): Icons, warning images, and fonts used by the manifest and UI surfaces live outside runtime code so entrypoints can reference them predictably.

## Path Rules

- Keep `manifest.json` at the repository root.
- New extension-owned runtime code should go under the matching `src/<context>/` folder, not under root-level `js/`, `css/`, or `static/` directories.
- New third-party browser libraries belong under `src/vendor/`.
- New icons, images, and fonts belong under `assets/`.
- Because the extension is loaded unpacked without a bundler, every moved file must have its relative `<script>`, `<link>`, `importScripts()`, and string-based runtime paths updated together.

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
