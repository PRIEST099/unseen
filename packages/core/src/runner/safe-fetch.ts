import * as dns from 'dns/promises'
import type { Page } from 'playwright'
import type { SafeFetchPolicy } from '../types.js'

// IPv4 ranges to block (from security.md)
const BLOCKED_IPV4_RANGES: Array<{ start: number; end: number }> = [
  // 127.0.0.0/8 - IPv4 loopback
  { start: 0x7F000000, end: 0x7FFFFFFF },
  // 10.0.0.0/8 - RFC 1918 private
  { start: 0x0A000000, end: 0x0AFFFFFF },
  // 172.16.0.0/12 - RFC 1918 private
  { start: 0xAC100000, end: 0xAC1FFFFF },
  // 192.168.0.0/16 - RFC 1918 private
  { start: 0xC0A80000, end: 0xC0A8FFFF },
  // 169.254.0.0/16 - IPv4 link-local (APIPA)
  { start: 0xA9FE0000, end: 0xA9FEFFFF },
  // 100.64.0.0/10 - IANA shared address (CGNAT)
  { start: 0x64400000, end: 0x647FFFFF },
  // 0.0.0.0/8 - "This" network
  { start: 0x00000000, end: 0x00FFFFFF },
]

// IPv6 ranges to block
const BLOCKED_IPV6_PREFIXES: Array<{ prefix: bigint; length: number }> = [
  // ::1/128 - IPv6 loopback
  { prefix: 0x00000000000000000000000000000001n, length: 128 },
  // fe80::/10 - IPv6 link-local
  { prefix: 0xfe800000000000000000000000000000n, length: 10 },
  // fc00::/7 - IPv6 unique local (ULA)
  { prefix: 0xfc000000000000000000000000000000n, length: 7 },
  // fd00:ec2::254 - AWS EC2 metadata IPv6
  { prefix: 0xfd00ec20000000000000000000000254n, length: 128 },
]

// Cloud metadata hostnames
const CLOUD_METADATA_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.azure.com',
  '169.254.169.254', // Also covered by link-local, but explicit
]

/**
 * Check if an IPv4 address (as number) falls within a blocked range
 */
function isBlockedIpv4(ip: number): boolean {
  // Check standard blocked ranges
  for (const range of BLOCKED_IPV4_RANGES) {
    if (ip >= range.start && ip <= range.end) {
      return true
    }
  }

  // Check 169.254.169.254 (AWS EC2 metadata) - explicit check
  if (ip === 0xA9FEA9FE) {
    return true
  }

  return false
}

/**
 * Check if an IPv6 address falls within a blocked range
 */
function isBlockedIpv6(ip: bigint): boolean {
  for (const { prefix, length } of BLOCKED_IPV6_PREFIXES) {
    // Create mask with 'length' bits set from the high end
    const shiftAmount = BigInt(128 - length)
    const mask = (0xffffffffffffffffffffffffffffffffn << shiftAmount) & 0xffffffffffffffffffffffffffffffffn
    if ((ip & mask) === (prefix & mask)) {
      return true
    }
  }
  return false
}

/**
 * Convert dotted-decimal IPv4 string to number
 */
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const [a, b, c, d] = parts.map((p) => {
    const n = parseInt(p, 10)
    return isNaN(n) || n < 0 || n > 255 ? null : n
  })
  if ([a, b, c, d].includes(null)) return null
  return ((a! * 256 + b!) * 256 + c!) * 256 + d!
}

/**
 * Convert IPv6 hex string to bigint
 */
function ipv6ToBigInt(ip: string): bigint | null {
  // Handle :: shorthand
  const parts = ip.split('::')
  if (parts.length > 2) return null

  let left = parts[0] ? parts[0].split(':') : []
  let right = parts.length > 1 ? (parts[1] ? parts[1].split(':') : []) : []

  if (left.length + right.length > 8) return null

  const allParts = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  if (allParts.length !== 8) return null

  let result = 0n
  for (const part of allParts) {
    const val = part === '' ? 0n : BigInt(parseInt(part, 16))
    result = (result << 16n) | val
  }
  return result
}

/**
 * Check if a hostname resolves to a blocked IP address
 */
async function resolveAndCheck(hostname: string): Promise<boolean> {
  // Check cloud metadata hostnames first (before DNS resolution)
  if (CLOUD_METADATA_HOSTNAMES.includes(hostname)) {
    return true
  }

  try {
    // Try IPv4 first
    const ipv4s = await dns.resolve4(hostname)
    for (const ip of ipv4s) {
      const num = ipv4ToNumber(ip)
      if (num !== null && isBlockedIpv4(num)) {
        return true
      }
    }

    // Try IPv6
    const ipv6s = await dns.resolve6(hostname)
    for (const ip of ipv6s) {
      const num = ipv6ToBigInt(ip)
      if (num !== null && isBlockedIpv6(num)) {
        return true
      }
    }
  } catch (e) {
    // DNS resolution failed - this is expected for many hostnames
    // Only block if it's a network error or other genuine failure
    // For hostnames that don't exist, we should NOT block them
    if (e instanceof Error && 'code' in e) {
      // DNS resolution error (ENOTFOUND, EAI_AGAIN, etc.) - hostname doesn't exist
      // This is fine, allow the request to proceed
      return false
    }
    // Some other error - be cautious
    return true
  }

  return false
}

/**
 * Validate IP address format (handles decimal, hex, octal encodings)
 */
function isValidIpAddress(ip: string): boolean {
  // Check if it looks like an IPv4 address (contains dots or valid IPv6 characters)
  if (ip.includes(':')) {
    // Could be IPv6
    try {
      // Basic IPv6 validation
      const parts = ip.split(':')
      if (parts.length < 2 || parts.length > 8) return false
      return true
    } catch {
      return false
    }
  }

  // IPv4 validation
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    // Check for valid number (decimal, hex, or octal)
    if (p.startsWith('0x') || p.startsWith('0X')) {
      const n = parseInt(p, 16)
      return !isNaN(n) && n >= 0 && n <= 255
    }
    if (p.startsWith('0') && p.length > 1) {
      const n = parseInt(p, 8)
      return !isNaN(n) && n >= 0 && n <= 255
    }
    const n = parseInt(p, 10)
    return !isNaN(n) && n >= 0 && n <= 255
  })
}

/**
 * Check if an IP address string (including encoded forms) is blocked
 */
function isIpAddressBlocked(ip: string): boolean {
  if (!isValidIpAddress(ip)) return false

  // Handle IPv4 in various encodings
  if (!ip.includes(':')) {
    // Decimal, hex, or octal IP
    // For dotted-decimal (e.g., "8.8.8.8"), use ipv4ToNumber
    if (ip.includes('.')) {
      const num = ipv4ToNumber(ip)
      if (num !== null) {
        return isBlockedIpv4(num)
      }
      return false
    }

    // Single number (hex or octal encoding)
    let num = 0
    if (ip.startsWith('0x') || ip.startsWith('0X')) {
      num = parseInt(ip, 16)
    } else if (ip.startsWith('0') && ip.length > 1) {
      num = parseInt(ip, 8)
    } else {
      num = parseInt(ip, 10)
    }
    if (!isNaN(num)) {
      return isBlockedIpv4(num)
    }
    return false
  }

  // IPv6
  const num = ipv6ToBigInt(ip)
  if (num !== null) {
    return isBlockedIpv6(num)
  }

  return false
}

/**
 * Parse URL and check if it should be blocked
 */
async function checkUrl(url: string): Promise<{ block: boolean; reason: string }> {
  try {
    const parsed = new URL(url)

    // Only http and https schemes are allowed
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { block: true, reason: `scheme not allowed: ${parsed.protocol}` }
    }

    // Check hostname directly
    const hostname = parsed.hostname
    if (isValidIpAddress(hostname)) {
      if (isIpAddressBlocked(hostname)) {
        return { block: true, reason: 'blocked IP address' }
      }
    } else {
      // Resolve hostname to IPs
      if (await resolveAndCheck(hostname)) {
        return { block: true, reason: 'hostname resolves to blocked IP' }
      }
    }

    return { block: false, reason: '' }
  } catch {
    // Invalid URL - block it
    return { block: true, reason: 'invalid URL format' }
  }
}

/**
 * Restrictive safe fetch policy - blocks all private, loopback, and metadata addresses
 */
export class RestrictiveSafeFetchPolicy implements SafeFetchPolicy {
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    return checkUrl(url)
  }
}

/**
 * Permissive safe fetch policy - allows loopback and private IPs (for local MCP)
 */
export class PermissiveSafeFetchPolicy implements SafeFetchPolicy {
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    try {
      const parsed = new URL(url)

      // Only http and https schemes are allowed
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { block: true, reason: `scheme not allowed: ${parsed.protocol}` }
      }

      return { block: false, reason: '' }
    } catch {
      // Invalid URL - block it
      return { block: true, reason: 'invalid URL format' }
    }
  }
}

/**
 * Install safe fetch policy as a route handler on the page
 */
export function installSafeFetchPolicy(page: Page, policy: SafeFetchPolicy): void {
  page.route('**/*', async (route) => {
    try {
      const url = route.request().url()
      const { block } = await policy.shouldBlock(url)
      if (block) {
        await route.abort('blocked')
      } else {
        await route.continue()
      }
    } catch {
      // If policy.shouldBlock throws, treat as blocked
      await route.abort('blocked')
    }
  })
}
