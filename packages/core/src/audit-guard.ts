/**
 * One place where an audit can be told to stop: the full-audit timeout, a
 * renderer crash, a browser disconnect or a resource limit all call `fail`.
 * Every stage of the audit is raced against it, so the first failure rejects
 * the stage that is waiting (even a CDP call that would never settle) and lets
 * the `finally` blocks close the context and release the pool slot.
 */
export class AuditGuard {
  private readonly failure: Promise<never>
  private rejectFailure: (error: unknown) => void = () => undefined
  private done = false

  constructor() {
    this.failure = new Promise<never>((_, reject) => {
      this.rejectFailure = reject
    })
    // The rejection is consumed through `race`; this stops an unhandled-rejection warning.
    this.failure.catch(() => undefined)
  }

  get hasFailed(): boolean {
    return this.done
  }

  /** Record the first failure; later calls are ignored. */
  fail(error: unknown): void {
    if (this.done) return
    this.done = true
    this.rejectFailure(error)
  }

  /** Settles like `work`, unless the guard has failed first (then it rejects with that failure). */
  race<T>(work: Promise<T>): Promise<T> {
    return Promise.race([this.failure, work])
  }
}
