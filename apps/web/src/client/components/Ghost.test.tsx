import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Ghost } from './Ghost'
import type { GhostEdge, GhostMood } from '../utils/ghost-art'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function draw(edge: GhostEdge, mood?: GhostMood): SVGElement {
  act(() => root.render(<Ghost size={96} edge={edge} mood={mood} />))
  const svg = container.querySelector('svg')
  if (svg === null) throw new Error('Ghost drew no svg')
  return svg
}

describe('Ghost', () => {
  it.each<GhostEdge>(['top', 'right', 'bottom', 'left'])('is hidden from assistive technology and not focusable (%s)', (edge) => {
    const svg = draw(edge)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    // Nothing inside can be reached or named: no text, no title, no focusable or interactive element.
    expect(svg.textContent).toBe('')
    expect(svg.querySelector('title, desc, a, button, [tabindex]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses the ghost tokens, never a raw colour', () => {
    const svg = draw('left')
    const colours = [...svg.querySelectorAll('[style], [fill], [stroke]')].map(
      (element) => `${element.getAttribute('style') ?? ''} ${element.getAttribute('fill') ?? ''} ${element.getAttribute('stroke') ?? ''}`,
    )
    expect(colours.join(' ')).toContain('--color-ghost-top')
    expect(colours.join(' ')).toContain('--color-ghost-bottom')
    expect(colours.join(' ')).not.toMatch(/#[0-9a-f]{3,6}|rgb/i)
  })

  it('stands nearly upright, leaning in, on a side edge when asked; the bottom edge is never tilted', () => {
    const turn = (edge: GhostEdge, upright: boolean): string => {
      act(() => root.render(<Ghost size={96} edge={edge} upright={upright} />))
      return (container.querySelector('svg') as SVGElement).style.transform
    }
    expect(turn('left', true)).toBe('rotate(22deg)')
    expect(turn('right', true)).toBe('rotate(-22deg)')
    expect(turn('bottom', true)).toBe('rotate(0deg)')
    // Not asked: on its side, as before.
    expect(turn('left', false)).toBe('rotate(98deg)')
  })

  it('turns so the hands hold the given edge', () => {
    const turns = Object.fromEntries((['bottom', 'left', 'top', 'right'] as const).map((edge) => [edge, draw(edge).style.transform]))
    expect(turns.bottom).toBe('rotate(0deg)')
    expect(turns.left).toBe('rotate(98deg)')
    expect(turns.top).toBe('rotate(180deg)')
    expect(turns.right).toBe('rotate(262deg)')
  })

  it('has rounder, larger eyes when startled', () => {
    const eyeSize = (mood: GhostMood): number[] => {
      const eyes = [...draw('bottom', mood).querySelectorAll('ellipse')].slice(0, 2)
      return eyes.map((eye) => Number(eye.getAttribute('rx')) + Number(eye.getAttribute('ry')))
    }
    const looking = eyeSize('looking')
    const startled = eyeSize('startled')
    expect(looking).toHaveLength(2)
    expect(startled[0]).toBeGreaterThan(looking[0] ?? Infinity)
    const ratio = (mood: GhostMood): number => {
      const eye = draw('bottom', mood).querySelector('ellipse')
      return Number(eye?.getAttribute('rx')) / Number(eye?.getAttribute('ry'))
    }
    expect(ratio('startled')).toBeGreaterThan(ratio('looking'))
  })
})

/** The body spans about 100 x 113 in the 120 x 120 drawing (see the BODY path in Ghost.tsx). */
const BODY_WIDTH = 100
const BODY_HEIGHT = 113

describe('Ghost: the shape of the thumbnail', () => {
  const eyeOf = (mood: GhostMood): SVGEllipseElement => {
    const eye = draw('bottom', mood).querySelector('ellipse')
    if (eye === null) throw new Error('no eye')
    return eye
  }
  const num = (element: Element, name: string): number => Number(element.getAttribute(name))

  it('has big, tall black oval eyes: about 18% of the body width and 28% of its height', () => {
    const eye = eyeOf('looking')
    expect((2 * num(eye, 'rx')) / BODY_WIDTH).toBeGreaterThan(0.16)
    expect((2 * num(eye, 'rx')) / BODY_WIDTH).toBeLessThan(0.2)
    expect((2 * num(eye, 'ry')) / BODY_HEIGHT).toBeGreaterThan(0.26)
    expect((2 * num(eye, 'ry')) / BODY_HEIGHT).toBeLessThan(0.3)
    expect(eye.getAttribute('fill')).toBe('var(--color-void)')
  })

  it('startled eyes are about 15% larger', () => {
    const size = (mood: GhostMood): number => num(eyeOf(mood), 'rx') + num(eyeOf(mood), 'ry')
    const growth = size('startled') / size('looking')
    expect(growth).toBeGreaterThan(1.1)
    expect(growth).toBeLessThan(1.2)
  })

  it('sets the eyes wide apart, a little below the middle of the dome', () => {
    const eyes = [...draw('bottom').querySelectorAll('ellipse')].slice(0, 2)
    const [left, right] = eyes.map((eye) => num(eye, 'cx'))
    // Wide apart: the gap between the eyes is wider than one eye.
    expect((right ?? 0) - (left ?? 0) - 2 * num(eyes[0] as Element, 'rx')).toBeGreaterThan(num(eyes[0] as Element, 'rx'))
    // Symmetric about the middle of the 120 wide drawing.
    expect((left ?? 0) + (right ?? 0)).toBe(120)
    const centreY = num(eyes[0] as Element, 'cy')
    expect(centreY).toBeGreaterThan(5 + BODY_HEIGHT * 0.3)
    expect(centreY).toBeLessThan(5 + BODY_HEIGHT * 0.5)
  })

  it('is a soft bell: curves only (no straight sides), a dome on top, and a hem of three rounded lobes', () => {
    const body = draw('bottom').querySelector('path')?.getAttribute('d') ?? ''
    // Only move, curve and close commands: no line, horizontal or vertical segment anywhere.
    expect(body).not.toMatch(/[LHVlhv]/)
    const curves = body.match(/C/g) ?? []
    // Two shoulders and two tapering sides, and three hem lobes between the sides.
    expect(curves.length).toBe(7)
    const lobes = body.split('C').slice(3, 6)
    expect(lobes).toHaveLength(3)
  })

  it('has two small rounded hands, one at each side', () => {
    const ellipses = [...draw('bottom').querySelectorAll('ellipse')].slice(2)
    expect(ellipses).toHaveLength(2)
    const [left, right] = ellipses.map((hand) => num(hand, 'cx'))
    expect(left ?? 0).toBeLessThan(30)
    expect(right ?? 0).toBeGreaterThan(90)
    for (const hand of ellipses) expect(num(hand, 'rx')).toBeLessThan(12)
  })

  it('keeps the mint gradient and adds a darker shade under the dome, all from tokens', () => {
    const svg = draw('bottom')
    expect(svg.querySelectorAll('linearGradient')).toHaveLength(1)
    expect(svg.querySelectorAll('radialGradient')).toHaveLength(1)
    const shade = svg.querySelector('radialGradient')
    expect(shade?.innerHTML).toContain('--color-ghost-glow')
    // Two body layers: the gradient, then the shade over it.
    expect(svg.querySelectorAll('path[fill^="url(#"]').length).toBeGreaterThanOrEqual(2)
  })
})
