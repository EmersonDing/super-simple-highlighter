# Project Structure Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the extension to a full context-first file layout under `src/` and `assets/` while keeping the unpacked extension functional.

**Architecture:** Keep `manifest.json` at the repo root, move extension-owned code into runtime-specific folders, move shared browser libraries into `src/vendor/`, and move images/fonts into `assets/`. Update all path references in HTML, service worker bootstrap code, tests, and docs so the extension still loads without a bundler.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, AngularJS, Bootstrap, Playwright, Jest

---

### Task 1: Capture the current path surface

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `tests/e2e/options-pages.spec.js`

**Step 1: Inventory current entrypoints and path references**

Check:
- manifest background, popup, options, icons
- root HTML files and their script/link tags
- service worker bootstrap `importScripts()`
- test URLs that hardcode extension page paths

**Step 2: Confirm the exact destination layout**

Target:
- `src/background/`
- `src/content/`
- `src/popup/`
- `src/options/`
- `src/overview/`
- `src/shared/`
- `src/vendor/js/`
- `src/vendor/css/`
- `assets/icons/`
- `assets/images/`
- `assets/fonts/`

**Step 3: Commit**

```bash
git add docs/plans/2026-03-20-project-structure-reorg-design.md docs/plans/2026-03-20-project-structure-reorg.md
git commit -m "docs: add project structure reorg design and plan"
```

### Task 2: Move extension entry HTML and CSS

**Files:**
- Create: `src/popup/`
- Create: `src/options/`
- Create: `src/overview/`
- Modify: `popup.html`
- Modify: `options.html`
- Modify: `overview.html`
- Modify: `css/popup.css`
- Modify: `css/options.css`
- Modify: `css/overview.css`

**Step 1: Move HTML entry files**

Move:
- `popup.html` -> `src/popup/popup.html`
- `options.html` -> `src/options/options.html`
- `overview.html` -> `src/overview/overview.html`

**Step 2: Move UI CSS beside the owning entrypoint**

Move:
- `css/popup.css` -> `src/popup/popup.css`
- `css/options.css` -> `src/options/options.css`
- `css/overview.css` -> `src/overview/overview.css`

**Step 3: Update HTML relative references**

Adjust `<link>` and `<script>` tags in each HTML file to use the new relative paths to:
- local page CSS
- page JS
- shared/vendor JS and CSS
- static images if referenced

**Step 4: Verify extension pages still resolve**

Manual check after full path update:
- popup loads
- options page loads
- overview page loads

**Step 5: Commit**

```bash
git add src/popup src/options src/overview
git commit -m "refactor: move extension UI entrypoints into src"
```

### Task 3: Move runtime JavaScript by execution context

**Files:**
- Create: `src/background/`
- Create: `src/content/`
- Create: `src/shared/`
- Modify: `js/background/*`
- Modify: `js/content_script/*`
- Modify: `js/popup/*`
- Modify: `js/options/*`
- Modify: `js/overview/*`
- Modify: `js/shared/*`

**Step 1: Move background files**

Move `js/background/*` into `src/background/`.

**Step 2: Move content-script files**

Move `js/content_script/*` into `src/content/`.

**Step 3: Move page-specific UI JS**

Move:
- `js/popup/*` -> `src/popup/`
- `js/options/*` -> `src/options/`
- `js/overview/*` -> `src/overview/`

**Step 4: Move shared modules**

Move `js/shared/*` into `src/shared/`.

**Step 5: Update all path-based loading**

Adjust:
- `importScripts()` in the service worker bootstrap
- any string-based references to content scripts for dynamic injection
- any relative paths inside HTML files pointing at moved JS

**Step 6: Commit**

```bash
git add src/background src/content src/shared
git commit -m "refactor: move extension runtime scripts by context"
```

### Task 4: Move vendor and static assets into `src/vendor` and `assets`

**Files:**
- Create: `src/vendor/js/`
- Create: `src/vendor/css/`
- Create: `assets/icons/`
- Create: `assets/images/`
- Create: `assets/fonts/`
- Modify: `static/js/*`
- Modify: `static/css/*`
- Modify: `static/images/*`
- Modify: `static/fonts/*`

**Step 1: Move third-party JS and CSS**

Move:
- `static/js/*` -> `src/vendor/js/`
- `static/css/*` -> `src/vendor/css/`

Keep project-owned page CSS in page folders, not vendor CSS.

**Step 2: Move images and fonts**

Move:
- extension icons from `static/images/*.png` into `assets/icons/`
- non-icon images into `assets/images/`
- fonts into `assets/fonts/`

**Step 3: Update references**

Adjust:
- `manifest.json` icon paths
- HTML asset references
- any CSS `url(...)` references
- scripts such as `scripts/generate-icons.js` if they output to old paths

**Step 4: Commit**

```bash
git add src/vendor assets scripts/generate-icons.js manifest.json
git commit -m "refactor: move vendor and extension assets"
```

### Task 5: Update manifest and runtime integration

**Files:**
- Modify: `manifest.json`
- Modify: `src/background/main.js`
- Modify: `src/shared/chrome_tabs.js`

**Step 1: Update manifest entrypoints**

Set:
- `background.service_worker`
- `action.default_popup`
- `options_page`
- icon paths

**Step 2: Update dynamic injection paths**

Ensure any `chrome.scripting.executeScript()` or CSS injection uses the new `src/content/...` paths.

**Step 3: Verify service worker bootstrap**

Confirm `importScripts()` resolves with the new runtime paths and the extension boots without startup errors.

**Step 4: Commit**

```bash
git add manifest.json src/background/main.js src/shared/chrome_tabs.js
git commit -m "refactor: update manifest and runtime path wiring"
```

### Task 6: Update tests and docs for the new layout

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/design.md`
- Modify: `tests/e2e/options-pages.spec.js`
- Modify: `tests/CLAUDE.md`

**Step 1: Update extension page paths in tests**

Change hardcoded URLs such as `options.html` to `src/options/options.html`.

**Step 2: Update contributor docs**

Refresh architecture documentation to reference `src/background`, `src/content`, `src/shared`, and the UI entrypoint folders.

**Step 3: Commit**

```bash
git add README.md CLAUDE.md docs/design.md tests/e2e/options-pages.spec.js tests/CLAUDE.md
git commit -m "docs: update paths for reorganized extension layout"
```

### Task 7: Verify the reorganized extension end-to-end

**Files:**
- Test: `tests/unit/merge_utils.test.js`
- Test: `tests/e2e/highlight.spec.js`
- Test: `tests/e2e/options-pages.spec.js`
- Test: `tests/e2e/selection-toolbar.spec.js`

**Step 1: Run unit tests**

Run: `npm run test:unit`

Expected: PASS

**Step 2: Run E2E tests**

Run: `npm run test:e2e`

Expected: PASS

**Step 3: Load the unpacked extension manually if needed**

Validate:
- popup renders
- options page renders
- selection toolbar still appears on page text selection

**Step 4: Commit**

```bash
git add -A
git commit -m "test: verify project structure reorganization"
```
