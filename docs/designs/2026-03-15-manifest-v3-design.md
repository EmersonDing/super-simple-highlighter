# Chrome Manifest V3 Design

**Goal:** Migrate the extension from Chrome Manifest V2 to Manifest V3 without changing the popup, options UI, storage model, or content-script behavior.

**Recommended approach:** Keep the existing architecture and move only the browser-extension integration points that are blocked by MV3. This limits risk to the manifest, background execution model, action visibility state, and script injection path.

**Architecture**

- Replace the MV2 background page with a single MV3 service worker entrypoint that loads the existing background and shared scripts with `importScripts(...)`.
- Replace `page_action` usage with `action` semantics. Because MV3 does not support `show()` and `hide()`, emulate the old enabled/disabled state with `chrome.action.enable()` and `chrome.action.disable()` on a per-tab basis.
- Replace `chrome.tabs.executeScript()` with `chrome.scripting.executeScript()` so background-driven content script injection keeps working under MV3.
- Keep the existing popup, options pages, commands, context menus, database, and content scripts unchanged unless they depend directly on removed MV2 APIs.

**Behavioral notes**

- The toolbar button will always exist in Chrome’s extensions UI under MV3. The extension will signal applicability by enabling or disabling the action instead of hiding it.
- The action context menu must use the MV3 `action` context type instead of `page_action`.
- Service workers have no `window`, so background-side alert calls must be replaced with tab-side execution.

**Testing**

- This repo has no existing automated test harness. Verification will therefore focus on static validation:
  - `manifest.json` parses and contains the expected MV3 fields.
  - No background code still references `chrome.pageAction` or `chrome.tabs.executeScript`.
  - The service worker entrypoint imports the expected dependency set.
  - The resulting diff is limited to the MV3 migration surface and documentation.
