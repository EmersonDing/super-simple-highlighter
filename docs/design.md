# Design: Highlighting & Storage Architecture

## Overview

This document describes the architectural choices behind Super Simple Highlighter's approach to text highlighting, serialization, and storage — and compares them to alternatives used by other tools.

---

## How Highlighting Works

### DOM Wrapping with `<mark>` Elements

When a user highlights text, the extension wraps the selected Range in `<mark>` HTML elements using the browser's Range API.

**Key file:** `js/content_script/marker.js`

When a selection spans multiple DOM nodes (e.g., across paragraphs or inline elements), the extension creates a **chain of `<mark>` elements** linked via data attributes:

- `id` — unique identifier (first mark in the chain)
- `data-private-id` — unique ID for each individual mark element
- `data-first-mark-id` — references the first mark (on subsequent marks)
- `data-next-private-id` — links to the next mark in the chain

This chaining allows the extension to treat a multi-node highlight as a single logical unit for operations like removal or style changes.

```html
<mark id="abc-123" data-private-id="p1" class="highlight-shared highlight-style-yellow">
  highlighted text part 1
</mark>
<mark data-private-id="p2" data-first-mark-id="abc-123" class="highlight-shared highlight-style-yellow">
  highlighted text part 2
</mark>
```

**Trade-offs of DOM wrapping:**
- Simple and well-supported across all browsers
- Can break page JavaScript or CSS that depends on specific DOM structure
- Inserting elements can interfere with event listeners or layout

---

## How Highlights Are Anchored (Serialization)

### XPath-Based Anchoring

To persist a highlight, the extension must serialize the Range (which references live DOM nodes) into something storable. It uses **XPath** — a string that describes a node's position in the DOM tree.

**Key file:** `js/shared/utils.js` — `NodeUtils.path()`, `RangeUtils.toObject()`, `RangeUtils.toRange()`

**Serialization** (`NodeUtils.path()`): Walks from the text node up to the document root, building a path like:

```
/html/body/div[2]/article/p[3]/text()
```

At each level:
- Element nodes use their tag name (e.g., `div`, `p`)
- Text nodes use `text()`
- Positional indices disambiguate same-name siblings: `div[2]` = "the 2nd div child"
- If a node has a unique `id`, the path stops early: `//span[@id="intro"]/p[3]/text()`

A stored highlight (called an "XRange") looks like:

```json
{
  "startContainerPath": "/html/body/div[2]/article/p[3]/text()",
  "startOffset": 14,
  "endContainerPath": "/html/body/div[2]/article/p[3]/text()",
  "endOffset": 47,
  "collapsed": false
}
```

**Deserialization** (`RangeUtils.toRange()`): Uses `XPathEvaluator.evaluate()` to resolve the path back to a live DOM node, then constructs a Range with the stored offsets.

### XPath Fragility

XPath is a **structural address** — it encodes *where* something is, not *what* it is. Any DOM change can invalidate it:

| Change | Effect |
|--------|--------|
| Element inserted before the target | Positional indices shift |
| Page redesign / CMS re-render | Entire path becomes invalid |
| Ad or cookie banner injected | Indices shift unpredictably |
| Text node split (e.g., link inserted mid-paragraph) | `text()` points to wrong node, offsets are wrong |

The `id`-based shortcut mitigates this partially — `//span[@id="intro"]/p[3]/text()` survives changes above `#intro` — but structural changes below the anchor point still break it.

---

## How Highlights Are Stored

### PouchDB (IndexedDB-Backed)

**Key file:** `js/shared/db.js`

The extension uses PouchDB, a client-side document database backed by IndexedDB. Each highlight is stored as a document with a CREATE/DELETE verb pattern:

```json
{
  "_id": "uuid-identifier",
  "verb": "create",
  "match": "formatted-url",
  "range": { /* XRange object */ },
  "className": "highlight-style-yellow",
  "text": "the highlighted text",
  "date": 1615000000000,
  "title": "Page Title",
  "version": 4
}
```

- **`match`** — derived from the page URL, used to query all highlights for a given page
- **`verb`** — `"create"` or `"delete"`, enabling undo by counting net create/delete documents
- **`version`** — schema version (v3 used `<span>`, v4+ uses `<mark>`)

### Restoration Flow

**Key file:** `js/background/chrome_web_navigation_handler.js`

1. `chrome.webNavigation.onCompleted` fires when a page finishes loading
2. Background script queries PouchDB for documents matching the URL (excluding deleted ones)
3. Content script is injected, and each document is "played back":
   - XRange is resolved back to a Range via `RangeUtils.toRange()`
   - Range is wrapped in `<mark>` elements via `Marker.mark()`
4. If an XPath fails to resolve (DOM changed), the highlight is marked as orphaned

### Why PouchDB?

PouchDB is more powerful than needed for local-only storage. Its built-in `sync()` protocol can synchronize with a remote CouchDB in one line (`localDB.sync(remoteDB)`), which would make adding cross-device sync trivial. Whether this was intentional foresight or just a library preference is unclear from the code.

---

## Alternative Approaches

### Alternative Anchoring Methods

#### Text-Based Anchoring with Context (Hypothesis)

Instead of encoding *where* text is in the DOM, encode *what the text says* plus surrounding context. Hypothesis follows the W3C Web Annotation Data Model with three selector types used together:

**TextQuoteSelector** — the exact text plus prefix/suffix for disambiguation:
```json
{
  "type": "TextQuoteSelector",
  "exact": "the quick brown fox",
  "prefix": "classic sentence: ",
  "suffix": " jumps over the"
}
```

**TextPositionSelector** — character offset in the page's full text content:
```json
{
  "type": "TextPositionSelector",
  "start": 1847,
  "end": 1866
}
```

**RangeSelector** — XPath (same as this extension), used as the fast path.

Hypothesis tries them in priority order: XPath (fastest) → text position → text quote → fuzzy text quote (most resilient). The fuzzy step uses approximate string matching (edit distance) to handle minor text changes.

#### CSS Custom Highlight API (Emerging Standard)

```js
const range = new Range()
range.setStart(startNode, startOffset)
range.setEnd(endNode, endOffset)
CSS.highlights.set("my-highlight", new Highlight(range))
```
```css
::highlight(my-highlight) { background-color: yellow; }
```

Zero DOM mutation, browser-native performance, clean separation of concerns. Limited to a subset of CSS properties for styling. Still requires a separate anchoring strategy for persistence.

#### Comparison

| | XPath | Text Anchoring | CSS Custom Highlight API |
|---|---|---|---|
| **Speed** | O(1) direct DOM lookup | O(n) page text scan | O(1) native browser |
| **DOM mutation** | Yes (`<mark>` wrapping) | Yes (typically) | No |
| **Resilience** | Breaks on structural changes | Survives restructuring | N/A (rendering only) |
| **Ambiguity** | None (exact node) | Possible if text repeats | N/A |
| **Complexity** | Simple | High (search, fuzzy match, offset mapping) | Simple |

### Alternative Storage Solutions

| Approach | Examples | Pros | Cons |
|----------|----------|------|------|
| **IndexedDB / PouchDB** | This extension | No server, private, offline, generous quota | No sync, lost on browser data clear |
| **`chrome.storage.local`** | Many simple extensions | Simple API, no dependencies | 10MB quota (unlimited with permission) |
| **`chrome.storage.sync`** | Light-use extensions | Cross-device sync via Google account | 100KB total quota |
| **Cloud backend** | Hypothesis (Postgres + ES), Liner, Diigo | Cross-device, sharing, collaboration | Requires server, auth, privacy concerns |
| **PouchDB + CouchDB sync** | Potential upgrade path for this extension | Trivial to add sync to existing PouchDB code | Requires hosting a CouchDB instance |
| **Firebase / Supabase** | Many indie tools | Real-time sync, easy auth, generous free tiers | Vendor lock-in |
| **File-based (JSON/Markdown)** | Obsidian Web Clipper | User owns data, portable | No real-time sync |

### Industry Direction

The consensus is moving toward **text-based anchoring** (resilient to DOM changes) combined with the **CSS Custom Highlight API** (no DOM mutation). XPath remains useful as a fast first-attempt strategy, with text anchoring as the fallback.

For storage, the trend splits by use case: privacy-focused tools favor local-only or user-owned storage, while collaboration-oriented tools require cloud backends with the W3C Web Annotation Protocol as the interoperability standard.
