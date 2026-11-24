# Product-lead final consistency check: spirit-sight-ui spec (before the build)

Date: 2026-11-24. Method: 3 finders (design.md first half, design.md second half, tasks.md executability) and a skeptical verifier. **63 confirmed items.** The main cause: amendments were **appended** next to stale sections instead of replacing them, so design.md (about 135 KB) contains both versions.

## 1. [blocker] .kiro/specs/spirit-sight-ui/design.md (+ requirements.md 5.7, tasks.md 1.3/1.4) (design 173-180, 233-238, 441-446; requirements 93; tasks 76-82, 118)

**Problem:** Contradicts decision H and cannot work with the real core. Design: "Serve apps/cursed-shop statically at /haunted/" and "If `demo`, build `url = http://127.0.0.1:${PORT}/haunted/<page>.html`" with "new OriginScopedPolicy(`http://127.0.0.1:${PORT}`, new RestrictiveSafeFetchPolicy())". H says: serve at `/cursed-shop/`, and the hosted demo audits `https://<host>/cursed-shop/`, a public URL. In real core (packages/core/src/audit.ts), the policy has no `mode`, so it is treated as restrictive. startEgress() then starts the SsrfGuardProxy with bypass '<-loopback>', which sends loopback through the proxy. The public API cannot pass allowAuthorities. So the OriginScopedPolicy pre-check passes, but navigation to 127.0.0.1 is refused and surfaces as SsrfBlockedError. selectPolicy() also returns the explicit safeFetchPolicy before it looks at allowPrivate, so even UNSEEN_DEV_ALLOW_PRIVATE=1 does not rescue demo jobs. The Phase-1 slice ('submit a Cursed Shop demo') and the tasks 1.4 integration test will fail.

**Keep:** Decision H: serve apps/cursed-shop at `/cursed-shop/`. The demo audits the public URL `https://<host>/cursed-shop/<page>.html` with the default restrictive policy. Locally and in e2e only, UNSEEN_DEV_ALLOW_PRIVATE=1 means allowPrivate:true (permissive), and the server refuses to start with it under NODE_ENV=production. Never pass an explicit safeFetchPolicy for demos.

**Remove:** The `{ demo }` body that builds a 127.0.0.1 URL, the `/haunted/` prefix, `isDemo = job.url.startsWith('http://127.0.0.1')`, and the OriginScopedPolicy wrapping in design 233-238 and 441-446, requirements 5.7, and tasks 1.3/1.4. Requirements 3.8 ('never passing an allowPrivate or policy option') also conflicts with 5.7 and must be reconciled to H.

## 2. [blocker] .kiro/specs/spirit-sight-ui/design.md (114; 553; (2220-2296 second half))

**Problem:** Line 114 says speech is "Built from `buildSpeechTrack(audit.raw)` (exported by core)", and build-samples calls `buildSpeechTrack(classified.raw), // from core`. That function does not exist in core. Decision I relies on the classifier's `announce()`, but packages/core/src/index.ts exports neither `announce`, `announceNote` nor `classify`. No task (tasks.md only has 1.1 onProgress as a core change) adds buildSpeechTrack to classifier/speech.ts or exports it publicly. Task 1.2 (build-samples) and 2.2 (Whisper) will stall on an import that does not exist. The prompt also requires imports only from the public entry.

**Keep:** Add an explicit core task, next to Task 1.1, to implement `buildSpeechTrack(raw): SpeechLine[]` in packages/core/src/classifier/speech.ts (using `announce`/`announceNote`). Export it and the `SpeechLine` type by name from packages/core/src/index.ts, with a test, and record it in the audit-engine Notes like onProgress.

**Remove:** The claim that it is already 'exported by core' with no task behind it.

## 3. [blocker] .kiro/specs/spirit-sight-ui/design.md (97, 1289-1300, 1336-1346)

**Problem:** The screenshot source is stale. The data contract says "Screenshot PNG (base64) | `audit.raw.screenshotPng`", and rendering uses `src={`data:image/png;base64,${audit.raw.screenshotPng}`}`. But the worker (467) and build-samples (544) set `raw.screenshotPng: ''`, and routing line 54 serves the PNG at `/api/{audit|samples}/:id/screenshot.png`. As written, the `<img>` is blank. `pngSize(base64)` also uses Node `Buffer.from(...)` in browser code (no Buffer in the Vite SPA), and it would be fed ''. requirements.md 8.1 has the same stale wording ("display the base64 PNG screenshot from `ClassifiedAudit.raw.screenshotPng`").

**Keep:** Decision D/B: `<img src="/api/{audit|samples}/:id/screenshot.png">`, intrinsic size from img.naturalWidth/naturalHeight on load. A pure pngSize helper, if kept, takes bytes (Uint8Array/atob) and has no Buffer.

**Remove:** Data-contract row 97, the data: URL src at 1337, the Buffer-based pngSize at 1292-1299, and requirements 8.1's base64 wording.

## 4. [blocker] .kiro/specs/spirit-sight-ui/design.md (786-923 vs 124-350)

**Problem:** There are two 'API Layer Design' sections, and the second (old) one contradicts the amended one and decision C. Old: "// Rate limiting (production only) if (NODE_ENV === 'production') { server.register(rateLimitPlugin) }" (global). New: "server.register(rateLimitPlugin, { global: false })". Old has `scriptSrc: ["'self'", ...VITE_HASHES]` (undefined), `{ level: 'debug', prettyPrint: true }` (pino no longer supports prettyPrint, so startup fails), `path.join(__dirname, '../../dist/client')` (no __dirname in ESM), `server.register(healthRoutes)` plus "Route: GET /health" vs new "GET /api/health", and GET /api/samples returning full `Sample[]` with `result: ClassifiedAudit` loaded from `apps/web/src/server/samples/*.json` vs new metadata-only list from `apps/web/samples/index.json`. requirements.md is also self-contradictory on health: 1.4 "`GET /health`" vs 2.9/14.5 "`GET /api/health`".

**Keep:** Lines 124-350 (global:false, route-level limit on POST /api/audit only, /api/health, metadata-only /api/samples, samples in apps/web/samples/). Fix requirements 1.4 to /api/health.

**Remove:** Delete design 786-923 entirely; edit requirements 1.4.

## 5. [blocker] design.md (2546, 2550, 2564, 2573, 2587-2588, 2598)

**Problem:** The KeyboardWalk code does not match the real core types, so it fails typecheck or matches nothing. TabStep.backendDOMNodeId is a string (types.ts:118) and BoundingBox.backendDOMNodeId is a number, so `b.backendDOMNodeId === step.backendDOMNodeId` (2546, 2550, 2587) never matches: there are no boxes and no ghost, and the '.tab-ghost' self-audit/e2e checks at 3463 and 3717 fail. `loop.nodeIds.includes(step.backendDOMNodeId)` (2564) passes a string to number[]. `cycle.members.some(m => m.backendDOMNodeId ...)` (2573): TabCycle has no `members`, only `nodeIds: string[]`. `n.backendNodeId` (2588): AXNode has `backendDOMNodeId`. `scale` (2598) is never defined in the component.

**Keep:** Real fields: Number(step.backendDOMNodeId) for box lookups; cycle.nodeIds (strings); node.backendDOMNodeId; scale passed in from the shared Spirit Sight stage.

**Remove:** cycle.members, node.backendNodeId, and the string-to-number === comparisons.

## 6. [blocker] design.md (2220-2246, 2251-2299 (vs 114, 553; tasks.md 44, 270; core index.ts))

**Problem:** The Whisper Walk has two speech-track definitions and depends on a core export no task creates. 2228 `buildSpeechTrack` (core) and the inline UI copy at 2278-2296 each define SpeechLine. 2251 `import { announce } from '@the-unseen/core' // Will be exported after this spec adds it`, but index.ts exports neither announce nor buildSpeechTrack. tasks.md has no task that adds buildSpeechTrack to classifier/speech.ts or exports it (only Task 1.1 onProgress touches core), yet tasks 44 and 270 and design 553 call it. Both copies also use the nonexistent `node.backendNodeId` (2235, 2238, 2284, 2287, 2290); the real AXNode field is backendDOMNodeId.

**Keep:** Decision I, Req 13.1 and the data contract at 114: core exports `buildSpeechTrack(raw): SpeechLine[]` and the SpeechLine type from the public entry (add a core task with a test, like Task 1.1). The UI then overrides text with haunting.speech for haunted nodes and highlights them.

**Remove:** The inline duplicate track builder and duplicate SpeechLine type in WhisperWalk (2253-2258, 2276-2299), the direct `announce` import, and every backendNodeId.

## 7. [blocker] design.md (2797-2802, 2822-2829, 2845-2849, 2395, 2592 (vs 24-40, 76-87))

**Problem:** App.tsx only has `<Route path="/audit/:jobId" element={<SpiritSightView />} />` and `/sample/:sampleId`. It has no /keyboard, /whisper or /daylight sub-routes and no 404 route. getViewName and the h1 table cover only Landing, Séance and Spirit Sight. The Routing section (24-40) says these routes render `AuditResultView` with sub-routes '/keyboard', '/whisper', '/daylight', and 87 says a `NotFoundView` handles unmatched routes. The walks also title themselves with h3 ('<h3>Hear What They Hear</h3>' at 2395, '<h3>Follow the Tab Key</h3>' at 2592), while 79-80 require h1 'Keyboard Walk: {hostname}' / 'Whisper Walk: {hostname}', which the self-audit (3462-3465) and e2e (3716) assert.

**Keep:** Decision F and 20-87: AuditResultView on /audit/:jobId/* and /sample/:sampleId/* with the four sub-views, NotFoundView, one h1 per view, and view names for every route.

**Remove:** The 4-route <Routes> block, and the h3 view titles in WhisperWalk/KeyboardWalk (make them h1 or move the h1 into AuditResultView).

## 8. [blocker] design.md (3248-3329 (vs 1385-1447))

**Problem:** The old FogToggle section was not replaced. 3257 keeps state in FogToggle's own useState, but 1444 says '`spiritSightOpen` boolean state lives in `SpiritSightView`'. 3274-3276 `aria-label="Toggle Spirit Sight"` shows the visible text '👁️ Spirit Sight' / '🌫️ Normal View'; Decision A (1389) and the e2e test (3709) want one 'Open Spirit Sight' button, and 'Normal View' breaks label-in-name. 3297-3298 fills a flat hard-coded 'rgba(142, 138, 168, 0.3)'; Decision A wants value-noise tinted from --color-mist via getComputedStyle, a 64px feathered band, overlays fading in by box.y, and a status line. The CSS clip-path 'alternative' (3309-3328) and the file entry `FogToggle.tsx` (4118) keep the same stale component alive.

**Keep:** 1385-1447 (The Spirit Sight Signature Moment).

**Remove:** The whole 'Spirit Sight Fog Toggle Animation' section (3248-3329) and FogToggle.tsx in the file tree.

## 9. [blocker] design.md (4076-4102, 4121 (vs 2853-2936))

**Problem:** The old '## Keyboard Shortcuts' section is still present. It registers `window.addEventListener('keydown', ...)` with `if (e.key === '?' ...) openShortcutsDialog()` in KeyboardShortcutsDialog.tsx and claims 'Only `?` (a punctuation key) is used'. That contradicts 2929-2931 ('The app does NOT implement single-character keyboard shortcuts (e.g. pressing `?` ...)'), Decision L, and Req 30.4 ('no document-level key handlers except Escape inside an open dialog'). Separately, tasks.md has no task that builds the 'Keyboard help' button or dialog.

**Keep:** 2853-2936 (a visible 'Keyboard help' button and dialog, no single-character shortcuts).

**Remove:** 4076-4102 and `KeyboardShortcutsDialog.tsx` in the file tree (4121). Add a tasks.md item for KeyboardHelpButton.

## 10. [blocker] design.md (3458-3468, 3438-3447 (vs 1389, 1427-1439))

**Problem:** The self-audit's Spirit Sight route check cannot pass as written. 3460-3461 expects `checkElement: 'button[aria-label*="Nameless Spirit"]' // Haunting overlay present` right after `page.goto('/sample/cursed-shop-index')`. Per Decision A, 1389 and Req 12.8, 'All haunting overlays are absent from the DOM' until 'Open Spirit Sight' is clicked. Also, `auditAndClassify(url, ...)` (3485) loads the route in its own fresh browser, so the zero-haunting assertion always audits the closed state and never the overlay buttons, ring and labels that Decision F wants proven. '.tab-ghost' (3463) depends on the KeyboardWalk type fixes.

**Keep:** Decision F: assert the view actually rendered (overlays present, h1), then audit it.

**Remove:** The bare goto-then-check for overlay buttons. The test must click 'Open Spirit Sight' first. The spec also needs a way to audit the opened state, for example a URL-addressable open state, or the self-audit will never cover overlays.

## 11. [blocker] tasks.md (tasks.md 120 vs 124; design.md 301, 464-474)

**Problem:** The screenshot is stripped before it is stored, then read from the stored copy. Line 120 says executeJob 'strips the screenshot from the result (result.raw.screenshotPng = '') and updates the job with... the stripped result'. Line 124 says GET /api/audit/:id/screenshot.png 'extracts the PNG buffer from result.raw.screenshotPng (which is still base64 in the full job, only stripped in the GET response)'. Design 464-474 also stores only the stripped result. The screenshot endpoint therefore returns an empty body: live audits show no image, and Task 1.4's 'returns a PNG' test fails.

**Keep:** Decision D: the screenshot is served separately. On completion, store `screenshot: Buffer.from(classified.raw.screenshotPng, 'base64')` on the Job. Store the result with raw.screenshotPng = ''. The screenshot route serves job.screenshot as image/png, and returns 404 when the job is missing or not done.

**Remove:** tasks.md 124's '(which is still base64 in the full job, only stripped in the GET response)'.

## 12. [blocker] tasks.md (tasks.md 88-89 vs design.md 242; design.md 853-856)

**Problem:** Queue-full ordering contradicts the job-lifecycle fix (decision N). Task 1.3 says 'return 202 { id } immediately (before enqueueing)' and 'The job is enqueued after the response is sent; if queue.enqueue throws QueueFullError, delete the job and return 503'. A 503 cannot be sent after the 202. The stale design copy (853-856) says the same.

**Keep:** design.md 242: 'Enqueue job before replying (if queue.enqueue throws QueueFullError, delete job and return 503)', then 202.

**Remove:** tasks.md 88-89 wording, and the duplicate design section at 841-872.

## 13. [blocker] tasks.md (tasks.md 26, 231, 233, 377, 379, 416, 418, 425-426)

**Problem:** The checkpoint commands do not work in this repo. npx forwards `-w <ws>` to the tool and runs at the repo root; I checked this by running npx with an argv-echo script, which received ["--run","-w","@the-unseen/core"]. So `npx vitest --run -w @the-unseen/core` runs root vitest with -w (= --watch) and the filter '@the-unseen/core', which matches no test files. `npx playwright test -w @the-unseen/core` / `-w apps/web` fails on an unknown option -w. Every checkpoint fails, so the implementer stalls or 'fixes' it in its own way.

**Keep:** Use npm scripts: `npm test -w @the-unseen/core`, `npm run test:integration -w @the-unseen/core`, `npm run typecheck -w @the-unseen/core`. For apps/web, define `test` (vitest --run) and `test:e2e` (playwright test) in its package.json, as requirements 27.3 and 28.5 say, and call `npm run test:e2e -w apps/web`.

**Remove:** All `npx vitest ... -w` and `npx playwright test -w` forms.

## 14. [blocker] tasks.md (tasks.md 32-58 (first apps/web task), 80, 152, 192; requirements.md 386)

**Problem:** apps/web does not exist, and no task scaffolds it. Missing: package.json (name, `@the-unseen/core` workspace dep, react, react-dom, react-router-dom, vite, @vitejs/plugin-react, fastify, @fastify/helmet, @fastify/rate-limit, @fastify/static, sharp, tsx, focus-trap-react, @fontsource/*, vitest, @testing-library/react, jsdom, fast-check, @playwright/test); tsconfig.json; tsconfig.server.json (named by the build script at line 80); vite.config.ts with a /api proxy to the Fastify port; vitest.config with include `src/**` (decision F); playwright.config.ts (testDir ./e2e, webServer). Task 1.2's checkpoint `npm run typecheck -w apps/web` runs before any package.json exists. The `npm run dev -w apps/web` checkpoints (152, 192) cannot load /api/samples without a Vite proxy and a separately started API. Requirements 25.4 states the proxy backwards ('Fastify proxies /api/*').

**Keep:** Add a Task 1.0 that scaffolds apps/web with the files above. The Vite dev server proxies /api to Fastify. Vitest include is `src/**`, and Playwright lives in apps/web/e2e.

**Remove:** requirements.md 386 'Fastify proxies `/api/*`'.

## 15. [blocker] tasks.md / design.md / requirements.md (tasks.md 227-229, 373-375; design.md 3442, 3460-3461, 3481; requirements.md 337, 422)

**Problem:** The self-audit is specified in contradictory ways, and none of the versions can pass. Tasks 1.8 and 3.4 audit the Vite dev server (`http://127.0.0.1:5173/...`) with no rendered-view assertion, which contradicts decision F. The design (3432+) correctly uses the production Fastify build, but its Spirit Sight route asserts `button[aria-label*="Nameless Spirit"]` is visible right after page.goto. Under decision A, overlays are absent until 'Open Spirit Sight' is clicked, so that assertion fails. auditAndClassify also opens a fresh page, so the overlay state is never audited. The design ROUTES also omit /seance/:id and the 404 view (F says every route). Requirements 22.1 and 28.4 still use `?view=daylight` instead of `/daylight`.

**Keep:** Decision F with design 3432-3497: production build served by Fastify, every route (/, /seance/:id with a seeded job, /sample/:id, /keyboard, /whisper, /daylight, 404). For Spirit Sight, assert the h1 and the 'Open Spirit Sight' button before auditing. Add an explicit decision on how the revealed overlay state is audited, for example a `?reveal=1` test param or a Playwright axe check after clicking.

**Remove:** tasks.md 227-229 and 373-375 (5173 / dev server). Remove the overlay check without a click at design 3461. Remove `?view=daylight` in requirements 337 and 422.

## 16. [major] .kiro/specs/spirit-sight-ui/design.md (925-1047 vs 352-497)

**Problem:** There are two 'Audit Job Queue' sections. The old worker calls `auditUrl(...)` then `classify(result)`, but `classify` is not a public export. It uses `allowPrivate: false, safeFetchPolicy: new RestrictiveSafeFetchPolicy()`, the non-functional `update(id, patch)`, and `stages: { ...job.stages, [stage]: Date.now() }`, which closes over a stale `job` and drops earlier stages. The old store has no `queued` timestamp. The Data Flow Diagram (730-732: "auditUrl(@the-unseen/core) ... classify(raw)") repeats the stale design.

**Keep:** Lines 352-497 (auditAndClassify with onProgress(stage, atMs), functional `update(id, updater)`), with the timestamp fix in the next item.

**Remove:** Delete design 925-1047 and fix the diagram at 730-732 to read auditAndClassify.

## 17. [major] .kiro/specs/spirit-sight-ui/design.md (470-474)

**Problem:** The job-lifecycle timestamp bug (decision N) is still in the amended worker. `jobStore.update(jobId, () => ({ status: 'done', result: resultWithoutPng, stages: { ...job.stages, done: Date.now() } }))` spreads `job` captured at line 438, before the audit started. This erases the loading/tree/walking/classifying timestamps that onProgress wrote, so the Séance elapsed-times and the tasks 1.4 test 'stages progress in order' fail. The same stale pattern also appears in the error branch (no stages kept).

**Keep:** Use the functional form everywhere: `jobStore.update(jobId, (j) => ({ status: 'done', result, stages: { ...j.stages, done: Date.now() } }))`.

**Remove:** `...job.stages` from the closure.

## 18. [major] .kiro/specs/spirit-sight-ui/design.md (174-180, 150-163)

**Problem:** Line 173 promises 'no helmet, so inline scripts work', but the code cannot deliver it. (1) Helmet is registered at the root (fastify-plugin, global by default), so its CSP `scriptSrc: ["'self'"]` also applies to routes in the child context. All three cursed-shop pages rely on an inline `<script>` and `onclick=` handlers (index.html:1063, product.html:879/665), so the shop's JS-driven hauntings would not reproduce. (2) `prefix: '/haunted/'` inside a plugin registered with `{ prefix: '/haunted' }` doubles the prefix to /haunted/haunted/.

**Keep:** Serve the shop at `/cursed-shop/` (decision H) in a context that has no helmet CSP. Either register helmet only inside the API/SPA encapsulated context, or set helmet `global: false` and enable it per route. Use a single prefix.

**Remove:** The nested double prefix, and the claim that the current registration is helmet-free.

## 19. [major] .kiro/specs/spirit-sight-ui/design.md (1062-1078, 1149-1160, 1201, 1224, 765)

**Problem:** The old routing duplicates contradict the routing section at 20-87 and decision F. Old: `<Route path="/spirit-sight/:id" element={<SpiritSightView />} />`, "Spirit Sight toggles to Daylight mode (same route, state change)", Séance `navigate(`/spirit-sight/${id}`)`, and the sample card "Navigate directly to `/spirit-sight/:id` with the cached `ClassifiedAudit` (no network request)". New (20-63): `/audit/:jobId` and `/sample/:sampleId` with /keyboard, /whisper, /daylight sub-routes, a NotFoundView, and data fetched from `GET /api/samples/:sampleId` (the list is metadata only, so there is no cached audit to pass).

**Keep:** Lines 20-87 (decisions D and F): Séance navigates to `/audit/:jobId`, sample cards link to `/sample/:id`, Daylight is the `/daylight` sub-route, plus the 404 route.

**Remove:** Delete 1062-1078 and 1149-1160, and rewrite 1201, 1224 and diagram line 765 to the new paths.

## 20. [major] .kiro/specs/spirit-sight-ui/design.md (1861-2001)

**Problem:** A stale duplicate of haunting treatments 4-10 sits under a corrupted heading. '## Haunting Sidebar' (1861) is followed by an orphaned fragment of an old Fog rect (`fill="url(#fog-pattern)"`, 1862-1868), then old versions of Lost Soul, Cursed Loop, Invisible Wanderer, Whispering Field, Silent Tongue, Shattered Order and The Veiled. These conflict with 1660-1857: old Cursed Loop uses `haunting.cycle?.escapable` (no such field), old Silent Tongue is a bare `<text>` that is not aria-hidden, and old Veiled uses `url(#thick-fog-pattern)` opacity 0.9 vs new solid ink at 0.7. A second '## Haunting Sidebar' exists at 2038.

**Keep:** Treatments 1576-1857 (with the fixes below) and the real Haunting Sidebar at 2038.

**Remove:** Delete 1861-2001, keeping computeFogDensity only if it is moved into The Fog section and reconciled (see the fog item).

## 21. [major] .kiro/specs/spirit-sight-ui/design.md (2005-2035 vs 1451-1566)

**Problem:** A stale 'Keyboard-Accessible Overlays' section contradicts the amended Overlay Layer and decision J. Old: `<foreignObject x={box.x} y={box.y} width={box.width} height={box.height}>` with the visual treatment inside the button, `aria-label={`${haunting.type}: ${haunting.explanation}, ${haunting.severity}`}` (raw enum and explanation), focus `outline: 2px solid var(--color-ecto)`. New: aria-hidden visual group plus a separate 24px button, name `"<Display name>: <element>, <severity>"`, dual-tone ring.

**Keep:** 1451-1566 (decision J).

**Remove:** Delete 2005-2035.

## 22. [major] .kiro/specs/spirit-sight-ui/design.md (1352, 1468-1479, 1529-1539)

**Problem:** The overlay buttons break decision J and WCAG 2.5.8 as specified. (1) The SVG has `style={{ ... pointerEvents: 'none' }}`, and the doc claims buttons get "`pointer-events: auto` (the default for `<button>` inside `<foreignObject>`)". pointer-events is inherited, so the buttons inherit none and cannot be clicked. (2) The buttons are 24 units inside an SVG whose `viewBox` is the PNG size and whose CSS size is `scaledWidth`. At scaleFactor 0.5 the hit area renders as 12×12 CSS px, but the text claims "at least 24×24 CSS pixels". (3) Hauntings with `box: null` (Silent Tongue, Shattered Order no-h1/no-main) reach `box.x` with no guard, and the sort comment "Null boxes last" returns 0, which does not put them last.

**Keep:** Set `pointer-events: auto` explicitly on the buttons (or the foreignObject). Size them `24 / scaleFactor` in viewBox units, or render buttons in an HTML layer positioned at scaled coords. Skip the screenshot button for null-box hauntings (sidebar only) and sort nulls last explicitly.

**Remove:** The 'default for button inside foreignObject' claim and the fixed 24-unit size.

## 23. [major] .kiro/specs/spirit-sight-ui/design.md (1797-1806 (and requirements 9.8))

**Problem:** The new Silent Tongue treatment puts real text in an aria-hidden subtree: `<g aria-hidden="true" className="silent-tongue-visual"> ... <text ...>⚠ The spirits speak a garbled tongue (missing lang attribute)</text>`. This violates decision J ("No real text over the screenshot"), the design's own rule at 1447 and requirements 12.9 ("NO `aria-hidden` subtree SHALL contain text nodes"). The self-audit may flag the app's own page as The Veiled (aria-hidden content with visible text). requirements 9.8 ('banner stating "The spirits speak a garbled tongue"') pushes toward the same mistake.

**Keep:** Decision J: the banner is a shape only (ember band, no text). The words live on the overlay or sidebar button's visible text and accessible name.

**Remove:** The `<text>` element, and requirements 9.8's wording that implies on-screenshot text.

## 24. [major] .kiro/specs/spirit-sight-ui/design.md (1695, 1709)

**Problem:** Cursed Loop escapability keys off a field that does not exist for this haunting: `className={... (haunting.kind === 'inescapable' ? 'cursed-loop-glow' : 'cursed-loop-pulse')}`. In classifier/types.ts, `kind` is "ShatteredOrder only". So every loop, including true traps, gets the 2-pulse class, and decision K's "true Cursed Loop circles with the ember ring until the user stops it" never happens. Line 1695 also says escapable cycles pulse twice, but K says it circles once, then breaks free.

**Keep:** Derive escapability from `audit.raw.tabWalkResult` (trapDetected / cycles[].escapable matched by haunting.nodeIds). Use a continuous ember ring for a trap and a single circuit for an escapable cycle (decision K).

**Remove:** `haunting.kind === 'inescapable'` and the '2 pulses' rule.

## 25. [major] .kiro/specs/spirit-sight-ui/design.md (1394, 1435-1438)

**Problem:** The signature-moment acceptance test contradicts its own spec. Step 1: "label becomes 'Close Spirit Sight'". The test then asserts `screen.getByRole('button', { name: 'Open Spirit Sight', pressed: true })`, which fails because the name has changed. Decision A and requirements 12.1/12.6 define one 'Open Spirit Sight' button whose state is carried by aria-pressed (changing both the label and aria-pressed is also an AT anti-pattern).

**Keep:** Decision A: a constant label 'Open Spirit Sight' that toggles only `aria-pressed`. The test as written then passes.

**Remove:** The "label becomes 'Close Spirit Sight'" rule (and "label 'Open Spirit Sight'" restore wording at 1425).

## 26. [major] .kiro/specs/spirit-sight-ui/design.md (503-525, 535-539, 315 (vs tasks 40-53, requirements 87/92))

**Problem:** The build-samples pseudo-code does not match the real fixture or the tasks. `import { createServer } from '../tests/fixtures/shop-server.js' // from core/tests/fixtures` and `await createServer(4173)` with a hard-coded `http://127.0.0.1:4173/`. The real file is packages/core/tests/fixtures/shop-server.ts (TypeScript, not in core's dist), which exports `startShopServer()` on a random port and returns `{ baseUrl, close }`. A plain .mjs cannot import it as written. Thumbnails also disagree: design writes `samples/${id}-thumb.png` and `thumbnailUrl: /api/samples/${id}/thumbnail.png`, tasks use `-thumb.jpg` / `thumbnail.jpg` (image/jpeg), and requirements 5.1 names the field `thumbnail` and 5.5 the script `generate-samples.ts`.

**Keep:** Decision D: build-samples.mjs serves apps/cursed-shop itself (or a compiled copy of the fixture) and uses the returned baseUrl, not port 4173. Choose one thumbnail format, field name and URL across the three files; tasks.md's `.jpg` + `thumbnailUrl` is what the implementer will follow.

**Remove:** The `createServer(4173)` import, the PNG thumbnail paths in the design, and `generate-samples.ts` / `thumbnail` in requirements 5.

## 27. [major] .kiro/specs/spirit-sight-ui/design.md (574-607, 611-700)

**Problem:** A splice artifact leaves a stale component-API block. Line 574 runs prose straight into code: "(after `npm run build -w @the-unseen/core`).// Haunting Overlay". A headless, unopened code block of old component interfaces follows (`HauntingOverlay(props: { haunting; onClick })` vs 1355 `<HauntingOverlay haunting scale>`). Then come the old `useScale(screenshotWidth, screenshotHeight, containerRef)` and `computeScale(screenshotWidth, screenshotHeight, containerWidth, containerHeight)`, with a `ScaleState` that has containerHeight, which contradicts decision B's `computeScale(pngWidth, pngHeight, containerWidth)` at 1313.

**Keep:** 1302-1327 (decision B: width-fit, 3-arg computeScale, pngWidth/pngHeight).

**Remove:** 574-700, or rewrite them to match the amended signatures and close the broken fence.

## 28. [major] design.md (2512-2515, 2539-2543, 2575-2579, 2717-2721)

**Problem:** The literal KeyboardWalk logic never plays. play() calls setPlaybackState('playing') and then animateStep(currentStep), which immediately checks `if (playbackState !== 'playing' ...) { setPlaybackState('stopped'); return }` against the stale closure value 'stopped'. Escapable-cycle circling is left as a placeholder: '// (Simplified: just announce the break)' and `hasCircledBefore(...) { ... return false // Placeholder }`. That gives the implementer no algorithm for Decision K's 'circles once, then breaks free'.

**Keep:** Decision K behaviour, with an explicit step-sequencing design: a ref or reducer for the playback state, and a defined circle-once expansion of cycle.nodeIds.

**Remove:** The stale-closure playback guard and the placeholder hasCircledBefore.

## 29. [major] design.md (2564-2568, 2750, 2752 (vs requirements 14.5/14.6, tasks 298-299))

**Problem:** The Cursed Loop and cycle behaviour conflicts three ways. Design 2566-2568 and 2752 say: on reaching a Cursed Loop node, announce 'Cursed Loop: keyboard users cannot leave this dialog' and stop immediately. Req 14.6 and tasks 299 say 'the ghost circles at most 3 times ... and the walk stops with the status "Trapped: keyboard users cannot leave this dialog"'. Decision K says 'A true Cursed Loop circles with the ember ring until the user stops it.' Escapable cycles: design 2750 says 'circles the cycle members once' (matches K), but Req 14.5 and tasks 298 say 'circles the members twice'.

**Keep:** Decision K: escapable cycles circle once and break free; a true Cursed Loop keeps circling with the ember ring until the user presses Pause or Stop (this also satisfies 2.2.2). Use one status string everywhere.

**Remove:** Design's 'walk stops' on the first loop node; '3 times' and 'twice' in requirements and tasks.

## 30. [major] design.md (2583, 2754 (vs Decision K))

**Problem:** Under reduced motion the Keyboard Walk still auto-advances. 2583 `const stepDuration = reducedMotion ? 300 : 300 / speed` and 2754 'the step interval is still 300 ms ... Manual step mode ... is unaffected'. Decision K says 'Reduced motion: manual step mode, never a 0 ms timer', so reduced motion means the user steps by hand, not a 300 ms auto-timer. Req 14.3 carries the same stale wording.

**Keep:** Decision K: under reduced motion, Play is replaced by manual Step back / Step forward and no auto timer runs.

**Remove:** The 300 ms auto-advance under reduced motion (2583, 2754, Req 14.3).

## 31. [major] design.md (1717-1718 vs 2727-2728, 2650)

**Problem:** The same CSS class `.cursed-loop-pulse` has two definitions. 1717-1718: `animation: pulse 1s ease-in-out 2; /* 2 cycles for escapable */`. 2727-2728: `animation: cursed-pulse 2s ease-in-out infinite;`. KeyboardWalk (2650) applies 'cursed-loop-pulse' to every CursedLoop haunting. Whichever stylesheet loads last wins, so a true Cursed Loop either stops after 2 pulses or an escapable one pulses forever.

**Keep:** Distinct class names: an infinite ember ring for a true Cursed Loop (per K), a finite pulse for escapable cycles.

**Remove:** One of the two `.cursed-loop-pulse` definitions.

## 32. [major] design.md (2865-2866, 2413-2418, 2999 vs 3144/3241 (vs 2973-2984))

**Problem:** Several new controls break the design's own label-in-name rule (Decision L, 2975 'accessible name SHALL include the button's visible text as a substring'). 2865-2866 `aria-label="Keyboard shortcuts help"` with visible '⌨️ Keyboard help': 'Keyboard help' is not a substring. 2413-2418 `aria-label="Previous utterance"` with visible 'Back', and `aria-label="Next utterance"` with visible 'Forward'. The Daylight layout (2999) shows '[Export Markdown] [Export JSON]', while 3241 sets `aria-label="Export as Markdown"`. The self-audit would flag these.

**Keep:** 2973-2984: drop the aria-labels or make them contain the visible text ('Keyboard help', 'Back', 'Forward', 'Export as Markdown' as visible text).

**Remove:** The mismatched aria-labels.

## 33. [major] design.md (2992 (with requirements 16.1/16.8/18.5, tasks 213) vs 1414-1419)

**Problem:** 2992 says Daylight 'is the default mode when `prefers-reduced-motion: reduce` is set', and tasks 213 redirects the Spirit Sight view to /daylight. Decision A and 1414-1419 define a reduced-motion Spirit Sight: 'a CSS filter: saturate(0.7) brightness(0.9) ... All overlays at once'. With the redirect, that variant is unreachable on load, and /sample/:id under reduced motion renders h1 'Daylight report', not the 'Spirit Sight:' the self-audit and e2e expect. Req 16.1 '`?view=daylight`' also conflicts with the Decision F sub-route '/daylight' used at 2990.

**Keep:** Decisions A and F: the base route stays Spirit Sight, with the reduced-motion variant; Daylight lives only at .../daylight.

**Remove:** The 'default to Daylight under reduced motion' rule (2992, Req 16.8, Req 18.5, tasks 213) and '?view=daylight' (Req 16.1).

## 34. [major] design.md (3974-3976, 3992-3997, 3649-3652, 4137)

**Problem:** The Data Models use deep imports: `from '@the-unseen/core/classifier/types'` and `from '@the-unseen/core/types'`. The amend prompt says 'Import only from @the-unseen/core's public entry', and index.ts already exports all of these types. `type Sample` (3992-3997) has no `speechTrack`, while 329-335 and tasks 45 include `speechTrack: SpeechLine[]`. The token test says '// ... implementation in @the-unseen/core/src/classifier/contrast.ts' with an empty function body, and the file tree has 'contrast.ts # Re-export from core'. Core does not export a contrast function publicly, so the implementer must either deep-import (forbidden) or stall.

**Keep:** Imports from '@the-unseen/core' only. Sample includes speechTrack. A local WCAG luminance/contrast helper in apps/web/src/client/utils/contrast.ts, which also serves Property 2.

**Remove:** Deep-path imports, and 'Re-export from core' for contrast.

## 35. [major] design.md (3835, 3848, 3863, 3897 (vs 3983, 286; tasks 123))

**Problem:** Product States read 'Job status is "error" and `error.code` is "NETWORK_ERROR"...' and display `{error.message}`. The status response type is `{ status: 'error'; error: string; message: string }` (3983, 286; tasks 123: `"error": <code>, "message": <message>`). `error` is the code string, so `error.code` and `error.message` are undefined, and the UI would show no message and never match SSRF_BLOCKED or TIMEOUT.

**Keep:** The response shape in 3983, 286 and tasks 123: the UI switches on `response.error` and shows `response.message`.

**Remove:** `error.code` / `error.message` in Product States.

## 36. [major] design.md (3818-3823 (vs Decision N, Req 31.3, tasks 358))

**Problem:** The clean-site copy conflicts. Design says '"No hauntings detected"' plus '"This page passed all automated checks. ... Manual testing is still required for full compliance."' and Daylight '"No automated violations found"'. Tasks 358 has a third variant. Decision N fixes the text as 'No hauntings found by automated checks; a manual review is still needed'. Req 31.3 bans 'compliant' and requires the needs-manual-check list on that screen, which design does not mention.

**Keep:** The Decision N wording, used everywhere (Spirit Sight, Daylight, the live-region announcement), plus the needs-manual-check list.

**Remove:** 'passed all automated checks', 'for full compliance', 'No automated violations found', and the tasks 358 variant.

## 37. [major] design.md (3570-3574, 3568-3592 (vs Decision B, 3622-3635))

**Problem:** Property 1 was not updated. It says 'the scale factor SHALL be the minimum of the width ratio and height ratio'. Decision B fits to width (`scale = min(1, containerWidth / pngWidth)`, with the stage scrolling vertically), and the unit test in the same section calls `computeScale(1280, 900, 640)` with no container height. The fast-check property Decision B requires, for boxes below the first viewport, is missing from the property list.

**Keep:** Decision B and the 3-argument computeScale.

**Remove:** 'minimum of the width ratio and height ratio'. Add the below-the-fold box property.

## 38. [major] design.md (4058-4071 (vs 2359-2362, Decision I, Req 13.8))

**Problem:** A component test expects `vi.spyOn(window, 'alert')` and `expect(mockAlert).toHaveBeenCalledWith(expect.stringContaining('Sound is disabled'))`. Decision I says 'No alert()', Req 13.8 says 'no alert SHALL block playback', and WhisperWalk play() (2359-2362) turns sound on instead. Implementing the test literally forces an alert back in.

**Keep:** Req 13.8 and the 2359-2362 behaviour. Test that Play with sound off enables sound and that captions advance, with no alert.

**Remove:** The 'respects sound disabled state' alert test.

## 39. [major] tasks.md (tasks.md 14-24)

**Problem:** onProgress is concrete but emits at the wrong moments. Task 1.1 emits 'loading' when page load completes and 'tree' when AX collection completes. The worker sets status = stage on each call, so during the real page load the status stays 'queued', and the Séance shows 'Loading page…' while the tree is being read (one stage late). The review fix (finding 5/8) emits at stage start: before loader.loadPage (audit.ts 212), before collectAxTree (280), before walkOrRecord (296), and in auditAndClassify between auditUrl and classify. It also wraps each call in try/catch so a throwing callback cannot fail the audit; the task omits this. The 'property test that calls auditAndClassify' needs a browser, so it belongs in an *.int.spec.ts run by `npm run test:integration -w @the-unseen/core` (or by using auditHtml).

**Keep:** Emit each stage at its start, guarded by try/catch. Export `OnProgressCallback` (or AuditStage) by name from src/index.ts. Add an integration spec that asserts exact order, one call per stage, and that a throwing callback is ignored.

**Remove:** 'When the page load completes' / 'When the AX tree collection completes' / 'When the Tab walk completes' wording.

## 40. [major] tasks.md / requirements.md (tasks.md 181; requirements.md 164)

**Problem:** The overlay accessible name has two formats. Task 1.6 and requirements 10.2 say `"[Haunting Display Name]: [role] at [name or landmark], [severity]"`, e.g. 'Nameless Spirit: button named Add to cart, Wraith'. Decision J and design 1484-1499 say 'Nameless Spirit: Add to cart button, Wraith'. Task 181 also says 'a `<button>` element inside the SVG with `role="button"`'. A bare <button> in the SVG namespace is not an HTML button; the design wraps it in <foreignObject>.

**Keep:** Decision J / design 1487-1499: `${displayName}: ${elementNameOrRole}, ${severity}`, rendered as an HTML <button> in <foreignObject>.

**Remove:** tasks.md 181's format and example, and requirements.md 164's format.

## 41. [major] design.md / tasks.md (design.md 3570-3574, 3609-3636; requirements.md 413; tasks.md 442)

**Problem:** Decision B's property-test changes were not made. Property 1 still says 'the scale factor SHALL be the minimum of the width ratio and height ratio' (height-fit), which contradicts the width-only fit in computeScale (1313-1327). There is no fast-check property for boxes below the first viewport. No task implements any Vitest or fast-check UI test (requirements 21, 27: token contrast, computeScale, orderOverlays, overlayLabel), yet the Final Checkpoint (442) relies on 'verified by the design token test'.

**Keep:** Property 1: scale = min(1, containerWidth/pngWidth), with the height derived from it. Add a property that a box with y ≥ the first viewport maps to y*scale inside scaledHeight. Add a task for the Vitest unit and property tests and the token-contrast test.

**Remove:** 'minimum of the width ratio and height ratio' at design.md 3572.

## 42. [major] design.md / tasks.md (design.md 2395, 2407-2419, 4058-4071, 2359-2362; tasks.md 271, 277, 280, 337)

**Problem:** The Whisper Walk contradicts decision I. I calls for one 'Hear what they hear' button as the user gesture, but the design and tasks use a Play/Pause set, and 'Hear What They Hear' is only an h3. The component test at 4058-4071 asserts `alert('Sound is disabled')`, against I's 'No alert()'. Play calls the global toggleSound(); under Task 3.2 that global toggle starts the ambient drone, while requirements 33.3 says the header toggle controls drone and chimes, not Web Speech. The Task 2.2 / 3.5 e2e steps 'wait for the first utterance to complete' without the speechSynthesis stub from requirements 28.6, so headless Chromium may never fire onend.

**Keep:** Decision I: one 'Hear what they hear' start button, captions mirroring every utterance, and step/back/pause on a timer when sound is off. Speech has its own enable flag separate from the drone. E2E stubs speechSynthesis via addInitScript.

**Remove:** design.md 4058-4071 alert test, and the toggleSound() call in play (2359-2362).

## 43. [major] tasks.md (tasks.md 140, 149)

**Problem:** Task 1.5 contradicts decision L. Line 149: 'When a route changes, focus moves to `#main`'. L, design 2762-2785, requirements 124 and task 2.1 line 255 move focus to the h1 and announce the view. Line 140's header button has `aria-label="Toggle sound"` with visible text 'Sound on'/'Sound off'; the visible text is not contained in the name (L / 2.5.3). Requirements 19.2 repeats that aria-label.

**Keep:** Decision L / design 2762-2840: focus the h1 (tabIndex -1) and announce through #app-announcer. The sound button's name includes its visible text (e.g. text 'Sound: off' with no aria-label, or aria-pressed with a constant 'Sound' label).

**Remove:** tasks.md 149's #main focus, and the `aria-label="Toggle sound"` in tasks.md 140 and requirements.md 296.

## 44. [major] tasks.md (tasks.md 184, 189-190, 145, 383-418)

**Problem:** The Phase 1 vertical slice (decision N) is not self-contained. Task 1.6's acceptance and test require the haunting detail dialog, but no task builds HauntingDetailDialog (requirements 15 and 23, design 2112-2206, focus-trap-react). Task 1.5's form navigates to /seance/:jobId, which is a Phase 2 view. No Phase 1 task runs the single e2e that N requires (Cursed Shop sample → Open Spirit Sight → overlays + score → Daylight → export). The only full-path e2e is Task 3.5 in Phase 3, and it also depends on both walks.

**Keep:** Decision N: add the dialog to Phase 1, either in Task 1.6 or a new task. Add a Phase 1 e2e at the end of Phase 1: /sample/cursed-shop-index → Open Spirit Sight → overlays and score match samples JSON → /daylight → .md and .json downloads.

**Remove:** Nothing; this is a gap.

## 45. [major] tasks.md / design.md (tasks.md 80; design.md 3515, 3534; requirements.md 427)

**Problem:** The production start commands break on this Windows machine. npm's script-shell is unset (null), so npm runs scripts through cmd.exe, and `"start": "NODE_ENV=production node dist/server/main.js"` fails with 'NODE_ENV is not recognized'. The same applies to the Playwright webServer command at design 3534. The design also uses port 3456 while requirements 28.8 uses 3000.

**Keep:** requirements.md 427: webServer `env: { NODE_ENV: 'production', PORT: '3000' }`. The start script sets nothing inline, or sets NODE_ENV in main.ts / uses cross-env.

**Remove:** Inline `NODE_ENV=... ` prefixes in tasks.md 80 and design.md 3515/3534, and the 3456 port.

## 46. [major] tasks.md (tasks.md 47-48, 55; design.md 315, 538-539, 563; requirements.md 87, 91)

**Problem:** Sample assets are inconsistent. Task 1.2 makes `samples/.gitignore` exclude *.png/*.jpg while the JSON is committed, so a fresh clone or the hosted box has sample JSON but no screenshot, and Spirit Sight for every sample is broken unless build-samples runs again (which needs Chromium and the shop). Thumbnails are JPEG `-thumb.jpg` / `thumbnail.jpg` in the task but PNG `-thumb.png` / `thumbnail.png` in the design. Requirements still say `thumbnail` (not thumbnailUrl) and `scripts/generate-samples.ts`.

**Keep:** Decision D: commit samples/<id>.json together with its .png and thumbnail, or regenerate them in the build. Choose one thumbnail format and use it everywhere. Use apps/web/scripts/build-samples.mjs.

**Remove:** The *.png/*.jpg gitignore at tasks.md 55. Remove `generate-samples.ts` and `thumbnail` in requirements.md 87 and 91.

## 47. [minor] .kiro/specs/spirit-sight-ui/design.md (1636-1653, 1871-1878, 695-696)

**Problem:** The Fog density cannot be implemented from the real types, and its two definitions disagree. Line 1636 says "opacity 0.3–0.8 (computed from contrast deficit)", while the stale `computeFogDensity` maps "deficit [0, target] to opacity [0, 0.8]" (floor 0, not 0.3). `computeFogDensity(contrastRatio, isLargeText)` needs a contrast ratio, but `Haunting` has no contrast field, and core's contrast helper (classifier/contrast.ts) is not publicly exported. The pattern also references `/fog-noise-tile.png`, which no task produces. Line 1446 adds "Perlin or Simplex noise library (e.g. `simplex-noise`)", while decision A specifies value noise.

**Keep:** One computeFogDensity with a stated range (0.3–0.8). It computes the ratio from `audit.raw.textNodeStyles[String(h.nodeIds[0])]` with a UI-side WCAG luminance helper (or a new core export plus a task). The fog tile is generated at runtime from the same value-noise tile as the canvas.

**Remove:** The [0,0.8] mapping, the external PNG asset reference, and the simplex-noise suggestion.

## 48. [minor] .kiro/specs/spirit-sight-ui/design.md (1409, 1419 (vs requirements 12.4/12.5, 124))

**Problem:** The status text and reduced-motion audio diverge. Design: "Spirit Sight open: {N} hauntings found, Haunting Score {score}". Decision A and requirements 12.4: "Spirit Sight open: N hauntings, score S". requirements 7.9 adds a third string, "Audit complete: {n} hauntings found, Haunting Score {score}". Design 1419 says that under reduced motion "no audio plays even if sound is enabled". Decision A and requirements 12.5 only remove the canvas animation, not sound.

**Keep:** Decision A's exact string. Reduced motion affects motion only; the whisper still plays if sound is on.

**Remove:** The variant strings and the reduced-motion audio mute.

## 49. [minor] .kiro/specs/spirit-sight-ui/design.md (1477-1510 (vs requirements 10.2))

**Problem:** The accessible-name format conflicts with requirements 10.2: "[Haunting Display Name]: [role] at [name or landmark], [severity]" (e.g. "Nameless Spirit: button named Add to cart, Wraith"). Decision J and design 1495 use "Nameless Spirit: Add to cart button, Wraith". Design's `elementLabel` returns the whole `haunting.speech` (for a Nameless Spirit that is the unnamed announcement, e.g. just 'button'), or the bare tag name from htmlSnippet, so it yields neither form.

**Keep:** Decision J's format: "<Haunting name>: <element name or role>, <severity>", with the element name/role taken from the AX node for `nodeIds[0]` (axNodes by backendDOMNodeId).

**Remove:** requirements 10.2's 'role at name' format, and the speech-as-label shortcut.

## 50. [minor] .kiro/specs/spirit-sight-ui/design.md (70 (vs requirements 10.6))

**Problem:** There are two 'first focusable' skip links. Design 70: "A skip link 'Skip to main content' as the first focusable element" on every route. requirements 10.6: "a skip link 'Skip to the haunting list' SHALL be the first focusable element on Spirit Sight". Both cannot be first.

**Keep:** Decision F: one 'Skip to main content' link first on every route. If a 'Skip to the haunting list' link is wanted on Spirit Sight, it comes second.

**Remove:** The 'first focusable' claim in requirements 10.6.

## 51. [minor] .kiro/specs/spirit-sight-ui/design.md (365, 375-389 (vs 52, requirements 3.7))

**Problem:** The result retention is inconsistent. The store comment reads "result?: ClassifiedAudit // dropped after 15 min or when LRU evicts (keep at most 50)" and "Also drops result from done jobs older than 15 min". Routing 52 says "/audit/:jobId ... (ephemeral, 1h TTL)" and requirements 3.7 says completed jobs are removed after 1 hour. After 15 minutes a deep link gets `status: 'done'` with no result, a state the GET response type (`{ status: 'done'; result: ClassifiedAudit }`) does not allow. The GET variants also differ from requirements 4 (`{ status: 'not-found' }` vs 404 `{ error: 'NOT_FOUND' }`; queued carries `stages` vs requirements 4.3 without).

**Keep:** One retention rule. If results are evicted early, the job is deleted entirely, so GET returns 404 (handled by NotFound). Align the response shapes with requirements 4.

**Remove:** Keeping the job but dropping only its result.

## 52. [minor] .kiro/specs/spirit-sight-ui/design.md (1239-1246, 1217-1231)

**Problem:** The Séance code will not typecheck or stop correctly. `const STAGE_LABELS: Record<JobStatus, string>` omits 'done' and 'error', a strict-mode TS error that blocks the typecheck checkpoint. The poll interval is cleared only on unmount, so on `status: 'error'` or 404 it keeps polling every 500 ms indefinitely.

**Keep:** `Record<Exclude<JobStatus,'done'|'error'>, string>`, or include all statuses. Stop polling on done, error and 404.

**Remove:** The incomplete Record type.

## 53. [minor] design.md (4106-4146 (vs 2211, 2487, 2990, 24-87; tasks 160, 167, 200, 270, 294))

**Problem:** The Component File Structure is stale. `views/` lists only LandingView, SeanceView and SpiritSightView: no AuditResultView, NotFoundView or DaylightView. Daylight is `components/DaylightReport.tsx` here but `views/DaylightView.tsx` at 2990. WhisperWalk and KeyboardWalk are under components/ (also 2211 and 2487), while tasks 270 and 294 put them under views/. Tasks 167 places SpiritSightView in components/. The tree still lists FogToggle.tsx and KeyboardShortcutsDialog.tsx. Tasks 160 and 200 cite design sections 'Component Architecture > Views > AuditResultView' and '... > DaylightReport', which do not exist.

**Keep:** One tree that matches the Decision F routes: views/AuditResultView, NotFoundView, LandingView, SeanceView; the Spirit Sight, Keyboard, Whisper and Daylight sub-views in one agreed folder. Section names that tasks.md can cite.

**Remove:** FogToggle.tsx, KeyboardShortcutsDialog.tsx, and the conflicting paths.

## 54. [minor] design.md (2339-2371, 2462-2468, 2479)

**Problem:** The Whisper Walk controls have gaps against Decision I. In captions-only mode, advanceCaptionTimer schedules setTimeout chains that pause() never clears (pause only calls speechSynthesis.cancel()), so Pause, Back and Forward do not stop the timer. highlightElement queries `.haunting-overlay-box[data-node-id=...]`, but no overlay renders that class or attribute (buttons are `.haunting-overlay-button`, 1475), and overlays are not mounted unless Spirit Sight is open, so Decision I's 'haunted nodes ... highlighted' never happens. 2479 says 'Speeds above 1× shorten pauses', but the options stop at 1×.

**Keep:** Decision I and Req 13.3/13.6/13.11: a cancellable timer held in a ref, and a highlight that renders its own box from SpeechLine.box inside the shared SVG.

**Remove:** The DOM-query highlight and the un-cancellable caption timer.

## 55. [minor] design.md (3776, 3790, 3792-3804 (vs 1574, 2746))

**Problem:** The Performance section describes a different rendering model. 3776 says 'Base64 PNG decoded by browser', but Decision D serves the screenshot as a separate PNG URL and the sample/job JSON has screenshotPng = ''. 3796-3801 says 'Each overlay uses CSS transform ... `translate(calc(var(--box-x) * var(--scale-factor)) ...)` ... (not the SVG x/y attributes)', while 1574 says 'All positions are in raw screenshot coordinates (SVG viewBox handles scaling)' and 2746 / Req 14.9 require the same viewBox. 3790's clip-path fallback contradicts the Decision A canvas plus CSS-filter design.

**Keep:** viewBox scaling with raw coordinates (1574, 2746) and a screenshot from /api/{audit|samples}/:id/screenshot.png.

**Remove:** 3792-3804 (transform positioning), the base64 bullet at 3776, and the clip-path fallback at 3790.

## 56. [minor] design.md (3557-3566, 4152, 3138)

**Problem:** Leftover text. Docker was deferred to run 16 (Decision G), but an orphan bullet list follows with no heading or lead-in ('- **UI rendering and layout** ... - **Configuration** ...'), and the Summary (4152) still says 'single Docker image'. The coverage-note quote at 3138 ('...Many success criteria require manual testing ... This tool never claims...') is not the real AUTOMATED_COVERAGE_NOTE in classifier/types.ts:90-91 ('Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.'), so a test written from the design text would fail.

**Keep:** G: the Docker note only. Render audit.automatedCoverageNote verbatim and quote the real constant if quoting at all.

**Remove:** The orphan bullets at 3563-3566, 'single Docker image', and the invented coverage-note text.

## 57. [minor] design.md (3515, 3533-3538, 3485)

**Problem:** The self-audit run instructions use POSIX env prefixes: `NODE_ENV=production PORT=3456 node apps/web/dist/server/main.js &` and webServer `command: 'NODE_ENV=production PORT=3456 node dist/server/main.js'`. Playwright runs webServer.command through cmd.exe on this Windows dev machine, so it fails to start. The test body also uses `PORT` (3485) without declaring it.

**Keep:** A cross-platform start (cross-env, or webServer.env: { NODE_ENV: 'production', PORT: '3456' }) and a declared PORT or baseURL.

**Remove:** The inline VAR=value prefixes.

## 58. [minor] design.md (2127, 2186, 2944)

**Problem:** The detail dialog title is `<h2 id="dialog-title">{haunting.type}</h2>` and the Kiro prompt says `Fix this ${haunting.type} haunting`, which render 'NamelessSpirit'. Req 15.2 requires the display name ('Nameless Spirit', not 'NamelessSpirit'). The skip link targets `#haunting-list` (2944), but the sidebar design (2038-2108) defines no element with id="haunting-list".

**Keep:** hauntingDisplayName(haunting.type) in the dialog and the prompt, and id="haunting-list" on the sidebar list.

**Remove:** Raw haunting.type in user-facing text.

## 59. [minor] tasks.md / design.md / requirements.md (tasks.md 358; design.md 3818-3819; requirements.md 461; tasks.md 434)

**Problem:** The clean-site copy contradicts decision N ('No hauntings found by automated checks; a manual review is still needed'). Task 3.3 says 'No hauntings detected. This page passed all automated checks.' Design 3819 says 'passed all automated checks ... for full compliance'. Requirements 31.3 says 'No hauntings detected by automated checks'. The final checkpoint (434) also claims 'The app itself is WCAG 2.2 AA compliant', against the never-claim-compliance rule. The 404 copy also differs: task 356 says 'Audit not found', requirements 31.4 says 'This séance has ended...'.

**Keep:** Decision N wording verbatim, and requirements 31.4's expired-job copy.

**Remove:** tasks.md 358 and 434, and design.md 3819's 'passed all automated checks ... full compliance'.

## 60. [minor] tasks.md / requirements.md / design.md (tasks.md 208; requirements.md 264; design.md 3136-3138)

**Problem:** The coverage note text is invented. Three different literals are prescribed. The real `ClassifiedAudit.automatedCoverageNote` is the core constant 'Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.' (classifier/types.ts 90-91). A test asserting the task 208 text against the rendered `audit.automatedCoverageNote` will fail.

**Keep:** design.md 3132: render `{audit.automatedCoverageNote}` as-is (decision M's 'honest coverage note').

**Remove:** The literal texts at tasks.md 208, requirements.md 264 and design.md 3138.

## 61. [minor] tasks.md / design.md (tasks.md 214; design.md 688, 3032-3045)

**Problem:** Task 1.7's e2e asserts 'the first criterion row contains "1.1.1"', but groupByWCAG returns a Map in haunting insertion order (unsorted), so the first row depends on classifier order. The design also declares two signatures: `groupByWCAG(): WCAGGroup[]` (688) vs `Map<string, Haunting[]>` (3032).

**Keep:** design 3027-3046 semantics (decision M), plus a sort by criterion id; one return type.

**Remove:** The 'first row contains 1.1.1' assertion, or require sorting.

## 62. [minor] tasks.md (tasks.md 315-326; requirements.md 465-473)

**Problem:** Task 3.1 implements 'takes form' through a mock 'Fix' button that removes a haunting from state. Requirements 32 specifies a 'Re-audit this page' flow with a pure `matchHauntings(before, after)` and a fast-check property. The task does not build what the requirement says.

**Keep:** Requirements 32 (decision N: the takes-form animation gets its own task).

**Remove:** The mock 'Fix' button in tasks.md 320/324.

## 63. [minor] design.md (design.md 1127-1137 vs requirements.md 481)

**Problem:** SoundContext persists the sound preference in localStorage ('unseen:sound-enabled'). Requirements 33.3 says sound is off by default and SHALL NOT be persisted across page loads.

**Keep:** requirements.md 481 (not persisted).

**Remove:** localStorage persistence at design.md 1127-1137.
