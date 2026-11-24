import { describe, expect, it } from 'vitest'
import { ax, axId, baseRaw, BODY_ID, dom, mapping } from '../../../tests/classifier/builders.js'
import type { RawAudit } from '../../types.js'
import { detectTheVeiled } from './veiled.js'

const page = (nodes: RawAudit['domNodes'], rows: RawAudit['domAxMapping'], rest: Partial<RawAudit> = {}): RawAudit =>
  baseRaw({ domNodes: { ...baseRaw().domNodes, ...nodes }, domAxMapping: rows, ...rest })

describe('detectTheVeiled', () => {
  it('flags a focusable inside aria-hidden: one haunting with nodeIds [parent, focusable]', () => {
    const raw = page(
      { 5: dom('div', BODY_ID, { 'aria-hidden': 'true' }), 6: dom('a', 5, { href: '#' }) },
      [
        mapping(5, 'div', { hasAxNode: false, ariaHidden: true, containsFocusable: true }),
        mapping(6, 'a', { hasAxNode: false, ariaHidden: true, isFocusable: true, hasVisibleText: true }),
      ]
    )
    const found = detectTheVeiled(raw)
    expect(found).toHaveLength(1)
    expect(found[0]?.nodeIds).toEqual([5, 6])
    expect(found[0]?.wcag.map((c) => c.id)).toEqual(['1.3.1', '4.1.2'])
    expect(found[0]?.speech).toBeUndefined()
  })

  it('flags visible text under aria-hidden: one haunting with nodeIds [parent]', () => {
    const raw = page({ 5: dom('div', BODY_ID, { 'aria-hidden': 'true' }) }, [mapping(5, 'div', { hasAxNode: false, ariaHidden: true, hasVisibleText: true })])
    expect(detectTheVeiled(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })

  it('<div aria-hidden="true"><p>text</p><a href>…</a></div> is exactly one haunting with nodeIds [div, a]', () => {
    const raw = page(
      { 5: dom('div', BODY_ID, { 'aria-hidden': 'true' }), 6: dom('p', 5), 7: dom('a', 5, { href: '#' }) },
      [
        mapping(5, 'div', { hasAxNode: false, ariaHidden: true, hasVisibleText: true, containsFocusable: true }),
        mapping(6, 'p', { hasAxNode: false, ariaHidden: true, hasVisibleText: true }),
        mapping(7, 'a', { hasAxNode: false, ariaHidden: true, isFocusable: true, hasVisibleText: true }),
      ]
    )
    const found = detectTheVeiled(raw)
    expect(found).toHaveLength(1)
    expect(found[0]?.nodeIds).toEqual([5, 7])
  })

  it('does not flag <img alt=""> with role=presentation', () => {
    const raw = page({ 5: dom('img', BODY_ID, { alt: '', role: 'presentation' }) }, [mapping(5, 'img', { hasAxNode: false, isPresentational: true })], {
      axNodes: [ax({ id: 5, role: 'presentation', ignored: true, ignoredReasons: ['presentationalRole'] })],
    })
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('does not flag a decorative div with role=none and no text or focusable content', () => {
    const raw = page({ 5: dom('div', BODY_ID, { role: 'none' }) }, [mapping(5, 'div', { hasAxNode: false, isPresentational: true })])
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('does not flag decorative aria-hidden icons (no text, no focusable)', () => {
    const raw = page({ 5: dom('svg', BODY_ID, { 'aria-hidden': 'true' }) }, [mapping(5, 'svg', { hasAxNode: false, ariaHidden: true })])
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('never flags rows that are neither aria-hidden nor presentational', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, [mapping(5, 'div', { hasAxNode: false, hasVisibleText: true, containsFocusable: true })])
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('does not flag content the AX tree exposes', () => {
    const raw = page({ 5: dom('div', BODY_ID, { 'aria-hidden': 'true' }) }, [mapping(5, 'div', { hasAxNode: true, ariaHidden: true, hasVisibleText: true })])
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('role=presentation with text that the AX tree still exposes is not Veiled', () => {
    const raw = page(
      { 5: dom('div', BODY_ID, { role: 'presentation' }), 6: dom('#text', 5) },
      [mapping(5, 'div', { hasAxNode: false, isPresentational: true, hasVisibleText: true })],
      { axNodes: [ax({ id: 5, role: 'presentation', ignored: true, childIds: [axId(6)] }), ax({ id: 6, role: 'StaticText', name: 'Hello', parentId: axId(5) })] }
    )
    expect(detectTheVeiled(raw)).toEqual([])
  })

  it('role=presentation whose text is not exposed is Veiled', () => {
    const raw = page({ 5: dom('div', BODY_ID, { role: 'presentation' }) }, [mapping(5, 'div', { hasAxNode: false, isPresentational: true, hasVisibleText: true })])
    expect(detectTheVeiled(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })

  it('reports separate hidden roots separately', () => {
    const raw = page(
      { 5: dom('div', BODY_ID, { 'aria-hidden': 'true' }), 6: dom('span', BODY_ID, { 'aria-hidden': 'true' }) },
      [mapping(5, 'div', { hasAxNode: false, ariaHidden: true, hasVisibleText: true }), mapping(6, 'span', { hasAxNode: false, ariaHidden: true, hasVisibleText: true })]
    )
    expect(detectTheVeiled(raw).map((h) => h.nodeIds[0])).toEqual([5, 6])
  })

  it('finds the root through the AX ignoredReasons when the DOM attributes are not recorded', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, [mapping(5, 'div', { hasAxNode: false, ariaHidden: true, hasVisibleText: true })], {
      axNodes: [ax({ id: 5, role: 'generic', ignored: true, ignoredReasons: ['ariaHiddenElement'] })],
    })
    expect(detectTheVeiled(raw)).toHaveLength(1)
  })
})
