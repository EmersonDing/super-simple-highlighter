# Project Structure Reorganization Design

**Date:** 2026-03-20

## Goal

Reorganize the extension into a context-first structure so extension entrypoints, runtime code, UI assets, and shared modules are grouped by Chrome execution surface instead of being scattered across root-level `html`, `css`, `js`, and `static` directories.

## Chosen Approach

Adopt a full context-first layout:

```text
src/
  background/
  content/
  popup/
  options/
  overview/
  shared/
  vendor/
assets/
  icons/
  images/
  fonts/
```

`manifest.json` remains at the repository root and points into `src/` and `assets/`.

## Mapping

- Root HTML entrypoints move to runtime-specific folders:
  - `popup.html` -> `src/popup/popup.html`
  - `options.html` -> `src/options/options.html`
  - `overview.html` -> `src/overview/overview.html`
- Runtime JavaScript moves by context:
  - `js/background/*` -> `src/background/`
  - `js/content_script/*` -> `src/content/`
  - `js/popup/*` -> `src/popup/`
  - `js/options/*` -> `src/options/`
  - `js/overview/*` -> `src/overview/`
  - `js/shared/*` -> `src/shared/`
- UI CSS moves beside the owning UI:
  - `css/popup.css` -> `src/popup/popup.css`
  - `css/options.css` -> `src/options/options.css`
  - `css/overview.css` -> `src/overview/overview.css`
- Third-party browser assets move under `src/vendor/`.
- Non-code resources move under `assets/`.

## Constraints

- This project does not use a bundler, so all script and stylesheet references remain path-based and must continue to work directly from the unpacked extension directory.
- Service worker `importScripts()` references, HTML `<script>` tags, HTML `<link>` tags, and runtime resource lookups must all be updated consistently.
- Extension page URLs used in Playwright tests must change to the new paths.

## Risks

- Relative path breakage in extension HTML pages.
- Broken service worker startup if any `importScripts()` path is missed.
- Broken injected UI if content-script-owned assets are not updated consistently.
- Documentation drift if architecture docs continue to refer to the old layout.

## Validation

- Load the unpacked extension successfully with the reorganized paths.
- Run unit tests.
- Run Playwright E2E coverage for popup/options/content-script behavior.
- Update docs so contributors can locate runtime entrypoints in the new structure.
