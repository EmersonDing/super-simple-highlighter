# Icon Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the skeuomorphic blue highlighter PNG and emoji toolbar buttons with flat, Apple-style charcoal SVG icons.

**Architecture:** Two independent changes: (1) a Node.js script that rasterises SVG to PNG at all required sizes and writes them to `static/images/`; (2) direct edits to `selection_toolbar.js` replacing four emoji `textContent` assignments with inline SVG `innerHTML`. No runtime dependencies added — only a `devDependency` for the icon generation tool.

**Tech Stack:** Node.js (icon generation script), `resvg-js` (SVG→PNG rasteriser, pure JS, no native deps), SVG (icon source), existing vanilla JS content script

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `scripts/generate-icons.js` | Renders highlight icon SVG at all sizes → `static/images/*.png` |
| Modify | `package.json` | Add `resvg-js` devDependency + `generate:icons` npm script |
| Modify | `static/images/16.png` … `256.png` | Replaced by running the generation script (9 files) |
| Modify | `js/content_script/selection_toolbar.js` | Replace 4 emoji assignments with inline SVG |

---

### Task 1: Add resvg-js and npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install resvg-js as a devDependency**

```bash
npm install --save-dev @resvg/resvg-js
```

Expected: `package.json` now has `"@resvg/resvg-js"` in `devDependencies`. A `node_modules/@resvg/` directory appears.

- [ ] **Step 2: Add the npm script to package.json**

Open `package.json` and add the `generate:icons` script so the `scripts` block reads:

```json
"scripts": {
  "test:e2e": "npx playwright test",
  "generate:icons": "node scripts/generate-icons.js"
}
```

- [ ] **Step 3: Verify the script key is recognised**

```bash
npm run generate:icons --dry-run 2>&1 | head -5
```

Expected: error like "Cannot find module" (script not created yet) — that's fine. The important thing is npm does not say "missing script: generate:icons".

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add resvg-js devDep and generate:icons npm script"
```

---

### Task 2: Write the icon generation script

**Files:**
- Create: `scripts/generate-icons.js`

The script builds a full SVG document for each size: a rounded-square background in `#E5E5EA` then the highlight icon paths scaled to fit, then rasterises to PNG using `@resvg/resvg-js`.

- [ ] **Step 1: Create the scripts directory and generation script**

Create `scripts/generate-icons.js` with the following content:

```js
#!/usr/bin/env node
/**
 * Generates static/images/*.png — the extension icon at all required sizes.
 * Run: npm run generate:icons
 *
 * Source icon: highlight marker (diagonal stroke + square tip), charcoal #3a3a3c
 * on light grey #e5e5ea rounded-square background.
 *
 * SVG geometry is defined in a 32×32 viewport and scaled to each target size.
 */

const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'static', 'images')

const SIZES = [16, 19, 32, 38, 48, 64, 96, 128, 256]

// Icon geometry — 32×32 viewport, charcoal fill
const ICON_PATHS = `
  <path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/>
`

/**
 * Build a full SVG string for the given pixel size.
 * The icon paths are defined in a 32×32 space; we scale them to fit
 * inside an inset (icon occupies ~65% of total canvas) centred on the bg.
 */
function buildSvg(size) {
  const radius = Math.round(size * 0.225)       // 22.5% corner radius
  const iconSize = Math.round(size * 0.65)       // icon occupies 65% of canvas
  const offset = Math.round((size - iconSize) / 2)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${radius}" fill="#e5e5ea"/>
  <!-- Icon: 32x32 paths scaled and centred -->
  <g transform="translate(${offset}, ${offset}) scale(${iconSize / 32})">
    ${ICON_PATHS}
  </g>
</svg>`
}

function generateAll() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  for (const size of SIZES) {
    const svg = buildSvg(size)
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()
    const outPath = path.join(OUT_DIR, `${size}.png`)
    fs.writeFileSync(outPath, pngBuffer)
    console.log(`  ✓ ${size}.png  (${pngBuffer.length} bytes)`)
  }

  console.log(`\nGenerated ${SIZES.length} icons → ${OUT_DIR}`)
}

generateAll()
```

- [ ] **Step 2: Run the script and verify output**

```bash
npm run generate:icons
```

Expected output (sizes/bytes will vary slightly):
```
  ✓ 16.png  (...)
  ✓ 19.png  (...)
  ✓ 32.png  (...)
  ✓ 38.png  (...)
  ✓ 48.png  (...)
  ✓ 64.png  (...)
  ✓ 96.png  (...)
  ✓ 128.png (...)
  ✓ 256.png (...)

Generated 9 icons → .../static/images
```

If you get a module error, make sure Task 1 Step 1 ran successfully.

- [ ] **Step 3: Visually inspect the generated icons**

Open the PNGs in any image viewer (macOS Finder Quick Look works). Check:
- Grey rounded-square background visible at all sizes
- Diagonal stroke legible at 16px and 32px (the two smallest sizes likely to appear in Chrome's toolbar)
- No clipping or misalignment

If the icon looks too small or too large inside the badge, adjust the `0.65` scale constant in `buildSvg()` and re-run until it looks right.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.js static/images/
git commit -m "feat: generate flat charcoal highlight icon PNGs via resvg-js"
```

---

### Task 3: Replace toolbar emoji with inline SVG

**Files:**
- Modify: `js/content_script/selection_toolbar.js`

There are four locations. Make all four changes in one edit pass, then verify manually.

**SVG strings to use:**

Highlight icon (pen button — dark `#3a3a3c`, against light highlight bg):
```js
const HIGHLIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/><rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/></svg>`
```

Comment icon (all comment locations — light `#e5e5ea`, against dark `#2c2c2c` toolbar):
```js
const COMMENT_SVG_16 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`
const COMMENT_SVG_13 = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`
```

- [ ] **Step 1: Add SVG constants at the top of the class, and replace all four emoji locations**

At the top of `selection_toolbar.js`, just after the GPL header comment block and before the JSDoc comment, add the three SVG constants:

```js
const HIGHLIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/><rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/></svg>`
const COMMENT_SVG_16 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`
const COMMENT_SVG_13 = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`
```

Then make these four targeted replacements:

**Location 1** — `_showIdle()`, pen button (line ~207):
```js
// Before:
pen.textContent = '\u270F\uFE0F'

// After:
pen.innerHTML = HIGHLIGHT_SVG
```

**Location 2** — `_showIdle()`, comment button (line ~219):
```js
// Before:
comment.textContent = '\uD83D\uDCAC'

// After:
comment.innerHTML = COMMENT_SVG_16
```

**Location 3** — `_showCommentInput()`, icon span (line ~245):
```js
// Before:
icon.textContent = '\uD83D\uDCAC'
icon.style.cssText = 'font-size:13px'

// After:
icon.innerHTML = COMMENT_SVG_13
// (remove the font-size line — no longer needed)
```

**Location 4** — `_showCommentEditor()`, icon span (line ~393):
```js
// Before:
icon.textContent = '\uD83D\uDCAC'
icon.style.cssText = 'font-size:13px'

// After:
icon.innerHTML = COMMENT_SVG_13
// (remove the font-size line — no longer needed)
```

- [ ] **Step 2: Load the extension in Chrome and verify manually**

1. Open `chrome://extensions`
2. Click "Load unpacked" → select the repo root
3. Navigate to any webpage with text (e.g. Wikipedia)
4. Select some text — the floating toolbar should appear
5. Verify: pen button shows a diagonal stroke icon (charcoal, on coloured background), comment button shows a speech bubble (light, on dark toolbar)
6. Click the comment button — the expanded toolbar should show a small speech bubble icon next to the input
7. If a highlight has a comment dot, click it — the comment editor toolbar should also show the speech bubble icon

- [ ] **Step 3: Commit**

```bash
git add js/content_script/selection_toolbar.js
git commit -m "feat: replace emoji toolbar buttons with flat SVG icons"
```

---

### Task 4: Verify extension icon appears correctly in Chrome

**Files:** (none to modify — this is a verification task)

- [ ] **Step 1: Reload the extension and check the browser toolbar icon**

1. In `chrome://extensions`, click the reload button for Super Simple Highlighter
2. Pin the extension to the Chrome toolbar if not already pinned
3. Verify the icon shows the new flat charcoal diagonal stroke on a grey rounded-square badge
4. Check it at both 1× and 2× display density if possible (Retina Mac: the `32.png` is used at 1× nominal, `64.png` at 2×)

- [ ] **Step 2: Check extension management page**

1. Open `chrome://extensions`
2. Verify the extension card shows the new icon (uses `128.png`)

- [ ] **Step 3: Final commit if any last tweaks were made**

If you adjusted icon geometry in Task 2 Step 3 and re-generated PNGs, make sure those are committed:

```bash
git status
# If anything is uncommitted:
git add static/images/ scripts/generate-icons.js
git commit -m "fix: adjust icon geometry after visual verification"
```
