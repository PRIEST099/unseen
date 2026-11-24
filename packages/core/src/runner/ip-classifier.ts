import ipaddr from 'ipaddr.js'

export type ParsedIp = ipaddr.IPv4 | ipaddr.IPv6

export type Classification = { blocked: boolean; reason: string }
export type RangeVerdict = { blocked: boolean; range?: string }

type NamedCidr = { name: string; cidr: [ParsedIp, number] }

function table(entries: ReadonlyArray<readonly [string, string]>): NamedCidr[] {
  return entries.map(([name, text]) => ({ name, cidr: ipaddr.parseCIDR(text) }))
}

/**
 * The one canonical range table (security.md "Blocked address ranges" plus the special-purpose
 * ranges from the safe-fetch review, item 9). Order matters: the first match names the reason.
 */
const BLOCKED_IPV4: NamedCidr[] = table([
  ['cloud-metadata', '169.254.169.254/32'],
  ['this-network', '0.0.0.0/8'],
  ['private', '10.0.0.0/8'],
  ['shared-address-space', '100.64.0.0/10'],
  ['loopback', '127.0.0.0/8'],
  ['link-local', '169.254.0.0/16'],
  ['private', '172.16.0.0/12'],
  ['ietf-protocol', '192.0.0.0/24'],
  ['documentation', '192.0.2.0/24'],
  ['6to4-relay', '192.88.99.0/24'],
  ['private', '192.168.0.0/16'],
  ['benchmarking', '198.18.0.0/15'],
  ['documentation', '198.51.100.0/24'],
  ['documentation', '203.0.113.0/24'],
  ['multicast', '224.0.0.0/4'],
  ['broadcast', '255.255.255.255/32'],
  ['reserved', '240.0.0.0/4'],
])

const BLOCKED_IPV6: NamedCidr[] = table([
  ['cloud-metadata', 'fd00:ec2::254/128'],
  ['unspecified', '::/128'],
  ['loopback', '::1/128'],
  ['ipv4-compatible', '::/96'],
  ['ipv4-mapped', '::ffff:0:0/96'],
  ['link-local', 'fe80::/10'],
  ['site-local', 'fec0::/10'],
  ['unique-local', 'fc00::/7'],
  ['multicast', 'ff00::/8'],
  ['discard', '100::/64'],
  ['nat64-local', '64:ff9b:1::/48'],
  ['ietf-protocol', '2001::/23'],
  ['documentation', '2001:db8::/32'],
  ['6to4', '2002::/16'],
  ['documentation', '3fff::/20'],
  ['reserved', '5f00::/16'],
])

/** Only 2000::/3 is global unicast. Everything outside it is denied. */
const GLOBAL_UNICAST_V6: [ParsedIp, number] = ipaddr.parseCIDR('2000::/3')
const NAT64_WELL_KNOWN: [ParsedIp, number] = ipaddr.parseCIDR('64:ff9b::/96')
const IPV4_MAPPED: [ParsedIp, number] = ipaddr.parseCIDR('::ffff:0:0/96')

function firstMatch(ip: ParsedIp, entries: readonly NamedCidr[]): string | undefined {
  for (const entry of entries) {
    if (ip.kind() === entry.cidr[0].kind() && ip.match(entry.cidr)) return entry.name
  }
  return undefined
}

export function isBlockedIPv4(ip: ipaddr.IPv4): RangeVerdict {
  const range = firstMatch(ip, BLOCKED_IPV4)
  return range === undefined ? { blocked: false } : { blocked: true, range }
}

/** The IPv4 address carried in the low 32 bits of an IPv6 address. */
function lowIpv4(ip: ipaddr.IPv6): ipaddr.IPv4 {
  const bytes = ip.toByteArray()
  return new ipaddr.IPv4(bytes.slice(12, 16))
}

export function isBlockedIPv6(ip: ipaddr.IPv6): RangeVerdict {
  // ::ffff:a.b.c.d and 64:ff9b::a.b.c.d are judged by the IPv4 address they carry.
  if (ip.match(IPV4_MAPPED) || ip.match(NAT64_WELL_KNOWN)) {
    return isBlockedIPv4(lowIpv4(ip))
  }
  const range = firstMatch(ip, BLOCKED_IPV6)
  if (range !== undefined) return { blocked: true, range }
  if (!ip.match(GLOBAL_UNICAST_V6) || ip.range() !== 'unicast') return { blocked: true, range: 'non-global-unicast' }
  return { blocked: false }
}

/** Judge a canonical address. The reason has the form `blocked IP address (<range>)`. */
export function classifyAddress(ip: ParsedIp): Classification {
  const verdict = ip instanceof ipaddr.IPv4 ? isBlockedIPv4(ip) : isBlockedIPv6(ip)
  return verdict.blocked
    ? { blocked: true, reason: `blocked IP address (${verdict.range ?? 'reserved'})` }
    : { blocked: false, reason: '' }
}

/**
 * Rewrite an IPv6 literal into the WHATWG canonical hex form. ipaddr.js reads `::a.b.c.d` as IPv4-mapped
 * (`::ffff:a.b.c.d`), which would let a real IPv4-compatible address through as a public IPv4 one.
 * Text the URL parser rejects is returned unchanged and fails `isValid` or parsing later.
 */
function canonicalIpv6Text(text: string): string {
  try {
    const host = new URL(`http://[${text}]/`).hostname
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : text
  } catch {
    return text
  }
}

/**
 * Parse a host that is a literal IP address: strips IPv6 brackets and a zone id.
 * Returns null for anything that is not an IP literal (a DNS name, for example).
 */
export function parseIpLiteral(host: string): ParsedIp | null {
  let text = host
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)
  if (text.includes(':')) text = canonicalIpv6Text(text)
  if (!ipaddr.isValid(text)) return null
  try {
    return ipaddr.parse(text)
  } catch {
    return null
  }
}
