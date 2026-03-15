# Tests

## Overview

Playwright E2E tests that verify the extension's highlighting functionality by loading it into a real Chromium instance.

## How it works

1. A local HTTP server serves static HTML fixtures from `tests/fixtures/`
2. Chromium launches with the extension loaded via `--load-extension`
3. Tests programmatically select text, trigger highlights via the service worker, and assert `<mark>` elements appear in the DOM

## When to run

- After modifying any highlighting-related code (`chrome_tabs.js`, `db.js`, `highlighter.js`, content scripts, context menu handler)
- After changing how content scripts are injected or how messages are passed between SW and content scripts
- After upgrading PouchDB or changing database schema/queries

## Running

```bash
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers npx playwright test
```

First-time setup:

```bash
npm install
npx playwright install chromium
```

## Structure

- `e2e/highlight.spec.js` — Creates a highlight and verifies it appears in the DOM and persists after reload
- `fixtures/test-page.html` — Minimal HTML page with a `<p>` element used as the highlight target
