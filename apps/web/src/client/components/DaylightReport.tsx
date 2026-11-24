import { useState } from 'react'
import type { ReactElement } from 'react'
import type { ClassifiedAudit } from '@the-unseen/core'
import { buildJson, buildMarkdown, CLEAN_SITE_MESSAGE } from '../utils/audit-markdown'
import { downloadBlob } from '../utils/download'
import { buildExportFilename } from '../utils/export-filename'
import type { ExportExtension } from '../utils/export-filename'
import { hauntingDisplayName } from '../utils/haunting-display'
import { manualCheckHelp, manualCheckLabel } from '../utils/manual-check'
import { groupByWCAG } from '../utils/wcag-groups'
import type { CriterionGroup } from '../utils/wcag-groups'
import { LensNav } from './LensNav'

type DaylightReportProps = {
  audit: ClassifiedAudit
  hostname: string
  basePath: string
  /** The clock used for export filenames; `Date.now` unless a test supplies one. */
  now?: () => number
}

function criterionAnchor(id: string): string {
  return `criterion-${id.replace(/\./g, '-')}`
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function SummaryTable({ groups }: { groups: readonly CriterionGroup[] }): ReactElement {
  return (
    <table className="daylight-table">
      <caption>Hauntings grouped by WCAG criterion</caption>
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Name</th>
          <th scope="col">Level</th>
          <th scope="col">Affected elements</th>
          <th scope="col">Highest severity</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ criterion, hauntings, highestSeverity }) => (
          <tr key={criterion.id}>
            <th scope="row">{criterion.id}</th>
            <td>
              <a href={`#${criterionAnchor(criterion.id)}`}>{criterion.title}</a>
            </td>
            <td>{criterion.level}</td>
            <td>{hauntings.length}</td>
            <td>
              <span className="severity-text" data-severity={highestSeverity}>
                {highestSeverity}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CriterionDetail({ group }: { group: CriterionGroup }): ReactElement {
  const { criterion, hauntings } = group
  return (
    <section id={criterionAnchor(criterion.id)} className="criterion-detail">
      <h3>
        {criterion.id} {criterion.title} (Level {criterion.level})
      </h3>
      <p>
        <a href={criterion.url} target="_blank" rel="noopener noreferrer">
          Understanding {criterion.id} on w3.org (opens in a new tab)
        </a>
      </p>
      <table className="daylight-table">
        <caption>
          {plural(hauntings.length, 'haunting')} under {criterion.id} {criterion.title}
        </caption>
        <thead>
          <tr>
            <th scope="col">Haunting</th>
            <th scope="col">Severity</th>
            <th scope="col">Element</th>
            <th scope="col">Suggested fix</th>
          </tr>
        </thead>
        <tbody>
          {hauntings.map((haunting) => (
            <tr key={haunting.id}>
              <th scope="row">{hauntingDisplayName(haunting.type)}</th>
              <td>
                <span className="severity-text" data-severity={haunting.severity}>
                  {haunting.severity}
                </span>
              </td>
              <td>
                <code>{haunting.htmlSnippet === '' ? 'The page as a whole' : haunting.htmlSnippet}</code>
              </td>
              <td>
                <p>{haunting.fix.instruction}</p>
                <details>
                  <summary>Fix code</summary>
                  <pre>
                    <code>{haunting.fix.codeSnippet}</code>
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ManualCheckTable({ audit }: { audit: ClassifiedAudit }): ReactElement {
  if (audit.needsManualCheck.length === 0) return <p>No elements were flagged for manual review.</p>
  return (
    <table className="daylight-table">
      <caption>Elements that need a manual check</caption>
      <thead>
        <tr>
          <th scope="col">Reason</th>
          <th scope="col">Element</th>
        </tr>
      </thead>
      <tbody>
        {audit.needsManualCheck.map((node, index) => (
          <tr key={`${node.backendDOMNodeId}-${node.reason}-${index}`}>
            <th scope="row">
              {manualCheckLabel(node.reason)}
              <span className="row-help">{manualCheckHelp(node.reason)}</span>
            </th>
            <td>
              <code>{node.htmlSnippet}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const EXPORT_MIME: Record<ExportExtension, string> = {
  md: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
}

/** The calm WCAG report: coverage note, criterion table, manual checks and the two exports. */
export function DaylightReport({ audit, hostname, basePath, now = Date.now }: DaylightReportProps): ReactElement {
  const [exportStatus, setExportStatus] = useState('')
  const groups = groupByWCAG(audit.hauntings)

  function runExport(extension: ExportExtension): void {
    const content = extension === 'md' ? buildMarkdown(audit) : buildJson(audit)
    const filename = buildExportFilename(audit.raw.auditedUrl, now(), extension)
    downloadBlob(new Blob([content], { type: EXPORT_MIME[extension] }), filename)
    setExportStatus(`Exported ${filename}`)
  }

  return (
    <>
      <h1>Daylight report: {hostname}</h1>
      <div className="lens-bar">
        <LensNav basePath={basePath} current="daylight" />
      </div>

      <div className="daylight-note" role="note" aria-label="Coverage note">
        <strong>Important</strong>
        <p>{audit.automatedCoverageNote}</p>
      </div>

      <p className="daylight-score">
        Haunting Score: <strong>{audit.score}/100</strong> ({plural(audit.hauntings.length, 'haunting')} detected)
      </p>

      <div className="daylight-exports">
        <button type="button" className="button" onClick={() => runExport('md')}>
          Export as Markdown
        </button>
        <button type="button" className="button" onClick={() => runExport('json')}>
          Export as JSON
        </button>
      </div>
      <p role="status" className="daylight-export-status">
        {exportStatus}
      </p>

      <section aria-labelledby="daylight-findings">
        <h2 id="daylight-findings">Findings by WCAG criterion</h2>
        {groups.length === 0 ? (
          <p className="clean-note">{CLEAN_SITE_MESSAGE}</p>
        ) : (
          <>
            <SummaryTable groups={groups} />
            {groups.map((group) => (
              <CriterionDetail key={group.criterion.id} group={group} />
            ))}
          </>
        )}
      </section>

      <section aria-labelledby="daylight-manual">
        <h2 id="daylight-manual">Needs manual check</h2>
        <p>These elements could not be verified automatically. A person has to check them.</p>
        <ManualCheckTable audit={audit} />
      </section>
    </>
  )
}
