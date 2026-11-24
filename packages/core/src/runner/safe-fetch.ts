import type { Page } from 'playwright'
import type { SafeFetchPolicy } from '../types.js'
import type { LookupFn } from './dns-resolver.js'
import { validateHost } from './host-validator.js'

type Verdict = { block: boolean; reason: string }

export type RestrictivePolicyDeps = {
  /** Resolver seam for tests. Defaults to `dns.lookup(host, { all: true, verbatim: true })`. */
  lookup?: LookupFn
}

function parseHttpUrl(url: string): { ok: true; url: URL } | { ok: false; verdict: Verdict } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, verdict: { block: true, reason: 'invalid URL format' } }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, verdict: { block: true, reason: `scheme not allowed: ${parsed.protocol}` } }
  }
  return { ok: true, url: parsed }
}

/**
 * Hosted-mode policy: http(s) only, every IP literal is classified, every hostname is resolved
 * (fail closed) and each resolved address must be allowed. This is the pre-check and the
 * `page.route` layer. The in-process proxy (`ssrf-guard-proxy.ts`) is the enforcement layer.
 */
export class RestrictiveSafeFetchPolicy implements SafeFetchPolicy {
  readonly mode: 'restrictive' = 'restrictive'

  constructor(private readonly deps: RestrictivePolicyDeps = {}) {}

  async shouldBlock(url: string): Promise<Verdict> {
    const parsed = parseHttpUrl(url)
    if (!parsed.ok) return parsed.verdict
    const verdict = await validateHost(parsed.url.hostname, this.deps.lookup)
    return verdict.ok ? { block: false, reason: '' } : { block: true, reason: verdict.reason }
  }
}

/** Local MCP and tests: http(s) only, loopback and private addresses allowed. No proxy is used. */
export class PermissiveSafeFetchPolicy implements SafeFetchPolicy {
  readonly mode: 'permissive' = 'permissive'

  async shouldBlock(url: string): Promise<Verdict> {
    const parsed = parseHttpUrl(url)
    return parsed.ok ? { block: false, reason: '' } : parsed.verdict
  }
}

/**
 * Install the policy as a `page.route('**\/*')` handler. Installed in every mode: it is the single
 * place where requests are counted (ResourceMeter) and where blocked requests are recorded.
 */
export function installSafeFetchPolicy(page: Page, policy: SafeFetchPolicy): void {
  page.route('**/*', async (route) => {
    try {
      const url = route.request().url()
      const { block } = await policy.shouldBlock(url)
      if (block) {
        await route.abort('blockedbyclient')
      } else {
        // fallback() hands the request to routes registered earlier (auditHtml's synthetic origin) or the network.
        await route.fallback()
      }
    } catch {
      // If policy.shouldBlock throws, treat as blocked. The route may already be
      // handled (e.g. the page closed mid-request), so never throw from here.
      await route.abort('blockedbyclient').catch(() => undefined)
    }
  })
}
