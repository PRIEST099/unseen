import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyboardHelpDialog } from './KeyboardHelpDialog'

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
})

function render(): { panel: HTMLElement; backdrop: HTMLElement; onClose: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn()
  act(() => {
    root.render(<KeyboardHelpDialog onClose={onClose} />)
  })
  const panel = document.getElementById('keyboard-help')
  if (panel === null || panel.parentElement === null) throw new Error('dialog not rendered')
  return { panel, backdrop: panel.parentElement, onClose }
}

function pointer(type: string, target: Element): void {
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

describe('KeyboardHelpDialog', () => {
  it('is a modal panel inside the backdrop, named by its heading', () => {
    const { panel, backdrop } = render()
    expect(backdrop.className).toBe('dialog-backdrop')
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Keyboard help')
  })

  it('closes on a press that starts and ends on the backdrop', () => {
    const { backdrop, onClose } = render()
    press(backdrop, backdrop, backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open after a drag out of the panel released on the backdrop', () => {
    const { panel, backdrop, onClose } = render()
    const cell = panel.querySelector('td') as HTMLElement
    press(cell, backdrop, backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape and on its Close button', () => {
    const { panel, onClose } = render()
    act(() => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => {
      ;(panel.querySelector('button[aria-label="Close keyboard help"]') as HTMLButtonElement).click()
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
