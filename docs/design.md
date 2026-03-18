# Design Overview

## Purpose

Super Simple Highlighter is a Chrome extension for saving text highlights on web pages and restoring them on later visits. This fork keeps the original lightweight architecture while adding MV3 compatibility, a floating selection toolbar, comment support, and end-to-end test coverage.

## Current Product Design

- **Selection-first workflow**: selecting text opens a floating toolbar with three quick actions:
  - search the selected text on Google
  - create a highlight with the active pen style
  - create a highlight and attach a comment
- **Persistent annotations**: highlights and comments are restored when the user revisits the same page.
- **Low-friction interaction model**: the toolbar and comment editor are injected directly into the page, while storage and tab operations stay in the extension runtime/background layer.

## Core Architecture

- **Rendering**: highlights are applied in the page by wrapping DOM ranges in chained `<mark>` elements.
- **Anchoring**: saved selections are serialized as XPath-based ranges and rehydrated back into DOM `Range` objects on replay.
- **Storage**: highlight documents are stored in PouchDB/IndexedDB with create and delete history, plus optional comment metadata.
- **Execution model**: the extension runs on Manifest V3 with a service worker background and uses runtime messages between the page and extension layers.
- **Toolbar behavior**: selection UI lives in the content script, while tab creation and highlight persistence are routed through the background worker.

## Key Design Constraints

- **DOM mutation is intentional**: `<mark>` wrapping keeps the implementation simple and compatible, but it means highlight rendering can be affected by page DOM changes.
- **XPath is fast but fragile**: structural page changes can invalidate stored anchors, so restoration favors simplicity over maximum resilience.
- **MV3-compatible messaging**: operations that need extension privileges, such as opening tabs or persisting highlights, should go through background handlers instead of page APIs.
- **Tests should stay hermetic**: toolbar and highlight tests should validate extension behavior without depending on third-party sites.

## Documentation Map

- Detailed design specs live in `docs/designs/`.
- Execution plans live in `docs/plans/`.

Current detailed design docs:

- `docs/designs/2026-03-15-manifest-v3-design.md`
- `docs/designs/2026-03-17-floating-toolbar-design.md`
- `docs/designs/2026-03-18-highlight-ui-enhancements-design.md`
- `docs/designs/2026-03-18-icon-redesign-design.md`
