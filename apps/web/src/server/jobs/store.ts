import type { Job } from './types.js'

export const JOB_TTL_MS = 60 * 60 * 1000
/**
 * How long a finished result is kept. It matches the client copy ("results expire after 1 hour",
 * `SESSION_ENDED_MESSAGE`); memory stays bounded because at most `MAX_DONE_JOBS` done jobs are kept.
 */
export const RESULT_TTL_MS = 60 * 60 * 1000
export const MAX_DONE_JOBS = 50
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

export type JobStoreOptions = {
  /** Clock seam for tests. Defaults to `Date.now`. */
  now?: () => number
  jobTtlMs?: number
  resultTtlMs?: number
  maxDoneJobs?: number
  cleanupIntervalMs?: number
}

/**
 * In-memory job store. Created per server (not a module singleton) so tests can inject their own.
 * Cleanup rules: jobs idle for more than an hour are removed, finished results older than
 * `RESULT_TTL_MS` (one hour) are dropped (metadata stays while the job lives), and at most 50 done
 * jobs are kept (newest first). With the defaults both TTLs are one hour, so an expired done job is
 * removed outright; a shorter `resultTtlMs` keeps the metadata after the result is dropped.
 */
export class JobStore {
  private readonly jobs = new Map<string, Job>()
  private timer: NodeJS.Timeout | undefined
  private readonly now: () => number
  private readonly jobTtlMs: number
  private readonly resultTtlMs: number
  private readonly maxDoneJobs: number
  private readonly cleanupIntervalMs: number

  constructor(options: JobStoreOptions = {}) {
    this.now = options.now ?? Date.now
    this.jobTtlMs = options.jobTtlMs ?? JOB_TTL_MS
    this.resultTtlMs = options.resultTtlMs ?? RESULT_TTL_MS
    this.maxDoneJobs = options.maxDoneJobs ?? MAX_DONE_JOBS
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS
  }

  get size(): number {
    return this.jobs.size
  }

  set(job: Job): void {
    this.jobs.set(job.id, job)
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  /** Functional update: `updater` sees the current job and returns the fields to change. */
  update(id: string, updater: (job: Job) => Partial<Job>): void {
    const job = this.jobs.get(id)
    if (!job) return
    this.jobs.set(id, { ...job, ...updater(job), updatedAt: this.now() })
  }

  delete(id: string): void {
    this.jobs.delete(id)
  }

  /** Starts the periodic sweep. The timer is unref'd so it never keeps the process alive. */
  startCleanup(): NodeJS.Timeout {
    this.stopCleanup()
    const timer = setInterval(() => this.sweep(), this.cleanupIntervalMs)
    timer.unref()
    this.timer = timer
    return timer
  }

  stopCleanup(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** One cleanup pass. Public so tests and the timer share the same code. */
  sweep(): void {
    const now = this.now()
    for (const job of [...this.jobs.values()]) {
      if (now - job.updatedAt > this.jobTtlMs) {
        this.jobs.delete(job.id)
      } else if (job.status === 'done' && now - job.updatedAt > this.resultTtlMs) {
        this.dropResult(job)
      }
    }
    this.evictOldestDone()
  }

  private dropResult(job: Job): void {
    if (job.result === undefined && job.screenshotPng === undefined) return
    // updatedAt is left alone: the job keeps ageing toward its TTL.
    const { result: _result, screenshotPng: _screenshot, ...rest } = job
    this.jobs.set(job.id, rest)
  }

  private evictOldestDone(): void {
    const done = [...this.jobs.values()]
      .filter((job) => job.status === 'done')
      .sort((a, b) => b.updatedAt - a.updatedAt)
    for (const job of done.slice(this.maxDoneJobs)) this.jobs.delete(job.id)
  }
}
