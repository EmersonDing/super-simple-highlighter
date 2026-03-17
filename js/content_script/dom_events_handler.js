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

class DOMEventsHandler {
  /**
   * Creates an instance of DOMEventsHandler.
   * 
   * @param {StyleSheetManager} styleSheetManager 
   * @param {Document} [document=window.document]
   * @memberof DOMEventsHandler
   */
  constructor(styleSheetManager, document = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = document
  }

  /**
   * Initializer
   * 
   * @returns {DOMEventsHandler}
   * @memberof DOMEventsHandler
   */
  init() {
    const listenerOptions = { capture: true, passive: true }

    for (const type of ['mouseenter', 'focusin']) {
      this.document.addEventListener(type, this.onEnterInDocument.bind(this), listenerOptions)
    }

    for (const type of ['mouseleave', 'focusout']) {
      this.document.addEventListener(type, this.onLeaveOutDocument.bind(this), listenerOptions)
    }

    return this
  }

  /**
   * Mouse entered element or element gained focus (anywhere in document)
   * event can be MouseEvent or FocusEvent
   * 
   * @private
   * @memberof DOMEventsHandler
   */
  onEnterInDocument() {
    const target = /** @type {HTMLElement} **/ (event.target)

    // the target of the event must be a highlight/mark, which we know because its class contains our style
    if (!target.id || //!target.classList ||
      !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) {
     return
   }

    // only use first element of the chain
    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) {
      return
    }

    const firstElm = elms[0]
    let closeElm = /** @type {HTMLButtonElement} */ (firstElm.querySelector(`.${StyleSheetManager.CLASS_NAME.CLOSE}`))
    
    // if the element has a close button we can cancel the timer and leave it be
    if (closeElm) {
      const name = DOMEventsHandler.CLOSE_BUTTON.TIMER_ID_ATTRIBUTE_NAME
      
      // if it has a timer, clear it
      if (closeElm.dataset[name]) {
        clearTimeout(parseInt(closeElm.dataset[name]))
        
        delete closeElm.dataset[name]
      }

      return
    }
    
    // add the close button
    closeElm = this.document.createElement('button')

    closeElm.classList.add(StyleSheetManager.CLASS_NAME.CLOSE)

    // identify the new child as something that should be removed before unmark, because it would be merged
    // back into the reconsituted element
    closeElm.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] = ''

    
    closeElm.addEventListener('click', this.onClickClose.bind(this), 
      // @ts-ignore
      { passive: true, capture: true, once: true }
    )

    firstElm.appendChild(closeElm)

    // Show comment tooltip if comment exists
    if (firstElm.dataset.comment) {
      this._showCommentTooltip(firstElm)
    }
  }

  /**
   * Mouse left element or element lost focus (anywhere in document)
   * event can be MouseEvent or FocusEvent
   * 
   * @private
   * @memberof DOMEventsHandler
   */
  onLeaveOutDocument() {
    const target = /** @type {HTMLElement} **/ (event.target)

    // the target of the event must be a highlight/mark, which we know because its class contains our style
    if (!target.id || //!target.classList ||
       !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) {
      return
    }

    // only use first element of the chain
    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) {
      return
    }

    // the first mark element should already have the close button child element
    const firstElm = elms[0]
    let closeElm = /** @type {HTMLButtonElement} */ (firstElm.querySelector(`.${StyleSheetManager.CLASS_NAME.CLOSE}`))
    
    if (!closeElm) {
      return
    }

    // name of data attribute storing hysteresis timer id
    const name = DOMEventsHandler.CLOSE_BUTTON.TIMER_ID_ATTRIBUTE_NAME

    // timer to remove close button
    closeElm.dataset[name] = setTimeout(() => {
      // remove timer id attrbiute
      delete closeElm.dataset[name]
    
      // prepare popout
      closeElm.addEventListener('animationend', (/** @type {AnimationEvent} */ event) => {
        // remove close button
        closeElm.remove()
        // @ts-ignore
      }, { once: true, capture: false, passive: true })
    
      // if the close element has focus, wait until its lost to start the close animation
      const onFocusOut = () => { 
        // start animation
        closeElm.style.animation = this.styleSheetManager.buttonPopOutAnimation
      }

      if(this.document.activeElement === closeElm) {
        closeElm.addEventListener('focusout', onFocusOut, 
          // @ts-ignore
          { passive: true, capture: false, once: true }
        )
      } else {
        onFocusOut()
      }
            
    }, DOMEventsHandler.CLOSE_BUTTON.TIMEOUT).toString()

    // Hide comment tooltip
    this._hideCommentTooltip()
  }

  //

  /**
   * Clicked 'close' button of the first mark element in the chain
   * 
   * @returns {Promise<HTMLElement[]>}
   * @memberof DOMEventsHandler
   */
  onClickClose() {
    // id parent element will be the first of the chain of mark elements
    const closeElm = /** @type {HTMLButtonElement} */ (event.target)
    const firstElm = /** @type {HTMLElement} */ closeElm.parentElement

    if (!firstElm || !firstElm.id) {
      return Promise.reject(new Error('unknown highlight id'))
    }

    // if the element still contained a close button it would be left behind when the nodes merge back together
    console.assert(typeof closeElm.dataset[ChromeRuntimeHandler.DATA_ATTRIBUTE_NAME.FOREIGN] !== 'undefined')
    // closeElm.remove()

    // send message to event page to both delete highlight from DB and the DOM
    return ChromeRuntimeHandler.deleteHighlight(firstElm.id)
  }

  /**
   * Show a tooltip above the highlight element with the comment text
   *
   * @private
   * @param {HTMLElement} markElm - first <mark> element of the highlight
   */
  _showCommentTooltip(markElm) {
    this._hideCommentTooltip()

    const tooltip = this.document.createElement('div')
    tooltip.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_TOOLTIP)
    // textContent — never innerHTML — prevents XSS
    tooltip.textContent = markElm.dataset.comment

    const rect = markElm.getBoundingClientRect()
    tooltip.style.cssText = `
      all: initial;
      position: fixed;
      background: #2c2c2c;
      color: #fff;
      border-radius: 8px;
      padding: 7px 12px;
      font: 13px/1.5 -apple-system, sans-serif;
      max-width: 260px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      pointer-events: none;
      z-index: 2147483647;
      white-space: normal;
      word-break: break-word;
      left: ${Math.round(rect.left)}px;
      top: ${Math.round(rect.top - 48)}px;
    `

    this.document.body.appendChild(tooltip)
    this._commentTooltip = tooltip
  }

  /**
   * Remove comment tooltip from DOM
   *
   * @private
   */
  _hideCommentTooltip() {
    if (this._commentTooltip) {
      this._commentTooltip.remove()
      this._commentTooltip = null
    }
  }
}

// static properties

DOMEventsHandler.CLOSE_BUTTON = {
  // name of data attribute containing hysteresis timer id
  TIMER_ID_ATTRIBUTE_NAME: 'timerId',
  // hysteresis time timoout
  TIMEOUT: 500
}
