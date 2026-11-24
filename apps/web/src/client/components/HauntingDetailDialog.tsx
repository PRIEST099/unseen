import { FocusTrap } from 'focus-trap-react'
import type { Haunting } from '@the-unseen/core'
import type { KeyboardEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { hauntingDisplayName, SEVERITY_COLORS } from '../utils/haunting-display'

type HauntingDetailDialogProps = {
  haunting: Haunting
  elementLabel: string
  onClose: () => void
}

/**
 * Minimal haunting detail dialog (requirement 16, 24). Task 3.1 adds the persona, WCAG links,
 * HTML snippet, fix code and the "Copy as Kiro prompt" button. The caller returns focus to the
 * trigger once `onClose` has unmounted this dialog.
 */
export function HauntingDetailDialog({ haunting, elementLabel, onClose }: HauntingDetailDialogProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return createPortal(
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: false,
        clickOutsideDeactivates: true,
        returnFocusOnDeactivate: false,
        fallbackFocus: '#haunting-dialog',
        onDeactivate: onClose,
      }}
    >
      <div className="dialog-backdrop">
        <div
          id="haunting-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="haunting-dialog-title"
          className="dialog"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <h2 id="haunting-dialog-title">{hauntingDisplayName(haunting.type)}</h2>
          <p>
            <span className="severity-badge" style={{ color: SEVERITY_COLORS[haunting.severity] }}>
              {haunting.severity}
            </span>
          </p>
          <p>
            <strong>Affected element:</strong> {elementLabel}
          </p>
          <p>{haunting.explanation}</p>
          <div className="dialog-actions">
            <button type="button" className="button button-primary" aria-label="Close dialog" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>,
    document.body,
  )
}
