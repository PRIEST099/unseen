# Implementation Plan: Safe-Fetch SSRF Prevention

## Overview

This task list implements a complete replacement of `packages/core/src/runner/safe-fetch.ts` to close seven critical SSRF vulnerabilities while preserving the existing API contract. The implementation follows the bugfix methodology: exploratory testing to prove each bug exists, fix implementation with the in-process CONNECT proxy architecture, and preservation testing to ensure legitimate requests continue to work.

## Notes

**Execution Order:** Bugfix tasks run as a linear sequence. While some tasks within a phase could theoretically run in parallel (e.g., multiple exploratory tests), they are ordered for clarity and to minimize test file conflicts.

**Key Dependencies:**
- Phase 1 (tasks 1-7) must complete before Phase 2 starts (proves bugs exist)
- Phase 2 task 8 (add ipaddr.js) must complete before tasks 9-10
- Phase 2 tasks 9-10 must complete before task 11 (proxy needs classifier and resolver)
- Phase 2 tasks 11, 13, 14 must complete before task 12 (integration)
- Phase 2 task 12 must complete before task 15 (blocked request recording)
- All Phase 2 tasks must complete before Phase 3 starts
- Phase 3 task 16 must complete before tasks 17-20 (verify bugs are fixed first)

**Testing Strategy:**
- Exploratory tests (Phase 1) assert WRONG behavior on unfixed code
- Fix validation (Phase 3 task 16) flips assertions to verify CORRECT behavior
- Property-based tests (Phase 3 task 17) use fast-check with ≥200 iterations
- Integration tests (Phase 3 tasks 18-19) use real Chromium and local test servers

---

## Tasks

### Phase 1: Exploratory Testing (Prove the Bugs)

These tests run BEFORE the fix is implemented. They demonstrate that each vulnerability exists in the current code by asserting the WRONG (vulnerable) behavior. All tests in this phase are expected to pass on unfixed code, confirming the bugs.

These tests run BEFORE the fix is implemented. They demonstrate that each vulnerability exists in the current code by asserting the WRONG (vulnerable) behavior. All tests in this phase are expected to pass on unfixed code, confirming the bugs.

### - [ ] 1. Write exploratory tests for DNS error fail-open vulnerabilities

  - **Property 1: Bug Condition** - DNS Resolution Failures Allow Private Access
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating fail-open DNS handling
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to concrete failing cases
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 1.1**: Mock `dns.resolve4()` to throw `ENODATA`, assert `resolveAndCheck()` returns `false` (allow) - this is the WRONG behavior
    - **Test 1.2**: Mock `dns.resolve6()` to throw `ENODATA`, assert `resolveAndCheck()` returns `false` (allow) - this is the WRONG behavior
    - **Test 1.3**: Mock both `resolve4()` and `resolve6()` to return empty arrays `[]`, assert `resolveAndCheck()` returns `false` (allow) - this is the WRONG behavior
    - **Test 1.4**: Create a mock hostname that resolves only to IPv6 `fe80::1` (link-local), mock `dns.resolve4()` to throw `ENODATA`, assert that the system allows the request (WRONG - should block link-local IPv6)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms fail-open bug exists)
  - Document counterexamples found (e.g., "IPv6-only hostname pointing to fe80::1 is allowed when dns.resolve4() throws ENODATA")
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 1.1, 1.2, 1.3, 1.4 from bugfix.md_

### - [ ] 2. Write exploratory tests for IPv6 parsing vulnerabilities

  - **Property 1: Bug Condition** - IPv6 Addresses Bypass IP Blocking
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating IPv6 parsing gaps
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 2.1**: Call `ipv6ToBigInt("[::1]")` (with brackets), assert it throws an exception (WRONG - brackets should be stripped)
    - **Test 2.2**: Call `shouldBlock("http://[::ffff:127.0.0.1]/")` (IPv4-mapped IPv6), assert returns `{ block: false }` (WRONG - embedded 127.0.0.1 should be detected and blocked)
    - **Test 2.3**: Call `shouldBlock("http://[2002:c0a8:0101::1]/")` (6to4 encoding 192.168.1.1), assert returns `{ block: false }` (WRONG - embedded private IPv4 should be detected)
    - **Test 2.4**: Call `shouldBlock("http://[64:ff9b::192.168.1.1]/")` (NAT64), assert returns `{ block: false }` (WRONG - embedded private IPv4 should be detected)
    - **Test 2.5**: Call `shouldBlock("http://[::192.168.1.1]/")` (IPv4-compatible), assert returns `{ block: false }` (WRONG - embedded private IPv4 should be detected)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms IPv6 parsing gaps)
  - Document counterexamples (e.g., "::ffff:127.0.0.1 is not recognized as loopback")
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5 from bugfix.md_

### - [ ] 3. Write exploratory tests for missing blocked IP ranges

  - **Property 1: Bug Condition** - Reserved IP Ranges Not Blocked
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating incomplete range list
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 3.1**: Call `shouldBlock("http://192.0.0.8/")` (IETF protocol assignments), assert returns `{ block: false }` (WRONG)
    - **Test 3.2**: Call `shouldBlock("http://198.18.0.1/")` (benchmark testing), assert returns `{ block: false }` (WRONG)
    - **Test 3.3**: Call `shouldBlock("http://224.0.0.251/")` (IPv4 multicast), assert returns `{ block: false }` (WRONG)
    - **Test 3.4**: Call `shouldBlock("http://240.0.0.1/")` (reserved for future use), assert returns `{ block: false }` (WRONG)
    - **Test 3.5**: Call `shouldBlock("http://255.255.255.255/")` (broadcast), assert returns `{ block: false }` (WRONG)
    - **Test 3.6**: Call `shouldBlock("http://[ff02::1]/")` (IPv6 multicast), assert returns `{ block: false }` (WRONG)
    - **Test 3.7**: Call `shouldBlock("http://[::0]/")` (unspecified), assert returns `{ block: false }` (WRONG)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms missing ranges)
  - Document counterexamples (e.g., "192.0.0.8 is allowed, should be blocked as IETF protocol range")
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 from bugfix.md_

### - [ ] 4. Write exploratory test for DNS rebinding (TOCTOU)

  - **Property 1: Bug Condition** - DNS Rebinding Bypasses IP Checks
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexample demonstrating Time-of-Check-Time-of-Use race
  - Write integration test in `packages/core/src/runner/safe-fetch.test.ts` that:
    - Create a mock DNS resolver that returns `8.8.8.8` on the first call and `127.0.0.1` on the second call
    - Call `shouldBlock("http://rebind.example.com/")` - first DNS resolution returns public IP, assert returns `{ block: false }` (allow)
    - Simulate Chromium navigation which triggers second DNS resolution - returns private IP
    - Assert that the unfixed code DOES NOT detect the rebinding and allows the connection to 127.0.0.1 (WRONG)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES on unfixed code (confirms no DNS pinning exists)
  - Document counterexample (e.g., "rebind.example.com resolves to 8.8.8.8 at check-time, 127.0.0.1 at use-time, connection proceeds")
  - _Requirements: 4.1, 4.2 from bugfix.md_

### - [ ] 5. Write exploratory test for HTTP redirect bypass

  - **Property 1: Bug Condition** - Redirects to Blocked IPs Not Validated
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexample demonstrating redirect bypass
  - Write integration test in `packages/core/tests/safe-fetch-redirect.int.spec.ts` that:
    - Start a local Node.js HTTP server on a random port that returns `HTTP 302` with `Location: http://127.0.0.1:1234/admin`
    - Audit the server's public-facing URL (`http://127.0.0.1:<random-port>/`) using `auditUrl()`
    - Assert that the unfixed code follows the redirect to `http://127.0.0.1:1234/admin` without blocking (WRONG)
    - Check that the page navigated to the loopback address (confirms redirect was followed)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES on unfixed code (confirms redirect targets are not validated)
  - Document counterexample (e.g., "Public URL redirects to 127.0.0.1:1234, redirect followed without validation")
  - _Requirements: 5.1, 5.2 from bugfix.md_

### - [ ] 6. Write exploratory test for WebSocket bypass

  - **Property 1: Bug Condition** - WebSocket Connections to Private IPs Not Blocked
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexample demonstrating WebSocket bypass
  - Write integration test in `packages/core/tests/safe-fetch-websocket.int.spec.ts` that:
    - Create an HTML page that opens `new WebSocket("ws://127.0.0.1:8080")`
    - Audit the page using `auditUrl()`
    - Assert that the unfixed code DOES NOT intercept the WebSocket connection (WRONG - page.route() doesn't intercept WebSocket upgrades)
    - Check WebRTC is not disabled: assert `--disable-webrtc` is NOT present in Chromium launch args
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES on unfixed code (confirms WebSocket and WebRTC not blocked)
  - Document counterexample (e.g., "WebSocket connection to ws://127.0.0.1:8080 proceeds, not intercepted by page.route()")
  - _Requirements: 6.1, 6.2 from bugfix.md_

### - [ ] 7. Write exploratory tests for IP encoding normalization gaps

  - **Property 1: Bug Condition** - Non-Standard IP Encodings Bypass Checks
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating encoding bypass
  - Write unit tests in `packages/core/src/runner/safe-fetch.test.ts` that:
    - **Test 7.1**: Call `shouldBlock("http://2130706433/")` (127.0.0.1 as 32-bit decimal), assert returns `{ block: false }` (WRONG - should be normalized and blocked)
    - **Test 7.2**: Call `shouldBlock("http://127.1/")` (short form for 127.0.0.1), assert returns `{ block: false }` (WRONG)
    - **Test 7.3**: Call `shouldBlock("http://0177.0.0.1/")` (octal 0177 = decimal 127), assert returns `{ block: false }` or throws (WRONG - should be normalized)
    - **Test 7.4**: Call `shouldBlock("http://0x7f.0.0.1/")` (hex 0x7f = decimal 127), assert returns `{ block: false }` (WRONG)
    - **Test 7.5**: Call `shouldBlock("http://[fe80::1%25eth0]/")` (IPv6 with zone ID), assert returns `{ block: false }` or throws (WRONG - zone should be stripped before classification)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS on unfixed code (confirms encoding normalization gaps)
  - Document counterexamples (e.g., "2130706433 (decimal encoding of 127.0.0.1) is not recognized as IP address")
  - _Requirements: 7.1, 7.2, 7.3, 7.4 from bugfix.md_

---

## Phase 2: Fix Implementation

These tasks implement the in-process CONNECT proxy architecture with canonical IP classification, DNS pinning, and complete blocked range coverage. After this phase, all exploratory tests from Phase 1 should fail (the bugs are fixed).

### - [ ] 8. Add ipaddr.js dependency to packages/core

  - Add `ipaddr.js` ^2.2.0 to `packages/core/package.json` dependencies
  - Run `npm install` in workspace root to update lock file
  - Verify `ipaddr.js` is available: create a minimal test that imports `ipaddr.parse()` and asserts it works
  - _Requirements: Design section "Dependencies to Add"_

### - [ ] 9. Implement canonical IP classification module with complete blocked ranges

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

### - [ ] 10. Implement fail-closed DNS resolution module

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

### - [ ] 11. Implement in-process HTTP(S) CONNECT proxy server

  - Create `packages/core/src/runner/ssrf-guard-proxy.ts` with:
    - `SsrfGuardProxy` class with methods: `start(): Promise<number>`, `stop(): Promise<void>`, `handleConnect()`
    - `ProxyOptions` interface: `{ policy: SafeFetchPolicy, blockedLog: Array<{ url: string; reason: string }> }`
  - Proxy implementation:
    - Create `http.createServer()` with `'connect'` event handler
    - Listen on `127.0.0.1:0` (random port)
    - On CONNECT request:
      1. Parse `hostname:port` from CONNECT target
      2. Check hostname cache: if cached, use cached validated IPs
      3. If not cached, call `resolveHostname(hostname)`
      4. For each resolved address, call `classifyAddress(canonical)` from ip-classifier.ts
      5. If ANY address is blocked, write `HTTP/1.1 403 Forbidden` and close socket, log to blockedLog
      6. If DNS resolution fails, write `HTTP/1.1 502 Bad Gateway` and close socket, log to blockedLog
      7. If all addresses allowed, establish TCP connection to first validated IP address
      8. Write `HTTP/1.1 200 Connection Established`, pipe bidirectional stream
      9. Cache hostname → validated IP addresses for duration of proxy lifetime
  - Hostname cache: `Map<string, ResolvedAddress[]>` cleared on `stop()`
  - Write unit tests with mock DNS resolver and mock TCP server:
    - Test CONNECT to public IP → tunnel established
    - Test CONNECT to 127.0.0.1 → 403 Forbidden, logged
    - Test CONNECT to hostname resolving to private IP → 403 Forbidden
    - Test DNS error → 502 Bad Gateway
    - Test hostname caching (second CONNECT to same hostname doesn't call DNS again)
  - _Requirements: 2.14, 2.15, 2.16, 2.17, 2.18 from bugfix.md_
  - _Bug_Condition: Category 4 from design.md Bug Condition section_
  - _Expected_Behavior: Clauses 2.14–2.18 from design.md Expected Behavior section_

### - [ ] 12. Integrate proxy with browser.ts and audit-guard.ts lifecycle

  - Modify `packages/core/src/runner/browser.ts`:
    - In `buildLaunchArgs()`, accept `proxyPort?: number` parameter
    - If `proxyPort` provided, add `--proxy-server=127.0.0.1:${proxyPort}` to Chromium launch args
  - Modify `packages/core/src/audit.ts`:
    - In `auditUrl()`, when using `RestrictiveSafeFetchPolicy`:
      1. Create `SsrfGuardProxy` instance
      2. Call `proxy.start()` to get proxy port
      3. If proxy startup fails, call `guard.fail(new Error("proxy startup failed"))` before browser acquisition
      4. Acquire browser with `proxyPort` passed to launch args
      5. Install proxy on page (proxy is already running, no page.route() needed for restrictive mode)
      6. In `finally` block, call `proxy.stop()` to close proxy server
    - When using `PermissiveSafeFetchPolicy`:
      - Skip proxy setup
      - Install minimal `page.route()` handler that only blocks non-http(s) schemes
  - Proxy error handling:
    - If proxy startup fails (port collision, OS error) → call `guard.fail()` before browser acquisition
    - If DNS resolution times out (> 5 seconds per security.md) → proxy closes connection, logs timeout, does NOT call `guard.fail()` (individual request failures don't abort audit)
    - If browser disconnects/crashes → `audit-guard.ts` calls `guard.fail()` as today, cleanup closes proxy
  - Write integration test:
    - Audit a URL with restrictive policy, verify proxy starts and stops cleanly
    - Audit a URL with permissive policy, verify no proxy is started
    - Simulate proxy startup failure, verify `guard.fail()` is called
  - _Requirements: 2.19, 2.20, 2.21 from bugfix.md_
  - _Integration: audit-guard.ts and resource-limits.ts from design.md section 2.19–2.23_

### - [ ] 13. Add WebRTC disable flag to Chromium launch args

  - Modify `packages/core/src/runner/browser.ts`:
    - In `buildLaunchArgs()`, add `--disable-webrtc` to the args array
  - Write unit test:
    - Call `buildLaunchArgs()`, assert `--disable-webrtc` is in the returned array
  - _Requirements: 2.29 from bugfix.md_
  - _Bug_Condition: Category 6 from design.md Bug Condition section (WebRTC)_
  - _Expected_Behavior: Clause 2.29 from design.md Expected Behavior section_

### - [ ] 14. Rewrite RestrictiveSafeFetchPolicy and PermissiveSafeFetchPolicy

  - Modify `packages/core/src/runner/safe-fetch.ts`:
    - **RestrictiveSafeFetchPolicy.shouldBlock()**:
      1. Parse URL, check scheme (only http/https allowed)
      2. Check cloud metadata hostname list (before DNS resolution)
      3. Strip brackets from hostname if IPv6 format
      4. Try parsing hostname as direct IP with `ipaddr.process()`:
         - If valid IP, call `classifyAddress()` from ip-classifier.ts
         - If blocked, return `{ block: true, reason }`
      5. If not a direct IP, call `resolveHostname()` from dns-resolver.ts
      6. For each resolved address, call `classifyAddress()`
      7. If ANY address is blocked, return `{ block: true, reason: "hostname resolves to blocked IP" }`
      8. Otherwise return `{ block: false, reason: "" }`
    - **PermissiveSafeFetchPolicy.shouldBlock()**:
      1. Parse URL
      2. Check scheme (only http/https allowed)
      3. Return `{ block: false, reason: "" }` (no IP restrictions)
    - Remove old DNS resolution logic (`resolveAndCheck()`, `dns.resolve4()`, `dns.resolve6()`)
    - Remove old IP classification logic (`ipv4ToNumber()`, `ipv6ToBigInt()`, `isBlockedIpv4()`, `isBlockedIpv6()`)
    - Keep `installSafeFetchPolicy()` function signature unchanged (preserves API)
  - Modify `installSafeFetchPolicy()`:
    - If `policy instanceof RestrictiveSafeFetchPolicy`:
      - Return `{ proxy: SsrfGuardProxy, cleanup: () => proxy.stop() }`
      - Proxy lifecycle managed by audit.ts (task 12)
    - If `policy instanceof PermissiveSafeFetchPolicy`:
      - Install `page.route('**/*')` handler that calls `policy.shouldBlock()` and aborts blocked requests
      - Return `{ cleanup: () => {} }` (no proxy)
  - Write unit tests:
    - Restrictive policy blocks all ranges from clause 2.13
    - Restrictive policy allows public IPs (8.8.8.8, 1.1.1.1)
    - Permissive policy allows private IPs (127.0.0.1, 10.0.0.1)
    - Permissive policy blocks non-http(s) schemes
  - _Requirements: 2.34, 2.35, 2.36, 2.37, 2.38, 3.1, 3.2, 3.3, 3.4 from bugfix.md_
  - _Preservation: Clauses 3.1–3.4 from design.md Preservation section_

### - [ ] 15. Implement blocked request recording in RawAudit

  - Modify `packages/core/src/audit.ts`:
    - During audit assembly, merge `proxy.blockedLog` (array of `{ url: string, reason: string }`) into `RawAudit.blockedRequests`
    - For permissive mode, merge blocked requests from `page.route()` handler log
  - Modify `packages/core/src/types.ts`:
    - Ensure `RawAudit.blockedRequests` type is `Array<{ url: string; reason: string }>`
  - Write integration test:
    - Audit a page that makes a request to 127.0.0.1
    - Assert `RawAudit.blockedRequests` contains `{ url: "http://127.0.0.1/...", reason: "blocked IP address (loopback)" }`
  - _Requirements: 2.38, 3.9 from bugfix.md_
  - _Integration: RawAudit.blockedRequests from design.md section 2.38_

---

## Phase 3: Validation & Preservation

These tasks verify the fix works correctly (exploratory tests now fail, proving bugs are fixed) and that legitimate requests still work (preservation tests).

### - [ ] 16. Verify exploratory tests now fail (bugs are fixed)

  - **Property 1: Expected Behavior** - All SSRF Vulnerabilities Blocked
  - **IMPORTANT**: Re-run the SAME tests from Phase 1 (tasks 1-7) - do NOT write new tests
  - Re-run all exploratory tests from Phase 1 (tasks 1-7)
  - Assert that tests which passed on unfixed code now FAIL on fixed code:
    - Task 1 tests (DNS fail-open) now FAIL because DNS errors block requests
    - Task 2 tests (IPv6 parsing) now FAIL because embedded IPv4 is extracted and blocked
    - Task 3 tests (missing ranges) now FAIL because all ranges are now blocked
    - Task 4 test (DNS rebinding) now FAILS because DNS is pinned
    - Task 5 test (redirect bypass) now FAILS because redirects are validated
    - Task 6 test (WebSocket bypass) now FAILS because WebSocket CONNECT is validated
    - Task 7 tests (encoding bypass) now FAIL because encodings are normalized
  - Rewrite test assertions to verify CORRECT behavior (blocked requests return `{ block: true }`)
  - **EXPECTED OUTCOME**: All tests PASS after assertions are flipped (confirms bugs are fixed)
  - _Requirements: Expected Behavior Properties from design.md Property 1_

### - [ ] 17. Write property-based preservation tests for legitimate public requests

  - **Property 2: Preservation** - Public URLs Continue to Work
  - **IMPORTANT**: Follow observation-first methodology
  - Create `packages/core/src/runner/safe-fetch.preservation.test.ts`
  - Use fast-check to generate test cases (minimum 200 runs per property)
  - **Property 1: All private IPs in all encodings are blocked**
    - Define arbitrary `privateIPv4Arbitrary` that generates:
      - Dotted-decimal (127.0.0.1)
      - Octal (0177.0.0.1)
      - Hex (0x7f.0.0.1)
      - 32-bit decimal (2130706433)
      - Short form (127.1)
      - IPv4-mapped IPv6 (::ffff:127.0.0.1)
    - Define arbitrary `privateIPv6Arbitrary` for link-local, ULA, etc.
    - Assert: `fc.assert(fc.property(privateIPv4Arbitrary, async (ip) => { const r = await policy.shouldBlock(\`http://\${ip}/\`); expect(r.block).toBe(true); }))`
  - **Property 2: All public IPs are allowed**
    - Define arbitrary `publicIPv4Arbitrary` that generates IPs NOT in blocked ranges
    - Assert: `fc.assert(fc.property(publicIPv4Arbitrary, async (ip) => { const r = await policy.shouldBlock(\`http://\${ip}/\`); expect(r.block).toBe(false); }))`
  - **Property 3: DNS errors result in blocking (fail-closed)**
    - Define arbitrary `dnsErrorArbitrary` for ENODATA, ENOTFOUND, EAI_AGAIN, etc.
    - Mock `dns.lookup()` to throw each error
    - Assert: requests are blocked with reason "DNS resolution failed"
  - **Property 4: Invalid schemes are blocked**
    - Define arbitrary `invalidSchemeArbitrary` for file://, ftp://, javascript:, etc.
    - Assert: `shouldBlock()` returns `{ block: true, reason: "scheme not allowed: <scheme>" }`
  - **Property 5: Permissive policy allows private IPs**
    - Instantiate `PermissiveSafeFetchPolicy`
    - Assert: `shouldBlock("http://127.0.0.1/")` returns `{ block: false }`
  - Run each property with ≥200 iterations
  - _Requirements: Property 2 from design.md Correctness Properties_
  - _Preservation: Clauses 3.1–3.14 from design.md Preservation section_

### - [ ] 18. Write integration test for HTTP redirect validation

  - Create `packages/core/tests/safe-fetch-redirect.int.spec.ts`
  - Start a local Node.js HTTP server on random port that:
    - Responds to `GET /` with `HTTP 302` and `Location: http://127.0.0.1:1234/admin`
  - Audit the server URL using `auditUrl()` with `RestrictiveSafeFetchPolicy`
  - Assert:
    - `RawAudit.blockedRequests` contains `{ url: "http://127.0.0.1:1234/admin", reason: "blocked IP address (loopback)" }`
    - The page did NOT navigate to 127.0.0.1 (redirect was blocked)
  - Clean up server
  - _Requirements: 2.24, 2.25, 2.26 from bugfix.md_
  - _Expected_Behavior: Clauses 2.24–2.26 from design.md Expected Behavior section_

### - [ ] 19. Write integration test for WebSocket blocking

  - Create `packages/core/tests/safe-fetch-websocket.int.spec.ts`
  - Create an HTML file that opens `new WebSocket("ws://127.0.0.1:8080")`
  - Audit the HTML file using `auditHtml()` with `RestrictiveSafeFetchPolicy`
  - Assert:
    - `RawAudit.blockedRequests` contains entry with `url` matching `ws://127.0.0.1:8080` and `reason: "blocked IP address (loopback)"`
    - WebSocket connection did NOT proceed (blocked by proxy)
  - Assert Chromium launch args include `--disable-webrtc`
  - _Requirements: 2.27, 2.28, 2.29 from bugfix.md_
  - _Expected_Behavior: Clauses 2.27–2.29 from design.md Expected Behavior section_

### - [ ] 20. Run full packages/core test suite and verify existing tests pass

  - Run `npm test` in `packages/core/` workspace
  - Assert all existing tests that do NOT specifically probe safe-fetch internals continue to pass
  - If any test fails:
    - Determine if test is legitimately broken by the fix (e.g., test relied on fail-open DNS behavior)
    - Update test to work with new fail-closed behavior
    - Document any test changes in commit message
  - Assert integration tests in `packages/core/tests/` pass
  - _Requirements: 3.12, 3.13, 3.14 from bugfix.md_
  - _Preservation: Clause 3.12–3.14 from design.md Preservation section_

### - [ ] 21. Document egress firewall rules for defense-in-depth

  - Create `apps/web/DEPLOY.md` with:
    - Egress firewall configuration for Docker (iptables rules)
    - Egress firewall configuration for AWS ECS (Security Group rules)
    - Egress firewall configuration for Fly.io, Render, Railway
    - Testing procedures to verify firewall rules are active (e.g., `curl http://127.0.0.1/` from container should fail)
  - Add section to design.md referencing DEPLOY.md for deployment guidance
  - Document that egress firewall is defense-in-depth, NOT a replacement for application-level SSRF guard
  - _Requirements: 2.39, 2.40 from bugfix.md_
  - _Defense: Clauses 2.39–2.40 from design.md Expected Behavior section_
