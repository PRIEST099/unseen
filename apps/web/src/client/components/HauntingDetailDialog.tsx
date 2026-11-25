import { FocusTrap } from 'focus-trap-react'
import type { Haunting } from '@the-unseen/core'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { hauntingDisplayName, SEVERITY_COLORS } from '../utils/haunting-display'
import {
  buildKiroPrompt,
  criterionEntries,
  criterionLinkText,
  criterionRoleLabel,
  isSafeCriterionUrl,
  personaLine,
  relatedIssues,
} from '../utils/haunting-detail'

type HauntingDetailDialogProps = {
  haunting: Haunting
  elementLabel: string
  auditedUrl: string
  onClose: () => void
  /** Simulates a source-code fix in this view only (task 3.2). Absent: no preview button. */
  onPreviewFix?: (haunting: Haunting) => void
}

const COPIED_MESSAGE = 'Copied the Kiro prompt to the clipboard.'
const COPY_FAILED_MESSAGE = 'Could not copy automatically. Your browser blocked clipboard access.'

function SeverityBadge({ haunting }: { haunting: Haunting }): ReactElement {
  return (
    <span className="severity-badge" style={{ color: SEVERITY_COLORS[haunting.severity] }}>
      {haunting.severity}
    </span>
  )
}

function CriteriaSection({ haunting }: { haunting: Haunting }): ReactElement {
  const entries = criterionEntries(haunting)
  return (
    <section>
      <h3>WCAG 2.2 criteria</h3>
      <ul className="dialog-list">
        {entries.map(({ criterion, role }) => (
          <li key={criterion.id}>
            {isSafeCriterionUrl(criterion.url) ? (
              <a href={criterion.url} target="_blank" rel="noopener noreferrer">
                {criterionLinkText(criterion)} (opens in a new tab)
              </a>
            ) : (
              <span>{criterionLinkText(criterion)}</span>
            )}{' '}
            <span className="dialog-muted">{criterionRoleLabel(role)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FixSection({ haunting }: { haunting: Haunting }): ReactElement {
  return (
    <section>
      <h3>Suggested fix</h3>
      <p>{haunting.fix.instruction}</p>
      <pre className="dialog-code">
        <code>{haunting.fix.codeSnippet}</code>
      </pre>
    </section>
  )
}

function RelatedSection({ related }: { related: readonly Haunting[] }): ReactElement | null {
  if (related.length === 0) return null
  return (
    <section>
      <h3>Related issues</h3>
      <ul className="dialog-list">
        {related.map((item) => (
          <li key={item.id}>
            <strong>{hauntingDisplayName(item.type)}</strong> <SeverityBadge haunting={item} /> {item.explanation}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Copies text to the clipboard; reports whether the browser allowed it. */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyPromptButton({ prompt }: { prompt: string }): ReactElement {
  const [message, setMessage] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const handleCopy = (): void => {
    void copyText(prompt).then((copied) => {
      if (mounted.current) setMessage(copied ? COPIED_MESSAGE : COPY_FAILED_MESSAGE)
    })
  }
  return (
    <>
      <button type="button" className="button" onClick={handleCopy}>
        Copy as Kiro prompt
      </button>
      <p className="dialog-copy-status" role="status">
        {message}
      </p>
    </>
  )
}

/**
 * Haunting detail dialog (requirement 16, 24): name, severity, persona, WCAG criteria with links,
 * offending HTML, suggested fix, related issues and a Kiro prompt. Focus is trapped while open.
 * The caller returns focus to the trigger once `onClose` has unmounted this dialog.
 */
export function HauntingDetailDialog({
  haunting,
  elementLabel,
  auditedUrl,
  onClose,
  onPreviewFix,
}: HauntingDetailDialogProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }
  const prompt = buildKiroPrompt(haunting, elementLabel, auditedUrl)

  return createPortal(
    <div className="dialog-backdrop">
      {/* The trap wraps the dialog only, so a click on the backdrop counts as outside and closes it. */}
      <FocusTrap
        focusTrapOptions={{
          escapeDeactivates: false,
          // An outside click closes the dialog but is swallowed (return false), so the browser does
          // not move focus to the page body before the caller returns it to the trigger.
          clickOutsideDeactivates: false,
          allowOutsideClick: () => {
            onClose()
            return false
          },
          returnFocusOnDeactivate: false,
          initialFocus: '#haunting-dialog',
          fallbackFocus: '#haunting-dialog',
          onDeactivate: onClose,
        }}
      >
        <div
          id="haunting-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="haunting-dialog-title"
          className="dialog haunting-dialog"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <h2 id="haunting-dialog-title">{hauntingDisplayName(haunting.type)}</h2>
          <p>
            <SeverityBadge haunting={haunting} />
          </p>
          <p className="dialog-persona">{personaLine(haunting)}</p>
          <p>
            <strong>Affected element:</strong> {elementLabel}
          </p>
          <p>{haunting.explanation}</p>
          <CriteriaSection haunting={haunting} />
          <section>
            <h3>Offending HTML</h3>
            <pre className="dialog-code">
              <code>{haunting.htmlSnippet}</code>
            </pre>
          </section>
          <FixSection haunting={haunting} />
          <RelatedSection related={relatedIssues(haunting)} />
          {onPreviewFix !== undefined ? (
            <div className="dialog-preview">
              <p>
                Preview only: this takes the haunting out of this view to show what a source-code fix would do. The audited page is not
                changed and the audit is not re-run.
              </p>
              <button type="button" className="button" onClick={() => onPreviewFix(haunting)}>
                Preview fix
              </button>
            </div>
          ) : null}
          <div className="dialog-actions">
            <CopyPromptButton prompt={prompt} />
            <button type="button" className="button button-primary" aria-label="Close dialog" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body,
  )
}
