import { useCallback, useEffect, useState } from 'react'
import { fetchJobPoll, PENDING_STATE, pollStep, RETRYING_STATE } from '../utils/seance'
import type { FailureReason, SeanceState } from '../utils/seance'

export type { FailureReason }
export type JobPollState = SeanceState

export type JobPoll = { state: JobPollState; retry: () => void }

/** Which job is being polled and how many times the user has pressed Retry for it. */
type Run = { id: string; attempt: number }

/**
 * Polls `GET /api/audit/:id` every 500 ms until the job is done or has failed, then stops.
 * The next poll is scheduled only after the previous one returns, so requests never overlap.
 * After a network failure it retries up to 3 times (1 s, 2 s, 4 s apart) and then reports an
 * `unreachable` failure; `retry()` starts polling again with a fresh retry budget and shows the
 * `retrying` phase until the server answers. The step logic lives in `pollStep` (utils/seance).
 */
export function useJobPoll(id: string): JobPoll {
  const [state, setState] = useState<JobPollState>(PENDING_STATE)
  const [run, setRun] = useState<Run>({ id, attempt: 0 })

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let retries = 0
    // A Retry press for this job starts in `retrying`, so the page never sits silent during backoff.
    let current: JobPollState = run.id === id && run.attempt > 0 ? RETRYING_STATE : PENDING_STATE
    setState(current)

    const poll = async (): Promise<void> => {
      const result = await fetchJobPoll(id, controller.signal)
      if (controller.signal.aborted) return
      const step = pollStep(current, result, retries)
      retries = step.retries
      if (step.state !== current) {
        current = step.state
        setState(step.state)
      }
      if (step.delayMs !== null) timer = setTimeout(() => void poll(), step.delayMs)
    }

    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [id, run])

  const retry = useCallback(
    (): void => setRun((previous) => ({ id, attempt: previous.id === id ? previous.attempt + 1 : 1 })),
    [id],
  )
  return { state, retry }
}
