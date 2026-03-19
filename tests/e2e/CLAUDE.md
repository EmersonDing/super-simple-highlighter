# E2E Tests

This folder contains Playwright end-to-end tests for the Chrome extension.

- `highlight.spec.js`: core highlight behavior. Covers creating highlights from selected text, persisting them, and basic Advanced tab rendering for storage usage.
- `options-pages.spec.js`: Pages tab behavior in `options.html`. Covers showing saved pages and the highlight text associated with those pages.
- `advanced.spec.js`: Advanced tab backup flows. Covers export, import, and merge behavior for extension data backups.
- `selection-toolbar.spec.js`: floating selection toolbar behavior on web pages. Covers toolbar positioning, search and highlight actions, comment flows, dismissal behavior, and comment persistence after reload.

Keep this file aligned with the current spec files in this folder. Update it when specs are added, removed, renamed, or substantially repurposed.
