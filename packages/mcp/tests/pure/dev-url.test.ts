import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { DEFAULT_DEV_URL, resolveDevUrl } from '../../src/pure/dev-url.js'

const RUNS = { numRuns: 100 }
const validUrl = fc.webUrl({ validSchemes: ['http', 'https'] })
const anything: fc.Arbitrary<unknown> = fc.oneof(fc.string(), fc.constant(undefined), fc.constant(null), fc.integer(), fc.constant('file:///etc/passwd'), fc.constant('ftp://x/'))

function isHttp(url: string): boolean {
  const p = new URL(url).protocol
  return p === 'http:' || p === 'https:'
}

test('property P9: a valid env value wins over config', async () => {
  await fc.assert(
    fc.asyncProperty(validUrl, validUrl, async (envUrl, cfgUrl) => {
      expect(resolveDevUrl({ UNSEEN_DEV_URL: envUrl }, { devServerUrl: cfgUrl })).toEqual({ url: envUrl.trim(), source: 'env' })
    }),
    RUNS
  )
})

test('property P9: with no valid env value a valid config value wins', async () => {
  await fc.assert(
    fc.asyncProperty(validUrl, fc.constantFrom(undefined, '', 'not a url', 'file:///x'), async (cfgUrl, badEnv) => {
      expect(resolveDevUrl({ UNSEEN_DEV_URL: badEnv }, { devServerUrl: cfgUrl })).toEqual({ url: cfgUrl.trim(), source: 'config' })
    }),
    RUNS
  )
})

test('property P9: with nothing valid the default is returned and the source says so', async () => {
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(undefined, '', 'nope', 'file:///x', 'javascript:alert(1)'), anything, async (badEnv, badCfg) => {
      const cfg = typeof badCfg === 'string' && /^https?:\/\//i.test(badCfg) ? null : { devServerUrl: badCfg }
      if (cfg === null) return
      const resolved = resolveDevUrl({ UNSEEN_DEV_URL: badEnv }, cfg)
      if (resolved.source === 'default') expect(resolved.url).toBe(DEFAULT_DEV_URL)
    }),
    RUNS
  )
})

test('property P9: the result is always an http(s) URL', async () => {
  await fc.assert(
    fc.asyncProperty(anything, anything, async (e, c) => {
      const envValue = typeof e === 'string' ? e : undefined
      expect(isHttp(resolveDevUrl({ UNSEEN_DEV_URL: envValue }, c).url)).toBe(true)
      expect(isHttp(resolveDevUrl({}, { devServerUrl: c }).url)).toBe(true)
    }),
    RUNS
  )
})
