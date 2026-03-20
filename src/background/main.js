/*
 * This file is part of Super Simple Highlighter.
 * 
 * Super Simple Highlighter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Super Simple Highlighter is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 */

importScripts(
  "../vendor/js/pouchdb-6.4.3.min.js",
  "../vendor/js/pouchdb.replication-stream.min.js",
  "../vendor/js/pouchdb.load.min.js",
  "../shared/db.js",
  "../shared/highlighter.js",
  "../shared/chrome_tabs.js",
  "../shared/chrome_storage.js",
  "../shared/chrome_highlight_storage.js",
  "../shared/utils.js",
  "./chrome_page_action.js",
  "./chrome_context_menus_handler.js",
  "./chrome_runtime_handler.js",
  "./chrome_storage_handler.js",
  "./chrome_commands_handler.js",
  "./chrome_web_navigation_handler.js"
)

// listeners

ChromeRuntimeHandler.addListeners()
ChromeStorageHandler.addListeners()
ChromeCommandsHandler.addListeners()
ChromeWebNavigationHandler.addListeners()
ChromeContextMenusHandler.addListeners()

chrome.action.disable()

// constant menus

ChromeContextMenusHandler.createPageActionMenu()
