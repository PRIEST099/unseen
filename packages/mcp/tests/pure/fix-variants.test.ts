import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { HAUNTING_TYPES, generateFix } from '@the-unseen/core'
import { applyFramework, findForbidden, toReact, toVue } from '../../src/pure/fix-variants.js'
import type { Framework } from '../../src/pure/fix-variants.js'

const RUNS = { numRuns: 100 }
const FRAMEWORKS: readonly Framework[] = ['html', 'react', 'vue']

const token = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-0123456789'.split('')), { minLength: 1, maxLength: 8 })
const attrName = fc.constantFrom('class', 'for', 'tabindex', 'aria-label', 'aria-describedby', 'aria-hidden', 'role', 'id', 'readonly', 'maxlength', 'type', 'alt')
const attrs = fc.uniqueArray(fc.tuple(attrName, token), { selector: ([n]) => n, maxLength: 6 })
const tagName = fc.constantFrom('button', 'a', 'img', 'input', 'label', 'div', 'span', 'br')

const snippetArb = fc.tuple(tagName, attrs, token).map(([tag, list, text]) => {
  const attrText = list.map(([n, v]) => ` ${n}="${v}"`).join('')
  return { tag, list, html: ['img', 'input', 'br'].includes(tag) ? `<${tag}${attrText}>` : `<${tag}${attrText}>${text}</${tag}>` }
})

test('property P7: every framework output is non-empty and has no forbidden token', async () => {
  await fc.assert(
    fc.asyncProperty(snippetArb, fc.constantFrom(...FRAMEWORKS), async (s, framework) => {
      const out = applyFramework({ instruction: 'x', codeSnippet: s.html }, framework).codeSnippet
      expect(out.length).toBeGreaterThan(0)
      expect(findForbidden(out)).toBeNull()
    }),
    RUNS
  )
})

test('property P7: react output has no class= or for= or tabindex= attribute', async () => {
  await fc.assert(
    fc.asyncProperty(snippetArb, async (s) => {
      const out = toReact(s.html)
      expect(out).not.toMatch(/\sclass=/)
      expect(out).not.toMatch(/\sfor=/)
      expect(out).not.toMatch(/\stabindex=/)
      if (s.list.some(([n]) => n === 'class')) expect(out).toMatch(/\sclassName=/)
      if (s.list.some(([n]) => n === 'for')) expect(out).toMatch(/\shtmlFor=/)
    }),
    RUNS
  )
})

test('property P7: react output keeps every aria-* attribute exactly', async () => {
  await fc.assert(
    fc.asyncProperty(snippetArb, async (s) => {
      const out = toReact(s.html)
      for (const [name, value] of s.list.filter(([n]) => n.startsWith('aria-'))) expect(out).toContain(` ${name}="${value}"`)
    }),
    RUNS
  )
})

test('property P7: void elements are self-closed in react', async () => {
  await fc.assert(
    fc.asyncProperty(snippetArb.filter((s) => ['img', 'input', 'br'].includes(s.tag)), async (s) => {
      expect(toReact(s.html).endsWith('/>')).toBe(true)
    }),
    RUNS
  )
})

test('property P7: html is unchanged and vue wraps the snippet in a template', async () => {
  await fc.assert(
    fc.asyncProperty(snippetArb, async (s) => {
      expect(applyFramework({ instruction: 'i', codeSnippet: s.html }, 'html').codeSnippet).toBe(s.html)
      const vue = toVue(s.html)
      expect(vue.startsWith('<template>')).toBe(true)
      expect(vue.endsWith('</template>')).toBe(true)
      expect(vue).toContain(s.html)
    }),
    RUNS
  )
})

test('every Core fix, for every type and framework, is free of forbidden tokens', () => {
  for (const type of HAUNTING_TYPES) {
    for (const framework of FRAMEWORKS) {
      const fix = applyFramework(generateFix(type), framework)
      expect(findForbidden(`${fix.instruction}\n${fix.codeSnippet}`), `${type} ${framework}`).toBeNull()
      expect(fix.codeSnippet.length).toBeGreaterThan(0)
    }
  }
})

test('the guard finds each forbidden token and ignores look-alike words', () => {
  for (const bad of ['<script>x</script>', 'document.title', 'el.innerHTML', 'a.setAttribute(', 'new MutationObserver', 'eval(x)', 'new Function("x")']) {
    expect(findForbidden(bad), bad).not.toBeNull()
  }
  expect(findForbidden('evaluate the retrieval of the documentation')).toBeNull()
})
