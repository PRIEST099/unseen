import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import type { AxeViolation } from '@the-unseen/core'
import { SELECTOR_FALLBACK, selectorFor } from '../../src/pure/selector.js'
import { hauntingArb } from '../arbitraries/haunting.js'
import { syntheticRaw } from '../../src/pure/synthetic-raw.js'

const RUNS = { numRuns: 100 }
const targetPart = fc.stringOf(fc.constantFrom(...'abcdefghij#.> '.split('')), { minLength: 1, maxLength: 10 })

const violationsArb: fc.Arbitrary<AxeViolation[]> = fc.array(
  fc.record({
    id: fc.constant('rule'),
    impact: fc.constant(null),
    tags: fc.constant([] as string[]),
    description: fc.constant('d'),
    helpUrl: fc.constant('h'),
    nodes: fc.array(
      fc.record({
        html: fc.constant('<x>'),
        target: fc.array(targetPart, { maxLength: 3 }),
        backendDOMNodeId: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
        failureSummary: fc.constant(''),
      }),
      { maxLength: 4 }
    ),
  }),
  { maxLength: 4 }
)

/** Tag, id and class tokens that the snippet itself contains. */
function snippetTokens(snippet: string): Set<string> {
  return new Set(snippet.match(/[A-Za-z_][\w-]*/g) ?? [])
}

test('property P11: the selector is an axe target, a tag/id/class built from the snippet, or the fallback', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, violationsArb, async (haunting, violations) => {
      const raw = syntheticRaw({ axeViolations: violations })
      const selector = selectorFor(haunting, raw)
      expect(selector.length).toBeGreaterThan(0)
      const axeTargets = violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))
      if (axeTargets.includes(selector)) return
      if (selector === SELECTOR_FALLBACK) return
      const tokens = snippetTokens(haunting.htmlSnippet)
      for (const part of selector.split(/[#.]/).filter(Boolean)) expect(tokens.has(part), `${part} in ${haunting.htmlSnippet}`).toBe(true)
    }),
    RUNS
  )
})

test('property P11: an axe node with a matching non-null id supplies the selector', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, fc.array(targetPart, { minLength: 1, maxLength: 3 }), async (haunting, target) => {
      const id = haunting.nodeIds[0] ?? 1
      const raw = syntheticRaw({
        axeViolations: [{ id: 'r', impact: null, tags: [], description: 'd', helpUrl: 'h', nodes: [{ html: '<x>', target, backendDOMNodeId: id, failureSummary: '' }] }],
      })
      expect(selectorFor(haunting, raw)).toBe(target.join(' '))
    }),
    RUNS
  )
})

test('property P11: a snippet with no tag and no axe match gives exactly the fallback', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, fc.constantFrom('', 'plain text', '  ', '…'), async (haunting, snippet) => {
      expect(selectorFor({ ...haunting, htmlSnippet: snippet }, syntheticRaw())).toBe(SELECTOR_FALLBACK)
    }),
    RUNS
  )
})
