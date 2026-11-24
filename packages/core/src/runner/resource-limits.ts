import type { CDPSession, Page } from 'playwright'
import type { ResourceUsage, SafeFetchPolicy } from '../types.js'
import { AuditResourceLimitError } from '../types.js'

/** Page weight limits from security.md. */
export const MAX_REQUESTS = 500
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024
export const MAX_RESOURCE_BYTES = 10 * 1024 * 1024

type RequestWillBeSent = { requestId: string; request: { url: string }; timestamp: number }
type DataReceived = { requestId: string; dataLength: number }
type LoadingFinished = { requestId: string; timestamp: number }

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}
function isRequestWillBeSent(x: Record<string, unknown>): x is RequestWillBeSent {
  return typeof x.requestId === 'string' && typeof x.timestamp === 'number' && isRecord(x.request) && typeof x.request.url === 'string'
}
function isDataReceived(x: Record<string, unknown>): x is DataReceived {
  return typeof x.requestId === 'string' && typeof x.dataLength === 'number'
}
function isLoadingFinished(x: Record<string, unknown>): x is LoadingFinished {
  return typeof x.requestId === 'string' && typeof x.timestamp === 'number'
}

/**
 * Counts what a page actually downloads (CDP `Network.dataReceived`, so chunked
 * and streamed bodies count too) and the requests it makes, and reports the
 * first limit breach through `onLimit` so the audit can stop at once.
 */
export class ResourceMeter {
  readonly usage: ResourceUsage = { totalBytes: 0, requestCount: 0, maxResourceBytes: 0, responseTimings: [] }
  readonly blockedRequests: Array<{ url: string; reason: string }> = []
  readonly abortedResources: string[] = []
  limit: AuditResourceLimitError | null = null

  private session: CDPSession | undefined
  private readonly urls = new Map<string, { url: string; startedAt: number }>()
  private readonly received = new Map<string, number>()

  constructor(private readonly onLimit: (error: AuditResourceLimitError) => void) {}

  /** Wrap a policy so that every request is counted, and none is allowed once a limit is hit. */
  wrapPolicy(inner: SafeFetchPolicy): SafeFetchPolicy {
    return {
      mode: inner.mode,
      shouldBlock: async (url) => {
        this.usage.requestCount++
        if (this.usage.requestCount > MAX_REQUESTS) {
          this.breach(new AuditResourceLimitError('request-count', this.usage.requestCount))
        }
        if (this.limit) return this.record(url, 'resource limit reached')
        try {
          const verdict = await inner.shouldBlock(url)
          return verdict.block ? this.record(url, verdict.reason) : verdict
        } catch (err) {
          // Req 3.7: a policy that throws blocks the request. The route handler aborts it.
          this.blockedRequests.push({ url, reason: 'policy-error' })
          throw err
        }
      },
    }
  }

  /** A request the policy blocked, with the policy's own reason (not inferred from Chromium's failure text). */
  private record(url: string, reason: string): { block: true; reason: string } {
    this.blockedRequests.push({ url, reason })
    return { block: true, reason }
  }

  /** Start metering a page. Call right after the page is created, before navigation. */
  async attach(page: Page): Promise<void> {
    const session = await page.context().newCDPSession(page)
    this.session = session
    session.on('Network.requestWillBeSent', (e: RequestWillBeSent) => this.onRequest('', e))
    session.on('Network.dataReceived', (e: DataReceived) => this.onData('', e))
    session.on('Network.loadingFinished', (e: LoadingFinished) => this.onFinished('', e))
    await session.send('Network.enable')
    await this.watchChildTargets(session)
  }

  /**
   * Out-of-process iframes and workers have their own network stack, invisible to
   * the page session. Playwright cannot address flattened child sessions, so the
   * children are driven through `Target.sendMessageToTarget` (non-flattened auto-attach),
   * recursively, with `Network.enable` on each.
   */
  private async watchChildTargets(session: CDPSession): Promise<void> {
    let nextId = 1
    const wrap = (method: string, params: object): string => JSON.stringify({ id: nextId++, method, params })
    // Each level of nesting is one more Target.sendMessageToTarget around the command.
    const send = async (path: string[], method: string, params: object): Promise<void> => {
      let message = wrap(method, params)
      for (let i = path.length - 1; i >= 1; i--) {
        message = wrap('Target.sendMessageToTarget', { sessionId: path[i], message })
      }
      const first = path[0]
      if (first === undefined) return
      await session.send('Target.sendMessageToTarget', { sessionId: first, message }).catch(() => undefined)
    }
    const attach = async (parent: string[], sessionId: string): Promise<void> => {
      const path = [...parent, sessionId]
      await send(path, 'Network.enable', {})
      await send(path, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false })
    }
    const handle = (path: string[], raw: string): void => {
      const m: unknown = JSON.parse(raw)
      if (!isRecord(m) || typeof m.method !== 'string' || !isRecord(m.params)) return
      const { method, params } = m
      const scope = path.join('/')
      if (method === 'Target.attachedToTarget' && typeof params.sessionId === 'string') void attach(path, params.sessionId)
      else if (method === 'Target.receivedMessageFromTarget' && typeof params.sessionId === 'string' && typeof params.message === 'string') {
        handle([...path, params.sessionId], params.message)
      } else if (method === 'Network.requestWillBeSent' && isRequestWillBeSent(params)) this.onRequest(scope, params)
      else if (method === 'Network.dataReceived' && isDataReceived(params)) this.onData(scope, params)
      else if (method === 'Network.loadingFinished' && isLoadingFinished(params)) this.onFinished(scope, params)
    }
    session.on('Target.attachedToTarget', (e: { sessionId: string }) => void attach([], e.sessionId))
    session.on('Target.receivedMessageFromTarget', (e: { sessionId: string; message: string }) => handle([e.sessionId], e.message))
    await session.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false })
  }

  async detach(): Promise<void> {
    await this.session?.detach().catch(() => undefined)
  }

  private breach(error: AuditResourceLimitError): void {
    if (this.limit) return
    this.limit = error
    this.onLimit(error)
  }

  private onRequest(scope: string, e: RequestWillBeSent): void {
    this.urls.set(`${scope}|${e.requestId}`, { url: e.request.url, startedAt: e.timestamp })
  }

  private onData(scope: string, e: DataReceived): void {
    const id = `${scope}|${e.requestId}`
    const total = (this.received.get(id) ?? 0) + e.dataLength
    this.received.set(id, total)
    this.usage.totalBytes += e.dataLength
    this.usage.maxResourceBytes = Math.max(this.usage.maxResourceBytes, total)
    const url = this.urls.get(id)?.url
    if (total > MAX_RESOURCE_BYTES && url !== undefined && !this.abortedResources.includes(url)) {
      this.abortedResources.push(url)
    }
    if (this.usage.totalBytes > MAX_TOTAL_BYTES) {
      this.breach(new AuditResourceLimitError('total-weight', this.usage.totalBytes))
    }
  }

  private onFinished(scope: string, e: LoadingFinished): void {
    const id = `${scope}|${e.requestId}`
    const meta = this.urls.get(id)
    if (!meta) return
    this.usage.responseTimings.push({
      url: meta.url,
      bytesReceived: this.received.get(id) ?? 0,
      durationMs: Math.max(0, Math.round((e.timestamp - meta.startedAt) * 1000)),
    })
  }
}
