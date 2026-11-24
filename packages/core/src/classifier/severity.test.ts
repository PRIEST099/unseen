import { describe, expect, it } from 'vitest'
import { ax, baseRaw, BODY_ID, dom } from '../../tests/classifier/builders.js'
import type { RawAudit } from '../types.js'
import { detectNamelessSpirit } from './detectors/nameless-spirit.js'
import { assignSeverity, CORE_TASK_KEYWORDS, isCoreTask } from './severity.js'
import type { PrimaryHaunting } from './severity.js'
import type { HauntingType, UnclassifiedHaunting } from './types.js'
import { WCAG_1_4_3, WCAG_4_1_2 } from './wcag.js'

function haunting(type: HauntingType, id: number, wcag = [WCAG_4_1_2], secondary: UnclassifiedHaunting[] = []): PrimaryHaunting {
  return {
    id: `${type}-${id}`,
    type,
    wcag,
    nodeIds: [id],
    box: null,
    htmlSnippet: '',
    explanation: '',
    persona: 'As a user, I test.',
    fix: { instruction: '', codeSnippet: '' },
    isPrimary: true,
    secondary,
  }
}

const page = (nodes: RawAudit['domNodes'], axNodes: RawAudit['axNodes'] = []): RawAudit =>
  baseRaw({ domNodes: { ...baseRaw().domNodes, ...nodes }, axNodes })

const severityOf = (h: PrimaryHaunting, raw: RawAudit): string | undefined => assignSeverity([h], raw)[0]?.severity

describe('assignSeverity', () => {
  it('an unnamed button inside a <form> is Wraith', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('button', 4) }, [ax({ id: 5, role: 'button' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Wraith')
  })

  it('an unnamed button with class checkout-btn is Wraith', () => {
    const raw = page({ 5: dom('button', BODY_ID, { class: 'checkout-btn' }) }, [ax({ id: 5, role: 'button' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Wraith')
  })

  it('a checkout/cart id or class on an ancestor makes the flow core', () => {
    const raw = page({ 4: dom('section', BODY_ID, { id: 'My-Cart' }), 5: dom('button', 4) }, [ax({ id: 5, role: 'button' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Wraith')
  })

  it('a dialog ancestor (tag, role=dialog or role=alertdialog) makes the flow core', () => {
    for (const parent of [dom('dialog', BODY_ID), dom('div', BODY_ID, { role: 'dialog' }), dom('div', BODY_ID, { role: 'alertdialog' })]) {
      const raw = page({ 4: parent, 5: dom('button', 4) }, [ax({ id: 5, role: 'button' })])
      expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Wraith')
    }
  })

  it('an unnamed button whose snippet or aria-label carries a task keyword is Wraith', () => {
    const raw = page({ 5: dom('button', BODY_ID, { 'aria-label': 'Add to basket' }) }, [ax({ id: 5, role: 'button' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Wraith')
  })

  it('keyword matching is case-insensitive and covers every keyword', () => {
    for (const word of CORE_TASK_KEYWORDS) {
      const raw = page({ 5: dom('button', BODY_ID) }, [ax({ id: 5, role: 'button', name: word.toUpperCase() })])
      expect(isCoreTask(haunting('LostSoul', 5), raw), word).toBe(true)
    }
    const plain = page({ 5: dom('button', BODY_ID) }, [ax({ id: 5, role: 'button', name: 'Learn more' })])
    expect(isCoreTask(haunting('LostSoul', 5), plain)).toBe(false)
  })

  it('a plain unnamed button outside any core flow is not Wraith', () => {
    const raw = page({ 5: dom('button', BODY_ID, { class: 'icon' }) }, [ax({ id: 5, role: 'button' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Restless') // level A
  })

  it('types that cannot block a task are never Wraith, even in a form', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('img', 4) }, [ax({ id: 5, role: 'img' })])
    const types: HauntingType[] = ['HollowPortrait', 'TheFog', 'InvisibleWanderer', 'TheVeiled', 'ShatteredOrder', 'SilentTongue']
    for (const type of types) expect(severityOf(haunting(type, 5), raw), type).not.toBe('Wraith')
  })

  it('a NamelessSpirit on a link does not block (blocking table: button, menuitem*, tab)', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('a', 4, { href: '#' }) }, [ax({ id: 5, role: 'link' })])
    expect(severityOf(haunting('NamelessSpirit', 5), raw)).toBe('Restless')
  })

  it('CursedLoop, WhisperingField and LostSoul block when they sit in a core flow', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('div', 4) })
    for (const type of ['CursedLoop', 'WhisperingField', 'LostSoul'] as const) expect(severityOf(haunting(type, 5), raw), type).toBe('Wraith')
  })

  it('3 or more instances of the same type are Restless', () => {
    const raw = page({ 5: dom('p', BODY_ID), 6: dom('p', BODY_ID), 7: dom('p', BODY_ID) })
    const fogs = [5, 6, 7].map((id) => haunting('TheFog', id, [WCAG_1_4_3]))
    expect(assignSeverity(fogs, raw).map((h) => h.severity)).toEqual(['Restless', 'Restless', 'Restless'])
    expect(assignSeverity(fogs.slice(0, 2), raw).map((h) => h.severity)).toEqual(['Banished', 'Banished'])
  })

  it('a level A criterion is Restless', () => {
    expect(severityOf(haunting('HollowPortrait', 5, [WCAG_4_1_2]), page({ 5: dom('img', BODY_ID) }))).toBe('Restless')
  })

  it('a single level AA haunting off the critical path is Banished', () => {
    expect(severityOf(haunting('TheFog', 5, [WCAG_1_4_3]), page({ 5: dom('p', BODY_ID) }))).toBe('Banished')
  })

  it('applies the rules in order: Wraith wins over Restless', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('button', 4) }, [ax({ id: 5, role: 'button' })])
    const three = [5, 5, 5].map((id) => haunting('NamelessSpirit', id))
    expect(assignSeverity(three, raw).map((h) => h.severity)).toEqual(['Wraith', 'Wraith', 'Wraith'])
  })

  it('marks primaries as primary, and gives secondaries a severity but no score role', () => {
    const raw = page({ 5: dom('p', BODY_ID) })
    const [h] = assignSeverity([haunting('TheFog', 5, [WCAG_1_4_3], [haunting('InvisibleWanderer', 5)])], raw)
    expect(h?.isPrimary).toBe(true)
    expect(h?.secondary).toHaveLength(1)
    expect(h?.secondary[0]?.isPrimary).toBe(false)
    expect(h?.secondary[0]?.severity).toBeDefined()
  })

  it('does not mutate its input', () => {
    const raw = page({ 5: dom('p', BODY_ID) })
    const input = haunting('TheFog', 5, [WCAG_1_4_3])
    const copy = JSON.stringify(input)
    assignSeverity([input], raw)
    expect(JSON.stringify(input)).toBe(copy)
  })

  it('works on real detector output', () => {
    const raw = page({ 4: dom('form', BODY_ID), 5: dom('button', 4) }, [ax({ id: 5, role: 'button' })])
    const detected = detectNamelessSpirit(raw).map((h) => ({ ...h, isPrimary: true as const, secondary: [] }))
    expect(assignSeverity(detected, raw)[0]?.severity).toBe('Wraith')
  })
})
