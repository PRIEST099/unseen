import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { auditHtml } from '../src/audit.js'
import { buildLaunchArgs, WEBRTC_LEAK_FLAGS } from '../src/runner/browser.js'

let server: Server
let port: number
let upgrades = 0
const sockets = new Set<Socket>()

test.beforeAll(async () => {
  server = createServer((_req, res) => res.writeHead(404).end())
  server.on('upgrade', (_req, socket) => {
    upgrades++
    socket.destroy()
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('error', () => undefined)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  port = addr.port
})
test.afterAll(async () => {
  for (const s of sockets) s.destroy()
  await new Promise((ok) => server.close(() => ok(undefined)))
})

test('a WebSocket to a loopback port is blocked by the proxy and the server never sees an upgrade', async () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>ws</h1></main>
<script>try { const ws = new WebSocket('ws://127.0.0.1:${port}/'); ws.onerror = () => {} } catch (e) {}</script></body></html>`

  const raw = await auditHtml(html)

  expect(raw.blockedRequests).toContainEqual({
    url: `connect://127.0.0.1:${port}`,
    reason: 'blocked IP address (loopback)',
  })
  expect(upgrades).toBe(0)
})

test('Chromium launch args disable WebRTC leaks, QUIC and DNS-over-HTTPS', () => {
  const { args } = buildLaunchArgs()
  for (const flag of WEBRTC_LEAK_FLAGS) expect(args).toContain(flag)
  expect(args).toContain('--disable-quic')
  expect(args).toContain('--disable-features=DnsOverHttps,WebRtcHideLocalIpsWithMdns')
  expect(args).not.toContain('--disable-webrtc')
})

test('a WebSocket to the synthetic audit origin (case and trailing-dot variants) is refused, not dialled', async () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>ws</h1></main>
<script>for (const h of ['audit-html.unseen.invalid', 'AUDIT-HTML.UNSEEN.INVALID', 'audit-html.unseen.invalid.']) {
  try { const ws = new WebSocket('ws://' + h + '/'); ws.onerror = () => {} } catch (e) {}
}</script></body></html>`

  const raw = await auditHtml(html)

  const refused = raw.blockedRequests.filter((b) => b.url.startsWith('connect://audit-html.unseen.invalid'))
  expect(refused.length).toBeGreaterThan(0)
  for (const entry of refused) expect(entry.reason).toBe('synthetic origin is served in-process and is never dialled')
})

test('an audit of a simple page has no blockedRequests for hosts the page never referenced', async () => {
  const html = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>quiet</h1><p>text</p></main></body></html>'

  const raw = await auditHtml(html)

  expect(raw.blockedRequests).toEqual([])
})
