import { describe, it, expect, vi } from 'vitest'
import { DnsResolutionError, resolveHostname } from './dns-resolver.js'
import type { LookupFn } from './dns-resolver.js'

function fail(code: string): LookupFn {
  return async () => {
    throw Object.assign(new Error(`getaddrinfo ${code}`), { code })
  }
}

describe('resolveHostname fails closed', () => {
  it.each(['ENODATA', 'ENOTFOUND', 'EAI_AGAIN'])('throws DNS resolution failed on %s', async (code) => {
    await expect(resolveHostname('x.test', fail(code))).rejects.toThrow(/^DNS resolution failed: .*/)
    await expect(resolveHostname('x.test', fail(code))).rejects.toBeInstanceOf(DnsResolutionError)
  })

  it('throws on an empty answer', async () => {
    await expect(resolveHostname('x.test', async () => [])).rejects.toThrow(/hostname did not resolve/)
  })

  it('throws on an unparseable address', async () => {
    await expect(resolveHostname('x.test', async () => [{ address: 'not-an-ip', family: 4 }])).rejects.toBeInstanceOf(DnsResolutionError)
  })

  it('times out', async () => {
    const never: LookupFn = () => new Promise(() => undefined)
    await expect(resolveHostname('x.test', never, 20)).rejects.toThrow(/timed out/)
  })
})

describe('resolveHostname success', () => {
  it('returns canonical addresses and strips IPv6 brackets', async () => {
    const lookup = vi.fn<LookupFn>(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '[2606:4700:4700::1111]', family: 6 },
    ])
    const out = await resolveHostname('x.test', lookup)
    expect(out.map((a) => [a.address, a.family])).toEqual([
      ['93.184.216.34', 4],
      ['2606:4700:4700::1111', 6],
    ])
    expect(out[0]?.canonical.kind()).toBe('ipv4')
    expect(lookup).toHaveBeenCalledWith('x.test')
  })
})
