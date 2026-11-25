import * as fc from 'fast-check'
import { HAUNTING_TYPES } from '@the-unseen/core'
import type { Haunting, HauntingSeverity, HauntingType } from '@the-unseen/core'

export const typeArb: fc.Arbitrary<HauntingType> = fc.constantFrom(...HAUNTING_TYPES)
export const severityArb: fc.Arbitrary<HauntingSeverity> = fc.constantFrom('Wraith', 'Restless', 'Banished')

const word = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 8 })
/** Plain prose that cannot spell a compliance claim by chance. */
export const proseArb: fc.Arbitrary<string> = fc.array(word, { minLength: 1, maxLength: 6 }).map((w) => w.join(' '))

const token = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_0123456789'.split('')), { minLength: 1, maxLength: 8 }).map((t) => `x${t}`)

/** A realistic opening tag with optional id and classes, followed by short text. */
export const snippetArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('button', 'a', 'img', 'div', 'input', 'span'),
    fc.option(token, { nil: undefined }),
    fc.array(token, { maxLength: 3 }),
    proseArb
  )
  .map(([tag, id, classes, text]) => {
    const idAttr = id === undefined ? '' : ` id="${id}"`
    const classAttr = classes.length === 0 ? '' : ` class="${classes.join(' ')}"`
    return `<${tag}${idAttr}${classAttr}>${text}</${tag}>`
  })

export const hauntingArb: fc.Arbitrary<Haunting> = fc
  .record({
    id: fc.hexaString({ minLength: 6, maxLength: 12 }),
    type: typeArb,
    severity: severityArb,
    kind: fc.option(fc.constantFrom('no-h1', 'heading-skip', 'no-main'), { nil: undefined }),
    nodeIds: fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 4 }),
    htmlSnippet: snippetArb,
    explanation: proseArb,
    persona: proseArb.map((p) => `As a ${p}`),
    instruction: proseArb,
    codeSnippet: snippetArb,
  })
  .map((r) => {
    const haunting: Haunting = {
      id: r.id,
      type: r.type,
      severity: r.severity,
      wcag: [{ id: '4.1.2', level: 'A', title: 'Name, Role, Value', url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value' }],
      nodeIds: r.nodeIds,
      box: null,
      htmlSnippet: r.htmlSnippet,
      explanation: r.explanation,
      persona: r.persona,
      fix: { instruction: r.instruction, codeSnippet: r.codeSnippet },
      isPrimary: true,
      secondary: [],
    }
    if (r.kind !== undefined) haunting.kind = r.kind
    return haunting
  })

export const hauntingsArb: fc.Arbitrary<Haunting[]> = fc.array(hauntingArb, { maxLength: 16 })

/** A concrete haunting for scenario tests. */
export function makeHaunting(overrides: Partial<Haunting> = {}): Haunting {
  return {
    id: 'h1',
    type: 'NamelessSpirit',
    severity: 'Wraith',
    wcag: [{ id: '4.1.2', level: 'A', title: 'Name, Role, Value', url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value' }],
    nodeIds: [7],
    box: null,
    htmlSnippet: '<button class="checkout"><svg></svg></button>',
    explanation: 'The button has no accessible name.',
    persona: 'As a screen-reader user, I hear only "button".',
    fix: { instruction: 'Give the control an accessible name: visible text, or an aria-label when it only shows an icon.', codeSnippet: '<button aria-label="Checkout">…</button>' },
    isPrimary: true,
    secondary: [],
    ...overrides,
  }
}
