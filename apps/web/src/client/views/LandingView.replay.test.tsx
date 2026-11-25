import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const config = vi.hoisted(() => ({ replay: true, basePath: '/unseen/', liveUrl: '' }))

vi.mock('../utils/replay-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/replay-config')>()
  return { ...original, replayConfig: config }
})

const { LandingView } = await import('./LandingView')

let container: HTMLDivElement
let root: Root
let requested: string[]

async function renderLanding(liveUrl: string): Promise<void> {
  config.liveUrl = liveUrl
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <LandingView />
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  requested = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
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

describe('LandingView in the replay edition', () => {
  it('disables the URL form and says why, with the live URL when one is set', async () => {
    await renderLanding('https://live.example.com/')
    const input = container.querySelector('input')
    const button = container.querySelector('button[type="submit"]')
    expect(input?.disabled).toBe(true)
    expect(button?.hasAttribute('disabled')).toBe(true)
    const note = container.querySelector('#replay-note')
    expect(note?.textContent).toBe(
      'This is the replay edition: pre-recorded audits of our haunted demo shop. The live auditor runs at https://live.example.com/.',
    )
    expect(note?.querySelector('a')?.getAttribute('href')).toBe('https://live.example.com/')
    expect(input?.getAttribute('aria-describedby')).toBe('replay-note')
  })

  it('leaves the second sentence out when the live URL is empty', async () => {
    await renderLanding('')
    const note = container.querySelector('#replay-note')
    expect(note?.textContent).toBe('This is the replay edition: pre-recorded audits of our haunted demo shop.')
    expect(note?.querySelector('a')).toBeNull()
  })

  it('loads the sample list from a static file, not /api', async () => {
    await renderLanding('')
    expect(requested).toEqual(['/unseen/replay-data/index.json'])
  })
})
