import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as srcApi from './index.js'

// The package entry is what consumers import (`main` and `types` in package.json). The build in
// tests/build-package.ts runs before this file, so a stale dist cannot hide a missing export.
const ENTRY = '@the-unseen/core'

describe('built package entry (@the-unseen/core)', () => {
  it('exports auditAndClassify, auditUrl and auditHtml as functions', async () => {
    const built: Record<string, unknown> = await import(ENTRY)
    for (const name of ['auditAndClassify', 'auditUrl', 'auditHtml']) {
      expect(typeof built[name], name).toBe('function')
    }
  })

  it('exports exactly what src/index.ts exports', async () => {
    const built: Record<string, unknown> = await import(ENTRY)
    expect(Object.keys(built).sort()).toEqual(Object.keys(srcApi).sort())
  })

  it('declares the classified-audit types in dist/index.d.ts', () => {
    const declarations = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')
    for (const type of ['ClassifiedAudit', 'Haunting', 'HauntingType', 'HauntingSeverity', 'ManualCheckNode', 'AxeCrossCheck', 'RawAudit']) {
      expect(declarations, type).toMatch(new RegExp(`\\b${type}\\b`))
    }
    expect(declarations).toMatch(/\bauditAndClassify\b/)
  })
})
