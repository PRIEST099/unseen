import { chromium, errors } from 'playwright'
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

/**
 * Flags that stop WebRTC from sending UDP around the egress proxy (safe-fetch spec decision F).
 * `--disable-webrtc` is not a Chromium switch. `disable_non_proxied_udp` forces WebRTC traffic
 * through a proxy or nowhere.
 */
export const WEBRTC_LEAK_FLAGS: readonly string[] = [
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
]

/**
 * Chromium honours only one `--disable-features` switch, so every feature we disable is listed here and
 * `buildLaunchArgs` emits them as that single switch (extra values from `extraArgs` are merged in, not dropped).
 * `DnsOverHttps`: Chromium's built-in resolver would skip the proxy's DNS pinning.
 */
export const DISABLED_FEATURES: readonly string[] = ['DnsOverHttps', 'WebRtcHideLocalIpsWithMdns']

/** `--disable-quic`: QUIC is UDP and bypasses an HTTP proxy. */
export const EGRESS_FLAGS: readonly string[] = ['--disable-quic']

/** Chromium's own background traffic (Google endpoints, updates, pings) would otherwise show up as blocked requests. */
export const BACKGROUND_TRAFFIC_FLAGS: readonly string[] = [
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--no-pings',
  '--disable-sync',
  '--metrics-recording-only',
]

const DISABLE_FEATURES_PREFIX = '--disable-features='

/** Split `--disable-features=` switches out of `args` and merge their values with `base` into one switch. */
export function mergeDisableFeatures(args: readonly string[], base: readonly string[]): { rest: string[]; merged: string } {
  const features = [...base]
  const rest: string[] = []
  for (const arg of args) {
    if (arg.startsWith(DISABLE_FEATURES_PREFIX)) features.push(...arg.slice(DISABLE_FEATURES_PREFIX.length).split(','))
    else rest.push(arg)
  }
  const unique = [...new Set(features.map((f) => f.trim()).filter((f) => f !== ''))]
  return { rest, merged: `${DISABLE_FEATURES_PREFIX}${unique.join(',')}` }
}
export function buildLaunchArgs(opts: LaunchArgsOptions = {}): LaunchArgs {
  const raw = opts.channel ?? process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium'
  const { rest, merged } = mergeDisableFeatures(opts.extraArgs ?? [], DISABLED_FEATURES)
  return {
    channel: raw === '' ? undefined : raw,
    args: [...WEBRTC_LEAK_FLAGS, ...EGRESS_FLAGS, ...BACKGROUND_TRAFFIC_FLAGS, merged, ...rest],
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
    // Never overtake a waiter: a slot that is free while the queue is not empty belongs to the queue head.
    if (this.queue.length === 0 && this.busy + this.launching < this.maxConcurrency) {
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
      // The slot is free now: hand it to the queue before waiting for the old browser to close.
      this.dispatch()
      await browser.close().catch(() => undefined)
    } else {
      this.idle.push(browser)
      this.dispatch()
    }
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
    let launched = false
    try {
      const browser = await this.launchFn()
      this.sessions.set(browser, 0)
      this.busy++
      launched = true
      return browser
    } finally {
      this.launching--
      // A failed launch frees its slot: let the next waiter try instead of waiting for a release.
      if (!launched) this.dispatch()
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
  attributes?: string[]
  children?: CdpNode[]
}

/** Temporary attribute that pairs a rect snapshot with a CDP DOM snapshot by element identity. */
const BOX_STAMP_ATTR = 'data-unseen-bb'

/** Map stamp index -> backendNodeId for every element carrying the stamp attribute. */
function stampedBackendIds(root: CdpNode): Map<number, number> {
  const out = new Map<number, number>()
  const ambiguous = new Set<number>() // a page script cloned a stamped element: drop both
  const walk = (node: CdpNode) => {
    if (node.nodeType === 1 && node.attributes) {
      for (let i = 0; i + 1 < node.attributes.length; i += 2) {
        if (node.attributes[i] === BOX_STAMP_ATTR) {
          const idx = Number(node.attributes[i + 1])
          if (!Number.isInteger(idx)) continue
          if (out.has(idx)) ambiguous.add(idx)
          out.set(idx, node.backendNodeId)
        }
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  for (const idx of ambiguous) out.delete(idx)
  return out
}

/** Per-context proxy (never a launch-level `--proxy-server`). `<-loopback>` removes Chromium's implicit loopback bypass. */
export type ContextProxy = { server: string; bypass: '<-loopback>' }

export class PageLoader {
  async createContext(browser: Browser, options: AuditOptions = {}, proxy?: ContextProxy): Promise<BrowserContext> {
    try {
      return await browser.newContext({
        viewport: options.viewport ?? { ...DEFAULT_VIEWPORT },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        serviceWorkers: 'block',
        bypassCSP: false,
        storageState: undefined,
        ...(proxy ? { proxy } : {}),
      })
    } catch (err) {
      throw new AuditContextError(err)
    }
  }

  async loadPage(
    context: BrowserContext,
    url: string,
    policy: SafeFetchPolicy,
    options: AuditOptions = {},
    onPageCreated?: (page: Page) => void | Promise<void>
  ): Promise<LoadedPage> {
    const page = await context.newPage()
    await onPageCreated?.(page)
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

    const timeout = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS
    let response
    try {
      response = await page.goto(url, { waitUntil: 'networkidle', timeout })
    } catch (err) {
      // Req 1.5: a navigation that never reaches network idle is a typed timeout.
      if (err instanceof errors.TimeoutError) throw new AuditTimeoutError('navigation', timeout)
      throw err
    }
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
 * One `page.evaluate` stamps every element with its index and reads its rect in the same
 * synchronous snapshot. One CDP `DOM.getDocument` then reads the stamps back, so each rect is
 * paired with its backendDOMNodeId by element identity, not by position. Elements added or
 * removed between the two snapshots are skipped instead of shifting the pairing. The stamp is
 * removed before returning.
 */
export async function collectBoundingBoxes(page: Page): Promise<BoundingBox[]> {
  const rects = await page.evaluate((attr: string) => {
    const sx = window.scrollX
    const sy = window.scrollY
    return Array.from(document.querySelectorAll('*'), (el, index) => {
      el.setAttribute(attr, String(index))
      const r = el.getBoundingClientRect()
      return { x: r.left + sx, y: r.top + sy, width: r.width, height: r.height }
    })
  }, BOX_STAMP_ATTR)

  let session: CDPSession | undefined
  try {
    session = await page.context().newCDPSession(page)
    const { root } = (await session.send('DOM.getDocument', { depth: -1, pierce: false })) as {
      root: CdpNode
    }
    const idByStamp = stampedBackendIds(root)
    const boxes: BoundingBox[] = []
    rects.forEach((r, index) => {
      const id = idByStamp.get(index)
      if (id !== undefined) boxes.push(normalizeBoundingBox(r, 1, id))
    })
    return boxes
  } finally {
    await session?.detach().catch(() => undefined)
    await page
      .evaluate((attr: string) => {
        for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
      }, BOX_STAMP_ATTR)
      .catch(() => undefined)
  }
}

// Collectors for tasks 9–12 live in ./collectors.ts and are re-exported here,
// so `browser.ts` stays the documented entry point named in tasks.md.
export {
  collectTextNodeStyles,
  collectEventListeners,
  collectPageMetadata,
  buildDomAxMapping,
  isLargeText,
} from './collectors.js'
