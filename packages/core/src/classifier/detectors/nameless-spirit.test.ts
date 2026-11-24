import { describe, expect, it } from 'vitest'
import { ax, axId, baseRaw, BODY_ID, dom } from '../../../tests/classifier/builders.js'
import { ROLE_LABEL_MAP } from '../speech.js'
import { detectNamelessSpirit, NAMELESS_ROLES } from './nameless-spirit.js'

const ROLES = [...NAMELESS_ROLES]

describe('detectNamelessSpirit', () => {
  it('recognises exactly the 14 interactive roles', () => {
    expect(ROLES).toHaveLength(14)
    for (const role of ROLES) {
      const raw = baseRaw({ axNodes: [ax({ id: 5, role })] })
      const found = detectNamelessSpirit(raw)
      expect(found, role).toHaveLength(1)
      expect(found[0]?.speech?.startsWith(ROLE_LABEL_MAP[role] ?? role), role).toBe(true) // the role, plus a state word for checkable roles
      expect(found[0]?.nodeIds).toEqual([5])
      expect(found[0]?.type).toBe('NamelessSpirit')
    }
  })

  it('does not flag non-interactive roles', () => {
    const raw = baseRaw({ axNodes: ['heading', 'generic', 'image', 'textbox', 'StaticText', 'list'].map((role, i) => ax({ id: 5 + i, role })) })
    expect(detectNamelessSpirit(raw)).toEqual([])
  })

  it('does not flag a named control', () => {
    for (const role of ROLES) expect(detectNamelessSpirit(baseRaw({ axNodes: [ax({ id: 5, role, name: 'Go' })] })), role).toEqual([])
  })

  it('flags a whitespace-only name', () => {
    expect(detectNamelessSpirit(baseRaw({ axNodes: [ax({ id: 5, role: 'button', name: '  \t ' })] }))).toHaveLength(1)
  })

  it('skips ignored nodes and nodes without a DOM id', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button', ignored: true }), { ...ax({ id: 6, role: 'button' }), backendDOMNodeId: 0 }] })
    expect(detectNamelessSpirit(raw)).toEqual([])
  })

  it('speaks only the role', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button' }), ax({ id: 6, role: 'link' })] })
    expect(detectNamelessSpirit(raw).map((h) => h.speech)).toEqual(['button', 'link'])
  })

  it('maps to 4.1.2, plus 2.4.4 for a link', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button' }), ax({ id: 6, role: 'link' })] })
    const [button, link] = detectNamelessSpirit(raw)
    expect(button?.wcag.map((c) => c.id)).toEqual(['4.1.2'])
    expect(link?.wcag.map((c) => c.id)).toEqual(['4.1.2', '2.4.4'])
  })

  it('adds 1.1.1 when the control holds only an image', () => {
    const raw = baseRaw({
      axNodes: [ax({ id: 5, role: 'button' })],
      domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID), 6: dom('svg', 5) },
    })
    expect(detectNamelessSpirit(raw)[0]?.wcag.map((c) => c.id)).toEqual(['4.1.2', '1.1.1'])
    const withText = baseRaw({
      axNodes: [ax({ id: 5, role: 'button' })],
      domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID), 6: dom('svg', 5), 7: dom('#text', 5) },
    })
    expect(detectNamelessSpirit(withText)[0]?.wcag.map((c) => c.id)).toEqual(['4.1.2'])
  })

  it('reports one instance per element, with its snippet and a stable id', () => {
    const raw = baseRaw({
      axNodes: [ax({ id: 5, role: 'button' }), { ...ax({ id: 5, role: 'button' }), nodeId: 'dup' }],
      domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID, { class: 'x' }) },
    })
    const found = detectNamelessSpirit(raw)
    expect(found).toHaveLength(1)
    expect(found[0]?.htmlSnippet).toBe('<button class="x">')
    expect(detectNamelessSpirit(raw)[0]?.id).toBe(found[0]?.id)
  })

  it('uses the tree even when parent links exist', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 4, role: 'navigation', childIds: [axId(5)] }), ax({ id: 5, role: 'link', parentId: axId(4) })] })
    expect(detectNamelessSpirit(raw).map((h) => h.nodeIds)).toEqual([[5]])
  })
})
