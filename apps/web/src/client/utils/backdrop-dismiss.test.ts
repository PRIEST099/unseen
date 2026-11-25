import { describe, expect, it, vi } from 'vitest'
import { createBackdropDismiss } from './backdrop-dismiss'
import type { BackdropPointer } from './backdrop-dismiss'

function setup(hit: Element | null = null) {
  const backdrop = document.createElement('div')
  const dialog = document.createElement('div')
  const code = document.createElement('pre')
  dialog.append(code)
  backdrop.append(dialog)
  const onDismiss = vi.fn()
  const dismiss = createBackdropDismiss(onDismiss, () => hit ?? backdrop)
  const pointer = (target: Element, pointerType = 'mouse'): BackdropPointer => ({
    target,
    currentTarget: backdrop,
    pointerType,
    clientX: 5,
    clientY: 5,
  })
  const click = (target: Element): boolean => {
    const event = new MouseEvent('click', { bubbles: true })
    target.dispatchEvent(event)
    return dismiss.allowOutsideClick(event)
  }
  const mousedown = (target: Element): boolean => {
    const event = new MouseEvent('mousedown', { bubbles: true })
    target.dispatchEvent(event)
    return dismiss.allowOutsideClick(event)
  }
  return { backdrop, dialog, code, onDismiss, dismiss, pointer, click, mousedown }
}

describe('createBackdropDismiss', () => {
  it('closes on a press that starts and ends on the backdrop', () => {
    const { backdrop, onDismiss, dismiss, pointer, click, mousedown } = setup()
    dismiss.onPointerDown(pointer(backdrop))
    expect(mousedown(backdrop)).toBe(false)
    expect(onDismiss).not.toHaveBeenCalled()
    dismiss.onPointerUp(pointer(backdrop))
    expect(click(backdrop)).toBe(false)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('stays open after a drag from a code block that is released on the backdrop', () => {
    const { backdrop, code, onDismiss, dismiss, pointer, click } = setup()
    dismiss.onPointerDown(pointer(code))
    dismiss.onPointerUp(pointer(backdrop))
    // The browser targets the click at the common ancestor, which is the backdrop.
    expect(click(backdrop)).toBe(false)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('stays open after a press that starts on the backdrop and ends inside the dialog', () => {
    const { backdrop, dialog, onDismiss, dismiss, pointer, click } = setup()
    dismiss.onPointerDown(pointer(backdrop))
    dismiss.onPointerUp(pointer(dialog))
    click(backdrop)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('ignores a click with no tracked press, and a press is used only once', () => {
    const { backdrop, onDismiss, dismiss, pointer, click } = setup()
    click(backdrop)
    expect(onDismiss).not.toHaveBeenCalled()
    dismiss.onPointerDown(pointer(backdrop))
    dismiss.onPointerUp(pointer(backdrop))
    click(backdrop)
    click(backdrop)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('never closes on a cancelled press', () => {
    const { backdrop, onDismiss, dismiss, pointer, click } = setup()
    dismiss.onPointerDown(pointer(backdrop))
    dismiss.onPointerCancel()
    dismiss.onPointerUp(pointer(backdrop))
    click(backdrop)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('closes a touch tap on pointerup when the release point is still the backdrop', () => {
    const { backdrop, onDismiss, dismiss, pointer } = setup()
    dismiss.onPointerDown(pointer(backdrop, 'touch'))
    dismiss.onPointerUp(pointer(backdrop, 'touch'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('stays open when a touch that started on the backdrop is released over the dialog', () => {
    const dialogHit = document.createElement('div')
    const { backdrop, onDismiss, dismiss, pointer } = setup(dialogHit)
    dismiss.onPointerDown(pointer(backdrop, 'touch'))
    // Touch pointers are captured, so event.target is still the backdrop; the hit test is not.
    dismiss.onPointerUp(pointer(backdrop, 'touch'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('swallows every outside event', () => {
    const { backdrop, dismiss } = setup()
    expect(dismiss.allowOutsideClick(new MouseEvent('mousedown'))).toBe(false)
    expect(dismiss.allowOutsideClick(new MouseEvent('click'))).toBe(false)
    dismiss.onPointerDown({ target: backdrop, currentTarget: backdrop, pointerType: 'mouse', clientX: 0, clientY: 0 })
    expect(dismiss.allowOutsideClick(new MouseEvent('click'))).toBe(false)
  })
})
