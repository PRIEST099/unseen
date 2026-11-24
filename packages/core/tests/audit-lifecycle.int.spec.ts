import { test, expect } from '@playwright/test'
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
  await expect(auditUrl(`${pages.baseUrl}/many-links.html`, { ...LOCAL, timeoutMs: 3_000 })).rejects.toMatchObject({
    operation: 'full-audit',
  })
  expect(Date.now() - t0).toBeLessThan(8_000)
  // before the fix the slot stayed busy until the 300-step walk finished (about 10 s later)
  await expectPoolIdle(3_000)
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
