import { describe, expect, it } from 'vitest'
import { ax, baseRaw } from '../../../tests/classifier/builders.js'
import type { AXValueSource } from '../../types.js'
import { detectWhisperingField, FORM_FIELD_ROLES } from './whispering-field.js'

const empty = (attribute: string): AXValueSource => ({ type: 'attribute', attribute })
const withValue = (type: string, value: string, extra: Partial<AXValueSource> = {}): AXValueSource => ({
  type,
  value: { type: 'computedString', value },
  ...extra,
})

describe('detectWhisperingField', () => {
  it('flags every form field role with an empty name (all 5)', () => {
    expect([...FORM_FIELD_ROLES].sort()).toEqual(['combobox', 'searchbox', 'slider', 'spinbutton', 'textbox'])
    for (const role of FORM_FIELD_ROLES) {
      const found = detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role })] }))
      expect(found, role).toHaveLength(1)
      expect(found[0]?.speech?.includes(', blank'), role).toBe(true)
      expect(found[0]?.speechNote).toBeUndefined()
    }
  })

  it('an unnamed textbox speaks "edit text, blank" and a searchbox "search, blank"', () => {
    expect(detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox' })] }))[0]?.speech).toBe('edit text, blank')
    expect(detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'searchbox' })] }))[0]?.speech).toBe('search, blank')
  })

  it('flags a name that comes only from the placeholder, with a note', () => {
    const node = ax({ id: 5, role: 'textbox', name: 'Email address', sources: [withValue('placeholder', 'Email address', { attribute: 'placeholder' })] })
    const [h] = detectWhisperingField(baseRaw({ axNodes: [node] }))
    expect(h?.speech).toBe('Email address, edit text')
    expect(h?.speechNote).toBe('name disappears when typing')
  })

  it('accepts aria-placeholder and a source of type placeholder', () => {
    for (const source of [withValue('attribute', 'Hint', { attribute: 'aria-placeholder' }), withValue('placeholder', 'Hint')]) {
      expect(detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox', name: 'Hint', sources: [source] })] }))).toHaveLength(1)
    }
  })

  it('does not flag a field named by a label, aria-label or aria-labelledby', () => {
    for (const source of [
      withValue('relatedElement', 'Email', { nativeSource: 'label' }),
      withValue('attribute', 'Email', { attribute: 'aria-label' }),
      withValue('relatedElement', 'Email', { attribute: 'aria-labelledby' }),
    ]) {
      expect(detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox', name: 'Email', sources: [source] })] }))).toEqual([])
    }
  })

  it('does not flag a label that beats a placeholder', () => {
    const sources = [withValue('relatedElement', 'Email', { nativeSource: 'label' }), withValue('placeholder', 'you@example.com', { attribute: 'placeholder' })]
    expect(detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox', name: 'Email', sources })] }))).toEqual([])
  })

  it('finds the placeholder in a realistic CDP sources array', () => {
    const sources: AXValueSource[] = [
      empty('aria-labelledby'),
      empty('aria-label'),
      { type: 'relatedElement', nativeSource: 'label' },
      withValue('attribute', 'john@example.com', { attribute: 'placeholder' }),
      withValue('attribute', 'Old title', { attribute: 'title', superseded: true }),
    ]
    const [h] = detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox', name: 'john@example.com', sources })] }))
    expect(h?.speech).toBe('john@example.com, edit text')
    expect(h?.speechNote).toBe('name disappears when typing')
    expect(h?.nodeIds).toEqual([5])
  })

  it('ignores other roles and ignored nodes', () => {
    const raw = baseRaw({ axNodes: [ax({ id: 5, role: 'button' }), ax({ id: 6, role: 'textbox', ignored: true })] })
    expect(detectWhisperingField(raw)).toEqual([])
  })

  it('maps to 1.3.1, 3.3.2 and 4.1.2', () => {
    const [h] = detectWhisperingField(baseRaw({ axNodes: [ax({ id: 5, role: 'textbox' })] }))
    expect(h?.wcag.map((c) => c.id)).toEqual(['1.3.1', '3.3.2', '4.1.2'])
  })
})
