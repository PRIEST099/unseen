import { FocusTrap } from 'focus-trap-react'
import type { KeyboardEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'

type KeyboardHelpDialogProps = {
  onClose: () => void
}

const SHORTCUTS: ReadonlyArray<{ keys: readonly string[]; joiner: string; action: string }> = [
  { keys: ['Tab'], joiner: '', action: 'Move to the next control' },
  { keys: ['Shift', 'Tab'], joiner: ' + ', action: 'Move to the previous control' },
  { keys: ['Enter', 'Space'], joiner: ' or ', action: 'Activate the focused button or link' },
  { keys: ['Escape'], joiner: '', action: 'Close this dialog' },
]

export function KeyboardHelpDialog({ onClose }: KeyboardHelpDialogProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return createPortal(
    <div className="dialog-backdrop">
      {/* The trap wraps the dialog only, so a click on the backdrop counts as outside and closes it. */}
      <FocusTrap
        focusTrapOptions={{
          escapeDeactivates: false,
          // An outside click closes the dialog and is swallowed (return false), so the browser does
          // not move focus to the page body before the header returns it to the trigger.
          clickOutsideDeactivates: false,
          allowOutsideClick: () => {
            onClose()
            return false
          },
          returnFocusOnDeactivate: false,
          fallbackFocus: '#keyboard-help',
          onDeactivate: onClose,
        }}
      >
        <div
          id="keyboard-help"
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-help-title"
          className="dialog"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <h2 id="keyboard-help-title">Keyboard help</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.action}>
                  <td>
                    {shortcut.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 ? shortcut.joiner : null}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </td>
                  <td>{shortcut.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="button button-primary" aria-label="Close keyboard help" onClick={onClose}>
            Close
          </button>
        </div>
      </FocusTrap>
    </div>,
    document.body,
  )
}
