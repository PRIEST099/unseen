import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RestrictiveSafeFetchPolicy } from './safe-fetch.js'

/**
 * Phase 1 exploratory tests (safe-fetch spec tasks 1-4, 7). They assert the CORRECT behaviour,
 * so they FAIL on the pre-fix code (evidence recorded in tasks.md Notes) and pass after the fix.
 * The DNS mock covers both the old seam (resolve4/resolve6) and the new one (lookup).
 */
const dnsMock = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  lookup: vi.fn(),
}))
vi.mock('dns/promises', () => dnsMock)

function dnsFails(code: string): void {
  const err = Object.assign(new Error(`query ${code}`), { code })
  dnsMock.resolve4.mockRejectedValue(err)
  dnsMock.resolve6.mockRejectedValue(err)
  dnsMock.lookup.mockRejectedValue(err)
}

function dnsEmpty(): void {
  dnsMock.resolve4.mockResolvedValue([])
  dnsMock.resolve6.mockResolvedValue([])
  dnsMock.lookup.mockResolvedValue([])
}

beforeEach(() => {
  dnsMock.resolve4.mockReset()
  dnsMock.resolve6.mockReset()
  dnsMock.lookup.mockReset()
})

const policy = new RestrictiveSafeFetchPolicy()

describe('task 1: DNS failures fail closed', () => {
  it('1.1 ENODATA (AAAA-only host) blocks', async () => {
    dnsFails('ENODATA')
    const r = await policy.shouldBlock('http://ipv6-only-host.test/')
    expect(r.block).toBe(true)
    expect(r.reason).toContain('DNS resolution failed')
  })

  it('1.2 ENOTFOUND blocks', async () => {
    dnsFails('ENOTFOUND')
    const r = await policy.shouldBlock('http://no-such-host.test/')
    expect(r.block).toBe(true)
    expect(r.reason).toContain('DNS resolution failed')
  })

  it('1.3 an empty answer blocks', async () => {
    dnsEmpty()
    const r = await policy.shouldBlock('http://empty.test/')
    expect(r.block).toBe(true)
  })
})

describe('task 2: embedded IPv4 in IPv6 is classified', () => {
  it.each([
    ['2.1 IPv4-mapped', 'http://[::ffff:127.0.0.1]/'],
    ['2.2 6to4 of 192.168.1.1', 'http://[2002:c0a8:0101::1]/'],
    ['2.3 NAT64 of 192.168.1.1', 'http://[64:ff9b::192.168.1.1]/'],
    ['2.4 IPv4-compatible of 192.168.1.1', 'http://[::192.168.1.1]/'],
  ])('%s is blocked as a blocked IP address, not as an invalid URL', async (_l, url) => {
    const r = await policy.shouldBlock(url)
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/^blocked IP address \(/)
  })
})

describe('task 3: special-purpose IPv4 ranges are blocked', () => {
  it.each([
    ['3.1 192.0.0.8 (IETF protocol)', 'http://192.0.0.8/'],
    ['3.2 198.18.0.1 (benchmark)', 'http://198.18.0.1/'],
    ['3.3 224.0.0.251 (multicast)', 'http://224.0.0.251/'],
    ['3.4 240.0.0.1 (reserved)', 'http://240.0.0.1/'],
    ['3.5 255.255.255.255 (broadcast)', 'http://255.255.255.255/'],
  ])('%s', async (_l, url) => {
    const r = await policy.shouldBlock(url)
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/^blocked IP address \(/)
  })

  it('3.6 loopback ::1 is reported as a blocked IP address, not an invalid URL', async () => {
    const r = await policy.shouldBlock('http://[::1]/')
    expect(r.reason).toMatch(/^blocked IP address \(/)
  })
})

describe('task 4: DNS rebinding', () => {
  it('4.1 a pinning proxy component exists (the policy check alone cannot pin DNS)', async () => {
    const mod = await import('./ssrf-guard-proxy.js')
    expect(typeof mod.SsrfGuardProxy).toBe('function')
  })
})

describe('task 7: IP encodings (regression guards; WHATWG URL already normalises these)', () => {
  it.each([
    ['7.1 32-bit decimal', 'http://2130706433/'],
    ['7.2 short form 127.1', 'http://127.1/'],
    ['7.3 hex', 'http://0x7f000001/'],
    ['7.4 octal', 'http://0177.0.0.1/'],
    ['7.5 zero-padded', 'http://127.000.000.001/'],
  ])('%s is blocked with a range reason', async (_l, url) => {
    const r = await policy.shouldBlock(url)
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/^blocked IP address \(/)
  })
})
