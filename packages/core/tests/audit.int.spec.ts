import net from 'node:net'
import { test, expect } from '@playwright/test'
import { getPool } from '../src/runner/browser.js'
import { auditHtml, auditUrl } from '../src/audit.js'
import { RestrictiveSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import { HtmlSizeError, SsrfBlockedError } from '../src/types.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

let shop: ShopServer
test.beforeAll(async () => {
  shop = await startShopServer()
})
test.afterAll(async () => {
  await shop.close()
})

for (const page of ['index.html', 'checkout.html']) {
  test(`auditUrl assembles a valid RawAudit for ${page}`, async () => {
    const a = await auditUrl(`${shop.baseUrl}/${page}`, { allowPrivate: true })
    expect(a.schemaVersion).toBe('1')
    expect(a.collectionErrors).toEqual([])
    expect(a.screenshotPng.length).toBeGreaterThan(1000)
    expect(a.viewportWidth).toBe(1280)
    expect(a.viewportHeight).toBe(900)
    expect(a.boundingBoxes.every((b) => b.backendDOMNodeId !== 0)).toBe(true)
    expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a)
    expect(a.tabWalkResult.trapDetected).toBe(page === 'checkout.html')
  })
}

test('auditUrl rejects invalid URLs and non-http schemes with TypeError', async () => {
  await expect(auditUrl('not a url')).rejects.toBeInstanceOf(TypeError)
  await expect(auditUrl('file:///etc/passwd')).rejects.toBeInstanceOf(TypeError)
})

test('auditUrl blocks loopback under the restrictive policy before any pool acquire', async () => {
  const pool = getPool()
  const original = pool.acquire.bind(pool)
  let acquires = 0
  pool.acquire = async () => {
    acquires++
    return original()
  }
  try {
    await expect(auditUrl(`${shop.baseUrl}/index.html`)).rejects.toBeInstanceOf(SsrfBlockedError)
    // Req 3.6 / task 14: the check runs before a browser is acquired, so no pool slot was used
    expect(acquires).toBe(0)
    expect(pool.busyCount).toBe(0)
  } finally {
    pool.acquire = original
  }
})

// Finding 41 (updated by safe-fetch): auditHtml has no local server any more; a proxy that cannot listen is a typed Error, not a crash.
test('auditHtml turns a failing proxy listen into an Error instead of crashing', async () => {
  const original = net.Server.prototype.listen
  net.Server.prototype.listen = function (this: net.Server): net.Server {
    queueMicrotask(() => this.emit('error', new Error('listen EMFILE')))
    return this
  }
  try {
    await expect(auditHtml('<!doctype html><html lang="en"><body><h1>x</h1></body></html>')).rejects.toThrow(
      /egress proxy failed to start: listen EMFILE/
    )
    expect(getPool().busyCount).toBe(0)
  } finally {
    net.Server.prototype.listen = original
  }
})

test('auditHtml rejects HTML over 10 MB', async () => {
  await expect(auditHtml('x'.repeat(10_485_761))).rejects.toBeInstanceOf(HtmlSizeError)
})

test('auditHtml works under the restrictive policy; another loopback port stays blocked', async () => {
  const a = await auditHtml(
    '<!doctype html><html lang="en"><body><main><h1>Hi</h1><img src="http://127.0.0.1:1/x.png"><button></button></main></body></html>',
    { safeFetchPolicy: new RestrictiveSafeFetchPolicy() }
  )
  expect(a.schemaVersion).toBe('1')
  expect(a.blockedRequests.map((b) => b.url)).toContain('http://127.0.0.1:1/x.png')
})
