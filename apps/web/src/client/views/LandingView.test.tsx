import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingView } from './LandingView'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const SAMPLES = [
  { id: 'cursed-shop-index', name: 'Cursed Shop — Home', url: '/cursed-shop/index.html', score: 98, thumbnailUrl: '/a.jpg' },
  { id: 'cursed-shop-checkout', name: 'Cursed Shop — Checkout', url: '/cursed-shop/checkout.html', score: 70, thumbnailUrl: '/b.jpg' },
  { id: 'clean', name: 'Quiet page', url: '/quiet.html', score: 0, thumbnailUrl: '/c.jpg' },
]

let container: HTMLDivElement
let root: Root

async function renderLanding(): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <LandingView />
      </MemoryRouter>,
    )
  })
  // Let the samples request resolve.
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(SAMPLES), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('LandingView hero', () => {
  it('has one h1, the brand, inside the hero with a decorative candle', async () => {
    await renderLanding()
    const headings = container.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('THE UNSEEN')
    expect(headings[0]?.closest('.landing-hero')).not.toBeNull()
    const candle = container.querySelector('.landing-candle')
    expect(candle?.getAttribute('aria-hidden')).toBe('true')
    expect(candle?.getAttribute('focusable')).toBe('false')
  })
})

describe('LandingView sample cards', () => {
  it('shows the score out of 100 with severity wording', async () => {
    await renderLanding()
    const scores = [...container.querySelectorAll('.sample-card-score')].map((node) => node.textContent)
    expect(scores).toEqual([
      'Haunting Score 98 / 100 · heavily haunted',
      'Haunting Score 70 / 100 · badly haunted',
      'Haunting Score 0 / 100 · no hauntings detected',
    ])
  })

  it('describes every card with the visible explanation that higher means more barriers', async () => {
    await renderLanding()
    const explanation = container.querySelector('#sample-score-explanation')
    expect(explanation?.textContent).toBe('Haunting Score out of 100; higher means more accessibility barriers.')
    const cards = [...container.querySelectorAll('button.sample-card')]
    expect(cards).toHaveLength(3)
    for (const card of cards) expect(card.getAttribute('aria-describedby')).toBe('sample-score-explanation')
  })

  it('hides no visible text from assistive technology (no Veiled separator)', async () => {
    await renderLanding()
    expect(container.querySelector('.sample-card [aria-hidden="true"]')).toBeNull()
    expect(container.querySelector('.sample-card-sep')?.textContent?.trim()).toBe('·')
  })
})
