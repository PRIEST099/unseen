import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { auditAndClassify, getPool } from '../src/index.js'
import { HAUNTING_TYPES } from '../src/classifier/types.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

type GoldenPage = { hauntings: Record<string, { count: number }> }
const golden = JSON.parse(readFileSync(new URL('../../../apps/cursed-shop/expected-hauntings.json', import.meta.url), 'utf8')) as Record<string, GoldenPage>

let shop: ShopServer
test.beforeAll(async () => {
  shop = await startShopServer()
})
test.afterAll(async () => {
  await getPool().close()
  await shop.close()
})

for (const page of ['index.html', 'product.html', 'checkout.html']) {
  test(`auditAndClassify classifies the cursed shop: ${page}`, async () => {
    test.setTimeout(120_000)
    const audit = await auditAndClassify(`${shop.baseUrl}/${page}`, { allowPrivate: true })
    expect(audit.score).toBeGreaterThan(0)
    expect(audit.score).toBeLessThanOrEqual(100)
    expect(audit.hauntings.length).toBeGreaterThan(0)
    expect(audit.raw.auditedUrl).toBe(`${shop.baseUrl}/${page}`)
    expect(audit.automatedCoverageNote).toContain('30–40%')
    // the live run agrees with the golden counts the offline golden test checks
    for (const type of HAUNTING_TYPES) {
      expect(audit.detectedCountsByType[type], type).toBe(golden[page]?.hauntings[type]?.count ?? 0)
    }
    console.log(`${page}: score ${audit.score}`)
  })
}

test('auditAndClassify propagates audit errors unchanged', async () => {
  await expect(auditAndClassify('ftp://example.com/')).rejects.toThrow(TypeError)
  await expect(auditAndClassify('http://127.0.0.1:9/')).rejects.toThrow(/SSRF blocked/)
})
