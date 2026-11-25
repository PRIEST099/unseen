import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import { auditHtmlAndClassify, getPool } from '@the-unseen/core'

const POWER = fileURLToPath(new URL('../../../power', import.meta.url))
const fixture = readFileSync(`${POWER}/demo/checkout.html`, 'utf8')
const demoText = readFileSync(`${POWER}/DEMO.md`, 'utf8')
const fixed = fixture.replace('<button class="checkout" type="button">', '<button class="checkout" type="button" aria-label="Checkout">')

afterAll(async () => {
  await getPool().close()
})

describe('demo fixture power/demo/checkout.html', () => {
  test('the fixture has a Wraith NamelessSpirit on the checkout button', async () => {
    const audit = await auditHtmlAndClassify(fixture, { allowPrivate: true })
    const ghost = audit.hauntings.find((h) => h.type === 'NamelessSpirit')
    expect(ghost?.severity).toBe('Wraith')
    expect(ghost?.htmlSnippet).toContain('class="checkout"')
    expect(audit.hauntings).toHaveLength(1)
  })

  test('the same page with an aria-label has no NamelessSpirit and a lower score', async () => {
    expect(fixed).not.toBe(fixture)
    const before = await auditHtmlAndClassify(fixture, { allowPrivate: true })
    const after = await auditHtmlAndClassify(fixed, { allowPrivate: true })
    expect(after.hauntings.some((h) => h.type === 'NamelessSpirit')).toBe(false)
    expect(after.score).toBeLessThan(before.score)
  })

  test('the page does not announce its own ghost (no HTML comments, no hint words)', () => {
    expect(fixture).not.toContain('<!--')
    expect(fixture).not.toMatch(/Expected|Nameless Spirit|Wraith|haunt/i)
  })

  test('the scores printed in DEMO.md equal the computed ones', async () => {
    const before = (await auditHtmlAndClassify(fixture, { allowPrivate: true })).score
    const after = (await auditHtmlAndClassify(fixed, { allowPrivate: true })).score
    expect(demoText).toContain(`Score before: **${before}**`)
    expect(demoText).toContain(`Score after the fix: **${after}**`)
    expect(demoText).toContain(`15 to 0`.replace('15', String(before)).replace('0', String(after)))
  })
})

describe('DEMO.md', () => {
  test('lists the prerequisites in the required order', () => {
    const order = [
      'npx playwright install chromium',
      'npm run unseen:install-global',
      'trust the workspace',
      'Import the Power',
      'unseen-mcp install-hooks',
      'Delete `.unseen/`',
      'Start a **new** chat session',
    ]
    const positions = order.map((s) => demoText.indexOf(s))
    expect(positions.every((p) => p >= 0), JSON.stringify(positions)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('contains the exact prompt, the exit-1 mechanism and the IDE fallback', () => {
    expect(demoText).toContain('Add a quantity selector next to the checkout button in checkout.html.')
    expect(demoText).toContain('exits 1')
    expect(demoText).toContain('agent fallback')
    expect(demoText).toContain('unseen-gate-agent-fallback.json')
    expect(demoText).toContain('.unseen/turn-start.json')
    expect(demoText).toContain('may not appear')
    expect(demoText).toContain('Recovery')
  })

  test('makes no compliance claim', () => {
    expect(demoText).not.toMatch(/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i)
  })
})
