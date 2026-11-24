import { describe, expect, it } from 'vitest'
import { ax, axId, baseRaw, BODY_ID, dom, signal, step, walk } from '../../../tests/classifier/builders.js'
import type { RawAudit } from '../../types.js'
import { detectLostSoul } from './lost-soul.js'

const page = (nodes: RawAudit['domNodes'], rest: Partial<RawAudit>): RawAudit => baseRaw({ domNodes: { ...baseRaw().domNodes, ...nodes }, ...rest })

describe('detectLostSoul', () => {
  it('flags a div with a click handler that is not in the Tab walk', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5)], axNodes: [ax({ id: 5, role: 'generic' })] })
    const found = detectLostSoul(raw)
    expect(found.map((h) => h.nodeIds)).toEqual([[5]])
    expect(found[0]?.wcag.map((c) => c.id)).toEqual(['2.1.1', '4.1.2'])
    expect(found[0]?.speech).toBeUndefined()
  })

  it('accepts any of click, mousedown, pointerdown, pointerup', () => {
    for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup'] as const) {
      expect(detectLostSoul(page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5, 'div', [type])] }))).toHaveLength(1)
    }
  })

  it('does not flag an element the Tab walk reached', () => {
    const raw = page({ 5: dom('div', BODY_ID, { tabindex: '0' }) }, { eventListenerSignals: [signal(5)], tabWalkResult: walk({ steps: [step(5)] }) })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('does not flag a native button (or input, select, textarea, summary)', () => {
    for (const tag of ['button', 'input', 'select', 'textarea', 'summary']) {
      expect(detectLostSoul(page({ 5: dom(tag, BODY_ID) }, { eventListenerSignals: [signal(5, tag)] })), tag).toEqual([])
    }
  })

  it('does not flag an element with an interactive ARIA role', () => {
    const viaAttr = page({ 5: dom('div', BODY_ID, { role: 'button' }) }, { eventListenerSignals: [signal(5)] })
    const viaAx = page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5)], axNodes: [ax({ id: 5, role: 'tab' })] })
    expect(detectLostSoul(viaAttr)).toEqual([])
    expect(detectLostSoul(viaAx)).toEqual([])
  })

  it('reports only the outermost of nested clickable divs', () => {
    const raw = page({ 5: dom('div', BODY_ID), 6: dom('div', 5), 7: dom('div', 6) }, { eventListenerSignals: [signal(5), signal(6), signal(7)] })
    expect(detectLostSoul(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })

  it('does not flag a clickable inside a button', () => {
    const raw = page({ 4: dom('button', BODY_ID), 5: dom('span', 4) }, { eventListenerSignals: [signal(5, 'span')] })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('does not flag a clickable that contains a button', () => {
    const raw = page({ 5: dom('div', BODY_ID), 6: dom('button', 5) }, { eventListenerSignals: [signal(5)] })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('does not flag a clickable that contains a link by AX role', () => {
    const raw = page(
      { 5: dom('div', BODY_ID), 6: dom('a', 5, { href: '#' }) },
      { eventListenerSignals: [signal(5)], axNodes: [ax({ id: 5, role: 'generic', childIds: [axId(6)] }), ax({ id: 6, role: 'link', name: 'x', parentId: axId(5) })] }
    )
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('<a onclick> without href that is not in the Tab walk is a Lost Soul', () => {
    const raw = page({ 5: dom('a', BODY_ID) }, { eventListenerSignals: [signal(5, 'a')], axNodes: [ax({ id: 5, role: 'generic' })] })
    expect(detectLostSoul(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })

  it('<a href> with a click handler is native', () => {
    const raw = page({ 5: dom('a', BODY_ID, { href: '#' }) }, { eventListenerSignals: [signal(5, 'a')], axNodes: [ax({ id: 5, role: 'link', name: 'x' })] })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('an element with a click listener and no AX node is a Lost Soul', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5)], axNodes: [] })
    expect(detectLostSoul(raw)).toHaveLength(1)
  })

  it('an editable element is native', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5)], axNodes: [ax({ id: 5, role: 'textbox', props: { editable: 'richtext' } })] })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('ignores signals without a click-like event and signals without an id', () => {
    const raw = page({ 5: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5, 'div', []), signal(0)] })
    expect(detectLostSoul(raw)).toEqual([])
  })

  it('reports siblings separately', () => {
    const raw = page({ 5: dom('div', BODY_ID), 6: dom('div', BODY_ID) }, { eventListenerSignals: [signal(5), signal(6)] })
    expect(detectLostSoul(raw).map((h) => h.nodeIds[0])).toEqual([5, 6])
  })
})
