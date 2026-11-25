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
  hasSnippet,
  isSafeCriterionUrl,
  isSnippetShortened,
  personaLine,
  relatedIssues,
  SNIPPET_SHORTENED_NOTE,
} from '../utils/haunting-detail'
import { useBackdropDismiss } from '../utils/backdrop-dismiss'

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

/** The offending HTML, with a note when core shortened it; omitted when there is none. */
function OffendingHtmlSection({ htmlSnippet }: { htmlSnippet: string }): ReactElement | null {
  if (!hasSnippet(htmlSnippet)) return null
  return (
    <section>
      <h3>Offending HTML</h3>
      <pre className="dialog-code">
        <code>{htmlSnippet}</code>
      </pre>
      {isSnippetShortened(htmlSnippet) ? <p className="dialog-muted dialog-snippet-note">{SNIPPET_SHORTENED_NOTE}</p> : null}
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

type CopyStatus = { message: string; attempt: number }

/**
 * The copy button and its status line. The status is cleared when a copy starts and set when it
 * finishes; the message sits in a span keyed by the attempt number, so a repeated success replaces
 * the node and is announced (and fades in) again instead of leaving the live region unchanged.
 */
function CopyPromptButton({ prompt }: { prompt: string }): ReactElement {
  const [status, setStatus] = useState<CopyStatus>({ message: '', attempt: 0 })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const handleCopy = (): void => {
    setStatus((previous) => ({ message: '', attempt: previous.attempt }))
    void copyText(prompt).then((copied) => {
      if (!mounted.current) return
      setStatus((previous) => ({ message: copied ? COPIED_MESSAGE : COPY_FAILED_MESSAGE, attempt: previous.attempt + 1 }))
    })
  }
  return (
    <>
      <button type="button" className="button button-primary" onClick={handleCopy}>
        Copy as Kiro prompt
      </button>
      <p className="dialog-copy-status" role="status">
        <span key={status.attempt} className={status.message === '' ? undefined : 'dialog-copy-message'}>
          {status.message}
        </span>
      </p>
    </>
  )
}

/**
 * Haunting detail dialog (requirement 16, 24): name, severity, persona, WCAG criteria with links,
 * offending HTML, suggested fix, related issues and a Kiro prompt. Focus is trapped while open and
 * starts on the dialog container, so a screen reader reads the dialog from its title down; the
 * container draws no extra focus ring because its border already marks it. Escape, the Close
 * button beside the title, or a press that starts and ends on the backdrop close it. The caller
 * returns focus to the trigger once `onClose` has unmounted this dialog.
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
  const backdrop = useBackdropDismiss(onClose)

  return createPortal(
    <div
      className="dialog-backdrop"
      onPointerDown={backdrop.onPointerDown}
      onPointerUp={backdrop.onPointerUp}
      onPointerCancel={backdrop.onPointerCancel}
    >
      {/* The trap wraps the dialog only, so the backdrop counts as outside it. */}
      <FocusTrap
        focusTrapOptions={{
          // focus-trap listens for Escape on the document from the moment the dialog opens, before its
          // initial focus lands, so an Escape pressed straight away still closes it (onDeactivate).
          escapeDeactivates: true,
          // Outside presses are swallowed, so focus never falls to the page body; only a press that
          // starts and ends on the backdrop closes the dialog (never a drag out of a code block).
          clickOutsideDeactivates: false,
          allowOutsideClick: backdrop.allowOutsideClick,
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
          <div className="dialog-header">
            <h2 id="haunting-dialog-title">{hauntingDisplayName(haunting.type)}</h2>
            <button type="button" className="button" aria-label="Close dialog" onClick={onClose}>
              Close
            </button>
          </div>
          <p>
            <SeverityBadge haunting={haunting} />
          </p>
          <p>
            <strong>Affected element:</strong> {elementLabel}
          </p>
          <section>
            <h3>Who is affected</h3>
            <p className="dialog-persona">{personaLine(haunting)}</p>
          </section>
          <section>
            <h3>What&apos;s wrong</h3>
            <p>{haunting.explanation}</p>
          </section>
          <CriteriaSection haunting={haunting} />
          <OffendingHtmlSection htmlSnippet={haunting.htmlSnippet} />
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
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body,
  )
}
