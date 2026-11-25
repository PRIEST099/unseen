import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Haunting } from '@the-unseen/core'
import { makeHaunting } from '../test-support/haunting-arbitraries'
import { HauntingDetailDialog } from './HauntingDetailDialog'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function render(haunting: Haunting, onClose = vi.fn()): { dialog: HTMLElement; onClose: ReturnType<typeof vi.fn> } {
  act(() => {
    root.render(<HauntingDetailDialog haunting={haunting} elementLabel="Add to cart" auditedUrl="/cursed-shop/index.html" onClose={onClose} />)
  })
  const dialog = document.getElementById('haunting-dialog')
  if (dialog === null) throw new Error('dialog not rendered')
  return { dialog, onClose }
}

function sectionByHeading(dialog: HTMLElement, text: string): HTMLElement | null {
  const heading = Array.from(dialog.querySelectorAll('h3')).find((h) => h.textContent === text)
  return heading?.closest('section') ?? null
}

function pointer(type: string, target: Element): void {
  // jsdom has no PointerEvent; React reads pointer handlers from these event names either way.
  const event = new MouseEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  target.dispatchEvent(event)
}

function press(down: Element, up: Element, clickTarget: Element): void {
  act(() => {
    pointer('pointerdown', down)
    down.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    pointer('pointerup', up)
    up.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('HauntingDetailDialog layout', () => {
  it('puts the Close button beside the title and keeps its accessible name', () => {
    const { dialog } = render(makeHaunting())
    const header = dialog.querySelector('.dialog-header')
    expect(header?.querySelector('h2')?.textContent).toBe('Nameless Spirit')
    const close = header?.querySelector('button')
    expect(close?.getAttribute('aria-label')).toBe('Close dialog')
    expect(close?.textContent).toBe('Close')
    expect(dialog.querySelectorAll('button[aria-label="Close dialog"]')).toHaveLength(1)
  })

  it('puts the persona under "Who is affected" and the explanation under "What\'s wrong"', () => {
    const { dialog } = render(makeHaunting())
    expect(sectionByHeading(dialog, 'Who is affected')?.querySelector('.dialog-persona')?.textContent).toBe(
      'As a blind shopper, I hear only "button".',
    )
    expect(sectionByHeading(dialog, "What's wrong")?.querySelector('p')?.textContent).toBe('The button has no accessible name.')
  })

  it('starts focus on the dialog container', async () => {
    const { dialog } = render(makeHaunting())
    // focus-trap moves initial focus on the next tick.
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(document.activeElement).toBe(dialog)
  })
})

describe('HauntingDetailDialog offending HTML', () => {
  it('shows a whole snippet without a note', () => {
    const { dialog } = render(makeHaunting())
    const section = sectionByHeading(dialog, 'Offending HTML')
    expect(section?.querySelector('code')?.textContent).toBe('<button class="buy"></button>')
    expect(section?.querySelector('.dialog-snippet-note')).toBeNull()
  })

  it('notes a snippet that core shortened (marked by a trailing ellipsis)', () => {
    const { dialog } = render(makeHaunting({ htmlSnippet: `<body class="${'a'.repeat(40)}…` }))
    const note = sectionByHeading(dialog, 'Offending HTML')?.querySelector('.dialog-snippet-note')
    expect(note?.textContent).toBe('Snippet shortened to its first 300 characters.')
  })

  it('does not call a complete 300-character element shortened', () => {
    const { dialog } = render(makeHaunting({ htmlSnippet: `<html lang="en">${'x'.repeat(284)}` }))
    expect(sectionByHeading(dialog, 'Offending HTML')?.querySelector('.dialog-snippet-note')).toBeNull()
  })

  it('hides the section when there is no snippet', () => {
    const { dialog } = render(makeHaunting({ htmlSnippet: '' }))
    expect(sectionByHeading(dialog, 'Offending HTML')).toBeNull()
    expect(sectionByHeading(dialog, 'Suggested fix')).not.toBeNull()
  })
})

describe('HauntingDetailDialog copy status', () => {
  it('replaces the status message on every successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { dialog } = render(makeHaunting())
    const button = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Copy as Kiro prompt')
    const status = dialog.querySelector('[role="status"]')
    expect(button).toBeDefined()
    expect(status?.textContent).toBe('')

    await act(async () => {
      button?.click()
    })
    const first = status?.firstElementChild
    expect(status?.textContent).toBe('Copied the Kiro prompt to the clipboard.')

    await act(async () => {
      button?.click()
    })
    const second = status?.firstElementChild
    expect(status?.textContent).toBe('Copied the Kiro prompt to the clipboard.')
    // A new node in the same live region, so screen readers announce the repeat.
    expect(second).not.toBe(first)
    expect(second?.className).toBe('dialog-copy-message')
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('says so when the browser blocks the clipboard', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } })
    const { dialog } = render(makeHaunting())
    const button = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Copy as Kiro prompt')
    await act(async () => {
      button?.click()
    })
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe('Could not copy automatically. Your browser blocked clipboard access.')
  })
})

describe('HauntingDetailDialog backdrop', () => {
  it('closes on a press that starts and ends on the backdrop', () => {
    const { dialog, onClose } = render(makeHaunting())
    const backdrop = dialog.parentElement as HTMLElement
    expect(backdrop.className).toBe('dialog-backdrop')
    press(backdrop, backdrop, backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open after a drag from the code block released on the backdrop', () => {
    const { dialog, onClose } = render(makeHaunting())
    const backdrop = dialog.parentElement as HTMLElement
    const code = dialog.querySelector('.dialog-code') as HTMLElement
    press(code, backdrop, backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open after a press inside the dialog', () => {
    const { dialog, onClose } = render(makeHaunting())
    const heading = dialog.querySelector('h2') as HTMLElement
    press(heading, heading, heading)
    expect(onClose).not.toHaveBeenCalled()
  })
})
