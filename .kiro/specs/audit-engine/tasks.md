# Implementation Plan: Audit Engine

## Overview

Implement the browser automation pipeline in `packages/core/src/runner/` that accepts a URL or raw HTML string, launches a Playwright Chromium browser, collects every raw signal the classifier needs, and returns a single serializable `RawAudit` object. The public API (`auditUrl`, `auditHtml`) is exported from `packages/core/src/index.ts`. No haunting classification logic belongs here.

## Tasks

- [x] 1. Scaffold monorepo and `packages/core` build tooling
  - Create `package.json` at workspace root with `workspaces: ["packages/*", "apps/*"]`, `engines: { node: ">=22" }`, and `build`/`test`/`typecheck` scripts
  - Create `tsconfig.base.json` at workspace root with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `esModuleInterop: true`
  - Create `packages/core/package.json` with name `@the-unseen/core`, type `module`, `main: ./dist/index.js`, `types: ./dist/index.d.ts`, and scripts for `build`, `test`, `typecheck`, `test:integration`; add `playwright`, `@axe-core/playwright`, `@playwright/test`, `fast-check`, `typescript`, and `vitest` to their appropriate dependency sections
  - Create `packages/core/tsconfig.json` extending `../../tsconfig.base.json` with `outDir: ./dist`, `rootDir: ./src`, `include: ["src/**/*.ts"]`, `exclude: ["**/*.test.ts", "tests/**", "dist/**"]`
  - Create `packages/core/vitest.config.ts` configuring Vitest to include `src/**/*.test.ts` with `environment: "node"`
  - Create placeholder `packages/core/src/index.ts` that exports nothing (will be replaced in task 14)
  - Acceptance: `tsc --noEmit` exits 0; `vitest --run` exits 0 with no test files
  - _Satisfies: Req 12.1, 13.1 (scaffold only)_

- [x] 2. Define domain types in `packages/core/src/types.ts`
  - Write all TypeScript type aliases and interfaces: `SchemaVersion`, `RawAudit`, `AXNode`, `AXValue`, `AXValueSource`, `AXProperty`, `BoundingBox`, `TabWalkResult`, `TabStep`, `FocusSnapshot`, `ComputedStyleMap`, `TabCycle`, `CycleResult`, `TextNodeStyle`, `EventListenerSignal`, `DomAxMapping`, `PageMetadata`, `HeadingRecord`, `ResourceUsage`, `CollectionError`, `AxeViolation`, `AxeViolationNode`, `AuditOptions`, and the `SafeFetchPolicy` interface
  - Write all seven typed error classes: `AuditTimeoutError` (fields: `operation: string`, `elapsedMs: number`), `SsrfBlockedError` (fields: `url: string`, `reason: string`), `AuditResourceLimitError` (fields: `limitType`, `value: number`), `NonHtmlContentError` (field: `contentType: string`), `AuditCollectionError` (fields: `step: string`, `cause: unknown`), `AuditContextError` (field: `cause: unknown`), `HtmlSizeError` (field: `byteLength: number`)
  - Each error class must extend `Error`, call `super(message)`, and use `public readonly` for its custom fields
  - Acceptance: `tsc --noEmit` on `packages/core` exits 0; write a `packages/core/src/types.test.ts` with unit tests asserting each error class: instantiates with correct `message` string, correct field values, and `instanceof` check passes
  - _Satisfies: Req 12.1, 12.3, 13.3_

- [x] 3. Implement `SafeFetchPolicy` in `packages/core/src/runner/safe-fetch.ts`
  - Export the `SafeFetchPolicy` interface (re-export from `types.ts`)
  - Implement `RestrictiveSafeFetchPolicy` class: resolves hostnames via `dns.promises.resolve4` and `dns.promises.resolve6`; blocks IPs in private ranges `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`; blocks loopback `127.0.0.0/8`, `::1`; blocks link-local `169.254.0.0/16`, `fe80::/10`; blocks cloud metadata `169.254.169.254`, `fd00:ec2::254`; blocks any URL whose scheme is not `http:` or `https:`; returns `{ block: true, reason }` for blocked URLs, `{ block: false, reason: "" }` for allowed
  - Implement `PermissiveSafeFetchPolicy` class: allows all IPs including loopback and private; still blocks non-`http:`/`https:` schemes
  - Export `installSafeFetchPolicy(page: Page, policy: SafeFetchPolicy): void` that calls `page.route('**/*', handler)` where the handler calls `policy.shouldBlock(url)` and either `route.continue()` or `route.abort()`; handle `policy.shouldBlock` throwing by aborting and treating the URL as blocked with reason `"policy-error"`
  - Acceptance: Vitest unit tests covering: loopback IP (`127.0.0.1`) blocked by restrictive, allowed by permissive; private IP (`192.168.1.1`) blocked by restrictive, allowed by permissive; `file:` scheme blocked by both; public IP blocked by neither; `shouldBlock` throwing causes abort
  - _Satisfies: Req 3.1, 3.3, 3.4, 3.5, 3.7_

- [x] 4. Implement the pure helper `stepCap` in `packages/core/src/runner/tab-walker.ts` (run 19b: `detectCycle` was removed, see Notes)
  - `stepCap(focusableCount: number): number` - returns `focusableCount * 2 + 10`; pure: no I/O, no globals, no `Date.now()`
  - `packages/core/src/runner/tab-walker.test.ts` holds the fast-check tests of Property 4 (min 100 runs): `stepCap(0) === 10`; `stepCap(n) > stepCap(n-1)` for `n > 0`; `stepCap(n) >= 10` always. Properties 1-3 (cycle detection) are tested through `runWalk` in `walk.test.ts`
  - Acceptance: `vitest --run` exits 0
  - _Satisfies: Req 11.5, 11.6_

- [x] 5. Implement `BrowserPool` in `packages/core/src/runner/browser.ts`
  - Create `packages/core/src/runner/browser.ts` containing the `BrowserPool` singleton class and its supporting types
  - Export a single `buildLaunchArgs(opts?)` function returning `{ channel: string | undefined; args: string[]; headless: boolean }`, so launch flags live in one place the `safe-fetch` spec can later extend (e.g. a per-audit `--host-resolver-rules` pin). The channel resolves as `opts.channel ?? process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium'`; an empty string is treated as "no channel" (`undefined`) so the Docker image can use the bundled build. The args always include `--disable-features=WebRtcHideLocalIpsWithMdns` and `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` to block WebRTC leaks. `headless` defaults to `true`.
  - `BrowserPool` constructor accepts `BrowserPoolOptions` with `maxConcurrency: number` (1–20 inclusive, default **2**); a non-integer or out-of-range value throws `RangeError`
  - `acquire(): Promise<Browser>` — if a slot is available, launches or returns a browser immediately; if at capacity, enqueues the request with a 30-second timeout; throws immediately if queue depth reaches **20**
  - `release(browser: Browser): Promise<void>` — increments session counter; runs `browser.isConnected()` health check; if unhealthy OR session counter ≥ 50, closes and replaces the browser before dispatching to next queued caller; dispatches to next queued caller if queue is non-empty
  - Export `getPool(options?: BrowserPoolOptions): BrowserPool` as the module-level singleton accessor
  - Acceptance: Vitest unit tests (using mocked `chromium.launch`): (a) with the pool at capacity and 20 requests already queued, the 21st `acquire` throws immediately, (b) 30s timeout rejects with error after expiry, (c) `release` decrements busy count so next `acquire` resolves, (d) session counter ≥ 50 triggers browser replacement
  - _Satisfies: Req 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 6. Implement `Page_Loader` in `packages/core/src/runner/browser.ts`
  - Add `Page_Loader` class and `normalizeBoundingBox` pure helper to `browser.ts` (alongside `BrowserPool`)
  - `createContext(browser: Browser, options: AuditOptions): Promise<BrowserContext>` — creates a `BrowserContext` with `viewport: { width: 1280, height: 900 }` (overridable), `locale: "en-US"`, `timezoneId: "UTC"`, `serviceWorkers: "block"`, `bypassCSP: false`, `storageState: undefined`; wraps failures in `AuditContextError`
  - `loadPage(context: BrowserContext, url: string, policy: SafeFetchPolicy, options: AuditOptions): Promise<{ page: Page; screenshotPng: Buffer; boundingBoxes: BoundingBox[] }>` — opens a page, calls `installSafeFetchPolicy`, navigates with `waitUntil: 'networkidle'` and `navigationTimeoutMs` timeout, checks Content-Type (throw `NonHtmlContentError` if not `text/html` or `application/xhtml+xml`), takes full-page PNG screenshot, collects bounding boxes via single `page.evaluate` over `querySelectorAll('*')` with `getBoundingClientRect()` and `backendDOMNodeId`
  - `normalizeBoundingBox(box: { x: number; y: number; width: number; height: number }, scale: number): BoundingBox` — pure function applying uniform scale; `x >= 0`, `y >= 0`, `width >= 0`, `height >= 0`
  - Attach crash handler on page via `page.on('crash', ...)` that throws `AuditTimeoutError` with `operation: "browser-crash"`
  - Write `packages/core/src/runner/browser.test.ts` with:
    - **Property 5** (design §Property 5): `normalizeBoundingBox` invariants — non-negative coordinates, linear scaling; min 100 runs
    - Playwright integration test against a minimal static HTML page (created inline): asserts screenshot is non-empty Buffer and `boundingBoxes` has at least one entry with non-zero `backendDOMNodeId`
  - Acceptance: property test passes; integration test passes
  - _Satisfies: Req 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 14.1, 14.4, 14.5_

- [x] 7. Implement `AX_Tree_Collector` in `packages/core/src/runner/ax-tree.ts`
  - Create `packages/core/src/runner/ax-tree.ts` and export `collectAxTree(page: Page): Promise<AXNode[]>`
  - Open a CDP session via `page.context().newCDPSession(page)`; throw `AuditCollectionError` with `step: "ax-tree"` if opening fails
  - Call `session.send('Accessibility.getFullAXTree', { fetchRelatedNodes: true })`
  - Map every CDP node to `AXNode`, preserving `nodeId`, `backendDOMNodeId`, `role`, `name`, `description`, `properties`, `states`, `ignored`, `ignoredReasons`, `childIds`, `parentId` verbatim
  - Validate each node has `backendDOMNodeId`; throw `AuditCollectionError` with `step: "ax-tree"` if any node is missing it
  - If zero nodes returned and `document.body.children.length > 0`, throw `AuditCollectionError` with `step: "ax-tree"`
  - Write integration test in `packages/core/tests/ax-tree.test.ts` using `@playwright/test` against `apps/cursed-shop/index.html` (via local file server): assert ≥1 `AXNode` returned; assert ≥1 node with interactive role and empty `name.value` (trimmed)
  - Acceptance: integration test passes
  - _Satisfies: Req 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 8. Implement `Axe_Runner` in `packages/core/src/runner/axe.ts`
  - Create `packages/core/src/runner/axe.ts` and export `runAxe(page: Page): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[]; error?: CollectionError }>`
  - Import `AxeBuilder` from `@axe-core/playwright`
  - Configure with `runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }`
  - Wrap `.analyze()` in a `Promise.race` with a 30-second timeout; on timeout or any thrown error, return `{ violations: [], incomplete: [], error: { step: "axe", message: ... } }`
  - Normalize each `Result` to `AxeViolation`: map `id`, `impact`, `tags`, `description`, `helpUrl`, and `nodes` (each to `{ html, target, failureSummary }`); coerce any `impact` value not in `["minor","moderate","serious","critical"]` to `null`
  - Discard `passes` and `inapplicable`; return only `violations` and `incomplete`
  - Write integration test in `packages/core/tests/axe.test.ts` against `apps/cursed-shop/index.html`: assert returned `violations` array is non-empty and each violation has `id` (string), `impact` (valid value or null), `nodes` (array with ≥1 entry)
  - Acceptance: integration test passes
  - _Satisfies: Req 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 9. Implement computed style collection in `packages/core/src/runner/browser.ts`
  - Add `collectTextNodeStyles(page: Page): Promise<{ textNodeStyles: Record<string, TextNodeStyle>; elementCursorStyles: Record<string, string>; errors: CollectionError[] }>` to `browser.ts`
  - Visible text nodes: nearest element ancestor has non-zero bounding box, `visibility !== "hidden"`, `display !== "none"`, `opacity > 0`
  - For each visible text node collect `color`, `background-color`, `font-size`, `font-weight`; resolve transparent `background-color` by walking up DOM ancestors until a non-transparent color is found or `<body>` is reached; fall back to `rgb(255,255,255)`
  - Process in batches of at most 100 nodes per `page.evaluate` call; if any batch `page.evaluate` does not resolve within 10 seconds, record a `CollectionError` for that batch and continue
  - Collect `cursor` style for elements with matching `EventListenerSignal` entries; store in `elementCursorStyles` keyed by `backendDOMNodeId`
  - Write integration test in `packages/core/tests/styles.test.ts` against `apps/cursed-shop/index.html`: assert `textNodeStyles` is non-empty; assert at least one entry has valid `color` and `backgroundColor` strings
  - Acceptance: integration test passes
  - _Satisfies: Req 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10. Implement event listener signal collection in `packages/core/src/runner/browser.ts`
  - Add `collectEventListeners(page: Page): Promise<{ signals: EventListenerSignal[]; errors: CollectionError[] }>` to `browser.ts`
  - Open (or reuse) a CDP session; iterate up to 5,000 DOM nodes; call `DOMDebugger.getEventListeners` with `includeAncestors: false` for each node
  - Retain only nodes with at least one listener of type `click`, `mousedown`, `pointerdown`, or `pointerup` registered directly on that node
  - On per-node CDP error, skip that node and append a `CollectionError` with `step: "event-listeners"` and the node's `backendDOMNodeId`
  - If the CDP session is unavailable or the command cannot be issued for the page, set `signals: []` and append a single session-level `CollectionError`
  - Write integration test in `packages/core/tests/event-listeners.test.ts` against `apps/cursed-shop/index.html` (or a small fixture with known click handlers): assert at least one `EventListenerSignal` with a non-empty `eventTypes` array
  - Acceptance: integration test passes
  - _Satisfies: Req 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. Implement page metadata collection in `packages/core/src/runner/browser.ts`
  - Add `collectPageMetadata(page: Page, axNodes: AXNode[]): Promise<{ metadata: PageMetadata; imgAltAttributes: Record<string, string | null> }>` to `browser.ts`
  - `htmlLang`: read `document.documentElement.getAttribute('lang')` via `page.evaluate`; record raw string or `null`
  - `headings`: collect all `h1`–`h6` elements in DOM order; for each, record `tagName`, zero-based `domOrderIndex`, and `accessibleName` looked up from `axNodes` by `backendDOMNodeId`
  - `landmarkRoles`: scan `axNodes` for roles in `["main","navigation","banner","contentinfo","complementary","region","form"]`; deduplicate and record as array
  - `imgAltAttributes`: for every `<img>` element, record `alt` attribute as `null` (absent) or string (present, including `""`) in `RawAudit.imgAltAttributes`
  - Write integration test in `packages/core/tests/metadata.test.ts` against `apps/cursed-shop/index.html`: assert `htmlLang` field exists (string or null); assert `headings` array is non-empty; assert `landmarkRoles` contains at least one recognized role
  - Acceptance: integration test passes
  - _Satisfies: Req 9.1, 9.2, 9.3, 9.4_

- [x] 12. Implement DOM-to-AX visibility mapping in `packages/core/src/runner/browser.ts`
  - Add `buildDomAxMapping(page: Page, axNodes: AXNode[]): Promise<{ mapping: DomAxMapping[]; errors: CollectionError[] }>` to `browser.ts`
  - Single `page.evaluate` call over `document.querySelectorAll('*')` collecting: bounding box (`width > 0 && height > 0`), `visibility`, `display`, `opacity`, `aria-hidden` attribute (walking ancestors), `role` attribute, `tabindex`, `contenteditable`, tag name
  - For each visible DOM node: `hasAxNode` = whether a `AXNode` with matching `backendDOMNodeId` and `ignored === false` exists; `ariaHidden` = `aria-hidden="true"` on node or any ancestor; `isPresentational` = `role` attribute is exactly `"presentation"` or `"none"`; `isFocusable` = `tabindex >= 0` or native interactive element type
  - If `axNodes` is empty (AX tree unavailable), return empty `mapping` with `axTreeUnavailable: true` flag recorded in `errors`
  - Write integration test in `packages/core/tests/dom-ax-mapping.test.ts` against `apps/cursed-shop/index.html`: assert `mapping` is non-empty; assert at least one entry has `ariaHidden: true` for an element that carries `aria-hidden="true"` in the fixture
  - Acceptance: integration test passes
  - _Satisfies: Req 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 13. Implement `Tab_Walker` in `packages/core/src/runner/tab-walker.ts`
  - Add `Tab_Walker` class (or `walkTabs` exported function) to `tab-walker.ts`, building on the pure helpers from task 4
  - Pre-walk: count focusable elements via `page.evaluate`; compute step cap with `stepCap(focusableCount)`; enumerate `backendDOMNodeId` values of all focusable elements
  - If `focusableCount === 0`, return `{ steps: [], trapDetected: false, stepCapReached: false, cycles: [] }` immediately
  - Walk loop: before each step, capture `before` styles (`outline`, `outline-width`, `outline-offset`, `box-shadow`, `border-color`, `background-color`, `text-decoration`) via CDP; press `Tab`; read `activeElement` via CDP; capture `after` styles; record `TabStep`; if CDP read fails for a step, set `cdpError: true` on the step and continue
  - Stop walk if `activeElement` is `body` or no element is focused
  - Cycle detection: when `runWalk` sees an id repeat inside the current segment, run escape test (`Escape` then `Shift+Tab`, read `activeElement`); if result is outside cycle node set, mark cycle `escapable: true` and resume; if result is inside cycle node set (or no focus), set `trapDetected: true`, populate `trapRegionNodeIds`, stop walk
  - Stop walk when step cap is reached; set `stepCapReached: true`
  - Write integration test in `packages/core/tests/tab-walker.test.ts` using `@playwright/test` against `apps/cursed-shop/checkout.html`: assert `tabWalkResult.trapDetected === true`; assert `tabWalkResult.trapRegionNodeIds.length > 0`
  - Acceptance: integration test passes
  - _Satisfies: Req 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

- [x] 14. Implement public API and `RawAudit` assembly in `packages/core/src/index.ts`
  - Replace placeholder `index.ts` with the full implementation
  - `auditUrl(url: string, options?: AuditOptions): Promise<RawAudit>`:
    - Validate: `new URL(url)` throws → rethrow as `TypeError`; scheme not `http:`/`https:` → throw `TypeError`
    - Pre-launch SSRF check: `policy.shouldBlock(url)` → throw `SsrfBlockedError` if blocked (before any pool acquire)
    - If `options?.safeFetchPolicy` is provided use it; otherwise select `RestrictiveSafeFetchPolicy` (default) or `PermissiveSafeFetchPolicy` (`allowPrivate: true`)
    - Acquire browser slot from pool; create context; install resource-usage tracking via `page.on('response', ...)` to populate `ResourceUsage` and throw `AuditResourceLimitError` when limits exceeded (>500 requests or >50 MB total); abort per-resource responses >10 MB and record in `abortedResources`
    - After navigation and screenshot, run all six collectors in parallel (`Promise.all`): `collectAxTree`, `runAxe`, `collectTextNodeStyles`, `collectEventListeners`, `collectPageMetadata`, `buildDomAxMapping`; non-fatal errors from each are collected into `collectionErrors`
    - Run `walkTabs` after parallel collection
    - Assemble `RawAudit` with `schemaVersion: "1"`, `auditedUrl`, `auditedAt: new Date().toISOString()`, base64-encoded `screenshotPng`, `viewportWidth: 1280`, `viewportHeight: 900`, and all collected fields
    - Enforce 60s overall timeout; throw `AuditTimeoutError` with `operation: "full-audit"` if exceeded
    - Always close context in `finally`; always release pool slot in `finally`
  - `auditHtml(html: string, options?: AuditOptions): Promise<RawAudit>`:
    - Throw `HtmlSizeError` if `Buffer.byteLength(html, 'utf8') > 10_485_760`
    - Start a local in-process `http.createServer` on a random port; serve the HTML at `/`; call `auditUrl('http://localhost:{port}/', options)` then shut down the server in `finally`
  - Write integration tests in `packages/core/tests/index.test.ts` using `@playwright/test` against both `apps/cursed-shop/index.html` and `apps/cursed-shop/checkout.html`:
    - Assert `schemaVersion === "1"`
    - Assert `collectionErrors` is empty
    - Assert `screenshotPng` is a non-empty string
    - Assert `viewportWidth === 1280` and `viewportHeight === 900`
    - Assert every `BoundingBox` has non-zero `backendDOMNodeId`
    - Assert `JSON.parse(JSON.stringify(rawAudit))` is deep-equal to original (JSON round-trip safety)
    - Assert `auditHtml` with HTML > 10 MB throws `HtmlSizeError`
    - Assert `auditUrl` with invalid URL throws `TypeError`
    - Assert `auditUrl` with `file:` scheme throws `TypeError`
  - Acceptance: all integration tests pass
  - _Satisfies: Req 1.1, 1.2, 1.5, 1.6, 1.7, 1.8, 1.11, 1.12, 3.1, 3.2, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 12.1–12.6, 13.1, 13.2, 13.5, 13.6, 13.7, 14.1, 14.2, 15.1, 15.4, 15.5, 15.7_

- [x] 15. Write determinism test for `auditUrl`
  - Add `packages/core/tests/determinism.test.ts` using `@playwright/test`
  - Call `auditUrl` twice on the same `apps/cursed-shop/index.html` fixture URL in sequence (not concurrently)
  - Null out both `auditedAt` fields (replace with `"__PLACEHOLDER__"`) and both `resourceUsage.responseTimings` arrays (replace with `[]`) before comparison
  - Assert `JSON.stringify(normalised1) === JSON.stringify(normalised2)` for all remaining fields
  - Assert `screenshotPng` from both runs is byte-for-byte identical (direct string comparison)
  - Start the local file server once using a `beforeAll` fixture; shut it down in `afterAll`
  - Acceptance: test passes on two consecutive runs in the same environment
  - _Satisfies: Req 12.6_

- [x] 16. Final checkpoint — ensure all tests pass
  - Run `tsc --noEmit` in `packages/core` and verify exit 0
  - Run `vitest --run` in `packages/core` and verify all Vitest unit/property tests pass
  - Run `playwright test` in `packages/core` and verify all integration tests pass (tasks 7–15)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP (none in this plan — all tests are required by the spec's testing strategy)
- Each task references specific requirements for traceability
- Tasks 4, 5, 6 build the foundation layers; tasks 7–13 add collectors in parallel-safe order; task 14 wires everything together
- The classifier boundary (`classifier/` must never import from `runner/`) is NOT enforced by a TypeScript path alias (the `@runner/*` alias was removed; there is no CI yet). It will be enforced by ESLint `no-restricted-imports` plus a test in the haunting-classifier spec that asserts no classifier file imports from `runner/`. No task here touches `classifier/`.
- The cursed-shop fixtures already exist in `apps/cursed-shop` (`index.html`, `product.html`, `checkout.html`, `img/`, `expected-hauntings.json`, `verify.mjs`) — they were vibe-coded with no spec. Integration tests (tasks 7–15) load them via the shared `packages/core/tests/fixtures/shop-server.ts` file server.
- Implementation notes from run 11 (2026-11-21, written by Claude Code at the teammate's direction):
  - The task 9–12 collectors live in `src/runner/collectors.ts` and are re-exported from `browser.ts`.
  - `collectTextNodeStyles(page, signals)` takes the listener signals for cursor styles, so `auditUrl` runs it after `collectEventListeners`. The other collectors still run in parallel.
  - `trapRegionNodeIds` is the trap region element (the members' dialog, else their common ancestor) followed by the cycle members. This satisfies both `design.md` (cycle ids) and the golden file's `cursedLoopMatch` rule.
  - `TabWalkResult` gains `walkStartedAtMs` and `endReason`; `TabCycle` gains `includesAllFocusables`.
  - `auditHtml` binds 127.0.0.1, not localhost, and uses an origin-scoped allow wrapper (`OriginScopedPolicy`).
  - Per-resource bytes over 10 MB are recorded in `abortedResources` from `content-length`; mid-stream aborting is left to the safe-fetch spec.
  - The determinism test also normalises `walkStartedAtMs` and Chromium-allocated ids (DOM and AX), which differ per renderer. A screenshot SHA mismatch is recorded, not failed (amendment 6).
  - `safe-fetch.ts` aborted with the invalid code `'blocked'`, so a blocked request threw "Route is already handled". It now uses `'blockedbyclient'`.
- Implementation notes from run 19 (2026-11-24, Kiro adopting tasks 5–16; findings refer to `docs/brief/review-notes/audit-engine-review-1.md`):
  - Req 5.2 is amended: AX nodes with no DOM node (list markers, generated text, `<details>` internals, `InlineTextBox`) are kept with `backendDOMNodeId: 0` instead of failing the audit (finding 4).
  - Req 11.8 stands as written: no focused element after the escape test is a trap (finding 7). A walk that cannot run (`focusableIds`, repeated Tab failures, a failed escape test) ends with `endReason: 'cdp-error'` and never invents a trap.
  - The walk resets focus before it starts: it blurs the focused element at every level and parks the Tab starting point at the top of the document, then reads the unfocused `before` styles (findings 5, 6). The "no-transition" rule is applied through CDP `CSS.createStyleSheet`, which a page's CSP cannot block (findings 2, 17).
  - The deepest focused element is read through open shadow roots and same-origin frames. When focus stays on an iframe or shadow host across Tab presses it is treated as moving inside it, not as a cycle (finding 1). `TabDriver` gains `prepare()` and `isComposite()`.
  - The element focused by the escape test's `Shift+Tab` is recorded as a step and counts toward the cap (findings 8, 18). A failed Tab press is recorded as a step with `backendDOMNodeId: ''` and `cdpError: true`.
  - `adjacent-background-color` accepts any serialized colour (oklch, lab, color()); alpha is read from the `/ a` component (finding 9).
  - `auditUrl` races every stage against an `AuditGuard` (`src/audit-guard.ts`). A timeout, a renderer crash (`crash`/`close` events), a browser disconnect or a resource limit rejects the waiting stage, so the context is always closed and the pool slot always released (findings 3, 15). A walk failure becomes `CollectionError { step: 'tab-walk' }`.
  - Resource limits are enforced by `runner/resource-limits.ts`: bytes come from CDP `Network.dataReceived`, so chunked bodies count; requests are counted before they leave the policy wrapper, and every request after a breach is blocked (finding 16). A navigation that never reaches network idle throws `AuditTimeoutError('navigation')`.
  - Test seam: `auditUrlWithHooks(url, options, { onPageCreated })` is exported from `audit.ts` for crash tests only; `index.ts` does not export it.
- Implementation notes from run 19b (2026-11-24, finishing the adoption; findings 1-24 are in `audit-engine-reverify-1.md`, 25-47 in `audit-engine-review-1.md`). **Spec deviations and decisions:**
  - **Req 11.8 amended (finding 7).** No focused element after the escape test is a trap only while the cycle's elements are still in the document and rendered. If they were removed or hidden (a dialog that closes on Escape), the user escaped, the cycle is `escapable: true` and the walk goes on with a fresh segment. hauntings.md section 5 wins over the older wording. `TabDriver.anyShown(ids)` reads this. The new test shapes are `escape-removes-dialog.html` and `escape-hides-dialog.html` (escapable) against `escape-to-body.html` (trap).
  - **Pre-walk focus (findings 5, 6).** `prepare()` now swallows focus events while it resets focus, and parks the Tab starting point inside the open modal `<dialog>` if there is one (a modal makes `body` inert). It is still not a guarantee, so `runWalk` reads `activeElement` afterwards and records a focused element from the pre-walk set as the first step; its baseline comes from `TabDriver.unfocusedStyles` (focus events swallowed, `blur()`, read, `focus()`), never from a plain read while it holds focus. Covered by `focusin-trap.html`, `focusin-trap-window.html` (a window-capture handler that defeats the swallow, so the fallback runs), `dialog-modal.html` and checkout.html's modal input.
  - **Composites (finding 1).** Presses inside an iframe or shadow host are counted per host and are not steps. At 50 presses the host's step gets `compositeTruncated: true`; 50 further presses without leaving end the walk with `endReason: 'composite-stuck'` and a `CollectionError { step: 'tab-walk' }` (`walkTabsWithErrors`). `trapDetected` stays false: the contents of a cross-origin frame or closed shadow root cannot be read from outside, so a trap there cannot be confirmed. The brief asked for a 50 sub-cap then a move past with Tab; the extra 50 presses to move past are my choice for the number.
  - **New `endReason` values:** `composite-stuck`, `navigated` (`Page.frameNavigated` on the main frame), `cycle-repeated` (an escapable member set entered a second time: focus can only leave it backwards; `trapDetected` stays false). `TabWalkEndReason` is now a named type.
  - **`TabCycle` (finding 28).** `includesAllFocusables` now means the cycle members are every focusable; `allFocusablesVisited` is the old cumulative meaning. `escapable` is optional and only set when the escape test ran. `TabStep` gains optional `compositeTruncated` and `baselineUnavailable`.
  - **Baselines (findings 23, 25, 26).** A focusable outside the pre-walk set gets its baseline on demand, with `:focus-within` forced on its ancestors through `CSS.forcePseudoState` so a submenu does not collapse. Requirement 11.5 now describes the real pre-walk set (visible, enabled, not inert, iframes included). A baseline that cannot be read is flagged `baselineUnavailable` or `cdpError`, never a silent `{}`.
  - **Focus styles (finding 27).** `outline-offset`, `border-style` and `border-width` are captured (11.4 and the design list them). The test key list was updated.
  - **`detectCycle` and `CycleResult` are deleted (finding 20).** `runWalk` is the one cycle implementation. Design properties 1-3 and task 4 were re-pointed at `runWalk`; `walk.test.ts` now asserts exact `nodeIds` and `startStepIndex` for a random repeat index, and the Req 11.7 segment reset.
  - **Pool (findings 15, 36, 37).** A context that resolves after the audit has failed is closed. A failed launch dispatches the next waiter. `acquire()` queues whenever the queue is not empty, and `release()` hands the slot to the queue before waiting for an old browser to close.
  - **Resource metering (finding 16).** Playwright cannot address flattened child sessions, so out-of-process iframes and workers are metered with `Target.setAutoAttach { flatten: false }` on the page session plus `Target.sendMessageToTarget` (recursively, with `Network.enable` per child). This is a deviation from the requested `flatten: true`; the behaviour (every child's `Network.dataReceived` is counted) is the same. Tests: a cross-origin iframe and a dedicated worker, each 3 x 20 MB.
  - **Collectors (findings 12, 19, 30-33, 46).** Element lists are kept as remote objects and passed by objectId (no `window` globals); `backendIdsOf` throws on an exception. Visibility filtering moved into the batches of 100, and `checkVisibility({ opacityProperty: true })` replaces the own-opacity check. The enumeration of text-owning elements (no layout read) and the one-off "painters" scan (every element that paints media, an image, a gradient or a colour, kept on the list object) are each one page call under the 10 s timeout, not 100 nodes per call; this is a deviation from Req 7.5 taken to avoid scrolling the audited page. Text is uncertain when a painter that is neither an ancestor nor a descendant covers the text's centre (`elementsFromPoint` cannot see below the fold or through `pointer-events: none`, so geometry is used). Layers are not ordered by z-index: any overlapping painter makes the text uncertain. `collectEventListeners` records a `CollectionError` when the 5,000-node cap truncates the page.
  - **Audit (findings 38-41).** `blockedRequests` are recorded where the policy decides, with its own reason or `policy-error`. `auditHtml` replaces its random `127.0.0.1:<port>` with `127.0.0.1:0` everywhere in the audit (text replacement over the JSON form), so two runs are equal. `RawAudit` has no `undefined`-valued keys any more (`AXValue.value` and `AXNode.parentId` are optional). A failing `listen` becomes an `Error`.
  - **`index.ts` (finding 42)** exports the public contract by name (plus `getPool`, which the haunting-classifier fixture capture needs). A test pins the export list.
  - **Test seams in `AuditHooks`:** `onBrowserAcquired` and `walk` were added next to `onPageCreated`.
  - **Seen, not fixed (outside the findings):** `collectBoundingBoxes` in `browser.ts` pairs element rects with ids by index from two snapshots and throws on a count mismatch, so a page that adds or removes elements at load time can fail `loadPage`. A page that only reorders elements is fine.
  - **Known limits:** a trap inside a cross-origin frame or closed shadow root ends as `composite-stuck` and is never `trapDetected`. Layers with `pointer-events: none` are found by geometry only. Per-node listener CDP errors (Req 8.4) have no test of their own.- Property tests (tasks 4 and 6) use `fast-check` and must each run a minimum of 100 iterations as required by the testing strategy in the design document

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "4", "5"] },
    { "id": 3, "tasks": ["6"] },
    { "id": 4, "tasks": ["7", "8", "9", "10", "11", "12"] },
    { "id": 5, "tasks": ["13"] },
    { "id": 6, "tasks": ["14"] },
    { "id": 7, "tasks": ["15"] },
    { "id": 8, "tasks": ["16"] }
  ]
}
```
