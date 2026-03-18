# Options Page Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the options page with navbar/About branding cleanup, compacted styles grid, a comment-setting section, and a new merge-backup feature backed by a unit-tested pure function.

**Architecture:** UI-only changes land first (Tasks 1–2), then the DB helper (Task 3), then the pure merge function with tests (Task 4), then the full merge feature wired together (Tasks 5–6). Each task is independently committable.

**Tech Stack:** AngularJS 1.x, Bootstrap 3, PouchDB 6, pouchdb-replication-stream, Jest 29 (added for unit tests), plain ES2015 classes loaded via `<script>` tags (no bundler).

---

## File Map

| File | Change |
|------|--------|
| `options.html` | Navbar link, remove right nav, h2→h3, Merge panel, About changelog/copyright |
| `css/options.css` | `.token` flex layout, 4-per-row grid |
| `js/shared/db.js` | Add `getAllDocuments()` public method |
| `js/options/merge_utils.js` | **New** — pure `mergeHighlightDocs()` function |
| `js/options/controllers/advanced.js` | Wire `#mergeFiles` input, `onMergeFilesChange()` handler |
| `tests/unit/merge_utils.test.js` | **New** — Jest unit tests for `mergeHighlightDocs` |
| `package.json` | Add `jest ^29` devDependency, `test:unit` script |

---

## Task 1: Navbar and About page branding cleanup

**Files:**
- Modify: `options.html`

- [ ] **Step 1: Update navbar brand link**

  In `options.html` around line 39, replace:
  ```html
  <a class="navbar-brand" data-ng-controller="about" ng-href="{{'extension_webstore_url' | i18n}}">
  ```
  with:
  ```html
  <a class="navbar-brand" href="https://github.com/emersonding/super-simple-highlighter" target="_blank">
  ```
  Also remove the `data-ng-controller="about"` attribute (the brand no longer needs the about controller since it's a static link).

- [ ] **Step 2: Remove right-side nav links**

  Delete the entire block (lines 49–53):
  ```html
  <ul class="nav navbar-nav navbar-right">
      <li><a target="_blank" href="https://www.dexterouslogic.com/assets/supersimplehighlighter/faq.html">{{'faq_title' | i18n}}</a></li>
      <li><a ng-href="{{'extension_author_url' | i18n}}">&copy;{{'copyright_year' | i18n}} {{ 'extension_author' | i18n }}</a></li>
  </ul>
  ```

- [ ] **Step 3: Update About page changelog link**

  In `options.html` around line 375, replace:
  ```html
  <small><a target="_blank" href="https://www.dexterouslogic.com/assets/supersimplehighlighter/changelog.txt">{{'changelog' | i18n}}</a></small>
  ```
  with:
  ```html
  <small><a target="_blank" href="https://github.com/emersonding/super-simple-highlighter">{{'changelog' | i18n}}</a></small>
  ```

- [ ] **Step 4: Remove copyright paragraph in About page**

  Delete the `<p>` block (around line 378):
  ```html
  <p>
      <small>&copy;{{'copyright_year' | i18n}}</small> <strong><a ng-href="{{'extension_author_url' | i18n}}">{{ 'extension_author' | i18n }}</a></strong>
  </p>
  ```

- [ ] **Step 5: Load the extension in Chrome and verify**

  Open `chrome://extensions`, load unpacked, open Options. Check:
  - Top-left brand link opens `https://github.com/emersonding/super-simple-highlighter` in a new tab
  - No FAQ or copyright links appear in the top-right
  - About tab: changelog link points to the GitHub fork, no copyright line

- [ ] **Step 6: Commit**

  ```bash
  git add options.html
  git commit -m "feat: update navbar link and remove branding links, update About page"
  ```

---

## Task 2: Styles pane layout — 4-per-row grid and Comment setting section

**Files:**
- Modify: `options.html`
- Modify: `css/options.css`

- [ ] **Step 1: Change styles pane heading from h2 to h3**

  In `options.html` around line 151, replace:
  ```html
  <h2>{{ 'options_tab_page_header_sites' | i18n }}</h2>
  ```
  with:
  ```html
  <h3>{{ 'options_tab_page_header_sites' | i18n }}</h3>
  ```

- [ ] **Step 2: Make the token list a flex container**

  In `options.html` around line 153, add a `style` attribute to the `<ul>`:
  ```html
  <ul class="list-unstyled" style="display:flex; flex-wrap:wrap;">
  ```

- [ ] **Step 3: Update .token CSS for 4-per-row layout**

  In `css/options.css`, replace the `.token` rule:
  ```css
  .token {
      margin: 0 0 12pt 0;
      font-size: 2rem !important;
      cursor: pointer;
      display: block;
      border: 2px solid #444;
      animation: unset !important;
  }
  ```
  with:
  ```css
  .token {
      width: calc(25% - 8px);
      margin: 4px;
      font-size: 1.2rem !important;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      border: 2px solid #444;
      animation: unset !important;
  }

  .token > .close {
      margin-left: auto;
  }
  ```

- [ ] **Step 4: Add "Comment setting" h3 and reorder elements**

  In `options.html`, find the "Pen button default style" row (around line 199):
  ```html
  <!--Pen button default style-->
  <div class="row" style="margin-top:10px">
  ```
  Insert an `<h3>` immediately before it:
  ```html
  <h3>Comment setting</h3>
  <!--Pen button default style-->
  <div class="row" style="margin-top:10px">
  ```

- [ ] **Step 5: Add margin before Reset button row**

  In `options.html`, find the Buttons row (around line 210):
  ```html
  <!-- Buttons -->
  <div class="row">
  ```
  Change it to:
  ```html
  <!-- Buttons -->
  <div class="row" style="margin-top:2em">
  ```

- [ ] **Step 6: Verify in Chrome**

  Open Options → Styles tab. Check:
  - Heading is smaller (h3 not h2)
  - Color blocks appear 4 per row with consistent spacing
  - "Comment setting" h3 appears above the pen button dropdown
  - "Reset to default styles" button has extra vertical space above it

- [ ] **Step 7: Commit**

  ```bash
  git add options.html css/options.css
  git commit -m "feat: compact styles grid to 4-per-row, add Comment setting section"
  ```

---

## Task 3: Add getAllDocuments() to DB class

**Files:**
- Modify: `js/shared/db.js`

- [ ] **Step 1: Add the method**

  In `js/shared/db.js`, find the `getSums()` method (around line 532). Add `getAllDocuments()` directly after it (before the next `//` comment block):

  ```js
  /**
   * Get all documents in the database
   * @returns {Promise<Object[]>} array of all documents (design docs excluded by PouchDB default)
   */
  getAllDocuments() {
    return this.getDB().then(db => db.allDocs({ include_docs: true })).then(({rows}) =>
      rows.map(r => r.doc).filter(Boolean)
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add js/shared/db.js
  git commit -m "feat: add getAllDocuments() public method to DB class"
  ```

---

## Task 4: Pure merge function with unit tests

**Files:**
- Create: `js/options/merge_utils.js`
- Create: `tests/unit/merge_utils.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add Jest to package.json**

  In `package.json`, add to `devDependencies` and `scripts`:
  ```json
  {
    "scripts": {
      "test:e2e": "npx playwright test",
      "test:unit": "jest tests/unit",
      "generate:icons": "node scripts/generate-icons.js"
    },
    "devDependencies": {
      "@playwright/test": "^1.50.0",
      "@resvg/resvg-js": "^2.6.2",
      "jest": "^29"
    }
  }
  ```

- [ ] **Step 2: Install Jest**

  ```bash
  npm install
  ```
  Expected: `jest` installed under `node_modules/.bin/jest`.

- [ ] **Step 3: Write the failing tests first**

  Create `tests/unit/merge_utils.test.js`:
  ```js
  const { mergeHighlightDocs } = require('../../js/options/merge_utils')

  function makeDoc(match, text, range, extra = {}) {
    return { verb: 'create', match, text, range, ...extra }
  }

  describe('mergeHighlightDocs', () => {
    test('returns current docs unchanged when backup is empty', () => {
      const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
      expect(mergeHighlightDocs(current, [])).toEqual(current)
    })

    test('returns all backup docs when current is empty', () => {
      const backup = [makeDoc('https://a.com', 'hello', '{"start":0}')]
      expect(mergeHighlightDocs([], backup)).toEqual(backup)
    })

    test('does not add backup doc with same match+text+range as current', () => {
      const doc = makeDoc('https://a.com', 'hello', '{"start":0}')
      const result = mergeHighlightDocs([doc], [doc])
      expect(result).toHaveLength(1)
    })

    test('adds backup doc with same match+text but different range', () => {
      const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
      const backup  = [makeDoc('https://a.com', 'hello', '{"start":5}')]
      expect(mergeHighlightDocs(current, backup)).toHaveLength(2)
    })

    test('adds backup doc on a URL not in current DB', () => {
      const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
      const backup  = [makeDoc('https://b.com', 'world', '{"start":0}')]
      const result = mergeHighlightDocs(current, backup)
      expect(result).toHaveLength(2)
      expect(result[1].match).toBe('https://b.com')
    })

    test('adds backup doc with comment field when no content match', () => {
      const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
      const backup  = [makeDoc('https://a.com', 'world', '{"start":0}', { comment: 'note' })]
      expect(mergeHighlightDocs(current, backup)).toHaveLength(2)
    })

    test('includes DELETE doc if accidentally passed in backupDocs (no guard in function)', () => {
      const deleteDoc = { verb: 'delete', match: 'https://a.com', correspondingDocumentId: 'abc' }
      const result = mergeHighlightDocs([], [deleteDoc])
      expect(result).toHaveLength(1)
      expect(result[0].verb).toBe('delete')
    })

    test('current docs always appear before added backup docs in output', () => {
      const current = [makeDoc('https://a.com', 'first',  '{"start":0}')]
      const backup  = [makeDoc('https://b.com', 'second', '{"start":0}')]
      const result = mergeHighlightDocs(current, backup)
      expect(result[0].match).toBe('https://a.com')
      expect(result[1].match).toBe('https://b.com')
    })
  })
  ```

- [ ] **Step 4: Run tests — confirm they all fail**

  ```bash
  npm run test:unit
  ```
  Expected: all tests fail with `Cannot find module '../../js/options/merge_utils'`.

- [ ] **Step 5: Create merge_utils.js**

  Create `js/options/merge_utils.js`:
  ```js
  /**
   * Merge backup CREATE docs into current active docs, deduplicating by content.
   * Caller is responsible for passing only CREATE docs; DELETE docs are not filtered here.
   *
   * @param {Object[]} currentDocs - net-active CREATE docs from current DB
   * @param {Object[]} backupDocs  - CREATE docs from backup (DELETE docs pre-filtered by caller)
   * @returns {Object[]} currentDocs + non-duplicate backupDocs
   */
  function mergeHighlightDocs(currentDocs, backupDocs) {
    // range is stored as a stringified xrange object; String() is safe and avoids double-serialization
    const key = doc => [doc.match, doc.text, String(doc.range)].join('\0')
    const existing = new Set(currentDocs.map(key))
    const toAdd = backupDocs.filter(d => !existing.has(key(d)))
    return [...currentDocs, ...toAdd]
  }

  // Node.js export for unit tests; not used in browser context
  if (typeof module !== 'undefined') module.exports = { mergeHighlightDocs }
  ```

- [ ] **Step 6: Run tests — confirm they all pass**

  ```bash
  npm run test:unit
  ```
  Expected: 7 tests pass, 0 fail.

- [ ] **Step 7: Commit**

  ```bash
  git add js/options/merge_utils.js tests/unit/merge_utils.test.js package.json package-lock.json
  git commit -m "feat: add mergeHighlightDocs pure function with Jest unit tests"
  ```

---

## Task 5: Merge panel HTML in options.html

**Files:**
- Modify: `options.html`

- [ ] **Step 1: Add the Merge panel**

  In `options.html`, find the end of the "Restore" (Import) `<li>` block (around line 353–365):
  ```html
              </li>
          </ul>
      </div>
  </div>
  ```
  Insert a new `<li>` for the Merge panel inside the `<ul class="list-group">`, after the existing Import `<li>` and before `</ul>`:
  ```html
  <li class="list-group-item">
      <h5>Merge</h5>
      <p class="text-warning">
          <strong>Warning:</strong> back up your data before merging.
          Merging imports highlights from a backup file while keeping your existing highlights.
      </p>
      <div class="row-buttons">
          <span class="btn btn-default btn-file">
              Merge from backup
              <input type="file" id="mergeFiles">
          </span>
      </div>
  </li>
  ```

- [ ] **Step 2: Add merge_utils.js script tag**

  In `options.html`, find the script block near the bottom. Add `merge_utils.js` **before** `advanced.js`:
  ```html
  <script src="js/options/merge_utils.js"></script>
  <script src="js/options/controllers/advanced.js"></script>
  ```
  (It must come before `advanced.js` so `mergeHighlightDocs` is a defined global when the controller loads.)

- [ ] **Step 3: Verify the UI appears in Chrome**

  Open Options → Advanced tab. Check:
  - A "Merge" section appears below "Restore"
  - Warning text is visible in amber/warning color
  - "Merge from backup" button is present and clicking it opens a file picker

- [ ] **Step 4: Commit**

  ```bash
  git add options.html
  git commit -m "feat: add Merge panel to Advanced/Backups pane"
  ```

---

## Task 6: Merge controller logic in advanced.js

**Files:**
- Modify: `js/options/controllers/advanced.js`

- [ ] **Step 1: Add onMergeFilesChange to the constructor**

  In `advanced.js`, find the constructor's `for` loop that binds methods to `$scope` (around line 29–35):
  ```js
  for (const func of [
      this.onClickExport,
      this.onClickOptimize,
      this.onFilesChange
  ]) {
      this.scope[func.name] = func.bind(this)
  }
  ```
  Add `this.onMergeFilesChange` to the array:
  ```js
  for (const func of [
      this.onClickExport,
      this.onClickOptimize,
      this.onFilesChange,
      this.onMergeFilesChange
  ]) {
      this.scope[func.name] = func.bind(this)
  }
  ```

  Then, after the existing `document.querySelector('#files').addEventListener(...)` line, add:
  ```js
  document.querySelector('#mergeFiles').addEventListener('change', this.onMergeFilesChange.bind(this))
  ```

- [ ] **Step 2: Add the onMergeFilesChange method**

  Add the full method to the `Controller` class, after `onFilesChange()` and before `onClickExport()`:

  ```js
  /**
   * Handle file selection for the Merge feature.
   * Merges highlights from a backup file with the current DB, deduplicating by content.
   */
  async onMergeFilesChange() {
    const file = event.target.files[0]
    if (!file) return

    const ldjson = await file.text()
    const lines = ldjson.split('\n').filter(line => line.length > 0)

    // Validate header
    let header
    try {
      header = JSON.parse(lines[0])
    } catch (e) {
      alert('Error merging backup\n\nStatus: 400\nMessage: Invalid file (bad JSON)')
      return
    }
    if (header.magic !== Controller.MAGIC || header.version !== 1) {
      alert('Error merging backup\n\nStatus: 403\nMessage: Invalid file')
      return
    }

    // Remaining lines: storageItems on line 2, rest is DB stream
    const backupStream = lines.slice(2).join('\n')

    let tmpDB = null
    let mergeOutDB = null

    try {
      // Step 1: Extract backup CREATE docs from a temporary PouchDB
      tmpDB = new PouchDB('_mergetmpdb', { storage: 'temporary' })
      await tmpDB.load(backupStream)
      const allBackupRows = (await tmpDB.allDocs({ include_docs: true })).rows
      const backupDocs = allBackupRows
        .map(r => r.doc)
        .filter(d => d && d.verb === DB.DOCUMENT.VERB.CREATE)
      await tmpDB.destroy()
      tmpDB = null

      // Step 2: Get net-active CREATE docs from current DB
      const allCurrentDocs = await new DB().getAllDocuments()
      const deletedIds = new Set(
        allCurrentDocs
          .filter(d => d.verb === DB.DOCUMENT.VERB.DELETE)
          .map(d => d[DB.DOCUMENT.NAME.CORRESPONDING_DOC_ID])
      )
      const currentDocs = allCurrentDocs.filter(
        d => d.verb === DB.DOCUMENT.VERB.CREATE && !deletedIds.has(d._id)
      )

      // Step 3: Fetch current storage items (style definitions — do NOT merge from backup)
      const currentStorageItems = await new ChromeHighlightStorage().getAll({ defaults: false })

      // Step 4: Merge
      const mergedDocs = mergeHighlightDocs(currentDocs, backupDocs)

      // Step 5: Confirm with user
      const confirmed = window.confirm(
        `Merge will grow from ${currentDocs.length} → ${mergedDocs.length} highlights. Continue?`
      )
      if (!confirmed) return

      // Step 6: Build merged ldjson via a fresh tmpDB dump
      mergeOutDB = new PouchDB('_mergeout', { storage: 'temporary' })
      await mergeOutDB.bulkDocs(
        mergedDocs.map(d => { const c = { ...d }; delete c._rev; return c })
      )
      const stream = new window.memorystream()
      let mergedStream = ''
      stream.on('data', chunk => { mergedStream += chunk.toString() })
      await mergeOutDB.dump(stream)
      await mergeOutDB.destroy()
      mergeOutDB = null

      const mergedLdjson = [
        JSON.stringify({ magic: Controller.MAGIC, version: 1 }),
        JSON.stringify(currentStorageItems),
        mergedStream,
      ].join('\n')

      // Step 7: Load merged DB (replaces current DB) and reload page
      await new DB().loadDB(mergedLdjson)
      location.reload()

    } catch (err) {
      // Cleanup any in-flight tmpDBs
      if (tmpDB) await tmpDB.destroy().catch(() => {})
      if (mergeOutDB) await mergeOutDB.destroy().catch(() => {})
      alert(`Error merging backup\n\nStatus: ${err.status || 500}\nMessage: ${err.message || err}`)
    }
  }
  ```

- [ ] **Step 3: Verify end-to-end in Chrome**

  1. Open Options → Advanced. Confirm the Merge section is visible with the warning text.
  2. Export a backup first (use the existing Export button) — save the file.
  3. Add one or two new highlights on any page.
  4. Open Options → Advanced → Merge, select the exported backup file.
  5. Confirm dialog should show the count (e.g., "3 → 3" if no new highlights are in the backup, or "2 → 3" if the backup had more).
  6. Accept. Page should reload. Open the Bookmarks tab — all highlights should be present.
  7. Try merging again with the same file — count should stay the same (no duplicates added).

- [ ] **Step 4: Commit**

  ```bash
  git add js/options/controllers/advanced.js
  git commit -m "feat: implement merge-from-backup in advanced controller"
  ```

---

## Final verification

- [ ] Run unit tests one more time to confirm nothing regressed:
  ```bash
  npm run test:unit
  ```
  Expected: 7 tests pass.

- [ ] Load extension in Chrome and do a final walkthrough of all tabs (Styles, Advanced, About) to confirm all visual changes are correct.
