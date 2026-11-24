export type SlidingWindowOptions = {
  max: number
  windowMs: number
  /** Clock seam for tests. Defaults to `Date.now`. */
  now?: () => number
}

export type LimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number }

const SWEEP_THRESHOLD = 5_000

/**
 * In-memory sliding-window limiter keyed by client IP. It backs the 30-per-hour cap, which
 * `@fastify/rate-limit` cannot express next to the 5-per-minute cap on the same route.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(options: SlidingWindowOptions) {
    this.max = options.max
    this.windowMs = options.windowMs
    this.now = options.now ?? Date.now
  }

  /** Records one request for `key` and says whether it fits in the window. Rejected requests are not recorded. */
  hit(key: string): LimitVerdict {
    const now = this.now()
    if (this.hits.size > SWEEP_THRESHOLD) this.sweep(now)
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    const oldest = recent[0]
    if (recent.length >= this.max && oldest !== undefined) {
      this.hits.set(key, recent)
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { allowed: false, retryAfterSeconds }
    }
    recent.push(now)
    this.hits.set(key, recent)
    return { allowed: true }
  }

  private sweep(now: number): void {
    for (const [key, times] of this.hits) {
      const last = times[times.length - 1]
      if (last === undefined || now - last >= this.windowMs) this.hits.delete(key)
    }
  }
}
