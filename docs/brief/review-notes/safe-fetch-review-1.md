# Claude Code review: `packages/core/src/runner/safe-fetch.ts` (audit-engine task 3)

Claude Code probed Kiro's first SSRF guard on 2026-11-19. Use these findings as input for the `safe-fetch` spec.

| Probe | Result | Verdict |
|---|---|---|
| `http://localhost:3000/` | BLOCK (DNS returned 127.0.0.1) | OK on this machine, but it depends on the DNS server, not the OS resolver |
| `http://127.0.0.1/`, `http://0177.0.0.1/` | BLOCK | OK (the WHATWG URL parser normalizes octal) |
| `http://[::1]/`, `http://[::ffff:127.0.0.1]/` | BLOCK, reason "invalid URL format" | **Blocked by accident.** `URL.hostname` keeps the brackets, so `ipv6ToBigInt('[::1]')` does `BigInt(NaN)`, which throws and is caught as an invalid URL. No real IPv6 range check happens. |
| `http://169.254.169.254/` | BLOCK | OK |

## Defects to fix in the `safe-fetch` spec

1. **It fails open on DNS errors.** `resolveAndCheck` returns `false` (allow) on any DNS error with a `code`. If `resolve4` throws `ENODATA` (an IPv6-only host), `resolve6` is never checked, so a hostname with only an AAAA record pointing at `::1` or `fd00::/8` is allowed. Required: resolve with `dns.lookup(host, { all: true, verbatim: true })` (the OS resolver, the same as Chromium), check **every** address, and **block on any resolution failure** in restrictive mode.
2. **IPv6 parsing.** Strip `[` `]` from `URL.hostname`. Handle IPv4-mapped (`::ffff:0:0/96`) and IPv4-compatible addresses by extracting the embedded IPv4 and checking it against the IPv4 list. Add `64:ff9b::/96` (NAT64), `2002::/16` (6to4, checking the embedded IPv4), `ff00::/8` (multicast) and `::/128`.
3. **Missing IPv4 ranges:** `192.0.0.0/24`, `198.18.0.0/15` (benchmark), `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved), `255.255.255.255`.
4. **DNS rebinding / TOCTOU:** we resolve once to check, and Chromium resolves again to connect. Required mitigation for hosted mode:
   - Pin resolution by launching Chromium with a per-audit `--host-resolver-rules="MAP <host> <validated-ip>"`, or route all page traffic through an in-process forward proxy that connects only to the validated IP.
   - Also document defense in depth: run the hosted container with egress firewall rules that deny RFC 1918, link-local and metadata ranges.
5. **Redirects:** every redirect hop must be re-checked. `page.route` sees each request, but this needs an integration test (a public URL that 302s to `http://127.0.0.1`).
6. **Non-HTTP subresources:** WebSocket (`ws:`/`wss:`) and WebRTC are not covered by `page.route`. Disable WebRTC via launch flags and block `ws:` to private IPs.
7. **Property-based tests** (required by `security.md`): generate private, loopback, link-local and metadata IPs in all textual encodings (dotted, octal, hex, single integer, IPv4-mapped IPv6, bracketed IPv6, mixed case) and assert BLOCK. Generate public IPs and assert ALLOW.
