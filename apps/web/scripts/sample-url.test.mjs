import { describe, expect, it } from 'vitest'
import { sampleDisplayUrl } from './sample-url.mjs'

describe('sampleDisplayUrl', () => {
  it('defaults to the relative path this app serves the shop at', () => {
    expect(sampleDisplayUrl('index.html', undefined)).toBe('/cursed-shop/index.html')
    expect(sampleDisplayUrl('checkout.html', '')).toBe('/cursed-shop/checkout.html')
    expect(sampleDisplayUrl('product.html', '   ')).toBe('/cursed-shop/product.html')
  })

  it('prefixes PUBLIC_BASE_URL when it is set, keeping any mount path', () => {
    expect(sampleDisplayUrl('index.html', 'https://unseen.example.org')).toBe('https://unseen.example.org/cursed-shop/index.html')
    expect(sampleDisplayUrl('index.html', 'https://unseen.example.org/')).toBe('https://unseen.example.org/cursed-shop/index.html')
    expect(sampleDisplayUrl('index.html', 'http://localhost:3000/app/')).toBe('http://localhost:3000/app/cursed-shop/index.html')
  })

  it('never invents a domain', () => {
    for (const page of ['index.html', 'product.html', 'checkout.html']) {
      expect(sampleDisplayUrl(page, undefined)).not.toMatch(/^[a-z]+:\/\//i)
    }
  })

  it.each(['the-unseen.app', 'ftp://example.org', 'https://example.org/?q=1', 'https://example.org/#x'])(
    'rejects an unusable PUBLIC_BASE_URL %j',
    (base) => {
      expect(() => sampleDisplayUrl('index.html', base)).toThrow(/PUBLIC_BASE_URL/)
    },
  )
})
