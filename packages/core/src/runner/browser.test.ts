import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type { Browser } from 'playwright'
import {
  BrowserPool,
  MAX_QUEUE_DEPTH,
  MAX_SESSIONS_PER_BROWSER,
  PageLoader,
  PoolQueueFullError,
  WEBRTC_LEAK_FLAGS,
  buildLaunchArgs,
  normalizeBoundingBox,
} from './browser.js'
import { AuditContextError, AuditTimeoutError } from '../types.js'

describe('PageLoader.createContext (Req 14.5)', () => {
  it('wraps a failing newContext in AuditContextError', async () => {
    const cause = new Error('no context for you')
    const browser = { newContext: vi.fn(async () => { throw cause }) } as unknown as Browser
    const err: unknown = await new PageLoader().createContext(browser).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(AuditContextError)
    expect((err as AuditContextError).cause).toBe(cause)
  })

  it('creates the context with CSP enforced, service workers blocked and a fixed viewport', async () => {
    const newContext = vi.fn(async () => ({}))
    const browser = { newContext } as unknown as Browser
    await new PageLoader().createContext(browser)
    expect(newContext).toHaveBeenCalledWith(
      expect.objectContaining({ bypassCSP: false, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
    )
  })
})

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

describe('BrowserPool fairness and launch failures (findings 36, 37)', () => {
  it('a failed launch gives the freed slot to the next waiter at once', async () => {
    let calls = 0
    const pool = new BrowserPool({
      maxConcurrency: 1,
      acquireTimeoutMs: 5_000,
      launch: async () => {
        if (calls++ === 0) throw new Error('launch failed')
        return fakeBrowser()
      },
    })
    const first = pool.acquire()
    const second = pool.acquire() // queued behind the first launch
    first.catch(() => undefined)
    await expect(first).rejects.toThrow('launch failed')
    await expect(second).resolves.toBeDefined()
    expect(calls).toBe(2)
    expect(pool.queueDepth).toBe(0)
  })

  it('a caller arriving while an old browser is closing does not overtake the queue head', async () => {
    let closeDone: () => void = () => undefined
    const slowClose = new Promise<void>((ok) => (closeDone = ok))
    const dying = { isConnected: vi.fn(() => false), close: vi.fn(() => slowClose) } as unknown as Browser
    let launches = 0
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => (launches++ === 0 ? dying : fakeBrowser()) })
    const held = await pool.acquire()
    const order: string[] = []
    const early = pool.acquire().then((b) => (order.push('early'), b))
    const releasing = pool.release(held) // the dying browser is still closing
    const late = pool.acquire().then((b) => (order.push('late'), b))
    await early
    expect(order).toEqual(['early'])
    closeDone()
    await releasing
    await pool.release(await early)
    await late
    expect(order).toEqual(['early', 'late'])
  })
  it('release hands the slot to the queue before an unhealthy browser has finished closing', async () => {
    let closeDone: () => void = () => undefined
    const slowClose = new Promise<void>((ok) => (closeDone = ok))
    const dying = { isConnected: vi.fn(() => false), close: vi.fn(() => slowClose) } as unknown as Browser
    let launches = 0
    const pool = new BrowserPool({ maxConcurrency: 1, launch: async () => (launches++ === 0 ? dying : fakeBrowser()) })
    const first = await pool.acquire()
    const waiter = pool.acquire()
    const releasing = pool.release(first)
    // the close has not finished, yet the waiter gets its browser
    await expect(waiter).resolves.toBeDefined()
    closeDone()
    await releasing
    expect(launches).toBe(2)
  })
})