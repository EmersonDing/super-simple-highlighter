const { mergeHighlightDocs } = require('../../src/options/merge_utils')

function makeDoc(match, text, range, extra = {}) {
  return { verb: 'create', match, text, range, ...extra }
}

describe('mergeHighlightDocs', () => {
  test('returns current docs unchanged when backup is empty', () => {
    const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
    expect(mergeHighlightDocs(current, [])).toEqual(current)
  })

  test('returns all backup docs when current is empty', () => {
    const backup = [makeDoc('https://a.com', 'hello', '{"start":0}')]
    expect(mergeHighlightDocs([], backup)).toEqual(backup)
  })

  test('does not add backup doc with same match+text+range as current', () => {
    const doc = makeDoc('https://a.com', 'hello', '{"start":0}')
    const result = mergeHighlightDocs([doc], [doc])
    expect(result).toHaveLength(1)
  })

  test('adds backup doc with same match+text but different range', () => {
    const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
    const backup  = [makeDoc('https://a.com', 'hello', '{"start":5}')]
    expect(mergeHighlightDocs(current, backup)).toHaveLength(2)
  })

  test('adds backup doc on a URL not in current DB', () => {
    const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
    const backup  = [makeDoc('https://b.com', 'world', '{"start":0}')]
    const result = mergeHighlightDocs(current, backup)
    expect(result).toHaveLength(2)
    expect(result[1].match).toBe('https://b.com')
  })

  test('adds backup doc with comment field when no content match', () => {
    const current = [makeDoc('https://a.com', 'hello', '{"start":0}')]
    const backup  = [makeDoc('https://a.com', 'world', '{"start":0}', { comment: 'note' })]
    expect(mergeHighlightDocs(current, backup)).toHaveLength(2)
  })

  test('includes DELETE doc if accidentally passed in backupDocs (no guard in function)', () => {
    const deleteDoc = { verb: 'delete', match: 'https://a.com', correspondingDocumentId: 'abc' }
    const result = mergeHighlightDocs([], [deleteDoc])
    expect(result).toHaveLength(1)
    expect(result[0].verb).toBe('delete')
  })

  test('current docs always appear before added backup docs in output', () => {
    const current = [makeDoc('https://a.com', 'first',  '{"start":0}')]
    const backup  = [makeDoc('https://b.com', 'second', '{"start":0}')]
    const result = mergeHighlightDocs(current, backup)
    expect(result[0].match).toBe('https://a.com')
    expect(result[1].match).toBe('https://b.com')
  })
})
