import { describe, expect, it } from 'vitest'
import { baseRaw, step, walk } from '../../../tests/classifier/builders.js'
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

  it('does not flag a border-color change of 3:1 or more', () => {
    expect(flagged(focus({ 'border-color': 'rgb(0, 0, 0)' }, { 'border-color': 'rgb(255, 255, 255)' }))).toEqual([])
  })

  it('does not flag a text-decoration change', () => {
    expect(flagged(focus({ 'text-decoration': 'underline solid rgb(0, 0, 0)' }, { 'text-decoration': 'none solid rgb(0, 0, 0)' }))).toEqual([])
  })

  it('an unreadable baseline never counts as a change', () => {
    const noBaseline = step(5, { 'text-decoration': 'underline solid rgb(0, 0, 0)' }, { baselineUnavailable: true })
    noBaseline.focusSnapshot.before = {}
    expect(flagged(noBaseline)).toEqual([5])
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
