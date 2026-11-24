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
      shouldBlock: async (url) => {
        this.usage.requestCount++
        if (this.usage.requestCount > MAX_REQUESTS) {
          this.breach(new AuditResourceLimitError('request-count', this.usage.requestCount))
        }
        if (this.limit) return { block: true, reason: 'resource limit reached' }
        return inner.shouldBlock(url)
      },
    }
  }

  /** Start metering a page. Call right after the page is created, before navigation. */
  async attach(page: Page): Promise<void> {
    page.on('requestfailed', (req) => {
      if (/BLOCKED_BY_CLIENT|blocked/i.test(req.failure()?.errorText ?? '')) {
        this.blockedRequests.push({ url: req.url(), reason: 'blocked by safe-fetch policy' })
      }
    })
    const session = await page.context().newCDPSession(page)
    this.session = session
    session.on('Network.requestWillBeSent', (e: RequestWillBeSent) =>
      this.urls.set(e.requestId, { url: e.request.url, startedAt: e.timestamp })
    )
    session.on('Network.dataReceived', (e: DataReceived) => this.onData(e))
    session.on('Network.loadingFinished', (e: LoadingFinished) => this.onFinished(e))
    await session.send('Network.enable')
  }

  async detach(): Promise<void> {
    await this.session?.detach().catch(() => undefined)
  }

  private breach(error: AuditResourceLimitError): void {
    if (this.limit) return
    this.limit = error
    this.onLimit(error)
  }

  private onData(e: DataReceived): void {
    const total = (this.received.get(e.requestId) ?? 0) + e.dataLength
    this.received.set(e.requestId, total)
    this.usage.totalBytes += e.dataLength
    this.usage.maxResourceBytes = Math.max(this.usage.maxResourceBytes, total)
    const url = this.urls.get(e.requestId)?.url
    if (total > MAX_RESOURCE_BYTES && url !== undefined && !this.abortedResources.includes(url)) {
      this.abortedResources.push(url)
    }
    if (this.usage.totalBytes > MAX_TOTAL_BYTES) {
      this.breach(new AuditResourceLimitError('total-weight', this.usage.totalBytes))
    }
  }

  private onFinished(e: LoadingFinished): void {
    const meta = this.urls.get(e.requestId)
    if (!meta) return
    this.usage.responseTimings.push({
      url: meta.url,
      bytesReceived: this.received.get(e.requestId) ?? 0,
      durationMs: Math.max(0, Math.round((e.timestamp - meta.startedAt) * 1000)),
    })
  }
}
