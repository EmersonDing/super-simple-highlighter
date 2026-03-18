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

const HIGHLIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M6 26 L24 8" stroke="#3a3a3c" stroke-width="5.5" stroke-linecap="round"/><rect x="3" y="25" width="7" height="4" rx="1" fill="#3a3a3c" transform="rotate(-45 6 26)"/></svg>`
const GOOGLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20.18 12.27c0-.62-.06-1.21-.16-1.77H12v3.35h4.58a3.92 3.92 0 0 1-1.7 2.57v2.19h2.75c1.61-1.49 2.55-3.69 2.55-6.34Z" fill="#e5e5ea"/><path d="M12 20.5c2.22 0 4.08-.74 5.44-2.01l-2.75-2.19c-.74.49-1.67.8-2.69.8-2.07 0-3.82-1.39-4.44-3.25H4.72v2.19A8.2 8.2 0 0 0 12 20.5Z" fill="#e5e5ea"/><path d="M7.56 13.85A4.92 4.92 0 0 1 7.3 12c0-.64.1-1.26.26-1.85V7.96H4.72A8.2 8.2 0 0 0 3.8 12c0 1.33.31 2.58.92 3.69l2.84-1.84Z" fill="#e5e5ea"/><path d="M12 6.9c1.2 0 2.27.41 3.12 1.22l2.34-2.34C16.09 4.5 14.22 3.5 12 3.5a8.2 8.2 0 0 0-7.28 4.46l2.84 2.19C8.18 8.29 9.93 6.9 12 6.9Z" fill="#e5e5ea"/></svg>`
const COMMENT_SVG_16 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`
const COMMENT_SVG_13 = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#e5e5ea"/><path d="M10 23 L9 30 L18 23" fill="#e5e5ea"/></svg>`

/**
 * Floating selection toolbar
 * Appears above text selections with search, pen (highlight), and comment buttons.
 *
 * @class SelectionToolbar
 */
class SelectionToolbar {
  /**
   * @param {StyleSheetManager} styleSheetManager
   * @param {Document} [doc=window.document]
   */
  constructor(styleSheetManager, doc = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = doc
    this._toolbarElm = null
    this._activeClassName = null
    this._activeBgColor = null
    this._state = 'hidden' // 'hidden' | 'idle' | 'comment'
    this._dismissListeners = []
    this._onMouseUpBound = this._onMouseUp.bind(this)
  }

  /**
   * Initialize: inject styles, resolve active style, attach selection listener
   * @returns {SelectionToolbar}
   */
  init() {
    this._injectStyles()
    this._resolveActiveClassName()
    this.document.addEventListener('mouseup', this._onMouseUpBound, { passive: true })
    this.document.addEventListener('ssh-edit-comment', (e) => {
      const { highlightId, comment, anchorRect } = e.detail
      this._showCommentEditor(highlightId, anchorRect, comment)
    })
    return this
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Inject toolbar CSS as a <style> element */
  _injectStyles() {
    const style = this.document.createElement('style')
    style.textContent = `
      .ssh-toolbar-root {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        background: #2c2c2c;
        border-radius: 20px;
        padding: 6px 10px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        font-family: -apple-system, sans-serif;
        white-space: nowrap;
        transform: translateX(-50%);
      }
      .ssh-toolbar-root * { box-sizing: border-box; }
      .ssh-toolbar-search, .ssh-toolbar-pen, .ssh-toolbar-comment, .ssh-toolbar-save, .ssh-toolbar-cancel {
        all: initial;
        cursor: pointer;
        border-radius: 14px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        border: none;
      }
      .ssh-toolbar-search,
      .ssh-toolbar-comment { background: transparent; color: #ccc; }
      .ssh-toolbar-save {
        all: initial;
        background: #4a90d9;
        border: none;
        border-radius: 10px;
        padding: 5px 14px;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-save:disabled { opacity: 0.4; cursor: default; }
      .ssh-toolbar-cancel {
        all: initial;
        background: transparent;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-divider {
        all: initial;
        display: inline-block;
        width: 1px;
        height: 18px;
        background: #555;
      }
      .ssh-toolbar-input {
        all: initial;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 10px;
        padding: 5px 12px;
        color: #fff;
        font-size: 12px;
        width: 200px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-input::placeholder { color: #666; }
      .ssh-toolbar-caret {
        all: initial;
        display: block;
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #2c2c2c;
      }
    `
    this.document.head.appendChild(style)
  }

  /** Load and cache the active highlight class name */
  _resolveActiveClassName() {
    new ChromeHighlightStorage().getAll().then(({ highlightDefinitions, penButtonClassName }) => {
      if (!highlightDefinitions || highlightDefinitions.length === 0) return

      const ORANGE_CLASS = 'default-orange-da01945e-1964-4d27-8a6c-3331e1fe7f14'
      let def

      if (penButtonClassName) {
        def = highlightDefinitions.find(d => d.className === penButtonClassName)
      }

      if (!def) {
        def = highlightDefinitions.find(d => d.className === ORANGE_CLASS)
      }

      if (!def) {
        def = highlightDefinitions[0]
      }

      this._activeClassName = def.className
      this._activeBgColor = (def.style || {})['background-color'] || '#ffd2AA'
    }).catch(() => {})
  }

  /** mouseup handler — show toolbar if selection is non-empty */
  _onMouseUp(event) {
    // Ignore clicks inside the toolbar itself
    if (this._toolbarElm && this._toolbarElm.contains(event.target)) return

    const sel = this.document.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this._dismiss()
      return
    }

    const range = sel.getRangeAt(0)
    if (range.collapsed) {
      this._dismiss()
      return
    }

    this._showIdle(range)
  }

  /** Show State 1: search + pen + comment buttons */
  _showIdle(range) {
    this._dismiss()
    this._state = 'idle'

    const rect = range.getBoundingClientRect()
    const toolbar = this.document.createElement('div')
    toolbar.className = 'ssh-toolbar-root'

    // Search button
    const search = this.document.createElement('button')
    search.className = 'ssh-toolbar-search'
    search.title = 'Search Google'
    search.innerHTML = GOOGLE_SVG
    search.addEventListener('click', () => this._onSearchClick(range), { once: true })

    // Divider
    const searchDivider = this.document.createElement('span')
    searchDivider.className = 'ssh-toolbar-divider'

    // Pen button
    const pen = this.document.createElement('button')
    pen.className = 'ssh-toolbar-pen'
    pen.title = 'Highlight'
    pen.innerHTML = HIGHLIGHT_SVG
    pen.style.background = this._activeBgColor || '#ffffaa'
    pen.addEventListener('click', () => this._onPenClick(range), { once: true })

    // Divider
    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    // Comment button
    const comment = this.document.createElement('button')
    comment.className = 'ssh-toolbar-comment'
    comment.title = 'Comment & Highlight'
    comment.innerHTML = COMMENT_SVG_16
    comment.addEventListener('click', () => this._onCommentClick(range), { once: true })

    // Caret
    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    toolbar.append(search, searchDivider, pen, divider, comment, caret)
    this._position(toolbar, rect)
    this.document.body.appendChild(toolbar)
    this._toolbarElm = toolbar

    this._attachDismissListeners()
  }

  /** Expand toolbar to State 2: comment input */
  _showCommentInput(highlightId) {
    if (!this._toolbarElm) return
    this._state = 'comment'

    // Remove dismiss listeners while in comment mode (selection collapses on input focus)
    this._detachDismissListeners()

    this._toolbarElm.innerHTML = ''

    const icon = this.document.createElement('span')
    icon.innerHTML = COMMENT_SVG_13

    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    const input = this.document.createElement('input')
    input.className = 'ssh-toolbar-input'
    input.placeholder = 'Add a comment\u2026'
    input.maxLength = 1000
    input.type = 'text'

    const save = this.document.createElement('button')
    save.className = 'ssh-toolbar-save'
    save.textContent = 'Save'
    save.disabled = true

    const cancel = this.document.createElement('button')
    cancel.className = 'ssh-toolbar-cancel'
    cancel.textContent = '\u00D7'

    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    input.addEventListener('input', () => {
      save.disabled = input.value.trim().length === 0
    })

    const doSave = () => {
      const comment = input.value.trim()
      if (!comment) return
      ChromeRuntimeHandler.sendMessage({
        id: ChromeRuntimeHandler.MESSAGE_ID.UPDATE_HIGHLIGHT_COMMENT,
        highlightId: highlightId,
        comment: comment,
      }).catch(console.error)
      this._dismiss()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') this._dismiss()
    })
    save.addEventListener('click', doSave)
    cancel.addEventListener('click', () => this._dismiss())

    this._toolbarElm.append(icon, divider, input, save, cancel, caret)

    // Re-attach scroll/outside-click dismiss (but not selectionchange)
    this._attachDismissListeners({ skipSelectionChange: true })

    requestAnimationFrame(() => input.focus())
  }

  /** Pen click: highlight with active style */
  _onPenClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()
    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange: xrange,
      text: text,
      className: this._activeClassName,
    }).catch(console.error)
    this._dismiss()
  }

  /** Search click: open Google in a new page for the selected text */
  _onSearchClick(range) {
    const text = range.toString().trim()
    if (!text) {
      this._dismiss()
      return
    }

    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.OPEN_URL,
      url: `https://www.google.com/search?q=${encodeURIComponent(text)}`,
    }).then(opened => {
      if (opened) {
        this._dismiss()
      }
    }).catch(console.error)
  }

  /** Comment click: highlight immediately, then expand to comment input */
  _onCommentClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()

    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange: xrange,
      text: text,
      className: this._activeClassName,
    }).then(highlightId => {
      if (highlightId) {
        this._showCommentInput(highlightId)
      } else {
        this._dismiss()
      }
    }).catch(() => this._dismiss())
  }

  /** Position toolbar centered above rect using fixed coords */
  _position(toolbar, rect) {
    const top = rect.top < 60
      ? rect.bottom + 10
      : rect.top - 46

    toolbar.style.left = `${Math.round(rect.left + rect.width / 2)}px`
    toolbar.style.top = `${Math.round(top)}px`
  }

  /** Attach dismiss listeners */
  _attachDismissListeners({ skipSelectionChange = false } = {}) {
    this._detachDismissListeners()

    const onMouseDown = (e) => {
      if (this._toolbarElm && !this._toolbarElm.contains(e.target)) {
        this._dismiss()
      }
    }
    const onScroll = () => this._dismiss()

    this.document.addEventListener('mousedown', onMouseDown, { capture: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    this._dismissListeners.push(
      () => this.document.removeEventListener('mousedown', onMouseDown, { capture: true }),
      () => window.removeEventListener('scroll', onScroll),
    )

    if (!skipSelectionChange) {
      const onSelectionChange = () => {
        const sel = this.document.getSelection()
        if (sel && sel.isCollapsed) this._dismiss()
      }
      this.document.addEventListener('selectionchange', onSelectionChange, { passive: true })
      this._dismissListeners.push(
        () => this.document.removeEventListener('selectionchange', onSelectionChange)
      )
    }
  }

  _detachDismissListeners() {
    for (const fn of this._dismissListeners) fn()
    this._dismissListeners = []
  }

  /** Show comment editor for an existing highlight (click-to-edit 💬) */
  _showCommentEditor(highlightId, anchorRect, existingComment) {
    this._dismiss()
    this._state = 'comment'

    const toolbar = this.document.createElement('div')
    toolbar.className = 'ssh-toolbar-root'

    const icon = this.document.createElement('span')
    icon.innerHTML = COMMENT_SVG_13

    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    const input = this.document.createElement('input')
    input.className = 'ssh-toolbar-input'
    input.placeholder = 'Edit comment\u2026'
    input.maxLength = 1000
    input.type = 'text'
    input.value = existingComment || ''

    const save = this.document.createElement('button')
    save.className = 'ssh-toolbar-save'
    save.textContent = 'Save'
    save.disabled = input.value === (existingComment || '')

    const cancel = this.document.createElement('button')
    cancel.className = 'ssh-toolbar-cancel'
    cancel.textContent = '\u00D7'

    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    input.addEventListener('input', () => {
      save.disabled = input.value.trim() === (existingComment || '').trim()
    })

    const doSave = () => {
      const comment = input.value.trim()
      ChromeRuntimeHandler.sendMessage({
        id: ChromeRuntimeHandler.MESSAGE_ID.UPDATE_HIGHLIGHT_COMMENT,
        highlightId: highlightId,
        comment: comment,
      }).catch(console.error)
      this._dismiss()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') this._dismiss()
    })
    save.addEventListener('click', doSave)
    cancel.addEventListener('click', () => this._dismiss())

    toolbar.append(icon, divider, input, save, cancel, caret)
    this._position(toolbar, anchorRect)
    this.document.body.appendChild(toolbar)
    this._toolbarElm = toolbar

    this._attachDismissListeners({ skipSelectionChange: true })

    requestAnimationFrame(() => input.focus())
  }

  /** Remove toolbar and clean up */
  _dismiss() {
    this._detachDismissListeners()
    if (this._toolbarElm) {
      this._toolbarElm.remove()
      this._toolbarElm = null
    }
    this._state = 'hidden'

    // Refresh active style for next show
    this._resolveActiveClassName()
  }
}
