export const MAX_QUEUE_DEPTH = 20
const DEFAULT_CONCURRENCY = 2
const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 20

export class QueueFullError extends Error {
  constructor(message = 'Queue is full') {
    super(message)
    this.name = 'QueueFullError'
  }
}

export type JobQueueOptions = {
  /** Runs one job to completion. It must not reject; the queue only logs a rejection through `onError`. */
  execute: (jobId: string) => Promise<void>
  /** Audits running at once. Clamped to 1-20, default 2. */
  maxConcurrency?: number
  /** Audits allowed to wait. Default 20; the next one is rejected with `QueueFullError`. */
  maxQueueDepth?: number
  onError?: (error: unknown, jobId: string) => void
}

function clampConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_CONCURRENCY
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.trunc(value)))
}

/** FIFO queue with a concurrency cap and a bounded waiting line. Created per server so tests can inject fakes. */
export class JobQueue {
  readonly maxConcurrency: number
  readonly maxQueueDepth: number
  private readonly queue: string[] = []
  private readonly running = new Set<string>()
  private readonly execute: (jobId: string) => Promise<void>
  private readonly onError: ((error: unknown, jobId: string) => void) | undefined

  constructor(options: JobQueueOptions) {
    this.execute = options.execute
    this.onError = options.onError
    this.maxConcurrency = clampConcurrency(options.maxConcurrency)
    this.maxQueueDepth = options.maxQueueDepth ?? MAX_QUEUE_DEPTH
  }

  /** Jobs waiting for a slot. */
  get waiting(): number {
    return this.queue.length
  }

  /** Jobs running now. */
  get active(): number {
    return this.running.size
  }

  /** True when the next `enqueue` would be rejected. */
  isFull(): boolean {
    return this.queue.length >= this.maxQueueDepth
  }

  enqueue(jobId: string): void {
    if (this.isFull()) throw new QueueFullError('Queue is full')
    this.queue.push(jobId)
    void this.processNext()
  }

  async processNext(): Promise<void> {
    if (this.running.size >= this.maxConcurrency) return
    const jobId = this.queue.shift()
    if (jobId === undefined) return
    this.running.add(jobId)
    try {
      await this.execute(jobId)
    } catch (error: unknown) {
      this.onError?.(error, jobId)
    } finally {
      this.running.delete(jobId)
      void this.processNext()
    }
  }
}
