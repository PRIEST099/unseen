import * as fc from 'fast-check'
import { expect, test } from 'vitest'
import { SNIPPET_ELLIPSIS, SNIPPET_MAX_CHARS, clipSnippet } from './snippet.js'

test('a snippet that fits is returned unchanged', () => {
  expect(clipSnippet('<button class="buy">')).toBe('<button class="buy">')
  expect(clipSnippet('a'.repeat(SNIPPET_MAX_CHARS))).toBe('a'.repeat(SNIPPET_MAX_CHARS))
  expect(clipSnippet('')).toBe('')
})

test('a long snippet keeps its first 299 characters and ends with "…"', () => {
  const out = clipSnippet('b'.repeat(SNIPPET_MAX_CHARS + 1))
  expect(out).toHaveLength(SNIPPET_MAX_CHARS)
  expect(out).toBe(`${'b'.repeat(SNIPPET_MAX_CHARS - 1)}${SNIPPET_ELLIPSIS}`)
})

test('text already cut upstream gets the ellipsis even when it fits', () => {
  expect(clipSnippet('<div><p>', true)).toBe('<div><p>…')
  expect(clipSnippet('c'.repeat(SNIPPET_MAX_CHARS), true)).toBe(`${'c'.repeat(SNIPPET_MAX_CHARS - 1)}…`)
})

test('property: never longer than the limit; shortened exactly when too long or flagged; keeps a prefix', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 700 }), fc.boolean(), fc.integer({ min: 2, max: 400 }), (text, truncated, max) => {
      const out = clipSnippet(text, truncated, max)
      expect(out.length).toBeLessThanOrEqual(max)
      const shortened = truncated || text.length > max
      if (!shortened) {
        expect(out).toBe(text)
        return
      }
      expect(out.endsWith(SNIPPET_ELLIPSIS)).toBe(true)
      expect(text.startsWith(out.slice(0, -SNIPPET_ELLIPSIS.length))).toBe(true)
    })
  )
})
