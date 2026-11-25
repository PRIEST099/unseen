import { describe, expect, it } from 'vitest'
import { SlidingWindowLimiter } from './rate-limit.js'

describe('SlidingWindowLimiter', () => {
  it('allows `max` hits per key inside the window and rejects the next with a retry delay', () => {
    let now = 0
    const limiter = new SlidingWindowLimiter({ max: 3, windowMs: 60_000, now: () => now })
    for (let i = 0; i < 3; i++) expect(limiter.hit('a').allowed).toBe(true)
    now = 10_000
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 50 })
  })

  it('tracks keys independently', () => {
    const limiter = new SlidingWindowLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    expect(limiter.hit('a').allowed).toBe(true)
    expect(limiter.hit('b').allowed).toBe(true)
    expect(limiter.hit('a').allowed).toBe(false)
  })

  it('frees a slot once the oldest hit leaves the window', () => {
    let now = 0
    const limiter = new SlidingWindowLimiter({ max: 2, windowMs: 1000, now: () => now })
    limiter.hit('a')
    now = 500
    limiter.hit('a')
    now = 999
    expect(limiter.hit('a').allowed).toBe(false)
    now = 1000
    expect(limiter.hit('a').allowed).toBe(true)
  })

  it('does not count rejected hits against the window', () => {
    let now = 0
    const limiter = new SlidingWindowLimiter({ max: 1, windowMs: 1000, now: () => now })
    limiter.hit('a')
    for (let i = 0; i < 50; i++) limiter.hit('a')
    now = 1000
    expect(limiter.hit('a').allowed).toBe(true)
  })
})
