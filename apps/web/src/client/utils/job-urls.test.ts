import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_REMEMBERED, recallJobUrl, rememberJobUrl } from './job-urls'

/** A minimal in-memory Storage, so the tests do not depend on a browser. */
function fakeStorage(initial: Record<string, string> = {}, failWrites = false): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => {
      if (failWrites) throw new DOMException('full', 'QuotaExceededError')
      data.set(key, value)
    },
  }
}

describe('job URL memory', () => {
  it('recalls the URL a job was started for, and nothing for an unknown job', () => {
    const storage = fakeStorage()
    rememberJobUrl('job-1', 'https://example.com/a', storage)
    expect(recallJobUrl('job-1', storage)).toBe('https://example.com/a')
    expect(recallJobUrl('job-2', storage)).toBeUndefined()
  })

  it('replaces an earlier entry for the same job', () => {
    const storage = fakeStorage()
    rememberJobUrl('job-1', 'https://example.com/a', storage)
    rememberJobUrl('job-1', 'https://example.com/b', storage)
    expect(recallJobUrl('job-1', storage)).toBe('https://example.com/b')
  })

  it('property: keeps the newest MAX_REMEMBERED jobs and always the last one written', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z0-9-]{1,12}$/), { minLength: 1, maxLength: 60 }), (ids) => {
        const storage = fakeStorage()
        for (const id of ids) rememberJobUrl(id, `https://example.com/${id}`, storage)
        const last = ids[ids.length - 1] ?? ''
        expect(recallJobUrl(last, storage)).toBe(`https://example.com/${last}`)
        const remembered = ids.filter((id) => recallJobUrl(id, storage) !== undefined)
        expect(remembered).toEqual(ids.slice(-MAX_REMEMBERED))
      }),
    )
  })

  it('ignores corrupt storage, blocked writes and a missing storage', () => {
    expect(recallJobUrl('job-1', fakeStorage({ 'unseen.job-urls': 'not json' }))).toBeUndefined()
    expect(recallJobUrl('job-1', fakeStorage({ 'unseen.job-urls': '{"id":"job-1"}' }))).toBeUndefined()
    expect(() => rememberJobUrl('job-1', 'https://example.com', fakeStorage({}, true))).not.toThrow()
    expect(() => rememberJobUrl('job-1', 'https://example.com', null)).not.toThrow()
    expect(recallJobUrl('job-1', null)).toBeUndefined()
  })
})
