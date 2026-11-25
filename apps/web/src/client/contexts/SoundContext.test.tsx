import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SoundProvider, useSound } from './SoundContext'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root
let latest: ReturnType<typeof useSound> | undefined

function Probe(): ReactElement | null {
  latest = useSound()
  return null
}

beforeEach(() => {
  container = document.createElement('div')
  root = createRoot(container)
  latest = undefined
})

afterEach(() => {
  act(() => root.unmount())
})

describe('SoundProvider', () => {
  it('keeps ambient sound off by default', () => {
    act(() => root.render(<SoundProvider><Probe /></SoundProvider>))
    expect(latest?.ambientEnabled).toBe(false)
    expect(latest?.soundEnabled).toBe(false)
  })

  it('toggles ambient sound in memory, and soundEnabled mirrors it', () => {
    const stored = window.localStorage.length
    act(() => root.render(<SoundProvider><Probe /></SoundProvider>))
    act(() => latest?.toggleAmbient())
    expect(latest?.ambientEnabled).toBe(true)
    expect(latest?.soundEnabled).toBe(true)
    act(() => latest?.toggleAmbient())
    expect(latest?.ambientEnabled).toBe(false)
    expect(window.localStorage.length).toBe(stored)
  })

  it('exposes no other way to turn sound on (only the header calls toggleAmbient)', () => {
    act(() => root.render(<SoundProvider><Probe /></SoundProvider>))
    expect(Object.keys(latest ?? {}).sort()).toEqual(['ambientEnabled', 'soundEnabled', 'toggleAmbient'])
  })

  it('a fresh provider starts off again (nothing survives a reload)', () => {
    act(() => root.render(<SoundProvider><Probe /></SoundProvider>))
    act(() => latest?.toggleAmbient())
    act(() => root.unmount())
    root = createRoot(container)
    act(() => root.render(<SoundProvider><Probe /></SoundProvider>))
    expect(latest?.ambientEnabled).toBe(false)
  })
})
