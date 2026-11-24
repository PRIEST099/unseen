import { createServer } from 'node:http'
import type { Page } from 'playwright'
import type { AuditOptions, CollectionError, RawAudit, ResourceUsage, SafeFetchPolicy } from './types.js'
import { AuditResourceLimitError, AuditTimeoutError, HtmlSizeError, SsrfBlockedError } from './types.js'
import { DEFAULT_VIEWPORT, PageLoader, getPool } from './runner/browser.js'
import { buildDomAxMapping, collectEventListeners, collectPageMetadata, collectTextNodeStyles } from './runner/collectors.js'
import { collectAxTree } from './runner/ax-tree.js'
import { runAxe } from './runner/axe.js'
import { walkTabs } from './runner/tab-walker.js'
import { PermissiveSafeFetchPolicy, RestrictiveSafeFetchPolicy } from './runner/safe-fetch.js'

export const FULL_AUDIT_TIMEOUT_MS = 60_000
export const MAX_REQUESTS = 500
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024
export const MAX_RESOURCE_BYTES = 10 * 1024 * 1024
export const MAX_HTML_BYTES = 10_485_760

function selectPolicy(options: AuditOptions): SafeFetchPolicy {
  if (options.safeFetchPolicy) return options.safeFetchPolicy
  return options.allowPrivate ? new PermissiveSafeFetchPolicy() : new RestrictiveSafeFetchPolicy()
}

function validateUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new TypeError(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`Unsupported URL scheme: ${parsed.protocol}`)
  }
  return parsed
}

type Tracker = {
  usage: ResourceUsage
  blockedRequests: Array<{ url: string; reason: string }>
  abortedResources: string[]
  limit: AuditResourceLimitError | null
}

function trackResources(page: Page, tracker: Tracker): void {
  const started = new Map<string, number>()
  page.on('request', (req) => {
    started.set(req.url(), Date.now())
    tracker.usage.requestCount++
    if (tracker.usage.requestCount > MAX_REQUESTS && !tracker.limit) {
      tracker.limit = new AuditResourceLimitError('request-count', tracker.usage.requestCount)
    }
  })
  page.on('requestfailed', (req) => {
    const text = req.failure()?.errorText ?? ''
    if (/BLOCKED_BY_CLIENT|blocked/i.test(text)) {
      tracker.blockedRequests.push({ url: req.url(), reason: 'blocked by safe-fetch policy' })
    }
  })
  page.on('response', (res) => {
    const url = res.url()
    const bytes = Number(res.headers()['content-length'] ?? 0) || 0
    tracker.usage.totalBytes += bytes
    tracker.usage.maxResourceBytes = Math.max(tracker.usage.maxResourceBytes, bytes)
    tracker.usage.responseTimings.push({ url, bytesReceived: bytes, durationMs: Date.now() - (started.get(url) ?? Date.now()) })
    if (bytes > MAX_RESOURCE_BYTES) tracker.abortedResources.push(url)
    if (tracker.usage.totalBytes > MAX_TOTAL_BYTES && !tracker.limit) {
      tracker.limit = new AuditResourceLimitError('total-weight', tracker.usage.totalBytes)
    }
  })
}

/** Audit a live URL and return the raw evidence the classifier needs. */
export async function auditUrl(url: string, options: AuditOptions = {}): Promise<RawAudit> {
  validateUrl(url)
  const policy = selectPolicy(options)
  const pre = await policy.shouldBlock(url)
  if (pre.block) throw new SsrfBlockedError(url, pre.reason)

  const timeoutMs = options.timeoutMs ?? FULL_AUDIT_TIMEOUT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuditTimeoutError('full-audit', timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([runAudit(url, policy, options), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function runAudit(url: string, policy: SafeFetchPolicy, options: AuditOptions): Promise<RawAudit> {
  const pool = getPool()
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const viewport = options.viewport ?? { ...DEFAULT_VIEWPORT }
  const tracker: Tracker = {
    usage: { totalBytes: 0, requestCount: 0, maxResourceBytes: 0, responseTimings: [] },
    blockedRequests: [],
    abortedResources: [],
    limit: null,
  }
  try {
    const context = await loader.createContext(browser, options)
    try {
      const { page, screenshotPng, boundingBoxes } = await loader.loadPage(context, url, policy, options, (p) =>
        trackResources(p, tracker)
      )
      if (tracker.limit) throw tracker.limit

      const collectionErrors: CollectionError[] = []
      const axNodes = await collectAxTree(page)
      const [axe, listeners, meta, mapping] = await Promise.all([
        runAxe(page),
        collectEventListeners(page),
        collectPageMetadata(page, axNodes),
        buildDomAxMapping(page, axNodes),
      ])
      // Cursor styles need the listener signals, so styles run after them.
      const styles = await collectTextNodeStyles(page, listeners.signals)
      if (axe.error) collectionErrors.push(axe.error)
      collectionErrors.push(...listeners.errors, ...mapping.errors, ...styles.errors)

      const tabWalkResult = await walkTabs(page)
      if (tracker.limit) throw tracker.limit

      return {
        schemaVersion: '1',
        auditedUrl: url,
        auditedAt: new Date().toISOString(),
        screenshotPng: screenshotPng.toString('base64'),
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        boundingBoxes,
        axNodes,
        axeViolations: axe.violations,
        axeIncomplete: axe.incomplete,
        textNodeStyles: styles.textNodeStyles,
        elementCursorStyles: styles.elementCursorStyles,
        imgAltAttributes: meta.imgAltAttributes,
        eventListenerSignals: listeners.signals,
        tabWalkResult,
        pageMetadata: meta.metadata,
        domAxMapping: mapping.mapping,
        resourceUsage: tracker.usage,
        blockedRequests: tracker.blockedRequests,
        abortedResources: tracker.abortedResources,
        collectionErrors,
      }
    } finally {
      await context.close().catch(() => undefined)
    }
  } finally {
    await pool.release(browser)
  }
}

/**
 * Allows exactly one origin (the in-process server) and delegates every other
 * URL to the configured policy unchanged.
 */
export class OriginScopedPolicy implements SafeFetchPolicy {
  constructor(
    private readonly origin: string,
    private readonly inner: SafeFetchPolicy
  ) {}
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    try {
      if (new URL(url).origin === this.origin) return { block: false, reason: '' }
    } catch {
      /* fall through to the inner policy */
    }
    return this.inner.shouldBlock(url)
  }
}

/** Audit an HTML string by serving it on 127.0.0.1 at a random port. */
export async function auditHtml(html: string, options: AuditOptions = {}): Promise<RawAudit> {
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > MAX_HTML_BYTES) throw new HtmlSizeError(bytes)

  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  try {
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('auditHtml server has no port')
    const origin = `http://127.0.0.1:${addr.port}`
    const policy = new OriginScopedPolicy(origin, selectPolicy(options))
    return await auditUrl(`${origin}/`, { ...options, safeFetchPolicy: policy })
  } finally {
    await new Promise((ok) => server.close(() => ok(undefined)))
  }
}
