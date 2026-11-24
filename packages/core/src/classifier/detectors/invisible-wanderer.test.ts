import { describe, expect, it } from 'vitest'
import { baseRaw, dom, step, walk } from '../../../tests/classifier/builders.js'
import type { ComputedStyleMap, RawAudit, TabStep } from '../../types.js'
import { detectInvisibleWanderer } from './invisible-wanderer.js'

const page = (...steps: TabStep[]): RawAudit => baseRaw({ tabWalkResult: walk({ steps }) })
const flagged = (...steps: TabStep[]): number[] => detectInvisibleWanderer(page(...steps)).map((h) => h.nodeIds[0]!)

/** A step whose focus look is `after`, against a white page. */
const focus = (after: ComputedStyleMap, before: ComputedStyleMap = {}, id = 5): TabStep => step(id, after, {}, before)

describe('detectInvisibleWanderer', () => {
  it('flags an element with no outline change', () => {
    expect(flagged(focus({}))).toEqual([5])
  })

  it('does not flag a visible outline (3:1 against the adjacent background)', () => {
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgb(0, 0, 0)' }))).toEqual([])
  })

  it('flags an outline below 3:1 against the adjacent background', () => {
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgb(200, 200, 200)' }))).toEqual([5])
  })

  it('a white outline on a white background is invisible', () => {
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgb(255, 255, 255)' }))).toEqual([5])
  })

  it('measures the outline against the adjacent background, not the element own background', () => {
    const outline = { 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgb(20, 20, 20)', 'background-color': 'rgb(20, 20, 20)' }
    expect(flagged(focus({ ...outline, 'adjacent-background-color': 'rgb(255, 255, 255)' }, { 'background-color': 'rgb(20, 20, 20)' }))).toEqual([])
    expect(flagged(focus({ ...outline, 'adjacent-background-color': 'rgb(20, 20, 20)' }, { 'background-color': 'rgb(20, 20, 20)' }))).toEqual([5])
  })

  it('blends a translucent outline over the adjacent background', () => {
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgba(0, 0, 0, 0.2)' }))).toEqual([5])
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '2px', 'outline-color': 'rgba(0, 0, 0, 0.9)' }))).toEqual([])
  })

  it('an outline under 1px does not count', () => {
    expect(flagged(focus({ 'outline-style': 'solid', 'outline-width': '0.5px', 'outline-color': 'rgb(0, 0, 0)' }))).toEqual([5])
  })

  it('Chromium quirk: outline-style none ignores width, colour and offset deltas', () => {
    expect(flagged(focus({ 'outline-style': 'none', 'outline-width': '3px', 'outline-color': 'rgb(0, 0, 0)', 'outline-offset': '1px' }, { 'outline-offset': '0px' }))).toEqual([5])
  })

  it('does not flag a box-shadow change at 3:1 against the adjacent background', () => {
    expect(flagged(focus({ 'box-shadow': 'rgb(0, 0, 0) 0px 0px 0px 3px' }))).toEqual([])
  })

  it('flags a faint, transparent or unchanged box-shadow', () => {
    expect(flagged(focus({ 'box-shadow': 'rgb(230, 230, 230) 0px 0px 0px 3px' }))).toEqual([5])
    expect(flagged(focus({ 'box-shadow': 'rgba(0, 0, 0, 0) 0px 0px 0px 3px' }))).toEqual([5])
    expect(flagged(focus({ 'box-shadow': 'rgb(0, 0, 0) 0px 0px 0px 3px' }, { 'box-shadow': 'rgb(0, 0, 0) 0px 0px 0px 3px' }))).toEqual([5])
  })

  it('takes the best colour of a multi-part box-shadow', () => {
    expect(flagged(focus({ 'box-shadow': 'rgb(230, 230, 230) 0px 0px 0px 1px, rgb(0, 0, 0) 0px 0px 0px 3px' }))).toEqual([])
  })

  it('does not flag a background-color change of 3:1 or more between before and after', () => {
    expect(flagged(focus({ 'background-color': 'rgb(0, 0, 0)' }, { 'background-color': 'rgb(255, 255, 255)' }))).toEqual([])
  })

  it('flags a small background-color change', () => {
    expect(flagged(focus({ 'background-color': 'rgb(240, 240, 240)' }, { 'background-color': 'rgb(255, 255, 255)' }))).toEqual([5])
  })

  it('does not flag a painted border whose colour changes by 3:1 or more', () => {
    const painted = { 'border-style': 'solid', 'border-width': '2px' }
    expect(flagged(focus({ ...painted, 'border-color': 'rgb(0, 0, 0)' }, { ...painted, 'border-color': 'rgb(255, 255, 255)' }))).toEqual([])
  })

  it('a border-color change does not count when no border is painted (style none or width 0)', () => {
    const colours = { 'border-color': 'rgb(0, 0, 0)' }
    const was = { 'border-color': 'rgb(255, 255, 255)' }
    expect(flagged(focus({ ...colours, 'border-style': 'none', 'border-width': '2px' }, was))).toEqual([5])
    expect(flagged(focus({ ...colours, 'border-style': 'solid', 'border-width': '0px' }, was))).toEqual([5])
  })

  it('a border painted on one side only counts when that side changes', () => {
    const after = { 'border-style': 'none none solid none', 'border-width': '0px 0px 3px 0px', 'border-color': 'rgb(0, 0, 0) rgb(0, 0, 0) rgb(0, 0, 0) rgb(0, 0, 0)' }
    const before = { 'border-style': 'none none solid none', 'border-width': '0px 0px 3px 0px', 'border-color': 'rgb(255, 255, 255) rgb(255, 255, 255) rgb(255, 255, 255) rgb(255, 255, 255)' }
    expect(flagged(focus(after, before))).toEqual([])
  })

  it('a text-colour change of 3:1 or more counts as a visible indicator', () => {
    expect(flagged(focus({ color: 'rgb(0, 0, 0)' }, { color: 'rgb(255, 255, 255)' }))).toEqual([])
  })

  it('a text-colour shift under 3:1 does not count (a:focus{outline:none;color:#4f4f4f} on #555 is an Invisible Wanderer)', () => {
    expect(flagged(focus({ color: 'rgb(79, 79, 79)' }, { color: 'rgb(85, 85, 85)' }))).toEqual([5])
  })

  it('an added underline counts, and so does a changed decoration style', () => {
    expect(flagged(focus({ 'text-decoration-line': 'underline' }, { 'text-decoration-line': 'none' }))).toEqual([])
    expect(flagged(focus({ 'text-decoration-line': 'underline', 'text-decoration-style': 'wavy' }, { 'text-decoration-line': 'underline', 'text-decoration-style': 'solid' }))).toEqual([])
  })

  it('a text-decoration colour or thickness change alone is not an indicator', () => {
    expect(flagged(focus({ 'text-decoration-thickness': '3px' }, { 'text-decoration-thickness': 'auto' }))).toEqual([5])
    expect(flagged(focus({ 'text-decoration-line': 'none', 'text-decoration-color': 'rgb(9, 9, 9)' }, {}))).toEqual([5])
  })

  it('reads the combined text-decoration of older captures: the colour part is ignored', () => {
    const legacy = (before: string, after: string): TabStep => {
      const s = focus({ 'text-decoration': after }, { 'text-decoration': before })
      for (const side of [s.focusSnapshot.before, s.focusSnapshot.after]) {
        delete side['text-decoration-line']
        delete side['text-decoration-style']
      }
      return s
    }
    expect(flagged(legacy('none solid rgb(85, 85, 85)', 'none solid rgb(79, 79, 79)'))).toEqual([5])
    expect(flagged(legacy('none solid rgb(0, 0, 0)', 'underline solid rgb(0, 0, 0)'))).toEqual([])
  })
  it('an unreadable baseline never counts as a change', () => {
    const noBaseline = step(5, { 'text-decoration-line': 'underline' }, { baselineUnavailable: true })
    noBaseline.focusSnapshot.before = {}
    expect(flagged(noBaseline)).toEqual([5])
  })

  it('a step on a frame whose inner focus cannot be read is never a haunting', () => {
    const raw = baseRaw({
      domNodes: { ...baseRaw().domNodes, 5: dom('iframe', 2, {}, '<iframe title="Cookie">') },
      tabWalkResult: walk({ steps: [focus({})] }),
    })
    expect(detectInvisibleWanderer(raw)).toEqual([])
  })

  it('a step flagged innerFocusUnreadable (a closed shadow host) is never a haunting', () => {
    expect(flagged(step(5, {}, { innerFocusUnreadable: true }))).toEqual([])
  })

  it('a step with a cdpError produces no haunting', () => {
    expect(flagged(step(5, {}, { cdpError: true }))).toEqual([])
  })

  it('a step with an empty backendDOMNodeId produces no haunting', () => {
    expect(flagged(step('', {}))).toEqual([])
  })

  it('a node visited twice in the walk produces one haunting', () => {
    expect(flagged(focus({}), focus({}))).toEqual([5])
  })

  it('evaluates the first readable step: a cdpError step does not use up the element', () => {
    expect(flagged(step(5, {}, { cdpError: true }), focus({}))).toEqual([5])
  })

  it('maps to 2.4.7 with 2.4.13 as guidance (never 2.4.11)', () => {
    const [h] = detectInvisibleWanderer(page(focus({})))
    expect(h?.wcag.map((c) => c.id)).toEqual(['2.4.7'])
    expect(h?.guidance?.id).toBe('2.4.13')
    expect(h?.speech).toBeUndefined()
  })

  it('reports several elements, one each', () => {
    expect(flagged(focus({}, {}, 5), focus({}, {}, 6), focus({ 'outline-style': 'solid', 'outline-color': 'rgb(0, 0, 0)' }, {}, 7))).toEqual([5, 6])
  })
})
