import { describe, expect, test } from 'vitest'
import * as fc from 'fast-check'
import { RestrictiveSafeFetchPolicy } from './safe-fetch.js'
import { validateHost } from './host-validator.js'
import { parseAuthority } from './ssrf-guard-proxy.js'
import type { LookupFn, RawAddress } from './dns-resolver.js'
import {
  blockedHost,
  blockedV4Number,
  blockedV6Host,
  numberToOctets,
  publicAddress,
  v4Encodings,
  renderV4,
} from '../../tests/arbitraries/ip-addresses.js'

const RUNS = 250

function family(address: string): number {
  return address.includes(':') ? 6 : 4
}

const raw = (address: string): RawAddress => ({ address, family: family(address) })

/** A blocked address as a resolver would return it: IPv4, IPv6 or `::ffff:<blocked v4>`. */
const blockedResolved: fc.Arbitrary<string> = fc.oneof(
  blockedV4Number.map((n) => numberToOctets(n).join('.')),
  blockedV6Host.map((h) => h.slice(1, -1)),
  blockedV4Number.map((n) => `::ffff:${numberToOctets(n).join('.')}`)
)

const dnsLabel: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{1,10}\.test$/)

const neverCalled: LookupFn = async () => {
  throw new Error('the resolver must not be consulted for an IP literal')
}

describe('Property 2: preservation and fail-closed behaviour', () => {
  test('property: a resolver list with one blocked address among public ones is BLOCK, in any order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(publicAddress, { minLength: 0, maxLength: 4 }),
        blockedResolved,
        fc.nat(4),
        dnsLabel,
        async (publics, blocked, position, host) => {
          const answers = [...publics]
          answers.splice(Math.min(position, answers.length), 0, blocked)
          const policy = new RestrictiveSafeFetchPolicy({ lookup: async () => answers.map(raw) })
          const verdict = await policy.shouldBlock(`http://${host}/`)
          expect(verdict.block).toBe(true)
        }
      ),
      { numRuns: RUNS }
    )
  })

  test('property: a resolver list of public addresses only is allowed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(publicAddress, { minLength: 1, maxLength: 4 }), dnsLabel, async (publics, host) => {
        const policy = new RestrictiveSafeFetchPolicy({ lookup: async () => publics.map(raw) })
        expect(await policy.shouldBlock(`http://${host}/`)).toEqual({ block: false, reason: '' })
      }),
      { numRuns: RUNS }
    )
  })

  test('property: resolver errors for valid hostnames are BLOCK with "DNS resolution failed"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ENODATA', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL'),
        fc.oneof(dnsLabel, fc.domain()),
        async (code, host) => {
          const lookup: LookupFn = async () => {
            throw Object.assign(new Error(`lookup ${code}`), { code })
          }
          const verdict = await new RestrictiveSafeFetchPolicy({ lookup }).shouldBlock(`http://${host}/`)
          expect(verdict.block).toBe(true)
          expect(verdict.reason).toContain('DNS resolution failed')
        }
      ),
      { numRuns: RUNS }
    )
  })

  test('property: AAAA-only answers that are blocked IPv6 (loopback or mapped loopback) are BLOCK', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fe80::1', 'fd00:ec2::254'), dnsLabel, async (address, host) => {
        const policy = new RestrictiveSafeFetchPolicy({ lookup: async () => [{ address, family: 6 }] })
        expect((await policy.shouldBlock(`http://${host}/`)).block).toBe(true)
      }),
      { numRuns: RUNS }
    )
  })

  test('property: blocked addresses in every encoding are blocked by shouldBlock', async () => {
    await fc.assert(
      fc.asyncProperty(blockedHost, async (host) => {
        const policy = new RestrictiveSafeFetchPolicy({ lookup: neverCalled })
        const verdict = await policy.shouldBlock(`http://${host}/`)
        expect(verdict.block, `${host} -> ${verdict.reason}`).toBe(true)
        expect(verdict.reason).toMatch(/^blocked IP address \(/)
      }),
      { numRuns: RUNS }
    )
  })

  test('property: the same encodings are blocked by the proxy path (canonical CONNECT authority, no DNS)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.tuple(blockedV4Number, v4Encodings), fc.integer({ min: 1, max: 65535 }), async ([n, encoding], port) => {
        const canonicalHost = new URL(`http://${renderV4(n, encoding)}/`).hostname
        const authority = parseAuthority(`${canonicalHost}:${port}`)
        expect(authority, `authority for ${canonicalHost}`).not.toBeNull()
        const verdict = await validateHost(authority?.host ?? '', neverCalled)
        expect(verdict.ok, `${canonicalHost} -> ${JSON.stringify(verdict)}`).toBe(false)
      }),
      { numRuns: RUNS }
    )
  })

  test('property: IPv6 spellings (bracketed, upper case, normalised) are blocked by the proxy path', async () => {
    await fc.assert(
      fc.asyncProperty(blockedV6Host, fc.integer({ min: 1, max: 65535 }), async (host, port) => {
        const authority = parseAuthority(`${host}:${port}`)
        expect(authority).not.toBeNull()
        const verdict = await validateHost(authority?.host ?? '', neverCalled)
        expect(verdict.ok, `${host} -> ${JSON.stringify(verdict)}`).toBe(false)
      }),
      { numRuns: RUNS }
    )
  })

  test('property: a zone id on a blocked IPv6 literal does not change the verdict', async () => {
    await fc.assert(
      fc.asyncProperty(blockedV6Host, fc.constantFrom('eth0', '1', 'lo'), async (host, zone) => {
        const verdict = await validateHost(`${host.slice(1, -1)}%${zone}`, neverCalled)
        expect(verdict.ok).toBe(false)
      }),
      { numRuns: RUNS }
    )
  })

  test('property: public IP literals are allowed without a lookup', async () => {
    await fc.assert(
      fc.asyncProperty(publicAddress, async (address) => {
        const host = address.includes(':') ? `[${address}]` : address
        const verdict = await new RestrictiveSafeFetchPolicy({ lookup: neverCalled }).shouldBlock(`https://${host}/x?y=1`)
        expect(verdict).toEqual({ block: false, reason: '' })
      }),
      { numRuns: RUNS }
    )
  })
})
