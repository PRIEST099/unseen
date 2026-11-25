import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { fingerprints, newHauntings, parseBaseline } from '../../src/pure/baseline.js'
import { fingerprintsArb, hauntingsWithBaselineArb, renumber } from '../arbitraries/baseline.js'
import { hauntingsArb } from '../arbitraries/haunting.js'

const RUNS = { numRuns: 100 }

test('property P1: every new haunting is a current haunting and none matches the baseline', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsWithBaselineArb, async ({ current, baseline }) => {
      const fresh = newHauntings(baseline, current)
      const known = new Set(baseline)
      const prints = fingerprints(current)
      const expected = current.filter((_, i) => !known.has(prints[i] ?? ''))
      expect(fresh).toEqual(expected)
      for (const h of fresh) expect(current).toContain(h)
      expect(fresh.length).toBe(current.length - prints.filter((p) => known.has(p)).length)
    }),
    RUNS
  )
})

test('property P1: against its own fingerprints nothing is new', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsArb, async (current) => {
      expect(newHauntings(fingerprints(current), current)).toEqual([])
    }),
    RUNS
  )
})

test('property P1: against an empty baseline everything is new', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsArb, async (current) => {
      expect(newHauntings([], current)).toEqual(current)
    }),
    RUNS
  )
})

test('property P1: renumbering every node id leaves the result unchanged', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsWithBaselineArb, fc.integer({ min: 1, max: 100000 }), async ({ current, baseline }, offset) => {
      const a = newHauntings(baseline, current).map((h) => h.htmlSnippet)
      const b = newHauntings(baseline, renumber(current, offset)).map((h) => h.htmlSnippet)
      expect(b).toEqual(a)
      expect(newHauntings(fingerprints(current), renumber(current, offset))).toEqual([])
    }),
    RUNS
  )
})

test('property P1: a second identical haunting beyond the baseline count is new', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsArb.filter((h) => h.length > 0), async (current) => {
      const first = current[0]
      if (first === undefined) return
      const grown = [...current, { ...first, id: 'duplicate' }]
      const fresh = newHauntings(fingerprints(current), grown)
      expect(fresh.map((h) => h.id)).toEqual(['duplicate'])
    }),
    RUNS
  )
})

test('property P2: the order of baseline fingerprints does not change the result', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsWithBaselineArb, fc.nat(), async ({ current, baseline }, seed) => {
      const shuffled = [...baseline].sort((a, b) => ((a.length * 31 + seed) % 7) - ((b.length * 31 + seed) % 7) || a.localeCompare(b) * -1)
      expect(newHauntings(shuffled, current)).toEqual(newHauntings(baseline, current))
    }),
    RUNS
  )
})

test('property P2: the result keeps the order of current', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingsWithBaselineArb, async ({ current, baseline }) => {
      const fresh = newHauntings(baseline, current)
      const positions = fresh.map((h) => current.indexOf(h))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }),
    RUNS
  )
})

test('property P3: parseBaseline never throws and always returns a well-formed baseline', async () => {
  await fc.assert(
    fc.asyncProperty(fc.oneof(fc.string(), fc.json(), fc.constant('{"targets":{"a":{"score":"x"}}}')), async (text) => {
      const parsed = parseBaseline(text)
      expect(typeof parsed.savedAtMs).toBe('number')
      for (const target of Object.values(parsed.targets)) {
        expect(typeof target.score).toBe('number')
        expect(target.fingerprints.every((f) => typeof f === 'string')).toBe(true)
      }
    }),
    RUNS
  )
})

test('property P3: a valid baseline round-trips', async () => {
  await fc.assert(
    fc.asyncProperty(fingerprintsArb, fc.integer({ min: 0, max: 100 }), async (prints, score) => {
      const parsed = parseBaseline(JSON.stringify({ savedAtMs: 5, targets: { 'a.html': { score, fingerprints: prints } } }))
      expect(parsed).toEqual({ savedAtMs: 5, targets: { 'a.html': { score, fingerprints: prints } } })
    }),
    RUNS
  )
})
