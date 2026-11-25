import { describe, expect, it } from 'vitest'
import { absoluteHostname, isSamplePath, SAMPLE_SITE_LABEL, siteLabel } from './audited-url'

describe('isSamplePath', () => {
  it('recognises the relative path recorded with a bundled sample', () => {
    expect(isSamplePath('/cursed-shop/index.html')).toBe(true)
    expect(isSamplePath(' /cursed-shop/checkout.html ')).toBe(true)
    expect(isSamplePath('https://example.com/cursed-shop/index.html')).toBe(false)
    expect(isSamplePath('/other/index.html')).toBe(false)
    expect(isSamplePath('')).toBe(false)
  })
})

describe('absoluteHostname', () => {
  it('reads the hostname of an absolute http(s) URL only', () => {
    expect(absoluteHostname('https://Example.com:8443/a')).toBe('example.com')
    expect(absoluteHostname('/cursed-shop/index.html')).toBeUndefined()
    expect(absoluteHostname('mailto:someone@example.com')).toBeUndefined()
    expect(absoluteHostname('not a url')).toBeUndefined()
  })
})

describe('siteLabel', () => {
  it('names a bundled sample instead of inventing a host', () => {
    expect(siteLabel('/cursed-shop/index.html')).toBe(SAMPLE_SITE_LABEL)
    expect(SAMPLE_SITE_LABEL).toBe('Cursed Shop (sample)')
  })

  it('shows the real host for absolute URLs, including a sample built with PUBLIC_BASE_URL', () => {
    expect(siteLabel('https://example.com/page')).toBe('example.com')
    expect(siteLabel('https://unseen.example.org/cursed-shop/index.html')).toBe('unseen.example.org')
  })

  it('falls back to the raw value, or a neutral name when empty', () => {
    expect(siteLabel('/somewhere/else')).toBe('/somewhere/else')
    expect(siteLabel('   ')).toBe('this page')
  })
})
