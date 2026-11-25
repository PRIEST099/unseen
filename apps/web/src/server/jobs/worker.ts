import {
  auditAndClassify,
  AuditResourceLimitError,
  AuditTimeoutError,
  SsrfBlockedError,
} from '@the-unseen/core'
import type { AuditOptions, ClassifiedAudit, ResourceLimits } from '@the-unseen/core'
import type { JobStore } from './store.js'
import type { JobError, JobLogger } from './types.js'

export const AUDIT_TIMEOUT_MS = 60_000

export type AuditFunction = (url: string, options: AuditOptions) => Promise<ClassifiedAudit>

export type WorkerDeps = {
  store: JobStore
  /** Replaces `auditAndClassify` in tests. */
  audit?: AuditFunction
  /** Receives the raw error (with URL and stack) for server-side diagnosis only. */
  logger?: JobLogger
  now?: () => number
  /** Full-audit timeout; defaults to AUDIT_TIMEOUT_MS (security.md: 60 seconds). */
  timeoutMs?: number
  /** Page weight limits; absent fields keep the security.md defaults. */
  resourceLimits?: Partial<ResourceLimits>
}

/**
 * True only for local development and tests: the flag is set and the process is not production.
 * Shared by the worker and the POST pre-check so both apply the same rule.
 */
export function isPrivateAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1'
}

/** Maps any audit failure to a stable code and a message that never carries a URL, IP or stack. */
export function mapErrorToResponse(error: unknown): JobError {
  if (error instanceof SsrfBlockedError) {
    return { code: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' }
  }
  if (error instanceof AuditTimeoutError) {
    return { code: 'TIMEOUT', message: 'Audit timed out after 60 seconds' }
  }
  if (error instanceof AuditResourceLimitError) {
    return { code: 'RESOURCE_LIMIT', message: 'Page exceeded resource limits' }
  }
  return { code: 'NETWORK_ERROR', message: 'Failed to load the page' }
}

/**
 * Runs one job. Never rejects: every failure becomes an `error` job.
 * It never passes `safeFetchPolicy`, so the core default (restrictive) always applies.
 */
export async function executeJob(jobId: string, deps: WorkerDeps): Promise<void> {
  const { store, logger } = deps
  const audit = deps.audit ?? auditAndClassify
  const now = deps.now ?? Date.now
  const job = store.get(jobId)
  if (!job) return

  try {
    const classified = await audit(job.url, {
      allowPrivate: isPrivateAllowed(),
      timeoutMs: deps.timeoutMs ?? AUDIT_TIMEOUT_MS,
      ...(deps.resourceLimits === undefined ? {} : { resourceLimits: deps.resourceLimits }),
      onProgress: (stage, atMs): void => {
        store.update(jobId, (current) => ({ status: stage, stages: { ...current.stages, [stage]: atMs } }))
      },
    })
    const screenshotPng = classified.raw.screenshotPng
    const result: ClassifiedAudit = { ...classified, raw: { ...classified.raw, screenshotPng: '' } }
    store.update(jobId, (current) => ({
      status: 'done',
      result,
      screenshotPng,
      stages: { ...current.stages, done: now() },
    }))
  } catch (error: unknown) {
    logger?.error({ err: error, jobId, url: job.url }, 'audit job failed')
    store.update(jobId, () => ({ status: 'error', error: mapErrorToResponse(error) }))
  }
}
