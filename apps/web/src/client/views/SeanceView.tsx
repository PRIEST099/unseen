import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAnnouncer } from '../contexts/AnnouncerContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'
import { useJobPoll } from '../hooks/useJobPoll'
import type { JobPollState } from '../hooks/useJobPoll'
import { primeAudit } from '../utils/audit-source'
import { activeStageLabel, completedStages, completionAnnouncement, formatElapsed } from '../utils/seance'

/** Text of the polite live region: empty until the first poll answers, then the stage being worked on. */
function liveText(state: JobPollState): string {
  return state.phase === 'running' ? activeStageLabel(state.status) : ''
}

function CompletedList({ state }: { state: JobPollState }): ReactElement | null {
  if (state.phase !== 'running') return null
  const stages = completedStages(state.stages)
  if (stages.length === 0) return null
  return (
    <ul className="seance-stages" aria-label="Completed stages">
      {stages.map((stage) => (
        <li key={stage.stage}>
          {stage.label} {formatElapsed(stage.elapsedMs)}
        </li>
      ))}
    </ul>
  )
}

export function SeanceView(): ReactElement {
  useDocumentTitle('The séance')
  useFocusMain()
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const { announce } = useAnnouncer()
  const state = useJobPoll(jobId)

  useEffect(() => {
    if (state.phase !== 'done') return
    primeAudit({ kind: 'job', id: jobId }, state.audit)
    announce(completionAnnouncement(state.audit))
    navigate(`/audit/${encodeURIComponent(jobId)}`, { replace: true, state: { fromSeance: true } })
  }, [state, jobId, navigate, announce])

  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>The séance</h1>
      {/* The live regions are always in the DOM; only their text changes. */}
      <p className="seance-stage" role="status" aria-live="polite">
        {liveText(state)}
      </p>
      <CompletedList state={state} />
      <p className="form-error" aria-live="assertive">
        {state.phase === 'failed' ? state.message : ''}
      </p>
      {state.phase === 'failed' ? (
        <button type="button" className="button button-primary" onClick={() => navigate('/')}>
          Try another URL
        </button>
      ) : null}
    </main>
  )
}
