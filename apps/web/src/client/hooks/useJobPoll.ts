import { useCallback, useEffect, useState } from 'react'
import type { ClassifiedAudit } from '@the-unseen/core'
import { fetchJobPoll, MAX_POLL_RETRIES, POLL_INTERVAL_MS, retryDelayMs, SESSION_ENDED_MESSAGE, UNREACHABLE_MESSAGE } from '../utils/seance'
import type { JobStages, RunningStatus } from '../utils/seance'

/** Why a séance stopped without a result: the audit failed, the job is gone, or the server could not be reached. */
export type FailureReason = 'error' | 'ended' | 'unreachable'

export type JobPollState =
  | { phase: 'pending' }
  | { phase: 'running'; status: RunningStatus; stages: JobStages }
  | { phase: 'done'; audit: ClassifiedAudit; stages: JobStages }
  | { phase: 'failed'; reason: FailureReason; message: string }

/** Before the first poll answers: the live region stays empty until there is something to say. */
const INITIAL_STATE: JobPollState = { phase: 'pending' }

export type JobPoll = { state: JobPollState; retry: () => void }

/**
 * Polls `GET /api/audit/:id` every 500 ms until the job is done or has failed, then stops.
 * The next poll is scheduled only after the previous one returns, so requests never overlap.
 * After a network failure it retries up to 3 times (1 s, 2 s, 4 s apart) and then reports an
 * `unreachable` failure; `retry()` starts polling again with a fresh retry budget.
 */
export function useJobPoll(id: string): JobPoll {
  const [state, setState] = useState<JobPollState>(INITIAL_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let retries = 0
    setState(INITIAL_STATE)

    const poll = async (): Promise<void> => {
      const result = await fetchJobPoll(id, controller.signal)
      if (controller.signal.aborted) return
      let delay = POLL_INTERVAL_MS
      if (result.kind === 'running') {
        retries = 0
        setState({ phase: 'running', status: result.status, stages: result.stages })
      } else if (result.kind === 'done') {
        setState({ phase: 'done', audit: result.audit, stages: result.stages })
        return
      } else if (result.kind === 'error') {
        setState({ phase: 'failed', reason: 'error', message: result.message })
        return
      } else if (result.kind === 'not-found') {
        setState({ phase: 'failed', reason: 'ended', message: SESSION_ENDED_MESSAGE })
        return
      } else {
        if (retries >= MAX_POLL_RETRIES) {
          setState({ phase: 'failed', reason: 'unreachable', message: UNREACHABLE_MESSAGE })
          return
        }
        delay = retryDelayMs(retries)
        retries += 1
      }
      timer = setTimeout(() => void poll(), delay)
    }

    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [id, attempt])

  const retry = useCallback((): void => setAttempt((previous) => previous + 1), [])
  return { state, retry }
}
