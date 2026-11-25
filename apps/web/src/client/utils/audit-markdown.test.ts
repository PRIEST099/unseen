import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbAudit, makeAudit, SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import { buildJson, buildMarkdown, CLEAN_SITE_MESSAGE, fencedBlock, HONESTY_CAVEAT, inlineCode } from './audit-markdown'
import { groupByWCAG } from './wcag-groups'

describe('buildMarkdown', () => {
  it('contains the score, the coverage note, the caveat and every criterion of the sample', () => {
    const markdown = buildMarkdown(SAMPLE_AUDIT)
    expect(markdown).toContain(`**Haunting Score**: ${SAMPLE_AUDIT.score}/100`)
    expect(markdown).toContain(SAMPLE_AUDIT.automatedCoverageNote)
    expect(markdown).toContain(HONESTY_CAVEAT)
    expect(markdown).toContain('### 1.1.1 Non-text Content (A)')
    expect(markdown).toContain('## Needs Manual Check')
    expect(markdown).not.toMatch(/\bcompliant\b/i)
  })

  it('says so when there are no hauntings', () => {
    const markdown = buildMarkdown(makeAudit([], [], 0))
    expect(markdown).toContain(CLEAN_SITE_MESSAGE)
    expect(markdown).toContain('**Haunting Score**: 0/100')
  })

  it('has the score, the note and a heading for every criterion, for any audit', () => {
    fc.assert(
      fc.property(arbAudit, (audit) => {
        const markdown = buildMarkdown(audit)
        expect(markdown).toContain(`${audit.score}/100`)
        expect(markdown).toContain(audit.automatedCoverageNote)
        expect(markdown).toContain(HONESTY_CAVEAT)
        for (const { criterion } of groupByWCAG(audit.hauntings)) {
          expect(markdown).toContain(`### ${criterion.id} ${criterion.title} (${criterion.level})`)
        }
      }),
    )
  })
})

describe('buildJson', () => {
  it('round-trips the audit unchanged', () => {
    fc.assert(
      fc.property(arbAudit, (audit) => {
        expect(JSON.parse(buildJson(audit))).toEqual(JSON.parse(JSON.stringify(audit)))
      }),
      { numRuns: 20 },
    )
  })
})

describe('code helpers', () => {
  it('keeps backticks inside inline code', () => {
    expect(inlineCode('<a title="`x`">')).toBe('``<a title="`x`">``')
    expect(inlineCode('`tick`')).toBe('`` `tick` ``')
    expect(inlineCode('a\n  b')).toBe('`a b`')
  })

  it('uses a longer fence than any backtick run in a block', () => {
    expect(fencedBlock('x')).toBe('```html\nx\n```')
    expect(fencedBlock('a ```` b')).toMatch(/^`{5}html\n/)
  })
})
