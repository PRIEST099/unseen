import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { MAX_TOP_HAUNTINGS, orderHauntings, toAuditResult } from '../../src/pure/summary.js'
import { classifiedAuditArb } from '../arbitraries/classified-audit.js'

const RUNS = { numRuns: 100 }
export const CLAIM = /\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i

test('property P8: the summary carries the coverage note and the re-audit instruction', async () => {
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      const result = toAuditResult('http://example.test/', classified, false)
      expect(result.summary).toContain(classified.automatedCoverageNote)
      expect(result.summary).toContain('call audit_url again')
      expect(result.summary).toContain(`Haunting score: ${classified.score}/100`)
    }),
    RUNS
  )
})

test('property P8: the summary makes no compliance claim', async () => {
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      expect(toAuditResult('http://example.test/', classified, false).summary).not.toMatch(CLAIM)
    }),
    RUNS
  )
})

test('property P8: at most 10 hauntings, in non-increasing severity, and truncated is accurate', async () => {
  const rank = { Wraith: 0, Restless: 1, Banished: 2 } as const
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      const result = toAuditResult('http://example.test/', classified, false)
      expect(result.hauntings.length).toBe(Math.min(MAX_TOP_HAUNTINGS, classified.hauntings.length))
      expect(result.truncated).toBe(classified.hauntings.length > MAX_TOP_HAUNTINGS)
      const ranks = result.hauntings.map((h) => rank[h.severity])
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }),
    RUNS
  )
})

test('property P8: identical input gives identical output', async () => {
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      expect(toAuditResult('http://example.test/', classified, false)).toEqual(toAuditResult('http://example.test/', classified, false))
    }),
    RUNS
  )
})

test('property P8: ordering is a stable permutation (same elements, nothing lost)', async () => {
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      const ordered = orderHauntings(classified.hauntings)
      expect(ordered).toHaveLength(classified.hauntings.length)
      for (const h of classified.hauntings) expect(ordered).toContain(h)
    }),
    RUNS
  )
})

test('the full page omits the screenshot and the summary page has no classified block', async () => {
  await fc.assert(
    fc.asyncProperty(classifiedAuditArb, async (classified) => {
      const full = toAuditResult('http://example.test/', classified, true)
      expect(full.classified).toBeDefined()
      expect(full.classified?.raw).not.toHaveProperty('screenshotPng')
      expect(toAuditResult('http://example.test/', classified, false).classified).toBeUndefined()
    }),
    { numRuns: 30 }
  )
})
