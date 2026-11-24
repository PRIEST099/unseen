import { test, expect } from '@playwright/test'
import type { Browser, BrowserContextOptions } from 'playwright'
import { auditUrl, auditUrlWithHooks } from '../src/audit.js'
import { getPool } from '../src/runner/browser.js'
import { AuditResourceLimitError, AuditTimeoutError } from '../src/types.js'
import { startPagesServer, type PagesServer } from './fixtures/pages-server.js'
import { startTestServer, streamBytes, TINY_PNG, type TestServer } from './fixtures/test-server.js'

let pages: PagesServer
test.beforeAll(async () => {
  pages = await startPagesServer()
})
test.afterAll(async () => {
  await pages.close()
})

const LOCAL = { allowPrivate: true } as const

/** Hooks that remember the browser the audit ran in, so a test can look at its contexts afterwards. */
function captureBrowser(): { browser: () => Browser; hooks: { onBrowserAcquired: (b: Browser) => void } } {
  let seen: Browser | undefined
  return {
    browser: () => {
      if (!seen) throw new Error('the audit never acquired a browser')
      return seen
    },
    hooks: { onBrowserAcquired: (b) => void (seen = b) },
  }
}

/** Waits until the pool has no busy slot, i.e. every context was closed and every slot released. */
async function expectPoolIdle(withinMs = 10_000): Promise<void> {
  const deadline = Date.now() + withinMs
  while (getPool().busyCount > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  expect(getPool().busyCount).toBe(0)
}

// Finding 4: AX nodes with no DOM node must not fail the audit.
test('finding 4: default lists, generated content and <details> are audited', async () => {
  const a = await auditUrl(`${pages.baseUrl}/ax-generated.html`, LOCAL)
  expect(a.axNodes.length).toBeGreaterThan(0)
  expect(a.axNodes.some((n) => n.backendDOMNodeId === 0 && n.role.value !== 'InlineTextBox')).toBe(true)
  expect(a.collectionErrors.filter((e) => e.step === 'ax-tree')).toEqual([])
})

// Finding 15 (and Req 1.6): a timeout tears the audit down instead of leaving it running.
test('finding 15: the full-audit timeout closes the context and frees the pool slot', async () => {
  const t0 = Date.now()
  const seen = captureBrowser()
  await expect(
    auditUrlWithHooks(`${pages.baseUrl}/many-links.html`, { ...LOCAL, timeoutMs: 3_000 }, seen.hooks)
  ).rejects.toMatchObject({ operation: 'full-audit' })
  expect(Date.now() - t0).toBeLessThan(8_000)
  // before the fix the slot stayed busy until the 300-step walk finished (about 10 s later)
  await expectPoolIdle(3_000)
  // the slot is free AND the context was really closed (finding 24)
  expect(seen.browser().contexts()).toHaveLength(0)
})

// Finding 15 (run 19b): a context that is still being created when the audit fails must be closed when it arrives.
test('finding 15: a context created after the timeout is closed, not leaked', async () => {
  const seen = captureBrowser()
  let restore: (() => void) | undefined
  const err: unknown = await auditUrlWithHooks(`${pages.baseUrl}/many-links.html`, { ...LOCAL, timeoutMs: 1_500 }, {
    onBrowserAcquired: (b) => {
      seen.hooks.onBrowserAcquired(b)
      const original = b.newContext.bind(b)
      Object.assign(b, {
        newContext: async (options?: BrowserContextOptions) => {
          await new Promise((r) => setTimeout(r, 2_500)) // resolves after the audit already failed
          return original(options)
        },
      })
      restore = () => void Object.assign(b, { newContext: original })
    },
  }).then(
    () => null,
    (e: unknown) => e
  )
  try {
    expect(err).toBeInstanceOf(AuditTimeoutError)
    expect((err as AuditTimeoutError).operation).toBe('full-audit')
    await new Promise((r) => setTimeout(r, 3_000))
    expect(seen.browser().contexts()).toHaveLength(0)
  } finally {
    restore?.()
  }
})

// Finding 24: a Tab walk that fails is recorded, the audit goes on.
test('finding 24: a Tab walk failure becomes CollectionError tab-walk and the audit still resolves', async () => {
  const a = await auditUrlWithHooks(`${pages.baseUrl}/csp-style-src.html`, LOCAL, {
    walk: async () => {
      throw new Error('walk exploded')
    },
  })
  expect(a.collectionErrors).toContainEqual({ step: 'tab-walk', message: 'walk exploded' })
  expect(a.tabWalkResult).toMatchObject({ steps: [], trapDetected: false, endReason: 'cdp-error' })
  expect(a.axNodes.length).toBeGreaterThan(0)
})

// Finding 3 (and Req 1.8): a renderer crash after the page loaded is a typed error, not a hang.
test('finding 3: a renderer crash during the Tab walk is a browser-crash error and frees the slot', async () => {
  const t0 = Date.now()
  const run = auditUrlWithHooks(`${pages.baseUrl}/many-links.html`, { ...LOCAL, timeoutMs: 30_000 }, {
    onPageCreated: (page) => {
      setTimeout(() => {
        void page
          .context()
          .newCDPSession(page)
          .then((s) => s.send('Page.crash'))
          .catch(() => undefined)
      }, 5_000)
    },
  })
  const err: unknown = await run.then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AuditTimeoutError)
  expect((err as AuditTimeoutError).operation).toBe('browser-crash')
  expect(Date.now() - t0).toBeLessThan(20_000)
  await expectPoolIdle(8_000)
})

// Req 1.5: a navigation that never reaches network idle is a typed navigation timeout.
test('Req 1.5: a never-idle page throws AuditTimeoutError(navigation) and frees the slot', async () => {
  const server: TestServer = await startTestServer((req, res) => {
    if (req.url === '/hang') return // never answers
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html lang="en"><body><h1>x</h1><script>fetch("/hang")</script></body></html>')
  })
  try {
    const err: unknown = await auditUrl(`${server.baseUrl}/`, { ...LOCAL, navigationTimeoutMs: 1_500 }).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(AuditTimeoutError)
    expect((err as AuditTimeoutError).operation).toBe('navigation')
    await expectPoolIdle(5_000)
  } finally {
    await server.close()
  }
})

// Finding 16 (Req 4): limits are enforced while the page loads.
test('finding 16: more than 500 requests aborts the load; later requests never reach the server', async () => {
  const imgs = Array.from({ length: 700 }, (_, i) => `<img src="/i/${i}.png" alt="">`).join('')
  const server = await startTestServer((req, res) => {
    if (req.url?.startsWith('/i/')) {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(TINY_PNG)
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html lang="en"><body><h1>x</h1>${imgs}</body></html>`)
  })
  try {
    const err: unknown = await auditUrl(`${server.baseUrl}/`, LOCAL).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(AuditResourceLimitError)
    expect((err as AuditResourceLimitError).limitType).toBe('request-count')
    const imageHits = [...server.hits].filter(([p]) => p.startsWith('/i/')).reduce((n, [, c]) => n + c, 0)
    expect(imageHits).toBeLessThanOrEqual(500)
    await expectPoolIdle(5_000)
  } finally {
    await server.close()
  }
})

test('finding 16: a chunked body with no content-length still counts toward the 50 MB limit', async () => {
  const server = await startTestServer((req, res) => {
    if (req.url?.startsWith('/big/')) return streamBytes(res, 20)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html lang="en"><body><h1>x</h1><script src="/big/1"></script><script src="/big/2"></script><script src="/big/3"></script></body></html>')
  })
  try {
    const err: unknown = await auditUrl(`${server.baseUrl}/`, LOCAL).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(AuditResourceLimitError)
    expect((err as AuditResourceLimitError).limitType).toBe('total-weight')
    await expectPoolIdle(5_000)
  } finally {
    await server.close()
  }
})

// Finding 16 (run 19b): traffic of out-of-process iframes and workers counts too.
test('finding 16: 3 x 20 MB loaded inside a cross-origin iframe hits the 50 MB limit', async () => {
  const server = await startTestServer((req, res) => {
    if (req.url?.startsWith('/big/')) return streamBytes(res, 20)
    res.writeHead(200, { 'content-type': 'text/html' })
    if (req.url === '/frame') {
      res.end('<!doctype html><html lang="en"><body><script src="/big/1"></script><script src="/big/2"></script><script src="/big/3"></script></body></html>')
      return
    }
    const port = req.headers.host?.split(':')[1] ?? ''
    // localhost vs 127.0.0.1 are different sites, so the frame lives in its own process
    res.end(`<!doctype html><html lang="en"><body><h1>x</h1><iframe title="f" src="http://localhost:${port}/frame"></iframe></body></html>`)
  })
  try {
    const err: unknown = await auditUrl(`${server.baseUrl}/`, LOCAL).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(AuditResourceLimitError)
    expect((err as AuditResourceLimitError).limitType).toBe('total-weight')
    await expectPoolIdle(5_000)
  } finally {
    await server.close()
  }
})

test('finding 16: 3 x 20 MB fetched by a dedicated worker hits the 50 MB limit', async () => {
  const server = await startTestServer((req, res) => {
    if (req.url?.startsWith('/big/')) return streamBytes(res, 20)
    if (req.url === '/w.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      res.end("Promise.all([1, 2, 3].map((n) => fetch('/big/' + n).then((r) => r.arrayBuffer()))).then(() => postMessage('done'))")
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html lang="en"><body><h1>x</h1><script>new Worker("/w.js")</script></body></html>')
  })
  try {
    const err: unknown = await auditUrl(`${server.baseUrl}/`, LOCAL).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(AuditResourceLimitError)
    expect((err as AuditResourceLimitError).limitType).toBe('total-weight')
    await expectPoolIdle(5_000)
  } finally {
    await server.close()
  }
})

// Finding 38: blockedRequests carries the policy's own reason, 'policy-error' for a throwing policy, and no Chromium ORB blocks.
test('finding 38: blockedRequests records policy reasons and policy-error, not Chromium blocks', async () => {
  const server = await startTestServer((req, res) => {
    if (req.url === '/orb.json') {
      res.writeHead(200, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' })
      res.end('{"a":1}')
      return
    }
    if (req.url?.endsWith('.png')) {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(TINY_PNG)
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<!doctype html><html lang="en"><body><main><h1>x</h1>' +
        '<img src="/blocked.png" alt=""><img src="/boom.png" alt=""><img src="/orb.json" alt=""><img src="/fine.png" alt="">' +
        '</main></body></html>'
    )
  })
  try {
    const a = await auditUrl(`${server.baseUrl}/`, {
      safeFetchPolicy: {
        // A local test server is reached directly: the stub policy opts out of the egress proxy.
        mode: 'permissive',
        shouldBlock: async (url) => {
          if (url.endsWith('/boom.png')) throw new Error('policy exploded')
          if (url.endsWith('/blocked.png')) return { block: true, reason: 'test-reason' }
          return { block: false, reason: '' }
        },
      },
    })
    const byUrl = new Map(a.blockedRequests.map((b) => [b.url, b.reason]))
    expect(byUrl.get(`${server.baseUrl}/blocked.png`)).toBe('test-reason')
    expect(byUrl.get(`${server.baseUrl}/boom.png`)).toBe('policy-error')
    expect(byUrl.has(`${server.baseUrl}/orb.json`)).toBe(false)
    expect(byUrl.has(`${server.baseUrl}/fine.png`)).toBe(false)
    expect(a.blockedRequests).toHaveLength(2)
  } finally {
    await server.close()
  }
})

test('Req 4: one resource over 10 MB is recorded in abortedResources without failing the audit', async () => {
  const server = await startTestServer((req, res) => {
    if (req.url === '/big/one') return streamBytes(res, 12)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html lang="en"><body><main><h1>x</h1><script src="/big/one"></script></main></body></html>')
  })
  try {
    const a = await auditUrl(`${server.baseUrl}/`, LOCAL)
    expect(a.abortedResources).toEqual([`${server.baseUrl}/big/one`])
    expect(a.resourceUsage.maxResourceBytes).toBeGreaterThan(10 * 1024 * 1024)
    expect(a.resourceUsage.totalBytes).toBeLessThan(50 * 1024 * 1024)
  } finally {
    await server.close()
  }
})
