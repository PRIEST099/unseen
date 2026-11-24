import * as fc from 'fast-check'
import ipaddr from 'ipaddr.js'

/** Blocked IPv4 CIDRs (security.md plus the review's special-purpose ranges). Kept independent of src/. */
export const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
]

/** Blocked IPv6 CIDRs that are not IPv4-embedding forms. */
export const BLOCKED_V6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['::', 96],
  ['fe80::', 10],
  ['fec0::', 10],
  ['fc00::', 7],
  ['ff00::', 8],
  ['100::', 64],
  ['64:ff9b:1::', 48],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
]

export const PUBLIC_ADDRESSES: readonly string[] = [
  '8.8.8.8',
  '1.1.1.1',
  '93.184.216.34',
  '104.20.23.154',
  '2606:4700:4700::1111',
  '2001:4860:4860::8888',
]

function v4ToNumber(text: string): number {
  const o = ipaddr.IPv4.parse(text).octets
  return ((o[0]! * 256 + o[1]!) * 256 + o[2]!) * 256 + o[3]!
}

export function numberToOctets(n: number): [number, number, number, number] {
  return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256]
}

/** A random address inside a random blocked IPv4 CIDR, as a 32-bit number. */
export const blockedV4Number: fc.Arbitrary<number> = fc
  .constantFrom(...BLOCKED_V4_CIDRS)
  .chain(([base, prefix]) =>
    fc.integer({ min: 0, max: 2 ** (32 - prefix) - 1 }).map((offset) => v4ToNumber(base) - (v4ToNumber(base) % 2 ** (32 - prefix)) + offset)
  )

export type V4Encoding = 'dotted' | 'octal' | 'hex-parts' | 'hex-int' | 'decimal-int' | 'short-3' | 'short-2' | 'mapped' | 'mapped-hex' | 'mixed-case-hex' | 'zero-padded-octal'

export const v4Encodings: fc.Arbitrary<V4Encoding> = fc.constantFrom<V4Encoding>(
  'dotted',
  'octal',
  'hex-parts',
  'hex-int',
  'decimal-int',
  'short-3',
  'short-2',
  'mapped',
  'mapped-hex',
  'mixed-case-hex',
  'zero-padded-octal'
)

/** The host text (as it would appear in a URL) for a 32-bit address in the given encoding. */
export function renderV4(n: number, encoding: V4Encoding): string {
  const [a, b, c, d] = numberToOctets(n)
  const hex = (x: number): string => `0x${x.toString(16)}`
  switch (encoding) {
    case 'dotted':
      return `${a}.${b}.${c}.${d}`
    case 'octal':
      return [a, b, c, d].map((x) => (x === 0 ? '0' : `0${x.toString(8)}`)).join('.')
    case 'zero-padded-octal':
      return [a, b, c, d].map((x) => `00${x.toString(8)}`).join('.')
    case 'hex-parts':
      return [a, b, c, d].map(hex).join('.')
    case 'mixed-case-hex':
      return [a, b, c, d].map((x) => `0X${x.toString(16).toUpperCase()}`).join('.')
    case 'hex-int':
      return `0x${n.toString(16)}`
    case 'decimal-int':
      return String(n)
    case 'short-3':
      return `${a}.${b}.${c * 256 + d}`
    case 'short-2':
      return `${a}.${b * 65536 + c * 256 + d}`
    case 'mapped':
      return `[::ffff:${a}.${b}.${c}.${d}]`
    case 'mapped-hex':
      return `[::ffff:${(a * 256 + b).toString(16)}:${(c * 256 + d).toString(16)}]`
  }
}

function v6Parts(value: bigint): number[] {
  const parts: number[] = []
  for (let i = 7; i >= 0; i--) parts.push(Number((value >> BigInt(i * 16)) & 0xffffn))
  return parts
}

function v6ToBigInt(text: string): bigint {
  return ipaddr.IPv6.parse(text).parts.reduce((acc, p) => (acc << 16n) | BigInt(p), 0n)
}

/** A random address inside a random blocked IPv6 CIDR, in lower, upper or fully normalised spelling. */
export const blockedV6Host: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...BLOCKED_V6_CIDRS), fc.constantFrom('plain', 'upper', 'normalised'))
  .chain(([[base, prefix], form]) => {
    const hostBits = BigInt(128 - prefix)
    return fc.bigInt({ min: 0n, max: (1n << hostBits) - 1n }).map((offset) => {
      const baseValue = v6ToBigInt(base)
      const value = baseValue - (baseValue % (1n << hostBits)) + offset
      const address = new ipaddr.IPv6(v6Parts(value))
      const text = form === 'normalised' ? address.toNormalizedString() : address.toRFC5952String()
      return `[${form === 'upper' ? text.toUpperCase() : text}]`
    })
  })

/** NAT64 well-known prefix wrapping a blocked IPv4 address. */
export const nat64OfBlockedV4: fc.Arbitrary<string> = blockedV4Number.map((n) => {
  const [a, b, c, d] = numberToOctets(n)
  return `[64:ff9b::${a}.${b}.${c}.${d}]`
})

export const publicAddress: fc.Arbitrary<string> = fc.constantFrom(...PUBLIC_ADDRESSES)

/** Any blocked address in any supported spelling, as URL host text. */
export const blockedHost: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(blockedV4Number, v4Encodings).map(([n, e]) => renderV4(n, e)),
  blockedV6Host,
  nat64OfBlockedV4
)
