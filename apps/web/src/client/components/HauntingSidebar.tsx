import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { hauntingDisplayName, mostSevere, SEVERITY_COLORS } from '../utils/haunting-display'
import { groupHauntings } from '../utils/haunting-groups'
import { manualCheckLabel } from '../utils/manual-check'
import type { HauntingGroup } from '../utils/haunting-groups'

export const CLEAN_SITE_MESSAGE = 'No hauntings found by automated checks; a manual review is still needed.'

type HauntingSidebarProps = {
  audit: ClassifiedAudit
  labels: ReadonlyMap<string, string>
  onOpen: (haunting: Haunting, trigger: HTMLElement) => void
  onActiveChange: (id: string | null) => void
  /** Set while a fix preview is active: `audit` then holds the previewed hauntings and score. */
  preview?: { auditedScore: number }
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
  onToggle: () => void
  onOpen: HauntingSidebarProps['onOpen']
  onActiveChange: HauntingSidebarProps['onActiveChange']
}

function Group({ group, expanded, labels, onToggle, onOpen, onActiveChange }: GroupProps): ReactElement {
  const name = hauntingDisplayName(group.type)
  const listId = `haunting-group-${group.type}`
  const structural = group.type === 'ShatteredOrder'
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
          <span className="group-count">{group.count}</span>
          <span className="group-severity" style={{ color: SEVERITY_COLORS[group.severity] }}>
            {group.severity}
          </span>
        </button>
      </h3>
      <ul id={listId} className="instance-list" hidden={!expanded}>
        {group.instances.map((haunting) => (
          <li key={haunting.id}>
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
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Score, ten haunting groups with counts and severity colours, and instance buttons (requirement 11). */
export function HauntingSidebar({ audit, labels, onOpen, onActiveChange, preview, children }: HauntingSidebarProps): ReactElement {
  const groups = useMemo(() => groupHauntings(audit.hauntings), [audit.hauntings])
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
      {preview !== undefined ? <p className="dialog-muted">Audited score: {preview.auditedScore}/100</p> : null}
      <div className={`score-bar ${tone}`} aria-hidden="true">
        <span style={{ width: `${Math.min(Math.max(audit.score, 0), 100)}%` }} />
      </div>
      {clean && preview === undefined ? (
        <>
          <p className="clean-note">{CLEAN_SITE_MESSAGE}</p>
          <p className="coverage-note">{audit.automatedCoverageNote}</p>
          <ManualCheckList nodes={audit.needsManualCheck} />
        </>
      ) : null}
      {clean && preview !== undefined ? (
        <p className="clean-note">No hauntings are left in this preview. The audit has not been re-run, so this says nothing about the page itself.</p>
      ) : null}
      <ul className="group-list">
        {groups.map((group) => (
          <Group
            key={group.type}
            group={group}
            expanded={expanded.has(group.type)}
            labels={labels}
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
