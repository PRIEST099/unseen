import { test, expect } from '@playwright/test'
import net from 'node:net'
import { auditUrlWithHooks } from '../src/audit.js'
import { RestrictiveSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import { SsrfBlockedError } from '../src/types.js'
import type { LookupFn } from '../src/runner/dns-resolver.js'
import type { DialFn } from '../src/runner/ssrf-guard-proxy.js'
import { startTestServer, type TestServer } from './fixtures/test-server.js'

const PUBLIC_IP = '93.184.216.34'

let live: TestServer // the "internal service": must never be hit
let origin: TestServer // stands in for public.test, reached through the fake dialler
let livePort: number

test.beforeAll(async () => {
  live = await startTestServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('secret')
  })
  livePort = Number(new URL(live.baseUrl).port)
  origin = await startTestServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/main-redirect') {
      res.writeHead(302, { location: `http://127.0.0.1:${livePort}/admin` }).end()
    } else if (path === '/r') {
      res.writeHead(302, { location: `http://127.0.0.1:${livePort}/secret.png` }).end()
    } else if (path === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(
        '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>x</h1><img src="http://public.test/r" alt="x"></main></body></html>'
      )
    } else {
      res.writeHead(404).end()
    }
  })
})
test.afterAll(async () => {
  await live.close()
  await origin.close()
})

const lookup: LookupFn = async (host) => {
  if (host === 'public.test') return [{ address: PUBLIC_IP, family: 4 }]
  throw Object.assign(new Error('unknown host'), { code: 'ENOTFOUND' })
}
const dial: DialFn = (target) => {
  if (target.address !== PUBLIC_IP) throw new Error(`unexpected dial to ${target.address}`)
  return net.connect({ host: '127.0.0.1', port: Number(new URL(origin.baseUrl).port) })
}
const hooks = { proxy: { lookup, dial } }
const options = { safeFetchPolicy: new RestrictiveSafeFetchPolicy({ lookup }), timeoutMs: 45_000 }

test('a main-frame redirect to loopback is refused by the proxy and surfaces as SsrfBlockedError', async () => {
  const err: unknown = await auditUrlWithHooks('http://public.test/main-redirect', options, hooks).then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(SsrfBlockedError)
  if (err instanceof SsrfBlockedError) expect(err.reason).toBe('blocked IP address (loopback)')
  expect(live.hits.size).toBe(0)
})

test('a subresource redirect to loopback is recorded once and the live server is never hit', async () => {
  const raw = await auditUrlWithHooks('http://public.test/page', options, hooks)
  const target = `http://127.0.0.1:${livePort}/secret.png`
  expect(raw.blockedRequests.filter((b) => b.url === target)).toEqual([{ url: target, reason: 'blocked IP address (loopback)' }])
  expect(live.hits.size).toBe(0)
})
