import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, makeAxNode, makeHaunting } from '../test-support/haunting-arbitraries'
import { HAUNTING_DISPLAY_NAMES } from './haunting-display'
import { buildAxLookup, buildOverlayLabel, elementLabel } from './overlay-label'

describe('buildOverlayLabel (requirement 10.2)', () => {
  it('uses the accessible name when the element has one', () => {
    const lookup = buildAxLookup([makeAxNode(1, 'button', 'Add to cart')])
    expect(buildOverlayLabel(makeHaunting(), lookup)).toBe('Nameless Spirit: Add to cart, Wraith')
  })

  it('uses the role when the element is unnamed', () => {
    const lookup = buildAxLookup([makeAxNode(1, 'button', '')])
    expect(buildOverlayLabel(makeHaunting(), lookup)).toBe('Nameless Spirit: button, Wraith')
  })

  it('falls back to the snippet text, then the tag, when the AX node says nothing useful', () => {
    const lookup = buildAxLookup([makeAxNode(1, 'generic', '')])
    const withText = makeHaunting({ type: 'LostSoul', severity: 'Restless', htmlSnippet: '<div class="card">Cedar  candle</div>' })
    expect(buildOverlayLabel(withText, lookup)).toBe('Lost Soul: Cedar candle, Restless')
    const bare = makeHaunting({ type: 'LostSoul', severity: 'Restless', htmlSnippet: '<div class="card"></div>' })
    expect(buildOverlayLabel(bare, buildAxLookup([]))).toBe('Lost Soul: div, Restless')
  })

  it('describes page-level hauntings without an AX node', () => {
    const tongue = makeHaunting({ type: 'SilentTongue', severity: 'Restless', box: null })
    expect(buildOverlayLabel(tongue, buildAxLookup([]))).toBe('Silent Tongue: The spirits speak a garbled tongue, Restless')
    const order = makeHaunting({ type: 'ShatteredOrder', kind: 'no-h1', severity: 'Restless', box: null })
    expect(elementLabel(order, buildAxLookup([]))).toBe('Missing level 1 heading')
  })

  it('always follows "[Name]: [element], [severity]" and is never empty', () => {
    fc.assert(
      fc.property(arbHaunting, (haunting) => {
        const label = buildOverlayLabel(haunting, buildAxLookup([]))
        expect(label.startsWith(`${HAUNTING_DISPLAY_NAMES[haunting.type]}: `)).toBe(true)
        expect(label.endsWith(`, ${haunting.severity}`)).toBe(true)
        const element = label.slice(HAUNTING_DISPLAY_NAMES[haunting.type].length + 2, label.length - haunting.severity.length - 2)
        expect(element.trim()).not.toBe('')
      }),
    )
  })

  it('truncates very long names', () => {
    const lookup = buildAxLookup([makeAxNode(1, 'link', 'x'.repeat(500))])
    expect(elementLabel(makeHaunting(), lookup).length).toBeLessThanOrEqual(60)
  })
})
