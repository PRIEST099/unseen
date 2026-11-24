import type { ClassifiedAudit } from '@the-unseen/core'

export type JobStatus = 'queued' | 'loading' | 'tree' | 'walking' | 'classifying' | 'done' | 'error'

/** Epoch-millisecond timestamp per stage. `queued` is always present. */
export type Stages = {
  queued: number
  loading?: number
  tree?: number
  walking?: number
  classifying?: number
  done?: number
}

/** The client-safe error: a stable code and a message that never carries a URL, IP or stack. */
export type JobError = {
  code: string
  message: string
}

export type Job = {
  id: string
  /** Server-side only. Never returned to clients. */
  url: string
  status: JobStatus
  stages: Stages
  /** The classified audit with `raw.screenshotPng` emptied. Dropped 15 minutes after completion. */
  result?: ClassifiedAudit
  /** Base64 PNG, served by the screenshot route. Dropped together with `result`. */
  screenshotPng?: string
  error?: JobError
  createdAt: number
  updatedAt: number
}

/** The minimal logger the job code needs; Fastify's logger satisfies it. */
export type JobLogger = {
  error(context: object, message?: string): void
}
