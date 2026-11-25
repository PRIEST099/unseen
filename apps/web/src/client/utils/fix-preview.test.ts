import type { Haunting } from '@the-unseen/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, makeHaunting } from '../test-support/haunting-arbitraries'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import {
  TAKES_FORM_EASING,
  exorcisedMessage,
  nextFocusId,
  previewScore,
  takesFormDurationMs,
  withoutPreviewed,
} from './fix-preview'

/** Unique ids, so removal by id is unambiguous. */
const arbHauntings: fc.Arbitrary<Haunting[]> = fc
  .array(arbHaunting, { maxLength: 30 })
  .map((list) => list.map((haunting, index) => ({ ...haunting, id: `h-${index}` })))

describe('previewScore', () => {
  it('is 0 for no hauntings and follows the documented formula', () => {
    expect(previewScore([])).toBe(0)
    expect(previewScore([makeHaunting({ severity: 'Wraith' })])).toBe(15)
    const fiveWraiths = Array.from({ length: 5 }, (_, index) => makeHaunting({ id: `w-${index}`, severity: 'Wraith' }))
    expect(previewScore(fiveWraiths)).toBe(57)
  })

  it('matches the deterministic score the core classifier stored in the committed sample', () => {
    expect(previewScore(SAMPLE_AUDIT.hauntings)).toBe(SAMPLE_AUDIT.score)
  })

  it('is bounded between 0 and 100', () => {
    fc.assert(
      fc.property(arbHauntings, (hauntings) => {
        const score = previewScore(hauntings)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }),
    )
  })

  it('never goes up when hauntings are removed (monotonic decrease)', () => {
    fc.assert(
      fc.property(arbHauntings, fc.array(fc.nat(40), { maxLength: 10 }), (hauntings, picks) => {
        const removed = new Set(picks.map((pick) => `h-${pick}`))
        const remaining = withoutPreviewed(hauntings, removed)
        expect(previewScore(remaining)).toBeLessThanOrEqual(previewScore(hauntings))
      }),
    )
  })

  it('drops by at most the removed haunting and never below zero, one removal at a time', () => {
    fc.assert(
      fc.property(arbHauntings, (hauntings) => {
        let previous = previewScore(hauntings)
        const removed = new Set<string>()
        for (const haunting of hauntings) {
          removed.add(haunting.id)
          const next = previewScore(withoutPreviewed(hauntings, removed))
          expect(next).toBeLessThanOrEqual(previous)
          expect(next).toBeGreaterThanOrEqual(0)
          previous = next
        }
        expect(previous).toBe(0)
      }),
    )
  })

  it('does not depend on order', () => {
    fc.assert(
      fc.property(arbHauntings, (hauntings) => {
        expect(previewScore([...hauntings].reverse())).toBe(previewScore(hauntings))
      }),
    )
  })
})

describe('withoutPreviewed', () => {
  it('removes exactly the previewed ids and keeps order', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => makeHaunting({ id }))
    expect(withoutPreviewed(list, new Set(['b', 'd'])).map((haunting) => haunting.id)).toEqual(['a', 'c'])
    expect(withoutPreviewed(list, new Set())).toEqual(list)
  })
})

describe('takes form timing and wording', () => {
  it('uses 600 ms normally and 100 ms under reduced motion', () => {
    expect(takesFormDurationMs(false)).toBe(600)
    expect(takesFormDurationMs(true)).toBe(100)
    expect(TAKES_FORM_EASING).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)')
  })

  it('announces the name and the new score, and says it is a preview', () => {
    const message = exorcisedMessage('Nameless Spirit', 12)
    expect(message).toContain('Nameless Spirit exorcised: score now 12')
    expect(message).toContain('preview')
    expect(message).not.toMatch(/compliant|accessible/i)
  })
})

describe('nextFocusId', () => {
  const order = ['a', 'b', 'c', 'd']
  it('prefers the next remaining overlay, then the closest earlier one, then null', () => {
    expect(nextFocusId(order, 'b', new Set(['a', 'c', 'd']))).toBe('c')
    expect(nextFocusId(order, 'd', new Set(['a', 'b', 'c']))).toBe('c')
    expect(nextFocusId(order, 'b', new Set(['a', 'd']))).toBe('d')
    expect(nextFocusId(order, 'b', new Set())).toBeNull()
  })

  it('always returns a remaining id when one exists', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat(30), { minLength: 1, maxLength: 12 }),
        fc.nat(11),
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        (nums, pick, flags) => {
          const ids = nums.map((n) => `h-${n}`)
          const fixed = ids[pick % ids.length] ?? ''
          const keep = new Set(ids.filter((id, index) => id !== fixed && flags[index] === true))
          const result = nextFocusId(ids, fixed, keep)
          if (keep.size === 0) expect(result).toBeNull()
          else expect(result !== null && keep.has(result)).toBe(true)
        },
      ),
    )
  })
})
