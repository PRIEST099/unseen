import type { OnProgressCallback, ProgressStage } from './types.js'

/**
 * Report a finished stage to the caller. The callback is optional, and a callback that throws is logged and
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
    console.error(`onProgress callback threw at stage "${stage}": ${err instanceof Error ? err.message : String(err)}`)
  }
}
