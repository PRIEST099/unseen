import { describe, expect, it } from 'vitest'
import { baseRaw, BODY_ID } from '../../../tests/classifier/builders.js'
import type { HeadingRecord, RawAudit } from '../../types.js'
import { detectShatteredOrder } from './shattered-order.js'

const heading = (tagName: string, backendDOMNodeId: number): HeadingRecord => ({ tagName, accessibleName: tagName, domOrderIndex: 0, backendDOMNodeId })

function page(headings: HeadingRecord[], hasMainLandmark = true): RawAudit {
  const raw = baseRaw()
  return { ...raw, pageMetadata: { ...raw.pageMetadata, headings, hasMainLandmark } }
}

describe('detectShatteredOrder', () => {
  it('flags a page with no h1 as kind no-h1 on body', () => {
    const found = detectShatteredOrder(page([heading('h2', 20)]))
    expect(found.map((h) => h.kind)).toEqual(['no-h1'])
    expect(found[0]?.nodeIds).toEqual([BODY_ID])
  })

  it('flags h1 -> h3 as heading-skip on the later heading', () => {
    const found = detectShatteredOrder(page([heading('h1', 20), heading('h3', 21)]))
    expect(found.map((h) => h.kind)).toEqual(['heading-skip'])
    expect(found[0]?.nodeIds).toEqual([21])
    expect(found[0]?.explanation).toContain('h1 to h3')
  })

  it('flags a page with no main landmark as no-main on body', () => {
    const found = detectShatteredOrder(page([heading('h1', 20)], false))
    expect(found.map((h) => h.kind)).toEqual(['no-main'])
    expect(found[0]?.nodeIds).toEqual([BODY_ID])
  })

  it('does not flag a page with h1, a clean outline and main', () => {
    expect(detectShatteredOrder(page([heading('h1', 20), heading('h2', 21), heading('h3', 22), heading('h2', 23), heading('h1', 24)]))).toEqual([])
  })

  it('going back up or staying level is not a skip', () => {
    expect(detectShatteredOrder(page([heading('h1', 20), heading('h2', 21), heading('h2', 22), heading('h1', 23), heading('h4', 24)]))).toHaveLength(1)
  })

  it('reports each problem as its own instance, with distinct ids', () => {
    const found = detectShatteredOrder(page([heading('h2', 20), heading('h4', 21), heading('h6', 22)], false))
    expect(found.map((h) => h.kind)).toEqual(['no-h1', 'heading-skip', 'heading-skip', 'no-main'])
    expect(new Set(found.map((h) => h.id)).size).toBe(4)
    expect(found.map((h) => h.nodeIds[0])).toEqual([BODY_ID, 21, 22, BODY_ID])
  })

  it('falls back to the domAxMapping body row, and is silent when there is no body', () => {
    const raw = page([], true)
    const noBodyMeta: RawAudit = {
      ...raw,
      pageMetadata: { ...raw.pageMetadata, bodyBackendDOMNodeId: null },
      domAxMapping: [{ backendDOMNodeId: 77, tagName: 'BODY', hasAxNode: true, ariaHidden: false, isPresentational: false, isFocusable: false, hasVisibleText: false, containsFocusable: false }],
    }
    expect(detectShatteredOrder(noBodyMeta)[0]?.nodeIds).toEqual([77])
    expect(detectShatteredOrder({ ...noBodyMeta, domAxMapping: [] })).toEqual([])
  })

  it('never returns an empty nodeIds and maps to 1.3.1 and 2.4.6', () => {
    for (const h of detectShatteredOrder(page([heading('h3', 20), heading('h5', 21)], false))) {
      expect(h.nodeIds.length).toBeGreaterThan(0)
      expect(h.wcag.map((c) => c.id)).toEqual(['1.3.1', '2.4.6'])
    }
  })
})
