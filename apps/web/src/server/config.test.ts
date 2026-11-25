import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { readInteger, readServerConfig } from './config'

describe('readServerConfig defaults (security.md)', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(readServerConfig({})).toEqual({
      port: 3000,
      maxConcurrency: 2,
      maxQueueDepth: 20,
      auditTimeoutMs: 60_000,
      ratePerMinute: 5,
      ratePerHour: 30,
      resourceLimits: { maxRequests: 500, maxTotalBytes: 50 * 1024 * 1024, maxResourceBytes: 10 * 1024 * 1024 },
    })
  })

  it('reads every variable', () => {
    const config = readServerConfig({
      PORT: '8080',
      UNSEEN_MAX_CONCURRENCY: '3',
      UNSEEN_QUEUE_DEPTH: '7',
      UNSEEN_AUDIT_TIMEOUT_MS: '45000',
      UNSEEN_RATE_PER_MINUTE: '4',
      UNSEEN_RATE_PER_HOUR: '20',
      UNSEEN_MAX_REQUESTS: '300',
      UNSEEN_MAX_TOTAL_MB: '25',
      UNSEEN_MAX_RESOURCE_MB: '5',
    })
    expect(config).toEqual({
      port: 8080,
      maxConcurrency: 3,
      maxQueueDepth: 7,
      auditTimeoutMs: 45_000,
      ratePerMinute: 4,
      ratePerHour: 20,
      resourceLimits: { maxRequests: 300, maxTotalBytes: 25 * 1024 * 1024, maxResourceBytes: 5 * 1024 * 1024 },
    })
  })
})

describe('readInteger', () => {
  const bounds = { fallback: 7, min: 2, max: 50 }

  it('returns an in-range integer unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 50 }), async (n) => {
        expect(readInteger(String(n), bounds)).toBe(n)
      }),
      { numRuns: 100 },
    )
  })

  it('always returns a value inside the bounds, whatever the input', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.string(), { nil: undefined }), async (raw) => {
        const value = readInteger(raw, bounds)
        expect(value === bounds.fallback || (value >= bounds.min && value <= bounds.max)).toBe(true)
        expect(Number.isInteger(value)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('falls back for unset, empty, fractional, negative, text and out-of-range values', () => {
    for (const raw of [undefined, '', ' ', '1.5', '-3', 'abc', '1e2', '0x10', '1', '51', '99999999999999999999']) {
      expect(readInteger(raw, bounds)).toBe(7)
    }
  })
})
