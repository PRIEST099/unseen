import type { OnProgressCallback, ProgressStage } from './types.js'

/**
 * Report a stage to the caller as it starts. The callback is optional, and a callback that throws is logged and
 * swallowed: progress reporting must never fail an audit.
 */
export function emitProgress(
  onProgress: OnProgressCallback | undefined,
  stage: ProgressStage,
  now: () => number = Date.now
): void {
  if (!onProgress) return
  try {
    onProgress(stage, now())
  } catch (err: unknown) {
    console.error(`onProgress callback threw at stage "${stage}": ${describeThrown(err)}`)
  }
}

/** A printable form of whatever the callback threw; values that cannot be turned into a string are not an error. */
function describeThrown(err: unknown): string {
  try {
    return err instanceof Error ? err.message : String(err)
  } catch {
    return Object.prototype.toString.call(err)
  }
}
