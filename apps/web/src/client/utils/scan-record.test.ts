import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ClassifiedAudit, EngineVersions } from '@the-unseen/core'
import { arbAudit, SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import { buildJson, buildMarkdown } from './audit-markdown'
import { NOT_RECORDED, scanRecord } from './scan-record'

const arbVersion = fc.stringMatching(/^[0-9]{1,3}(\.[0-9]{1,3}){1,3}$/)
const arbEngine: fc.Arbitrary<EngineVersions> = fc.record({
  unseenVersion: arbVersion,
  axeVersion: arbVersion,
  chromiumVersion: arbVersion,
})

function withEngine(audit: ClassifiedAudit, engine: EngineVersions | undefined): ClassifiedAudit {
  const { engine: _dropped, ...rest } = audit.raw
  return { ...audit, raw: engine === undefined ? rest : { ...rest, engine } }
}

describe('scanRecord', () => {
  it('lists the six items in order, taking every value from the audit', async () => {
    await fc.assert(
      fc.asyncProperty(arbAudit, arbEngine, async (audit, engine) => {
        const entries = scanRecord(withEngine(audit, engine))
        expect(entries.map((entry) => entry.label)).toEqual([
          'THE UNSEEN version',
          'axe-core version',
          'Chromium version',
          'Viewport',
          'Audited URL',
          'Audited at',
        ])
        expect(entries.map((entry) => entry.value)).toEqual([
          engine.unseenVersion,
          engine.axeVersion,
          engine.chromiumVersion,
          `${audit.raw.viewportWidth} × ${audit.raw.viewportHeight} px`,
          audit.raw.auditedUrl,
          audit.raw.auditedAt,
        ])
      }),
      { numRuns: 100 },
    )
  })

  it('says "Not recorded" for versions the engine did not record, and never invents one', () => {
    const entries = scanRecord(withEngine(SAMPLE_AUDIT, undefined))
    expect(entries.slice(0, 3).map((entry) => entry.value)).toEqual([NOT_RECORDED, NOT_RECORDED, NOT_RECORDED])
    const blank = scanRecord(withEngine(SAMPLE_AUDIT, { unseenVersion: '', axeVersion: ' ', chromiumVersion: '' }))
    expect(blank.slice(0, 3).map((entry) => entry.value)).toEqual([NOT_RECORDED, NOT_RECORDED, NOT_RECORDED])
  })
})

describe('scan record in the exports', () => {
  it('the Markdown export has a Scan Record section with every value', async () => {
    await fc.assert(
      fc.asyncProperty(arbAudit, arbEngine, async (audit, engine) => {
        const withRecord = withEngine(audit, engine)
        const markdown = buildMarkdown(withRecord)
        expect(markdown).toContain('## Scan Record')
        for (const { label, value } of scanRecord(withRecord)) expect(markdown).toContain(`**${label}**: ${value}`)
      }),
      { numRuns: 100 },
    )
  })

  it('the JSON export carries every value in raw (it is the audit unchanged)', async () => {
    await fc.assert(
      fc.asyncProperty(arbAudit, arbEngine, async (audit, engine) => {
        const parsed: unknown = JSON.parse(buildJson(withEngine(audit, engine)))
        const raw = typeof parsed === 'object' && parsed !== null && 'raw' in parsed ? parsed.raw : undefined
        expect(raw).toMatchObject({
          engine,
          viewportWidth: audit.raw.viewportWidth,
          viewportHeight: audit.raw.viewportHeight,
          auditedUrl: audit.raw.auditedUrl,
          auditedAt: audit.raw.auditedAt,
        })
      }),
      { numRuns: 50 },
    )
  })
})
