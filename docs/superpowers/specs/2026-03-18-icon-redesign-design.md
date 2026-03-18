# Icon Redesign — Flat Apple-Style

**Date:** 2026-03-18
**Method:** Claude Code superpowers brainstorming
**Status:** Approved by user

---

## Overview

Replace the existing skeuomorphic blue highlighter marker icon (and emoji toolbar buttons) with a flat, Apple-style icon set in charcoal (#3A3A3C) on a neutral grey background. The redesign covers two surfaces:

1. **Extension icon** — the icon shown in Chrome's toolbar and extension management pages (multiple PNG sizes)
2. **Floating toolbar buttons** — the highlight and comment buttons rendered inline in page content via `SelectionToolbar`

---

## Design

### Icon shapes

**Highlight** — a bold diagonal stroke (bottom-left to top-right) with a small square cap at the base tip. Communicates "marker" abstractly without being literal.

**Comment** — a rounded rectangle with a small left-bottom tail. Clean, minimal speech bubble. No internal detail (dots, lines) at small sizes.

### Color

- **Icon color:** `#3A3A3C` (Apple system charcoal, legible on light backgrounds)
- **Container background:** `#E5E5EA` (Apple system light grey) — used only for extension PNGs, not the toolbar
- Dark mode adaptive icons are **out of scope** for this redesign

### SVG geometry (32×32 viewport)

**Highlight:**
```svg
<path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/>
<rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/>
```

**Comment:**
```svg
<rect x="3" y="2" width="26" height="21" rx="7" fill="#3a3a3c"/>
<path d="M10 23 L9 30 L18 23" fill="#3a3a3c"/>
```

Note: geometry must be visually verified at 16px render size before finalising the PNG generation script. Adjust tail path if it merges into noise.

---

## Scope

### 1. Extension icon PNGs

Replace all files in `static/images/` with the new highlight icon design rendered at each required size. Use `resvg-js` (pure JS, no native build deps) to rasterise SVG to PNG.

| File | Size | Used in |
|------|------|---------|
| `16.png` | 16×16 | `manifest.json` → `action.default_icon` + `icons` |
| `19.png` | 19×19 | `manifest.json` → `icons` only |
| `32.png` | 32×32 | `manifest.json` → `action.default_icon` + `icons` |
| `38.png` | 38×38 | `manifest.json` → `icons` only |
| `48.png` | 48×48 | `manifest.json` → `icons` |
| `64.png` | 64×64 | `manifest.json` → `icons` |
| `96.png` | 96×96 | `manifest.json` → `icons` |
| `128.png` | 128×128 | `manifest.json` → `icons` |
| `256.png` | 256×256 | `manifest.json` → `icons` |

Each PNG: icon SVG centered on a `#E5E5EA` rounded-square background. Corner radius = 22.5% of size (matches iOS icon rounding).

`popup/19_warning.png` and `popup/38_warning.png` are **not** in scope (not referenced in `manifest.json`).

**Tooling:**
- Add `resvg-js` to `devDependencies` in `package.json`
- Create `scripts/generate-icons.js` — renders the SVG template at each size and writes PNGs to `static/images/`
- Add npm script: `"generate:icons": "node scripts/generate-icons.js"`

### 2. Floating toolbar inline SVGs

In `js/content_script/selection_toolbar.js`, replace all emoji occurrences with inline SVG. There are **four** locations:

The toolbar root background is `#2c2c2c` (dark). The pen button has a light-coloured background set per the active highlight colour (e.g. `#ffffaa`), so charcoal is legible there. The comment button and editor icon spans are transparent over the dark toolbar, so they need a light icon colour.

| Method | Current | Replace with | Icon fill |
|--------|---------|-------------|-----------|
| `_showIdle()` — pen button | orange pen emoji (textContent) | highlight SVG (16px) | `#3a3a3c` (dark, against light highlight bg) |
| `_showIdle()` — comment button | `\uD83D\uDCAC` (textContent) | comment SVG (16px) | `#e5e5ea` (light, against dark toolbar) |
| `_showCommentInput()` — icon span | `\uD83D\uDCAC` (textContent) | comment SVG (13px) | `#e5e5ea` |
| `_showCommentEditor()` — icon span | `\uD83D\uDCAC` (textContent) | comment SVG (13px) | `#e5e5ea` |

**Implementation detail:** set `element.innerHTML` to the SVG string rather than `element.textContent`. Use hardcoded fill colours as above — do **not** use `currentColor`.

---

## Out of scope

- Dark mode adaptive icons
- Animated hover states
- Changing highlight color dot indicators
- `popup/19_warning.png` / `popup/38_warning.png`
