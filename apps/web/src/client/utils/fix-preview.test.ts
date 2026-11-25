import type { Haunting } from '@the-unseen/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, makeHaunting } from '../test-support/haunting-arbitraries'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import {
  TAKES_FORM_EASING,
  exorcisedMessage,
  hauntingCount,
  nextFocusId,
  previewNoticeText,
  previewScore,
  reserveCount,
  spiritSightOpenMessage,
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

  it('announces the name, the remaining count and the new score, and says it is a preview', () => {
    expect(exorcisedMessage('Invisible Wanderer', 45, 97)).toBe(
      'Invisible Wanderer exorcised: 45 hauntings left, score now 97 (preview, audit not re-run)',
    )
    expect(exorcisedMessage('Nameless Spirit', 1, 6)).toBe('Nameless Spirit exorcised: 1 haunting left, score now 6 (preview, audit not re-run)')
    expect(exorcisedMessage('The Fog', 0, 0)).not.toMatch(/compliant|accessible/i)
  })

  it('never repeats the same status text for consecutive previews, even when the score saturates', () => {
    // Two Restless previews on a large audit leave the score at 97; the count still changes.
    const first = exorcisedMessage('Invisible Wanderer', 46, 97)
    const second = exorcisedMessage('Invisible Wanderer', 45, 97)
    expect(first).not.toBe(second)
  })
})

describe('spiritSightOpenMessage', () => {
  it('keeps the audited wording outside a preview', () => {
    expect(spiritSightOpenMessage(48, 98)).toBe('Spirit Sight open: 48 hauntings, score 98')
  })

  it('says it is a preview and gives both scores during one', () => {
    expect(spiritSightOpenMessage(46, 97, { auditedScore: 98 })).toBe(
      'Spirit Sight open (preview): 46 hauntings, preview score 97, audited score 98',
    )
  })

  it('uses the singular for one haunting left in a preview, like the exorcised message', () => {
    expect(spiritSightOpenMessage(1, 99, { auditedScore: 98 })).toBe(
      'Spirit Sight open (preview): 1 haunting, preview score 99, audited score 98',
    )
    expect(spiritSightOpenMessage(0, 0, { auditedScore: 98 })).toBe(
      'Spirit Sight open (preview): 0 hauntings, preview score 0, audited score 98',
    )
  })
})

describe('hauntingCount', () => {
  it('puts the noun in the right number', () => {
    expect(hauntingCount(0)).toBe('0 hauntings')
    expect(hauntingCount(1)).toBe('1 haunting')
    expect(hauntingCount(2)).toBe('2 hauntings')
  })
})

describe('previewNoticeText', () => {
  it('says how many are taken out, that it is a preview, and that the audit has not been re-run', () => {
    expect(previewNoticeText(1, 47)).toBe(
      'Preview only. 1 haunting is taken out of this view to show what a source-code fix would do. The audited page is unchanged and the audit has not been re-run.',
    )
    expect(previewNoticeText(3, 45)).toContain('3 hauntings are taken out')
  })

  it('with nothing left, says the preview tells nothing about the page and never claims compliance', () => {
    const all = previewNoticeText(48, 0)
    expect(all).toContain('No hauntings are left in this view: all 48 are taken out')
    expect(all).toContain('the audit has not been re-run, so this says nothing about the page itself.')
    expect(previewNoticeText(1, 0)).toContain('the only one is taken out')
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (takenOut, remaining) => {
        const text = previewNoticeText(takenOut, remaining)
        expect(text.startsWith('Preview only.')).toBe(true)
        expect(text).toContain('the audit has not been re-run')
        expect(text).not.toMatch(/compliant/i)
      }),
    )
  })
})

describe('reserveCount', () => {
  it('has one more digit than the total, so the reserved notice is never narrower than a real one', () => {
    expect(reserveCount(0)).toBe(88)
    expect(reserveCount(9)).toBe(88)
    expect(reserveCount(48)).toBe(888)
    expect(reserveCount(100)).toBe(8888)
    fc.assert(
      fc.property(fc.nat(100_000), (total) => {
        expect(String(reserveCount(total)).length).toBe(String(total).length + 1)
        expect(reserveCount(total)).toBeGreaterThan(total)
      }),
    )
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
