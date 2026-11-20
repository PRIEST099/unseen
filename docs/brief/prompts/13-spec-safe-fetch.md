Create the Kiro spec **`safe-fetch`** in `.kiro/specs/safe-fetch/`. Do not implement yet.

Inputs:
- `.kiro/steering/security.md`
- **`docs/brief/review-notes/safe-fetch-review-1.md`**: the product lead's probe of the current `packages/core/src/runner/safe-fetch.ts`. Every defect listed there must become a requirement with acceptance criteria.

Keep `requirements.md` under about 15 KB.

## Requirements to include (EARS)
1. **Fail closed.** In restrictive mode, resolve hostnames with `dns.lookup(host, { all: true, verbatim: true })` (the OS resolver, the same one Chromium uses). Check **every** returned address. **Block on any resolution error or empty result.**
2. **One canonical parser.** Use `URL` for scheme and host, strip IPv6 brackets, then classify with `net.isIP` plus `ipaddr.js` (or an equivalent small, audited dependency; justify the choice in the design) instead of hand-rolled string parsing. Classification covers:
   - IPv4-mapped (`::ffff:0:0/96`) and IPv4-compatible IPv6: extract the embedded IPv4 and check it.
   - 6to4 `2002::/16` with the embedded IPv4, and NAT64 `64:ff9b::/96`.
3. **Complete ranges:**
   - every range already in `security.md`
   - IPv4: `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255`
   - IPv6: `ff00::/8`, `::/128`
   - Keep the cloud-metadata hostnames.
4. **Pin DNS (rebinding/TOCTOU).** For each audit, launch or reuse a browser context whose requests can only reach validated IPs. Choose one design and justify it:
   - (a) a per-audit Chromium `--host-resolver-rules="MAP <host> <ip>"` for the top-level host plus an in-process forward proxy for subresource hosts, or
   - (b) route all traffic through an in-process HTTP(S) CONNECT proxy that resolves, validates and connects to the validated IP itself.

   Recommendation: (b) — one enforcement point. It also covers redirects and subresources.
5. **Redirects:** every hop is re-validated. Integration test: a local "public-looking" test server that 302s to `http://127.0.0.1:<port>` must be blocked. Use a test-only resolver override so the test does not depend on real DNS.
6. **Non-HTTP:** block `ws:`/`wss:` to non-validated IPs (the proxy covers this under option (b)). Disable WebRTC via launch flags; these already exist in `buildLaunchArgs`, so reference them.
7. **Modes:** `RestrictiveSafeFetchPolicy` (hosted default) and `PermissiveSafeFetchPolicy` (local MCP only; still http(s)-only). Each blocked request is recorded in `RawAudit.blockedRequests` with its reason; the page continues.
8. **Defense in depth (documented, not code):** a section in `design.md` and in `apps/web/DEPLOY.md` describing egress firewall rules for the hosted container that deny RFC 1918, link-local, CGNAT and metadata ranges.

## Property-based tests (fast-check, ≥ 200 runs)
- For every generated private, loopback, link-local, CGNAT, metadata, multicast or reserved address, in **every textual encoding**, the guard returns BLOCK. Encodings: dotted decimal, octal, hex, single 32-bit integer, short forms like `127.1`, IPv4-mapped IPv6, bracketed IPv6, mixed case, zero-padded and `%25` zone ids.
- For generated public unicast addresses, the guard returns ALLOW.
- A fake resolver returning any mix that includes one blocked address gives BLOCK (every address is checked).
- Any resolver error gives BLOCK in restrictive mode.

## Tasks
Replace the existing `safe-fetch.ts` internals behind the same exported API (`RestrictiveSafeFetchPolicy`, `PermissiveSafeFetchPolicy`, `installSafeFetchPolicy`) so audit-engine callers do not change. The last task re-runs the full `packages/core` test suite.
