import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { WCAGCriterion } from '@the-unseen/core'
import { arbHaunting, arbHauntingType, makeHaunting } from '../test-support/haunting-arbitraries'
import {
  buildKiroPrompt,
  criterionEntries,
  FALLBACK_PERSONAS,
  isSafeCriterionUrl,
  personaLine,
  relatedIssues,
} from './haunting-detail'
import { hauntingDisplayName } from './haunting-display'

function criterion(id: string, level: 'A' | 'AA' | 'AAA' = 'A'): WCAGCriterion {
  return { id, level, title: `Title ${id}`, url: `https://www.w3.org/WAI/WCAG22/Understanding/x-${id}` }
}

const arbCriterion: fc.Arbitrary<WCAGCriterion> = fc
  .constantFrom('1.1.1', '1.3.1', '1.4.3', '2.1.1', '2.1.2', '2.4.4', '2.4.7', '3.1.1', '4.1.2')
  .map((id) => criterion(id))

describe('personaLine', () => {
  it('uses the classifier persona when there is one', () => {
    expect(personaLine(makeHaunting({ persona: 'As a blind shopper using NVDA, I hear only "button".' }))).toBe(
      'As a blind shopper using NVDA, I hear only "button".',
    )
  })

  it('falls back to a per-type line starting with "As a" and never claims compliance', () => {
    fc.assert(
      fc.property(arbHauntingType, (type) => {
        const line = personaLine(makeHaunting({ type, persona: '  ' }))
        expect(line).toBe(FALLBACK_PERSONAS[type])
        expect(line.startsWith('As a ')).toBe(true)
        expect(line.toLowerCase()).not.toMatch(/compliant|accessible site|conforms/)
      }),
    )
  })
})

describe('criterionEntries', () => {
  it('lists the primary first, then supporting, then the guidance criterion', () => {
    const haunting = makeHaunting({ wcag: [criterion('2.4.7', 'AA')], guidance: criterion('2.4.13', 'AAA') })
    expect(criterionEntries(haunting).map((entry) => [entry.criterion.id, entry.role])).toEqual([
      ['2.4.7', 'primary'],
      ['2.4.13', 'guidance'],
    ])
    const many = makeHaunting({ wcag: [criterion('4.1.2'), criterion('1.1.1')] })
    expect(criterionEntries(many).map((entry) => entry.role)).toEqual(['primary', 'supporting'])
  })

  it('keeps the original order, lists each id once, and puts the guidance last', () => {
    fc.assert(
      fc.property(fc.array(arbCriterion, { maxLength: 6 }), fc.option(arbCriterion, { nil: undefined }), (wcag, guidance) => {
        const entries = criterionEntries(makeHaunting({ wcag, guidance }))
        const ids = entries.map((entry) => entry.criterion.id)
        expect(new Set(ids).size).toBe(ids.length)
        const expected = [...new Set([...wcag.map((c) => c.id), ...(guidance === undefined ? [] : [guidance.id])])]
        expect(ids).toEqual(expected)
        if (entries.length > 0) expect(entries[0]?.role).toBe(wcag.length > 0 ? 'primary' : 'guidance')
        expect(entries.filter((entry) => entry.role === 'primary')).toHaveLength(wcag.length > 0 ? 1 : 0)
      }),
    )
  })
})

describe('isSafeCriterionUrl', () => {
  it('accepts w3.org https links only', () => {
    expect(isSafeCriterionUrl('https://www.w3.org/WAI/WCAG22/Understanding/name-role-value')).toBe(true)
    expect(isSafeCriterionUrl('http://www.w3.org/x')).toBe(false)
    expect(isSafeCriterionUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeCriterionUrl('https://evil.example/www.w3.org')).toBe(false)
    expect(isSafeCriterionUrl('not a url')).toBe(false)
  })
})

describe('relatedIssues', () => {
  it('returns each secondary once and never the haunting itself', () => {
    const a = makeHaunting({ id: 'a', type: 'WhisperingField', isPrimary: false })
    const b = makeHaunting({ id: 'b', type: 'TheFog', isPrimary: false })
    const primary = makeHaunting({ id: 'p', secondary: [a, b, a] })
    expect(relatedIssues(primary).map((item) => item.id)).toEqual(['a', 'b'])
    expect(relatedIssues(makeHaunting({ secondary: [] }))).toEqual([])
  })
})

describe('buildKiroPrompt', () => {
  it('contains the display name, severity, url, element, snippet and fix', () => {
    fc.assert(
      fc.property(arbHaunting, (haunting) => {
        const prompt = buildKiroPrompt(haunting, 'Add to cart', 'https://shop.example/')
        expect(prompt).toContain(hauntingDisplayName(haunting.type))
        expect(prompt).toContain(haunting.severity)
        expect(prompt).toContain('https://shop.example/')
        expect(prompt).toContain('Add to cart')
        expect(prompt).toContain(haunting.htmlSnippet)
        expect(prompt).toContain(haunting.fix.instruction)
        expect(prompt).toContain(haunting.fix.codeSnippet)
        expect(prompt.toLowerCase()).not.toContain('is compliant')
      }),
    )
  })

  it('fences code with more backticks than any run inside it', () => {
    const haunting = makeHaunting({ htmlSnippet: 'a ```` b', fix: { instruction: 'Fix.', codeSnippet: '<p>`x`</p>' } })
    const prompt = buildKiroPrompt(haunting, 'el', 'https://x.example/')
    expect(prompt).toContain('`````html\na ```` b\n`````')
    expect(prompt).toContain('```html\n<p>`x`</p>\n```')
  })

  it('asks for a source-code change, not a runtime patch', () => {
    const prompt = buildKiroPrompt(makeHaunting(), 'el', 'https://x.example/')
    expect(prompt).toMatch(/source files \(not a runtime patch or overlay\)/)
  })
})
