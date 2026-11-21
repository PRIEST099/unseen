import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type { Browser } from 'playwright'
import {
  BrowserPool,
  MAX_QUEUE_DEPTH,
  MAX_SESSIONS_PER_BROWSER,
  PoolQueueFullError,
  WEBRTC_LEAK_FLAGS,
  buildLaunchArgs,
  normalizeBoundingBox,
} from './browser.js'
import { AuditTimeoutError } from '../types.js'

function fakeBrowser(connected = true): Browser {
  return {
    isConnected: vi.fn(() => connected),
    close: vi.fn(async () => undefined),
  } as unknown as Browser
}

describe('buildLaunchArgs', () => {
  afterEach(() => {
    delete process.env.UNSEEN_CHROMIUM_CHANNEL
  })

  it('defaults to the chromium channel, headless, with WebRTC leak flags', () => {
    delete process.env.UNSEEN_CHROMIUM_CHANNEL
    const a = buildLaunchArgs()
    expect(a.channel).toBe('chromium')
    expect(a.headless).toBe(true)
    for (const f of WEBRTC_LEAK_FLAGS) expect(a.args).toContain(f)
  })

  it('reads UNSEEN_CHROMIUM_CHANNEL and treats an empty string as no channel', () => {
    process.env.UNSEEN_CHROMIUM_CHANNEL = 'chrome'
    expect(buildLaunchArgs().channel).toBe('chrome')
    process.env.UNSEEN_CHROMIUM_CHANNEL = ''
    expect(buildLaunchArgs().channel).toBeUndefined()
    expect(buildLaunchArgs({ channel: 'msedge' }).channel).toBe('msedge')
  })

  it('appends extra args after the defaults', () => {
    const a = buildLaunchArgs({ extraArgs: ['--host-resolver-rules=MAP x 1.2.3.4'] })
    expect(a.args.at(-1)).toBe('--host-resolver-rules=MAP x 1.2.3.4')
  })
})

describe('BrowserPool', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects out-of-range or non-integer maxConcurrency', () => {
    for (const bad of [0, 21, 1.5, -1, NaN]) {
      expect(() => new BrowserPool({ maxConcurrency: bad })).toThrow(RangeError)
    }
    expect(new BrowserPool({ launch: async () => fakeBrowser() }).maxConcurrency).toBe(2)
  })

  it('(a) throws at once when 20 requests are already queued', async () => {
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => fakeBrowser() })
    await pool.acquire()
    const waiting = Array.from({ length: MAX_QUEUE_DEPTH }, () => pool.acquire())
    waiting.forEach((p) => p.catch(() => undefined))
    expect(pool.queueDepth).toBe(20)
    await expect(pool.acquire()).rejects.toBeInstanceOf(PoolQueueFullError)
    await pool.close()
  })

  it('(b) a queued acquire rejects with AuditTimeoutError after 30 s', async () => {
    vi.useFakeTimers()
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => fakeBrowser() })
    await pool.acquire()
    const waiting = pool.acquire()
    const assertion = expect(waiting).rejects.toBeInstanceOf(AuditTimeoutError)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(pool.queueDepth).toBe(0)
  })

  it('(c) release frees a slot so the next queued acquire resolves', async () => {
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => fakeBrowser() })
    const first = await pool.acquire()
    const second = pool.acquire()
    expect(pool.busyCount).toBe(1)
    await pool.release(first)
    await expect(second).resolves.toBe(first)
    expect(pool.busyCount).toBe(1)
  })

  it('(d) replaces a browser after 50 sessions', async () => {
    const launched: Browser[] = []
    const pool = new BrowserPool({
      maxConcurrency: 1,
      launch: async () => {
        const b = fakeBrowser()
        launched.push(b)
        return b
      },
    })
    for (let i = 0; i < MAX_SESSIONS_PER_BROWSER; i++) {
      await pool.release(await pool.acquire())
    }
    expect(launched).toHaveLength(1)
    expect(launched[0]!.close).toHaveBeenCalledTimes(1)
    await pool.acquire()
    expect(launched).toHaveLength(2)
  })

  it('replaces an unhealthy browser on release', async () => {
    let n = 0
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => fakeBrowser(n++ > 0) })
    const dead = await pool.acquire()
    await pool.release(dead)
    expect(dead.close).toHaveBeenCalled()
    const next = await pool.acquire()
    expect(next).not.toBe(dead)
  })
})

describe('Property 5: normalizeBoundingBox', () => {
  const box = fc.record({
    x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    y: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    width: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    height: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
  })
  const scale = fc.double({ min: 0.1, max: 4, noNaN: true })

  it('never returns negative coordinates or sizes', () => {
    fc.assert(
      fc.property(box, scale, (b, s) => {
        const r = normalizeBoundingBox(b, s)
        return r.x >= 0 && r.y >= 0 && r.width >= 0 && r.height >= 0
      }),
      { numRuns: 200 }
    )
  })

  it('scales non-negative inputs linearly', () => {
    const pos = fc.record({
      x: fc.double({ min: 0, max: 1e4, noNaN: true }),
      y: fc.double({ min: 0, max: 1e4, noNaN: true }),
      width: fc.double({ min: 0, max: 1e4, noNaN: true }),
      height: fc.double({ min: 0, max: 1e4, noNaN: true }),
    })
    fc.assert(
      fc.property(pos, scale, (b, s) => {
        const r = normalizeBoundingBox(b, s)
        const close = (a: number, e: number) => Math.abs(a - e) <= 1e-9 * Math.max(1, Math.abs(e))
        return close(r.x, b.x * s) && close(r.y, b.y * s) && close(r.width, b.width * s) && close(r.height, b.height * s)
      }),
      { numRuns: 200 }
    )
  })
})
