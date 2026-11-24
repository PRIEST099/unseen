import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbRawAudit, arbRgb } from '../../tests/classifier/arbitraries.js'
import { ax, axId, baseRaw, BODY_ID, dom } from '../../tests/classifier/builders.js'
import {
  axAncestors,
  axByBackendId,
  axDescendants,
  blend,
  domAncestors,
  domDescendants,
  fileNameFromSrc,
  filterOutermost,
  findBox,
  hasWordPhrase,
  hauntingId,
  isNativeInteractive,
  parseCssColor,
  snippet,
  winningNameSource,
  wordTokens,
} from './util.js'

const RUNS = { numRuns: 100 }

describe('hauntingId', () => {
  it('is deterministic and shaped type-8hex', () => {
    fc.assert(
      fc.property(fc.constantFrom('TheFog', 'LostSoul'), fc.nat(100000), fc.option(fc.string(), { nil: undefined }), (type, id, kind) => {
        const a = hauntingId(type, id, kind)
        expect(hauntingId(type, id, kind)).toBe(a)
        expect(a).toMatch(new RegExp(`^${type}-[0-9a-f]{8}$`))
      }),
      RUNS
    )
  })

  it('separates type, node and kind', () => {
    expect(hauntingId('TheFog', 1)).not.toBe(hauntingId('LostSoul', 1))
    expect(hauntingId('TheFog', 1)).not.toBe(hauntingId('TheFog', 2))
    expect(hauntingId('ShatteredOrder', 2, 'no-h1')).not.toBe(hauntingId('ShatteredOrder', 2, 'no-main'))
  })
})

describe('parseCssColor and blend', () => {
  it('round-trips rgb() and rgba() strings', () => {
    fc.assert(
      fc.property(arbRgb, fc.integer({ min: 0, max: 100 }), (c, pct) => {
        expect(parseCssColor(`rgb(${c.r}, ${c.g}, ${c.b})`)).toEqual({ ...c, a: 1 })
        expect(parseCssColor(`rgba(${c.r}, ${c.g}, ${c.b}, ${pct / 100})`)).toEqual({ ...c, a: pct / 100 })
        expect(parseCssColor(`rgb(${c.r} ${c.g} ${c.b} / ${pct}%)`)?.a).toBeCloseTo(pct / 100, 10)
      }),
      RUNS
    )
  })

  it('reads hex, transparent and color(srgb), and rejects other text', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseCssColor('#11223380')?.a).toBeCloseTo(128 / 255, 5)
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseCssColor('color(srgb 1 0 0 / 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
    for (const bad of ['', 'red', 'oklch(0.5 0.1 20)', 'rgb(1,2)', undefined, null]) expect(parseCssColor(bad)).toBeNull()
  })

  it('blend keeps an opaque colour, yields the background at alpha 0, and stays between the inputs', () => {
    fc.assert(
      fc.property(arbRgb, arbRgb, fc.double({ min: 0, max: 1, noNaN: true }), (c, bg, a) => {
        const back = { ...bg, a: 1 }
        expect(blend({ ...c, a: 1 }, back)).toEqual({ ...c, a: 1 })
        expect(blend({ ...c, a: 0 }, back)).toEqual(back)
        const mixed = blend({ ...c, a }, back)
        expect(mixed.a).toBeCloseTo(1, 10)
        for (const k of ['r', 'g', 'b'] as const) {
          expect(mixed[k]).toBeGreaterThanOrEqual(Math.min(c[k], bg[k]) - 1e-9)
          expect(mixed[k]).toBeLessThanOrEqual(Math.max(c[k], bg[k]) + 1e-9)
        }
      }),
      RUNS
    )
  })
})

describe('findBox, snippet', () => {
  it('findBox returns the box with that id or null', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        for (const b of raw.boundingBoxes) expect(findBox(raw.boundingBoxes, b.backendDOMNodeId)?.backendDOMNodeId).toBe(b.backendDOMNodeId)
        expect(findBox(raw.boundingBoxes, -5)).toBeNull()
      }),
      RUNS
    )
  })

  it('snippet is at most 300 chars and falls back to <element>', () => {
    const raw = baseRaw({ domNodes: { ...baseRaw().domNodes, 7: dom('div', BODY_ID, {}, 'x'.repeat(500)) } })
    expect(snippet(raw, 7)).toHaveLength(300)
    expect(snippet(raw, 999)).toBe('<element>')
    fc.assert(
      fc.property(arbRawAudit, (r) => {
        for (const key of Object.keys(r.domNodes)) expect(snippet(r, Number(key)).length).toBeLessThanOrEqual(300)
      }),
      RUNS
    )
  })
})

describe('AX and DOM traversal', () => {
  it('axByBackendId prefers a node that is not ignored', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'generic', ignored: true }), { ...ax({ id: 5, role: 'button' }), nodeId: 'other' }] })
    expect(axByBackendId(raw, 5)?.role.value).toBe('button')
    expect(axByBackendId(raw, 0)).toBeUndefined()
  })

  it('axAncestors and axDescendants follow parentId and childIds', () => {
    const raw = baseRaw({
      axNodes: [
        ax({ id: 5, role: 'main', childIds: [axId(6)] }),
        ax({ id: 6, role: 'region', parentId: axId(5), childIds: [axId(7)] }),
        ax({ id: 7, role: 'button', parentId: axId(6) }),
      ],
    })
    expect(axAncestors(raw, 7).map((n) => n.backendDOMNodeId)).toEqual([6, 5])
    expect(axDescendants(raw, 5).map((n) => n.backendDOMNodeId)).toEqual([6, 7])
    expect(axAncestors(raw, 5)).toEqual([])
  })

  it('AX traversal terminates on a cycle', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'a', parentId: axId(6), childIds: [axId(6)] }), ax({ id: 6, role: 'b', parentId: axId(5), childIds: [axId(5)] })] })
    expect(axAncestors(raw, 5).length).toBeLessThanOrEqual(2)
    expect(axDescendants(raw, 5).length).toBeLessThanOrEqual(2)
  })

  it('domAncestors and domDescendants are inverse relations', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        const ids = Object.keys(raw.domNodes).map(Number)
        for (const id of ids) {
          for (const a of domAncestors(raw, id)) expect(domDescendants(raw, a)).toContain(id)
          for (const d of domDescendants(raw, id)) expect(domAncestors(raw, d)).toContain(id)
          expect(domAncestors(raw, id)).not.toContain(id)
        }
      }),
      RUNS
    )
  })

  it('every element is below body and html', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        for (const key of Object.keys(raw.domNodes)) {
          const id = Number(key)
          if (id === 1 || id === BODY_ID) continue
          expect(domAncestors(raw, id)).toContain(BODY_ID)
        }
      }),
      RUNS
    )
  })

  it('domAncestors terminates on a parent cycle', () => {
    const raw = baseRaw({ domNodes: { 5: dom('div', 6), 6: dom('div', 5) } })
    expect(domAncestors(raw, 5)).toEqual([6])
  })
})

describe('isNativeInteractive and filterOutermost', () => {
  const raw = baseRaw({
    domNodes: {
      ...baseRaw().domNodes,
      10: dom('button', BODY_ID),
      11: dom('a', BODY_ID, { href: '#' }),
      12: dom('a', BODY_ID),
      13: dom('div', BODY_ID),
      14: dom('div', BODY_ID),
      15: dom('summary', BODY_ID),
    },
    axNodes: [ax({ id: 11, role: 'link' }), ax({ id: 12, role: 'link' }), ax({ id: 14, role: 'generic', props: { editable: 'plaintext' } })],
  })

  it('button, input, select, textarea and summary are native', () => {
    expect(isNativeInteractive(raw, 10)).toBe(true)
    expect(isNativeInteractive(raw, 15)).toBe(true)
    for (const tag of ['input', 'select', 'textarea']) {
      expect(isNativeInteractive(baseRaw({ domNodes: { 9: dom(tag, BODY_ID) } }), 9)).toBe(true)
    }
  })

  it('an a with href and AX role link is native; without href it is not', () => {
    expect(isNativeInteractive(raw, 11)).toBe(true)
    expect(isNativeInteractive(raw, 12)).toBe(false)
  })

  it('an editable element is native; a plain div is not', () => {
    expect(isNativeInteractive(raw, 14)).toBe(true)
    expect(isNativeInteractive(raw, 13)).toBe(false)
    expect(isNativeInteractive(raw, 999)).toBe(false)
  })

  it('filterOutermost keeps only ids without an ancestor in the set', () => {
    fc.assert(
      fc.property(arbRawAudit, fc.array(fc.nat(30), { maxLength: 8 }), (r, picks) => {
        const ids = Object.keys(r.domNodes).map(Number)
        const chosen = [...new Set(picks.map((p) => ids[p % ids.length] ?? 1))]
        const out = filterOutermost(r, chosen)
        const set = new Set(chosen)
        for (const id of out) {
          expect(set.has(id)).toBe(true)
          expect(domAncestors(r, id).some((a) => set.has(a))).toBe(false)
        }
        expect(filterOutermost(r, out)).toEqual(out)
      }),
      RUNS
    )
  })
})

describe('fileNameFromSrc', () => {
  it('returns the last path segment without query or hash', () => {
    expect(fileNameFromSrc('/img/logo.png?v=2#x')).toBe('logo.png')
    expect(fileNameFromSrc('https://cdn.example.com/a/b/c.svg')).toBe('c.svg')
    expect(fileNameFromSrc('logo.png')).toBe('logo.png')
    expect(fileNameFromSrc('/img/')).toBe('img')
  })

  it('is null for missing, empty and data/blob sources', () => {
    for (const s of [null, undefined, '', '   ', 'data:image/png;base64,AAAA', 'blob:http://x/1', '?v=1']) expect(fileNameFromSrc(s)).toBeNull()
  })

  it('never contains a slash, query or hash', () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z0-9._-]{1,8}$/), { minLength: 1, maxLength: 4 }), fc.stringMatching(/^[a-z0-9=&]{0,6}$/), (segments, q) => {
        const name = fileNameFromSrc(`/${segments.join('/')}?${q}#h`)
        expect(name).toBe(segments[segments.length - 1])
        expect(name).not.toMatch(/[/?#]/)
      }),
      RUNS
    )
  })
})

describe('winningNameSource', () => {
  const attr = (attribute: string, value?: string, superseded = false) => ({
    type: 'attribute',
    attribute,
    ...(value === undefined ? {} : { value: { type: 'computedString', value } }),
    ...(superseded ? { superseded: true } : {}),
  })

  it('is the first source that is not superseded and has a non-empty value', () => {
    const node = ax({ id: 5, role: 'textbox', name: 'x', sources: [attr('aria-labelledby'), attr('aria-label', '  '), attr('title', 'old', true), attr('placeholder', 'hi'), attr('title', 'later')] })
    expect(winningNameSource(node)?.attribute).toBe('placeholder')
  })

  it('is undefined when no source qualifies', () => {
    expect(winningNameSource(ax({ id: 5, role: 'textbox', sources: [attr('aria-label')] }))).toBeUndefined()
    expect(winningNameSource(ax({ id: 5, role: 'textbox' }))).toBeUndefined()
  })
})

describe('wordTokens and hasWordPhrase', () => {
  it('splits on non-alphanumerics and camelCase, lower-cases', () => {
    expect(wordTokens('add-to-cart_btn')).toEqual(['add', 'to', 'cart', 'btn'])
    expect(wordTokens('payButton2 Go')).toEqual(['pay', 'button2', 'go'])
    expect(wordTokens(undefined)).toEqual([])
  })

  it('property: every token is non-empty lower-case alphanumeric', () => {
    fc.assert(
      fc.property(fc.string(), (s) => wordTokens(s).every((w) => /^[a-z0-9]+$/.test(w))),
      RUNS
    )
  })

  it('property: a phrase of words joined by any separators is found, but never inside a longer word', () => {
    const word = fc.stringMatching(/^[a-z]{2,8}$/)
    fc.assert(
      fc.property(word, word, fc.constantFrom('-', '_', ' ', '.'), (a, b, sep) => {
        expect(hasWordPhrase(`x${sep}${a}${sep}${b}${sep}y`, `${a} ${b}`)).toBe(true)
        expect(hasWordPhrase(`x${a}${b}y`, a)).toBe(false)
      }),
      RUNS
    )
  })
})