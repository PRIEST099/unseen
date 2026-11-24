import { useEffect, useState } from 'react'
import type { ClassifiedAudit } from '@the-unseen/core'
import { fetchJobPoll, MAX_UNREACHABLE_POLLS, POLL_INTERVAL_MS, SESSION_ENDED_MESSAGE, UNREACHABLE_MESSAGE } from '../utils/seance'
import type { JobStages, RunningStatus } from '../utils/seance'

export type JobPollState =
  | { phase: 'pending' }
  | { phase: 'running'; status: RunningStatus; stages: JobStages }
  | { phase: 'done'; audit: ClassifiedAudit; stages: JobStages }
  | { phase: 'failed'; message: string }

/** Before the first poll answers: the live region stays empty until there is something to say. */
const INITIAL_STATE: JobPollState = { phase: 'pending' }

/**
 * Polls `GET /api/audit/:id` every 500 ms until the job is done or has failed, then stops.
 * The next poll is scheduled only after the previous one returns, so requests never overlap.
 */
export function useJobPoll(id: string): JobPollState {
  const [state, setState] = useState<JobPollState>(INITIAL_STATE)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let unreachable = 0
    setState(INITIAL_STATE)

    const poll = async (): Promise<void> => {
      const result = await fetchJobPoll(id, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'running') {
        unreachable = 0
        setState({ phase: 'running', status: result.status, stages: result.stages })
      } else if (result.kind === 'done') {
        setState({ phase: 'done', audit: result.audit, stages: result.stages })
        return
      } else if (result.kind === 'error') {
        setState({ phase: 'failed', message: result.message })
        return
      } else if (result.kind === 'not-found') {
        setState({ phase: 'failed', message: SESSION_ENDED_MESSAGE })
        return
      } else {
        unreachable += 1
        if (unreachable >= MAX_UNREACHABLE_POLLS) {
          setState({ phase: 'failed', message: UNREACHABLE_MESSAGE })
          return
        }
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    }

    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [id])

  return state
}
