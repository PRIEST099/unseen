import { test, expect } from '@playwright/test'
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
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
    expect(a.tabWalkResult.trapDetected).toBe(page === 'checkout.html')
  })
}

test('auditUrl rejects invalid URLs and non-http schemes with TypeError', async () => {
  await expect(auditUrl('not a url')).rejects.toBeInstanceOf(TypeError)
  await expect(auditUrl('file:///etc/passwd')).rejects.toBeInstanceOf(TypeError)
})

test('auditUrl blocks loopback under the restrictive policy before launching', async () => {
  await expect(auditUrl(`${shop.baseUrl}/index.html`)).rejects.toBeInstanceOf(SsrfBlockedError)
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
