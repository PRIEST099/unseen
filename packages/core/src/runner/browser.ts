import { chromium } from 'playwright'
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright'
import type { AuditOptions, BoundingBox, SafeFetchPolicy } from '../types.js'
import { AuditContextError, AuditTimeoutError, NonHtmlContentError } from '../types.js'
import { installSafeFetchPolicy } from './safe-fetch.js'

// ---------------------------------------------------------------------------
// Launch configuration (single source of launch flags; safe-fetch will extend)
// ---------------------------------------------------------------------------

export type LaunchArgsOptions = {
  /** Chromium channel. Empty string means "no channel" (use the bundled build). */
  channel?: string
  headless?: boolean
  /** Extra Chromium flags appended after the defaults. */
  extraArgs?: string[]
}

export type LaunchArgs = {
  channel: string | undefined
  args: string[]
  headless: boolean
}

/** Flags that stop WebRTC from leaking local or private IPs (safe-fetch review §6). */
export const WEBRTC_LEAK_FLAGS: readonly string[] = [
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
]

export function buildLaunchArgs(opts: LaunchArgsOptions = {}): LaunchArgs {
  const raw = opts.channel ?? process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium'
  return {
    channel: raw === '' ? undefined : raw,
    args: [...WEBRTC_LEAK_FLAGS, ...(opts.extraArgs ?? [])],
    headless: opts.headless ?? true,
  }
}

// ---------------------------------------------------------------------------
// BrowserPool (Req 2)
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_CONCURRENCY = 2
export const MAX_QUEUE_DEPTH = 20
export const ACQUIRE_TIMEOUT_MS = 30_000
export const MAX_SESSIONS_PER_BROWSER = 50

export type BrowserPoolOptions = {
  /** 1–20 inclusive. Default 2, or `UNSEEN_MAX_CONCURRENCY` when using `getPool`. */
  maxConcurrency?: number
  /** Override for tests. Defaults to `chromium.launch(buildLaunchArgs())`. */
  launch?: () => Promise<Browser>
  /** Override for tests. Default 30 000 ms. */
  acquireTimeoutMs?: number
}

export class PoolQueueFullError extends Error {
  constructor(public readonly queueDepth: number) {
    super(`Browser pool queue is full (${queueDepth} waiting)`)
    this.name = 'PoolQueueFullError'
  }
}

type Waiter = {
  resolve: (browser: Browser) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class BrowserPool {
  readonly maxConcurrency: number
  private readonly launchFn: () => Promise<Browser>
  private readonly acquireTimeoutMs: number
  private readonly idle: Browser[] = []
  private readonly sessions = new Map<Browser, number>()
  private readonly queue: Waiter[] = []
  private busy = 0
  private launching = 0

  constructor(options: BrowserPoolOptions = {}) {
    const max = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      throw new RangeError(`maxConcurrency must be an integer from 1 to 20, got ${max}`)
    }
    this.maxConcurrency = max
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? ACQUIRE_TIMEOUT_MS
    this.launchFn =
      options.launch ??
      (() => {
        const { channel, args, headless } = buildLaunchArgs()
        return chromium.launch({ channel, args, headless })
      })
  }

  /** Number of browsers currently handed out. */
  get busyCount(): number {
    return this.busy
  }

  /** Number of callers waiting for a browser. */
  get queueDepth(): number {
    return this.queue.length
  }

  async acquire(): Promise<Browser> {
    if (this.busy + this.launching < this.maxConcurrency) {
      return this.checkout()
    }
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      throw new PoolQueueFullError(this.queue.length)
    }
    return new Promise<Browser>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.queue.indexOf(waiter)
          if (i !== -1) this.queue.splice(i, 1)
          reject(new AuditTimeoutError('browser-pool-acquire', this.acquireTimeoutMs))
        }, this.acquireTimeoutMs),
      }
      this.queue.push(waiter)
    })
  }

  async release(browser: Browser): Promise<void> {
    const count = (this.sessions.get(browser) ?? 0) + 1
    this.sessions.set(browser, count)
    this.busy = Math.max(0, this.busy - 1)

    let healthy = false
    try {
      healthy = browser.isConnected()
    } catch {
      healthy = false
    }

    if (!healthy || count >= MAX_SESSIONS_PER_BROWSER) {
      this.sessions.delete(browser)
      await browser.close().catch(() => undefined)
    } else {
      this.idle.push(browser)
    }
    this.dispatch()
  }

  /** Close every idle browser and reject all waiters. For shutdown and tests. */
  async close(): Promise<void> {
    for (const w of this.queue.splice(0)) {
      clearTimeout(w.timer)
      w.reject(new Error('Browser pool closed'))
    }
    const browsers = this.idle.splice(0)
    await Promise.all(browsers.map((b) => b.close().catch(() => undefined)))
    for (const b of browsers) this.sessions.delete(b)
  }

  private async checkout(): Promise<Browser> {
    const ready = this.idle.pop()
    if (ready) {
      this.busy++
      return ready
    }
    this.launching++
    try {
      const browser = await this.launchFn()
      this.sessions.set(browser, 0)
      this.busy++
      return browser
    } finally {
      this.launching--
    }
  }

  private dispatch(): void {
    while (this.queue.length > 0 && this.busy + this.launching < this.maxConcurrency) {
      const waiter = this.queue.shift()!
      clearTimeout(waiter.timer)
      this.checkout().then(waiter.resolve, waiter.reject)
    }
  }
}

let singleton: BrowserPool | undefined

function envConcurrency(): number | undefined {
  const raw = process.env.UNSEEN_MAX_CONCURRENCY
  if (raw === undefined || raw === '') return undefined
  return Number(raw)
}

/** Module-level singleton accessor. Options apply only on the first call. */
export function getPool(options?: BrowserPoolOptions): BrowserPool {
  if (!singleton) {
    singleton = new BrowserPool({ maxConcurrency: envConcurrency(), ...options })
  }
  return singleton
}

// ---------------------------------------------------------------------------
// Page_Loader (Req 1, 14)
// ---------------------------------------------------------------------------

export const DEFAULT_VIEWPORT = { width: 1280, height: 900 } as const
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000
/** Fixed settle window after networkidle (hauntings.md §5 "Walk start timing"). */
export const SETTLE_WINDOW_MS = 1500

const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml']

/** Pure helper: apply a uniform scale and clamp to non-negative values. */
export function normalizeBoundingBox(
  box: { x: number; y: number; width: number; height: number },
  scale: number,
  backendDOMNodeId = 0
): BoundingBox {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n * s : 0)
  return {
    backendDOMNodeId,
    x: clean(box.x),
    y: clean(box.y),
    width: clean(box.width),
    height: clean(box.height),
  }
}

export type LoadedPage = {
  page: Page
  screenshotPng: Buffer
  boundingBoxes: BoundingBox[]
}

type CdpNode = {
  nodeType: number
  backendNodeId: number
  children?: CdpNode[]
}

/** Element backendNodeIds in document (pre-)order, matching `querySelectorAll('*')`. */
function elementBackendIdsInOrder(root: CdpNode): number[] {
  const out: number[] = []
  const walk = (node: CdpNode) => {
    if (node.nodeType === 1) out.push(node.backendNodeId)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return out
}

export class PageLoader {
  async createContext(browser: Browser, options: AuditOptions = {}): Promise<BrowserContext> {
    try {
      return await browser.newContext({
        viewport: options.viewport ?? { ...DEFAULT_VIEWPORT },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        serviceWorkers: 'block',
        bypassCSP: false,
        storageState: undefined,
      })
    } catch (err) {
      throw new AuditContextError(err)
    }
  }

  async loadPage(
    context: BrowserContext,
    url: string,
    policy: SafeFetchPolicy,
    options: AuditOptions = {}
  ): Promise<LoadedPage> {
    const page = await context.newPage()
    const started = Date.now()
    let onCrash: () => void = () => undefined
    const crashed = new Promise<never>((_, reject) => {
      onCrash = () => reject(new AuditTimeoutError('browser-crash', Date.now() - started))
    })
    crashed.catch(() => undefined)
    page.on('crash', onCrash)

    try {
      return await Promise.race([this.load(page, url, policy, options), crashed])
    } catch (err) {
      await page.close().catch(() => undefined)
      throw err
    } finally {
      page.off('crash', onCrash)
    }
  }

  private async load(
    page: Page,
    url: string,
    policy: SafeFetchPolicy,
    options: AuditOptions
  ): Promise<LoadedPage> {
    await installSafeFetchPolicy(page, policy)

    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS,
    })
    if (response) {
      const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
      const mime = contentType.split(';')[0]!.trim()
      if (!HTML_CONTENT_TYPES.includes(mime)) {
        throw new NonHtmlContentError(contentType)
      }
    }

    // Let timer-opened dialogs appear before anything is captured.
    await page.waitForTimeout(SETTLE_WINDOW_MS)

    const screenshotPng = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      type: 'png',
    })
    const boundingBoxes = await collectBoundingBoxes(page)
    return { page, screenshotPng, boundingBoxes }
  }
}

/**
 * One `page.evaluate` over `querySelectorAll('*')` for the rects, then one CDP
 * `DOM.getDocument` to pair each element with its backendDOMNodeId by document order.
 */
export async function collectBoundingBoxes(page: Page): Promise<BoundingBox[]> {
  const rects = await page.evaluate(() => {
    const sx = window.scrollX
    const sy = window.scrollY
    return Array.from(document.querySelectorAll('*'), (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + sx, y: r.top + sy, width: r.width, height: r.height }
    })
  })

  let session: CDPSession | undefined
  try {
    session = await page.context().newCDPSession(page)
    const { root } = (await session.send('DOM.getDocument', { depth: -1, pierce: false })) as {
      root: CdpNode
    }
    const ids = elementBackendIdsInOrder(root)
    if (ids.length !== rects.length) {
      throw new Error(`DOM/CDP element count mismatch: ${rects.length} vs ${ids.length}`)
    }
    return rects.map((r, i) => normalizeBoundingBox(r, 1, ids[i]))
  } finally {
    await session?.detach().catch(() => undefined)
  }
}
