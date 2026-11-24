# Safe-Fetch SSRF Prevention Bugfix Design

## Overview

This design document specifies a complete replacement for `packages/core/src/runner/safe-fetch.ts` that closes seven critical SSRF vulnerabilities while preserving the existing API contract (`RestrictiveSafeFetchPolicy`, `PermissiveSafeFetchPolicy`, `installSafeFetchPolicy`). The fix implements defense-in-depth: DNS resolution is fail-closed, all IP encodings are normalized, DNS pinning prevents rebinding attacks, redirects are validated, and non-HTTP protocols are blocked.

The core architectural choice is **Option B: In-process HTTP(S) CONNECT proxy** that resolves hostnames, validates IPs, and establishes connections to validated addresses only. This provides a single enforcement point that naturally covers all requests (initial navigation, subresources, redirects, WebSockets) without per-URL Chromium flags.

## Glossary

- **SSRF (Server-Side Request Forgery)**: Vulnerability allowing an attacker to make the audit server request internal resources
- **DNS Rebinding**: TOCTOU attack where DNS returns different IPs at check-time vs use-time
- **DNS Pinning**: Associating a validated IP with a hostname for the duration of a session
- **IPv4-mapped IPv6**: IPv6 addresses in the form `::ffff:a.b.c.d` that encode IPv4 addresses
- **6to4 addressing**: IPv6 prefix `2002::/16` that embeds IPv4 addresses in bits 16-47
- **NAT64**: IPv6 prefix `64:ff9b::/96` that embeds IPv4 addresses in the low 32 bits
- **CONNECT proxy**: HTTP proxy method establishing a tunnel to a destination for HTTPS or other protocols
- **Fail-closed**: Security posture where errors result in denying access rather than allowing it
- **Canonical IP form**: Binary representation of an IP address independent of textual encoding
- **RestrictiveSafeFetchPolicy**: Policy for hosted auditor blocking private/loopback/metadata addresses
- **PermissiveSafeFetchPolicy**: Policy for local MCP server allowing private addresses, enforcing only scheme validation
- **SafeFetchPolicy interface**: `{ shouldBlock(url: string): Promise<{ block: boolean; reason: string }> }`

## Bug Details

### Bug Condition

The current implementation in `packages/core/src/runner/safe-fetch.ts` fails to block access to private networks, loopback addresses, and cloud metadata endpoints in seven distinct scenarios. The bug manifests when any of the following conditions hold:

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { url: string, dnsState: DNSState, encodingType: EncodingType }
  OUTPUT: boolean
  
  RETURN (
    // Category 1: DNS failures are allowed
    (dnsResolverThrowsError(input.url) AND currentBehavior = "allow") OR
    (dnsReturnsEmptyArray(input.url) AND currentBehavior = "allow") OR
    (dnsResolvesOnlyIPv6(input.url) AND dnsResolve4Throws(input.url) AND currentBehavior = "allow") OR
    
    // Category 2: IPv6 parsing issues
    (input.encodingType = "ipv6-brackets" AND ipv6ToBigInt(input.url.hostname) throws exception) OR
    (input.encodingType = "ipv4-mapped-ipv6" AND embeddedIPv4NotExtracted(input.url)) OR
    (input.encodingType = "6to4" AND embeddedIPv4NotValidated(input.url)) OR
    (input.encodingType = "nat64" AND embeddedIPv4NotValidated(input.url)) OR
    
    // Category 3: Missing blocked ranges
    (resolvedIP IN ["192.0.0.0/24", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4", 
                    "255.255.255.255", "ff00::/8", "::/128"] AND currentBehavior = "allow") OR
    
    // Category 4: DNS rebinding
    (checkTimeIP = "8.8.8.8" AND useTimeIP = "127.0.0.1" AND attackerControlsDNS(input.url)) OR
    
    // Category 5: Redirect to blocked address
    (initialURL = "http://attacker.com" AND redirectTarget = "http://127.0.0.1" AND 
     redirectNotValidated(input)) OR
    
    // Category 6: Non-HTTP protocols
    (input.url.scheme IN ["ws:", "wss:"] AND websocketNotBlocked(input)) OR
    (webrtcEnabled() AND webrtcLeaksInternalIPs()) OR
    
    // Category 7: Encoding normalization gaps
    (input.encodingType IN ["decimal-32bit", "short-form", "octal", "hex"] AND 
     notNormalizedToCanonical(input.url))
  )
END FUNCTION
```

### Examples

#### Category 1: DNS Resolution Failures (Fail Open)
```typescript
// Example 1.1: ENODATA on IPv4-only hostname with IPv6 blocked address
const url1 = "http://ipv6-only-private.example.com/"  // Resolves to [fe80::1]
// Current: dns.resolve4() throws ENODATA → returns false (allow)
// Expected: Block with reason "hostname resolves to blocked IP"

// Example 1.2: Empty resolution array
const url2 = "http://no-records.example.com/"
// Current: Both dns.resolve4() and dns.resolve6() return [] → returns false (allow)
// Expected: Block with reason "hostname did not resolve to any address"
```

#### Category 2: IPv6 Address Parsing
```typescript
// Example 2.1: Bracket notation causes exception
const url3 = "http://[::1]/"  // URL.hostname = "[::1]" (with brackets)
// Current: ipv6ToBigInt("[::1]") calls BigInt(NaN) → throws → "invalid URL format" (blocked by accident)
// Expected: Strip brackets, classify as ::1 loopback, block with reason "blocked IP address"

// Example 2.2: IPv4-mapped IPv6 not decomposed
const url4 = "http://[::ffff:127.0.0.1]/"
// Current: Treated as pure IPv6, low 32 bits not extracted for IPv4 range check
// Expected: Extract 127.0.0.1, classify as loopback, block with reason "blocked IP address"

// Example 2.3: 6to4 address embedding private IPv4
const url5 = "http://[2002:c0a8:0101::1]/"  // Encodes 192.168.1.1 in bits 16-47
// Current: Checked as IPv6 2002:c0a8:0101::1, not matched against 2002::/16 rule
// Expected: Extract 192.168.1.1 from bits 16-47, block as RFC 1918 private
```

#### Category 3: Missing Blocked Ranges
```typescript
// Example 3.1: IETF protocol assignments
const url6 = "http://192.0.0.8/"  // In 192.0.0.0/24
// Current: Not in BLOCKED_IPV4_RANGES → allowed
// Expected: Block with reason "blocked IP address"

// Example 3.2: Multicast address
const url7 = "http://224.0.0.251/"  // mDNS multicast
// Current: Not in BLOCKED_IPV4_RANGES → allowed
// Expected: Block with reason "blocked IP address"

// Example 3.3: IPv6 unspecified
const url8 = "http://[::0]/"
// Current: Not in BLOCKED_IPV6_PREFIXES → allowed
// Expected: Block with reason "blocked IP address"
```

#### Category 4: DNS Rebinding
```typescript
// Example 4.1: Time-of-check-time-of-use race
const url9 = "http://rebind.attacker.com/"
// Check time: dns.lookup() returns [8.8.8.8] → allowed
// Chromium navigates: DNS now returns [127.0.0.1] → page loads from loopback
// Expected: Pin to 8.8.8.8 so Chromium cannot reach 127.0.0.1
```

#### Category 5: HTTP Redirects
```typescript
// Example 5.1: Redirect to private address
const url10 = "http://evil.com/redirect"
// Initial URL validated: evil.com → 203.0.113.42 (public) → allowed
// Server returns: HTTP 302 Location: http://192.168.1.1/admin
// Current: Redirect followed without re-validation
// Expected: Intercept redirect, resolve 192.168.1.1, block with reason "blocked IP address"
```

#### Category 6: Non-HTTP Protocols
```typescript
// Example 6.1: WebSocket to loopback
const url11 = "http://evil.com/"  // Initial URL is public
// Page script: new WebSocket("ws://127.0.0.1:8080")
// Current: page.route() does not intercept WebSocket upgrade requests
// Expected: Proxy intercepts WebSocket CONNECT, blocks with reason "blocked IP address"
```

#### Category 7: Encoding Normalization
```typescript
// Example 7.1: 32-bit decimal integer
const url12 = "http://2130706433/"  // 127.0.0.1 as single decimal
// Current: isValidIpAddress() returns false (no dots) → not checked
// Expected: Normalize to 127.0.0.1, block as loopback

// Example 7.2: Short-form IPv4
const url13 = "http://127.1/"  // Short form for 127.0.0.1
// Current: Not recognized as IP address
// Expected: Normalize to 127.0.0.1, block as loopback

// Example 7.3: Octal encoding
const url14 = "http://0177.0.0.1/"  // 0177 (octal) = 127 (decimal)
// Current: Partial octal support in isValidIpAddress, but ipv4ToNumber may not handle correctly
// Expected: Normalize to 127.0.0.1, block as loopback
```

## Expected Behavior

### DNS Resolution Architecture (Addresses Category 1)

2.1 WHEN any hostname resolution is performed THEN the system SHALL use `dns.lookup(hostname, { all: true, verbatim: true })` instead of separate `dns.resolve4()` and `dns.resolve6()` calls, ensuring the OS resolver returns both IPv4 and IPv6 addresses in a single call

2.2 WHEN `dns.lookup()` throws any error (including `ENODATA`, `ENOTFOUND`, `EAI_AGAIN`, or any other DNS error code) THEN the system SHALL block the request with reason "DNS resolution failed" (fail-closed)

2.3 WHEN `dns.lookup()` returns an empty array (zero addresses) THEN the system SHALL block the request with reason "hostname did not resolve to any address"

2.4 WHEN `dns.lookup()` returns multiple addresses THEN the system SHALL iterate over all returned `{ address: string, family: 4 | 6 }` records and block the request if ANY address falls within a blocked range

2.5 WHEN a hostname has only IPv6 AAAA records pointing to a blocked IPv6 address THEN the system SHALL block the request because `dns.lookup()` with `all: true` and `verbatim: true` returns both address families

### IP Classification (Addresses Categories 2 and 3)

2.6 WHEN an IP address string must be parsed THEN the system SHALL use the `ipaddr.js` library (or equivalent canonical parser) with `ipaddr.process()` to normalize all encodings to canonical form before classification

2.7 WHEN an IPv6 address is received in bracket notation (e.g., `[::1]`) THEN the system SHALL strip the `[` and `]` characters before passing it to the IP parser

2.8 WHEN an IPv6 address is classified THEN the system SHALL check if it matches the IPv4-mapped prefix `::ffff:0:0/96` and if so, extract the embedded IPv4 address from the low 32 bits and validate it against IPv4 blocked ranges

2.9 WHEN an IPv6 address is classified THEN the system SHALL check if it matches the IPv4-compatible prefix `::/96` (excluding `::ffff:0:0/96`) and if so, extract the embedded IPv4 address from the low 32 bits and validate it against IPv4 blocked ranges

2.10 WHEN an IPv6 address is classified THEN the system SHALL check if it matches the 6to4 prefix `2002::/16` and if so, extract bits 16-47 as the embedded IPv4 address and validate it against IPv4 blocked ranges

2.11 WHEN an IPv6 address is classified THEN the system SHALL check if it matches the NAT64 prefix `64:ff9b::/96` and if so, extract the low 32 bits as the embedded IPv4 address and validate it against IPv4 blocked ranges

2.12 WHEN an IPv6 address contains a percent-encoded zone ID (e.g., `fe80::1%25eth0`) THEN the system SHALL strip the zone ID (everything from `%` onward) before classification

2.13 WHEN an IPv4 or IPv6 address is classified THEN the system SHALL check it against the complete blocked range list including all ranges from `security.md` PLUS the following additional ranges:

**Complete IPv4 Blocked Ranges:**
| Range | Description |
|-------|-------------|
| `127.0.0.0/8` | IPv4 loopback |
| `10.0.0.0/8` | RFC 1918 private |
| `172.16.0.0/12` | RFC 1918 private |
| `192.168.0.0/16` | RFC 1918 private |
| `169.254.0.0/16` | IPv4 link-local (APIPA) |
| `100.64.0.0/10` | IANA shared address (CGNAT) |
| `0.0.0.0/8` | "This" network |
| `192.0.0.0/24` | IETF protocol assignments |
| `198.18.0.0/15` | Network benchmark testing |
| `224.0.0.0/4` | IPv4 multicast |
| `240.0.0.0/4` | Reserved for future use |
| `255.255.255.255/32` | Limited broadcast |
| `169.254.169.254/32` | AWS EC2 metadata (explicit) |

**Complete IPv6 Blocked Ranges:**
| Range | Description |
|-------|-------------|
| `::1/128` | IPv6 loopback |
| `fe80::/10` | IPv6 link-local |
| `fc00::/7` | IPv6 unique local (ULA) |
| `::ffff:0:0/96` | IPv4-mapped IPv6 |
| `2002::/16` | 6to4 |
| `ff00::/8` | IPv6 multicast |
| `::/128` | Unspecified address |
| `fd00:ec2::254/128` | AWS EC2 metadata IPv6 |

**Cloud Metadata Hostnames (blocked before DNS resolution):**
- `metadata.google.internal`
- `metadata.azure.com`
- `169.254.169.254`

### DNS Pinning Strategy (Addresses Category 4)

**Chosen Architecture: Option B — In-Process HTTP(S) CONNECT Proxy**

2.14 WHEN an audit begins THEN the system SHALL launch Chromium with `--proxy-server=127.0.0.1:<proxy-port>` pointing to an in-process HTTP proxy server

2.15 WHEN the in-process proxy receives a CONNECT request for a hostname THEN the proxy SHALL:
  - Call `dns.lookup(hostname, { all: true, verbatim: true })`
  - Validate ALL returned addresses against the complete blocked range list
  - If any address is blocked, close the connection with an error
  - If all addresses are allowed, establish a TCP connection to one of the validated addresses
  - Tunnel the CONNECT stream to that validated IP address
  - Cache the hostname → validated-IP-set mapping for the duration of the audit

2.16 WHEN the proxy receives a subsequent CONNECT or HTTP request for a cached hostname THEN the proxy SHALL use the cached validated IP address(es) without calling `dns.lookup()` again (DNS pinning)

2.17 WHEN a page makes a subresource request (image, script, XHR, fetch) to any hostname THEN Chromium SHALL route the request through the proxy, and the proxy SHALL apply the same resolve-validate-connect flow

2.18 WHEN the audit completes or times out THEN the system SHALL close the in-process proxy server and clear all hostname-to-IP caches

**Justification for Option B:**
- **Single enforcement point:** All requests (HTTP, HTTPS, WebSocket upgrades, redirects) flow through the proxy
- **Natural DNS pinning:** The proxy resolves once per hostname and reuses the validated IP
- **Redirect coverage:** HTTP redirects are followed by Chromium, but the proxy validates the redirect target hostname when Chromium makes the new request
- **WebSocket support:** WebSocket upgrades use CONNECT under the hood, automatically validated by the proxy
- **No per-URL Chromium flags:** Avoids `--host-resolver-rules` complexity and 100-entry limits
- **Integration simplicity:** Existing `page.route()` handler in `installSafeFetchPolicy()` can be removed or simplified to only record blocked requests for `RawAudit.blockedRequests`

**Integration with `audit-guard.ts`:**
2.19 WHEN the proxy server fails to start (port collision, OS error) THEN the system SHALL call `guard.fail(new Error("proxy startup failed: <reason>"))` before browser acquisition

2.20 WHEN a DNS resolution inside the proxy times out (exceeds 5 seconds per `security.md`) THEN the proxy SHALL close the connection and log the timeout, but SHALL NOT call `guard.fail()` (individual request failures do not abort the audit)

2.21 WHEN the browser disconnects or crashes THEN `audit-guard.ts` SHALL call `guard.fail()` as it does today, and the audit cleanup SHALL close the proxy server

**Integration with `resource-limits.ts`:**
2.22 WHEN the proxy tunnels a CONNECT stream THEN the proxy SHALL NOT meter bytes transferred through the tunnel (to avoid double-counting with Playwright's resource tracking)

2.23 WHEN the proxy blocks a request THEN the proxy SHALL record the blocked URL and reason in a shared array, which is merged into `RawAudit.blockedRequests` at audit assembly time

### Redirect Validation (Addresses Category 5)

2.24 WHEN Chromium receives an HTTP 301, 302, 307, or 308 redirect response THEN Chromium SHALL make a new request to the redirect target URL, which SHALL be routed through the in-process proxy

2.25 WHEN the proxy receives a CONNECT or HTTP request for the redirect target hostname THEN the proxy SHALL resolve and validate the target hostname exactly as it does for initial requests (clause 2.15)

2.26 WHEN a redirect target resolves to a blocked address THEN the proxy SHALL close the connection, Chromium SHALL fail the redirect, and the blocked URL and reason SHALL be recorded in `RawAudit.blockedRequests`

**Testing Strategy:**
- Create a local Node.js HTTP server on a random port that returns `HTTP 302` with `Location: http://127.0.0.1:1234/admin`
- Audit the server's public-facing URL
- Assert that the redirect to `127.0.0.1` is blocked and recorded in `RawAudit.blockedRequests`

### Non-HTTP Protocol Blocking (Addresses Category 6)

2.27 WHEN a page script attempts to open a WebSocket connection (`new WebSocket("ws://...")` or `new WebSocket("wss://...")`) THEN Chromium SHALL send a CONNECT request to the proxy for the WebSocket hostname

2.28 WHEN the proxy receives a CONNECT request (regardless of the target protocol) THEN the proxy SHALL apply the same resolve-validate-connect flow (clause 2.15), blocking WebSocket connections to private addresses

2.29 WHEN Chromium is launched for an audit THEN the system SHALL include the launch argument `--disable-webrtc` to prevent WebRTC peer connections that could leak internal IP addresses or access internal services

**Note:** The `--disable-webrtc` flag is a defense-in-depth measure. The primary protection is the proxy. If a future Chromium version removes or ignores this flag, the proxy still blocks internal access.

### Encoding Normalization (Addresses Category 7)

2.30 WHEN a URL hostname is an IPv4 address in any textual encoding (dotted decimal, octal with `0` prefix, hexadecimal with `0x` prefix, single 32-bit integer, or short form like `127.1`) THEN `ipaddr.js` with `ipaddr.process()` SHALL normalize the address to canonical binary form before classification

2.31 WHEN a URL hostname is a single 32-bit decimal integer (e.g., `2130706433` for `127.0.0.1`) THEN the system SHALL detect this case by checking `!hostname.includes('.')` and `!hostname.includes(':')` and `parseInt(hostname, 10)` is a valid 32-bit integer, convert it to dotted-decimal form, and pass it to `ipaddr.process()`

2.32 WHEN a URL hostname is a short-form IPv4 address (e.g., `127.1` for `127.0.0.1`) THEN `ipaddr.process()` SHALL recognize and normalize it, or the system SHALL use `net.isIPv4()` and `dns.lookup()` to resolve the canonical form

2.33 WHEN DNS returns IP addresses in string format THEN the system SHALL pass each returned `address` string directly to `ipaddr.process()` for classification, ensuring octal, hex, and other encodings are normalized

### Policy Modes (Preserves Existing API)

2.34 WHEN `RestrictiveSafeFetchPolicy` is instantiated and used THEN the policy SHALL apply all blocked ranges from clause 2.13 and all DNS pinning and validation rules from clauses 2.1–2.33

2.35 WHEN `PermissiveSafeFetchPolicy` is instantiated for local MCP server use THEN the policy SHALL:
  - Allow `http://` and `https://` schemes
  - Block all other schemes with reason "scheme not allowed: <scheme>"
  - NOT apply private/loopback IP restrictions (allow `127.0.0.1`, `::1`, `10.0.0.0/8`, etc.)
  - NOT use the in-process proxy (direct connection)

2.36 WHEN `installSafeFetchPolicy(page, policy)` is called with a `RestrictiveSafeFetchPolicy` THEN the system SHALL start the in-process proxy, launch Chromium with `--proxy-server`, and pass the policy to the proxy for validation logic

2.37 WHEN `installSafeFetchPolicy(page, policy)` is called with a `PermissiveSafeFetchPolicy` THEN the system SHALL skip proxy setup and install a minimal `page.route()` handler that only blocks non-http(s) schemes

2.38 WHEN a request is blocked by the proxy or policy THEN the system SHALL record `{ url: string, reason: string }` in an array that is merged into `RawAudit.blockedRequests` during audit assembly

### Defense in Depth (Documentation Requirement)

2.39 WHEN the hosted `apps/web` service is deployed THEN the deployment guide (`apps/web/DEPLOY.md`, to be created) SHALL document egress firewall rules that block outbound connections from the container to private IP ranges, cloud metadata endpoints, and loopback addresses

2.40 WHEN egress firewall rules are configured THEN the firewall SHALL block outbound traffic to all ranges listed in clause 2.13, providing defense-in-depth even if the application-level guard fails

**Example Docker deployment with egress rules (documented in DEPLOY.md):**
```yaml
# docker-compose.yml excerpt
services:
  web:
    image: the-unseen:latest
    networks:
      - restricted
    # Outbound traffic policy enforced by Docker network

networks:
  restricted:
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16
    # Firewall rules applied via iptables or cloud provider security groups
```

## Hypothesized Root Cause

Based on the seven vulnerability categories, the root causes are:

### 1. DNS Resolution Design Flaw

**Root Cause:** The current implementation uses separate `dns.resolve4()` and `dns.resolve6()` calls with error handling that returns `false` (allow) when either call throws an error with a `.code` property. This design assumes that DNS errors indicate a non-existent hostname that should be allowed to fail naturally at the browser level.

**Why This Is Wrong:** DNS errors can indicate transient failures (`EAI_AGAIN`), misconfiguration, or the presence of only one address family (AAAA-only hosts throw `ENODATA` for `resolve4()`). An attacker can exploit this by creating an IPv6-only hostname pointing to `::1` or `fe80::1`, knowing the `resolve4()` call will throw and the system will allow the request.

### 2. IPv6 Parsing Incompleteness

**Root Cause:** The `ipv6ToBigInt()` function uses string manipulation (`.split('::')`, `.split(':')`) to parse IPv6 addresses, but does not handle bracket notation, does not extract embedded IPv4 addresses from IPv4-mapped or 6to4 addresses, and throws exceptions on invalid input that are caught as "invalid URL format" rather than being classified correctly.

**Why This Is Wrong:** IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) are explicitly designed to allow IPv4 addresses to be represented in IPv6 contexts. If the low 32 bits are not extracted and checked against IPv4 blocked ranges, an attacker can bypass the IPv4 loopback check by encoding it as IPv6. Similarly, 6to4 addresses encode IPv4 addresses in bits 16-47, and NAT64 addresses encode them in the low 32 bits.

### 3. Incomplete Blocked Range List

**Root Cause:** The `BLOCKED_IPV4_RANGES` and `BLOCKED_IPV6_PREFIXES` constants were initialized with the most common private and loopback ranges from `security.md`, but several IANA-reserved and special-use ranges were omitted (192.0.0.0/24, 198.18.0.0/15, multicast, reserved, broadcast, unspecified).

**Why This Is Wrong:** While these ranges are less commonly used in SSRF attacks, they represent internal or non-routable addresses that should not be accessible to an auditor. For example, `224.0.0.0/4` (multicast) could be used to probe mDNS services on the local network, and `192.0.0.0/24` is used for IETF protocol assignments that may expose internal services.

### 4. No DNS Pinning or TOCTOU Protection

**Root Cause:** The current implementation resolves a hostname once in `resolveAndCheck()` and then passes the hostname (not the resolved IP) to Chromium via `page.goto()`. Chromium performs its own DNS resolution, which may return a different IP if the attacker controls DNS and changes the response between check-time and use-time.

**Why This Is Wrong:** DNS rebinding is a well-known SSRF bypass technique. An attacker sets a short TTL on a DNS record, returns a public IP during validation, and returns a private IP when the browser connects. The fix requires pinning the validated IP and ensuring Chromium can only reach that IP.

### 5. Redirect Targets Not Validated

**Root Cause:** The `page.route()` handler in `installSafeFetchPolicy()` intercepts requests and checks the URL against the policy, but HTTP redirects (301, 302, 307, 308) are followed by Chromium as new requests. The handler sees the redirect target URL, but the hostname is not re-resolved or re-validated—only the initial URL's hostname was checked.

**Why This Is Wrong:** An attacker can serve a public URL that returns a redirect to `http://127.0.0.1/admin`. The initial URL passes validation, but the redirect target is not checked, allowing access to the loopback address.

### 6. Non-HTTP Protocols Not Intercepted

**Root Cause:** The `page.route()` handler intercepts `http:` and `https:` requests but does not intercept WebSocket upgrade requests (`ws:`, `wss:`). WebRTC is not disabled via Chromium launch flags.

**Why This Is Wrong:** WebSocket connections begin as HTTP(S) requests with an `Upgrade: websocket` header, but Playwright's `page.route()` does not intercept them. If a page script opens a WebSocket to `ws://127.0.0.1:8080`, the connection proceeds without validation. WebRTC can leak internal IP addresses via STUN and may allow peer connections to internal services.

### 7. Encoding Normalization Gaps

**Root Cause:** The `isValidIpAddress()` and `ipv4ToNumber()` functions handle dotted-decimal, octal, and hex encodings for multi-part IPv4 addresses, but do not handle single 32-bit integer encodings (`http://2130706433/`) or short-form IPs (`http://127.1/`). These cases fall through to `resolveAndCheck()` as hostnames, which may allow them if DNS resolution fails.

**Why This Is Wrong:** Browsers and URL parsers normalize many IP encodings that the current code does not recognize. If `http://2130706433/` (which represents `127.0.0.1`) is not recognized as an IP address, it is treated as a hostname, `dns.lookup()` fails, and the error handler allows the request.

## Correctness Properties

Property 1: Bug Condition - SSRF Blocking Completeness

_For any_ URL input where the hostname resolves to or is encoded as an IP address in any blocked range (loopback, private, link-local, metadata, multicast, reserved, unspecified) OR where DNS resolution fails OR where a redirect target resolves to a blocked address, the fixed safe-fetch implementation SHALL block the request with a descriptive reason and SHALL NOT allow any request to reach a blocked address.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.21, 2.22, 2.23, 2.24, 2.25, 2.26, 2.27, 2.28, 2.29, 2.30, 2.31, 2.32, 2.33**

Property 2: Preservation - API Contract and Non-Buggy Request Handling

_For any_ URL input where the hostname resolves to a public, routable address AND the scheme is `http:` or `https:` AND DNS resolution succeeds AND no redirects target blocked addresses, the fixed implementation SHALL produce the same `{ block: boolean; reason: string }` result as the original implementation for the `RestrictiveSafeFetchPolicy` and `PermissiveSafeFetchPolicy` classes, preserving the existing API contract and audit behavior for legitimate public URLs.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14**

## Fix Implementation

### Changes Required

The fix involves a complete rewrite of `packages/core/src/runner/safe-fetch.ts` while preserving the exported API surface. The new implementation consists of:

**File:** `packages/core/src/runner/safe-fetch.ts`

**Modules to Add:**
1. **DNS Resolution Module:** Uses `dns.lookup({ all: true, verbatim: true })` with fail-closed error handling
2. **IP Classification Module:** Uses `ipaddr.js` for canonical parsing, embedded IPv4 extraction, complete blocked range checks
3. **In-Process Proxy Server:** HTTP(S) CONNECT proxy that resolves, validates, and pins hostnames to validated IPs
4. **Policy Classes:** Rewritten `RestrictiveSafeFetchPolicy` and `PermissiveSafeFetchPolicy` to integrate with the proxy
5. **Installation Function:** `installSafeFetchPolicy()` starts the proxy for restrictive mode, skips it for permissive mode

**Dependencies to Add:**
```json
// packages/core/package.json
{
  "dependencies": {
    "ipaddr.js": "^2.2.0"  // Canonical IP parsing and classification
  }
}
```

**High-Level Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Audit Flow                                   │
└─────────────────────────────────────────────────────────────────────────┘

audit.ts (auditUrl)
    │
    ├─► selectPolicy(options) → RestrictiveSafeFetchPolicy | PermissiveSafeFetchPolicy
    │
    ├─► policy.shouldBlock(url) → Pre-check before browser acquisition
    │       │
    │       └─► If Restrictive: resolve + validate top-level URL
    │           If blocked: throw SsrfBlockedError
    │
    ├─► Acquire browser from pool
    │
    ├─► installSafeFetchPolicy(page, policy)
    │       │
    │       ├─► If Restrictive:
    │       │      ├─► Start in-process proxy on random port
    │       │      ├─► Launch Chromium with --proxy-server=127.0.0.1:<port>
    │       │      └─► Proxy handles all CONNECT/HTTP requests:
    │       │              dns.lookup() → validate IPs → tunnel to validated IP
    │       │
    │       └─► If Permissive:
    │              └─► Install page.route() handler that only blocks non-http(s) schemes
    │
    ├─► page.goto(url) → All requests flow through proxy (Restrictive) or direct (Permissive)
    │       │
    │       ├─► Initial request validated by proxy
    │       ├─► Subresource requests (images, scripts) validated by proxy
    │       ├─► Redirects: Chromium makes new request → proxy validates redirect target
    │       └─► WebSocket upgrades: CONNECT request → proxy validates
    │
    ├─► Collect evidence (AX tree, axe, Tab walk)
    │
    └─► Assemble RawAudit with blockedRequests from proxy log
```

**Proxy Flow (Restrictive Mode):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      In-Process Proxy (CONNECT Handler)                 │
└─────────────────────────────────────────────────────────────────────────┘

Client (Chromium) sends: CONNECT example.com:443 HTTP/1.1
    │
    ├─► Check hostname cache: example.com → cached IPs?
    │      │
    │      ├─► If cached: use cached validated IPs
    │      │
    │      └─► If not cached:
    │             ├─► dns.lookup(example.com, { all: true, verbatim: true })
    │             │      │
    │             │      ├─► Throws error? → Close connection, log "DNS resolution failed"
    │             │      ├─► Returns []? → Close connection, log "hostname did not resolve"
    │             │      │
    │             │      └─► Returns [{ address, family }]
    │             │             │
    │             │             └─► For each address:
    │             │                    ├─► ipaddr.process(address) → canonical form
    │             │                    ├─► If IPv6: check for embedded IPv4 (::ffff, 6to4, NAT64)
    │             │                    ├─► Check against complete blocked range list
    │             │                    └─► If ANY address is blocked:
    │             │                           → Close connection, log "hostname resolves to blocked IP"
    │             │
    │             └─► Cache: example.com → [validated IPs]
    │
    ├─► Establish TCP connection to one of the validated IPs (port from CONNECT request)
    │
    ├─► Reply: HTTP/1.1 200 Connection established
    │
    └─► Tunnel: Bidirectional stream between client and validated IP
```

### Specific Changes

#### 1. DNS Resolution Module

**New Function:**
```typescript
import { lookup } from 'dns/promises'
import { ipaddr } from 'ipaddr.js'

interface ResolvedAddress {
  address: string   // IP address string (e.g., "192.0.2.1" or "2001:db8::1")
  family: 4 | 6     // Address family
  canonical: ipaddr.IPv4 | ipaddr.IPv6  // Parsed canonical form
}

async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  // Fail-closed: any error blocks the request
  let results: Array<{ address: string; family: 4 | 6 }>
  try {
    results = await lookup(hostname, { all: true, verbatim: true })
  } catch (err) {
    throw new Error(`DNS resolution failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (results.length === 0) {
    throw new Error('hostname did not resolve to any address')
  }

  return results.map((r) => ({
    address: r.address,
    family: r.family,
    canonical: ipaddr.process(r.address),  // Normalize to canonical form
  }))
}
```

#### 2. IP Classification Module

**New Functions:**
```typescript
import { ipaddr } from 'ipaddr.js'

// Complete blocked ranges (clause 2.13)
const BLOCKED_IPV4_RANGES = [
  { name: 'loopback', cidr: '127.0.0.0/8' },
  { name: 'rfc1918-10', cidr: '10.0.0.0/8' },
  { name: 'rfc1918-172', cidr: '172.16.0.0/12' },
  { name: 'rfc1918-192', cidr: '192.168.0.0/16' },
  { name: 'link-local', cidr: '169.254.0.0/16' },
  { name: 'cgnat', cidr: '100.64.0.0/10' },
  { name: 'this-network', cidr: '0.0.0.0/8' },
  { name: 'ietf-protocol', cidr: '192.0.0.0/24' },
  { name: 'benchmark', cidr: '198.18.0.0/15' },
  { name: 'multicast', cidr: '224.0.0.0/4' },
  { name: 'reserved', cidr: '240.0.0.0/4' },
  { name: 'broadcast', cidr: '255.255.255.255/32' },
  { name: 'ec2-metadata', cidr: '169.254.169.254/32' },
]

const BLOCKED_IPV6_RANGES = [
  { name: 'loopback', cidr: '::1/128' },
  { name: 'link-local', cidr: 'fe80::/10' },
  { name: 'unique-local', cidr: 'fc00::/7' },
  { name: 'ipv4-mapped', cidr: '::ffff:0:0/96' },
  { name: '6to4', cidr: '2002::/16' },
  { name: 'multicast', cidr: 'ff00::/8' },
  { name: 'unspecified', cidr: '::/128' },
  { name: 'ec2-metadata-v6', cidr: 'fd00:ec2::254/128' },
]

function isBlockedIPv4(ip: ipaddr.IPv4): { blocked: boolean; range?: string } {
  for (const range of BLOCKED_IPV4_RANGES) {
    const [cidrAddr, bits] = range.cidr.split('/')
    const cidr = ipaddr.parseCIDR(`${cidrAddr}/${bits}`)
    if (ip.match(cidr)) {
      return { blocked: true, range: range.name }
    }
  }
  return { blocked: false }
}

function isBlockedIPv6(ip: ipaddr.IPv6): { blocked: boolean; range?: string } {
  // Check standard IPv6 ranges
  for (const range of BLOCKED_IPV6_RANGES) {
    const [cidrAddr, bits] = range.cidr.split('/')
    const cidr = ipaddr.parseCIDR(`${cidrAddr}/${bits}`)
    if (ip.match(cidr)) {
      return { blocked: true, range: range.name }
    }
  }

  // Extract embedded IPv4 from IPv4-mapped (::ffff:a.b.c.d)
  if (ip.isIPv4MappedAddress()) {
    const embedded = ip.toIPv4Address()
    return isBlockedIPv4(embedded)
  }

  // Extract embedded IPv4 from 6to4 (2002:AABB:CCDD::/48 where AABBCCDD is IPv4)
  if (ip.match(ipaddr.parseCIDR('2002::/16'))) {
    const parts = ip.parts  // [0x2002, 0xAABB, 0xCCDD, ...]
    const ipv4Num = (parts[1] << 16) | parts[2]
    const a = (ipv4Num >> 24) & 0xff
    const b = (ipv4Num >> 16) & 0xff
    const c = (ipv4Num >> 8) & 0xff
    const d = ipv4Num & 0xff
    const embedded = ipaddr.parse(`${a}.${b}.${c}.${d}`)
    return isBlockedIPv4(embedded as ipaddr.IPv4)
  }

  // Extract embedded IPv4 from NAT64 (64:ff9b::a.b.c.d)
  if (ip.match(ipaddr.parseCIDR('64:ff9b::/96'))) {
    const parts = ip.parts  // [0x64, 0xff9b, 0, 0, 0, 0, 0xAABB, 0xCCDD]
    const ipv4Num = (parts[6] << 16) | parts[7]
    const a = (ipv4Num >> 24) & 0xff
    const b = (ipv4Num >> 16) & 0xff
    const c = (ipv4Num >> 8) & 0xff
    const d = ipv4Num & 0xff
    const embedded = ipaddr.parse(`${a}.${b}.${c}.${d}`)
    return isBlockedIPv4(embedded as ipaddr.IPv4)
  }

  return { blocked: false }
}

function classifyAddress(canonical: ipaddr.IPv4 | ipaddr.IPv6): { blocked: boolean; reason: string } {
  if (canonical.kind() === 'ipv4') {
    const result = isBlockedIPv4(canonical)
    if (result.blocked) {
      return { blocked: true, reason: `blocked IP address (${result.range})` }
    }
  } else {
    const result = isBlockedIPv6(canonical)
    if (result.blocked) {
      return { blocked: true, reason: `blocked IP address (${result.range})` }
    }
  }
  return { blocked: false, reason: '' }
}
```

#### 3. In-Process Proxy Server

**New Class:**
```typescript
import * as http from 'http'
import * as net from 'net'

interface ProxyOptions {
  policy: SafeFetchPolicy
  blockedLog: Array<{ url: string; reason: string }>
}

class SsrfGuardProxy {
  private server: http.Server
  private port: number = 0
  private hostnameCache = new Map<string, ResolvedAddress[]>()
  private readonly policy: SafeFetchPolicy
  private readonly blockedLog: Array<{ url: string; reason: string }>

  constructor(options: ProxyOptions) {
    this.policy = options.policy
    this.blockedLog = options.blockedLog
    this.server = http.createServer()
    this.server.on('connect', this.handleConnect.bind(this))
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address()
        if (!addr || typeof addr === 'string') {
          return reject(new Error('Proxy server has no port'))
        }
        this.port = addr.port
        resolve(this.port)
      })
    })
  }

  async stop(): Promise<void> {
    this.hostnameCache.clear()
    return new Promise((resolve) => {
      this.server.close(() => resolve())
    })
  }

  private async handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): Promise<void> {
    const url = `https://${req.url}/`  // CONNECT target is "hostname:port"
    let hostname: string
    let port: number
    try {
      const parsed = new URL(url)
      hostname = parsed.hostname.replace(/^\[|\]$/g, '')  // Strip brackets from IPv6
      port = parseInt(parsed.port, 10)
    } catch {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      clientSocket.end()
      this.blockedLog.push({ url, reason: 'invalid CONNECT target' })
      return
    }

    // Resolve and validate
    let addresses: ResolvedAddress[]
    try {
      if (this.hostnameCache.has(hostname)) {
        addresses = this.hostnameCache.get(hostname)!
      } else {
        addresses = await resolveHostname(hostname)
        // Check if ANY address is blocked
        for (const addr of addresses) {
          const classification = classifyAddress(addr.canonical)
          if (classification.blocked) {
            clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
            clientSocket.end()
            this.blockedLog.push({ url, reason: classification.reason })
            return
          }
        }
        this.hostnameCache.set(hostname, addresses)
      }
    } catch (err) {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      clientSocket.end()
      const reason = err instanceof Error ? err.message : String(err)
      this.blockedLog.push({ url, reason })
      return
    }

    // Connect to first validated address
    const targetIp = addresses[0].address
    const serverSocket = net.connect(port, targetIp, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      serverSocket.write(head)
      serverSocket.pipe(clientSocket)
      clientSocket.pipe(serverSocket)
    })

    serverSocket.on('error', () => {
      clientSocket.end()
    })
  }
}
```

#### 4. Rewritten Policy Classes

**Updated `RestrictiveSafeFetchPolicy`:**
```typescript
export class RestrictiveSafeFetchPolicy implements SafeFetchPolicy {
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { block: true, reason: `scheme not allowed: ${parsed.protocol}` }
      }

      // Cloud metadata hostname check (before DNS resolution)
      const CLOUD_METADATA_HOSTNAMES = ['metadata.google.internal', 'metadata.azure.com', '169.254.169.254']
      if (CLOUD_METADATA_HOSTNAMES.includes(parsed.hostname)) {
        return { block: true, reason: 'cloud metadata endpoint blocked' }
      }

      // If hostname is an IP address, classify it directly
      let canonical: ipaddr.IPv4 | ipaddr.IPv6
      try {
        const stripped = parsed.hostname.replace(/^\[|\]$/g, '')  // Strip brackets
        canonical = ipaddr.process(stripped)
        const classification = classifyAddress(canonical)
        if (classification.blocked) {
          return { block: true, reason: classification.reason }
        }
        return { block: false, reason: '' }
      } catch {
        // Not a direct IP, resolve as hostname
      }

      // Resolve hostname and validate all addresses
      const addresses = await resolveHostname(parsed.hostname)
      for (const addr of addresses) {
        const classification = classifyAddress(addr.canonical)
        if (classification.blocked) {
          return { block: true, reason: classification.reason }
        }
      }

      return { block: false, reason: '' }
    } catch (err) {
      return { block: true, reason: err instanceof Error ? err.message : String(err) }
    }
  }
}
```

**Updated `PermissiveSafeFetchPolicy`:**
```typescript
export class PermissiveSafeFetchPolicy implements SafeFetchPolicy {
  async shouldBlock(url: string): Promise<{ block: boolean; reason: string }> {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { block: true, reason: `scheme not allowed: ${parsed.protocol}` }
      }
      return { block: false, reason: '' }
    } catch {
      return { block: true, reason: 'invalid URL format' }
    }
  }
}
```

#### 5. Rewritten `installSafeFetchPolicy()`

**Updated Function:**
```typescript
export function installSafeFetchPolicy(page: Page, policy: SafeFetchPolicy): {
  proxy?: SsrfGuardProxy
  cleanup: () => Promise<void>
} {
  const blockedLog: Array<{ url: string; reason: string }> = []

  if (policy instanceof RestrictiveSafeFetchPolicy) {
    // Start in-process proxy
    const proxy = new SsrfGuardProxy({ policy, blockedLog })
    // Proxy.start() is called in browser.ts before launching Chromium with --proxy-server
    return {
      proxy,
      cleanup: async () => {
        await proxy.stop()
      },
    }
  } else {
    // Permissive mode: install minimal page.route() handler
    page.route('**/*', async (route) => {
      try {
        const url = route.request().url()
        const { block } = await policy.shouldBlock(url)
        if (block) {
          await route.abort('blockedbyclient')
        } else {
          await route.continue()
        }
      } catch {
        await route.abort('blockedbyclient').catch(() => undefined)
      }
    })

    return {
      cleanup: async () => {
        // No proxy to stop
      },
    }
  }
}
```

#### 6. Integration with `browser.ts`

**Changes to `PageLoader.loadPage()`:**
```typescript
// In packages/core/src/runner/browser.ts

async loadPage(
  context: BrowserContext,
  url: string,
  policy: SafeFetchPolicy,
  options: AuditOptions,
  onPageCreated?: (page: Page) => Promise<void>
): Promise<LoadedPage> {
  const { proxy, cleanup } = installSafeFetchPolicy(page, policy)

  // If restrictive mode, start proxy and configure Chromium
  if (proxy) {
    const proxyPort = await proxy.start()
    // Re-launch context with proxy (or launch browser with --proxy-server initially)
    // This requires refactoring browser.ts to accept proxy options
  }

  try {
    const page = await context.newPage()
    if (onPageCreated) await onPageCreated(page)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    // ... rest of page load logic
  } finally {
    await cleanup()
  }
}
```

**Note:** The exact integration point depends on whether the proxy can be started before `context.newPage()` or requires `browser.newContext()` with `--proxy-server` launch args. The design should minimize changes to `browser.ts` by handling proxy lifecycle in `safe-fetch.ts`.

#### 7. WebRTC Disabling

**Changes to `browser.ts`:**
```typescript
// In chromium.launch() call
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-webrtc',  // Disable WebRTC to prevent IP leaks
    // ... other args
  ],
})
```

## Testing Strategy

### Validation Approach

The testing strategy follows a three-phase approach:

1. **Exploratory Bug Condition Checking**: Write tests that demonstrate each of the 7 vulnerability categories on the UNFIXED code, confirming root causes and surfacing counterexamples
2. **Fix Checking**: Verify that the fixed implementation blocks all inputs where the bug condition holds
3. **Preservation Checking**: Verify that legitimate public URLs continue to be allowed and the API contract is preserved

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples that demonstrate each vulnerability category BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan:** Write unit tests for each vulnerability category that run against the UNFIXED `safe-fetch.ts`. Each test asserts the WRONG (vulnerable) behavior to confirm the bug exists.

**Test Cases:**

1. **Category 1: DNS Resolution Failures (Fail Open)**
   - **Test 1.1:** Mock `dns.resolve4()` to throw `ENODATA`, assert `resolveAndCheck()` returns `false` (allow)
   - **Test 1.2:** Mock `dns.resolve6()` to throw `ENODATA`, assert `resolveAndCheck()` returns `false` (allow)
   - **Test 1.3:** Mock both `resolve4()` and `resolve6()` to return empty arrays, assert returns `false` (allow)
   - **Expected Counterexamples:** All three tests pass on unfixed code (confirming fail-open behavior)

2. **Category 2: IPv6 Address Parsing**
   - **Test 2.1:** Call `ipv6ToBigInt("[::1]")`, assert it throws (exception caught as "invalid URL format")
   - **Test 2.2:** Create URL `http://[::ffff:127.0.0.1]/`, assert `shouldBlock()` returns `{ block: false }` (embedded IPv4 not extracted)
   - **Test 2.3:** Create URL `http://[2002:c0a8:0101::1]/`, assert `shouldBlock()` returns `{ block: false }` (6to4 IPv4 not extracted)
   - **Expected Counterexamples:** All tests pass on unfixed code (confirming parsing gaps)

3. **Category 3: Missing Blocked Ranges**
   - **Test 3.1:** Call `shouldBlock("http://192.0.0.8/")`, assert returns `{ block: false }` (192.0.0.0/24 not blocked)
   - **Test 3.2:** Call `shouldBlock("http://224.0.0.251/")`, assert returns `{ block: false }` (multicast not blocked)
   - **Test 3.3:** Call `shouldBlock("http://[::0]/")`, assert returns `{ block: false }` (unspecified not blocked)
   - **Expected Counterexamples:** All tests pass on unfixed code (confirming missing ranges)

4. **Category 4: DNS Rebinding**
   - **Test 4.1:** Mock DNS to return `8.8.8.8` on first call, `127.0.0.1` on second call; call `shouldBlock()` once (gets `8.8.8.8`, allows), then simulate Chromium navigation (gets `127.0.0.1`, proceeds)
   - **Expected Counterexample:** Unfixed code has no pinning, so the second DNS response allows access to loopback

5. **Category 5: HTTP Redirects**
   - **Test 5.1:** Start a local test server on a random port that returns `HTTP 302` with `Location: http://127.0.0.1:1234/`; call `auditUrl()` with the test server URL; assert that the audit navigates to `127.0.0.1` (redirect not blocked)
   - **Expected Counterexample:** Unfixed code follows the redirect without validation

6. **Category 6: Non-HTTP Protocols**
   - **Test 6.1:** Create a page that opens `new WebSocket("ws://127.0.0.1:8080")`; audit the page; assert that the WebSocket connection proceeds (not blocked)
   - **Test 6.2:** Check Chromium launch args; assert `--disable-webrtc` is NOT present
   - **Expected Counterexamples:** Unfixed code does not block WebSocket or disable WebRTC

7. **Category 7: Encoding Normalization**
   - **Test 7.1:** Call `shouldBlock("http://2130706433/")`, assert returns `{ block: false }` (32-bit decimal not normalized)
   - **Test 7.2:** Call `shouldBlock("http://127.1/")`, assert returns `{ block: false }` (short form not normalized)
   - **Test 7.3:** Call `shouldBlock("http://0177.0.0.1/")`, assert it may return `{ block: false }` or throw (octal handling inconsistent)
   - **Expected Counterexamples:** All tests pass or throw on unfixed code (confirming normalization gaps)

### Fix Checking

**Goal:** Verify that for all inputs where the bug condition holds, the fixed implementation blocks the request.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := shouldBlock_fixed(input.url)
  ASSERT result.block = true
  ASSERT result.reason contains descriptive text
END FOR
```

**Test Plan:** Rewrite the exploratory tests to assert the CORRECT (fixed) behavior. Each test should now assert that the vulnerable input is blocked.

**Test Cases:**

1. **Category 1: DNS Resolution Failures (Fail Closed)**
   - **Test 1.1 (fixed):** Mock `dns.lookup()` to throw `ENODATA`, assert `shouldBlock()` returns `{ block: true, reason: "DNS resolution failed" }`
   - **Test 1.2 (fixed):** Mock `dns.lookup()` to return `[]`, assert `shouldBlock()` returns `{ block: true, reason: "hostname did not resolve to any address" }`
   - **Test 1.3 (fixed):** Mock `dns.lookup()` to return `[{ address: "fe80::1", family: 6 }]`, assert `shouldBlock()` returns `{ block: true, reason: "blocked IP address (link-local)" }`

2. **Category 2: IPv6 Address Parsing**
   - **Test 2.1 (fixed):** Call `shouldBlock("http://[::1]/")`, assert returns `{ block: true, reason: "blocked IP address (loopback)" }`
   - **Test 2.2 (fixed):** Call `shouldBlock("http://[::ffff:127.0.0.1]/")`, assert returns `{ block: true, reason: "blocked IP address (loopback)" }` (embedded IPv4 extracted and blocked)
   - **Test 2.3 (fixed):** Call `shouldBlock("http://[2002:c0a8:0101::1]/")`, assert returns `{ block: true, reason: "blocked IP address (rfc1918-192)" }` (6to4 IPv4 extracted and blocked)

3. **Category 3: Missing Blocked Ranges**
   - **Test 3.1 (fixed):** Call `shouldBlock("http://192.0.0.8/")`, assert returns `{ block: true, reason: "blocked IP address (ietf-protocol)" }`
   - **Test 3.2 (fixed):** Call `shouldBlock("http://224.0.0.251/")`, assert returns `{ block: true, reason: "blocked IP address (multicast)" }`
   - **Test 3.3 (fixed):** Call `shouldBlock("http://[::0]/")`, assert returns `{ block: true, reason: "blocked IP address (unspecified)" }`

4. **Category 4: DNS Rebinding**
   - **Test 4.1 (fixed):** Start proxy, audit a URL whose DNS returns `8.8.8.8`; during the audit, change the mock DNS to return `127.0.0.1`; assert that subsequent requests to the same hostname still use `8.8.8.8` (pinned)

5. **Category 5: HTTP Redirects**
   - **Test 5.1 (fixed):** Start a local test server that returns `HTTP 302` to `http://127.0.0.1:1234/`; audit the server URL; assert that `RawAudit.blockedRequests` contains `{ url: "http://127.0.0.1:1234/", reason: "blocked IP address (loopback)" }`

6. **Category 6: Non-HTTP Protocols**
   - **Test 6.1 (fixed):** Audit a page that opens `new WebSocket("ws://127.0.0.1:8080")`; assert that `RawAudit.blockedRequests` contains the WebSocket URL and reason "blocked IP address (loopback)"
   - **Test 6.2 (fixed):** Check Chromium launch args; assert `--disable-webrtc` is present

7. **Category 7: Encoding Normalization**
   - **Test 7.1 (fixed):** Call `shouldBlock("http://2130706433/")`, assert returns `{ block: true, reason: "blocked IP address (loopback)" }`
   - **Test 7.2 (fixed):** Call `shouldBlock("http://127.1/")`, assert returns `{ block: true, reason: "blocked IP address (loopback)" }`
   - **Test 7.3 (fixed):** Call `shouldBlock("http://0177.0.0.1/")`, assert returns `{ block: true, reason: "blocked IP address (loopback)" }`

### Preservation Checking

**Goal:** Verify that for all inputs where the bug condition does NOT hold (legitimate public URLs), the fixed implementation produces the same result as the original implementation.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT shouldBlock_original(input) = shouldBlock_fixed(input)
END FOR
```

**Testing Approach:** Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan:** Use fast-check to generate random public URLs and assert that the fixed policy allows them (same as original behavior).

**Test Cases:**

1. **Public URL Preservation**
   - **Test:** Generate 1000 random public URLs (e.g., `http://example.com/`, `https://8.8.8.8/`, `http://203.0.113.42:8080/`) using fast-check arbitraries
   - **Assertion:** For each URL, `shouldBlock_fixed(url)` returns `{ block: false, reason: "" }`

2. **Scheme Validation Preservation**
   - **Test:** Generate URLs with invalid schemes (`file://`, `ftp://`, `javascript:`)
   - **Assertion:** For each URL, `shouldBlock_fixed(url)` returns `{ block: true, reason: "scheme not allowed: <scheme>" }` (same as original)

3. **Invalid URL Preservation**
   - **Test:** Generate malformed URL strings (`not-a-url`, `http://[`, `://example.com`)
   - **Assertion:** For each URL, `shouldBlock_fixed(url)` returns `{ block: true, reason: "invalid URL format" }` (same as original)

4. **Permissive Policy Preservation**
   - **Test:** Instantiate `PermissiveSafeFetchPolicy`, call `shouldBlock()` with private IPs (`127.0.0.1`, `10.0.0.1`, `192.168.1.1`)
   - **Assertion:** All return `{ block: false, reason: "" }` (permissive mode allows private IPs, same as original)

5. **API Contract Preservation**
   - **Test:** Call `installSafeFetchPolicy(page, policy)` with both `RestrictiveSafeFetchPolicy` and `PermissiveSafeFetchPolicy`
   - **Assertion:** Function returns a cleanup handler (same as original API surface)

6. **Existing Audit Flow Preservation**
   - **Test:** Run the full `packages/core` test suite after applying the fix
   - **Assertion:** All tests that do not specifically probe safe-fetch internals continue to pass

### Unit Tests

- Test DNS resolution with mocked `dns.lookup()` for all error codes (`ENODATA`, `ENOTFOUND`, `EAI_AGAIN`)
- Test IP classification for all blocked ranges (IPv4 and IPv6)
- Test IPv6 embedded IPv4 extraction (IPv4-mapped, 6to4, NAT64)
- Test encoding normalization for all IPv4 textual forms (octal, hex, decimal, short form)
- Test proxy server lifecycle (start, stop, handle CONNECT)
- Test proxy hostname caching and DNS pinning

### Property-Based Tests

**Arbitraries to Define:**
```typescript
// fast-check arbitraries

// Generate valid private IPv4 addresses in all encodings
const privateIPv4Arbitrary = fc.oneof(
  fc.record({
    encoding: fc.constant('dotted-decimal'),
    value: fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255))
      .filter(([a, b, c, d]) => isPrivateIPv4(a, b, c, d))
      .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
  }),
  fc.record({
    encoding: fc.constant('octal'),
    value: fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255))
      .filter(([a, b, c, d]) => isPrivateIPv4(a, b, c, d))
      .map(([a, b, c, d]) => `0${a.toString(8)}.0${b.toString(8)}.0${c.toString(8)}.0${d.toString(8)}`),
  }),
  fc.record({
    encoding: fc.constant('hex'),
    value: fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255))
      .filter(([a, b, c, d]) => isPrivateIPv4(a, b, c, d))
      .map(([a, b, c, d]) => `0x${a.toString(16)}.0x${b.toString(16)}.0x${c.toString(16)}.0x${d.toString(16)}`),
  }),
  fc.record({
    encoding: fc.constant('32-bit-decimal'),
    value: fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255))
      .filter(([a, b, c, d]) => isPrivateIPv4(a, b, c, d))
      .map(([a, b, c, d]) => String(((a * 256 + b) * 256 + c) * 256 + d)),
  }),
)

// Generate valid private IPv6 addresses including IPv4-mapped
const privateIPv6Arbitrary = fc.oneof(
  fc.record({
    encoding: fc.constant('standard'),
    value: fc.constant('::1'),  // loopback
  }),
  fc.record({
    encoding: fc.constant('link-local'),
    value: fc.hexaString({ minLength: 4, maxLength: 4 }).map((hex) => `fe80::${hex}`),
  }),
  fc.record({
    encoding: fc.constant('ipv4-mapped'),
    value: privateIPv4Arbitrary.map((ipv4) => `::ffff:${ipv4.value}`),
  }),
)

// Generate public IPv4 addresses (not in blocked ranges)
const publicIPv4Arbitrary = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255))
  .filter(([a, b, c, d]) => !isPrivateIPv4(a, b, c, d) && !isBlockedIPv4(a, b, c, d))
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)

// Generate DNS error models
const dnsErrorArbitrary = fc.oneof(
  fc.constant({ code: 'ENODATA' }),
  fc.constant({ code: 'ENOTFOUND' }),
  fc.constant({ code: 'EAI_AGAIN' }),
  fc.constant({ code: 'ETIMEDOUT' }),
)
```

**Property Tests:**

1. **Property: All private IPs in all encodings are blocked**
   ```typescript
   fc.assert(
     fc.property(privateIPv4Arbitrary, async (ip) => {
       const result = await policy.shouldBlock(`http://${ip.value}/`)
       expect(result.block).toBe(true)
       expect(result.reason).toContain('blocked IP address')
     })
   )
   ```

2. **Property: All public IPs are allowed**
   ```typescript
   fc.assert(
     fc.property(publicIPv4Arbitrary, async (ip) => {
       const result = await policy.shouldBlock(`http://${ip}/`)
       expect(result.block).toBe(false)
     })
   )
   ```

3. **Property: DNS errors result in blocking (fail-closed)**
   ```typescript
   fc.assert(
     fc.property(fc.string(), dnsErrorArbitrary, async (hostname, dnsError) => {
       // Mock dns.lookup() to throw dnsError
       const result = await policy.shouldBlock(`http://${hostname}/`)
       expect(result.block).toBe(true)
       expect(result.reason).toContain('DNS resolution failed')
     })
   )
   ```

4. **Property: Redirect chains with any blocked target are blocked**
   ```typescript
   fc.assert(
     fc.property(
       publicIPv4Arbitrary,
       privateIPv4Arbitrary,
       async (publicIP, privateIP) => {
         // Start test server: publicIP redirects to privateIP
         // Audit publicIP
         // Assert privateIP is blocked and recorded in blockedRequests
       }
     )
   )
   ```

### Integration Tests

- Test full audit flow with restrictive policy: audit `http://example.com/`, assert no private IPs are accessed
- Test full audit flow with permissive policy: audit `http://localhost:8080/`, assert it succeeds
- Test redirect validation: audit a URL that redirects to `http://127.0.0.1/`, assert the redirect is blocked
- Test WebSocket blocking: audit a page that opens `ws://127.0.0.1:8080`, assert the connection is blocked
- Test proxy lifecycle: start audit, verify proxy is running, complete audit, verify proxy is stopped
- Test proxy hostname caching: audit a page with multiple requests to the same hostname, verify DNS is called only once
- Test that `RawAudit.blockedRequests` contains all blocked URLs with reasons

## Defense in Depth

### Egress Firewall Rules for Hosted Container

**Deployment Guide (apps/web/DEPLOY.md):**

The hosted `apps/web` service MUST be deployed with egress firewall rules that block outbound connections to private IP ranges, cloud metadata endpoints, and loopback addresses. This provides defense-in-depth: even if the application-level SSRF guard has a defect, the firewall prevents access to internal resources.

**Firewall Rules (iptables example for Docker host):**

```bash
# Block outbound connections to private IPv4 ranges
iptables -A OUTPUT -d 127.0.0.0/8 -j REJECT
iptables -A OUTPUT -d 10.0.0.0/8 -j REJECT
iptables -A OUTPUT -d 172.16.0.0/12 -j REJECT
iptables -A OUTPUT -d 192.168.0.0/16 -j REJECT
iptables -A OUTPUT -d 169.254.0.0/16 -j REJECT
iptables -A OUTPUT -d 100.64.0.0/10 -j REJECT
iptables -A OUTPUT -d 192.0.0.0/24 -j REJECT
iptables -A OUTPUT -d 198.18.0.0/15 -j REJECT
iptables -A OUTPUT -d 224.0.0.0/4 -j REJECT
iptables -A OUTPUT -d 240.0.0.0/4 -j REJECT

# Block AWS EC2 metadata endpoint
iptables -A OUTPUT -d 169.254.169.254 -j REJECT

# Block outbound connections to private IPv6 ranges
ip6tables -A OUTPUT -d ::1/128 -j REJECT
ip6tables -A OUTPUT -d fe80::/10 -j REJECT
ip6tables -A OUTPUT -d fc00::/7 -j REJECT
ip6tables -A OUTPUT -d ff00::/8 -j REJECT
ip6tables -A OUTPUT -d fd00:ec2::254/128 -j REJECT
```

**Cloud Provider Security Groups (AWS example):**

```yaml
# AWS Security Group for ECS task running apps/web
SecurityGroupEgress:
  - IpProtocol: tcp
    FromPort: 80
    ToPort: 80
    CidrIp: 0.0.0.0/0  # Allow outbound HTTP to public internet
  - IpProtocol: tcp
    FromPort: 443
    ToPort: 443
    CidrIp: 0.0.0.0/0  # Allow outbound HTTPS to public internet
  # Deny all other outbound traffic (implicit deny for traffic not matching above rules)
  # Explicitly deny private ranges if cloud provider requires explicit deny rules
```

**Docker Compose Example:**

```yaml
# docker-compose.yml
version: '3.8'
services:
  web:
    image: the-unseen:latest
    ports:
      - "3000:3000"
    networks:
      - restricted
    cap_drop:
      - NET_ADMIN
      - NET_RAW
    security_opt:
      - no-new-privileges:true

networks:
  restricted:
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16
    # Firewall rules applied via iptables on the Docker host
```

**Testing Egress Firewall:**

1. Deploy `apps/web` with egress rules applied
2. Inside the container, attempt to `curl http://127.0.0.1/` — assert it times out or is rejected
3. Inside the container, attempt to `curl http://10.0.0.1/` — assert it times out or is rejected
4. Inside the container, attempt to `curl http://example.com/` — assert it succeeds

**Documentation Location:**

- Create `apps/web/DEPLOY.md` with egress firewall configuration for Docker, AWS ECS, Fly.io, Render, and Railway
- Reference clause 2.39 and 2.40 in this design document
- Include testing procedures to verify firewall rules are active
