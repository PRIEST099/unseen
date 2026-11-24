# Bugfix Requirements: safe-fetch SSRF Prevention

## Introduction

The current `packages/core/src/runner/safe-fetch.ts` implementation contains critical Server-Side Request Forgery (SSRF) vulnerabilities that allow an attacker to bypass IP-based access controls and reach private networks, loopback addresses, and cloud metadata endpoints. Seven specific defects were identified through security probing documented in `docs/brief/review-notes/safe-fetch-review-1.md` and `docs/brief/review-notes/audit-engine-reverify-1.md` (Finding 21).

These vulnerabilities allow an attacker to:
- Access internal services via IPv6-only hostnames that fail IPv4 resolution
- Bypass IP checks using IPv4-mapped IPv6 addresses or malformed bracket notation
- Exploit DNS rebinding by triggering Time-of-Check-Time-of-Use (TOCTOU) races
- Reach private networks via redirects to blocked addresses
- Access internal services over WebSocket connections
- Probe internal networks via encodings not normalized by the current parser

This bugfix specification uses the bug condition methodology to systematically close each vulnerability while preserving the existing API contract (`RestrictiveSafeFetchPolicy`, `PermissiveSafeFetchPolicy`, `installSafeFetchPolicy`) so that audit-engine callers require no changes.

---

## Bug Analysis

### Current Behavior (Defect)

#### 1. DNS Resolution Failures (Fail Open)

1.1 WHEN a hostname resolves to IPv4 addresses but `dns.resolve4()` throws an error with a `.code` property (e.g., `ENODATA`, `ENOTFOUND`, `EAI_AGAIN`) THEN the system returns `false` from `resolveAndCheck()` (allow the request to proceed)

1.2 WHEN a hostname has only IPv6 AAAA records and `dns.resolve4()` throws `ENODATA` THEN the system never calls `dns.resolve6()` and returns `false` (allow), permitting access to private IPv6 addresses like `::1` or `fd00::/8`

1.3 WHEN `dns.resolve6()` throws any error with a `.code` property THEN the system returns `false` (allow the request)

1.4 WHEN DNS resolution returns an empty array for both IPv4 and IPv6 THEN the system returns `false` (allow the request)

#### 2. IPv6 Address Parsing and Classification

2.1 WHEN a URL contains an IPv6 address in bracket notation like `http://[::1]/` THEN `URL.hostname` returns `[::1]` with brackets, and `ipv6ToBigInt('[::1]')` calls `BigInt(NaN)`, which throws an exception caught as "invalid URL format", blocking the request by accident rather than by correct classification

2.2 WHEN a URL contains an IPv4-mapped IPv6 address like `http://[::ffff:127.0.0.1]/` THEN the system attempts to parse it as a pure IPv6 address without extracting and checking the embedded IPv4 address against the IPv4 blocked ranges

2.3 WHEN a URL contains an IPv4-compatible IPv6 address like `http://[::192.168.1.1]/` THEN the embedded IPv4 address is not extracted or checked

2.4 WHEN a URL contains a 6to4 address (`2002::/16`) encoding a private IPv4 address THEN the embedded IPv4 address in bits 16-47 is not extracted or validated

2.5 WHEN a URL contains a NAT64 prefix address (`64:ff9b::/96`) THEN the embedded IPv4 address in the low 32 bits is not checked

#### 3. Missing Blocked Address Ranges

3.1 WHEN a URL resolves to or contains IPv4 address `192.0.0.0/24` (IETF protocol assignments) THEN the system does not block the request

3.2 WHEN a URL resolves to or contains IPv4 address in `198.18.0.0/15` (network benchmark testing) THEN the system does not block the request

3.3 WHEN a URL resolves to or contains IPv4 address in `224.0.0.0/4` (IPv4 multicast) THEN the system does not block the request

3.4 WHEN a URL resolves to or contains IPv4 address in `240.0.0.0/4` (reserved for future use) THEN the system does not block the request

3.5 WHEN a URL resolves to or contains IPv4 address `255.255.255.255` (limited broadcast) THEN the system does not block the request

3.6 WHEN a URL resolves to or contains IPv6 address in `ff00::/8` (IPv6 multicast) THEN the system does not block the request

3.7 WHEN a URL resolves to or contains IPv6 address `::/128` (unspecified address) THEN the system does not block the request

#### 4. DNS Rebinding / Time-of-Check-Time-of-Use (TOCTOU)

4.1 WHEN `resolveAndCheck()` resolves a hostname to a public IP and returns `false` (allow), and then Chromium resolves the same hostname again during connection and DNS returns a private IP (DNS rebinding attack) THEN the page loads content from the private IP address

4.2 WHEN a page makes subresource requests (images, scripts, XHR, fetch) to a hostname that was not checked during the initial URL validation THEN each subresource hostname is resolved independently by Chromium without pre-validation

#### 5. HTTP Redirects

5.1 WHEN a validated public URL returns an HTTP 301, 302, 307, or 308 redirect to a private, loopback, or metadata IP address THEN the redirect is followed without re-validation, allowing access to the blocked destination

5.2 WHEN a redirect chain contains multiple hops and any intermediate or final destination resolves to a blocked address THEN only the first hop is validated

#### 6. Non-HTTP Protocols

6.1 WHEN a page initiates a WebSocket connection (`ws://` or `wss://`) to a private or loopback IP address THEN `page.route('**/*', handler)` does not intercept WebSocket upgrade requests, allowing the connection

6.2 WHEN a page establishes a WebRTC peer connection that could leak internal IP addresses or connect to internal services THEN no Chromium launch flags disable WebRTC, and the connection proceeds

#### 7. Encoding Normalization Gaps

7.1 WHEN an IPv4 address is encoded as a single 32-bit integer (e.g., `http://2130706433/` for `127.0.0.1`) THEN `isValidIpAddress()` returns `false` because the address does not contain dots, and the address is not checked

7.2 WHEN an IPv4 address uses short form notation (e.g., `http://127.1/` for `127.0.0.1`) THEN the address is not recognized as an IP and not normalized

7.3 WHEN an IPv6 address contains percent-encoded zone IDs (e.g., `http://[fe80::1%25eth0]/`) THEN the zone ID is not stripped before classification

7.4 WHEN DNS returns an IP address in non-canonical form THEN the returned address string may not match the expected format for classification

---

### Expected Behavior (Correct)

#### 1. DNS Resolution Failures (Fail Closed)

2.1 WHEN a hostname resolution is attempted using `dns.lookup(host, { all: true, verbatim: true })` and the call throws any error (including `ENODATA`, `ENOTFOUND`, `EAI_AGAIN`, or any other DNS error) THEN the system SHALL block the request with reason "DNS resolution failed"

2.2 WHEN `dns.lookup()` returns an empty array (zero addresses resolved) THEN the system SHALL block the request with reason "hostname did not resolve to any address"

2.3 WHEN `dns.lookup()` returns multiple addresses (both IPv4 and IPv6) and ANY address in the returned array falls within a blocked range THEN the system SHALL block the request with reason "hostname resolves to blocked IP"

2.4 WHEN a hostname has only IPv6 AAAA records pointing to a blocked IPv6 address THEN the system SHALL block the request because `dns.lookup()` with `verbatim: true` returns both IPv4 and IPv6 addresses in the order returned by the OS resolver

#### 2. IPv6 Address Parsing and Classification

2.5 WHEN a URL contains an IPv6 address in bracket notation THEN the system SHALL strip the `[` and `]` characters from `URL.hostname` before classification

2.6 WHEN an IPv6 address is classified, the system SHALL use `net.isIP()` or an equivalent canonical parser to determine whether the address is IPv4, IPv6, or invalid

2.7 WHEN an IPv6 address matches the IPv4-mapped prefix `::ffff:0:0/96` THEN the system SHALL extract the embedded IPv4 address from the low 32 bits, convert it to dotted-decimal notation, and check it against the IPv4 blocked ranges

2.8 WHEN an IPv6 address matches the IPv4-compatible prefix `::/96` (excluding `::ffff:0:0/96`) THEN the system SHALL extract the embedded IPv4 address from the low 32 bits and check it against the IPv4 blocked ranges

2.9 WHEN an IPv6 address matches the 6to4 prefix `2002::/16` THEN the system SHALL extract bits 16-47 as the embedded IPv4 address and check it against the IPv4 blocked ranges

2.10 WHEN an IPv6 address matches the NAT64 prefix `64:ff9b::/96` THEN the system SHALL extract the low 32 bits as the embedded IPv4 address and check it against the IPv4 blocked ranges

#### 3. Complete Blocked Address Ranges

2.11 WHEN a URL resolves to or contains an IPv4 address in `192.0.0.0/24` THEN the system SHALL block the request with reason "blocked IP address"

2.12 WHEN a URL resolves to or contains an IPv4 address in `198.18.0.0/15` THEN the system SHALL block the request with reason "blocked IP address"

2.13 WHEN a URL resolves to or contains an IPv4 address in `224.0.0.0/4` THEN the system SHALL block the request with reason "blocked IP address"

2.14 WHEN a URL resolves to or contains an IPv4 address in `240.0.0.0/4` THEN the system SHALL block the request with reason "blocked IP address"

2.15 WHEN a URL resolves to or contains IPv4 address `255.255.255.255` THEN the system SHALL block the request with reason "blocked IP address"

2.16 WHEN a URL resolves to or contains an IPv6 address in `ff00::/8` THEN the system SHALL block the request with reason "blocked IP address"

2.17 WHEN a URL resolves to or contains IPv6 address `::/128` THEN the system SHALL block the request with reason "blocked IP address"

2.18 WHEN a URL hostname matches any cloud metadata hostname (`metadata.google.internal`, `metadata.azure.com`, `169.254.169.254`) THEN the system SHALL block the request with reason "cloud metadata endpoint blocked"

#### 4. DNS Pinning (TOCTOU Prevention)

2.19 WHEN an audit begins and the top-level URL hostname has been validated THEN the system SHALL establish a DNS-pinned browser context or connection path where all subsequent requests to that hostname can only reach the validated IP address(es)

2.20 WHEN a page makes a subresource request to any hostname (including the top-level host and any new host) THEN the system SHALL resolve the hostname, validate all returned addresses, and either block the request or pin the connection to the validated address(es)

2.21 WHEN Chromium attempts to resolve a hostname that has already been validated THEN the resolution SHALL be overridden or proxied such that only the validated IP address(es) can be reached, preventing DNS rebinding

#### 5. HTTP Redirects

2.22 WHEN a request returns an HTTP 301, 302, 307, or 308 redirect to a new URL THEN the system SHALL intercept the redirect in `page.route()`, resolve and validate the redirect target hostname, and block the redirect if any resolved address is in a blocked range

2.23 WHEN a redirect chain contains multiple hops THEN every hop SHALL be validated before being followed

#### 6. Non-HTTP Protocols

2.24 WHEN a page attempts to initiate a WebSocket connection (`ws://` or `wss://`) to a hostname THEN the system SHALL intercept the connection attempt, resolve and validate the hostname, and block the connection if any resolved address is in a blocked range

2.25 WHEN Chromium is launched for an audit THEN the system SHALL include launch flags to disable WebRTC (e.g., `--disable-webrtc`) to prevent WebRTC-based IP leaks and internal service access

#### 7. Canonical Address Normalization

2.26 WHEN an IPv4 address is provided in any textual encoding (dotted decimal, octal with `0` prefix, hexadecimal with `0x` prefix, single 32-bit decimal integer, or short form) THEN the system SHALL normalize the address to canonical binary form before classification

2.27 WHEN an IPv6 address contains a percent-encoded zone ID THEN the system SHALL strip the zone ID (everything from `%` onward) before classification

2.28 WHEN `dns.lookup()` returns IP addresses in string format THEN the system SHALL parse them with a canonical IP parser (e.g., `net.isIP()` and `ipaddr.js` or equivalent) to ensure correct classification regardless of string format

---

### Unchanged Behavior (Regression Prevention)

#### Existing API Contract

3.1 WHEN `RestrictiveSafeFetchPolicy` is instantiated and `shouldBlock(url)` is called THEN the system SHALL CONTINUE TO return `{ block: boolean; reason: string }` with the same type signature

3.2 WHEN `PermissiveSafeFetchPolicy` is instantiated for local MCP server use THEN the system SHALL CONTINUE TO allow `http://` and `https://` schemes and block all other schemes, while NOT applying private/loopback IP restrictions

3.3 WHEN `installSafeFetchPolicy(page, policy)` is called THEN the system SHALL CONTINUE TO install a `page.route('**/*', handler)` interceptor that calls `policy.shouldBlock()` and aborts blocked requests with `'blockedbyclient'`

3.4 WHEN a request is blocked by the policy THEN the system SHALL CONTINUE TO call `route.abort('blockedbyclient')` and NOT throw an exception for invalid abort codes

#### Existing Validation and Logging

3.5 WHEN a URL scheme is not `http:` or `https:` THEN the system SHALL CONTINUE TO block the request with reason "scheme not allowed: <scheme>"

3.6 WHEN a URL cannot be parsed by the `URL` constructor THEN the system SHALL CONTINUE TO block the request with reason "invalid URL format"

3.7 WHEN the `page.route()` handler throws an exception THEN the system SHALL CONTINUE TO call `route.abort('blockedbyclient').catch(() => undefined)` to handle cases where the route is already resolved

#### Integration with Audit Engine

3.8 WHEN `packages/core/src/audit.ts` calls `auditUrl()` with a URL THEN the system SHALL CONTINUE TO apply the safe-fetch policy before navigation without requiring changes to the audit-engine caller

3.9 WHEN blocked requests occur during an audit THEN the system SHALL CONTINUE TO record them in `RawAudit.blockedRequests` with the URL and reason, allowing the page to continue loading other resources

3.10 WHEN resource metering is active in `runner/resource-limits.ts` THEN the system SHALL CONTINUE TO count requests and bytes, with safe-fetch blocking happening independently

3.11 WHEN the audit guard in `audit-guard.ts` manages the audit lifecycle THEN the system SHALL CONTINUE TO work with the safe-fetch policy without requiring lifecycle changes

#### Test Suite Compatibility

3.12 WHEN the full `packages/core` test suite is run after safe-fetch replacement THEN all existing tests that do not specifically probe safe-fetch internals SHALL CONTINUE TO pass

3.13 WHEN integration tests in `packages/core/tests/` make requests that were previously allowed THEN those requests SHALL CONTINUE TO be allowed if they target public addresses or use `PermissiveSafeFetchPolicy`

3.14 WHEN unit tests mock the DNS resolver THEN the mocked resolver SHALL CONTINUE TO work with the new implementation, returning controlled address lists

