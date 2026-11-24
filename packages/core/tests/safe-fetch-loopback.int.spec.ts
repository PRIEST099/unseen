import { test, expect } from '@playwright/test'
import { auditHtml } from '../src/audit.js'
import { startTestServer, type TestServer } from './fixtures/test-server.js'

let server: TestServer
let port: number
test.beforeAll(async () => {
  server = await startTestServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' })
    res.end('secret')
  })
  port = Number(new URL(server.baseUrl).port)
})
test.afterAll(async () => {
  await server.close()
})

// Spec decision A: a page served through the proxy fetch()es loopback by every spelling and the metadata IP.
test('fetch() to 127.0.0.1, localhost, [::1] and 169.254.169.254 is blocked and the live server sees nothing', async () => {
  const targets = [
    `http://127.0.0.1:${port}/`,
    `http://localhost:${port}/`,
    `http://[::1]:${port}/`,
    'http://169.254.169.254/',
  ]
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>ssrf</h1></main>
<script>Promise.allSettled(${JSON.stringify(targets)}.map(u => fetch(u, { mode: 'no-cors' })))</script></body></html>`

  const raw = await auditHtml(html)

  for (const target of targets) {
    expect(raw.blockedRequests.map((b) => b.url), `blocked: ${target}`).toContain(target)
  }
  expect(server.hits.size).toBe(0)
})
