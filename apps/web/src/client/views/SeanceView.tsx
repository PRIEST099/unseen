import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SessionEnded } from '../components/SessionEnded'
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

type FailureActionsProps = { state: JobPollState; jobId: string; onRetry: () => void }

/** What the user can do once the séance has stopped without a result. */
function FailureActions({ state, jobId, onRetry }: FailureActionsProps): ReactElement | null {
  const navigate = useNavigate()
  if (state.phase !== 'failed') return null
  if (state.reason === 'ended') return <SessionEnded jobId={jobId} />
  return (
    <div className="state-actions">
      {state.reason === 'unreachable' ? (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      <button
        type="button"
        className={state.reason === 'unreachable' ? 'button' : 'button button-primary'}
        onClick={() => navigate('/')}
      >
        Try another URL
      </button>
    </div>
  )
}

export function SeanceView(): ReactElement {
  useDocumentTitle('The séance')
  useFocusMain()
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const { announce } = useAnnouncer()
  const { state, retry } = useJobPoll(jobId)

  useEffect(() => {
    if (state.phase !== 'done') return
    primeAudit({ kind: 'job', id: jobId }, state.audit)
    announce(completionAnnouncement(state.audit))
    navigate(`/audit/${encodeURIComponent(jobId)}`, { replace: true, state: { fromSeance: true } })
  }, [state, jobId, navigate, announce])

  const handleRetry = (): void => {
    // The Retry button leaves the page when polling restarts, so keep focus in the view.
    document.getElementById('main')?.focus()
    retry()
  }

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
      <FailureActions state={state} jobId={jobId} onRetry={handleRetry} />
    </main>
  )
}
