Amend the **`safe-fetch`** spec (`.kiro/specs/safe-fetch/bugfix.md`, `design.md`, `tasks.md`) before any implementation. An independent review confirmed **30 findings, 8 of them blockers**. Several were checked against the Playwright 1.65.1 source and Node 24 on this machine. Evidence and exact fixes are in **`docs/brief/review-notes/safe-fetch-spec-review-1.md`**. The reviewers overlap, so these are the deduplicated product-lead decisions. Apply them, then walk all 30 items and resolve each one.

Spec files only. **Do not touch `packages/core/` or `apps/`**: another Kiro run is building the classifier there.

## Decisions
**A. Proxy wiring (findings 1, 5, 13).** Do not use a launch-level `--proxy-server`. It conflicts with the shared `BrowserPool`, and it hits Chromium's implicit loopback/link-local bypass.
- Each restrictive audit starts its own proxy instance on an ephemeral port.
- Wire it with Playwright's context option: `browser.newContext({ proxy: { server: 'http://127.0.0.1:<port>', bypass: '<-loopback>' } })` in `PageLoader.createContext`. Write the bypass explicitly; no host is ever bypassed.
- Required integration test: a page served through the proxy `fetch()`es `127.0.0.1:<live port>`, `localhost:<live port>`, `[::1]:<live port>` and `169.254.169.254`. All four land in `blockedRequests`, and the live server records **zero** hits.

**B. Mode selection (findings 2, 19).** Add `readonly mode?: 'restrictive' | 'permissive'` to `SafeFetchPolicy`. `ResourceMeter.wrapPolicy` and `OriginScopedPolicy` forward `inner.mode`. **The proxy is used unless `mode === 'permissive'`. No mode means restrictive.** Never use `instanceof`. Add a test that default `auditUrl` creates its context with a proxy.

**C. Proxy request handling (findings 3, 4, 6, 7, 8, 14, 26, 29).**
- **CONNECT:** handle it with a strict authority parser (`host:port` or `[v6]:port`, port 1–65535 required; otherwise 400).
- **Absolute-form `http://` requests:** handle them in the `'request'` handler.
  - The target comes only from the request-target, never from the `Host` header. Overwrite `Host`, and strip `Proxy-*` and hop-by-hop headers.
  - Never follow redirects in the proxy.
  - Origin-form requests and other schemes get 400. `'upgrade'` gets 400 (Chromium tunnels `ws://` over CONNECT).
- **Errors:** a try/catch around every handler, mapping to 502 plus a log entry. `'error'` listeners on **both** sockets before any `await`. Connect timeout 10 s.
- **DNS:** `dns.lookup` wrapped in a 5 s timeout, with a small concurrency limit.
- **Dialling:** try every validated address in order (Happy-Eyeballs-lite); fail closed if all fail.
- Fit the lifecycle to `audit-guard.ts`: the proxy is closed in the audit's `finally`, and proxy failures are recorded, not thrown into Chromium.

**D. Two layers in restrictive mode (findings 10, 11).** Keep `installSafeFetchPolicy` (`page.route`) in restrictive mode too. It stays the single place where `ResourceMeter` counts requests and records `blockedRequests`. The proxy is the enforcement point for DNS pinning, redirects, WebSockets and anything `page.route` cannot see; it never counts. Redirect hops are validated **in the proxy** (Chromium re-requests each hop through it), not in `page.route`, because Playwright does not route redirect hops. Correct clause 2.22.

**E. `auditHtml` (findings 12, 20).** Drop the local `127.0.0.1` HTTP server. Serve the HTML with `page.route(...).fulfill()` on a synthetic origin, `http://audit-html.unseen.invalid/`, and keep relative subresources failing closed. That removes the loopback exception entirely, and `OriginScopedPolicy` then allows exactly that synthetic origin. Amend the audit-engine requirement this touches (Req 13 for `auditHtml`) in `.kiro/specs/audit-engine/requirements.md`, and note it in the `tasks.md` Notes.

**F. Chromium flags (findings 15, 28).** `--disable-webrtc` does not exist; remove it. WebRTC is controlled by the existing `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` plus `--webrtc-ip-handling-policy=disable_non_proxied_udp`. Also add `--disable-quic`, and turn off Chromium's built-in DNS-over-HTTPS (`--disable-features=DnsOverHttps`), so every request goes through the proxy. Each flag gets a cited reason in the design.

**G. Ranges (finding 9).** Add every missing special-purpose range the review lists: IPv4-compatible `::/96`, Teredo `2001::/32`, and the rest in item 9. Keep one canonical range table.

**H. Tests that actually test (findings 16, 17, 21, 22, 23, 25, 27, 30).**
- **Async properties:** use `fc.asyncProperty` with `await fc.assert(...)`, at least 200 runs.
- **Test seams:** inject a resolver and a dialer into the proxy, so tests map fake public hostnames such as `public.example.test` to local test servers. This covers redirect-to-loopback, AAAA-only, `ENODATA`/`ENOTFOUND`/`EAI_AGAIN` and rebinding (the first lookup is public, the second private).
- **Phase-1 exploratory tests:** only for bugs that really exist in the current code. Each one must fail before the fix; drop the ones that already pass.
- **WebSocket assertions:** match what the proxy can see (the CONNECT authority).
- **Commands:** `npm run typecheck`, `npx vitest --run` and `npx playwright test` in `packages/core`, with `UNSEEN_CHROMIUM_CHANNEL=chromium`.

**I. Egress firewall documentation (finding 18).** Rewrite it honestly. Host `OUTPUT` rules do not filter container traffic: use the `DOCKER-USER` chain, Kubernetes NetworkPolicy, or the platform's egress controls. Never block the proxy's own upstream connections. Say plainly when a platform (Render, Fly) cannot enforce it, in which case the in-process proxy is the only layer.

**J. Code that compiles (finding 24).** The design's TypeScript must typecheck under this repo's `NodeNext` + `strict` settings: the `ipaddr.js` import form, typed narrowing, no implicit `any`.

## Done means
The three spec files agree with each other and with these decisions. Final message: a table of item 1–30 → "fixed in <file §section>", or "not a defect, because …". If you near a limit, stop after a completed item and name the next one. Do not ask questions.
