import * as dns from 'dns/promises'
import { parseIpLiteral } from './ip-classifier.js'
import type { ParsedIp } from './ip-classifier.js'

/** security.md: DNS resolution timeout. */
export const DNS_TIMEOUT_MS = 5_000

export type RawAddress = { address: string; family: number }

/** The resolver seam. The default is `dns.lookup(host, { all: true, verbatim: true })`. */
export type LookupFn = (hostname: string) => Promise<ReadonlyArray<RawAddress>>

export type ResolvedAddress = {
  address: string
  family: 4 | 6
  canonical: ParsedIp
}

export class DnsResolutionError extends Error {
  constructor(message: string) {
    super(`DNS resolution failed: ${message}`)
    this.name = 'DnsResolutionError'
  }
}

export const defaultLookup: LookupFn = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true })
  return results.map((r) => ({ address: r.address, family: r.family }))
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DnsResolutionError(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = 'code' in err && typeof err.code === 'string' ? `${err.code}: ` : ''
    return `${code}${err.message}`
  }
  return String(err)
}

function toResolved(raw: RawAddress): ResolvedAddress {
  const canonical = parseIpLiteral(raw.address)
  if (!canonical) throw new DnsResolutionError('unparseable address')
  return { address: canonical.toString(), family: canonical.kind() === 'ipv4' ? 4 : 6, canonical }
}

/**
 * Resolve a name to every address, failing closed: any lookup error, a timeout, an empty
 * answer or an unparseable address throws `DnsResolutionError`.
 */
export async function resolveHostname(
  hostname: string,
  lookup: LookupFn = defaultLookup,
  timeoutMs: number = DNS_TIMEOUT_MS
): Promise<ResolvedAddress[]> {
  let raw: ReadonlyArray<RawAddress>
  try {
    raw = await withTimeout(lookup(hostname), timeoutMs)
  } catch (err) {
    if (err instanceof DnsResolutionError) throw err
    throw new DnsResolutionError(describeError(err))
  }
  if (!raw || raw.length === 0) {
    throw new DnsResolutionError('hostname did not resolve to any address')
  }
  return raw.map(toResolved)
}
