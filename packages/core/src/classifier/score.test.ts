import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, arbPrimaryHaunting } from '../../tests/classifier/arbitraries.js'
import { computeScore, SEVERITY_WEIGHTS } from './score.js'
import type { Haunting, HauntingSeverity } from './types.js'

const RUNS = { numRuns: 200 }
const arbSet = fc.array(arbHaunting, { maxLength: 40 })
const RANK: Record<HauntingSeverity, number> = { Banished: 0, Restless: 1, Wraith: 2 }
const SEVERITIES: HauntingSeverity[] = ['Banished', 'Restless', 'Wraith']

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs]
  let s = seed >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const of = (severity: HauntingSeverity, n = 1): Haunting[] =>
  Array.from({ length: n }, (_, i) => ({ ...fc.sample(arbPrimaryHaunting, 1)[0]!, id: `x${i}`, severity, isPrimary: true }))

describe('computeScore properties', () => {
  // Feature: haunting-classifier, Property 1: Score is deterministic
  it('Property 1: deterministic', () => {
    fc.assert(fc.property(arbSet, (hs) => computeScore(hs) === computeScore(hs)), RUNS)
  })

  // Feature: haunting-classifier, Property 2: Score is monotonic non-decreasing
  it('Property 2: adding any haunting never lowers the score', () => {
    fc.assert(fc.property(arbSet, arbHaunting, (hs, h) => computeScore([...hs, h]) >= computeScore(hs)), RUNS)
  })

  // Feature: haunting-classifier, Property 3: Score is order-independent
  it('Property 3: order-independent', () => {
    fc.assert(fc.property(arbSet, fc.nat(), (hs, seed) => computeScore(shuffle(hs, seed)) === computeScore(hs)), RUNS)
  })

  // Feature: haunting-classifier, Property 4: Score is bounded
  it('Property 4: bounded to [0, 100] and an integer', () => {
    fc.assert(
      fc.property(arbSet, (hs) => {
        const s = computeScore(hs)
        return s >= 0 && s <= 100 && Number.isInteger(s)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 5: Score zero baseline
  it('Property 5: score([]) is 0', () => {
    expect(computeScore([])).toBe(0)
  })

  // Feature: haunting-classifier, Property 6: Score severity-dominance
  it('Property 6: replacing a haunting by a more severe one never lowers the score', () => {
    fc.assert(
      fc.property(arbSet, arbHaunting, fc.constantFrom(...SEVERITIES), (hs, h, other) => {
        const harsher: Haunting = RANK[other] > RANK[h.severity] ? { ...h, severity: other } : h
        return computeScore([...hs, harsher]) >= computeScore([...hs, h])
      }),
      RUNS
    )
  })

  it('secondary hauntings never change the score', () => {
    fc.assert(
      fc.property(fc.array(arbPrimaryHaunting, { maxLength: 20 }), arbHaunting, (hs, h) => computeScore([...hs, { ...h, isPrimary: false }]) === computeScore(hs)),
      RUNS
    )
  })

  it('is not affected by the secondary array of a primary', () => {
    fc.assert(
      fc.property(arbPrimaryHaunting, arbSet, (h, secondary) => computeScore([{ ...h, secondary }]) === computeScore([{ ...h, secondary: [] }])),
      RUNS
    )
  })
})

describe('computeScore examples', () => {
  it('empty input is 0', () => expect(computeScore([])).toBe(0))
  it('a single Wraith is about 15', () => expect(computeScore(of('Wraith'))).toBe(15))
  it('five Wraiths are about 57', () => expect(computeScore(of('Wraith', 5))).toBe(57))
  it('twenty Wraiths are about 96', () => expect(computeScore(of('Wraith', 20))).toBe(96))
  it('uses the weights 20, 8 and 3', () => {
    expect(SEVERITY_WEIGHTS).toEqual({ Wraith: 20, Restless: 8, Banished: 3 })
    const raw = 20 + 8 + 3
    expect(computeScore([...of('Wraith'), ...of('Restless'), ...of('Banished')])).toBe(Math.round(100 * (1 - Math.exp(-raw / 120))))
  })
  it('approaches but never reaches the cap by count alone', () => {
    expect(computeScore(of('Banished', 1))).toBe(2)
    expect(computeScore(of('Wraith', 100))).toBe(100)
  })
})
