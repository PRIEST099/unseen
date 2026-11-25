import type { ResourceLimits } from '@the-unseen/core'

/** Every operational limit of the hosted auditor, read from the environment once at start-up. */
export type ServerConfig = {
  port: number
  maxConcurrency: number
  maxQueueDepth: number
  auditTimeoutMs: number
  ratePerMinute: number
  ratePerHour: number
  resourceLimits: ResourceLimits
}

type Bounds = { fallback: number; min: number; max: number }

const MB = 1024 * 1024

/** An integer inside [min, max]; anything else (unset, empty, text, fraction, out of range) gives the fallback. */
export function readInteger(raw: string | undefined, { fallback, min, max }: Bounds): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback
  const value = Number(raw.trim())
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback
}

/**
 * Defaults are the values in `.kiro/steering/security.md`. An invalid value never lowers a limit silently:
 * it falls back to the default for that variable.
 */
export function readServerConfig(env: Record<string, string | undefined>): ServerConfig {
  return {
    port: readInteger(env.PORT, { fallback: 3000, min: 1, max: 65535 }),
    maxConcurrency: readInteger(env.UNSEEN_MAX_CONCURRENCY, { fallback: 2, min: 1, max: 20 }),
    maxQueueDepth: readInteger(env.UNSEEN_QUEUE_DEPTH, { fallback: 20, min: 0, max: 200 }),
    auditTimeoutMs: readInteger(env.UNSEEN_AUDIT_TIMEOUT_MS, { fallback: 60_000, min: 5_000, max: 300_000 }),
    ratePerMinute: readInteger(env.UNSEEN_RATE_PER_MINUTE, { fallback: 5, min: 1, max: 1000 }),
    ratePerHour: readInteger(env.UNSEEN_RATE_PER_HOUR, { fallback: 30, min: 1, max: 10_000 }),
    resourceLimits: {
      maxRequests: readInteger(env.UNSEEN_MAX_REQUESTS, { fallback: 500, min: 1, max: 5000 }),
      maxTotalBytes: readInteger(env.UNSEEN_MAX_TOTAL_MB, { fallback: 50, min: 1, max: 500 }) * MB,
      maxResourceBytes: readInteger(env.UNSEEN_MAX_RESOURCE_MB, { fallback: 10, min: 1, max: 100 }) * MB,
    },
  }
}
