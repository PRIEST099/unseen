import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { JOB_URL_TTL_MS, MAX_REMEMBERED, recallJobUrl, rememberJobUrl } from './job-urls'

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
    // Entries from before the TTL existed (no timestamp) are not trusted.
    expect(recallJobUrl('job-1', fakeStorage({ 'unseen.job-urls': '[{"id":"job-1","url":"https://example.com"}]' }))).toBeUndefined()
    expect(() => rememberJobUrl('job-1', 'https://example.com', fakeStorage({}, true))).not.toThrow()
    expect(() => rememberJobUrl('job-1', 'https://example.com', null)).not.toThrow()
    expect(recallJobUrl('job-1', null)).toBeUndefined()
  })

  it('forgets a job two hours after it was remembered', () => {
    const storage = fakeStorage()
    rememberJobUrl('job-1', 'https://example.com/a', storage, 1_000)
    expect(recallJobUrl('job-1', storage, 1_000 + JOB_URL_TTL_MS)).toBe('https://example.com/a')
    expect(recallJobUrl('job-1', storage, 1_000 + JOB_URL_TTL_MS + 1)).toBeUndefined()
  })

  it('prunes expired jobs when a new one is written, and remembering again renews the clock', () => {
    const storage = fakeStorage()
    rememberJobUrl('old', 'https://example.com/old', storage, 0)
    rememberJobUrl('renewed', 'https://example.com/r', storage, 0)
    rememberJobUrl('renewed', 'https://example.com/r', storage, JOB_URL_TTL_MS)
    rememberJobUrl('new', 'https://example.com/new', storage, JOB_URL_TTL_MS + 1)
    const stored: unknown = JSON.parse(storage.getItem('unseen.job-urls') ?? '[]')
    expect(stored).toEqual([
      { id: 'renewed', url: 'https://example.com/r', at: JOB_URL_TTL_MS },
      { id: 'new', url: 'https://example.com/new', at: JOB_URL_TTL_MS + 1 },
    ])
  })

  it('does not throw when reading storage throws', () => {
    const storage = fakeStorage()
    storage.getItem = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    expect(recallJobUrl('job-1', storage)).toBeUndefined()
    expect(() => rememberJobUrl('job-1', 'https://example.com', storage)).not.toThrow()
  })

  it('uses localStorage by default, so other tabs of the same browser can recall the job', () => {
    localStorage.clear()
    rememberJobUrl('job-shared', 'https://example.com/shared')
    expect(localStorage.getItem('unseen.job-urls')).toContain('job-shared')
    expect(sessionStorage.getItem('unseen.job-urls')).toBeNull()
    expect(recallJobUrl('job-shared')).toBe('https://example.com/shared')
    localStorage.clear()
  })
})
