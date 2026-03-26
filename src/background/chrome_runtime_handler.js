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

/**
 * Singleton class for chrome.runtime callback methods
 * 
 * @class ChromeRuntimeHandler
 */
class ChromeRuntimeHandler {
  /**
   * Add static methods of this class as listeners
   * 
   * @static
   * @memberof ChromeRuntimeHandler
   */
  static addListeners() {
    chrome.runtime.onStartup.addListener(ChromeRuntimeHandler.onStartup)
    chrome.runtime.onMessage.addListener(ChromeRuntimeHandler.onMessage)
  }

  static addConnectListener() {
    chrome.runtime.onConnect.addListener(ChromeRuntimeHandler.onConnect)
  }

  static onConnect(port) {
    if (port.name !== 'chat-stream') return

    port.onMessage.addListener(async (request) => {
      try {
        const storage = new ChromeStorage('local')
        const keys = await new Promise((resolve, reject) => {
          storage.storage.get({
            [ChromeStorage.KEYS.CHAT_PROVIDER]: 'gemini',
            [ChromeStorage.KEYS.CHAT_API_KEY_GPT]: '',
            [ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]: '',
          }, (items) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
            else resolve(items)
          })
        })

        const provider = request.provider || keys[ChromeStorage.KEYS.CHAT_PROVIDER]
        const apiKey = provider === 'gpt'
          ? keys[ChromeStorage.KEYS.CHAT_API_KEY_GPT]
          : keys[ChromeStorage.KEYS.CHAT_API_KEY_GEMINI]

        if (!apiKey) {
          port.postMessage({ type: 'error', message: `No API key configured for ${provider === 'gpt' ? 'OpenAI' : 'Gemini'}. Set it in Settings > AI Chat.` })
          return
        }

        let systemContent = 'You are a helpful assistant. The user is reading a web page. Here is the page content:\n\n'
        const pageCtx = (request.pageContext || '').substring(0, 50000)
        systemContent += pageCtx

        if (request.selectedText) {
          systemContent += '\n\nThe user has highlighted this text:\n\n' + request.selectedText
        }

        if (provider === 'gpt') {
          await ChromeRuntimeHandler._streamGPT(port, apiKey, systemContent, request.messages)
        } else {
          await ChromeRuntimeHandler._streamGemini(port, apiKey, systemContent, request.messages)
        }
      } catch (e) {
        try {
          port.postMessage({ type: 'error', message: e.message || 'Unknown error' })
        } catch (_) { /* port disconnected */ }
      }
    })
  }

  static async _streamGPT(port, apiKey, systemContent, messages) {
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...messages,
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      port.postMessage({ type: 'error', message: `OpenAI API error (${response.status}): ${errText}` })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            port.postMessage({ type: 'chunk', text: delta })
          }
        } catch (_) { /* skip malformed JSON */ }
      }
    }

    port.postMessage({ type: 'done' })
  }

  static async _streamGemini(port, apiKey, systemContent, messages) {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemContent }] },
          contents: contents,
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      port.postMessage({ type: 'error', message: `Gemini API error (${response.status}): ${errText}` })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)

        try {
          const parsed = JSON.parse(data)
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            port.postMessage({ type: 'chunk', text: text })
          }
        } catch (_) { /* skip malformed JSON */ }
      }
    }

    port.postMessage({ type: 'done' })
  }

  /**
   * Fired when a profile that has this extension installed first starts up.
   * This event is not fired when an incognito profile is started, even if this
   * extension is operating in 'split' incognito mode.
   * 
   * @static
   * @returns {Promise}
   * @memberof ChromeRuntimeHandler
   */
  static onStartup() {
    // remove entries in which the number of 'create' doc == number of 'delete' docs
    return new DB().removeAllSuperfluousDocuments()
  }

  /**
   * Fired when a message is sent from either an extension process (by runtime.sendMessage) or a content script (by tabs.sendMessage).
   * 
   * @static
   * @param {{id: string}} [message] - The message sent by the calling script.
   * @param {Object} sender 
   * @param {Function} sendResponse - Function to call (at most once) when you have a response. The argument should be any JSON-ifiable object.
   *  If you have more than one onMessage listener in the same document, then only one may send a response.
   *  This function becomes invalid when the event listener returns, unless you return true from the event listener to indicate you wish to send a 
   *  response asynchronously (this will keep the message channel open to the other end until sendResponse is called). 
   * @memberof ChromeRuntimeHandler
   */
  static onMessage(message, sender, sendResponse) {
    let response
    let asynchronous = false

    switch (message.id) {
      case ChromeRuntimeHandler.MESSAGE.DELETE_HIGHLIGHT:
        // message.highlightId is the document id to be deleted
        asynchronous = true

        ChromeTabs.queryActiveTab().then(tab => {
          if (!tab) {
            return
          }

          const highlightId = /** @type {{id: string, highlightId: string}} */ (message).highlightId
          return new Highlighter(tab.id).delete(highlightId)
        }).then(() => {
          sendResponse(true)
        }).catch(() => {
          sendResponse(false)
        })
        break

      case ChromeRuntimeHandler.MESSAGE.CREATE_HIGHLIGHT_FROM_PAGE:
        asynchronous = true

        ;(async () => {
          try {
            const match = DB.formatMatch(sender.tab.url)
            const docId = await new Highlighter(sender.tab.id).create(
              message.xrange,
              match,
              message.text,
              message.className,
              { comment: message.comment }
            )
            sendResponse(docId)
          } catch (e) {
            console.error('CREATE_HIGHLIGHT_FROM_PAGE error:', e)
            sendResponse(false)
          }
        })()
        break

      case ChromeRuntimeHandler.MESSAGE.UPDATE_HIGHLIGHT_COMMENT:
        asynchronous = true

        ;(async () => {
          try {
            await new DB().updateCreateDocument(message.highlightId, {
              comment: message.comment
            })
            await new ChromeTabs(sender.tab.id).setHighlightComment(
              message.highlightId,
              message.comment
            )
            sendResponse(true)
          } catch (e) {
            console.error('UPDATE_HIGHLIGHT_COMMENT error:', e)
            sendResponse(false)
          }
        })()
        break

      case ChromeRuntimeHandler.MESSAGE.OPEN_URL:
        asynchronous = true

        ChromeTabs.create({
          url: message.url,
          openerTabId: sender.tab && sender.tab.id
        }).then(() => {
          sendResponse(true)
        }).catch((e) => {
          console.error('OPEN_URL error:', e)
          sendResponse(false)
        })
        break

      default:
        throw `Unhandled message: sender=${sender}, id=${message.id}`
    }

    if (!asynchronous) {
      sendResponse(response)
    }
    
    return asynchronous
  }
}

// static properties

// messages sent to the event page (from content script)
ChromeRuntimeHandler.MESSAGE = {
  DELETE_HIGHLIGHT: 'delete_highlight',
  CREATE_HIGHLIGHT_FROM_PAGE: 'create_highlight_from_page',
  UPDATE_HIGHLIGHT_COMMENT: 'update_highlight_comment',
  OPEN_URL: 'open_url',
}
