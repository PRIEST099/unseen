# Implementation Plan: Safe-Fetch SSRF Prevention

## Overview

This task list implements a complete replacement of `packages/core/src/runner/safe-fetch.ts` to close seven critical SSRF vulnerabilities while preserving the existing API contract. The implementation follows the bugfix methodology: exploratory testing to prove each bug exists, fix implementation with the in-process CONNECT proxy architecture, and preservation testing to ensure legitimate requests continue to work.

## Notes

**Implementation record (run 13b).** Deviations from the spec text, all decided against `security.md` and prompt 26:

- **Phase 1 tests assert the correct behaviour, not the wrong one.** The run prompt required exploratory tests to fail on the old code, so no assertions were flipped in task 16. They live in `packages/core/src/runner/safe-fetch-exploratory.test.ts` (not `safe-fetch.test.ts`, because they mock `dns/promises` module-wide). The mock covers both the old `resolve4/resolve6` seam and the new `lookup` seam. Failure output on the pre-fix code (19 of 19 failed):
  - 1.1/1.2 `expected false to be true` (ENODATA, ENOTFOUND allowed), 1.3 `expected false to be true` (empty answer allowed).
  - 2.1-2.4 `expected 'invalid URL format' to match /^blocked IP address \(/` (IPv6 hosts blocked only by accident of a parse failure).
  - 3.1-3.5 `expected false to be true` (192.0.0.8, 198.18.0.1, 224.0.0.251, 240.0.0.1, 255.255.255.255 allowed); 3.6 `expected 'invalid URL format' to match`.
  - 4.1 `Failed to load url ./ssrf-guard-proxy.js` (nothing pins DNS).
  - 7.1-7.5 `expected 'blocked IP address' to match /^blocked IP address \(/`. The addresses were already blocked, so these are regression guards that only failed on the reason format.
  - `tests/safe-fetch-websocket.int.spec.ts` on the old code: `Expected {url: "connect://127.0.0.1:58994", reason: "blocked IP address (loopback)"}, Received array: []`, and the launch-args test `Expected value: "--disable-quic"`.
  - `tests/safe-fetch-loopback.int.spec.ts` PASSED on the old code (the old route check already blocked all four URLs). It stays as the required regression test; it is not exploratory evidence.
- **Task 5** (redirect exploratory) stays deferred as written; redirect coverage is task 18.
- **Fake public address.** Tests use `93.184.216.34` instead of `203.0.113.10`, because the classifier blocks TEST-NET-3 (design 2.13).
- **ipaddr.js quirk.** `ipaddr.parse('::192.168.1.1')` returns an IPv4-mapped address, so a real IPv4-compatible address such as `::8.8.8.8` would be read as public 8.8.8.8. `parseIpLiteral` first rewrites IPv6 text to the WHATWG hex form. `::/96` is blocked whole; `::ffff:0:0/96` and `64:ff9b::/96` are judged by the IPv4 address they carry; `2002::/16` is blocked whole.
- **IPv6 is an allow-list** (inside `2000::/3`, `range() === 'unicast'`, not in the named deny table), per review item 9.
- **WebRTC flags.** `--disable-features=WebRtcHideLocalIpsWithMdns` was removed. Chromium keeps one `--disable-features` switch, and the spec requires `--disable-features=DnsOverHttps`. `WEBRTC_LEAK_FLAGS` is now the two `*-webrtc-ip-handling-policy=disable_non_proxied_udp` flags; `EGRESS_FLAGS` holds `--disable-quic` and `--disable-features=DnsOverHttps`.
- **`installSafeFetchPolicy` uses `route.fallback()`** instead of `route.continue()`, so auditHtml's `route.fulfill` handler (registered earlier) answers the synthetic origin after the policy has counted and allowed the request.
- **Main-frame refusal.** The proxy answers a refused plain-HTTP request with 403 `text/plain`, so Chromium reports a non-HTML navigation. `audit.ts` turns a failed navigation (`NonHtmlContentError` or `net::ERR_*`) into `SsrfBlockedError` carrying the proxy's refusal reason, picking the first logged entry whose reason contains "blocked". Chromium also makes background requests (for example `www.google.com:443`) through the proxy; with a fake resolver they are logged as DNS failures in `blockedRequests`.
- **auditHtml.** `STABLE_HTML_ORIGIN` is now `http://audit-html.unseen.invalid` (was `http://127.0.0.1:0`); `auditedUrl` is `<origin>/`. The audit-engine Req 13 text was already amended. The page is no longer a secure context (the old 127.0.0.1 origin was).
- **Test changes forced by the fix.** `audit.int.spec.ts` "failing listen": auditHtml has no local server, so the test now fails the proxy's `listen` and expects `egress proxy failed to start: listen EMFILE`. `audit-lifecycle.int.spec.ts` finding 38: the stub policy has no mode (restrictive by decision B) and reaches a local server, so it now sets `mode: 'permissive'`. `safe-fetch-dns.test.ts` (mocked `resolve4/resolve6`) was deleted; `safe-fetch.test.ts`, `dns-resolver.test.ts` and the preservation tests replace it.
- **Test seams.** `AuditHooks` gained `serve` (routes registered before the policy) and `proxy` (`lookup`, `dial`, `allowAuthorities`). `RestrictiveSafeFetchPolicy` takes `{ lookup }`.
- **New files:** `runner/ip-classifier.ts`, `dns-resolver.ts`, `host-validator.ts`, `ssrf-guard-proxy.ts`, each with `*.test.ts`; `tests/arbitraries/ip-addresses.ts`; `apps/web/DEPLOY.md`.
- Task 14's old-style "Remove ... `ipv4ToNumber()` ..." is done: `safe-fetch.ts` holds only the two policies and `installSafeFetchPolicy`.

**Execution Order:** Bugfix tasks run as a linear sequence. While some tasks within a phase could theoretically run in parallel (e.g., multiple exploratory tests), they are ordered for clarity and to minimize test file conflicts.

**auditHtml Change:** This spec amends audit-engine Req 13 (`.kiro/specs/audit-engine/requirements.md`). The old spec required auditHtml to serve HTML from a local 127.0.0.1 HTTP server, which would be blocked by the proxy once loopback bypasses are removed. The new requirement: serve HTML with `page.route(...).fulfill()` on a synthetic origin `http://audit-html.unseen.invalid/`. OriginScopedPolicy allows exactly that synthetic origin through `allowAuthorities` in the proxy options. See finding 12 and 20 in `docs/brief/review-notes/safe-fetch-spec-review-1.md`.

**Key Dependencies:**
- Phase 1 (tasks 1-7) proves bugs exist through deterministic test cases
- Phase 2 task 8 (add ipaddr.js) must complete before tasks 9-10
- Phase 2 tasks 9-10 must complete before task 11 (proxy needs classifier and resolver)
- Phase 2 task 11 must complete before task 14 (integration)
- Phase 2 task 14 must complete before task 15 (blocked request recording)
- All Phase 2 tasks must complete before Phase 3 starts
- Phase 3 task 16 must complete before tasks 17-20 (verify bugs are fixed first)

**Testing Strategy:**
- Exploratory tests (Phase 1) assert WRONG behavior on unfixed code using concrete failing cases
- Fix validation (Phase 3 task 16) flips assertions to verify CORRECT behavior
- Property-based tests (Phase 3 task 17) use `await fc.assert(fc.asyncProperty(...), { numRuns: 200 })`
- Integration tests (Phase 3 tasks 18-19) use fake resolver/dial seams to control DNS and connectivity

**Test Commands:**
- In packages/core run `npm run typecheck`, then `npx vitest --run`, then the integration suite: `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npx playwright test` on Windows PowerShell, or `UNSEEN_CHROMIUM_CHANNEL=chromium npx playwright test` in bash or the Playwright Docker image. All three must pass

---

## Tasks

### Phase 1: Exploratory Testing (Prove the Bugs)

These tests run BEFORE the fix is implemented. They demonstrate that specific vulnerabilities exist in the current code by asserting the WRONG (vulnerable) behavior on concrete failing cases. All tests in this phase are expected to pass on unfixed code, confirming the bugs. After the fix (Phase 3 task 16), the same tests with flipped assertions will verify correct behavior.

### - [x] 1. Write exploratory tests for DNS error fail-open vulnerabilities

  - **Property 1: Bug Condition** - DNS Resolution Failures Allow Private Access
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix
  - **GOAL**: Demonstrate fail-open DNS handling with concrete cases
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 1.1**: Mock `dns.lookup()` to reject with an error `{code: 'ENODATA'}` for `ipv6-only-host.test`, call `shouldBlock("http://ipv6-only-host.test/")`, assert returns `{ block: false }` (WRONG - should block)
    - **Test 1.2**: Mock `dns.lookup()` to reject with an error `{code: 'ENOTFOUND'}` for `no-such-host.test`, call `shouldBlock("http://no-such-host.test/")`, assert returns `{ block: false }` (WRONG - should block)
    - **Test 1.3**: Mock `dns.lookup()` to return `[]` for `empty.test`, call `shouldBlock("http://empty.test/")`, assert returns `{ block: false }` (WRONG - should block)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms fail-open bug exists)
  - Run typecheck, vitest
  - _Requirements: 1.1, 1.2, 1.3, 1.4 from bugfix.md_

### - [x] 2. Write exploratory tests for IPv6 parsing vulnerabilities

  - **Property 1: Bug Condition** - IPv6 Addresses Bypass IP Blocking
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix
  - **GOAL**: Demonstrate IPv6 parsing gaps with concrete examples
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 2.1**: Call `shouldBlock("http://[::ffff:127.0.0.1]/")` (IPv4-mapped IPv6), assert returns `{ block: false }` or throws "invalid URL format" (WRONG - embedded 127.0.0.1 should be detected and blocked with proper reason)
    - **Test 2.2**: Call `shouldBlock("http://[2002:c0a8:0101::1]/")` (6to4 encoding 192.168.1.1 in bits 16-47), assert returns `{ block: false }` or gets wrong reason (WRONG - embedded private IPv4 should be detected)
    - **Test 2.3**: Call `shouldBlock("http://[64:ff9b::192.168.1.1]/")` (NAT64), assert returns `{ block: false }` (WRONG - embedded private IPv4 should be detected)
    - **Test 2.4**: Call `shouldBlock("http://[::192.168.1.1]/")` (IPv4-compatible), assert returns `{ block: false }` (WRONG - embedded private IPv4 should be detected)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms IPv6 parsing gaps)
  - Run typecheck, vitest
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5 from bugfix.md_

### - [x] 3. Write exploratory tests for missing blocked IP ranges

  - **Property 1: Bug Condition** - Reserved IP Ranges Not Blocked
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix
  - **GOAL**: Demonstrate incomplete range list with concrete examples (most are already blocked by accident via "invalid URL format"; keep only genuinely-missed ranges)
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 3.1**: Call `shouldBlock("http://192.0.0.8/")` (IETF protocol assignments), assert returns `{ block: false }` (WRONG)
    - **Test 3.2**: Call `shouldBlock("http://198.18.0.1/")` (benchmark testing), assert returns `{ block: false }` (WRONG)
    - **Test 3.3**: Call `shouldBlock("http://224.0.0.251/")` (IPv4 multicast), assert returns `{ block: false }` (WRONG)
    - **Test 3.4**: Call `shouldBlock("http://240.0.0.1/")` (reserved for future use), assert returns `{ block: false }` (WRONG)
    - **Test 3.5**: Call `shouldBlock("http://255.255.255.255/")` (broadcast), assert returns `{ block: false }` (WRONG)
  - For ranges already blocked by accident (bracketed IPv6 throws "invalid URL format"), add regression guards that verify the reason is now "blocked IP address (<range>)" after the fix, not "invalid URL format"
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests 3.1-3.5 PASS on unfixed code (confirms missing ranges). Bracketed IPv6 tests document current accident
  - Run typecheck, vitest
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 from bugfix.md_

### - [x] 4. Write exploratory test for DNS rebinding (TOCTOU)

  - **Property 1: Bug Condition** - DNS Rebinding Bypasses IP Checks
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix (fake resolver returns public IP first call, private second; with pinning both go to public)
  - **GOAL**: Demonstrate Time-of-Check-Time-of-Use race with a concrete fake-resolver test
  - Write unit test in `packages/core/src/runner/safe-fetch.test.ts` that:
    - Create a fake resolver that returns `[{address:'8.8.8.8',family:4}]` on the first call and `[{address:'127.0.0.1',family:4}]` on subsequent calls
    - Call `shouldBlock("http://rebind.test/")` - first DNS resolution returns public IP, assert returns `{ block: false }` (allow)
    - Trigger a second resolution (simulate what Chromium would do) - returns private IP
    - Assert that the unfixed code DOES NOT detect the rebinding and allows the connection to 127.0.0.1 (WRONG - should pin to 8.8.8.8)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES on unfixed code (confirms no DNS pinning exists)
  - Run typecheck, vitest
  - _Requirements: 4.1, 4.2 from bugfix.md_

### - [x] 5. Mark redirect test as deferred (pre-check blocks before redirect is reached)

  - **NOTE**: The restrictive pre-check in audit.ts blocks `http://127.0.0.1:<port>/` before any browser starts, so the redirect is never served on unfixed code
  - Defer this exploratory test; redirect validation will be tested in Phase 3 task 18 using fake resolver/dial seams that map `public.test` → local server
  - _Requirements: 5.1, 5.2 from bugfix.md_

### - [x] 6. Write exploratory test for WebSocket bypass

  - **Property 1: Bug Condition** - WebSocket Connections to Private IPs Not Blocked
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix
  - **GOAL**: Demonstrate WebSocket bypass with a concrete example (page.route does not intercept WebSocket)
  - Write integration test in `packages/core/tests/safe-fetch-websocket.int.spec.ts` that:
    - Create an HTML page that opens `new WebSocket("ws://127.0.0.1:8080")`
    - Audit the page using `auditUrl()`
    - Assert that the unfixed code DOES NOT intercept the WebSocket connection (WRONG - page.route() doesn't intercept WebSocket upgrades)
    - Check WebRTC flags: assert WEBRTC_LEAK_FLAGS are present in Chromium launch args (they already exist; this is a positive check)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES on unfixed code (confirms WebSocket not intercepted)
  - Run typecheck, vitest, playwright
  - _Requirements: 6.1, 6.2 from bugfix.md_

### - [x] 7. Write exploratory tests for IP encoding normalization gaps

  - **Property 1: Bug Condition** - Non-Standard IP Encodings Bypass Checks
  - **CRITICAL**: This test MUST PASS on unfixed code with the WRONG (vulnerable) assertions
  - **NOTE**: Phase 3 task 16 will flip assertions to verify correct behavior after the fix
  - **GOAL**: Demonstrate encoding bypass with concrete examples (WHATWG URL already normalizes many, so only genuinely-missed encodings remain)
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 7.1**: Call `shouldBlock("http://2130706433/")` (127.0.0.1 as 32-bit decimal), assert returns `{ block: false }` IF unfixed code misses it (check first; WHATWG URL may normalize)
    - **Test 7.2**: Call `shouldBlock("http://127.1/")` (short form for 127.0.0.1), assert returns `{ block: false }` IF unfixed code misses it
  - For encodings that WHATWG URL already normalizes (octal, hex, etc.), add regression guards that verify the classifier still blocks them
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests for genuinely-missed encodings PASS on unfixed code. Regression guards document current accidental blocking
  - Run typecheck, vitest
  - _Requirements: 7.1, 7.2, 7.3, 7.4 from bugfix.md_

---

## Phase 2: Fix Implementation

These tasks implement the in-process CONNECT proxy architecture with canonical IP classification, DNS pinning, and complete blocked range coverage. After this phase, all exploratory tests from Phase 1 should fail (the bugs are fixed).

### - [x] 8. Add ipaddr.js dependency to packages/core

  - Add `ipaddr.js` ^2.2.0 to `packages/core/package.json` dependencies
  - From the repo root, run `npm install ipaddr.js@^2.2.0 -w @the-unseen/core`
  - Verify `ipaddr.js` is available: create a minimal test that imports `ipaddr.parse()` and asserts it works
  - _Requirements: Design section "Dependencies to Add"_

### - [x] 9. Implement canonical IP classification module with complete blocked ranges

  - Create `packages/core/src/runner/ip-classifier.ts` with:
    - `classifyAddress(canonical: ipaddr.IPv4 | ipaddr.IPv6): { blocked: boolean; reason: string }`
    - `isBlockedIPv4(ip: ipaddr.IPv4): { blocked: boolean; range?: string }`
    - `isBlockedIPv6(ip: ipaddr.IPv6): { blocked: boolean; range?: string }`
  - Implement complete blocked range list from design.md clause 2.13:
    - IPv4: loopback, RFC1918, link-local, CGNAT, this-network, IETF protocol, benchmark, multicast, reserved, broadcast, EC2 metadata
    - IPv6: loopback, link-local, ULA, IPv4-mapped, 6to4, multicast, unspecified, EC2 metadata IPv6
  - Implement embedded IPv4 extraction for IPv6:
    - IPv4-mapped (`::ffff:a.b.c.d/96`) - extract low 32 bits, check against IPv4 ranges
    - IPv4-compatible (`::/96` excluding `::ffff`) - extract low 32 bits
    - 6to4 (`2002::/16`) - extract bits 16-47 as IPv4 address
    - NAT64 (`64:ff9b::/96`) - extract low 32 bits
  - Use `ipaddr.parseCIDR()` and `ip.match(cidr)` for range matching
  - Write unit tests for each blocked range and each embedded IPv4 extraction case
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.26, 2.27, 2.28 from bugfix.md_
  - _Bug_Condition: Categories 2 and 3 from design.md Bug Condition section_
  - _Expected_Behavior: Clauses 2.6–2.13 from design.md Expected Behavior section_

### - [x] 10. Implement fail-closed DNS resolution module

  - Create `packages/core/src/runner/dns-resolver.ts` with:
    - `resolveHostname(hostname: string): Promise<ResolvedAddress[]>`
    - `ResolvedAddress` type: `{ address: string, family: 4 | 6, canonical: ipaddr.IPv4 | ipaddr.IPv6 }`
  - Use `dns.lookup(hostname, { all: true, verbatim: true })` instead of separate `resolve4()`/`resolve6()` calls
  - Fail-closed error handling:
    - ANY error thrown by `dns.lookup()` → throw `Error("DNS resolution failed: <message>")`
    - Empty array result → throw `Error("hostname did not resolve to any address")`
  - For each resolved address, call `ipaddr.process(address)` to get canonical form
  - Strip brackets from IPv6 addresses before parsing (e.g., `[::1]` → `::1`)
  - Write unit tests with mocked `dns.lookup()`:
    - Test ENODATA error → throws "DNS resolution failed"
    - Test ENOTFOUND error → throws "DNS resolution failed"
    - Test empty array → throws "hostname did not resolve"
    - Test successful resolution → returns array of ResolvedAddress with canonical forms
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5 from bugfix.md_
  - _Bug_Condition: Category 1 from design.md Bug Condition section_
  - _Expected_Behavior: Clauses 2.1–2.5 from design.md Expected Behavior section_

### - [x] 11. Implement in-process HTTP(S) CONNECT proxy server

  - Create `packages/core/src/runner/ssrf-guard-proxy.ts` with:
    - `SsrfGuardProxy` class with methods: `start(): Promise<number>`, `stop(): Promise<void>`, `handleConnect()`, `handleRequest()`
    - `ProxyOptions` interface: `{ blockedLog: Array<{ url: string; reason: string }>, allowAuthorities?: readonly string[], lookup?: (host) => Promise<{address,family}[]>, dial?: (ip, port) => net.Socket }`
  - Proxy implementation:
    - Create `http.createServer()` with `'connect'` and `'request'` event handlers
    - Listen on `127.0.0.1:0` (random port)
    - On CONNECT request:
      1. Parse authority with strict authority parser: `/^(?:\[([0-9a-fA-F:.]+)\]|([^:\[\]]+)):(\d{1,5})$/`. Require port 1–65535
      2. Wrap the whole handler in try/catch, turning exceptions into 502 plus a blockedLog entry
      3. Attach 'error' listeners to clientSocket and serverSocket before any await
      4. Set a 10 s connect timeout on serverSocket
      5. Check `allowAuthorities` set: if authority matches, dial directly without DNS or range checks
      6. Check hostname cache: if cached, use cached validated IPs
      7. If not cached, call `this.lookup(hostname)` with 5 s timeout
      8. For each resolved address, call `classifyAddress(canonical)` from ip-classifier.ts
      9. If ANY address is blocked, write `HTTP/1.1 403 Forbidden` and close socket, log to blockedLog as `{ url: 'connect://<authority>', reason }`
      10. If DNS resolution fails, write `HTTP/1.1 502 Bad Gateway` and close socket, log to blockedLog
      11. If all addresses allowed, dial with `net.connect({ host, port, lookup: pinnedLookup, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 })` where pinnedLookup returns only the cached validated addresses
      12. Write `HTTP/1.1 200 Connection Established`, pipe bidirectional stream with `stream.pipeline()` for both directions
      13. Cache hostname → validated IP addresses for duration of proxy lifetime
      14. Track every accepted and upstream socket in a Set
    - On 'request' event (plain HTTP):
      1. Require absolute-form `http:` request-target, reply 400 otherwise
      2. Take host only from request-target URL, never from Host header
      3. Resolve and validate exactly as CONNECT
      4. Forward with `http.request({ host, port, method, path, headers, lookup: pinnedLookup, agent: false })`
      5. Strip `Proxy-*` and hop-by-hop headers, overwrite `Host`
      6. Never follow redirects in the proxy
      7. Destroy socket on 'upgrade' event
  - `stop()`: destroy all tracked sockets, then call `server.close()`, resolve within 1 s
  - Hostname cache: `Map<string, ResolvedAddress[]>` cleared on `stop()`
  - Write unit tests with mock DNS resolver and mock TCP server:
    - Test CONNECT to public IP → tunnel established
    - Test CONNECT example.test:443 with fake resolver → tunnel succeeds
    - Test CONNECT to 127.0.0.1 → 403 Forbidden, logged
    - Test CONNECT to hostname resolving to private IP → 403 Forbidden
    - Test DNS error → 502 Bad Gateway
    - Test hostname caching (second CONNECT to same hostname doesn't call DNS again)
    - Test allowAuthorities exemption (exact authority bypasses DNS and range checks)
    - Test client reset mid-tunnel → process survives, no uncaught exception
    - Test fake lookup returns AAAA-only unreachable, then valid IPv4 → tunnel succeeds through second address (happy eyeballs)
    - Test plain HTTP GET with absolute-form URL → forwarded correctly
    - Test plain HTTP GET with Host header 127.0.0.1 and public request-target → goes to public IP
    - Test origin-form request → 400
  - Run `npm run typecheck`, `npx vitest --run`, `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npx playwright test`
  - _Requirements: 2.14, 2.15, 2.15a, 2.16, 2.17, 2.18, 2.18a, 2.20, 2.20a, 2.20b from bugfix.md_
  - _Bug_Condition: Category 4 from design.md Bug Condition section_
  - _Expected_Behavior: Clauses 2.14–2.18a from design.md Expected Behavior section_

### - [x] 12. Integrate proxy with PageLoader context creation and audit lifecycle

  - Modify `packages/core/src/runner/browser.ts`:
    - `PageLoader.createContext(browser, options, proxy?: { server: string; bypass: '<-loopback>' })` forwards `proxy` to `browser.newContext({ proxy })`
    - Do NOT change `buildLaunchArgs` for the proxy
  - Modify `packages/core/src/audit.ts`:
    - In `auditUrlWithHooks`, read `policy.mode` before ResourceMeter wraps it
    - If mode is 'restrictive' (or missing):
      1. Create `SsrfGuardProxy` instance with `{ blockedLog, allowAuthorities }`
      2. Call `proxy.start()` after pre-check and before `runAudit`
      3. If proxy startup fails, throw `new Error('egress proxy failed to start: <reason>')` and no browser is acquired
      4. Pass `{ proxyServer: 'http://127.0.0.1:<port>' }` to `createContext`
      5. In `finally` block after `runAudit`'s finally has closed the context, call `proxy.stop()`
    - If mode is 'permissive': no proxy, direct connection
  - `installSafeFetchPolicy(page, policy)` unchanged: installs `page.route('**/*')` in every mode
  - Proxy error handling:
    - If proxy startup fails → throw before browser acquisition
    - If DNS resolution times out → proxy closes connection, logs timeout, does NOT throw into audit
    - If browser disconnects/crashes → `audit-guard.ts` calls `guard.fail()` as today, cleanup closes proxy
  - Add a test that default `auditUrl` creates its context with a proxy (spy on `browser.newContext` options or assert loopback fetch is blocked)
  - Add a test with pool maxConcurrency 1 running two sequential restrictive audits; the second must use its own proxy (blocked-log entry appears only in second audit)
  - Add integration tests (task 14 in old numbering):
    - A page served through the proxy `fetch()`es http://127.0.0.1:<live port>/, http://localhost:<live port>/, http://[::1]:<live port>/ and http://169.254.169.254/. Each must appear in blockedRequests, and the live loopback server must record zero hits
    - Main frame redirect: fake resolver maps `public.test` → 203.0.113.10, fake dial maps 203.0.113.10 → local 302 server redirecting to http://127.0.0.1:<closed port>/admin. Expect auditUrl to reject with SsrfBlockedError whose reason is the proxy's reason
    - Subresource redirect: page has `<img src="http://public.test/r">`, /r 302s to 127.0.0.1. Expect blockedRequests to contain the 127.0.0.1 target once
    - auditHtml works under restrictive policy with allowAuthorities; a `new WebSocket("ws://127.0.0.1:<other port>")` from the auditHtml page is recorded as blocked
  - Run typecheck, vitest, playwright
  - _Requirements: 2.19, 2.20, 2.21, 2.36, 2.37, 2.38 from bugfix.md_
  - _Integration: audit-guard.ts and resource-limits.ts from design.md section 2.19–2.23_

### - [x] 13. Update Chromium launch args for DNS and QUIC

  - Modify `packages/core/src/runner/browser.ts`:
    - In `buildLaunchArgs()`, add `--disable-quic` and `--disable-features=DnsOverHttps` to the args array
    - Verify WEBRTC_LEAK_FLAGS (`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, `--webrtc-ip-handling-policy=disable_non_proxied_udp`) are still present
  - Write unit test:
    - Call `buildLaunchArgs()`, assert each WEBRTC_LEAK_FLAGS entry, `--disable-quic`, and `--disable-features=DnsOverHttps` are in the returned array
  - Run typecheck, vitest, playwright
  - _Requirements: 2.29 from bugfix.md_
  - _Bug_Condition: Category 6 from design.md Bug Condition section (WebRTC)_
  - _Expected_Behavior: Clause 2.29 from design.md Expected Behavior section_

### - [x] 14. Rewrite RestrictiveSafeFetchPolicy and PermissiveSafeFetchPolicy

  - Modify `packages/core/src/runner/safe-fetch.ts`:
    - Add `readonly mode?: 'restrictive' | 'permissive'` to `SafeFetchPolicy` interface
    - **RestrictiveSafeFetchPolicy**: set `mode: 'restrictive'`
      - `shouldBlock()`:
        1. Parse URL, check scheme (only http/https allowed)
        2. Check cloud metadata hostname list (before DNS resolution)
        3. Strip brackets from hostname if IPv6 format
        4. Try parsing hostname as direct IP with `ipaddr.process()`:
           - If valid IP, call `classifyAddress()` from ip-classifier.ts
           - If blocked, return `{ block: true, reason }`
        5. If not a direct IP, call `resolveHostname()` from dns-resolver.ts with injected `deps.lookup` if available
        6. For each resolved address, call `classifyAddress()`
        7. If ANY address is blocked, return `{ block: true, reason: "hostname resolves to blocked IP" }`
        8. Otherwise return `{ block: false, reason: "" }`
    - **PermissiveSafeFetchPolicy**: set `mode: 'permissive'`
      - `shouldBlock()`:
        1. Parse URL
        2. Check scheme (only http/https allowed)
        3. Return `{ block: false, reason: "" }` (no IP restrictions)
    - ResourceMeter.wrapPolicy and OriginScopedPolicy forward `inner.mode`
    - Remove old DNS resolution logic (`resolveAndCheck()`, `dns.resolve4()`, `dns.resolve6()`)
    - Remove old IP classification logic (`ipv4ToNumber()`, `ipv6ToBigInt()`, `isBlockedIpv4()`, `isBlockedIpv6()`)
    - Keep `installSafeFetchPolicy()` function signature unchanged (preserves API)
  - Modify `installSafeFetchPolicy()`:
    - Install `page.route('**/*')` in every mode (so ResourceMeter counts requests)
    - Proxy lifecycle is managed by audit.ts (task 12)
  - Write unit tests:
    - Restrictive policy blocks all ranges from clause 2.13
    - Restrictive policy allows public IPs (8.8.8.8, 1.1.1.1) when DNS succeeds
    - Permissive policy allows private IPs (127.0.0.1, 10.0.0.1)
    - Permissive policy blocks non-http(s) schemes
    - A restrictive audit of a page with 501 subresources fails with AuditResourceLimitError('request-count')
  - Run typecheck, vitest, playwright
  - _Requirements: 2.34, 2.35, 2.36, 2.37, 2.38, 3.1, 3.2, 3.3, 3.4 from bugfix.md_
  - _Preservation: Clauses 3.1–3.4 from design.md Preservation section_
### - [x] 15. Implement blocked request recording in RawAudit

  - Modify `packages/core/src/audit.ts`:
    - During audit assembly, merge `proxy.blockedLog` (array of `{ url: string, reason: string }`) into `RawAudit.blockedRequests`
    - For permissive mode, merge blocked requests from `page.route()` handler log
  - Modify `packages/core/src/types.ts`:
    - Ensure `RawAudit.blockedRequests` type is `Array<{ url: string; reason: string }>`
  - Write integration test:
    - Audit a page that makes a request to 127.0.0.1
    - Assert `RawAudit.blockedRequests` contains `{ url: "connect://127.0.0.1:<port>", reason: "blocked IP address (loopback)" }` (or the http:// URL for a plain-HTTP request)
  - Run typecheck, vitest, playwright
  - _Requirements: 2.38, 3.9 from bugfix.md_
  - _Integration: RawAudit.blockedRequests from design.md section 2.38_

---

## Phase 3: Validation & Preservation

These tasks verify the fix works correctly (exploratory tests now fail, proving bugs are fixed) and that legitimate requests still work (preservation tests).

### - [x] 16. Verify exploratory tests now fail (bugs are fixed)

  - **Property 1: Expected Behavior** - All SSRF Vulnerabilities Blocked
  - **IMPORTANT**: Re-run the SAME tests from Phase 1 (tasks 1-7) with flipped assertions - do NOT write new tests
  - Re-run all exploratory tests from Phase 1 (tasks 1-7)
  - Flip test assertions to verify CORRECT behavior:
    - Task 1 tests (DNS fail-open) now expect DNS errors to block requests with reason "DNS resolution failed"
    - Task 2 tests (IPv6 parsing) now expect embedded IPv4 to be extracted and blocked
    - Task 3 tests (missing ranges) now expect all ranges to be blocked
    - Task 4 test (DNS rebinding) now expects DNS to be pinned (second request uses cached IP)
    - Task 5 test (redirect bypass) now expects redirects to be validated
    - Task 6 test (WebSocket bypass) now expects WebSocket CONNECT to be validated
    - Task 7 tests (encoding bypass) now expect encodings to be normalized
  - **EXPECTED OUTCOME**: All tests PASS after assertions are flipped (confirms bugs are fixed)
  - Run typecheck, vitest, playwright
  - _Requirements: Expected Behavior Properties from design.md Property 1_

### - [x] 17. Write property-based preservation tests for legitimate public requests

  - **Property 2: Preservation** - Public URLs Continue to Work
  - **IMPORTANT**: Use `await fc.assert(fc.asyncProperty(...), { numRuns: 200 })`
  - Create `packages/core/src/runner/safe-fetch.preservation.test.ts`
  - Use fast-check to generate test cases (minimum 200 runs per property)
  - **Property 1: Mixed resolver list with one blocked address gives BLOCK**
    - Fake `lookup(host,{all:true,verbatim:true})` returns a shuffled array of public addresses plus one generated blocked address (v4, v6, or AAAA `::ffff:<blocked v4>`)
    - Assert result must be BLOCK
  - **Property 2: Resolver errors with valid DNS-label hostnames give BLOCK**
    - Fake lookup rejects with error whose code is drawn from {ENODATA, ENOTFOUND, EAI_AGAIN, ETIMEOUT, ESERVFAIL}
    - Host is drawn from `fc.domain()` or a valid DNS-label arbitrary such as `/[a-z]{1,10}\.test/`
    - Assert result is BLOCK with reason containing "DNS resolution failed"
  - **Property 3: AAAA-only hosts returning blocked IPv6 give BLOCK**
    - Fake lookup returns `[{address:'::1',family:6}]` or `[{address:'::ffff:127.0.0.1',family:6}]`
    - Assert result is BLOCK
  - **Property 4: Private addresses in all encodings are blocked**
    - Build addresses constructively: pick a CIDR from the blocked table, add a random offset inside it, then render it in an encoding drawn from {dotted, octal, hex, 32-bit integer, short form, `::ffff:`, bracketed, mixed-case hex, zero-padded}
    - Assert: requests are blocked
  - Extend the encoding arbitrary with zero-padded octets, mixed-case `0X7F`, single-integer, 1-3-part short forms, bracketed IPv6 and `%25` zone ids, and run each through both shouldBlock and the proxy's CONNECT-target parser
  - Run each property with ≥200 iterations
  - Run typecheck, vitest, playwright
  - _Requirements: Property 2 from design.md Correctness Properties_
  - _Preservation: Clauses 3.1–3.14 from design.md Preservation section_

### - [x] 18. Write integration test for HTTP redirect validation

  - Create `packages/core/tests/safe-fetch-redirect.int.spec.ts`
  - Use fake resolver/dial seams:
    - Main frame redirect test: fake resolver maps `public.test` → 203.0.113.10, fake dial maps 203.0.113.10:80 → local 302 server redirecting to http://127.0.0.1:<closed port>/admin. Expect auditUrl to reject with SsrfBlockedError whose reason is the proxy's reason
    - Subresource redirect test: page has `<img src="http://public.test/r">`, /r 302s to 127.0.0.1. Expect blockedRequests to contain the 127.0.0.1 target once
  - Assert:
    - Main frame: auditUrl rejects with SsrfBlockedError
    - Subresource: `RawAudit.blockedRequests` contains the 127.0.0.1 URL
    - Live server on 127.0.0.1 records zero hits
  - Clean up server
  - Run typecheck, vitest, playwright
  - _Requirements: 2.24, 2.25, 2.26, 2.26a from bugfix.md_
  - _Expected_Behavior: Clauses 2.24–2.26a from design.md Expected Behavior section_

### - [x] 19. Write integration test for WebSocket blocking

  - Create `packages/core/tests/safe-fetch-websocket.int.spec.ts`
  - Create an HTML file or serve via auditHtml that opens `new WebSocket("ws://127.0.0.1:8080")` to a closed port
  - Audit the HTML file using `auditHtml()` with `RestrictiveSafeFetchPolicy` and `allowAuthorities` support
  - Assert:
    - `RawAudit.blockedRequests` contains `{ url: 'connect://127.0.0.1:8080', reason: 'blocked IP address (loopback)' }`
    - WebSocket connection did NOT proceed (blocked by proxy)
  - Assert Chromium launch args include each WEBRTC_LEAK_FLAGS entry, `--disable-quic`, and `--disable-features=DnsOverHttps`
  - Run typecheck, vitest, playwright
  - _Requirements: 2.27, 2.28, 2.29 from bugfix.md_
  - _Expected_Behavior: Clauses 2.27–2.29 from design.md Expected Behavior section_

### - [x] 20. Run full packages/core test suite and verify existing tests pass

  - In packages/core run `npm run typecheck`, then `npx vitest --run`, then the integration suite: `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npx playwright test` on Windows PowerShell, or `UNSEEN_CHROMIUM_CHANNEL=chromium npx playwright test` in bash or the Playwright Docker image. All three must pass
  - Assert all existing tests that do NOT specifically probe safe-fetch internals continue to pass
  - If any test fails:
    - Determine if test is legitimately broken by the fix (e.g., test relied on fail-open DNS behavior)
    - Update test to work with new fail-closed behavior
    - Document any test changes in commit message
  - Assert integration tests in `packages/core/tests/` pass
  - _Requirements: 3.12, 3.13, 3.14 from bugfix.md_
  - _Preservation: Clause 3.12–3.14 from design.md Preservation section_

### - [x] 21. Document egress firewall rules for defense-in-depth

  - Create `apps/web/DEPLOY.md` with:
    - Egress firewall configuration for Docker (iptables rules)
    - Egress firewall configuration for AWS ECS (Security Group rules)
    - Egress firewall configuration for Fly.io, Render, Railway
    - Testing procedures to verify firewall rules are active (e.g., `curl http://127.0.0.1/` from container should fail)
  - Add section to design.md referencing DEPLOY.md for deployment guidance
  - Document that egress firewall is defense-in-depth, NOT a replacement for application-level SSRF guard
  - _Requirements: 2.39, 2.40 from bugfix.md_
  - _Defense: Clauses 2.39–2.40 from design.md Expected Behavior section_

### Notes: run 37 follow-ups (deviations)

- Proxy option `allowAuthorities` (dial without DNS or range checks) is replaced by `servedAuthorities` (the proxy answers 403 and never dials). Reason: `route.fulfill` already serves the synthetic origin, and WebSockets reached the unpinned dial path. The existing proxy test "dials an allow-listed authority without DNS or range checks" asserted the removed behaviour and was replaced by refusal tests. Its neighbouring assertion (a different port is still 403) is kept in the new tests.
- `--disable-features` is now one merged switch: `DnsOverHttps,WebRtcHideLocalIpsWithMdns` (plus caller extras). The two tests that asserted the old exact value `--disable-features=DnsOverHttps` were updated to the merged value. The earlier note that WebRtcHideLocalIpsWithMdns was dropped is superseded on the product lead's instruction.
- All six background-traffic switches exist in Chromium and were added. The "no unreferenced blockedRequests" test also passes without them on this machine (headless chromium channel), so it guards against regression rather than reproducing the noise here.
