# Highlight Click Popup & AI Chat Side Panel

**Method:** Claude Code brainstorming skill (Opus 4.6)
**Date:** 2026-03-27

---

## Overview

Two features for Super Simple Highlighter:

1. **Click-to-manage popup** — clicking an existing highlight shows a small popup bar with delete and comment buttons, replacing the current hover-based close button.
2. **AI chat side panel** — a side panel with an embedded LLM chat, using the whole page as context by default, with BYOK support for GPT and Gemini.

---

## Feature 1: Click-to-manage highlight popup

### Trigger

Click on any `<mark>` element with the shared highlight class.

### Behavior

- `DOMEventsHandler` replaces the hover-based × button with a `click` listener on highlight elements.
- On click, shows a dark pill popup (`#2c2c2c`, rounded, same style as selection toolbar) anchored above the clicked mark element.
- Two buttons using monochrome SVG icons (`#e5e5ea` fill, 16x16 viewBox, matching existing `GOOGLE_SVG`/`AI_SVG`/`COMMENT_SVG_16` patterns):
  - **Trash icon** — deletes the highlight via existing `ChromeRuntimeHandler.deleteHighlight(id)`, dismisses popup.
  - **Comment icon** — dispatches `ssh-edit-comment` custom event, reusing the existing `SelectionToolbar._showCommentEditor()` flow.
- If the highlight already has a comment, the comment icon shows a filled/active state.
- Dismiss on: click outside, scroll, or Escape key.
- **Selection guard:** If the user has an active text selection (selection toolbar is showing), clicking a highlight does NOT open the click popup — the selection toolbar takes priority.
- Comment tooltip on hover is retained (read-only preview); click opens the popup for editing.

### Removed

- Hover-based × close button (`DOMEventsHandler.CLOSE_BUTTON` timer logic).
- `StyleSheetManager.CLASS_NAME.CLOSE` button and its pop-in/pop-out animation styling.

### Files changed

- `src/content/dom_events_handler.js` — replace hover ×  with click popup logic.
- `src/shared/style_sheet_manager.js` — remove `.CLOSE` button styles, add highlight click popup styles.

---

## Feature 2: AI chat side panel

### 2a. UI layer (content script)

#### Floating tab trigger

- Small dark tab (`#2c2c2c`) on the right edge of the viewport, vertically centered.
- ~12px wide, ~40px tall, rounded left corners.
- Contains the sparkle icon (existing `AI_SVG`, scaled down).
- Click toggles the side panel open/closed.
- When panel is open, tab becomes an × close indicator.
- `z-index: 2147483646`.

#### Selection toolbar integration

- 5th button in the selection toolbar (sparkle icon, same `AI_SVG`).
- Replaces the current AI search button behavior: instead of opening an AI provider URL in a new tab, opens the side panel with selected text pre-filled as context.
- The existing Google search button remains for web search.
- The existing `AI_PROVIDER` storage key (used for URL-open AI search) becomes unused and can be removed along with `_buildAIUrl()`, `_getAIProviderLabel()`, `_normalizeAIProvider()`, and the AI Provider dropdown in the options page.

#### Side panel

- ~350px wide `<div>` injected into the page, slides in from the right edge.
- Dark theme matching toolbar: `#2c2c2c` background, `#1a1a1a` input field, `#e5e5ea` text.
- **Header:** "Chat with AI" title + provider label (e.g. "GPT" or "Gemini") + × close button.
- **Message area:** Scrollable container. User messages right-aligned (blue `#4a90d9` bubbles), AI responses left-aligned (dark gray bubbles). Streaming — AI responses render token-by-token.
- **Input bar:** Text input + send button at the bottom.
- **Context indicator:** Small badge showing "Page context" by default, or "Selected text: ..." when opened from toolbar with a selection.
- **Ephemeral** — chat history cleared on panel close.

#### New file

- `src/content/chat_panel.js` — chat panel DOM creation, message rendering, streaming display, port management.

### 2b. API relay (background service worker)

#### Streaming via chrome.runtime.Port

- Content script opens `chrome.runtime.connect({ name: 'chat-stream' })`.
- Background listens via `chrome.runtime.onConnect`.
- Content script sends chat request through the port: `{ messages[], provider, pageContext, selectedText? }`.
- Background opens a streaming `fetch()` to the configured API and pipes SSE chunks back via `port.postMessage()`.
- Message types sent through the port:
  - `{ type: 'chunk', text }` — a token chunk.
  - `{ type: 'done' }` — stream complete.
  - `{ type: 'error', message }` — error details (invalid key, rate limit, etc.).
- Port disconnects on panel close (cleanup).

#### API endpoints

- **OpenAI (GPT):** `POST https://api.openai.com/v1/chat/completions` with `stream: true`, default model `gpt-4o-mini`.
- **Gemini:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse` with API key as query param.

#### System prompt

```
You are a helpful assistant. The user is reading a web page. Here is the page content:

{pageContext}
```

If selected text is provided, append:

```
The user has highlighted this text:

{selectedText}
```

#### Manifest changes

- `host_permissions`: add `https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`.

#### Files changed

- `src/background/chrome_runtime_handler.js` — add `onConnect` listener for chat streaming.
- `manifest.json` — add host permissions.

### 2c. Settings page — API keys & chat configuration

#### Options page additions

- New "AI Chat" section in the options page (separate from existing "AI Provider" dropdown which controls the search/URL button).
- Two API key fields:
  - "OpenAI API Key" — password input with show/hide toggle.
  - "Gemini API Key" — password input with show/hide toggle.
- Chat provider selector: dropdown to pick which provider the chat uses (`gpt` or `gemini`).

#### Storage

- Keys stored in `chrome.storage.local` (not `sync`) to avoid syncing secrets across devices.
- New `ChromeStorage` keys:
  - `CHAT_PROVIDER`: `'gpt'` | `'gemini'` (default: `'gemini'`).
  - `CHAT_API_KEY_GPT`: string.
  - `CHAT_API_KEY_GEMINI`: string.

#### Validation

- No live validation on save. If the key is invalid, the chat window shows the API error inline (e.g. "Invalid API key — check Settings").

#### Files changed

- `src/options/options.html` — add AI Chat settings section.
- `src/options/controllers/styles.js` (or new controller) — API key load/save logic.
- `src/shared/chrome_storage.js` — add new keys and defaults.

### 2d. Content script registration

- `chat_panel.js` added to the content script list in `manifest.json`.
- Floating tab injected on page load via `chat_panel.js` init.

---

## Testing

### E2E tests (Playwright)

- **Click popup:** Create a highlight → click it → verify popup appears with delete and comment buttons → click delete → verify highlight removed. Repeat for comment flow.
- **Floating tab:** Verify tab element is injected on page load, positioned on right edge → click opens side panel → click again closes.
- **Side panel UI:** Open panel → verify input bar, header, close button render → type message → verify it appears in message area as user bubble.
- **API relay:** Mock the API endpoints in the background worker (intercept fetch) → send a chat message → verify streamed response renders in the panel.

### Not tested e2e

- Live API calls (requires real keys, costs money).
- Token limits / long page contexts.

### Existing tests

No breaking changes expected — selection toolbar tests cover the current 4-button flow. The new 5th button and click popup are additive.
