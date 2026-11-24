import { test, expect } from '@playwright/test'
import type { Browser, BrowserContextOptions } from 'playwright'
import { STABLE_HTML_ORIGIN, auditHtml, auditUrlWithHooks } from '../src/audit.js'
import { AuditResourceLimitError } from '../src/types.js'

function captureContextOptions(): { seen: BrowserContextOptions[]; onBrowserAcquired: (b: Browser) => void } {
  const seen: BrowserContextOptions[] = []
  const patched = new WeakSet<Browser>()
  return {
    seen,
    onBrowserAcquired: (browser) => {
      if (patched.has(browser)) return
      patched.add(browser)
      const original = browser.newContext.bind(browser)
      browser.newContext = (options?: BrowserContextOptions) => {
        seen.push(options ?? {})
        return original(options)
      }
    },
  }
}

const PAGE = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>proxy</h1></main></body></html>'

test('the default audit (a policy with no mode) creates its context with the per-audit proxy and the loopback bypass removed', async () => {
  const capture = captureContextOptions()
  const noMode = { shouldBlock: async (): Promise<{ block: boolean; reason: string }> => ({ block: false, reason: '' }) }
  // The fake dialler refuses, so the audit fails fast; the context options are what matter.
  await auditUrlWithHooks('http://public.test/', { safeFetchPolicy: noMode, timeoutMs: 20_000 }, {
    ...capture,
    proxy: {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      dial: () => {
        throw new Error('no network in this test')
      },
    },
  }).catch(() => null)
  const proxy = capture.seen[0]?.proxy
  expect(proxy?.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  expect(proxy?.bypass).toBe('<-loopback>')
})

test('a permissive audit uses no proxy', async () => {
  const capture = captureContextOptions()
  await auditUrlWithHooks('http://127.0.0.1:1/', { allowPrivate: true, timeoutMs: 20_000 }, { ...capture }).catch(() => null)
  expect(capture.seen[0]).toBeDefined()
  expect(capture.seen[0]?.proxy).toBeUndefined()
})

test('two sequential restrictive audits each get their own proxy and their own blocked log', async () => {
  const ws = (port: number): string =>
    `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>ws</h1></main><script>try{new WebSocket('ws://127.0.0.1:${port}/')}catch(e){}</script></body></html>`
  const first = await auditHtml(ws(41001))
  const second = await auditHtml(ws(41002))
  const urls = (r: { blockedRequests: Array<{ url: string }> }): string[] => r.blockedRequests.map((b) => b.url)
  expect(urls(first)).toEqual(['connect://127.0.0.1:41001'])
  expect(urls(second)).toEqual(['connect://127.0.0.1:41002'])
})

test('auditHtml works under the restrictive policy, serving the page from the synthetic origin', async () => {
  const raw = await auditHtml(PAGE)
  expect(raw.auditedUrl).toBe(`${STABLE_HTML_ORIGIN}/`)
  expect(raw.axNodes.some((n) => n.role.value === 'heading' && n.name.value === 'proxy')).toBe(true)
  expect(raw.blockedRequests).toEqual([])
})

test('relative subresources on the synthetic origin fail closed (404)', async () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>x</h1><img src="/missing.png" alt="m"></main></body></html>`
  const raw = await auditHtml(html)
  expect(raw.auditedUrl).toBe(`${STABLE_HTML_ORIGIN}/`)
})

test('a restrictive audit of a page with 501 subresources fails with AuditResourceLimitError(request-count)', async () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>x</h1></main>
<script>for (let i = 0; i < 501; i++) { new Image().src = '/i' + i + '.png' }</script></body></html>`
  const err: unknown = await auditHtml(html).then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AuditResourceLimitError)
})
