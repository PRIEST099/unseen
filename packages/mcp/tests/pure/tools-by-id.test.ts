import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { ZodError } from 'zod'
import { Session } from '../../src/session.js'
import { explain } from '../../src/tools/explain.js'
import { suggestFix } from '../../src/tools/suggest-fix.js'
import { ToolInputError } from '../../src/pure/errors.js'
import { classifiedFrom } from '../arbitraries/classified-audit.js'
import { hauntingArb } from '../arbitraries/haunting.js'

const RUNS = { numRuns: 100 }

function sessionWith(haunting: ReturnType<typeof classifiedFrom>['hauntings'][number]): Session {
  const session = new Session()
  session.record(classifiedFrom([haunting], 0))
  return session
}

test("property: explain by id returns the haunting's own text unchanged", async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, async (h) => {
      const result = explain({ id: h.id }, sessionWith(h))
      expect(result.explanation).toBe(h.explanation)
      expect(result.persona).toBe(h.persona)
      expect(result.speechExample).toBe(h.speech ?? null)
      expect(result.speechNote).toBe(h.speechNote ?? null)
      expect(result.fix).toEqual(h.fix)
    }),
    RUNS
  )
})

test('property: an unknown id is UNKNOWN_HAUNTING_ID for explain and suggest_fix', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, async (h) => {
      const session = sessionWith(h)
      const other = `${h.id}-other`
      for (const call of [() => explain({ id: other }, session), () => suggestFix({ id: other }, session)]) {
        try {
          call()
          throw new Error('expected a throw')
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(ToolInputError)
          expect(error instanceof ToolInputError && error.code).toBe('UNKNOWN_HAUNTING_ID')
        }
      }
    }),
    RUNS
  )
})

test('explain needs exactly one of type or id', () => {
  const session = new Session()
  expect(() => explain({}, session)).toThrow(ZodError)
  expect(() => explain({ type: 'TheFog', id: 'x' }, session)).toThrow(ZodError)
  expect(() => explain({ type: 'NotAType' }, session)).toThrow(ZodError)
})

test('property: suggest_fix output states the change goes in source and the page must be re-audited', async () => {
  await fc.assert(
    fc.asyncProperty(hauntingArb, fc.constantFrom('html', 'react', 'vue'), async (h, framework) => {
      const out = suggestFix({ id: h.id, framework }, sessionWith(h))
      expect(out.text).toContain('source file')
      expect(out.text).toContain('audit_url or audit_html')
      expect(out.framework).toBe(framework)
    }),
    RUNS
  )
})
