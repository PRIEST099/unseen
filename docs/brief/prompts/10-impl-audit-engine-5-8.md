Implement tasks **5–8** of `.kiro/specs/audit-engine/tasks.md` (BrowserPool, Page_Loader, AX_Tree_Collector, Axe_Runner). Mark each `[x]` only when its acceptance criteria pass. Where the task text and `requirements.md`/`design.md`/`.kiro/steering/hauntings.md` disagree, the requirements, design and steering win: they were updated after the tasks were written.

## Step 0: repo and steering sync (do this first; it is cheap)
An independent review on 2026-11-21 found drift. Fix all of it before task 5:
1. **`.kiro/steering/structure.md`:**
   - Specs live only in `.kiro/specs/<feature>/`; remove every mention of `docs/specs/`.
   - Fix the `apps/cursed-shop` tree to the real files: `index.html`, `product.html`, `checkout.html`, `img/`, `expected-hauntings.json`, `verify.mjs`, `package.json`, `README.md`. The README uses CSS selectors, not line refs.
   - List `docs/brief/prompts/`, `docs/brief/review-notes/`, `docs/HANDOFF.md` and the root `CLAUDE.md`, `README.md`, `LICENSE`.
   - Mark directories that do not exist yet as "(planned)".
   - Replace the claim that the `classifier/` → `runner/` boundary "is enforced by a TypeScript path alias and checked in CI". It will be enforced by ESLint `no-restricted-imports` plus a test (haunting-classifier spec), and there is no CI yet. Make the same correction in `.kiro/specs/audit-engine/tasks.md` Notes.
2. **`.kiro/specs/audit-engine/requirements.md` Req 15.3:** `trapElementIds` is a typo for `trapRegionNodeIds`.
3. **`tasks.md` Notes:** the fixtures already exist in `apps/cursed-shop` (vibe-coded, with no spec).
4. **Limits, one source of truth in `.kiro/steering/security.md`:**
   - per IP: 5 audits/min and 30/hour
   - global concurrency from `UNSEEN_MAX_CONCURRENCY`, default **2**
   - queue depth 20

   Update task 5 to match: `BrowserPool` default `maxConcurrency` 2, configurable 1–20, and a queue limit of 20 (not 50).
5. **`security.md` SSRF section:** name the real exported API (`RestrictiveSafeFetchPolicy`, `PermissiveSafeFetchPolicy`, `installSafeFetchPolicy`). Add a line saying the current guard has known gaps, listed in `docs/brief/review-notes/safe-fetch-review-1.md`, which the `safe-fetch` spec will close.
6. **`.kiro/steering/design-system.md`:** fonts are self-hosted via `@fontsource` only; no Google Fonts.
7. **`packages/core` config:**
   - add `"private": true` and `"license": "MIT"`
   - add `playwright` to `devDependencies` (keep the peerDependency) at the version the lockfile resolves
   - add `packages/core/playwright.config.ts` with `testDir: './tests'`, `testMatch: '**/*.int.spec.ts'` and `use: { channel: process.env.UNSEEN_CHROMIUM_CHANNEL || undefined }`, so `test:integration` stops loading Vitest files. Name the integration tests `*.int.spec.ts`.
   - add `tsconfig.test.json` so `npm run typecheck` also type-checks the test files
   - remove the unused `@runner/*` path alias
8. **`apps/cursed-shop/package.json`:** add `"private": true`, remove `"main"`, and use `serve -l 4173 .` (no `npx`). Root `package.json`: add `"license": "MIT"` and a `"shop"` script that starts the Cursed Shop.

## Product-lead amendments (apply exactly)

1. **Chromium channel (task 5):** read `docs/brief/review-notes/local-env.md`. `BrowserPool` launches with `chromium.launch({ channel: process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium', headless: true })`. The headless shell is not installed on this machine. Treat an empty string as "no channel" so the Docker image can use the bundled build.
2. **Launch flags (task 5):** pass `--disable-features=WebRtcHideLocalIpsWithMdns` and `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, which block WebRTC leaks (see safe-fetch review §6). The `safe-fetch` spec will later add a per-audit `--host-resolver-rules` pin, so keep the launch args in a single exported `buildLaunchArgs(opts)` function that can be extended.
3. **Walk timing (task 6):** after `networkidle`, wait a fixed **1500 ms** settle window before the screenshot and before any collector. This lets timer-opened dialogs appear (`hauntings.md` §5, "Walk start timing"). Record `walkStartedAtMs` later in task 13.
4. **Determinism (task 6):** take the screenshot with `{ fullPage: true, animations: 'disabled', caret: 'hide' }`.
5. **AX names (task 7):** keep each node's `name.sources` array verbatim, including `attribute`, `type`, `value` and `superseded`. The Whispering Field rule needs to know when the winning name source is `placeholder`. Treat CDP role `image` and `img` as equivalent; normalise nothing, but export a helper `isImageRole(role)`.
6. **Integration test server:** tasks 7+ test against `apps/cursed-shop`. Add a shared test fixture, `packages/core/tests/fixtures/shop-server.ts`, that serves `apps/cursed-shop` on a random port and returns its base URL. Tests must use `PermissiveSafeFetchPolicy` (loopback), never disable the policy.

## Done means
- `npm run typecheck`, `npm test` (Vitest, including the new Property 5) and the Playwright integration tests for tasks 6–8 all pass.
- Paste the summary line of each command as your final message.
- Stop after task 8; tasks 9–16 come in the next instruction.
