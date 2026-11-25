/**
 * Backdrop dismissal for modal dialogs (fix list items 9 and 13).
 *
 * A modal closes on a backdrop press only when the press both started and ended on the backdrop
 * itself. A drag that starts inside the dialog (for example selecting text in a code block) and is
 * released over the backdrop must not close it, and neither must a press that starts on the
 * backdrop and ends inside the dialog.
 *
 * The focus trap swallows every outside mousedown, touchstart and click (`allowOutsideClick`
 * always returns false), so the page beneath never receives them and the browser never moves focus
 * to the body before the caller returns it to the trigger. The trap calls `allowOutsideClick` for
 * the mousedown as well as the click; only a click that completes a tracked backdrop press closes.
 *
 * Touch is handled on `pointerup`, because the trap cancels `touchstart`, which stops the browser
 * from firing the compatibility click. A touch pointer is implicitly captured by the element it
 * started on, so the release point is hit-tested instead of trusting `event.target`.
 */
import { useRef, useState } from 'react'

/** The parts of a React or DOM pointer event this module reads. */
export type BackdropPointer = {
  target: EventTarget | null
  currentTarget: EventTarget | null
  pointerType: string
  clientX: number
  clientY: number
}

export type BackdropDismiss = {
  /** Attach to the backdrop's `onPointerDown`; events from inside the dialog bubble here too. */
  onPointerDown: (event: BackdropPointer) => void
  /** Attach to the backdrop's `onPointerUp`. */
  onPointerUp: (event: BackdropPointer) => void
  /** Attach to the backdrop's `onPointerCancel`: a cancelled press (scroll, pan) never closes. */
  onPointerCancel: () => void
  /** Pass as focus-trap's `allowOutsideClick`. Always false: outside events are swallowed. */
  allowOutsideClick: (event: MouseEvent | TouchEvent) => boolean
}

type HitTest = (x: number, y: number) => Element | null

const defaultHitTest: HitTest = (x, y) => (typeof document === 'undefined' ? null : document.elementFromPoint(x, y))

export function createBackdropDismiss(onDismiss: () => void, hitTest: HitTest = defaultHitTest): BackdropDismiss {
  /** The backdrop, when the current press started on it; null otherwise. */
  let pressedOn: EventTarget | null = null
  /** Whether the current press was released on the same backdrop. */
  let releasedOnBackdrop = false

  const reset = (): void => {
    pressedOn = null
    releasedOnBackdrop = false
  }

  return {
    onPointerDown(event) {
      releasedOnBackdrop = false
      pressedOn = event.target !== null && event.target === event.currentTarget ? event.currentTarget : null
    },
    onPointerUp(event) {
      if (pressedOn === null) return
      if (event.pointerType === 'touch') {
        const backdrop = pressedOn
        reset()
        if (hitTest(event.clientX, event.clientY) === backdrop) onDismiss()
        return
      }
      releasedOnBackdrop = event.target === pressedOn
    },
    onPointerCancel: reset,
    allowOutsideClick(event) {
      if (event.type !== 'click') return false
      const shouldDismiss = pressedOn !== null && releasedOnBackdrop && event.target === pressedOn
      reset()
      if (shouldDismiss) onDismiss()
      return false
    },
  }
}

/**
 * One stable backdrop-dismiss controller per dialog mount. It always calls the latest `onDismiss`,
 * so the focus-trap options that hold `allowOutsideClick` never go stale.
 */
export function useBackdropDismiss(onDismiss: () => void): BackdropDismiss {
  const latest = useRef(onDismiss)
  latest.current = onDismiss
  const [dismiss] = useState(() => createBackdropDismiss(() => latest.current()))
  return dismiss
}
