import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildExportFilename } from './export-filename'

describe('buildExportFilename', () => {
  it('uses the hostname and the timestamp', () => {
    expect(buildExportFilename('https://www.example.com/cursed-shop/index.html', 1760000000000, 'md')).toBe(
      'unseen-audit-www.example.com-1760000000000.md',
    )
    expect(buildExportFilename('https://Example.com:8443/x', 5, 'json')).toBe('unseen-audit-example.com-5.json')
  })

  it('names a bundled sample, whose URL is the relative /cursed-shop/ path', () => {
    expect(buildExportFilename('/cursed-shop/index.html', 1760000000000, 'md')).toBe(
      'unseen-audit-cursed-shop-sample-1760000000000.md',
    )
    expect(buildExportFilename('/cursed-shop/checkout.html', 7, 'json')).toBe('unseen-audit-cursed-shop-sample-7.json')
  })

  it('falls back for URLs that do not parse and for IPv6 hosts', () => {
    expect(buildExportFilename('not a url', 1, 'md')).toBe('unseen-audit-not-a-url-1.md')
    expect(buildExportFilename('http://[::1]/', 1, 'md')).toMatch(/^unseen-audit-[a-z0-9.-]+-1\.md$/)
    expect(buildExportFilename('', 1, 'md')).toBe('unseen-audit-site-1.md')
  })

  it('always matches the pattern with only letters, digits, hyphens and periods', () => {
    fc.assert(
      fc.property(fc.oneof(fc.webUrl(), fc.string()), fc.integer({ min: 0, max: 4_102_444_800_000 }), fc.constantFrom('md', 'json'), (url, timestamp, extension) => {
        const name = buildExportFilename(url, timestamp, extension)
        expect(name).toMatch(/^unseen-audit-[a-z0-9.-]+-\d+\.(md|json)$/)
        expect(name.endsWith(`-${timestamp}.${extension}`)).toBe(true)
      }),
    )
  })
})
