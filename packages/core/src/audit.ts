import { createServer } from 'node:http'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { AuditOptions, AXNode, CollectionError, RawAudit, SafeFetchPolicy, TabWalkResult } from './types.js'
import { AuditTimeoutError, HtmlSizeError, SsrfBlockedError } from './types.js'
import { AuditGuard } from './audit-guard.js'
import { DEFAULT_VIEWPORT, PageLoader, getPool } from './runner/browser.js'
import type { LoadedPage } from './runner/browser.js'
import { buildDomAxMapping, collectEventListeners, collectPageMetadata, collectTextNodeStyles } from './runner/collectors.js'
import { collectAxTree } from './runner/ax-tree.js'
import { runAxe } from './runner/axe.js'
import { walkTabs } from './runner/tab-walker.js'
import { ResourceMeter } from './runner/resource-limits.js'
import { PermissiveSafeFetchPolicy, RestrictiveSafeFetchPolicy } from './runner/safe-fetch.js'

export const FULL_AUDIT_TIMEOUT_MS = 60_000
export const MAX_HTML_BYTES = 10_485_760
/** How long to wait for `context.close()` before the whole browser is closed instead. */
const CONTEXT_CLOSE_TIMEOUT_MS = 5_000

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

/** Test seams. Production callers use `auditUrl`. */
export type AuditHooks = {
  /** Called with the page as soon as it exists, before navigation. */
  onPageCreated?: (page: Page) => void
}

/** Audit a live URL and return the raw evidence the classifier needs. */
export async function auditUrl(url: string, options: AuditOptions = {}): Promise<RawAudit> {
  return auditUrlWithHooks(url, options, {})
}

export async function auditUrlWithHooks(url: string, options: AuditOptions, hooks: AuditHooks): Promise<RawAudit> {
  validateUrl(url)
  const policy = selectPolicy(options)
  // The SSRF pre-check runs before a browser is acquired or launched.
  const pre = await policy.shouldBlock(url)
  if (pre.block) throw new SsrfBlockedError(url, pre.reason)

  const timeoutMs = options.timeoutMs ?? FULL_AUDIT_TIMEOUT_MS
  const guard = new AuditGuard()
  const timer = setTimeout(() => guard.fail(new AuditTimeoutError('full-audit', timeoutMs)), timeoutMs)
  try {
    return await runAudit(url, policy, options, guard, hooks)
  } finally {
    clearTimeout(timer)
  }
}

/** Acquire a pool slot; if the audit fails while still queued, give a late slot straight back. */
async function acquireBrowser(guard: AuditGuard): Promise<Browser> {
  const pool = getPool()
  const acquiring = pool.acquire()
  try {
    return await guard.race(acquiring)
  } catch (err) {
    acquiring.then((late) => pool.release(late), () => undefined)
    throw err
  }
}

/** Close a context; if that hangs (crashed renderer), close the whole browser so the slot is not lost. */
async function closeContext(context: BrowserContext, browser: Browser): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const closed = context.close().then(() => true, () => true)
  const timedOut = new Promise<boolean>((ok) => {
    timer = setTimeout(() => ok(false), CONTEXT_CLOSE_TIMEOUT_MS)
  })
  const ok = await Promise.race([closed, timedOut])
  clearTimeout(timer)
  if (!ok) await browser.close().catch(() => undefined)
}

async function runAudit(
  url: string,
  policy: SafeFetchPolicy,
  options: AuditOptions,
  guard: AuditGuard,
  hooks: AuditHooks
): Promise<RawAudit> {
  const started = Date.now()
  const crashed = (): AuditTimeoutError => new AuditTimeoutError('browser-crash', Date.now() - started)
  const browser = await acquireBrowser(guard)
  const onDisconnect = (): void => guard.fail(crashed())
  browser.on('disconnected', onDisconnect)
  try {
    const loader = new PageLoader()
    const context = await guard.race(loader.createContext(browser, options))
    try {
      return await collectAudit(url, policy, options, guard, { loader, context, crashed, hooks })
    } finally {
      await closeContext(context, browser)
    }
  } finally {
    browser.off('disconnected', onDisconnect)
    await getPool().release(browser)
  }
}

type AuditParts = {
  loader: PageLoader
  context: BrowserContext
  crashed: () => AuditTimeoutError
  hooks: AuditHooks
}

async function collectAudit(
  url: string,
  policy: SafeFetchPolicy,
  options: AuditOptions,
  guard: AuditGuard,
  parts: AuditParts
): Promise<RawAudit> {
  const meter = new ResourceMeter((limit) => guard.fail(limit))
  const loaded = await guard.race(
    parts.loader.loadPage(parts.context, url, meter.wrapPolicy(policy), options, async (page) => {
      // A renderer crash at any later point must end the audit, not hang it.
      page.on('crash', () => guard.fail(parts.crashed()))
      parts.hooks.onPageCreated?.(page)
      await meter.attach(page)
    })
  )
  loaded.page.on('close', () => guard.fail(parts.crashed()))
  try {
    const collectionErrors: CollectionError[] = []
    const evidence = await collectEvidence(loaded.page, guard, collectionErrors)
    return assemble(url, options, loaded, meter, evidence, collectionErrors)
  } finally {
    // Not awaited: on a crashed renderer a CDP detach never settles. Closing the context drops the session anyway.
    void meter.detach()
  }
}

type Evidence = {
  axNodes: AXNode[]
  axe: Awaited<ReturnType<typeof runAxe>>
  listeners: Awaited<ReturnType<typeof collectEventListeners>>
  meta: Awaited<ReturnType<typeof collectPageMetadata>>
  mapping: Awaited<ReturnType<typeof buildDomAxMapping>>
  styles: Awaited<ReturnType<typeof collectTextNodeStyles>>
  tabWalkResult: TabWalkResult
}

function emptyWalk(): TabWalkResult {
  return {
    steps: [],
    trapDetected: false,
    trapRegionNodeIds: [],
    stepCapReached: false,
    cycles: [],
    walkStartedAtMs: Date.now(),
    endReason: 'cdp-error',
  }
}

/** The Tab walk is evidence, not a precondition: a failure is recorded and the audit goes on. */
async function walkOrRecord(page: Page, guard: AuditGuard, errors: CollectionError[]): Promise<TabWalkResult> {
  try {
    return await guard.race(walkTabs(page))
  } catch (err) {
    if (guard.hasFailed) throw err
    errors.push({ step: 'tab-walk', message: err instanceof Error ? err.message : String(err) })
    return emptyWalk()
  }
}

async function collectEvidence(page: Page, guard: AuditGuard, collectionErrors: CollectionError[]): Promise<Evidence> {
  const axNodes = await guard.race(collectAxTree(page))
  const [axe, listeners, meta, mapping] = await guard.race(
    Promise.all([
      runAxe(page),
      collectEventListeners(page),
      collectPageMetadata(page, axNodes),
      buildDomAxMapping(page, axNodes),
    ])
  )
  // Cursor styles need the listener signals, so styles run after them.
  const styles = await guard.race(collectTextNodeStyles(page, listeners.signals))
  if (axe.error) collectionErrors.push(axe.error)
  collectionErrors.push(...listeners.errors, ...mapping.errors, ...styles.errors)
  const tabWalkResult = await walkOrRecord(page, guard, collectionErrors)
  return { axNodes, axe, listeners, meta, mapping, styles, tabWalkResult }
}

function assemble(
  url: string,
  options: AuditOptions,
  loaded: LoadedPage,
  meter: ResourceMeter,
  ev: Evidence,
  collectionErrors: CollectionError[]
): RawAudit {
  const viewport = options.viewport ?? { ...DEFAULT_VIEWPORT }
  return {
    schemaVersion: '1',
    auditedUrl: url,
    auditedAt: new Date().toISOString(),
    screenshotPng: loaded.screenshotPng.toString('base64'),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    boundingBoxes: loaded.boundingBoxes,
    axNodes: ev.axNodes,
    axeViolations: ev.axe.violations,
    axeIncomplete: ev.axe.incomplete,
    textNodeStyles: ev.styles.textNodeStyles,
    elementCursorStyles: ev.styles.elementCursorStyles,
    imgAltAttributes: ev.meta.imgAltAttributes,
    eventListenerSignals: ev.listeners.signals,
    tabWalkResult: ev.tabWalkResult,
    pageMetadata: ev.meta.metadata,
    domAxMapping: ev.mapping.mapping,
    resourceUsage: meter.usage,
    blockedRequests: meter.blockedRequests,
    abortedResources: meter.abortedResources,
    collectionErrors,
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
