import { describe, expect, it } from 'vitest'
import { generateExplanation, generateFix, generatePersona } from './explanation.js'
import type { ExplanationContext } from './explanation.js'
import { HAUNTING_TYPES } from './types.js'
import type { HauntingType } from './types.js'
import { BCP47_PRIMARY } from './detectors/silent-tongue.js'

const CONTEXTS: Array<[HauntingType, ExplanationContext]> = [
  ['NamelessSpirit', { role: 'button' }],
  ['NamelessSpirit', { role: 'link' }],
  ['HollowPortrait', {}],
  ['TheFog', { ratio: 2.5, threshold: 4.5 }],
  ['LostSoul', {}],
  ['CursedLoop', { trapSize: 3 }],
  ['InvisibleWanderer', {}],
  ['WhisperingField', { fieldCase: 'empty' }],
  ['WhisperingField', { fieldCase: 'placeholder', placeholder: 'Email' }],
  ['SilentTongue', { lang: null }],
  ['SilentTongue', { lang: 'not a tag' }],
  ['ShatteredOrder', { kind: 'no-h1' }],
  ['ShatteredOrder', { kind: 'heading-skip', fromLevel: 2, toLevel: 4 }],
  ['ShatteredOrder', { kind: 'no-main' }],
  ['TheVeiled', { focusable: true }],
  ['TheVeiled', { focusable: false }],
]

const VOID = new Set(['img', 'input', 'br', 'meta', 'link', 'hr'])

/** Every non-void tag opened in the snippet is closed, in order. */
function balanced(code: string): boolean {
  const stack: string[] = []
  for (const m of code.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
    const [, closing, tagRaw, selfClose] = m
    const tag = (tagRaw ?? '').toLowerCase()
    if (closing) {
      if (stack.pop() !== tag) return false
    } else if (!VOID.has(tag) && !selfClose && tag !== 'html') stack.push(tag)
  }
  return stack.length === 0
}

describe('explanation, persona and fix', () => {
  it('covers all 10 haunting types', () => {
    expect(new Set(CONTEXTS.map(([t]) => t))).toEqual(new Set(HAUNTING_TYPES))
  })

  it.each(CONTEXTS)('%s %j has an explanation, a persona and a fix', (type, ctx) => {
    const explanation = generateExplanation(type, ctx)
    expect(explanation.length).toBeGreaterThan(20)
    expect(explanation.split(/(?<=[.!?])\s/).length).toBeLessThanOrEqual(3)
    for (const bad of ['undefined', 'null', 'NaN']) expect(explanation).not.toContain(bad)
    const persona = generatePersona(type)
    expect(persona.startsWith('As a ')).toBe(true)
    expect(persona.split(/(?<=[.!?])\s/)).toHaveLength(1)
    const fix = generateFix(type, ctx)
    expect(fix.instruction.length).toBeGreaterThan(20)
    expect(fix.codeSnippet.length).toBeGreaterThan(5)
    expect(balanced(fix.codeSnippet), fix.codeSnippet).toBe(true)
  })

  it('code snippets use correct HTML, ARIA and CSS syntax', () => {
    expect(generateFix('NamelessSpirit', { role: 'button' }).codeSnippet).toMatch(/<button [^>]*aria-label="[^"]+"/)
    expect(generateFix('NamelessSpirit', { role: 'link' }).codeSnippet).toMatch(/<a href="[^"]+" aria-label="[^"]+"/)
    expect(generateFix('HollowPortrait').codeSnippet).toMatch(/<img [^>]*src="[^"]+" alt="[^"]+"/)
    expect(generateFix('TheFog', { threshold: 3 }).instruction).toContain('3:1')
    expect(generateFix('TheFog', {}).codeSnippet).toMatch(/color: #[0-9a-f]{6}; background-color: #[0-9a-f]{6};/i)
    expect(generateFix('LostSoul').codeSnippet).toMatch(/^<button type="button"/)
    expect(generateFix('CursedLoop').codeSnippet).toMatch(/role="dialog" aria-modal="true" aria-labelledby="t"/)
    expect(generateFix('InvisibleWanderer').codeSnippet).toMatch(/:focus-visible \{ outline: \d+px solid #[0-9a-f]{6};/i)
    expect(generateFix('ShatteredOrder', { kind: 'no-h1' }).codeSnippet).toBe('<h1>Page title</h1>')
    expect(generateFix('ShatteredOrder', { kind: 'no-main' }).codeSnippet).toMatch(/^<main[ >]/)
    expect(generateFix('ShatteredOrder', { kind: 'heading-skip' }).codeSnippet).toMatch(/<h2>.*<\/h2>\n<h3>/)
    expect(generateFix('TheVeiled').codeSnippet).not.toContain('aria-hidden')
  })

  it('the Whispering Field fix ties a label to its input by id', () => {
    const code = generateFix('WhisperingField', { fieldCase: 'empty' }).codeSnippet
    const forId = /<label for="([^"]+)"/.exec(code)?.[1]
    expect(forId).toBeDefined()
    expect(code).toContain(`id="${forId}"`)
    expect(generateFix('WhisperingField', { fieldCase: 'placeholder' }).instruction).toContain('placeholder')
  })

  it('the Silent Tongue fix is a valid BCP 47 tag', () => {
    const lang = /lang="([^"]+)"/.exec(generateFix('SilentTongue').codeSnippet)?.[1] ?? ''
    expect(BCP47_PRIMARY.test(lang)).toBe(true)
  })

  it('explanations carry the measured values', () => {
    expect(generateExplanation('TheFog', { ratio: 2.5, threshold: 4.5 })).toContain('2.50:1')
    expect(generateExplanation('TheFog', { ratio: 2.5, threshold: 4.5 })).toContain('4.5:1')
    expect(generateExplanation('NamelessSpirit', { role: 'link' })).toContain('"link"')
    expect(generateExplanation('ShatteredOrder', { kind: 'heading-skip', fromLevel: 2, toLevel: 4 })).toContain('h2 to h4')
    expect(generateExplanation('SilentTongue', { lang: 'zz zz' })).toContain('"zz zz"')
    expect(generateExplanation('WhisperingField', { fieldCase: 'placeholder', placeholder: 'Email' })).toContain('"Email"')
  })
})
