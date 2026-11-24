Run 13b: implement **all tasks** of `.kiro/specs/safe-fetch/tasks.md` in order. The spec is the bugfix spec you wrote (run 13), amended for 30 review findings (runs 26 and 28). Follow it exactly. Order of truth: `.kiro/steering/security.md`, then `docs/brief/prompts/26-safe-fetch-spec-amend.md` (decisions A–J), then `bugfix.md`/`design.md`.

## Non-negotiables
- **Proxy wiring:** a per-audit in-process proxy wired through `browser.newContext({ proxy: { server, bypass: '<-loopback>' } })`. Never a launch-level `--proxy-server`.
- **Mode selection:** `policy.mode`, never `instanceof`. No mode means restrictive.
- **Restrictive mode keeps both layers:** `page.route` (the only place requests are counted) plus the proxy (enforcement: DNS pinning, redirects, WebSockets).
- **Proxy request handling:** strict CONNECT authority parsing; absolute-form HTTP with the target taken from the request-target, never the `Host` header; `upgrade` gets 400; error listeners on both sockets; DNS timeout 5 s; Happy Eyeballs dialling across every validated address; fail closed.
- **`auditHtml`:** a synthetic origin (`http://audit-html.unseen.invalid/`) served through `route.fulfill`. No local HTTP server.
- **Flags:** the real WebRTC flags plus `--disable-quic` and `--disable-features=DnsOverHttps`. `--disable-webrtc` does not exist.
- **Exploratory tests (Phase 1):** must fail on the old code before you fix it; record the failure output in the `tasks.md` Notes.
- **Required integration test:** a page `fetch()`es `127.0.0.1:<live port>`, `localhost:<live port>`, `[::1]:<live port>` and `169.254.169.254`. All four land in `blockedRequests`, and the live server records **zero** hits.
- **Property tests:** `fc.asyncProperty` with `await fc.assert`, ≥ 200 runs, covering every encoding.
- **Do not break existing behaviour:** the whole `packages/core` suite stays green (480 unit and 90 integration tests at the start of this run), and the golden test and shop scores do not change.

## Working style
Save after each task. Do not ask questions. If you near a limit, stop after a completed task and write `Next: task N`.

## Done means
- `npm run typecheck`, root `npm run lint`, `npx vitest --run` and `npx playwright test` in `packages/core` are green, and `apps/cursed-shop` `npm run verify` passes.
- Final message: the exploratory-test failure evidence, the loopback/metadata test output, and a task → test table.
