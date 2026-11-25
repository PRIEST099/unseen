import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { previewNoticeText, reserveCount } from '../utils/fix-preview'
import { hauntingDisplayName, mostSevere, SEVERITY_COLORS } from '../utils/haunting-display'
import { groupHauntings } from '../utils/haunting-groups'
import { manualCheckLabel } from '../utils/manual-check'
import type { HauntingGroup } from '../utils/haunting-groups'

export const CLEAN_SITE_MESSAGE = 'No hauntings found by automated checks; a manual review is still needed.'

/**
 * A fix preview in progress: the audited score, every primary haunting as audited (in order), the
 * ids taken out of the view, and the way back.
 */
export type SidebarPreview = {
  auditedScore: number
  audited: readonly Haunting[]
  takenOut: ReadonlySet<string>
  onReset: () => void
}

export const PREVIEW_HINT = 'No fix preview yet. Open a haunting and choose Preview fix to see what a source-code fix would do to the score.'

const NO_IDS: ReadonlySet<string> = new Set()

type NoticeProps = { auditedScore: number; takenOut: number; remaining: number; onReset?: () => void }

/** The preview notice: the audited score, what is taken out, and the reset button. */
function PreviewNotice({ auditedScore, takenOut, remaining, onReset }: NoticeProps): ReactElement {
  return (
    <div className={onReset === undefined ? 'preview-reserve' : 'preview-banner'} aria-hidden={onReset === undefined ? true : undefined}>
      <p className="preview-audited">Audited score: {auditedScore}/100</p>
      <p>{previewNoticeText(takenOut, remaining)}</p>
      {onReset === undefined ? (
        <button type="button" className="button" disabled tabIndex={-1}>
          Reset preview
        </button>
      ) : (
        <button type="button" className="button" onClick={onReset}>
          Reset preview
        </button>
      )}
    </div>
  )
}

/**
 * Always rendered under the score, so starting or resetting a preview never changes what sits above
 * the screenshot. In the one-column layout the sidebar is above the stage, so the slot keeps the
 * room of the largest notice (the hidden reserve copies, sized in spirit-sight.css) and only swaps
 * the hint for the notice; the screenshot and its overlays stay put while a haunting takes form.
 */
function PreviewSlot({ total, preview, remaining }: { total: number; preview?: SidebarPreview; remaining: number }): ReactElement {
  const widest = reserveCount(total)
  return (
    <div className="preview-slot">
      <PreviewNotice auditedScore={100} takenOut={widest} remaining={1} />
      <PreviewNotice auditedScore={100} takenOut={widest} remaining={0} />
      {preview === undefined ? (
        <p className="preview-hint">{PREVIEW_HINT}</p>
      ) : (
        <PreviewNotice auditedScore={preview.auditedScore} takenOut={preview.takenOut.size} remaining={remaining} onReset={preview.onReset} />
      )}
    </div>
  )
}

type HauntingSidebarProps = {
  audit: ClassifiedAudit
  labels: ReadonlyMap<string, string>
  onOpen: (haunting: Haunting, trigger: HTMLElement) => void
  onActiveChange: (id: string | null) => void
  /** Set while a fix preview is active: `audit` then holds the previewed hauntings and score. */
  preview?: SidebarPreview
  children?: ReactNode
}

function scoreTone(audit: ClassifiedAudit): string {
  if (audit.score === 0) return 'score-clean'
  const worst = mostSevere(audit.hauntings.map((haunting) => haunting.severity))
  return `score-${worst.toLowerCase()}`
}

function Gravestone(): ReactElement {
  return (
    <svg className="gravestone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 22V9a7 7 0 0 1 14 0v13zM11 6l-2 4 3 2-1 4 3-3-2-3 2-4z" fillRule="evenodd" />
    </svg>
  )
}

/** A clean audit still lists what automation could not decide (requirement 31.3). */
function ManualCheckList({ nodes }: { nodes: ClassifiedAudit['needsManualCheck'] }): ReactElement | null {
  if (nodes.length === 0) return null
  return (
    <section className="manual-check" aria-labelledby="manual-check-title">
      <h3 id="manual-check-title">Needs manual check ({nodes.length})</h3>
      <ul className="manual-check-list">
        {nodes.map((node, index) => (
          <li key={`${node.backendDOMNodeId}-${node.reason}-${index}`}>
            <strong>{manualCheckLabel(node.reason)}</strong>
            <code>{node.htmlSnippet}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}

type GroupProps = {
  group: HauntingGroup
  expanded: boolean
  labels: ReadonlyMap<string, string>
  /** Instances previewed as fixed: they keep their row, marked as taken out, so the list never shrinks. */
  takenOut: ReadonlySet<string>
  onToggle: () => void
  onOpen: HauntingSidebarProps['onOpen']
  onActiveChange: HauntingSidebarProps['onActiveChange']
}

function Group({ group, expanded, labels, takenOut, onToggle, onOpen, onActiveChange }: GroupProps): ReactElement {
  const name = hauntingDisplayName(group.type)
  const listId = `haunting-group-${group.type}`
  const structural = group.type === 'ShatteredOrder'
  const remaining = group.instances.filter((haunting) => !takenOut.has(haunting.id))
  const severity = remaining.length === 0 ? null : mostSevere(remaining.map((haunting) => haunting.severity))
  if (group.severity === null) {
    return (
      <li>
        <h3 className="group-empty">
          <span>{name}</span>
          <span className="group-count">0</span>
        </h3>
      </li>
    )
  }
  return (
    <li className={structural ? 'group-structural' : undefined}>
      <h3>
        <button type="button" className="group-toggle" aria-expanded={expanded} aria-controls={listId} onClick={onToggle}>
          <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M5 2l6 6-6 6" />
          </svg>
          <span>{name}</span>
          <span className="group-count">{remaining.length}</span>
          {severity === null ? (
            // Every instance is previewed as fixed: the audited severity keeps its room, unseen and unread.
            <span className="group-severity is-cleared" aria-hidden="true">
              {group.severity}
            </span>
          ) : (
            <span className="group-severity" style={{ color: SEVERITY_COLORS[severity] }}>
              {severity}
            </span>
          )}
        </button>
      </h3>
      <ul id={listId} className="instance-list" hidden={!expanded}>
        {group.instances.map((haunting) => (
          <li key={haunting.id}>
            {takenOut.has(haunting.id) ? (
              <span className="instance-taken-out">
                {structural ? <Gravestone /> : null}
                <span>{labels.get(haunting.id) ?? name}</span>
                <span className="sr-only">, taken out in this preview</span>
              </span>
            ) : (
              <button
                type="button"
                className="instance-button"
                onClick={(event) => onOpen(haunting, event.currentTarget)}
                onFocus={() => onActiveChange(haunting.id)}
                onBlur={() => onActiveChange(null)}
                onMouseEnter={() => onActiveChange(haunting.id)}
                onMouseLeave={() => onActiveChange(null)}
              >
                {structural ? <Gravestone /> : null}
                <span>{labels.get(haunting.id) ?? name}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Score, ten haunting groups with counts and severity colours, and instance buttons (requirement 11). */
export function HauntingSidebar({ audit, labels, onOpen, onActiveChange, preview, children }: HauntingSidebarProps): ReactElement {
  // During a preview the rows come from the audited list, so previewed instances keep their place.
  const rows = preview?.audited ?? audit.hauntings
  const takenOut = preview?.takenOut ?? NO_IDS
  const groups = useMemo(() => groupHauntings(rows), [rows])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const tone = scoreTone(audit)
  const clean = audit.hauntings.length === 0

  const toggle = (type: string): void =>
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  return (
    <section className="spirit-sidebar" aria-labelledby="haunting-list">
      <h2 id="haunting-list" tabIndex={-1}>
        Hauntings
      </h2>
      <p className="score">
        {preview === undefined ? 'Haunting Score' : 'Preview score'} <span className={`score-value ${tone}`}>{audit.score}</span>/100
      </p>
      <div className={`score-bar ${tone}`} aria-hidden="true">
        <span style={{ width: `${Math.min(Math.max(audit.score, 0), 100)}%` }} />
      </div>
      {/* Only an audit with hauntings can be previewed; a clean audit never shows the slot. */}
      {rows.length > 0 ? <PreviewSlot total={rows.length} preview={preview} remaining={audit.hauntings.length} /> : null}
      {clean && preview === undefined ? (
        <>
          <p className="clean-note">{CLEAN_SITE_MESSAGE}</p>
          <p className="coverage-note">{audit.automatedCoverageNote}</p>
          <ManualCheckList nodes={audit.needsManualCheck} />
        </>
      ) : null}
      <ul className="group-list">
        {groups.map((group) => (
          <Group
            key={group.type}
            group={group}
            expanded={expanded.has(group.type)}
            labels={labels}
            takenOut={takenOut}
            onToggle={() => toggle(group.type)}
            onOpen={onOpen}
            onActiveChange={onActiveChange}
          />
        ))}
      </ul>
      {children}
    </section>
  )
}
