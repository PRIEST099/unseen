import { describe, expect, it } from 'vitest'
import { ax, baseRaw, BODY_ID, dom, style } from '../../../tests/classifier/builders.js'
import type { RawAudit } from '../../types.js'
import { detectTheFog } from './fog.js'

const page = (id: number, s: ReturnType<typeof style>, extra: Partial<RawAudit> = {}): RawAudit =>
  baseRaw({ textNodeStyles: { [id]: s }, domNodes: { ...baseRaw().domNodes, [id]: dom('p', BODY_ID) }, ...extra })

describe('detectTheFog', () => {
  it('flags normal text below 4.5:1', () => {
    const found = detectTheFog(page(5, style({ color: 'rgb(119, 119, 119)', backgroundColor: 'rgb(255, 255, 255)' }))) // 4.48:1
    expect(found).toHaveLength(1)
    expect(found[0]?.explanation).toContain('4.48:1')
    expect(found[0]?.wcag.map((c) => c.id)).toEqual(['1.4.3'])
    expect(found[0]?.speech).toBeUndefined()
  })

  it('accepts normal text at 4.5:1 or above', () => {
    expect(detectTheFog(page(5, style({ color: 'rgb(118, 118, 118)' })))).toEqual([]) // 4.54:1
    expect(detectTheFog(page(5, style({ color: 'rgb(0, 0, 0)' })))).toEqual([])
  })

  it('uses 3:1 for large text', () => {
    const grey = style({ color: 'rgb(140, 140, 140)', isLargeText: true }) // 3.4:1
    expect(detectTheFog(page(5, grey))).toEqual([])
    expect(detectTheFog(page(5, { ...grey, isLargeText: false }))).toHaveLength(1)
    expect(detectTheFog(page(5, style({ color: 'rgb(170, 170, 170)', isLargeText: true })))).toHaveLength(1) // 2.3:1
  })

  it('skips text whose background is uncertain', () => {
    expect(detectTheFog(page(5, style({ color: 'rgb(250, 250, 250)', backgroundUncertain: true })))).toEqual([])
  })

  it('skips disabled text (attribute, ancestor, or AX disabled)', () => {
    const faint = style({ color: 'rgb(200, 200, 200)' })
    expect(detectTheFog(page(5, faint, { domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID, { disabled: '' }) } }))).toEqual([])
    const nested = baseRaw({
      textNodeStyles: { 6: faint },
      domNodes: { ...baseRaw().domNodes, 5: dom('fieldset', BODY_ID, { disabled: '' }), 6: dom('span', 5) },
    })
    expect(detectTheFog(nested)).toEqual([])
    expect(detectTheFog(page(5, faint, { axNodes: [ax({ id: 5, role: 'button', props: { disabled: true } })] }))).toEqual([])
  })

  it('skips decorative text (role none or presentation)', () => {
    const faint = style({ color: 'rgb(200, 200, 200)' })
    for (const role of ['none', 'presentation']) {
      expect(detectTheFog(page(5, faint, { domNodes: { ...baseRaw().domNodes, 5: dom('span', BODY_ID, { role }) } }))).toEqual([])
    }
  })

  it('skips colours it cannot parse', () => {
    expect(detectTheFog(page(5, style({ color: 'oklch(0.9 0 0)' })))).toEqual([])
    expect(detectTheFog(page(5, style({ backgroundColor: 'rgba(0, 0, 0, 0.5)' })))).toEqual([])
  })

  it('blends a translucent text colour over the background', () => {
    expect(detectTheFog(page(5, style({ color: 'rgba(0, 0, 0, 0.3)' })))).toHaveLength(1)
    expect(detectTheFog(page(5, style({ color: 'rgba(0, 0, 0, 0.9)' })))).toEqual([])
  })

  it('deeper contrast deficits still produce one instance per element', () => {
    const raw = baseRaw({
      textNodeStyles: { 5: style({ color: 'rgb(255, 255, 255)' }), 6: style({ color: 'rgb(250, 250, 250)' }) },
      domNodes: { ...baseRaw().domNodes, 5: dom('p', BODY_ID), 6: dom('p', BODY_ID) },
    })
    expect(detectTheFog(raw).map((h) => h.nodeIds)).toEqual([[5], [6]])
  })
})
