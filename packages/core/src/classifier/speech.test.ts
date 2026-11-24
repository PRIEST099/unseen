import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbAxNode, arbBlank, arbRealName, SPEECH_ROLES } from '../../tests/classifier/arbitraries.js'
import { ax, baseRaw, BODY_ID, dom } from '../../tests/classifier/builders.js'
import { announce, announceNote, buildSpeechTrack, PLACEHOLDER_NOTE, ROLE_LABEL_MAP, SKIPPED_ROLES } from './speech.js'

const RUNS = { numRuns: 200 }
const raw = baseRaw()

describe('speech properties', () => {
  // Feature: haunting-classifier, Property 10: Speech always includes role
  it('Property 10: the announcement contains the role label unless the role is generic, none or presentation', () => {
    fc.assert(
      fc.property(arbAxNode(), (node) => {
        const role = String(node.role.value)
        const label = ROLE_LABEL_MAP[role] ?? role
        const text = announce(node, raw)
        return text.includes(label === 'graphic' ? 'graphic' : label)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 11: Speech includes name iff non-empty
  it('Property 11: the name appears if and only if it is non-empty after trimming', () => {
    fc.assert(
      fc.property(arbAxNode(), (node) => {
        const name = String(node.name.value).trim()
        const text = announce(node, raw)
        if (name.length > 0) return text.includes(name)
        return !/[QXZ][qxz0-9]{2,8}Name/.test(text)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 12: Speech contains no fabricated text
  it('Property 12: no undefined, null, element ids or HTML; only name, role, state and the steering rows', () => {
    fc.assert(
      fc.property(arbAxNode(), (node) => {
        const text = announce(node, raw)
        expect(text).not.toMatch(/undefined|null|NaN|\[object|<|>|ax\d|=/)
        const name = String(node.name.value).trim()
        const role = String(node.role.value)
        const label = ROLE_LABEL_MAP[role] ?? role
        const allowed = new Set(['blank', 'unlabelled graphic', 'checked', 'unchecked', 'mixed', 'selected', 'unselected', 'on', 'off', 'pressed', 'expanded', 'collapsed', 'dimmed', 'required'])
        let rest = name === '' ? text : text.replace(name, '')
        rest = rest.replace('unlabelled graphic', '').replace(label, '').replace(/ level \d/, '').replace('graphic', '')
        for (const part of rest.split(',').map((p) => p.trim()).filter(Boolean)) expect(allowed.has(part), `"${part}" in "${text}"`).toBe(true)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 13: Generic nodes are skipped
  it('Property 13: generic, none and presentation roles announce nothing', () => {
    fc.assert(fc.property(arbAxNode([...SKIPPED_ROLES]), (node) => announce(node, raw) === ''), RUNS)
  })

  it('the note never leaks into the announcement', () => {
    fc.assert(
      fc.property(arbAxNode(), (node) => !announce(node, raw).includes(PLACEHOLDER_NOTE)),
      RUNS
    )
  })

  it('blank names never produce a name part', () => {
    fc.assert(
      fc.property(fc.constantFrom('button', 'link', 'checkbox'), arbBlank, arbRealName, (role, blank, real) => {
        const empty = announce(ax({ id: 5, role, name: blank }), raw)
        const named = announce(ax({ id: 5, role, name: real }), raw)
        expect(named.startsWith(`${real}, `)).toBe(true)
        expect(empty).not.toContain(',,')
        expect(empty.startsWith(' ')).toBe(false)
      }),
      RUNS
    )
  })
})

describe('speech examples (hauntings.md)', () => {
  const say = (spec: Parameters<typeof ax>[0], r = raw): string => announce(ax(spec), r)

  it('button with a name', () => expect(say({ id: 5, role: 'button', name: 'Add to cart' })).toBe('Add to cart, button'))
  it('button without a name says only the role', () => expect(say({ id: 5, role: 'button' })).toBe('button'))
  it('checked checkbox', () => expect(say({ id: 5, role: 'checkbox', name: 'Subscribe', props: { checked: 'true' } })).toBe('Subscribe, checkbox, checked'))
  it('unnamed unchecked checkbox', () => expect(say({ id: 5, role: 'checkbox', props: { checked: 'false' } })).toBe('checkbox, unchecked'))
  it('link with and without a name', () => {
    expect(say({ id: 5, role: 'link', name: 'Learn more' })).toBe('Learn more, link')
    expect(say({ id: 5, role: 'link' })).toBe('link')
  })
  it('textbox with a name', () => expect(say({ id: 5, role: 'textbox', name: 'Email' })).toBe('Email, edit text'))
  it('textbox with an empty name is "edit text, blank"', () => expect(say({ id: 5, role: 'textbox' })).toBe('edit text, blank'))
  it('searchbox with an empty name is "search, blank"', () => expect(say({ id: 5, role: 'searchbox' })).toBe('search, blank'))
  it('other form roles use their label before ", blank"', () => {
    expect(say({ id: 5, role: 'spinbutton' })).toBe('spin button, blank')
    expect(say({ id: 5, role: 'slider' })).toBe('slider, blank')
    expect(say({ id: 5, role: 'combobox' })).toBe('combo box, blank')
  })
  it('image with a name is a graphic', () => expect(say({ id: 5, role: 'img', name: 'Company logo' })).toBe('Company logo, graphic'))
  it('heading level comes from the level property, then from the tag', () => {
    expect(say({ id: 5, role: 'heading', name: 'Products', props: { level: 2 } })).toBe('Products, heading level 2')
    const r = baseRaw({ domNodes: { ...baseRaw().domNodes, 5: dom('h3', BODY_ID) } })
    expect(say({ id: 5, role: 'heading', name: 'Deep' }, r)).toBe('Deep, heading level 3')
    expect(say({ id: 6, role: 'heading', name: 'Unknown level' })).toBe('Unknown level, heading')
  })
  it('generic, none and presentation are skipped', () => {
    for (const role of ['generic', 'none', 'presentation']) expect(say({ id: 5, role, name: 'x' })).toBe('')
  })
  it('placeholder-only name speaks the placeholder with a note', () => {
    const node = ax({
      id: 5,
      role: 'textbox',
      name: 'Email address',
      sources: [{ type: 'attribute', attribute: 'placeholder', value: { type: 'computedString', value: 'Email address' } }],
    })
    expect(announce(node, raw)).toBe('Email address, edit text')
    expect(announceNote(node)).toBe('name disappears when typing')
  })
  it('a label-named field has no note, and neither does an unnamed one', () => {
    const labelled = ax({ id: 5, role: 'textbox', name: 'Email', sources: [{ type: 'relatedElement', value: { type: 'computedString', value: 'Email' } }] })
    expect(announceNote(labelled)).toBeUndefined()
    expect(announceNote(ax({ id: 5, role: 'textbox' }))).toBeUndefined()
  })
  it('unnamed image uses the file name from src, without query or hash', () => {
    const r = baseRaw({ imgSrcAttributes: { 5: '/img/logo.png?v=2#x' } })
    expect(say({ id: 5, role: 'image' }, r)).toBe('unlabelled graphic, logo.png')
  })
  it('unnamed image without src', () => expect(say({ id: 5, role: 'img' })).toBe('unlabelled graphic'))
  it('radio uses the checked property: selected or unselected', () => {
    expect(say({ id: 5, role: 'radio', name: 'Small', props: { checked: 'true' } })).toBe('Small, radio button, selected')
    expect(say({ id: 5, role: 'radio', name: 'Large', props: { checked: 'false' } })).toBe('Large, radio button, unselected')
    expect(say({ id: 5, role: 'menuitemradio', name: 'A', props: { checked: 'true' } })).toBe('A, menu item radio, selected')
  })
  it('switch, pressed button, tab, option, combobox and treeitem states', () => {
    expect(say({ id: 5, role: 'switch', name: 'Dark', props: { checked: 'true' } })).toBe('Dark, switch, on')
    expect(say({ id: 5, role: 'switch', name: 'Dark', props: { checked: 'false' } })).toBe('Dark, switch, off')
    expect(say({ id: 5, role: 'button', name: 'Bold', props: { pressed: 'true' } })).toBe('Bold, button, pressed')
    expect(say({ id: 5, role: 'tab', name: 'One', props: { selected: true } })).toBe('One, tab, selected')
    expect(say({ id: 5, role: 'option', name: 'Two', props: { selected: true } })).toBe('Two, option, selected')
    expect(say({ id: 5, role: 'combobox', name: 'Pick', props: { expanded: false } })).toBe('Pick, combo box, collapsed')
    expect(say({ id: 5, role: 'treeitem', name: 'Dir', props: { expanded: true } })).toBe('Dir, tree item, expanded')
    expect(say({ id: 5, role: 'checkbox', name: 'Mix', props: { checked: 'mixed' } })).toBe('Mix, checkbox, mixed')
  })
  it('disabled adds "dimmed" and required adds "required"', () => {
    expect(say({ id: 5, role: 'button', name: 'Go', props: { disabled: true } })).toBe('Go, button, dimmed')
    expect(say({ id: 5, role: 'textbox', name: 'Name', props: { required: true } })).toBe('Name, edit text, required')
    expect(say({ id: 5, role: 'textbox', props: { required: true } })).toBe('edit text, blank, required')
  })
  it('unknown roles use the raw role string', () => expect(say({ id: 5, role: 'tooltip', name: 'Hint' })).toBe('Hint, tooltip'))
  it('every role in the steering table has a label', () => {
    for (const role of SPEECH_ROLES.filter((r) => ['paragraph', 'article', 'separator'].indexOf(r) === -1)) expect(ROLE_LABEL_MAP[role]).toBeDefined()
  })
})

describe('buildSpeechTrack', () => {
  const box = { backendDOMNodeId: 5, x: 10, y: 20, width: 100, height: 30 }

  it('walks axNodes in tree order, skips ignored nodes, and attaches boxes', () => {
    const r = baseRaw({
      axNodes: [ax({ id: 5, role: 'button', name: 'Add to cart' }), ax({ id: 6, role: 'link' }), ax({ id: 7, role: 'button', name: 'Hidden', ignored: true })],
      boundingBoxes: [box],
    })
    const track = buildSpeechTrack(r)
    expect(track).toHaveLength(2)
    expect(track[0]).toEqual({ backendDOMNodeId: 5, text: 'Add to cart, button', box })
    expect(track[1]).toEqual({ backendDOMNodeId: 6, text: 'link', box: null })
  })

  it('carries the placeholder note and skips generic nodes', () => {
    const field = ax({
      id: 8,
      role: 'textbox',
      name: 'Email address',
      sources: [{ type: 'attribute', attribute: 'placeholder', value: { type: 'computedString', value: 'Email address' } }],
    })
    const track = buildSpeechTrack(baseRaw({ axNodes: [ax({ id: 9, role: 'generic', name: 'x' }), field] }))
    expect(track).toEqual([{ backendDOMNodeId: 8, text: 'Email address, edit text', note: PLACEHOLDER_NOTE, box: null }])
  })

  it('Property: every line equals announce() of a distinct non-ignored node, in the same order', () => {
    fc.assert(
      fc.property(fc.array(arbAxNode(), { maxLength: 12 }), (nodes) => {
        const r = baseRaw({ axNodes: nodes })
        const expected = nodes.filter((n) => !n.ignored && announce(n, r) !== '').map((n) => announce(n, r))
        expect(buildSpeechTrack(r).map((l) => l.text)).toEqual(expected)
      }),
      RUNS
    )
  })
})
