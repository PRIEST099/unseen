import type { ClassifiedAudit } from '@the-unseen/core'
import { isClassifiedAudit } from './audit-source'

export const POLL_INTERVAL_MS = 500
/** Retries after a failed poll (requirement 31.5) before the séance shows the error and a Retry button. */
export const MAX_POLL_RETRIES = 3
export const RETRY_BASE_DELAY_MS = 1000
export const RETRY_MAX_DELAY_MS = 30_000

/**
 * Wait before retry number `retry` (0 for the first retry): 1 s, 2 s, 4 s, doubling each time
 * and never above 30 s. Negative or fractional input is treated as the nearest valid retry.
 */
export function retryDelayMs(retry: number): number {
  const index = Number.isFinite(retry) ? Math.max(0, Math.floor(retry)) : 0
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.min(index, 20), RETRY_MAX_DELAY_MS)
}

export type StageName = 'loading' | 'tree' | 'walking' | 'classifying'
/** A job status that is still running. The worker reports each stage when it starts. */
export type RunningStatus = 'queued' | StageName

/** Epoch-millisecond timestamps recorded by the server for each stage. */
export type JobStages = {
  queued?: number
  loading?: number
  tree?: number
  walking?: number
  classifying?: number
  done?: number
}

export type JobPoll =
  | { kind: 'running'; status: RunningStatus; stages: JobStages }
  | { kind: 'done'; audit: ClassifiedAudit; stages: JobStages }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'not-found' }
  | { kind: 'unreachable' }

export const STAGE_LABELS: Record<StageName, string> = {
  loading: 'Loading page…',
  tree: 'Reading accessibility tree…',
  walking: 'Walking the keyboard path…',
  classifying: 'Classifying hauntings…',
}

/** Shown wherever an audit job has expired. The server keeps results for one hour (`RESULT_TTL_MS`). */
export const SESSION_ENDED_MESSAGE = 'This séance has ended (results expire after 1 hour or when the server restarts).'
export const UNREACHABLE_MESSAGE = 'Could not reach the server. Check your connection and try again.'
/** The polite status line while polls are failing and being retried, before any answer has arrived. */
export const RETRYING_MESSAGE = 'Trying to reach the server again…'

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: 'The audit took too long (60s limit). The page may be too large or slow to load.',
  SSRF_BLOCKED: 'Cannot audit private or internal URLs for security reasons.',
  RESOURCE_LIMIT: 'The page is too large to audit (50MB limit).',
  NETWORK_ERROR: 'Could not load the page. Check the URL and try again.',
}

const FALLBACK_ERROR_MESSAGE = 'The audit could not be completed. Please try another URL.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The stage being worked on while the job has `status`. The worker reports each stage when it
 * starts, so the status is the active stage; a job still in the queue is shown as "loading".
 */
export function activeStage(status: RunningStatus): StageName {
  return status === 'queued' ? 'loading' : status
}

export function activeStageLabel(status: RunningStatus): string {
  return STAGE_LABELS[activeStage(status)]
}

export type CompletedStage = { stage: StageName; label: string; elapsedMs: number }

/** Where each stage begins and ends on the server timeline: queued, loading, tree, walking, classifying, done. */
const STAGE_SPANS: ReadonlyArray<{ stage: StageName; from: keyof JobStages; to: keyof JobStages }> = [
  // Each stage runs from its own start timestamp to the next stage's start. Queue wait is not a stage.
  { stage: 'loading', from: 'loading', to: 'tree' },
  { stage: 'tree', from: 'tree', to: 'walking' },
  { stage: 'walking', from: 'walking', to: 'classifying' },
  { stage: 'classifying', from: 'classifying', to: 'done' },
]

/** The stages that have finished, in order, with how long each took. */
export function completedStages(stages: JobStages): CompletedStage[] {
  const result: CompletedStage[] = []
  for (const { stage, from, to } of STAGE_SPANS) {
    const start = stages[from]
    const end = stages[to]
    if (start === undefined || end === undefined) continue
    result.push({ stage, label: STAGE_LABELS[stage], elapsedMs: Math.max(0, end - start) })
  }
  return result
}

export function formatElapsed(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
}

export function describeJobError(code: string, serverMessage: string): string {
  const known = ERROR_MESSAGES[code]
  if (known !== undefined) return known
  return serverMessage === '' ? FALLBACK_ERROR_MESSAGE : serverMessage
}

function parseStages(value: unknown): JobStages {
  if (!isRecord(value)) return {}
  const stages: JobStages = {}
  for (const key of ['queued', 'loading', 'tree', 'walking', 'classifying', 'done'] as const) {
    const entry = value[key]
    if (typeof entry === 'number' && Number.isFinite(entry)) stages[key] = entry
  }
  return stages
}

function isRunningStatus(value: unknown): value is RunningStatus {
  return value === 'queued' || value === 'loading' || value === 'tree' || value === 'walking' || value === 'classifying'
}

/** Turns a `GET /api/audit/:id` 200 body into a poll result. Anything unrecognised counts as unreachable. */
export function parseJobPoll(body: unknown): JobPoll {
  if (!isRecord(body)) return { kind: 'unreachable' }
  const { status } = body
  if (isRunningStatus(status)) return { kind: 'running', status, stages: parseStages(body.stages) }
  if (status === 'done') {
    return isClassifiedAudit(body.result)
      ? { kind: 'done', audit: body.result, stages: parseStages(body.stages) }
      : { kind: 'not-found' }
  }
  if (status === 'error') {
    const code = typeof body.error === 'string' ? body.error : ''
    const message = typeof body.message === 'string' ? body.message : ''
    return { kind: 'error', code, message: describeJobError(code, message) }
  }
  return { kind: 'unreachable' }
}

export async function fetchJobPoll(id: string, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<JobPoll> {
  try {
    const response = await fetchFn(`/api/audit/${encodeURIComponent(id)}`, { signal })
    if (response.status === 404) return { kind: 'not-found' }
    if (!response.ok) return { kind: 'unreachable' }
    const body: unknown = await response.json()
    return parseJobPoll(body)
  } catch {
    return { kind: 'unreachable' }
  }
}

export const CLEAN_ANNOUNCEMENT =
  'Audit complete: No hauntings found by automated checks; a manual review is still needed.'

/** The text for the app-level announcer on arrival at Spirit Sight. */
export function completionAnnouncement(audit: ClassifiedAudit): string {
  if (audit.hauntings.length === 0) return CLEAN_ANNOUNCEMENT
  return `Audit complete: ${audit.hauntings.length} hauntings found, Haunting Score ${audit.score}`
}

/** Why a séance stopped without a result: the audit failed, the job is gone, or the server could not be reached. */
export type FailureReason = 'error' | 'ended' | 'unreachable'

/**
 * What the séance shows. `pending` is before the first answer; `retrying` is when polls have
 * failed (or the user pressed Retry) and no answer has arrived since.
 */
export type SeanceState =
  | { phase: 'pending' }
  | { phase: 'retrying' }
  | { phase: 'running'; status: RunningStatus; stages: JobStages }
  | { phase: 'done'; audit: ClassifiedAudit; stages: JobStages }
  | { phase: 'failed'; reason: FailureReason; message: string }

export const PENDING_STATE: SeanceState = { phase: 'pending' }
export const RETRYING_STATE: SeanceState = { phase: 'retrying' }

/** The next state after one poll, how many retries have been used, and when to poll again (`null`: stop). */
export type PollStep = { state: SeanceState; retries: number; delayMs: number | null }

/**
 * One step of the polling loop. A running answer resets the retry budget; done, error and
 * not-found stop polling. A failed poll is retried up to `MAX_POLL_RETRIES` times with backoff
 * and then reported as `unreachable`. While no answer has arrived yet the séance shows
 * `retrying`; a séance that is already running keeps showing its stage through a brief blip.
 */
export function pollStep(previous: SeanceState, result: JobPoll, retries: number): PollStep {
  switch (result.kind) {
    case 'running':
      return { state: { phase: 'running', status: result.status, stages: result.stages }, retries: 0, delayMs: POLL_INTERVAL_MS }
    case 'done':
      return { state: { phase: 'done', audit: result.audit, stages: result.stages }, retries, delayMs: null }
    case 'error':
      return { state: { phase: 'failed', reason: 'error', message: result.message }, retries, delayMs: null }
    case 'not-found':
      return { state: { phase: 'failed', reason: 'ended', message: SESSION_ENDED_MESSAGE }, retries, delayMs: null }
    case 'unreachable': {
      if (retries >= MAX_POLL_RETRIES) {
        return { state: { phase: 'failed', reason: 'unreachable', message: UNREACHABLE_MESSAGE }, retries, delayMs: null }
      }
      const state = previous.phase === 'pending' ? RETRYING_STATE : previous
      return { state, retries: retries + 1, delayMs: retryDelayMs(retries) }
    }
  }
}

/** Text of the séance's polite live region: the stage being worked on, the retry line, or nothing. */
export function seanceStatusText(state: SeanceState): string {
  if (state.phase === 'running') return activeStageLabel(state.status)
  if (state.phase === 'retrying') return RETRYING_MESSAGE
  return ''
}

/** While the audit is still on its way (requirement 31.1), the séance offers Cancel. */
export function canCancel(state: SeanceState): boolean {
  return state.phase === 'pending' || state.phase === 'running'
}
