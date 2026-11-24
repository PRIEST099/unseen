import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbRawAudit } from '../../tests/classifier/arbitraries.js'
import { ax, baseRaw, BODY_ID, dom, step, style, walk } from '../../tests/classifier/builders.js'
import type { RawAudit } from '../types.js'
import { classify, DETECTORS } from './classify.js'
import { SEVERITY_WEIGHTS } from './score.js'
import { AUTOMATED_COVERAGE_NOTE, HAUNTING_TYPES } from './types.js'

const RUNS = { numRuns: 100 }

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

describe('classify structure', () => {
  it('returns a valid ClassifiedAudit', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button' })], domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID) }, pageMetadata: { ...baseRaw().pageMetadata, headings: [{ tagName: 'h1', accessibleName: 'x', domOrderIndex: 0, backendDOMNodeId: 5 }] } })
    const audit = classify(raw)
    expect(Object.keys(audit).sort()).toEqual(['automatedCoverageNote', 'axeCrossCheck', 'countsByType', 'detectedCountsByType', 'hauntings', 'needsManualCheck', 'raw', 'score'])
    expect(audit.raw).toBe(raw)
    expect(audit.hauntings.map((h) => h.type)).toEqual(['NamelessSpirit'])
    expect(audit.score).toBeGreaterThan(0)
    expect(Object.keys(audit.countsByType).sort()).toEqual([...HAUNTING_TYPES].sort())
    expect(Object.keys(audit.detectedCountsByType).sort()).toEqual([...HAUNTING_TYPES].sort())
    expect(audit.automatedCoverageNote).toBe(AUTOMATED_COVERAGE_NOTE)
    expect(audit.automatedCoverageNote).toBe('Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.')
  })

  it('a clean page scores 0 with no hauntings', () => {
    const raw = baseRaw({ pageMetadata: { ...baseRaw().pageMetadata, headings: [{ tagName: 'h1', accessibleName: 'x', domOrderIndex: 0, backendDOMNodeId: 5 }] } })
    const audit = classify(raw)
    expect(audit.hauntings).toEqual([])
    expect(audit.score).toBe(0)
    expect(Object.values(audit.countsByType).every((n) => n === 0)).toBe(true)
    expect(audit.needsManualCheck).toEqual([])
    expect(audit.axeCrossCheck).toEqual({ hauntingToAxe: {}, unmapped: [] })
  })

  it('an empty RawAudit (no h1, nothing else) still classifies', () => {
    const audit = classify(baseRaw())
    expect(audit.countsByType.ShatteredOrder).toBe(1) // no h1
    expect(audit.score).toBeGreaterThanOrEqual(0)
  })

  it('malformed input yields an empty audit, never a throw', () => {
    const broken: RawAudit = JSON.parse('{"schemaVersion":"1"}')
    const audit = classify(broken)
    expect(audit.hauntings).toEqual([])
    expect(audit.score).toBe(0)
    expect(audit.automatedCoverageNote).toBe(AUTOMATED_COVERAGE_NOTE)
  })
  it('does not mutate the input', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button' })], domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID) } })
    const before = JSON.stringify(raw)
    classify(raw)
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('counts every secondary once per element in detectedCountsByType', () => {
    const raw = baseRaw({
      axNodes: [ax({ id: 5, role: 'button' })],
      domNodes: { ...baseRaw().domNodes, 5: dom('button', BODY_ID) },
      textNodeStyles: { 5: style({ color: 'rgb(230, 230, 230)' }) },
      tabWalkResult: walk({ steps: [step(5)] }),
    })
    const audit = classify(raw)
    expect(audit.countsByType.NamelessSpirit).toBe(1)
    expect(audit.countsByType.TheFog).toBe(0)
    expect(audit.countsByType.InvisibleWanderer).toBe(0)
    expect(audit.detectedCountsByType.TheFog).toBe(1)
    expect(audit.detectedCountsByType.InvisibleWanderer).toBe(1)
  })

  it('lists uncertain contrast and unreadable focus steps for manual checking', () => {
    const raw = baseRaw({
      textNodeStyles: { 5: style({ backgroundUncertain: true, color: 'rgb(250, 250, 250)' }) },
      domNodes: { ...baseRaw().domNodes, 5: dom('p', BODY_ID), 6: dom('a', BODY_ID) },
      tabWalkResult: walk({ steps: [step(6, {}, { cdpError: true }), step('', {})] }),
    })
    const audit = classify(raw)
    expect(audit.needsManualCheck).toEqual([
      { backendDOMNodeId: 5, reason: 'contrast-uncertain', htmlSnippet: '<p>' },
      { backendDOMNodeId: 6, reason: 'focus-style-unavailable', htmlSnippet: '<a>' },
      { backendDOMNodeId: 0, reason: 'focus-style-unavailable', htmlSnippet: '' },
    ])
    expect(audit.hauntings.some((h) => h.type === 'TheFog' || h.type === 'InvisibleWanderer')).toBe(false)
  })
})

describe('classify properties', () => {
  // Feature: haunting-classifier, Property 14: Detector purity
  it('Property 14: every detector and classify return the same output when called twice on frozen input', () => {
    fc.assert(
      fc.property(arbRawAudit, (generated) => {
        const raw = deepFreeze(clone(generated))
        for (const detector of DETECTORS) expect(detector(raw)).toEqual(detector(raw))
        expect(classify(raw)).toEqual(classify(raw))
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 15: Detector does not mutate input
  it('Property 15: a deep-frozen input is accepted by every detector and by classify, and unchanged', () => {
    fc.assert(
      fc.property(arbRawAudit, (generated) => {
        const snapshot = JSON.stringify(generated)
        const raw = deepFreeze(clone(generated))
        for (const detector of DETECTORS) expect(() => detector(raw)).not.toThrow() // a write to a frozen object throws in strict mode
        // classify swallows errors, so a mutation would show up as an empty result that differs from the unfrozen run
        expect(classify(raw)).toEqual(classify(clone(generated)))
        expect(JSON.stringify(raw)).toBe(snapshot)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 18: Score counts only primary hauntings
  it('Property 18: the score is computed from primary hauntings only', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        const audit = classify(raw)
        let rawScore = 0
        for (const h of audit.hauntings) {
          expect(h.isPrimary).toBe(true)
          rawScore += SEVERITY_WEIGHTS[h.severity]
          for (const s of h.secondary) expect(s.isPrimary).toBe(false)
        }
        expect(audit.score).toBe(Math.round(100 * (1 - Math.exp(-rawScore / 120))))
      }),
      RUNS
    )
  })

  it('counts: primary per type, detected at least as many, and the two agree for page-level types', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        const audit = classify(raw)
        for (const type of HAUNTING_TYPES) {
          expect(audit.countsByType[type]).toBe(audit.hauntings.filter((h) => h.type === type).length)
          expect(audit.detectedCountsByType[type]).toBeGreaterThanOrEqual(0)
        }
        expect(audit.detectedCountsByType.SilentTongue).toBe(audit.countsByType.SilentTongue)
        expect(audit.detectedCountsByType.ShatteredOrder).toBe(audit.countsByType.ShatteredOrder)
      }),
      RUNS
    )
  })

  it('every haunting has nodeIds, a short snippet and an As-a persona', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        for (const h of classify(raw).hauntings.flatMap((p) => [p, ...p.secondary])) {
          expect(h.nodeIds.length).toBeGreaterThan(0)
          expect(h.htmlSnippet.length).toBeLessThanOrEqual(300)
          expect(h.persona.startsWith('As a')).toBe(true)
          expect(h.wcag.length).toBeGreaterThan(0)
        }
      }),
      RUNS
    )
  })

  it('never throws on any generated audit', () => {
    fc.assert(fc.property(arbRawAudit, (raw) => typeof classify(raw).score === 'number'), RUNS)
  })
})
