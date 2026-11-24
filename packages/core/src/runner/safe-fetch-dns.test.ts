import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as dns from 'dns/promises'
import { RestrictiveSafeFetchPolicy } from './safe-fetch.js'

// Named exports, because safe-fetch.ts does `import * as dns` and calls dns.resolve4/resolve6.
vi.mock('dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }))

const resolve4 = vi.mocked(dns.resolve4)
const resolve6 = vi.mocked(dns.resolve6)

describe('hostname -> blocked IP (the main SSRF vector)', () => {
  const policy = new RestrictiveSafeFetchPolicy()

  beforeEach(() => {
    resolve4.mockReset()
    resolve6.mockReset()
    resolve4.mockResolvedValue([])
    resolve6.mockResolvedValue([])
  })

  it.each([
    ['10.x', ['10.1.2.3'], []],
    ['127.x', ['127.0.0.1'], []],
    ['169.254.169.254 (AWS metadata)', ['169.254.169.254'], []],
    ['192.168.x', ['192.168.0.9'], []],
    ['fe80::', [], ['fe80::1']],
    ['::1', [], ['::1']],
    ['one private address among public ones', ['93.184.216.34', '10.0.0.7'], []],
  ])('blocks a name that resolves to %s', async (_label, v4, v6) => {
    resolve4.mockResolvedValue(v4)
    resolve6.mockResolvedValue(v6)
    const result = await policy.shouldBlock('http://app.attacker.example/')
    expect(result.block).toBe(true)
    expect(resolve4).toHaveBeenCalledWith('app.attacker.example')
  })

  it('allows a name that resolves only to public addresses', async () => {
    resolve4.mockResolvedValue(['93.184.216.34'])
    resolve6.mockResolvedValue(['2606:2800:220:1:248:1893:25c8:1946'])
    const result = await policy.shouldBlock('http://example.test/')
    expect(result.block).toBe(false)
  })
})
