import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
