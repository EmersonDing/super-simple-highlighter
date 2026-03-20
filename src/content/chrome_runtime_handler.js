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

const COMMENT_DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="#3a3a3c"/><path d="M10 23 L9 30 L18 23" fill="#3a3a3c"/></svg>`

/**
 * Handlers for chrome.runtime events
 * 
 * @class ChromeRuntimeHandler
 */
class ChromeRuntimeHandler {
  /**
   * Creates an instance of ChromeRuntimeHandler.
   * 
   * @param {StyleSheetManager} styleSheetManager 
   * @param {Document} document 
   * @memberof ChromeRuntimeHandler
   */
  constructor(styleSheetManager, document) {
    this.styleSheetManager = styleSheetManager
    this.document = document
  }

  /**
   * Initializer
   * 
   * @returns {ChromeRuntimeHandler}
   * @memberof ChromeRuntimeHandler
   */
  init() {
    chrome.runtime.onMessage.addListener(this.onMessage.bind(this))

    return this
  }

  /**
   * Message received 
   * 
   * @typedef {Object} Message
   * @prop {string} id
   * @prop {Object} range - xrange
   * @prop {string} [highlightId]
   * @prop {string} [className]
   * @prop {string} [xpathExpression]
   * @prop {string} [attributeName]
   * 
   * @private
   * @param {Message} message 
   * @param {Object} sender 
   * @param {Function} sendResponse - Function to call (at most once) when you have a response. 
   *   This function becomes invalid when the event listener returns, unless you return true from the event listener to indicate you wish to send a response asynchronously 
   * @returns {boolean} false if response is synchronous
   * @memberof ChromeRuntimeHandler
   */
  onMessage(message, sender, sendResponse) {
    let response
    let asynchronous = false

    switch (message.id) {
      case ChromeTabs.MESSAGE_ID.PING:
        // a falsy response implies there was no injected script
        response = true
        break

      case ChromeTabs.MESSAGE_ID.CREATE_HIGHLIGHT:
        // return true if created
        response = ( /** @type {function(Object, string, string, number): boolean} */ (xrange, highlightId, className, version) => {
          let range

          // this is likely to cause exception when the underlying DOM has changed
          try {
            range = RangeUtils.toRange(xrange, this.document)
            if (!range) {
              throw new Error(`Unable to parse xrange`)
            }
          } catch (e) {
            // console.error(`Exception parsing xpath range ${xrange}: ${err.message}`)
            return false
          }

          const elms = this.createHighlight(range, highlightId, className, version, message.comment)
          return elms.length > 0
        })(message.range, message.highlightId, message.className, message.version || 4)
        break

      case ChromeTabs.MESSAGE_ID.UPDATE_HIGHLIGHT:
        // return true if created
        response = this.updateHighlight(message.highlightId, message.className).length > 0
        break

      case ChromeTabs.MESSAGE_ID.REMOVE_HIGHLIGHT:
        response = this.removeHighlight(message.highlightId).length > 0
        break

      case ChromeTabs.MESSAGE_ID.SELECT_HIGHLIGHT:
        response = (/** @type {function([string]): [Object]} */ (highlightId) => {
          const range = this.selectHighlight(highlightId)

          // return range or null if no highlight specified
          return (highlightId && range) ? RangeUtils.toObject(range) : null
        })(message.highlightId)
        break

      case ChromeTabs.MESSAGE_ID.SELECT_RANGE:
        response = (/** @type {function([Object]): [Object]} */ (xrange) => {
          // convert to Range
          const range = xrange ? RangeUtils.toRange(xrange, this.document) : null

          this.selectRange(range)

          // return xrange or null if no highlight specified
          return range ? RangeUtils.toObject(range) : null
        })(message.range)
        break

      case ChromeTabs.MESSAGE_ID.IS_HIGHLIGHT_IN_DOM:
        response = this.isHighlightInDOM(message.highlightId)
        break

      case ChromeTabs.MESSAGE_ID.GET_SELECTION_RANGE:
        response = RangeUtils.toObject(this.getSelectionRange())
        break

      case ChromeTabs.MESSAGE_ID.GET_RANGE_TEXT:
        response = ((xrange) => {
          const range = RangeUtils.toRange(xrange, this.document)

          // return text of range, or null if fail
          return range ? range.toString() : null
        })(message.range)
        break

      case ChromeTabs.MESSAGE_ID.SCROLL_TO_HIGHLIGHT:
        response = this.scrollToHighlight(message.highlightId)
        break

      case ChromeTabs.MESSAGE_ID.GET_HIGHLIGHT_OFFSET:
        response = (highlightId => {
          const bounds = this.getHighlightBounds(highlightId)

          return (bounds && {
            left: bounds.left,
            top: bounds.top,
          }) || null
        })(message.highlightId)
        break

      case ChromeTabs.MESSAGE_ID.GET_NODE_ATTRIBUTE_VALUE:
        response = ((expression, name) => {
          const v = document.evaluate(
            expression,
            this.document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue

          // else undefined
          if (v && v.attributes) {
            return v.attributes[name]
          }
        })(message.xpathExpression, message.attributeName)
        break

      case ChromeTabs.MESSAGE_ID.GET_HOVERED_HIGHLIGHT_ID:
        response = this.getHoveredHighlightID()
        break

      case ChromeTabs.MESSAGE_ID.SET_HIGHLIGHT_COMMENT: {
        const elm = this.document.getElementById(message.highlightId)
        if (!elm) break

        if (typeof message.comment === 'string' && message.comment.length > 0) {
          elm.dataset.comment = message.comment

          // Find the last mark element of this highlight so the dot appears at the end
          let lastElm = elm
          while (
            lastElm.nextElementSibling &&
            lastElm.nextElementSibling.classList.contains(this.styleSheetManager.sharedHighlightClassName)
          ) {
            lastElm = lastElm.nextElementSibling
          }

          // Add icon if not already present
          if (!lastElm.querySelector(`.${StyleSheetManager.CLASS_NAME.COMMENT_DOT}`)) {
            const dot = this.document.createElement('span')
            dot.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_DOT)
            dot.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] = ''
            dot.dataset.highlightId = message.highlightId
            dot.innerHTML = COMMENT_DOT_SVG
            dot.addEventListener('click', (e) => {
              e.stopPropagation()
              const highlightId = e.currentTarget.dataset.highlightId
              const markElm = this.document.getElementById(highlightId)
              document.dispatchEvent(new CustomEvent('ssh-edit-comment', {
                detail: {
                  highlightId,
                  comment: markElm ? markElm.dataset.comment || '' : '',
                  anchorRect: e.currentTarget.getBoundingClientRect(),
                }
              }))
            })
            lastElm.appendChild(dot)
          }
        } else {
          // Clear comment — dot may be on a sibling mark, find it by highlight ID
          delete elm.dataset.comment
          const dot = this.document.querySelector(`.${StyleSheetManager.CLASS_NAME.COMMENT_DOT}[data-highlight-id="${message.highlightId}"]`)
          if (dot) dot.remove()
        }
        response = true
        break
      }

      default:
        console.error(`Unhandled message`, message)
        break
    }

    if (!asynchronous) {
      sendResponse(response)
    }

    // default false
    return asynchronous
  }

  //

  /**
   * Mark a range of the document
   * 
   * @private
   * @param {Range} range - range of document to highlight
   * @param {string} firstHighlightId - #id to add to first mark
   * @param {string} className - class name (aka highlight definiton id) to add to every mark
   * @param {number} [version=4] - version used to create highlight. If <= 3 it implies it's a recreation, and assume compat behaviour
   * @param {string} [comment] - optional comment text; sets data-comment and appends dot indicator
   * @returns {HTMLElement[]} - mark elements - can be empty
   * @memberof ChromeRuntimeHandler
   */
  createHighlight(range, firstHighlightId, className, version = 4, comment) {
    // new highlights use 'mark' tag
    const tagName = version <= 3 ? 'span' : 'mark'

    // 'mark' elements of range
    let elms = new Marker(this.document)
      .mark(range, firstHighlightId, tagName)
    if (elms.length === 0) {
      return []
    }

    // class names to add to every mark element
    const classNames = [
      this.styleSheetManager.sharedHighlightClassName,
      this.styleSheetManager.sharedContentClassName,
      className
    ]

    for (const { classList } of elms) {
      classList.add(...classNames)
    }

    // make marked elements tabbable
    // TODO: optional
    elms[0].setAttribute('tabindex', '0')
    // firstSpan.classList.add("closeable");

    // Set comment data and dot indicator
    if (typeof comment === 'string' && comment.length > 0) {
      elms[0].dataset.comment = comment

      // Comment icon on the last mark element so it appears at the end of the highlight.
      // Removed by removeHighlight() via [data-foreign] cleanup.
      const dot = this.document.createElement('span')
      dot.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_DOT)
      dot.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] = ''
      dot.dataset.highlightId = firstHighlightId
      dot.innerHTML = COMMENT_DOT_SVG
      dot.addEventListener('click', (e) => {
        e.stopPropagation()
        const highlightId = e.currentTarget.dataset.highlightId
        const markElm = this.document.getElementById(highlightId)
        document.dispatchEvent(new CustomEvent('ssh-edit-comment', {
          detail: {
            highlightId,
            comment: markElm ? markElm.dataset.comment || '' : '',
            anchorRect: e.currentTarget.getBoundingClientRect(),
          }
        }))
      })
      elms[elms.length - 1].appendChild(dot)
    }

    if (version <= 3) {
      // to be compatible with recreated highlights from v3, a dummy 'close' button is needed
      elms[0].appendChild(document.createElement("span"));
    }

    return elms
  }

  /**
   * Change a highlights style by changing its unique class
   * 
   * @private
   * @param {string} highlightId - #id of any mark element
   * @param {string} className - new class name
   * @returns {HTMLElement[]} - marked elements
   * @memberof ChromeRuntimeHandler
   */
  updateHighlight(highlightId, newClassName) {
    // don't remove these classes
    const whitelist = [this.styleSheetManager.sharedHighlightClassName]

    const result = new Marker(this.document).update(highlightId, newClassName, whitelist)

    // dataset.comment is preserved: Marker.update() modifies classList in-place without replacing elements.

    return result
  }

  /**
   * Remove a highlight from the DOM
   * NB: this is NOT the static version, which requests the event page delete the highlight from the page and the DB
   * 
   * @private
   * @param {string} highlightId - #id of any mark element
   * @returns {HTMLElement[]} - marked elements (all of which have been deleted)
   * @memberof ChromeRuntimeHandler
   */
  removeHighlight(highlightId) {
    const marker = new Marker(this.document)

    // if the first mark element still contained a close button it would be left behind when the nodes merge back together,
    // so try to remove it
    const attr = `data-${ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN.replace(/[A-Z]/g, "-$&")}`.toLowerCase()
    const sel = `[${attr}]`

    for (const markElm of marker.getMarkElements(highlightId)) {
      for (const elm of markElm.querySelectorAll(sel)) {
        elm.remove()
      }
    }

    return marker.unmark(highlightId)
  }

  //

  /**
   * Select the range occupied by a highlight
   * 
   * @private
   * @param {string} [highlightId] - #id of any mark element. If falsy, remove any current selection
   * @returns {Range}
   * @memberof ChromeRuntimeHandler
   */
  selectHighlight(highlightId) {
    const range = highlightId ?
      new Marker(this.document).getRange(highlightId) : null

    this.selectRange(range)

    // return collapsed range if falsy
    return range || new Range()
  }

  /**
   * Select a range of the document
   
   * @private 
   * @param {Range} [range] - range to select, or if falsy then clear selection
   * @memberof ChromeRuntimeHandler
   */
  selectRange(range) {
    const sel = getSelection()
    sel.removeAllRanges()

    if (!range) {
      return
    }

    sel.addRange(range)
  }

  /**
   * Get range of current selection
   * 
   * @private
   * @returns {Range}
   * @memberof ChromeRuntimeHandler
   */
  getSelectionRange() {
    const sel = this.document.getSelection()
    let range

    if (sel.isCollapsed) {
      range = new Range()
      range.collapse(false)
    } else {
      range = sel.getRangeAt(0)
    }

    return range
  }

  // 

  /**
   * Scroll element into view
   * 
   * @param {string} highlightId - #id of (first) highlight in chain
   * @returns {boolean} true if element selectable
   * @memberof ChromeRuntimeHandler
   */
  scrollToHighlight(highlightId) {
    const elm = document.getElementById(highlightId)

    if (!elm) {
      return false
    }

    elm.scrollIntoView()
    return true
  }

  //

  /**
   * Get bounding client rect of highlight (first part)
   * 
   * @private
   * @param {string} highlightId - #id of (first) highlight in chain
   * @returns {ClientRect | null} - rect or null if not found
   * @memberof ChromeRuntimeHandler
   */
  getHighlightBounds(highlightId) {
    const elm = this.document.getElementById(highlightId)
    return (elm && elm.getBoundingClientRect()) || null
  }

  //

  /**
   * Get the highlight id for the currently hovered highlight
   * 
   * @returns {string} highlight id (first mark), or empty string if none
   * @memberof ChromeRuntimeHandler
   */
  getHoveredHighlightID() {
    // identify any of the mark elements of a highlight
    const elm = this.document.querySelector(`.${this.styleSheetManager.sharedHighlightClassName}:hover`)

    if (!elm || !elm.id) {
      return ""
    }

    // only report first mark element id
    let elms = new Marker(this.document).getMarkElements(elm.id)
    return (elms.length > 0 && elms[0].id) || ""
  }

  //

  /**
   * Is a highlight with specified ID in the DOM
   * 
   * @param {string} highlightId - #id of the highlight, as defined by DB. (i.e. id of first mark element only)
   * @returns {boolean}
   * @memberof ChromeRuntimeHandler
   */
  isHighlightInDOM(highlightId) {
    // long test
    const elms = new Marker(this.document).getMarkElements(highlightId)
    return elms.length > 0 && elms[0].id === highlightId

    // quick test
    // const elm = this.document.getElementById(highlightId)
    // return elm && this.styleSheetManager.elementContainsSharedHighlightClass(elm)
  }

  // messages to event page

  /**
   * Send a message to the event page
   * 
   * @private
   * @static
   * @param {{id: string}} message 
   * @returns 
   * @memberof ChromeRuntimeHandler
   */
  static sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.assert(typeof response === 'undefined')

          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        resolve(response)
      })
    })
  }

  /**
   * Send 'delete highlight' message to event page
   * NB: This is STATIC, and it tells the event page to DELETE the highlight from the PAGE and the DB
   * (there is an instance version that just operates at the DOM level)
   * 
   * @static
   * @private 
   * @param {string} highlightId 
   * @returns {Promise<boolean>} true if deleted
   * @memberof ChromeRuntimeHandler
   */
  static deleteHighlight(highlightId) {
    const message = {
      id: ChromeRuntimeHandler.MESSAGE_ID.DELETE_HIGHLIGHT,
      highlightId: highlightId
    }

    return ChromeRuntimeHandler.sendMessage(message)
  }
}

// static properties

// id for messages sent TO background page
ChromeRuntimeHandler.MESSAGE_ID = {
  DELETE_HIGHLIGHT: 'delete_highlight',
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page',
  UPDATE_HIGHLIGHT_COMMENT: 'update_highlight_comment',
  OPEN_URL: 'open_url',
}

ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME = {
  // if present the element should be removed before unmark
  FOREIGN: 'foreign'
}
