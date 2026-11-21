---
inclusion: fileMatch
fileMatchPattern: "{packages/core/**,apps/web/src/server/**}"
---

# THE UNSEEN — Security Rules

Rules for the audit engine (`packages/core`) and the Fastify API server (`apps/web/src/server`). These exist to prevent SSRF, resource exhaustion, and abuse of the hosted auditor. All rules are enforced in `packages/core/src/runner/safe-fetch.ts`.

---

## SSRF prevention (hosted auditor)

The hosted web app (`apps/web`) must **only** load public `http` or `https` URLs. It must never make a request to a private network, the host's own metadata service, or any address that is not a globally routable unicast address.

### Blocked address ranges

Resolve every hostname to its IP address(es) before initiating any connection. Block the request if **any** resolved IP falls into the following ranges:

| Range | Description |
|-------|-------------|
| `127.0.0.0/8` | IPv4 loopback |
| `::1/128` | IPv6 loopback |
| `10.0.0.0/8` | RFC 1918 private |
| `172.16.0.0/12` | RFC 1918 private |
| `192.168.0.0/16` | RFC 1918 private |
| `169.254.0.0/16` | IPv4 link-local (APIPA) |
| `fe80::/10` | IPv6 link-local |
| `fc00::/7` | IPv6 unique local (ULA) |
| `100.64.0.0/10` | IANA shared address (Tailscale, CGN) |
| `0.0.0.0/8` | "This" network |
| `::ffff:0:0/96` | IPv4-mapped IPv6 (bypasses IPv4 checks) |
| `2002::/16` | 6to4 (can encode private IPv4) |
| `169.254.169.254/32` | AWS EC2 metadata endpoint (also covered by link-local, but explicit) |
| `fd00:ec2::254` | AWS EC2 metadata IPv6 |
| `metadata.google.internal` | GCP metadata (resolve and block) |

**All encodings must be blocked.** A URL containing `http://0x7f000001/` (hex), `http://2130706433/` (decimal), `http://0177.0.0.1/` (octal), or `http://[::ffff:127.0.0.1]/` (IPv4-mapped IPv6) must all be rejected — not just standard dotted-decimal notation. Normalise the IP to its canonical binary form before checking.

### DNS rebinding protection

Resolve DNS once before the first request and pass the resolved IP to Playwright's route interception. For every subsequent request the page makes (images, scripts, XHR, fetch), intercept via Playwright's `page.route('**/*', handler)` and block any request whose resolved IP falls in a blocked range. Do not trust DNS a second time for the same session.

### Protocol restriction

Only `http:` and `https:` schemes are permitted. Block `file:`, `data:`, `ftp:`, `blob:`, `javascript:`, and all other schemes.

### Implementation

```typescript
// packages/core/src/runner/safe-fetch.ts
export class SsrfBlockedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string
  ) {
    super(`SSRF blocked: ${url} — ${reason}`)
    this.name = 'SsrfBlockedError'
  }
}

// Real exported API (SsrfBlockedError lives in packages/core/src/types.ts)
export class RestrictiveSafeFetchPolicy implements SafeFetchPolicy { /* hosted mode: blocks private, loopback, metadata */ }
export class PermissiveSafeFetchPolicy implements SafeFetchPolicy { /* local MCP and tests: http/https only */ }
export function installSafeFetchPolicy(page: Page, policy: SafeFetchPolicy): void { /* page.route('**/*') handler */ }
```

**Known gaps:** the current guard has defects listed in `docs/brief/review-notes/safe-fetch-review-1.md`: failing open on DNS errors, IPv6 parsing, missing IPv4 ranges, DNS rebinding, redirect tests, and WebSocket/WebRTC coverage. The `safe-fetch` spec closes them. Until then, do not expose the hosted auditor publicly.

The SSRF guard must be installed on every `Page` before any navigation. It must intercept and block `fetch`, XHR, image loads, script loads, and stylesheet loads — not just the initial navigation. Use `page.route('**/*', ...)`.

### Property-based test invariant

```
for all generated addresses in all encodings (decimal, octal, hex, IPv4-mapped IPv6, 6to4):
  if the address resolves to a blocked range → isPrivateIp(canonical(address)) === true
```

fast-check must generate valid private addresses in every encoding and assert that `isPrivateIp` returns `true` for all of them.

---

## Timeouts

Apply these to every audit request in both `packages/core` and `apps/web/src/server`:

| Operation | Timeout |
|-----------|---------|
| DNS resolution | 5 seconds |
| Page navigation (`page.goto`) | 30 seconds |
| Full audit (render + AX tree + axe + Tab walk) | 60 seconds |
| `suggest_fix` LLM call (if used) | 20 seconds |

If a timeout expires, throw `AuditTimeoutError` with the operation name and elapsed time. Do not leave zombie Playwright instances; always close the browser context in a `finally` block.

---

## Page weight limits

Enforce these limits in the Playwright request interceptor:

| Limit | Value |
|-------|-------|
| Maximum response size per resource | 10 MB |
| Maximum total page weight | 50 MB |
| Maximum number of requests per page | 500 |

If a resource exceeds its size limit, abort that request (do not block the whole audit). If the total weight or request count is exceeded, abort the page load and throw `AuditResourceLimitError`.

---

## Rate limiting and concurrency (hosted web app only)

Apply these in `apps/web/src/server/routes/audit.ts`:

| Limit | Value |
|-------|-------|
| Audits per IP per minute | 5 |
| Audits per IP per hour | 30 |
| Concurrent audits (global) | `UNSEEN_MAX_CONCURRENCY`, default **2** (range 1–20); enforced by `BrowserPool` |
| Queue depth (waiting audits) | 20 (the 21st waiting request is rejected at once) |

This table is the single source of truth for these limits. Specs and tasks must quote it, not restate different numbers.

If the concurrency cap is reached, return `HTTP 429` with a `Retry-After` header. If the queue is full, return `HTTP 503`. Use a simple in-memory token bucket for per-IP rate limiting (no Redis required for the hackathon scope).

These limits apply **only** to the hosted `apps/web` server. The local `packages/mcp` server has no rate limiting.

---

## Local MCP server exemptions

`packages/mcp` runs on the developer's own machine (stdio transport). It is explicitly allowed to audit:

- `localhost` and `127.0.0.1` URLs
- `http://` (non-TLS) URLs
- Private IP addresses on the developer's LAN

These exemptions apply only when `packages/mcp` is running locally. Never apply them to the `apps/web` hosted auditor. The distinction is enforced by an `allowPrivate: boolean` option on `auditUrl()` in `packages/core`, which is `false` by default and set to `true` only by `packages/mcp`.

---

## Error handling rules

- Never include the raw URL, resolved IP, or internal stack trace in error responses returned to the client. Log them server-side only.
- Error responses to the client must use a stable error code string (e.g. `"SSRF_BLOCKED"`, `"TIMEOUT"`, `"RESOURCE_LIMIT"`) and a user-safe message.
- Do not expose which internal IP a hostname resolved to in client-facing error messages.
