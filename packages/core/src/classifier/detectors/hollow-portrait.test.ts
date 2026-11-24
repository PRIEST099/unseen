import { describe, expect, it } from 'vitest'
import { ax, axId, baseRaw, BODY_ID, dom } from '../../../tests/classifier/builders.js'
import type { RawAudit } from '../../types.js'
import { detectHollowPortrait } from './hollow-portrait.js'

const withDom = (nodes: RawAudit['domNodes'], rest: Partial<RawAudit>): RawAudit => baseRaw({ domNodes: { ...baseRaw().domNodes, ...nodes }, ...rest })

describe('detectHollowPortrait', () => {
  it('flags an unnamed img role', () => {
    const raw = withDom({ 5: dom('img', BODY_ID, { src: 'a.png' }) }, { axNodes: [ax({ id: 5, role: 'img' })], imgAltAttributes: { 5: null } })
    expect(detectHollowPortrait(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })

  it('treats the image role (CDP name for <img>) the same as img', () => {
    const raw = withDom({ 5: dom('img', BODY_ID) }, { axNodes: [ax({ id: 5, role: 'image' })] })
    expect(detectHollowPortrait(raw)).toHaveLength(1)
  })

  it('does not flag a named image', () => {
    const raw = withDom({ 5: dom('img', BODY_ID) }, { axNodes: [ax({ id: 5, role: 'img', name: 'Logo' })] })
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('does not flag alt=""', () => {
    const raw = withDom({ 5: dom('img', BODY_ID, { alt: '' }) }, { axNodes: [ax({ id: 5, role: 'img' })], imgAltAttributes: { 5: '' } })
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('does not flag role=presentation or role=none (not an image role in the AX tree)', () => {
    const raw = withDom(
      { 5: dom('img', BODY_ID, { role: 'presentation' }), 6: dom('img', BODY_ID, { role: 'none' }) },
      { axNodes: [ax({ id: 5, role: 'presentation', ignored: true }), ax({ id: 6, role: 'none', ignored: true })] }
    )
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('does not flag an ignored (aria-hidden) image', () => {
    const raw = withDom({ 5: dom('img', BODY_ID, { 'aria-hidden': 'true' }) }, { axNodes: [ax({ id: 5, role: 'img', ignored: true })] })
    expect(detectHollowPortrait(raw)).toEqual([])
    const stillInTree = withDom({ 5: dom('img', BODY_ID, { 'aria-hidden': 'true' }) }, { axNodes: [ax({ id: 5, role: 'img' })] })
    expect(detectHollowPortrait(stillInTree)).toEqual([])
  })

  it('flags an inline svg with role="img" and no name', () => {
    const raw = withDom({ 5: dom('svg', BODY_ID, { role: 'img' }) }, { axNodes: [ax({ id: 5, role: 'image' })] })
    expect(detectHollowPortrait(raw)).toHaveLength(1)
  })

  it('does not flag an svg without an explicit role="img"', () => {
    const raw = withDom({ 5: dom('svg', BODY_ID) }, { axNodes: [ax({ id: 5, role: 'image' })] })
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('does not flag an svg icon inside a named button', () => {
    const raw = withDom(
      { 4: dom('button', BODY_ID), 5: dom('svg', 4, { role: 'img' }) },
      { axNodes: [ax({ id: 4, role: 'button', name: 'Close', childIds: [axId(5)] }), ax({ id: 5, role: 'image', parentId: axId(4) })] }
    )
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('aria-hidden <img> as the sole content of a <button> is not a Hollow Portrait', () => {
    const raw = withDom(
      { 4: dom('button', BODY_ID), 5: dom('img', 4, { 'aria-hidden': 'true' }) },
      { axNodes: [ax({ id: 4, role: 'button', childIds: [axId(5)] }), ax({ id: 5, role: 'img', ignored: true, parentId: axId(4) })] }
    )
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('an unnamed image that is the sole content of an unnamed link is left to the Nameless Spirit', () => {
    const raw = withDom(
      { 4: dom('a', BODY_ID, { href: '#' }), 5: dom('img', 4) },
      { axNodes: [ax({ id: 4, role: 'link', childIds: [axId(5)] }), ax({ id: 5, role: 'img', parentId: axId(4) })] }
    )
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('<a href><svg></svg></a> produces no Hollow Portrait', () => {
    const raw = withDom(
      { 4: dom('a', BODY_ID, { href: '#' }), 5: dom('svg', 4, { role: 'img' }) },
      { axNodes: [ax({ id: 4, role: 'link', childIds: [axId(5)] }), ax({ id: 5, role: 'image', parentId: axId(4) })] }
    )
    expect(detectHollowPortrait(raw)).toEqual([])
  })

  it('an unnamed image next to text inside a link is still flagged', () => {
    const raw = withDom(
      { 4: dom('a', BODY_ID, { href: '#' }), 5: dom('img', 4), 6: dom('#text', 4) },
      {
        axNodes: [
          ax({ id: 4, role: 'link', name: 'Shop now', childIds: [axId(5), axId(6)] }),
          ax({ id: 5, role: 'img', parentId: axId(4) }),
          ax({ id: 6, role: 'StaticText', name: 'Shop now', parentId: axId(4) }),
        ],
      }
    )
    expect(detectHollowPortrait(raw)).toHaveLength(1)
  })

  it('speaks "unlabelled graphic, <file>" from src, without query or hash, or just "unlabelled graphic"', () => {
    const raw = withDom(
      { 5: dom('img', BODY_ID), 6: dom('img', BODY_ID) },
      { axNodes: [ax({ id: 5, role: 'img' }), ax({ id: 6, role: 'img' })], imgSrcAttributes: { 5: '/img/logo.png?v=2#x', 6: null } }
    )
    expect(detectHollowPortrait(raw).map((h) => h.speech)).toEqual(['unlabelled graphic, logo.png', 'unlabelled graphic'])
  })

  it('maps to 1.1.1 only', () => {
    const raw = withDom({ 5: dom('img', BODY_ID) }, { axNodes: [ax({ id: 5, role: 'img' })] })
    expect(detectHollowPortrait(raw)[0]?.wcag.map((c) => c.id)).toEqual(['1.1.1'])
  })
})
