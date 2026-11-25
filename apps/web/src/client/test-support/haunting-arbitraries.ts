import type { AXNode, Haunting, HauntingSeverity, HauntingType } from '@the-unseen/core'
import fc from 'fast-check'
import { HAUNTING_TYPE_ORDER, SEVERITY_ORDER } from '../utils/haunting-display'

export const arbHauntingType: fc.Arbitrary<HauntingType> = fc.constantFrom(...HAUNTING_TYPE_ORDER)
export const arbSeverity: fc.Arbitrary<HauntingSeverity> = fc.constantFrom(...SEVERITY_ORDER)

export function makeHaunting(overrides: Partial<Haunting> = {}): Haunting {
  return {
    id: 'h-1',
    type: 'NamelessSpirit',
    severity: 'Wraith',
    wcag: [],
    nodeIds: [1],
    box: { backendDOMNodeId: 1, x: 10, y: 20, width: 100, height: 30 },
    htmlSnippet: '<button class="buy"></button>',
    explanation: 'The button has no accessible name.',
    persona: 'As a blind shopper, I hear only "button".',
    fix: { instruction: 'Add a label.', codeSnippet: '<button aria-label="Buy"></button>' },
    isPrimary: true,
    secondary: [],
    ...overrides,
  }
}

export function makeAxNode(backendDOMNodeId: number, role: string, name: string): AXNode {
  return {
    nodeId: String(backendDOMNodeId),
    backendDOMNodeId,
    role: { type: 'role', value: role },
    name: { type: 'computedString', value: name },
    description: { type: 'computedString' },
    properties: [],
    states: [],
    ignored: false,
    ignoredReasons: [],
    childIds: [],
  }
}

export const arbRect: fc.Arbitrary<{ x: number; y: number; width: number; height: number }> = fc.record({
  x: fc.double({ min: 0, max: 1400, noNaN: true }),
  y: fc.double({ min: 0, max: 6000, noNaN: true }),
  width: fc.double({ min: 0, max: 1400, noNaN: true }),
  height: fc.double({ min: 0, max: 800, noNaN: true }),
})

/** A haunting with a box, a unique id and a node id, for ordering and labelling properties. */
export const arbHaunting: fc.Arbitrary<Haunting> = fc
  .record({
    type: arbHauntingType,
    severity: arbSeverity,
    box: arbRect,
    nodeId: fc.integer({ min: 1, max: 5000 }),
    snippet: fc.constantFrom('<button></button>', '<a href="/x">Go</a>', '<div class="card">Candle</div>', ''),
  })
  .map(({ type, severity, box, nodeId, snippet }) =>
    makeHaunting({
      type,
      severity,
      nodeIds: [nodeId],
      box: { backendDOMNodeId: nodeId, ...box },
      htmlSnippet: snippet,
    }),
  )
