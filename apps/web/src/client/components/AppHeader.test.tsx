import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostsProvider, HIDE_GHOSTS_KEY } from '../contexts/GhostsContext'
import { SoundProvider, useSound } from '../contexts/SoundContext'
import { AppHeader } from './AppHeader'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root

/** Shows the context values the rest of the app reads, so the test can see what the header changed. */
function SoundProbe(): ReactElement {
  const { ambientEnabled, soundEnabled } = useSound()
  return <output data-ambient={String(ambientEnabled)} data-sound={String(soundEnabled)} />
}

function render(path: string): void {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <SoundProvider>
          <AppHeader />
          <SoundProbe />
        </SoundProvider>
      </MemoryRouter>,
    )
  })
}

const wordmark = (): HTMLAnchorElement | null => container.querySelector('header a.wordmark')
const soundToggle = (): HTMLButtonElement | null => container.querySelector('button[aria-label="Toggle sound"]')
const probe = (): HTMLOutputElement | null => container.querySelector('output')

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AppHeader wordmark', () => {
  it('is left out on Landing, where the hero title is the brand', () => {
    render('/')
    expect(wordmark()).toBeNull()
    // The banner landmark and its controls stay.
    expect(container.querySelector('header.app-header')).not.toBeNull()
    expect(soundToggle()).not.toBeNull()
  })

  it.each(['/sample/cursed-shop-index', '/sample/cursed-shop-index/whisper', '/seance/job-1', '/nonexistent'])(
    'links home on %s',
    (path) => {
      render(path)
      expect(wordmark()?.textContent).toBe('THE UNSEEN')
      expect(wordmark()?.getAttribute('href')).toBe('/')
    },
  )
})

describe('AppHeader sound toggle', () => {
  it('starts off and flips the in-memory ambient flag that the drone follows', () => {
    const before = window.localStorage.length
    render('/')
    const toggle = soundToggle()
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(probe()?.dataset.ambient).toBe('false')

    act(() => toggle?.click())
    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    expect(probe()?.dataset.ambient).toBe('true')
    expect(probe()?.dataset.sound).toBe('true')

    act(() => toggle?.click())
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(probe()?.dataset.ambient).toBe('false')
    // Never persisted (requirement 20.7).
    expect(window.localStorage.length).toBe(before)
  })
})

describe('AppHeader "Hide ghosts" toggle', () => {
  function renderWithGhosts(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <SoundProvider>
            <GhostsProvider>
              <AppHeader />
            </GhostsProvider>
          </SoundProvider>
        </MemoryRouter>,
      )
    })
  }
  const ghostToggle = (): HTMLButtonElement | null => container.querySelector('button[aria-label="Hide ghosts"]')

  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('sits next to the sound toggle, styled like it, named "Hide ghosts" and not pressed by default', () => {
    renderWithGhosts()
    const toggle = ghostToggle()
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(toggle?.className).toBe(soundToggle()?.className)
    expect(soundToggle()?.nextElementSibling).toBe(toggle)
    // The icon is decoration: the name comes from aria-label alone.
    expect(toggle?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(toggle?.textContent).toBe('')
  })

  it('flips its state and remembers it in localStorage', () => {
    renderWithGhosts()
    act(() => ghostToggle()?.click())
    expect(ghostToggle()?.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(HIDE_GHOSTS_KEY)).toBe('1')
    act(() => ghostToggle()?.click())
    expect(ghostToggle()?.getAttribute('aria-pressed')).toBe('false')
    expect(window.localStorage.getItem(HIDE_GHOSTS_KEY)).toBe('0')
  })

  it('starts pressed when the choice was stored, also after a fresh mount', () => {
    renderWithGhosts()
    act(() => ghostToggle()?.click())
    act(() => root.unmount())
    root = createRoot(container)
    renderWithGhosts()
    expect(ghostToggle()?.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not touch the sound toggle', () => {
    renderWithGhosts()
    act(() => ghostToggle()?.click())
    expect(soundToggle()?.getAttribute('aria-pressed')).toBe('false')
  })

  it('works when localStorage is blocked: the choice lasts for the page only', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithGhosts()
    expect(ghostToggle()?.getAttribute('aria-pressed')).toBe('false')
    act(() => ghostToggle()?.click())
    expect(ghostToggle()?.getAttribute('aria-pressed')).toBe('true')
  })
})
