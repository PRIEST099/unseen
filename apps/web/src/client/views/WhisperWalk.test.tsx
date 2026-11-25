import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReducedMotionProvider } from '../contexts/ReducedMotionContext'
import { SoundProvider, useSound } from '../contexts/SoundContext'
import { useAmbientDrone } from '../hooks/useAmbientDrone'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import { WhisperWalk } from './WhisperWalk'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root
let sound: ReturnType<typeof useSound> | undefined
let audioContextsCreated = 0
const speak = vi.fn()

/** Reads the header Sound flag from the same provider the walk sits in. */
function SoundProbe(): ReactElement {
  sound = useSound()
  return <output data-testid="ambient">{String(sound.ambientEnabled)}</output>
}

/** Mounts the drone exactly as `App` does, so a flipped sound flag would build an AudioContext. */
function DroneHost(): null {
  useAmbientDrone()
  return null
}

/** Counts constructions, then refuses like a browser without audio, so no audio graph is needed. */
class CountingAudioContext {
  constructor() {
    audioContextsCreated += 1
    throw new DOMException('Audio is not available in tests', 'NotSupportedError')
  }
}

class FakeUtterance {
  text: string
  pitch = 1
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

function renderWalk(): void {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/sample/cursed-shop-index/whisper']}>
        <ReducedMotionProvider>
          <SoundProvider>
            <DroneHost />
            <SoundProbe />
            <WhisperWalk
              source={{ kind: 'sample', id: 'cursed-shop-index' }}
              audit={SAMPLE_AUDIT}
              hostname="Cursed Shop (sample)"
              basePath="/sample/cursed-shop-index"
            />
          </SoundProvider>
        </ReducedMotionProvider>
      </MemoryRouter>,
    )
  })
}

function button(name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === name)
  if (match === undefined) throw new Error(`No button named ${name}`)
  return match
}

function click(target: HTMLElement): void {
  act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

beforeEach(() => {
  speak.mockReset()
  audioContextsCreated = 0
  sound = undefined
  vi.stubGlobal('speechSynthesis', {
    speak,
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('AudioContext', CountingAudioContext)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('WhisperWalk Play and the header Sound flag', () => {
  it('speaks the walk without turning ambient sound on or starting the drone', () => {
    renderWalk()
    expect(sound?.ambientEnabled).toBe(false)

    click(button('Play'))

    expect(speak).toHaveBeenCalledTimes(1)
    const [utterance] = speak.mock.calls[0] as [FakeUtterance]
    expect(utterance.text.length).toBeGreaterThan(0)
    expect(button('Pause')).toBeDefined()
    expect(sound?.ambientEnabled).toBe(false)
    expect(container.querySelector('[data-testid="ambient"]')?.textContent).toBe('false')
    expect(audioContextsCreated).toBe(0)

    // Control: the header toggle path does build an AudioContext here, so the zero above is meaningful.
    act(() => sound?.toggleAmbient())
    expect(sound?.ambientEnabled).toBe(true)
    expect(audioContextsCreated).toBe(1)
  })

  it('leaves ambient sound on when it was already on', () => {
    renderWalk()
    act(() => sound?.toggleAmbient())
    expect(sound?.ambientEnabled).toBe(true)

    click(button('Play'))

    expect(speak).toHaveBeenCalledTimes(1)
    expect(sound?.ambientEnabled).toBe(true)
  })

  it('does not touch the flag on Pause and Play again', () => {
    renderWalk()
    click(button('Play'))
    click(button('Pause'))
    click(button('Play'))

    expect(speak).toHaveBeenCalledTimes(2)
    expect(sound?.ambientEnabled).toBe(false)
    expect(audioContextsCreated).toBe(0)
  })
})
