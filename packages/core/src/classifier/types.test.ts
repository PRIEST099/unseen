import { describe, expect, it } from 'vitest'
import type { RawAudit } from '../types.js'
import { DETECTORS } from './classify.js'
import type { DetectorFunction, UnclassifiedHaunting } from './types.js'
import { HAUNTING_TYPES } from './types.js'
import { ALL_WCAG } from './wcag.js'
import { detectNamelessSpirit } from './detectors/nameless-spirit.js'

describe('classifier types', () => {
  it('DetectorFunction is (raw: RawAudit) => UnclassifiedHaunting[]', () => {
    const detector: DetectorFunction = detectNamelessSpirit
    const check: (raw: RawAudit) => UnclassifiedHaunting[] = detector
    expect(typeof check).toBe('function')
    expect(detector.length).toBe(1)
  })

  it('there is one detector per haunting type', () => {
    expect(DETECTORS).toHaveLength(10)
    expect(HAUNTING_TYPES).toHaveLength(10)
    expect(new Set(HAUNTING_TYPES).size).toBe(10)
  })

  it('exports the 12 WCAG criteria, all well formed', () => {
    expect(ALL_WCAG).toHaveLength(12)
    expect(new Set(ALL_WCAG.map((c) => c.id)).size).toBe(12)
    for (const c of ALL_WCAG) {
      expect(c.id).toMatch(/^\d\.\d\.\d{1,2}$/)
      expect(['A', 'AA', 'AAA']).toContain(c.level)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.url.startsWith('https://www.w3.org/WAI/WCAG22/Understanding/')).toBe(true)
    }
  })

  it('2.4.13 is the AAA guidance criterion and 2.4.11 is not used', () => {
    expect(ALL_WCAG.find((c) => c.id === '2.4.13')?.level).toBe('AAA')
    expect(ALL_WCAG.some((c) => c.id === '2.4.11')).toBe(false)
  })
})
