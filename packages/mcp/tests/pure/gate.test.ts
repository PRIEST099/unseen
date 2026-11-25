import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { MAX_CONSECUTIVE_BLOCKS, QUIET_GAP_MS, decideGate, isSessionChanged, parseGateState } from '../../src/pure/gate.js'
import type { GateInput } from '../../src/pure/gate.js'
import { MAX_GATE_MESSAGE_CHARS, gateMessage, reportSentence } from '../../src/pure/gate-message.js'
import type { ToolHaunting } from '../../src/pure/result-types.js'
import { hauntingArb } from '../arbitraries/haunting.js'

const RUNS = { numRuns: 200 }
const gateInput: fc.Arbitrary<GateInput> = fc.record({
  anyDirty: fc.boolean(),
  auditable: fc.boolean(),
  criticalCount: fc.integer({ min: 0, max: 50 }),
  consecutiveBlocks: fc.integer({ min: 0, max: 12 }),
  sessionChanged: fc.boolean(),
})

test('property P5: decideGate is total and returns one of four actions', async () => {
  await fc.assert(
    fc.asyncProperty(gateInput, async (i) => {
      expect(['skip', 'pass', 'block', 'gave-up']).toContain(decideGate(i))
    }),
    RUNS
  )
})

test('property P5: nothing dirty, or nothing auditable, is skip', async () => {
  await fc.assert(
    fc.asyncProperty(gateInput.filter((i) => !i.anyDirty || !i.auditable), async (i) => {
      expect(decideGate(i)).toBe('skip')
    }),
    RUNS
  )
})

test('property P5: dirty, auditable and no critical haunting is pass', async () => {
  await fc.assert(
    fc.asyncProperty(gateInput, async (i) => {
      expect(decideGate({ ...i, anyDirty: true, auditable: true, criticalCount: 0 })).toBe('pass')
    }),
    RUNS
  )
})

test('property P5: critical hauntings with fewer than 5 blocks (or a new session) block', async () => {
  await fc.assert(
    fc.asyncProperty(gateInput, fc.integer({ min: 1, max: 50 }), async (i, critical) => {
      const base = { ...i, anyDirty: true, auditable: true, criticalCount: critical }
      expect(decideGate({ ...base, sessionChanged: false, consecutiveBlocks: Math.min(i.consecutiveBlocks, MAX_CONSECUTIVE_BLOCKS - 1) })).toBe('block')
      expect(decideGate({ ...base, sessionChanged: true })).toBe('block')
    }),
    RUNS
  )
})

test('property P5: 5 or more blocks in the same session with critical hauntings gives up', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: MAX_CONSECUTIVE_BLOCKS, max: 40 }), fc.integer({ min: 1, max: 50 }), async (blocks, critical) => {
      expect(decideGate({ anyDirty: true, auditable: true, criticalCount: critical, consecutiveBlocks: blocks, sessionChanged: false })).toBe('gave-up')
    }),
    RUNS
  )
})

test('property: a session id change or a quiet gap resets the counter; the same session inside the gap does not', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 1_000_000 }), async (session, last) => {
      const state = { sessionId: session, consecutiveBlocks: 3, lastBlockMs: last, lastPassMs: 0 }
      expect(isSessionChanged(state, `${session}x`, last + 1)).toBe(true)
      expect(isSessionChanged(state, session, last + QUIET_GAP_MS + 1)).toBe(true)
      expect(isSessionChanged(state, session, last + QUIET_GAP_MS)).toBe(false)
      expect(isSessionChanged(state, '', last + 1)).toBe(false)
    }),
    RUNS
  )
})

test('property: parseGateState never throws and yields non-negative numbers', async () => {
  await fc.assert(
    fc.asyncProperty(fc.oneof(fc.string(), fc.json()), async (text) => {
      const s = parseGateState(text)
      expect(s.consecutiveBlocks).toBeGreaterThanOrEqual(0)
      expect(s.lastBlockMs).toBeGreaterThanOrEqual(0)
      expect(s.lastPassMs).toBeGreaterThanOrEqual(0)
    }),
    RUNS
  )
})

const toolHauntingArb: fc.Arbitrary<ToolHaunting> = hauntingArb.map((h) => ({
  id: h.id,
  type: h.type,
  severity: h.severity,
  wcag: [],
  selector: h.htmlSnippet,
  htmlSnippet: h.htmlSnippet.repeat(30),
  fix: { instruction: h.fix.instruction.repeat(60), codeSnippet: h.fix.codeSnippet },
}))

test('property P12: the gate message is under 3000 characters, lists at most 5 hauntings, and ends with the report sentence', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(toolHauntingArb, { maxLength: 12 }),
      fc.string({ maxLength: 400 }),
      fc.integer({ min: 0, max: 100 }),
      fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      async (critical, target, score, before) => {
        const message = gateMessage(target, score, before, critical, critical.length)
        expect(message.length).toBeLessThan(MAX_GATE_MESSAGE_CHARS)
        expect(message.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(5)
        expect(message.endsWith(reportSentence(before))).toBe(true)
      }
    ),
    RUNS
  )
})

test('the report sentence names the before score when known', () => {
  expect(reportSentence(15)).toBe('Fix the source, call audit_url (or audit_html) on the same page, and report the before score 15 and the new score before finishing.')
})
