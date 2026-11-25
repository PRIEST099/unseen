import * as fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { AuditResourceLimitError } from '../types.js'
import {
  DEFAULT_RESOURCE_LIMITS,
  MAX_REQUESTS,
  MAX_RESOURCE_BYTES,
  MAX_TOTAL_BYTES,
  ResourceMeter,
  resolveResourceLimits,
} from './resource-limits.js'

const allow = { shouldBlock: async (): Promise<{ block: boolean; reason: string }> => ({ block: false, reason: '' }) }

describe('resolveResourceLimits', () => {
  test('property: any positive finite override is used as given', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000_000 }), fc.integer({ min: 1, max: 1_000_000_000 }), fc.integer({ min: 1, max: 1_000_000_000 }), async (a, b, c) => {
        expect(resolveResourceLimits({ maxRequests: a, maxTotalBytes: b, maxResourceBytes: c })).toEqual({ maxRequests: a, maxTotalBytes: b, maxResourceBytes: c })
      }),
      { numRuns: 100 },
    )
  })

  test('property: an unusable value falls back to the security.md default for that field only', async () => {
    const bad = fc.constantFrom(0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined)
    await fc.assert(
      fc.asyncProperty(bad, bad, async (a, b) => {
        const result = resolveResourceLimits({ maxRequests: a, maxTotalBytes: b, maxResourceBytes: 7 })
        expect(result).toEqual({ maxRequests: MAX_REQUESTS, maxTotalBytes: MAX_TOTAL_BYTES, maxResourceBytes: 7 })
      }),
      { numRuns: 100 },
    )
  })

  test('no overrides gives the documented defaults: 500 requests, 50 MB total, 10 MB per resource', () => {
    expect(resolveResourceLimits(undefined)).toEqual(DEFAULT_RESOURCE_LIMITS)
    expect(DEFAULT_RESOURCE_LIMITS).toEqual({ maxRequests: 500, maxTotalBytes: 50 * 1024 * 1024, maxResourceBytes: MAX_RESOURCE_BYTES })
    expect(MAX_RESOURCE_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe('ResourceMeter with configured limits', () => {
  test('the request-count limit is the configured one, not the default', async () => {
    const breaches: unknown[] = []
    const meter = new ResourceMeter((error) => breaches.push(error), { ...DEFAULT_RESOURCE_LIMITS, maxRequests: 3 })
    const policy = meter.wrapPolicy(allow)
    for (let i = 0; i < 3; i++) await policy.shouldBlock(`http://example.test/${i}`)
    expect(breaches).toHaveLength(0)
    await policy.shouldBlock('http://example.test/4')
    expect(breaches).toHaveLength(1)
    expect(breaches[0]).toBeInstanceOf(AuditResourceLimitError)
  })

  test('without a limits argument the default of 500 applies', async () => {
    const breaches: unknown[] = []
    const policy = new ResourceMeter((error) => breaches.push(error)).wrapPolicy(allow)
    for (let i = 0; i < 500; i++) await policy.shouldBlock(`http://example.test/${i}`)
    expect(breaches).toHaveLength(0)
    await policy.shouldBlock('http://example.test/over')
    expect(breaches).toHaveLength(1)
  })
})
