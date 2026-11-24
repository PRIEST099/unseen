import net from 'node:net'
import { DnsResolutionError, resolveHostname } from './dns-resolver.js'
import type { LookupFn, ResolvedAddress } from './dns-resolver.js'
import { classifyAddress, parseIpLiteral } from './ip-classifier.js'

/** Hostnames that name a cloud metadata service. Blocked before any DNS lookup. */
export const CLOUD_METADATA_HOSTNAMES: readonly string[] = [
  'metadata.google.internal',
  'metadata.azure.com',
  'metadata.goog',
  'instance-data',
]

export type HostVerdict =
  | { ok: true; addresses: ResolvedAddress[] }
  | { ok: false; kind: 'blocked' | 'dns-failure'; reason: string }

/** Remove IPv6 brackets and a trailing dot, and lowercase. */
export function normaliseHost(host: string): string {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return bare.toLowerCase().replace(/\.$/, '')
}

/**
 * Decide whether a host may be contacted. An IP literal is classified directly. A name is
 * resolved once (fail closed) and every address it returns must be allowed.
 * On success the validated addresses are what the caller must dial (DNS pinning).
 */
export async function validateHost(host: string, lookup?: LookupFn, timeoutMs?: number): Promise<HostVerdict> {
  const name = normaliseHost(host)
  if (CLOUD_METADATA_HOSTNAMES.includes(name)) {
    return { ok: false, kind: 'blocked', reason: 'blocked hostname (cloud-metadata)' }
  }
  const literal = net.isIP(name.split('%')[0] ?? name) !== 0 ? parseIpLiteral(name) : null
  if (literal) {
    const verdict = classifyAddress(literal)
    if (verdict.blocked) return { ok: false, kind: 'blocked', reason: verdict.reason }
    return { ok: true, addresses: [{ address: literal.toString(), family: literal.kind() === 'ipv4' ? 4 : 6, canonical: literal }] }
  }
  let resolved: ResolvedAddress[]
  try {
    resolved = await resolveHostname(name, lookup, timeoutMs)
  } catch (err) {
    const reason = err instanceof DnsResolutionError ? err.message : 'DNS resolution failed: unexpected error'
    return { ok: false, kind: 'dns-failure', reason }
  }
  for (const address of resolved) {
    const verdict = classifyAddress(address.canonical)
    if (verdict.blocked) {
      return { ok: false, kind: 'blocked', reason: `hostname resolves to blocked IP: ${verdict.reason}` }
    }
  }
  return { ok: true, addresses: resolved }
}
