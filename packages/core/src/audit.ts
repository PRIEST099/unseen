import type { Browser, BrowserContext, Page } from 'playwright'
import type {
  AuditOptions,
  AXNode,
  CollectionError,
  DomNodeInfo,
  OnProgressCallback,
  RawAudit,
  SafeFetchPolicy,
  TabWalkResult,
} from './types.js'
import { AuditTimeoutError, HtmlSizeError, NonHtmlContentError, SsrfBlockedError } from './types.js'
import { SsrfGuardProxy } from './runner/ssrf-guard-proxy.js'
import type { BlockedEntry, DialFn } from './runner/ssrf-guard-proxy.js'
import type { LookupFn } from './runner/dns-resolver.js'
import type { ContextProxy } from './runner/browser.js'
import { AuditGuard } from './audit-guard.js'
import { emitProgress } from './progress.js'
import { classify } from './classifier/classify.js'
import type { ClassifiedAudit } from './classifier/types.js'
import { DEFAULT_VIEWPORT, PageLoader, getPool } from './runner/browser.js'
import type { LoadedPage } from './runner/browser.js'
import {
  buildDomAxMapping,
  collectDomNodes,
  collectEventListeners,
  collectPageMetadata,
  collectTextNodeStyles,
} from './runner/collectors.js'
import { collectAxTree } from './runner/ax-tree.js'
import { runAxe } from './runner/axe.js'
import { walkTabsWithErrors } from './runner/tab-walker.js'
import { ResourceMeter, resolveResourceLimits } from './runner/resource-limits.js'
import { PermissiveSafeFetchPolicy, RestrictiveSafeFetchPolicy } from './runner/safe-fetch.js'
import { UNSEEN_VERSION } from './version.js'

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
  /** Called with the browser as soon as the pool hands it out. */
  onBrowserAcquired?: (browser: Browser) => void
  /** Called with the page as soon as it exists, before navigation. */
  onPageCreated?: (page: Page) => void
  /** Replaces the Tab walk (to test the failure path). */
  walk?: (page: Page) => Promise<{ walk: TabWalkResult; errors: CollectionError[] }>
  /** Awaited after the audit is assembled and before the context closes, with the page still open. */
  beforeClose?: (page: Page, raw: RawAudit) => Promise<void>
  /** Registers page routes that answer requests (auditHtml's synthetic origin). Runs before the policy is installed. */
  serve?: (page: Page) => Promise<void>
  /** Egress proxy seams: a fake resolver and dialler for tests, and authorities served in-process that the proxy refuses to dial. */
  proxy?: { lookup?: LookupFn; dial?: DialFn; servedAuthorities?: readonly string[] }
}

/** Per-audit egress state: the proxy's address (absent in permissive mode) and the log it writes to. */
type Egress = { context: ContextProxy | undefined; blockedLog: BlockedEntry[] }

/** A navigation that failed while the proxy was refusing requests is reported as the SSRF block it was. */
function attributeProxyBlock(err: unknown, url: string, log: readonly BlockedEntry[]): unknown {
  // Background browser traffic can fail DNS too; the refusal that caused the failed navigation is the one to report.
  const first = log.find((e) => e.reason.includes('blocked')) ?? log[0]
  if (!first) return err
  const navigationFailure = err instanceof Error && /net::ERR_/.test(err.message)
  return err instanceof NonHtmlContentError || navigationFailure ? new SsrfBlockedError(url, first.reason) : err
}

/** Start the per-audit proxy unless the policy is permissive. No mode means restrictive. */
async function startEgress(
  policy: SafeFetchPolicy,
  hooks: AuditHooks
): Promise<{ egress: Egress; proxy: SsrfGuardProxy | undefined }> {
  const blockedLog: BlockedEntry[] = []
  if (policy.mode === 'permissive') return { egress: { context: undefined, blockedLog }, proxy: undefined }
  const proxy = new SsrfGuardProxy({ blockedLog, ...hooks.proxy })
  try {
    const port = await proxy.start()
    return { egress: { context: { server: `http://127.0.0.1:${port}`, bypass: '<-loopback>' }, blockedLog }, proxy }
  } catch (err) {
    await proxy.stop().catch(() => undefined)
    throw new Error(`egress proxy failed to start: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Audit a live URL and return the raw evidence the classifier needs. */
export async function auditUrl(url: string, options: AuditOptions = {}): Promise<RawAudit> {
  return auditUrlWithHooks(url, options, {})
}

/** Audit a live URL and classify the evidence: hauntings, severity, score. Errors from the audit propagate unchanged. */
export async function auditAndClassify(url: string, options: AuditOptions = {}): Promise<ClassifiedAudit> {
  const raw = await auditUrl(url, options)
  emitProgress(options.onProgress, 'classifying')
  return classify(raw)
}

/** Audit an HTML string and classify the evidence, like `auditAndClassify` does for a URL. */
export async function auditHtmlAndClassify(html: string, options: AuditOptions = {}): Promise<ClassifiedAudit> {
  const raw = await auditHtml(html, options)
  emitProgress(options.onProgress, 'classifying')
  return classify(raw)
}

export async function auditUrlWithHooks(url: string, options: AuditOptions, hooks: AuditHooks): Promise<RawAudit> {
  validateUrl(url)
  const policy = selectPolicy(options)
  // The SSRF pre-check runs before a browser is acquired or launched.
  const pre = await policy.shouldBlock(url)
  if (pre.block) throw new SsrfBlockedError(url, pre.reason)

  const timeoutMs = options.timeoutMs ?? FULL_AUDIT_TIMEOUT_MS
  const { egress, proxy } = await startEgress(policy, hooks)
  const guard = new AuditGuard()
  const timer = setTimeout(() => guard.fail(new AuditTimeoutError('full-audit', timeoutMs)), timeoutMs)
  try {
    return await runAudit(url, policy, options, guard, hooks, egress)
  } catch (err) {
    throw attributeProxyBlock(err, url, egress.blockedLog)
  } finally {
    clearTimeout(timer)
    // runAudit has closed the context by now, so no page is still talking to the proxy.
    await proxy?.stop()
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

/** Create the context; if the audit fails first, close the context when it resolves late. */
async function createContextGuarded(
  loader: PageLoader,
  browser: Browser,
  options: AuditOptions,
  guard: AuditGuard,
  proxy: ContextProxy | undefined
): Promise<BrowserContext> {
  const creating = loader.createContext(browser, options, proxy)
  try {
    return await guard.race(creating)
  } catch (err) {
    creating.then((late) => late.close(), () => undefined).catch(() => undefined)
    throw err
  }
}

async function runAudit(
  url: string,
  policy: SafeFetchPolicy,
  options: AuditOptions,
  guard: AuditGuard,
  hooks: AuditHooks,
  egress: Egress
): Promise<RawAudit> {
  const started = Date.now()
  const crashed = (): AuditTimeoutError => new AuditTimeoutError('browser-crash', Date.now() - started)
  const browser = await acquireBrowser(guard)
  hooks.onBrowserAcquired?.(browser)
  const onDisconnect = (): void => guard.fail(crashed())
  browser.on('disconnected', onDisconnect)
  try {
    const loader = new PageLoader()
    const context = await createContextGuarded(loader, browser, options, guard, egress.context)
    try {
      return await collectAudit(url, policy, options, guard, {
        loader,
        context,
        crashed,
        hooks,
        blockedLog: egress.blockedLog,
        chromiumVersion: browser.version(),
      })
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
  blockedLog: readonly BlockedEntry[]
  chromiumVersion: string
}

async function collectAudit(
  url: string,
  policy: SafeFetchPolicy,
  options: AuditOptions,
  guard: AuditGuard,
  parts: AuditParts
): Promise<RawAudit> {
  const meter = new ResourceMeter((limit) => guard.fail(limit), resolveResourceLimits(options.resourceLimits))
  // Each stage is reported when it starts, so the caller can show the slow step while it runs.
  emitProgress(options.onProgress, 'loading')
  const loaded = await guard.race(
    parts.loader.loadPage(parts.context, url, meter.wrapPolicy(policy), options, async (page) => {
      // A renderer crash at any later point must end the audit, not hang it.
      page.on('crash', () => guard.fail(parts.crashed()))
      parts.hooks.onPageCreated?.(page)
      await parts.hooks.serve?.(page)
      await meter.attach(page)
    })
  )
  loaded.page.on('close', () => guard.fail(parts.crashed()))
  try {
    const collectionErrors: CollectionError[] = []
    const evidence = await collectEvidence(loaded.page, guard, collectionErrors, parts.hooks, options.onProgress)
    const raw = assemble(url, options, loaded, meter, evidence, collectionErrors, parts.blockedLog)
    raw.engine = { unseenVersion: UNSEEN_VERSION, axeVersion: evidence.axe.version, chromiumVersion: parts.chromiumVersion }
    await parts.hooks.beforeClose?.(loaded.page, raw)
    return raw
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
  domNodes: Record<string, DomNodeInfo>
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
async function walkOrRecord(
  page: Page,
  guard: AuditGuard,
  errors: CollectionError[],
  hooks: AuditHooks
): Promise<TabWalkResult> {
  try {
    const { walk, errors: walkErrors } = await guard.race((hooks.walk ?? walkTabsWithErrors)(page))
    errors.push(...walkErrors)
    return walk
  } catch (err) {
    if (guard.hasFailed) throw err
    errors.push({ step: 'tab-walk', message: err instanceof Error ? err.message : String(err) })
    return emptyWalk()
  }
}

async function collectEvidence(
  page: Page,
  guard: AuditGuard,
  collectionErrors: CollectionError[],
  hooks: AuditHooks,
  onProgress: OnProgressCallback | undefined
): Promise<Evidence> {
  emitProgress(onProgress, 'tree')
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
  // Two snapshots, one before and one after the Tab walk: the walk can open or remove elements.
  const referenced = new Set(axNodes.map((n) => n.backendDOMNodeId).filter((id) => id > 0))
  const before = await guard.race(collectDomNodes(page, referenced))
  emitProgress(onProgress, 'walking')
  const tabWalkResult = await walkOrRecord(page, guard, collectionErrors, hooks)
  const after = await guard.race(collectDomNodes(page, referenced))
  collectionErrors.push(...before.errors, ...after.errors)
  const domNodes = { ...after.domNodes, ...before.domNodes }
  return { axNodes, axe, listeners, meta, mapping, styles, domNodes, tabWalkResult }
}

function assemble(
  url: string,
  options: AuditOptions,
  loaded: LoadedPage,
  meter: ResourceMeter,
  ev: Evidence,
  collectionErrors: CollectionError[],
  proxyBlocked: readonly BlockedEntry[]
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
    imgSrcAttributes: ev.meta.imgSrcAttributes,
    domNodes: ev.domNodes,
    eventListenerSignals: ev.listeners.signals,
    tabWalkResult: ev.tabWalkResult,
    pageMetadata: ev.meta.metadata,
    domAxMapping: ev.mapping.mapping,
    resourceUsage: meter.usage,
    // page.route verdicts first, then what the egress proxy refused (redirect hops, WebSockets, tunnels).
    blockedRequests: [...meter.blockedRequests, ...proxyBlocked],
    abortedResources: meter.abortedResources,
    collectionErrors,
  }
}

/**
 * Allows exactly one origin (the synthetic auditHtml origin) and delegates every other
 * URL to the configured policy unchanged. The mode of the inner policy is kept, so the
 * egress proxy is still used unless that policy is permissive.
 */
export class OriginScopedPolicy implements SafeFetchPolicy {
  constructor(
    private readonly origin: string,
    private readonly inner: SafeFetchPolicy
  ) {}
  get mode(): 'restrictive' | 'permissive' | undefined {
    return this.inner.mode
  }
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    try {
      if (new URL(url).origin === this.origin) return { block: false, reason: '' }
    } catch {
      /* fall through to the inner policy */
    }
    return this.inner.shouldBlock(url)
  }
}

/**
 * The origin auditHtml serves the page from. It never resolves in DNS: the page is answered by
 * `route.fulfill` before any network use, so no local HTTP server and no loopback exception exist.
 * It is also the origin reported in `auditedUrl` (Req 12.6).
 */
export const STABLE_HTML_ORIGIN = 'http://audit-html.unseen.invalid'

/** Serve `html` for `/` and `/index.html` on the synthetic origin; every other path is a 404 (relative subresources fail closed). */
async function serveHtml(page: Page, html: string): Promise<void> {
  await page.route(
    (url) => url.origin === STABLE_HTML_ORIGIN,
    async (route) => {
      const path = new URL(route.request().url()).pathname
      const found = path === '/' || path === '/index.html'
      await route
        .fulfill(
          found
            ? { status: 200, contentType: 'text/html; charset=utf-8', body: html }
            : { status: 404, contentType: 'text/plain', body: '' }
        )
        .catch(() => undefined)
    }
  )
}

/** Audit an HTML string. It is served on a synthetic origin through `route.fulfill`; nothing listens on a local port. */
export async function auditHtml(html: string, options: AuditOptions = {}): Promise<RawAudit> {
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > MAX_HTML_BYTES) throw new HtmlSizeError(bytes)

  const policy = new OriginScopedPolicy(STABLE_HTML_ORIGIN, selectPolicy(options))
  return auditUrlWithHooks(`${STABLE_HTML_ORIGIN}/`, { ...options, safeFetchPolicy: policy }, {
    serve: (page) => serveHtml(page, html),
    proxy: { servedAuthorities: [`${new URL(STABLE_HTML_ORIGIN).host}:80`] },
  })
}
