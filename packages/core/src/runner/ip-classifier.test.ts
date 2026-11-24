import { describe, it, expect, test } from 'vitest'
import * as fc from 'fast-check'
import ipaddr from 'ipaddr.js'
import { classifyAddress, isBlockedIPv4, isBlockedIPv6, parseIpLiteral } from './ip-classifier.js'
import { PUBLIC_ADDRESSES, blockedV4Number, blockedV6Host, nat64OfBlockedV4, numberToOctets } from '../../tests/arbitraries/ip-addresses.js'

function classify(text: string): { blocked: boolean; reason: string } {
  const ip = parseIpLiteral(text)
  if (!ip) throw new Error('unparseable test address ' + text)
  return classifyAddress(ip)
}

describe('blocked IPv4 ranges (one example per range)', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.0.1', 'link-local'],
    ['169.254.169.254', 'cloud-metadata'],
    ['100.64.0.1', 'shared-address-space'],
    ['0.0.0.0', 'this-network'],
    ['192.0.0.8', 'ietf-protocol'],
    ['192.0.2.1', 'documentation'],
    ['198.51.100.1', 'documentation'],
    ['203.0.113.42', 'documentation'],
    ['192.88.99.1', '6to4-relay'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
    ['224.0.0.251', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
  ])('%s is blocked as %s', (address, range) => {
    expect(classify(address)).toEqual({ blocked: true, reason: `blocked IP address (${range})` })
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '198.17.255.255', '198.20.0.0', '223.255.255.255'])(
    '%s is allowed',
    (address) => {
      expect(classify(address).blocked).toBe(false)
    }
  )
})

describe('blocked IPv6 ranges', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['::192.168.1.1', 'ipv4-compatible'],
    ['::7f00:1', 'ipv4-compatible'],
    ['fe80::1', 'link-local'],
    ['fec0::1', 'site-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fd00:ec2::254', 'cloud-metadata'],
    ['ff02::1', 'multicast'],
    ['100::1', 'discard'],
    ['64:ff9b:1::a00:1', 'nat64-local'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'ietf-protocol'],
    ['2001:db8::1', 'documentation'],
    ['3fff::1', 'documentation'],
    ['2002:c0a8:0101::1', '6to4'],
    ['5f00::1', 'reserved'],
  ])('%s is blocked as %s', (address, range) => {
    expect(classify(address)).toEqual({ blocked: true, reason: `blocked IP address (${range})` })
  })

  it('denies anything outside 2000::/3 by default', () => {
    expect(classify('4000::1').blocked).toBe(true)
    expect(classify('c000::1').blocked).toBe(true)
  })

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001::1'])('%s is allowed', (address) => {
    expect(classify(address).blocked).toBe(false)
  })
})

describe('embedded IPv4 extraction', () => {
  it('judges ::ffff:a.b.c.d by the IPv4 address it carries', () => {
    expect(classify('::ffff:127.0.0.1')).toEqual({ blocked: true, reason: 'blocked IP address (loopback)' })
    expect(classify('::ffff:10.0.0.1').blocked).toBe(true)
    expect(classify('::ffff:8.8.8.8').blocked).toBe(false)
  })

  it('judges 64:ff9b::a.b.c.d by the IPv4 address it carries', () => {
    expect(classify('64:ff9b::192.168.1.1')).toEqual({ blocked: true, reason: 'blocked IP address (private)' })
    expect(classify('64:ff9b::8.8.8.8').blocked).toBe(false)
  })

  it('blocks 6to4 whatever it embeds', () => {
    expect(classify('2002:0808:0808::1').blocked).toBe(true)
  })

  it('direct checks agree with classifyAddress', () => {
    expect(isBlockedIPv4(ipaddr.IPv4.parse('127.0.0.1'))).toEqual({ blocked: true, range: 'loopback' })
    expect(isBlockedIPv6(ipaddr.IPv6.parse('::1'))).toEqual({ blocked: true, range: 'loopback' })
  })
})

describe('parseIpLiteral', () => {
  it('strips brackets and zone ids and rejects names', () => {
    expect(parseIpLiteral('[::1]')?.toString()).toBe('::1')
    expect(parseIpLiteral('fe80::1%eth0')?.toString()).toBe('fe80::1')
    expect(parseIpLiteral('example.test')).toBeNull()
  })
})

test('property: every address inside a blocked IPv4 range is blocked', async () => {
  await fc.assert(
    fc.asyncProperty(blockedV4Number, async (n) => {
      const [a, b, c, d] = numberToOctets(n)
      expect(classify(`${a}.${b}.${c}.${d}`).blocked).toBe(true)
    }),
    { numRuns: 300 }
  )
})

test('property: every address inside a blocked IPv6 range is blocked', async () => {
  await fc.assert(
    fc.asyncProperty(blockedV6Host, async (host) => {
      expect(classify(host.slice(1, -1)).blocked).toBe(true)
    }),
    { numRuns: 300 }
  )
})

test('property: NAT64 and IPv4-mapped forms of a blocked IPv4 address are blocked', async () => {
  await fc.assert(
    fc.asyncProperty(nat64OfBlockedV4, blockedV4Number, async (nat64, n) => {
      const [a, b, c, d] = numberToOctets(n)
      expect(classify(nat64.slice(1, -1)).blocked).toBe(true)
      expect(classify(`::ffff:${a}.${b}.${c}.${d}`).blocked).toBe(true)
    }),
    { numRuns: 300 }
  )
})

test('property: the public sample is never blocked', async () => {
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...PUBLIC_ADDRESSES), async (address) => {
      expect(classify(address).blocked).toBe(false)
    }),
    { numRuns: 200 }
  )
})
