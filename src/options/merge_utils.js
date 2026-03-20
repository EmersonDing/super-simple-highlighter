/**
 * Merge backup CREATE docs into current active docs, deduplicating by content.
 * Caller is responsible for passing only CREATE docs; DELETE docs are not filtered here.
 *
 * @param {Object[]} currentDocs - net-active CREATE docs from current DB
 * @param {Object[]} backupDocs  - CREATE docs from backup (DELETE docs pre-filtered by caller)
 * @returns {Object[]} currentDocs + non-duplicate backupDocs
 */
function mergeHighlightDocs(currentDocs, backupDocs) {
  // range is stored as a stringified xrange object; String() is safe and avoids double-serialization
  const key = doc => [doc.match, doc.text, String(doc.range)].join('\0')
  const existing = new Set(currentDocs.map(key))
  const toAdd = backupDocs.filter(d => !existing.has(key(d)))
  return [...currentDocs, ...toAdd]
}

// Node.js export for unit tests; not used in browser context
if (typeof module !== 'undefined') module.exports = { mergeHighlightDocs }
