# Product-lead review: spirit-sight-ui spec (before the build)

Date: 2026-11-24. Method: 3 reviewers (UX and demo, the app's own accessibility, engineering feasibility), each followed by a skeptical verifier. **52 confirmed findings**; 11 rejected.

## 1. [blocker] .kiro/specs/spirit-sight-ui/design.md:969 (ux-demo)

**Issue:** The signature moment does not work. Overlays render before the toggle is pressed, and the fog wave is a flat grey rectangle that reveals nothing. Demo beat 0:00-0:45 ('This store looks fine to you' -> toggle -> half the page fogs over) cannot be filmed.

**Evidence:** design.md 969-976 renders `{audit.hauntings.map(h => <HauntingOverlay .../>)}` with no condition on the toggle state. FogToggle (1832-1834) keeps `spiritSightEnabled` in its own local state, which the overlay never reads. triggerFogWave (1873-1875): `ctx.fillStyle = 'rgba(142, 138, 168, 0.3)' ... ctx.fillRect(0, 0, canvas.width, waveY)` is a hard-edged wash with no noise and no dissolve. It also hardcodes a hex-derived colour, which design-system.md forbids. It looks up `getElementById('spirit-sight-canvas')`, but the SpiritSightView markup (950-977) has no canvas, and design-system.md:100 names it `<canvas id="spirit-sight">`. Brief §8 asks for 'Page elements dissolve into fog in a wave from top to bottom, then the whispers begin', and nothing implements 'then the whispers begin'.

**Fix:** Replace Req 12 and the design section 'Spirit Sight Fog Toggle Animation' with: (1) The Spirit Sight view opens on the clean screenshot ('mortal eyes') with overlays hidden. The single primary button is 'Open Spirit Sight' (aria-pressed=false), and `spiritSight` state lives in SpiritSightView and is passed to the overlay layer and the canvas. (2) On activation, a `<canvas id="spirit-sight">`, absolutely positioned over the screenshot <img> only and sized to its scaled box, draws a 2D value-noise fog (precomputed 256x256 noise tile, scrolled by time, tinted with `--color-mist` read through getComputedStyle). It is masked by a soft-edged band (64px feather) whose leading edge goes from y=0 to y=scaledHeight over 800ms ease-in-out. (3) Each haunting overlay fades in (400ms ease-out, per design-system.md) when the wave front passes its box.y, so ghosts appear in reading order. (4) When the wave ends, focus stays on the toggle. A polite status line says 'Spirit Sight open: N hauntings, score S'. If sound is on, the speech of the first Wraith haunting is spoken through the whisper engine (the toggle click is the user gesture). (5) Reduced motion: no canvas, a CSS `filter: grayscale(0.6) brightness(0.7)` on the <img>, and all overlays at once. (6) Pressing the toggle again hides the overlays and fog instantly. Add an acceptance test: overlays are absent from the DOM before activation and present after it.

**Verifier note:** Confirmed: design.md 969-976 maps every haunting with no toggle condition, FogToggle keeps its spiritSightEnabled state to itself, triggerFogWave looks up an 'spirit-sight-canvas' that no markup renders and paints a flat hardcoded rgba wash, and nothing implements 'then the whispers begin', so the 0:15-0:45 reveal beat cannot happen.

## 2. [blocker] .kiro/specs/spirit-sight-ui/design.md:984 (ux-demo)

**Issue:** The overlay is scaled with the wrong dimensions, so boxes drift on every real page, and the fit rule shrinks a full-page screenshot into a thumbnail. This breaks the core 'never drift' promise and makes Spirit Sight unreadable on stage.

**Evidence:** The resize handler (984-990) calls `computeScale(audit.raw.viewportWidth, audit.raw.viewportHeight, width, height)`, which is 1280x900. The engine takes a full-page screenshot (packages/core/src/runner/browser.ts:346-347 `page.screenshot({ fullPage: true ...})`), so the PNG is 1280 x (page height). The SVG viewBox is `0 0 ${scale.screenshotWidth} ${scale.screenshotHeight}` (961), so everything below y=900 is placed wrongly. computeScale uses `Math.min(containerWidth / screenshotWidth, containerHeight / screenshotHeight)` (932-935): a 1280x4000 page in a 900x700 pane scales to 0.175.

**Fix:** In design.md and Req 8.3: 'Screenshot intrinsic size = the decoded PNG's naturalWidth/naturalHeight (read from the <img> onLoad, or from the PNG IHDR bytes 16-23 in a pure helper `pngSize(base64)`), never viewportWidth/Height. Fit to WIDTH only: scaleFactor = min(1, containerWidth / pngWidth). The stage scrolls vertically inside its own region (overflow-y:auto, tabindex=-1, aria-label="Audited page").' Change the computeScale signature to (pngW, pngH, containerW) and update Property 1 to: 'for all boxes, scaled box = box*scale and the overlay viewBox equals the PNG size'. Add a fast-check property: 'a box at y > viewportHeight maps to a y equal to box.y*scale'.

**Verifier note:** Confirmed: the resize handler passes raw.viewportWidth/Height (1280x900) to computeScale, but browser.ts:346-347 takes a fullPage screenshot, so the image is squashed and every box below 900px lands in the wrong place; the min(w,h) fit also shrinks tall pages to a thumbnail.

## 3. [blocker] .kiro/specs/spirit-sight-ui/design.md:442 (ux-demo)

**Issue:** In production, the rate limiter applies to every route. The Séance polls every 500ms, so each hosted audit hits HTTP 429 within seconds, and the live demo on the hosted box fails.

**Evidence:** design.md 442-445: `if (NODE_ENV === 'production') { server.register(rateLimitPlugin) }` is registered globally. Task 24: 'Register @fastify/rate-limit plugin; Configure: 5 requests/minute per IP'. Séance: 'Client polls every 500ms' (521) means 120 GET /api/audit/:id calls per minute. @fastify/rate-limit is global by default.

**Fix:** Req 2.7 and task 24: 'Register @fastify/rate-limit with `global: false` and attach `config: { rateLimit: { max: 5, timeWindow: "1 minute" } }` plus an hourly limit of 30 (second hook or keyGenerator store) ONLY to POST /api/audit. GET /api/audit/:id, /api/samples*, static files and health are not limited by the audit quota (optionally a separate 300/min limit on GET /api/audit/:id).' Add an integration test: 20 polls in 10s after one POST all return 200.

**Verifier note:** Confirmed: design.md 442-445 registers the rate-limit plugin globally in production, and task 24 sets 5/min per IP while the Séance polls GET /api/audit/:id every 500ms, so every hosted audit hits 429 within seconds.

## 4. [blocker] .kiro/specs/spirit-sight-ui/tasks.md:36 (ux-demo)

**Issue:** The sample path, which is the guaranteed demo path, is broken by design. Sample cards navigate to a job route that 404s, /api/samples ships every full audit (base64 full-page PNGs) to the landing page, and nothing generates the sample JSON, so Kiro would have to hand-write a ClassifiedAudit.

**Evidence:** design.md 827: 'Navigate directly to `/spirit-sight/:id` with the cached ClassifiedAudit (no network request)'. Task 9.2 (156): SpiritSightView does 'Fetch audit result from `/api/audit/:id`'. Sample ids are 'cursed-shop-index' (530), not job UUIDs, so a reload or deep link returns 404. Req 5.2 returns `[{ id, name, url, result: ClassifiedAudit }]` for all 3-6 samples. Task 3.1 says 'Create ... cursed-shop-index.json with pre-audited Cursed Shop home page' and gives no generator. The addendum asks that 'samples render instantly from JSON'.

**Fix:** Req 5 and task 3: (a) Add the script `apps/web/scripts/build-samples.ts`. It serves apps/cursed-shop locally, runs `auditAndClassify(url, { allowPrivate: true })` for index/product/checkout plus the 2-3 public URLs in `samples.config.json`, rewrites `raw.auditedUrl` to the public display URL, writes `samples/<id>.json`, and also writes a 400px-wide JPEG/WebP thumbnail per sample. (b) `GET /api/samples` returns metadata only: `[{id,name,url,score,countsByType,thumbnail}]`. (c) Add `GET /api/samples/:id` -> ClassifiedAudit. (d) Add the SPA route `/sample/:sampleId`. SpiritSightView takes `source: {kind:'job',id} | {kind:'sample',id}`, fetches the matching endpoint, and shows a 'not found' state on 404. Run the script in task 3, before any UI task.

**Verifier note:** Confirmed: sample cards go to /spirit-sight/:id with a sample id, but task 9.2 makes that view fetch /api/audit/:id (404 on reload or deep link); Req 5.2 ships every full ClassifiedAudit with its base64 PNG to the landing page; and task 3.1 gives no generator, so the JSON would be hand-written.

## 5. [blocker] .kiro/specs/spirit-sight-ui/tasks.md:112 (ux-demo)

**Issue:** The spec depends on an `onProgress` option that does not exist in the engine, and no task adds it. Task 6.3 will not type-check, and the Séance cannot show real stages. The addendum explicitly asked for this as a small additive task.

**Evidence:** packages/core/src/types.ts:218-224: `AuditOptions = { allowPrivate?, timeoutMs?, navigationTimeoutMs?, safeFetchPolicy?, viewport? }`, with no onProgress. Worker (design.md 631-643) passes `onProgress: (stage) => ...` in an object literal, which is a TS excess-property error. Prompt 14 addendum point 4: 'Specify it as a small additive task in this spec (runner emits: loading -> tree -> walking -> classifying)'. No task in tasks.md touches packages/core. The worker also calls `auditUrl` + `classify` separately instead of the specified `auditAndClassify` (Req 3.1/3.4).

**Fix:** Add task 0 (before task 6): 'packages/core: add `onProgress?: (stage: "loading"|"tree"|"walking"|"classifying") => void` to AuditOptions. Call it in audit.ts at loadPage start (loading), before collectAxTree (tree), before walkOrRecord (walking), and in auditAndClassify before classify (classifying). Wrap each call in try/catch so a throwing callback cannot fail the audit. Unit test: the stages fire in order exactly once.' Change Req 3.1/3.4 and the design worker to a single `auditAndClassify(job.url, { safeFetchPolicy: new RestrictiveSafeFetchPolicy(), timeoutMs: 60000, onProgress })`.

**Verifier note:** Confirmed: types.ts:218-224 AuditOptions has no onProgress, task 6.3 and design 631-643 pass one anyway (an excess-property type error), no task touches packages/core even though the addendum asked for one, and the worker calls auditUrl plus classify instead of the exported auditAndClassify.

## 6. [blocker] .kiro/specs/spirit-sight-ui/design.md:2029 (app-a11y)

**Issue:** The self-audit test, as specified, will not compile and would audit a server that does not serve the app.

**Evidence:** design.md:2031-2032 `import { auditUrl } from '@the-unseen/core'` / `import { classify } from '@the-unseen/core/classifier'`. packages/core/package.json has no `exports` map (only `main: ./dist/index.js`), and src/index.ts does not export `classify`. It exports only `auditAndClassify, auditUrl, auditHtml`. design.md:2019-2022 runs `webServer: { command: 'npm run dev', port: 3000 }`, but design.md:452-461 serves the SPA from Fastify 'production only', and in dev Vite runs on :5173 (design.md:69). So `auditUrl('http://localhost:3000')` gets the Fastify JSON 404, and the engine throws NonHtmlContentError (browser.ts checks the content-type). The prompt (14, addendum item 3) says 'runs `auditAndClassify` on the built app'. tasks.md:386 repeats 'Start dev server on localhost:3000'.

**Fix:** In design.md 'Accessibility Self-Audit' and tasks.md task 28, replace the imports with `import { auditAndClassify, getPool } from '@the-unseen/core'` and call `auditAndClassify(url, { allowPrivate: true })` (allowPrivate selects PermissiveSafeFetchPolicy, see audit.ts:30). Replace the webServer block with `webServer: { command: 'npm run build && node dist/server/index.js', port: 3000, env: { NODE_ENV: 'production', PORT: '3000' }, reuseExistingServer: false }`. Change task 28 'Start dev server on localhost:3000' to 'Build the SPA and start the production server (NODE_ENV=production) on localhost:3000'. Add `test.afterAll(() => getPool().close())` so the pooled Chromium does not keep the worker alive.

**Verifier note:** Confirmed: design.md:2031-2032 imports a `classify` and a `@the-unseen/core/classifier` subpath that core's index.ts and package.json (main only, no exports map) do not provide, and the webServer `npm run dev` on :3000 serves no SPA (static serving is production-only per design.md:452-461), so the test cannot compile or audit the app.

## 7. [blocker] .kiro/specs/spirit-sight-ui/requirements.md:318 (app-a11y)

**Issue:** Only the landing page is self-audited. Spirit Sight and Daylight are not reachable by URL, so the engine (which only takes a URL) can never audit them. Requirement 22.2 and the prompt's 'zero hauntings on landing, Spirit Sight of a sample and Daylight' cannot be tested. Reloading or deep-linking a sample is also broken in the demo.

**Evidence:** req 22.1 `auditUrl('http://localhost:PORT')` and 28.4 audit only the root, but 22.2 says 'zero hauntings on the Landing, Spirit Sight, and Daylight views'. design.md:827 says a sample card navigates to `/spirit-sight/:id` 'with the cached ClassifiedAudit (no network request)', i.e. router state. tasks.md:156 says SpiritSightView 'Fetch audit result from `/api/audit/:id`', which returns 404 for a sample id after a fresh load. design.md:786 says Daylight is 'same route, state change', so it has no URL. The engine loads each URL in a fresh context and cannot click.

**Fix:** Add requirement 5.6: 'THE Audit_API SHALL accept `GET /api/samples/:id` returning one Sample, and `GET /api/samples` SHALL return only `{id,name,url,score,thumbnail}` per sample.' Add a route `/sample/:sampleId` that loads from `/api/samples/:id`. Change 16.1 to: 'Daylight mode SHALL be reflected in the URL as `?view=daylight` and SHALL render from that parameter on load.' Rewrite 22.1/22.2/28.4 as: 'THE self-audit test SHALL run `auditAndClassify` with `allowPrivate: true` against each of: `/`, `/sample/cursed-shop-index`, `/sample/cursed-shop-index?view=daylight`, `/seance/does-not-exist` (error state), and SHALL assert zero hauntings for each.' Update task 28 with the same list.

**Verifier note:** Confirmed: req 22.2 demands zero hauntings on Spirit Sight and Daylight, but the sample route uses router state (design.md:827), tasks.md:156 fetches /api/audit/:id (which has no sample ids), and Daylight is 'same route, state change' (design.md:786), so a URL-only engine cannot reach those views and deep links or reloads break.

## 8. [blocker] .kiro/specs/spirit-sight-ui/tasks.md:110 (feasibility)

**Issue:** No task adds onProgress to the engine. The worker is written against a core API that does not exist: `onProgress` is not in AuditOptions, and `classify` is not exported. index.test.ts pins the export list, so it cannot be added quietly.

**Evidence:** requirements.md:59 'pass an `onProgress` callback to `auditUrl`'; requirements.md:61 / tasks.md:117 'Call `classify(rawAudit)` from `@the-unseen/core`'; design.md:637 passes `onProgress` inside an object literal to auditUrl. packages/core/src/types.ts AuditOptions has only allowPrivate/timeoutMs/navigationTimeoutMs/safeFetchPolicy/viewport, so this fails with TS2353 excess property. packages/core/src/index.ts exports auditAndClassify but not classify, and src/index.test.ts asserts `Object.keys(api)` equals an exact list. Prompt 14 addendum item 4: 'Specify it as a small additive task in this spec (runner emits: loading → tree → walking → classifying)'. None of tasks 1-32 touches packages/core.

**Fix:** Add a new task 0 before task 6, in packages/core: (a) types.ts: `onProgress?: (stage: AuditStage) => void` on AuditOptions, plus `export type AuditStage = 'loading'|'tree'|'walking'|'classifying'`, also exported as a type from index.ts. (b) audit.ts: emit 'loading' in runAudit right before loader.loadPage, 'tree' right before collectAxTree, 'walking' right before walkOrRecord, and 'classifying' in auditAndClassify between auditUrl and classify. Wrap every call in try/catch so a throwing callback never fails the audit. (c) Add src/audit-progress.test.ts with a fake hook, or an int spec using auditHtml, asserting the exact order and that a throwing callback is ignored. Run the full `npm test -w @the-unseen/core` and `test:integration`. Do not add `classify` to index.ts. Then rewrite Req 3.1/3.4, design.md §Job Worker and tasks 6.3/28: `const result = await auditAndClassify(job.url, { timeoutMs: 60_000, onProgress })`, with no policy fields (the default is the restrictive policy) and no separate classify call.

**Verifier note:** Confirmed: AuditOptions (types.ts:218-224) has no onProgress, index.ts exports auditAndClassify but not classify, and no task touches packages/core, even though the prompt 14 addendum explicitly asks for this additive task.

## 9. [blocker] .kiro/specs/spirit-sight-ui/design.md:444 (feasibility)

**Issue:** @fastify/rate-limit is registered globally, so the Séance's 500 ms polling of GET /api/audit/:id reaches the 5/min limit within about 3 s and every live audit fails with 429. Behind a hosting proxy, request.ip is the proxy's address, so all users share one bucket. A single @fastify/rate-limit route config also cannot express both 5/min and 30/h.

**Evidence:** design.md:442-445 `if (NODE_ENV === 'production') { server.register(rateLimitPlugin) }` (global); requirements.md:47 '5 requests per minute per IP, 30 requests per hour per IP, using `@fastify/rate-limit`'; requirements.md:71 / design.md:521 poll every 500ms; tasks.md:349-351. No `trustProxy` anywhere.

**Fix:** Replace design §Server Factory rate limiting and task 24 with: `fastify({ trustProxy: true, ... })`. Register `@fastify/rate-limit` with `{ global: false }` and attach `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }` only on POST /api/audit. Enforce the 30/hour limit with a small per-IP counter in `src/server/middleware/rate-limit.ts` (a preHandler on the same route). Return 429 with a `Retry-After` header and `{ error:'RATE_LIMIT', retryAfter }`. GET /api/audit/:id, /api/samples and /health are never limited. Register it in every NODE_ENV, with an optional env override such as `UNSEEN_RATE_LIMIT_PER_MIN` for e2e, instead of the `production only` condition. Add a test: 10 GETs to /api/audit/:id inside 1 s all return 200, and the 6th POST in a minute returns 429.

**Verifier note:** Confirmed: task 24 / design.md:442-445 register @fastify/rate-limit globally at 5/min, while the Séance polls GET every 500 ms (design.md:521). Nothing scopes the limit to POST or sets trustProxy, so live audits in production would hit 429.

## 10. [blocker] .kiro/specs/spirit-sight-ui/design.md:2127 (feasibility)

**Issue:** The production server cannot start. Nothing compiles src/server. The CMD runs the factory module, not the listener. __dirname is used in an ESM package. The static root path resolves outside dist/. pino's `prettyPrint` throws at startup. No npm scripts (dev/build/start/test:e2e) are defined, and one tsconfig cannot serve both the NodeNext server and the Vite/JSX client.

**Evidence:** design.md:2127 `CMD ["node", "apps/web/dist/server/server.js"]`, but tasks.md 2.2 puts listen() in `src/server/index.ts`, and server.ts only exports createServer. Task 1 configures Vite to emit only `dist/client`, and no task emits dist/server. design.md:455 `path.join(__dirname, '../../dist/client')`: the root package.json is `"type": "module"`, so __dirname throws, and from dist/server it would resolve to apps/dist/client. design.md:423 `{ level: 'debug', prettyPrint: true }` is rejected by pino ≥7 / Fastify ≥4. Task 1 'apps/web/tsconfig.json extending tsconfig.base.json with client and server paths': the base is NodeNext with no jsx and no DOM lib. design.md:2020 and tasks reference `npm run dev` / `npm run test:e2e`, but no task defines them.

**Fix:** Amend task 1 to create: `tsconfig.client.json` (noEmit, moduleResolution Bundler, jsx react-jsx, lib DOM+ES2022, include src/client and src/shared); `tsconfig.server.json` (extends base NodeNext, rootDir src, outDir dist, include src/server and src/shared); and a `src/shared/api-types.ts` for the AuditStatusResponse types used by both. package.json scripts: `"dev": "concurrently -k \"tsx watch src/server/index.ts\" \"vite\""`, `"build": "vite build && tsc -p tsconfig.server.json"`, `"start": "node dist/server/index.js"`, `"test": "vitest --run"`, `"test:e2e": "playwright test"`, `"typecheck": "tsc -p tsconfig.client.json --noEmit && tsc -p tsconfig.server.json --noEmit"`. Design: `root: fileURLToPath(new URL('../../client/', import.meta.url))`, which resolves dist/server → dist/client. Logger: `logger: NODE_ENV==='production' ? true : { transport: { target: 'pino-pretty' } }`, with pino-pretty as a devDependency. Dockerfile CMD: `["node","apps/web/dist/server/index.js"]`.

**Verifier note:** Confirmed: the CMD runs dist/server/server.js, which only exports a factory (listen() lives in index.ts per task 2.2). __dirname is used in a type:module repo, prettyPrint is rejected by Fastify 4+, and no task compiles the server or defines dev/build/start/test:e2e scripts.

## 11. [blocker] .kiro/specs/spirit-sight-ui/design.md:2086 (feasibility)

**Issue:** The Dockerfile base image is Playwright 1.40, but core pins playwright 1.65.1. At runtime chromium.launch cannot find the 1.65 browser build, so every audit fails in the container. The nodesource step, the build context and the missing .dockerignore also break or poison the build from this Windows machine.

**Evidence:** design.md:2086 / tasks.md:396 `mcr.microsoft.com/playwright:v1.40.0-focal`; packages/core/package.json `"playwright": "1.65.1"`. design.md:2092 installs Node 22 through curl|bash. design.md:2096-2105 copies root package.json and packages/core, so the build context must be the repo root, but design.md:2133 says `docker build -t the-unseen:latest .` with the file at apps/web/Dockerfile. There is no .dockerignore in the repo, so `COPY packages/core` copies the local Windows packages/core/node_modules, dist and test-results over the Linux install. Only core and web package.json files are copied before `npm ci`, but the workspaces also include apps/cursed-shop.

**Fix:** Task 29 / design §Dockerfile: `FROM mcr.microsoft.com/playwright:v1.65.1-noble`, with a comment that the tag must equal packages/core's exact playwright version and that Node 22 is verified by `RUN node -v | grep '^v22'`. Remove the nodesource step. Copy every workspace manifest before `npm ci` (`COPY apps/cursed-shop/package.json apps/cursed-shop/`, and packages/mcp when it exists). Add a root `.dockerignore` with `**/node_modules`, `**/dist`, `**/test-results`, `.git`, `docs`. Build command: `docker build -f apps/web/Dockerfile -t the-unseen .` from the repo root. Run `npm run build -w @the-unseen/core && npm run build -w apps/web`. In HEALTHCHECK use `process.env.PORT` instead of the hardcoded 3000.

**Verifier note:** Confirmed: design.md/tasks.md 29 use playwright:v1.40.0-focal while core pins playwright 1.65.1, so the browser build is missing at runtime. The repo also has no .dockerignore, and the build command does not point at apps/web/Dockerfile from the root context.

## 12. [blocker] .kiro/specs/spirit-sight-ui/design.md:2015 (feasibility)

**Issue:** The test commands collide, and the e2e/self-audit server never serves the SPA. Vitest's default include picks up the Playwright specs, and Playwright's default testMatch picks up the Vitest contrast test. webServer runs `npm run dev` on :3000, where Fastify serves no SPA in development. The jsdom setup file is never created. The e2e browser ignores UNSEEN_CHROMIUM_CHANNEL, which this Windows machine needs.

**Evidence:** design.md:2015-2023 `testDir: './tests'`, `webServer: { command: 'npm run dev', port: 3000 }`, while static serving is 'production only' (design.md:452). The self-audit of '/' would therefore hit a 404 JSON page (NonHtmlContentError). design.md:2223-2229 has no `include`, so Vitest's default `**/*.{test,spec}.?(c|m)[jt]s?(x)` matches tests/self-audit.spec.ts and tests/e2e/*.spec.ts. Playwright's default testMatch also matches tests/contrast.test.ts (design.md:2295), which imports vitest. `setupFiles: './tests/setup.ts'` is never created by any task, and jsdom lacks speechSynthesis, matchMedia and ResizeObserver, which design.md:2579 spies on. docs/brief/review-notes/local-env.md: headless shell missing, use channel 'chromium'. packages/core/playwright.config.ts reads UNSEEN_CHROMIUM_CHANNEL.

**Fix:** design §Testing and tasks 1/28/31: vitest.config `include: ['src/**/*.test.{ts,tsx}']`, with contrast.test.ts moved to src/client/utils/contrast.test.ts. playwright.config: `testDir: './e2e'`, `testMatch: '**/*.spec.ts'`, `use: { baseURL: 'http://127.0.0.1:3000', channel: process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium' }`, `webServer: { command: 'npm run build && npm run start', url: 'http://127.0.0.1:3000/health', env: { NODE_ENV: 'production', PORT: '3000' }, timeout: 120_000 }`. Add a task-1 sub-step creating `src/client/test/setup.ts` with stubs for matchMedia, ResizeObserver, speechSynthesis/SpeechSynthesisUtterance and navigator.clipboard, plus `@testing-library/jest-dom`. Add `"pretest:e2e": "npm run build -w @the-unseen/core"`.

**Verifier note:** Confirmed: playwright.config runs `npm run dev` on :3000, where Fastify serves no SPA outside production (design.md:452; Req 25 puts Vite on 5173). Both runners use testDir ./tests with no include/testMatch split, and no task creates tests/setup.ts.

## 13. [blocker] .kiro/specs/spirit-sight-ui/design.md:2343 (feasibility)

**Issue:** The live Cursed Shop audit cannot run, either in the e2e test or on the hosted box. The server's restrictive SSRF pre-check returns 403 for any localhost URL. Nothing serves the shop at :8080/cursed-shop/ (it runs on :4173 at /). The hosted demo has no public Cursed Shop URL for the 20 s live-audit budget. The obvious workaround, a test flag that relaxes the policy, would breach 'never accept a policy from the client' or weaken the hosted guard.

**Evidence:** design.md:2343 `page.fill('input[type="url"]', 'http://localhost:8080/cursed-shop/index.html')`, with requirements.md:44-45 (SSRF pre-check → 403) and design.md:632-633 (RestrictiveSafeFetchPolicy). apps/cursed-shop/package.json `"start": "serve -l 4173 ."`. requirements.md:401 'audit a local Cursed Shop fixture'; requirements.md:412 '≤20 seconds' for the Cursed Shop. Prompt 14 addendum: 'first audit result appears in ≤ 20 s for the Cursed Shop on the hosted box'. No task hosts the shop.

**Fix:** Add a requirement and task: Fastify serves apps/cursed-shop statically at `/haunted/`, in an encapsulated plugin registered WITHOUT helmet so the shop's own inline scripts and hauntings are unchanged. POST /api/audit accepts exactly one of `{ url }` or `{ demo: 'cursed-shop-index'|'cursed-shop-product'|'cursed-shop-checkout' }`, with a JSON schema that sets `additionalProperties: false`. For `demo`, the server builds `http://127.0.0.1:${PORT}/haunted/<page>.html` itself and audits with `safeFetchPolicy: new OriginScopedPolicy('http://127.0.0.1:'+PORT, new RestrictiveSafeFetchPolicy())`. This matches safe-fetch design 2.18 allowAuthorities: the policy is chosen server-side from an enum and never comes from the client. The Landing 'Audit the Cursed Shop live' action and the e2e test both use `{ demo }`. Copy apps/cursed-shop into the Docker image. Add a timing assertion in the e2e test: POST → done ≤ 20 s.

**Verifier note:** Confirmed: the e2e test types http://localhost:8080/cursed-shop/index.html into a server that applies RestrictiveSafeFetchPolicy, so it gets 403. The shop actually runs on :4173, and nothing hosts it for the 20 s live-audit budget on the hosted box.

## 14. [blocker] .kiro/specs/spirit-sight-ui/design.md:986 (feasibility)

**Issue:** The scale uses the viewport size (1280×900), but the screenshot is full-page. The overlay viewBox and the <img> box therefore have the wrong aspect ratio: the image is distorted, and every box below 900 px lands outside the overlay. Fitting a full-page shot by min(w,h) also shrinks a long page to an unreadable strip.

**Evidence:** design.md:985-988 `computeScale(audit.raw.viewportWidth, audit.raw.viewportHeight, width, height)`. packages/core/src/runner/browser.ts:346 `page.screenshot({ fullPage: true, ... })`; BoundingBox is 'in screenshot pixel coordinates' (types.ts). requirements.md:128 'scale ... to fit the viewport while maintaining aspect ratio'; design.md:932 `Math.min(containerWidth / screenshotWidth, containerHeight / screenshotHeight)`.

**Fix:** Design §Screenshot + Overlay: take the screenshot dimensions from the PNG itself. Either the server decodes the IHDR (base64 → bytes 16-23, big-endian width/height) into `ui.screenshotWidth/Height`, or the client reads `img.naturalWidth/naturalHeight` in onLoad. Never use viewportWidth/viewportHeight. Scale to the container WIDTH only (`scaleFactor = containerWidth / screenshotWidth`) inside a vertically scrolling region (`overflow-y: auto`; the overlay is positioned absolutely inside the same scroller). Update computeScale, its property tests (task 9.3: aspect ratio preserved, box inside image ⇒ scaled box inside scaled image) and Req 8.3.

**Verifier note:** Confirmed: the ResizeObserver feeds raw.viewportWidth/Height (1280x900) into computeScale, but browser.ts:346 takes a fullPage screenshot whose box coordinates are in full-page pixels. The image is therefore distorted and overlays below the fold are misplaced.

## 15. [blocker] .kiro/specs/spirit-sight-ui/tasks.md:156 (feasibility)

**Issue:** Samples and the Daylight view have no URL, so the vertical-slice checkpoint and the self-audit cannot pass. SpiritSightView loads only /api/audit/:id, which does not hold samples. Daylight is component state. The self-audit loads a single URL, '/', so the Spirit Sight and Daylight views are never audited.

**Evidence:** tasks.md:156 'Fetch audit result from `/api/audit/:id`' versus design.md:827 'Navigate directly to `/spirit-sight/:id` with the cached `ClassifiedAudit` (no network request)'. A refresh or deep link of a sample gives 404. tasks.md:171 checkpoint 'can load sample → Spirit Sight displays screenshot'. design.md:1671 Daylight is `useState`. requirements.md:318-319 requires zero hauntings on 'Landing, Spirit Sight, and Daylight views', but design.md:2039 audits only `'http://localhost:3000'`. Prompt 14: 'zero hauntings on the landing page, the Spirit Sight view of a sample and Daylight mode'.

**Fix:** Routes: `/sample/:sampleId` and `/audit/:jobId` both render SpiritSightView. Its data comes from `/api/samples/:sampleId` or `/api/audit/:jobId` respectively. Mode lives in the query string: `?view=daylight` (Daylight is also the default under reduced motion). Self-audit (task 28) loops over `/`, `/sample/cursed-shop-index` and `/sample/cursed-shop-index?view=daylight` with `auditAndClassify(url, { allowPrivate: true })` and expects `hauntings` = [] for each. Update task 9.2 and the checkpoint 10 wording.

**Verifier note:** Confirmed: sample cards navigate to /spirit-sight/:id with cached state, while task 9.2 fetches /api/audit/:id. Daylight is useState, and the self-audit hits only '/', even though prompt 14 requires zero hauntings on the sample Spirit Sight view and on Daylight.

## 16. [major] .kiro/specs/spirit-sight-ui/requirements.md:126 (ux-demo)

**Issue:** The spec uses data paths and fields that do not exist on ClassifiedAudit or Haunting. Kiro will either stall or invent fields, which breaks the build or produces fake data.

**Evidence:** Req 8.1 'ClassifiedAudit.screenshotPng' and task 9.2 'audit.screenshotPng': the real path is `audit.raw.screenshotPng` (classifier design.md:136, core types.ts:9). Req 14.1 'ClassifiedAudit.tabWalkResult.steps': the real path is `audit.raw.tabWalkResult`. Req 15.6 'haunting.fixSuggestion': the real field is `haunting.fix.{instruction,codeSnippet}`. design.md 1117 `haunting.cycle?.escapable`: Haunting has no `cycle`. computeFogDensity(contrastRatio, isLargeText) (1076): Haunting carries no contrast ratio. design.md 2506 imports from '@the-unseen/core/classifier/types' and 2300 '@the-unseen/core/classifier/contrast': core's package.json has no `exports` subpaths, and index.ts does not export contrast helpers or `announce`.

**Fix:** Add a 'Data contract' table to design.md that maps each UI need to the real path: screenshot=`audit.raw.screenshotPng`, boxes=`audit.raw.boundingBoxes` (join on backendDOMNodeId), tab steps=`audit.raw.tabWalkResult.steps`, escapable cycles=`audit.raw.tabWalkResult.cycles.filter(c=>c.escapable)`, fix=`haunting.fix`, contrast for Fog=`contrastRatio(raw.textNodeStyles[nodeId].color, .backgroundColor)`. Add a core task: 'export `contrastRatio`, `parseColor` and `announce` from packages/core/src/index.ts'. Import only from '@the-unseen/core'.

**Verifier note:** Confirmed: Req 8.1 and task 9.2 use audit.screenshotPng, Req 14.1 uses audit.tabWalkResult, Req 15.6 uses haunting.fixSuggestion and design 1117 uses haunting.cycle, none of which exist on the classifier types (the fields are raw.screenshotPng, raw.tabWalkResult and fix); Haunting carries no contrast ratio for computeFogDensity, and the '@the-unseen/core/classifier/...' subpath imports do not resolve because core has no exports map.

## 17. [major] .kiro/specs/spirit-sight-ui/design.md:1436 (ux-demo)

**Issue:** The Whisper walk reads only the hauntings' speech, in precedence order. It never plays the page in accessibility-tree order, so the demo's core contrast ('Add to cart, button' versus 'button... button...') cannot happen, and it is not 'what they hear'.

**Evidence:** design.md 1436-1444: `const utts = audit.hauntings.filter(h => h.speech).map(...)`, and task 16.2 'Build utterances array from audit.hauntings[].speech'. audit.hauntings is ordered by precedence (hauntings.md §Precedence), not reading order, and named elements are never spoken. Prompt 14: 'Reads speech strings in AX-tree order'. Brief §5.4: 'the page is read in accessibility-tree order ... (for example "Add to cart, button" vs "button")'.

**Fix:** Req 13.1: 'Utterances = `buildWhisperScript(audit)`: walk `audit.raw.axNodes` in tree order, take `announce(node, raw)` from @the-unseen/core (export it), drop empty strings, and attach `{ backendDOMNodeId, hauntingId? }`, where hauntingId is set when the node is in a haunting's nodeIds. Haunted utterances are shown in the caption with the haunting's display name and an ember left rule.' Add task 'export announce from core' and a fast-check property: 'the script order equals AX tree order, and every haunting with speech appears at least once'. Add a 'Haunted only' filter toggle as an option, default off.

**Verifier note:** Confirmed: design 1436-1444 and Req 13.1 read only audit.hauntings[].speech, which is in precedence order, so named elements are never spoken and the prompt's 'speech strings in AX-tree order' contrast ('Add to cart, button' versus 'button') cannot be heard.

## 18. [major] .kiro/specs/spirit-sight-ui/design.md:1449 (ux-demo)

**Issue:** The Whisper walk is gated behind a separate header toggle and uses a blocking alert(), which makes playback a two-step trap on camera. The speed control also breaks the binding whisper rate cap, and the per-utterance live region breaks a design-system rule.

**Evidence:** design.md 1449-1451: `if (!soundEnabled) { alert('Sound is disabled. Enable sound in the header to use Whisper Walk.') }`. 1459: `speech.rate = 0.85 * speed` with speeds up to 1.5x gives 1.275, but design-system.md:124 says 'pitch ≤0.8, rate ≤0.85' and Req 13.2 says the same. 1503: `<div className="live-caption" aria-live="polite">` updates on every utterance, but design-system.md:151 says 'Do not set aria-live on elements that update continuously'. SoundProvider (754-755) restores 'unseen:sound-enabled' from localStorage, so sound can be 'on' at page load with no gesture.

**Fix:** Req 13/19: 'Pressing Play in the Whisper walk is the user gesture and enables speech (it sets soundEnabled=true if it was off). No alert(). The header Sound toggle controls the ambient drone and chimes and is not persisted across loads (always off on load).' Speed maps to rate = clamp(0.85 * speed, 0.4, 0.85), so speeds above 1x shorten the pause between utterances instead of raising the rate (or cap the speed list at 1x). The caption is a visible region with aria-live="off" during playback. Only play, pause and end states are announced in a separate polite status element.

**Verifier note:** Confirmed: speak() blocks on alert() when the header sound toggle is off, rate 0.85*speed reaches 1.275 against the binding rate cap of 0.85 (design-system.md and Req 13.2), and the caption is aria-live='polite' on every utterance, which design-system.md forbids for continuously updating content.

## 19. [major] .kiro/specs/spirit-sight-ui/design.md:2014 (ux-demo)

**Issue:** The self-audit, the headline 'THE UNSEEN finds nothing haunted in itself' moment, audits the wrong thing. In dev mode, Fastify on :3000 serves no SPA, only `/` is audited, the Spirit Sight and Daylight views are not URL-addressable, and the result never appears in the product.

**Evidence:** playwright.config (2017-2023): `webServer: { command: 'npm run dev', port: 3000 }`, but static serving is production-only (452-461) and Vite runs on 5173 (Req 25.4). The test calls `auditUrl('http://localhost:3000', { allowPrivate: true })` + `classify` (2039-2043), not `auditAndClassify`. Req 22.2 requires 'zero hauntings on the Landing, Spirit Sight, and Daylight views', but Daylight is component state (1671-1673) with no URL. Addendum point 3: 'Treat that as a demo moment'.

**Fix:** Task 28 and design: webServer = `npm run build && NODE_ENV=production PORT=4173 node dist/server/index.js`. The test runs `auditAndClassify(u, { allowPrivate: true })` for u in [`/`, `/sample/cursed-shop-index`, `/sample/cursed-shop-index?view=daylight`]. On failure it prints type/htmlSnippet and expects `hauntings.length === 0` for each. The view mode is URL-synced (`?view=spirit|daylight`). Move task 28 into Phase 1, right after the first sample renders. Add a landing footer line plus a sample card 'THE UNSEEN, audited by itself: 0 hauntings', generated by build-samples.ts from the built app, so the claim is visible in the product and the video.

**Verifier note:** Confirmed: playwright webServer runs 'npm run dev' on :3000, but static serving is production-only (Vite serves the SPA on 5173), so the self-audit hits a server with no SPA; it audits only '/', although Req 22.2 also requires the Spirit Sight and Daylight views, and Daylight has no URL.

## 20. [major] .kiro/specs/spirit-sight-ui/design.md:1021 (ux-demo)

**Issue:** The overlay treatments put real text into the app's DOM over the screenshot. Literal 'button' labels and an emoji 'garbled tongue' banner are set in screenshot pixels, so they become stray screen-reader text and shrink to a few pixels when scaled. They are also app UI text inside the fogged layer. Hiding them with aria-hidden would trip the app's own The Veiled detector.

**Evidence:** design.md 1021-1031 `<text ... fill="var(--color-mist)" opacity={0.3} fontSize={14}>button</text>` inside every Nameless Spirit. Silent Tongue (1172-1181) `<text ... fontSize={18}>⚠️ The spirits speak a garbled tongue</text>` at viewBox coordinates: at a 0.3 scale that is about 5px. Brief §6.1: 'Fog and effects apply only to the screenshot ... never to the app's own UI text'. hauntings.md §10 flags aria-hidden subtrees with 'visible non-whitespace text'.

**Fix:** Add a rule to design.md: 'Overlay treatments contain no <text>, no emoji and no aria-hidden text. They are shapes, gradients and filters only, and each trigger's accessible name carries the meaning.' Silent Tongue renders as an HTML banner ABOVE the screenshot stage, outside the canvas and SVG: `<p role="note" class="page-banner">Silent Tongue: this page declares no valid language, so screen readers may pronounce it in the wrong language.</p>`, followed by a 'Details' button that opens the dialog.

**Verifier note:** Confirmed: the Nameless Spirit draws a literal 'button' <text> at opacity 0.3 mist and Silent Tongue draws an emoji <text> at viewBox scale, so screen readers get stray text, the text shrinks to a few pixels, and the faded text would trip the app's own Fog detector in the self-audit.

## 21. [major] .kiro/specs/spirit-sight-ui/design.md:966 (ux-demo)

**Issue:** The overlay buttons cannot be clicked with a mouse, their accessible names do not follow the required format, the UI shows raw enum names, and focus order follows array order, not reading order.

**Evidence:** The SVG has `pointerEvents: 'none', // Overlays are focusable via Tab, not click` (966), which descendant foreignObject buttons inherit, so the e2e step `page.click('.haunting-trigger:first-of-type')` fails. aria-label is `${haunting.type}: ${haunting.explanation}, ${haunting.severity}` (1216), which gives 'NamelessSpirit: Interactive element has no accessible name. Screen readers announce only…, Wraith', against Req 10.2's 'Nameless Spirit: button at Add to cart, Wraith'. The dialog h2 is `{haunting.type}` (1330), which shows 'NamelessSpirit'. Prompt 14 requires 'a logical order' and 'fast-check for ... the ordering of overlay focus', but no ordering helper or property exists.

**Fix:** Add pure helpers to design.md and tasks 11.1/14: `HAUNTING_DISPLAY_NAME: Record<HauntingType,string>` ('NamelessSpirit'->'Nameless Spirit', 'TheVeiled'->'The Veiled', …), used everywhere text is shown, exports included. `overlayLabel(h, raw)` = `${display}: ${role from AX node} ${name ? 'named "'+name+'"' : 'in ' + nearestHeadingOrLandmarkName(raw, nodeId)}, ${severity}`. `overlayFocusOrder(hauntings)` sorts by (box.y rounded to 8px, box.x), with null boxes last. Add a fast-check property: the order is a total, stable permutation independent of input order. Set the trigger buttons to `pointer-events: auto`. Render triggers as one group with a roving tabindex (one Tab stop; arrow keys and Home/End move between hauntings), so keyboard users do not Tab through 40 overlays to reach the sidebar.

**Verifier note:** Confirmed: the SVG sets pointerEvents:'none', which the foreignObject buttons inherit, so mouse clicks (and the e2e page.click) fail; the aria-label uses raw haunting.type plus explanation instead of the Req 10.2 format; the dialog title shows 'NamelessSpirit'; and no focus-order helper exists, although the prompt asks for one.

## 22. [major] .kiro/specs/spirit-sight-ui/design.md:1001 (ux-demo)

**Issue:** The ten visual treatments are placeholders. They will read as generic boxes, not distinct, legible hauntings that follow hauntings.md. Several key visuals are undefined or contradict the steering.

**Evidence:** The patterns `url(#ghost-gradient)`, `#fog-pattern`, `#thick-fog-pattern` and `#glass-gradient` are never defined ('Defs for ghost-gradient elsewhere', 1032). Invisible Wanderer is `<path d="M...">` (1136). Hollow Portrait (1040-1055) is a dashed rect plus two ink circles of fixed r=8, with no desaturation, though hauntings.md says 'Image goes hollow-eyed and desaturated'. Lost Soul (1098-1099) draws a diagonal X, which reads as 'close/error', not 'a soul trapped behind glass'. computeFogDensity maps the deficit to [0,0.8] (1080), so a ratio of 4.4 gives about 0.02, an invisible fog for a real haunting. The Shattered Order 'outline panel' (1186-1188) has no component, layout or task (task 13 only says 'render in sidebar outline panel').

**Fix:** Replace §Haunting Overlays with one concrete spec per type, including the shared <defs>. ghost-gradient: radial, ecto 0.0->0.35 alpha. fog: feTurbulence baseFrequency 0.02, 2 octaves, plus feColorMatrix tinted mist. thick-fog: the same turbulence at 4 octaves, alpha 0.92 plus a feGaussianBlur 3. glass: a linear bone 0.12->0.28 with a 1px bone 0.5 inner stroke and a diagonal specular highlight, no X. Hollow Portrait: a `<image href=screenshot>` clipped to the box with `filter: grayscale(1) contrast(0.6)`, plus two ellipse 'eye' voids sized at 12% of min(box w,h). Fog density = 0.35 + 0.5*clamp(deficit/target,0,1), so it is never below 0.35 for a real haunting. The Veiled: thick-fog plus a 2px dashed ink-mix border, so it reads as 'solid wall' against The Fog's 'haze'. Invisible Wanderer: three footprint glyphs (give the path data) trailing toward the element, mist 0.6, with no glow. Shattered Order: a sidebar 'Page outline' list of the headings from raw.pageMetadata.headings, indented by level, with skipped levels shown as a cracked-headstone icon and the text 'Missing h2'. Add one Storybook-free Vitest snapshot per type to pin the structure.

**Verifier note:** Confirmed: the ghost, fog, thick-fog and glass patterns are never defined, the footprint paths are 'M...', Hollow Portrait has no desaturation (against Req 9.2), and computeFogDensity gives about 0.02 opacity for a 4.4:1 ratio, so real Fog hauntings are invisible on screen.

## 23. [major] .kiro/specs/spirit-sight-ui/design.md:1567 (ux-demo)

**Issue:** The Keyboard walk cannot show the two beats the demo needs. Lost Souls are never revealed, and escapable cycles are read from a field that does not exist. An inescapable loop circles forever with no stop control. The ghost layer is not in the screenshot's coordinate space, and the walk has no text equivalent for screen-reader users.

**Evidence:** design.md 1568-1604 builds `lostSouls` from haunting nodeIds and checks `lostSouls.has(step.backendDOMNodeId)`, but Lost Souls are by definition not in the Tab sequence (hauntings.md §4), so this never fires. The escapable flag comes from `haunting.cycle?.escapable` (1117), and Cursed Loop hauntings are never escapable. 1657: 'Ghost circles indefinitely (manual stop required)', but the controls (1616-1627) offer only Play and Speed, against Req 14.7 'play, pause'. The KeyboardWalk renders its own `<svg className="ghost-layer" {...}>` (1612), which is not the scaled overlay SVG. The walk is visual only, and 1.1.1/1.3.1 apply to the app itself.

**Fix:** Rewrite §Keyboard Walk. The ghost is a <g> inside the SAME overlay SVG (same viewBox). Before moving from step i to step i+1, reveal every Lost Soul whose box lies in reading order between the two step boxes, using the glass treatment with a 600ms fade (instant under reduced motion). Escapable cycles come from `raw.tabWalkResult.cycles.filter(c => c.escapable)`: circle the members twice, then continue. For an inescapable trap (Cursed Loop haunting) the ghost circles at most 3 times, the ember ring pulses, and the walk stops with the status 'Trapped: keyboard users cannot leave this dialog'. Controls: Play/Pause (one button with aria-pressed), Step back, Step forward, Restart, Speed. A visible caption reads 'Step 7 of 23: Add to cart, button' using announce() for the step node, with a polite status only on trap and end.

**Verifier note:** Confirmed: lostSouls.has(step id) can never be true because Lost Souls are by definition not in the Tab steps, escapable comes from a nonexistent haunting.cycle, an inescapable loop circles 'indefinitely' while the controls have no pause (against Req 14.7), and the ghost sits in a separate unscaled SVG.

## 24. [major] .kiro/specs/spirit-sight-ui/requirements.md:402 (ux-demo)

**Issue:** The required E2E flow cannot pass. The server's restrictive SSRF policy blocks the local Cursed Shop (403), and headless Chromium speech hangs. The hosted demo also has no public Cursed Shop URL to paste.

**Evidence:** Req 28.2: 'audit a local Cursed Shop fixture'. design.md 2343: `page.fill('input[type="url"]', 'http://localhost:8080/cursed-shop/index.html')`, but the worker always uses `new RestrictiveSafeFetchPolicy()` (633), and product.md: 'Local and localhost URLs are permitted only in the local MCP server ... never in the hosted web app'. Req 28.3 'Whisper Walk plays': getVoices() is empty in headless Chromium, and onend may never fire. Brief §9 0:15 and the prompt's 'paste the Cursed Shop URL' assume a reachable shop, but no spec or deploy prompt publishes apps/cursed-shop.

**Fix:** (a) In Req 25, add `createServer({ testAllowOrigins?: string[] })`. It is a code-level option used only by the Playwright fixture, never read from env or request, and refused when NODE_ENV==='production'. It wraps the policy with core's `OriginScopedPolicy`. (b) The E2E stubs `window.speechSynthesis` via `page.addInitScript` (speak() calls onstart, then onend after 10ms) and asserts that the caption advances. (c) Add to Req 5/24: 'apps/cursed-shop is published as a static site at a public URL (e.g. GitHub Pages) recorded in `samples.config.json`. The Landing view shows a "Try the Cursed Shop live" link that fills the input with that URL. If a live audit errors or exceeds 20s, the Séance offers "Open the pre-audited Cursed Shop" (/sample/cursed-shop-index).'

**Verifier note:** Confirmed for the E2E: Req 28.2 and design 2343 audit a localhost Cursed Shop, but the worker always uses RestrictiveSafeFetchPolicy and product.md bans localhost in the hosted app, so the required flow returns SSRF_BLOCKED; speech in headless Chromium is also unstubbed (the public-URL part is less critical, because the brief offers the Cursed Shop as a sample).

## 25. [major] .kiro/specs/spirit-sight-ui/tasks.md:169 (ux-demo)

**Issue:** tasks.md is not demo-first as the addendum requires. The 'vertical slice' ends with a bare screenshot, no score, no hauntings and no export. The named polish items have no tasks, edge cases sit inside 'Polish', and the notes mark everything after task 10 as non-essential, including overlays, Daylight and the self-audit.

**Evidence:** Checkpoint 10: 'Verify: can load sample -> Spirit Sight displays screenshot'. Overlays are in tasks 11-13 (Phase 2), the sidebar score in 14, export in 22 (Phase 3). Addendum point 2: 'First a vertical slice that runs end to end on the Cursed Shop, including the score and the WCAG export. Then polish (fog shader, takes-form animation, ambient sound), then edge cases.' There is no task for a WebGL/noise fog shader, takes-form, ambient drone or hero art. Task 20 says 'Use CSS clip-path animation or canvas rendering'. Phase 3 'Polish' contains rate limiting (24), error mapping (25) and shortcuts (23). Notes 431: 'The vertical slice (tasks 1-10) is MUST-HAVE. Everything else is HIGH or LOWER priority.'

**Fix:** Reorder: Phase 1 (MUST, demo slice): core onProgress task, build-samples script, server plus /api/samples/:id, app shell with landmarks, Landing, Spirit Sight with width-fit stage, all overlay triggers (simple ecto box per type is enough), the toggle reveal with a CSS clip-path wave, sidebar with score, dialog, Daylight table plus Markdown export, self-audit test. Checkpoint: 'sample -> toggle -> dialog -> Daylight -> .md downloads; self-audit 0 hauntings'. Phase 2 (MUST): POST/poll/Séance live path, Keyboard walk, Whisper walk, rate limit (POST-only). Phase 3 (polish, before edge cases): the 10 full treatments, canvas noise fog, Séance candle visuals, landing hero, takes-form, ambient drone. Phase 4 (edge cases): error copy, 404/expired states, shortcuts dialog, JSON export, responsive tweaks. Replace note 431 with an explicit cut list in this order: drone -> takes-form -> noise fog (keep CSS wave) -> Shattered Order outline art.

**Verifier note:** Confirmed: checkpoint 10 ends at a bare screenshot, the score and export sit in later phases, and note 431 marks everything after task 10 as non-essential, all against addendum point 2, which asks for score plus WCAG export in the slice and polish before edge cases.

## 26. [major] .kiro/specs/spirit-sight-ui/requirements.md:92 (ux-demo)

**Issue:** Key product states and the 'one obvious path' rule are missing, which makes it feel like a proof of concept. A clean site shows nothing, an expired or restarted job leaves the user on a dead page, there is no way back to audit another URL, and no requirement enforces one primary action per view.

**Evidence:** Addendum point 1: 'Every view has one primary action and is reachable in at most 2 clicks or keypresses'. This appears only as prose in design.md:7, with no acceptance criterion. There is no requirement for a zero-haunting result (score 0, which is also the exorcised Cursed Shop and the self-audit). There is none for GET /api/audit/:id returning 404 while polling or on /spirit-sight/:id: the job store is in-memory with a 1h TTL (Req 3.8), and the Séance poll loop (843-856) has no error branch, so a thrown fetch or a 404 spins forever. The header (893) has no 'New audit' affordance.

**Fix:** Add Requirement 31 'Journey and states'. (1) Each view declares exactly one primary button styled ecto-filled: Landing 'Begin audit', Séance none (progress) but a 'Cancel' link, Spirit Sight 'Open Spirit Sight', and once open, the primary moves to 'Walk with the keyboard', then 'Hear what they hear', then 'Daylight report' in a numbered step bar (1 Reveal, 2 Walk, 3 Listen, 4 Report) that is always visible. (2) The header wordmark links to '/', and the Spirit Sight header has 'Audit another site'. (3) Zero hauntings: 'No hauntings detected by automated checks' plus the coverage note, never the word 'compliant', with the needs-manual-check list shown. (4) A 404 on poll or view shows 'This séance has ended (results expire after 1 hour or when the server restarts)' with 'Audit again' (re-POST the same URL) and 'Back'. (5) Network failure on poll: retry 3 times with backoff, then an assertive error with Retry. Add the matching E2E cases.

**Verifier note:** Confirmed: the Séance poll loop (design 843-856) has no branch for a 404, non-OK status or thrown fetch, so an expired job or a server restart spins forever, and the addendum's 'one primary action per view' has no acceptance criterion (the step bar in the fix is optional).

## 27. [major] .kiro/specs/spirit-sight-ui/requirements.md:5 (ux-demo)

**Issue:** 'Takes form' and the ambient drone are named in the prompt and the brief's motion and sound direction, but they have no requirement, design or task, so they will not be built. 'Takes form' also cannot be built naively, because haunting ids are not stable across audits.

**Evidence:** The glossary defines 'Takes_Form' (line 17), and Req 18.3 disables it, but no requirement creates it. Prompt 14 item 8 asks for an 'Optional ambient drone (Web Audio): off by default, with a visible toggle', but Req 19 only says not to start it. The classifier gives `id: string // stable hash of type + backendDOMNodeId + kind` (classifier design.md:97), and backendDOMNodeId changes on every page load, so a before/after diff by id always shows every haunting as fixed and every one as new.

**Fix:** Add Req 32 'Re-audit and takes form (polish)'. Spirit Sight for a job has 'Re-audit this page'. On completion, hauntings are matched across audits by `(type, kind, normalised htmlSnippet)` (a pure `matchHauntings(before, after)` with a fast-check property: matching is symmetric and one-to-one). Unmatched 'before' hauntings play the takes-form animation (600ms cubic-bezier(0.34,1.56,0.64,1): the ghost gradient resolves to a crisp ecto outline), and their new accessible name is spoken if sound is on. Add Req 33 'Ambient drone': two detuned sine oscillators at 55/55.4Hz through a lowpass at 400Hz, gain 0.04, a 2s fade-in, started only by the header Sound toggle, never under reduced motion. Put both in the polish phase with an explicit cut order.

**Verifier note:** Takes-form is a named demo beat (brief §9 1:10-1:50, 'the ghost takes form and the real name is spoken') but has no requirement, design or task, and matching hauntings by an id built from backendDOMNodeId would fail across audits; the drone part is optional and minor.

## 28. [major] .kiro/specs/spirit-sight-ui/design.md:2086 (ux-demo)

**Issue:** The Docker section will produce an image that cannot run audits or even start. It also contradicts the queued deploy run (prompt 16), so two Kiro runs will fight over the same files.

**Evidence:** `FROM mcr.microsoft.com/playwright:v1.40.0-focal`, but packages/core/package.json pins `"playwright": "1.65.1"`, so the bundled browsers will not match the library ('Executable doesn't exist'). `CMD ["node", "apps/web/dist/server/server.js"]` points at the factory module, which only exports createServer and never listens (task 2.2 puts listen in index.ts). There is no server build step, since Vite builds only the client. `path.join(__dirname, ...)` (455) under root `"type": "module"` throws a ReferenceError. Prompt 16 specifies `v1.65.1-noble`, EXPOSE 8080, `/api/health` and pwuser, while this spec uses port 3000 and `/health`.

**Fix:** In requirements.md Req 24 and design.md §Docker Deployment, replace the content with: 'Out of scope for this spec; delivered by docs/brief/prompts/16-deploy.md (Playwright image pinned to the lockfile version, v1.65.1-noble)'. Keep only what the app needs: `apps/web/package.json` scripts `build` = `vite build && tsc -p tsconfig.server.json` (output dist/server) and `start` = `node dist/server/index.js`. Use `fileURLToPath(new URL('../client', import.meta.url))` for the static root. Rename the health route to `/api/health` to match prompt 16. Remove task 29, or make it 'verify prompt-16 Dockerfile runs the smoke test'.

**Verifier note:** Confirmed: the image is playwright:v1.40.0-focal while core pins playwright 1.65.1 (browser executable missing), CMD runs server.js, which never listens, __dirname is used under type:module, and port, health path and base image all contradict prompt 16's v1.65.1-noble, 8080 and /api/health.

## 29. [major] .kiro/specs/spirit-sight-ui/design.md:2046 (app-a11y)

**Issue:** The zero-hauntings assertion is too weak to catch regressions. A view that failed to render its overlays (API 404, error state) can still score zero. axe violations that no haunting covers are ignored. The diagnostic log is unreachable. The test will hit Playwright's default 30 s timeout.

**Evidence:** design.md:2046-2056 runs `expect(classified.hauntings).toHaveLength(0)` and only then `if (classified.hauntings.length > 0) { console.error(...) }`. The expect throws first, so the log never prints. No assertion proves the intended state was rendered. ClassifiedAudit has `axeCrossCheck.unmapped` ('axe violations with no corresponding haunting', classifier/types.ts), which the 10 hauntings do not cover (e.g. aria-allowed-attr, nested-interactive, duplicate-id, label-in-name style issues). One audit can take up to 60 s plus a 1.5 s settle (audit.ts FULL_AUDIT_TIMEOUT_MS), and 4 pages need more.

**Fix:** Replace the test body in design.md with, for each URL: `const a = await auditAndClassify(url, { allowPrivate: true }); expect(a.hauntings.map(h => `${h.type}${h.kind ? '/' + h.kind : ''}: ${h.htmlSnippet}`)).toEqual([]); expect(a.axeCrossCheck.unmapped.map(v => v.id)).toEqual([]);` and add per-state presence checks: landing `a.raw.pageMetadata.headings.some(h => h.tagName === 'h1' && /THE UNSEEN/.test(h.accessibleName))`; sample view `a.raw.tabWalkResult.steps.length >= sampleHauntingCount` and at least one AX button whose name starts with a haunting display name; daylight at least one AX node with role `table`. Add `test.setTimeout(240_000)`. Add to req 28.4: 'and SHALL fail on any axe violation not mapped to a haunting'.

**Verifier note:** Confirmed at design.md:2046-2056: the console.error diagnostics sit after a throwing expect and never run, nothing proves the view actually rendered, and a 60 s audit per URL (audit.ts FULL_AUDIT_TIMEOUT_MS) cannot fit Playwright's default 30 s test timeout.

## 30. [major] .kiro/specs/spirit-sight-ui/design.md:443 (app-a11y)

**Issue:** Production rate limiting is registered globally at 5 requests/min per IP. One page load (index.html, JS, CSS, several @fontsource files, /api/samples) exceeds it. Assets return 429, so the hosted demo and the production-mode self-audit break.

**Evidence:** design.md:442-445 `if (NODE_ENV === 'production') { server.register(rateLimitPlugin) }` is registered before fastifyStatic, with no route scoping. Req 2.7 '5 requests per minute per IP... using @fastify/rate-limit'. @fastify/rate-limit defaults to `global: true`.

**Fix:** In design.md and task 24, register `@fastify/rate-limit` with `{ global: false }` and attach `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }` (plus the 30/hour limit as a second keyed limiter) only on the `POST /api/audit` route. Add to req 2.7: 'Rate limiting SHALL apply only to `POST /api/audit`; static assets, `/api/samples` and `GET /api/audit/:id` polling SHALL NOT be rate limited at that threshold.'

**Verifier note:** Confirmed: design.md:442-445 registers the rate limiter before all routes and static files with no route scoping; at 5/min, the séance's 500 ms polling of GET /api/audit/:id (about 120/min) and the asset loads alone would get 429 in production.

## 31. [major] .kiro/specs/spirit-sight-ui/design.md:966 (app-a11y)

**Issue:** The overlay SVG sets pointer-events:none. That property is inherited by the foreignObject buttons, so mouse clicks on hauntings do nothing. The design's own E2E click step fails, and the demo click-to-open-detail breaks.

**Evidence:** design.md:966 `pointerEvents: 'none', // Overlays are focusable via Tab, not click`. Req 10.4 says 'WHEN an overlay element is clicked or activated with Enter/Space'. design.md:2358 `await page.click('.haunting-trigger:first-of-type')` would time out with 'element does not receive pointer events'.

**Fix:** In design.md, keep `pointer-events: none` on the decorative SVG layer but add `.haunting-trigger { pointer-events: auto; }`. Delete the comment 'Overlays are focusable via Tab, not click'. Add to req 10.4: 'Overlay buttons SHALL receive pointer events; decorative layers (screenshot, fog canvas, ghost) SHALL have `pointer-events: none`.'

**Verifier note:** Confirmed: design.md:966 sets pointerEvents 'none' on the overlay SVG, the foreignObject buttons (design.md:1213-1228) inherit it and never override it, so clicks fail against req 10.4 and the design's own E2E `page.click('.haunting-trigger')`.

## 32. [major] .kiro/specs/spirit-sight-ui/design.md:1232 (app-a11y)

**Issue:** The overlay focus ring is plain ecto drawn over arbitrary screenshot pixels. On a light page (the Cursed Shop and most public sites), ecto #7CF5C8 on white is about 1.33:1, which fails the required 3:1 (2.4.7/1.4.11). The engine will not catch this: its Invisible Wanderer check compares the outline against the nearest opaque ancestor background (tab-walker.ts readStyles), i.e. the ink container, not the screenshot. A second engine trap: if no ancestor has an opaque background, the walker defaults `adj` to rgb(255,255,255), and every ecto ring in the app then becomes an Invisible Wanderer.

**Evidence:** design.md:1232-1236 `.haunting-trigger:focus-visible { outline: 2px solid var(--color-ecto); outline-offset: 2px; }` sits over the `<img>` screenshot. Req 10.5 and 22.5 claim '≥3:1 contrast'. tab-walker.ts:437 `let adj = 'rgb(255, 255, 255)'`. design.md:1917 tokens.css sets no background on html/body.

**Fix:** In design.md replace the overlay focus style with `.haunting-trigger:focus-visible { outline: 3px solid var(--color-ecto); outline-offset: 2px; box-shadow: 0 0 0 2px var(--color-ink), 0 0 0 7px var(--color-ink); }`. The ink halo guarantees ecto sits next to ink (14.8:1) whatever the screenshot colour, and the box-shadow change also satisfies the engine's rule (b). Add to req 10.5: 'The overlay focus indicator SHALL include an ink halo so the ecto ring never touches screenshot pixels.' Add to req 20.1: '`html` and `body` SHALL have `background-color: var(--color-ink)` (opaque).'

**Verifier note:** Confirmed: the ecto outline at design.md:1232-1236 sits over arbitrary screenshot pixels (about 1.3:1 on white), and no html/body background is specified anywhere (tokens.css sets none), so tab-walker.ts:437 defaults the adjacent background to white and would flag the app's own ecto focus rings as Invisible Wanderers.

## 33. [major] .kiro/specs/spirit-sight-ui/design.md:1021 (app-a11y)

**Issue:** The overlay renders real text over the screenshot: the faded 'button' label at mist with opacity 0.3, and the Silent Tongue banner as SVG `<text>` in ember. That is app text at unknown contrast, which breaks 'effects never cover the app's own text' and 1.4.3. The engine is blind here, because it marks text over an image as backgroundUncertain (collector-scripts.ts `layered`). The natural fix of `aria-hidden` on the decorative SVG instead triggers The Veiled: an aria-hidden subtree with visible text, or with the focusable foreignObject buttons inside it, is exactly what the Veiled detector and axe aria-hidden-focus flag.

**Evidence:** design.md:1021-1031 `<text ... fill="var(--color-mist)" opacity={0.3} fontSize={14}>button</text>`. design.md:1172-1181 `<text ... fill="var(--color-ember)" ...>⚠️ The spirits speak a garbled tongue</text>` inside the overlay SVG. design.md:1210 places the buttons in foreignObject inside that same SVG. hauntings.md The Veiled (a)/(b).

**Fix:** Add to design.md 'Haunting Overlays': 'The overlay contains no text nodes. Treatments are shapes and paths only (the Nameless Spirit faded label is a blurred rect, not `<text>`). The Silent Tongue banner is an HTML `<p role="status">` rendered above the screenshot, outside the overlay, in ember on ink. Two layers: (1) `<svg aria-hidden="true" class="treatments">` holding only shapes, no text and no focusables; (2) a sibling HTML layer of absolutely positioned `<button class="haunting-trigger">` (no foreignObject, no aria-hidden ancestor).' Add req 12.6: 'No `aria-hidden` subtree SHALL contain text or focusable elements.'

**Verifier note:** Confirmed: design.md:1021-1031 and 1172-1181 put real SVG <text> (a faded 'button' label and an informative ember Silent Tongue banner) over unknown screenshot colours inside the same SVG as the focusable foreignObject buttons, so the banner has unverifiable contrast and an aria-hidden fix would create a Veiled/aria-hidden-focus failure.

## 34. [major] .kiro/specs/spirit-sight-ui/design.md:2623 (app-a11y)

**Issue:** `?` is a single printable-character shortcut. WCAG 2.1.4 covers punctuation, not just letters, and the design's claim to the contrary is wrong. The global keydown handler also calls preventDefault, so users cannot type `?` into the URL field, which breaks any URL with a query string.

**Evidence:** design.md:2623 `if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openShortcutsDialog() }` on `window`. design.md:2633 'Only `?` (a punctuation key) is used'. Req 30.3 lists `?` while 30.4 forbids hijacking printable keys, so the spec contradicts itself.

**Fix:** Delete the `?` shortcut. In req 30.3 replace '`?` (open shortcuts dialog)' with nothing, and keep the header 'Keyboard shortcuts' button as the only entry point. Delete the global keydown handler from design.md. Add to req 30.4: 'THE App SHALL register no document-level key handlers except Escape inside an open dialog.'

**Verifier note:** Confirmed: the window keydown handler at design.md:2623 calls preventDefault on '?' with no input-focus check, so users cannot type '?' into the URL field; the claim at design.md:2633 that it does not interfere with form inputs is false.

## 35. [major] .kiro/specs/spirit-sight-ui/requirements.md:320 (app-a11y)

**Issue:** Only the Landing view specifies an h1 and the landmarks the engine checks. Spirit Sight, Séance, Daylight and the error fallback have no h1 or `<main>`, and Daylight jumps to h3. These are exactly the engine's Shattered Order no-h1 / no-main / heading-skip checks. `lang` and per-route `<title>` are never specified.

**Evidence:** design.md:691-703 App tree has no `<header>`/`<main>`. design.md:891-907 Spirit Sight layout has no h1. design.md:1739-1740 Daylight `<section className="manual-check"><h3>Needs Manual Check</h3>` with no h2. design.md:2464 ErrorBoundary `<h2>Something went wrong</h2>` only. Req 6.6 gives an h1 to Landing only. hauntings.md Shattered Order (a)(b)(c) and Silent Tongue (needs `<html lang>`).

**Fix:** Add requirement 22.11: 'THE App shell SHALL render `<header>` (sound toggle, shortcuts button), `<main id="main" tabindex="-1">` wrapping every route, and `<footer>`; `index.html` SHALL have `<html lang="en">`.' Add 22.12, the heading outline per view: Landing h1 'THE UNSEEN' > h2 'Try a sample'; Séance h1 'The séance'; Spirit Sight h1 'Spirit Sight: {hostname}' > h2 'Hauntings', h2 'Whisper walk', h2 'Keyboard walk'; Daylight h1 'Daylight report: {hostname}' > h2 'Findings by WCAG criterion', h2 'Needs manual check'; dialogs h2; ErrorBoundary h1. Add 22.13: 'Each route SHALL set `document.title` to "{view} – THE UNSEEN".'

**Verifier note:** Reqs 22.3, 22.4 and 22.9 state the rules generically, but the design the code is built from contradicts them (no h1 or main on Spirit Sight or Séance, Daylight jumps to h3 at design.md:1739, ErrorBoundary has only an h2), and `<html lang>` is specified nowhere, which would trigger Silent Tongue and Shattered Order in the self-audit.

## 36. [major] .kiro/specs/spirit-sight-ui/design.md:849 (app-a11y)

**Issue:** Route changes, including the automatic jump from the séance to Spirit Sight, have no focus management or announcement. Focus falls to `<body>` and screen-reader users are never told the audit finished or what was found. The polite live region is not guaranteed to exist before its first update, and polling continues forever after an error.

**Evidence:** design.md:849-851 `if (data.status === 'done') { navigate(`/spirit-sight/${id}`) }`. Nothing says focus or announcement. design.md:854 `setInterval(poll, 500)` is cleared only on unmount, never on 'error'. design.md:859 `<SeanceDisplay status={status} />` renders from `status` = null initially. Req 7.3 says only 'announce each new stage'. design.md:2348 E2E waits for 'Classifying hauntings' to be visible, but that stage is under 1 s (design.md:2398) against a 500 ms poll, so it can be skipped and the test flakes.

**Fix:** Add req 7.7: 'The polite live region SHALL be rendered empty on mount, before the first poll, and only its text SHALL change.' Add 7.8: 'WHEN status is done or error, polling SHALL stop.' Add 7.9: 'On every route change, focus SHALL move to the new view's h1 (`tabindex=-1`), and a persistent app-level polite region SHALL announce "Audit complete: {n} hauntings found, Haunting Score {score}" on arrival at Spirit Sight.' In the design.md E2E, replace the 'Classifying hauntings' wait with `await expect(page).toHaveURL(/spirit-sight|sample/, { timeout: 30000 })`.

**Verifier note:** Confirmed: design.md:849-855 navigates on done with no focus move or completion announcement, never clears the interval on error, and the E2E waits on the under-1 s 'Classifying hauntings' stage against a 500 ms poll, which is a flake risk.

## 37. [major] .kiro/specs/spirit-sight-ui/design.md:969 (app-a11y)

**Issue:** Overlay buttons come in classifier order, not reading order. Their accessible names use the enum and the long explanation instead of the specified format. All N overlay buttons sit in the DOM before the sidebar, with no skip link. The prompt's fast-check property for overlay focus order was dropped.

**Evidence:** design.md:969 `{audit.hauntings.map(h => <HauntingOverlay .../>)}` (classifier order). design.md:1216 `aria-label={`${haunting.type}: ${haunting.explanation}, ${haunting.severity}`}` produces e.g. 'NamelessSpirit: <two sentences>, Wraith', against req 10.2 'Nameless Spirit: button at Add to cart, Wraith'. A Nameless Spirit has no AX name by definition, so 'at Add to cart' has no source in `Haunting`. design.md:891-907 puts the screenshot before the sidebar. Prompt 14 Testing: 'fast-check for ... the ordering of overlay focus'; req 27.4 lists only 'box scaling, overlay positioning'.

**Fix:** Add pure helpers to design.md utils: `orderOverlays(hauntings)` sorts by `box.y` then `box.x` (null boxes excluded), and `overlayLabel(h, raw)` returns `${DISPLAY_NAME[h.type]}: ${role} ${visibleTextOrIndex}, ${h.severity}`, where role and name come from the `raw.axNodes` entry for `h.nodeIds[0]`, falling back to the element's visible text from `htmlSnippet`, then to 'item {i} of {n}'. Make the labels unique. Update req 27.4: 'fast-check SHALL verify orderOverlays is a reading-order permutation, stable, and that overlayLabel is non-empty and unique per audit.' Add req 10.6: 'The DOM order SHALL be h1, haunting list sidebar (score, groups, walk controls), then overlay buttons; a skip link "Skip to the haunting list" SHALL be the first focusable element on Spirit Sight.'

**Verifier note:** Confirmed: design.md:1216 builds aria-label from the enum plus the full explanation, against the req 10.2 format; overlays are in classifier order and sit before the sidebar; and prompt 14's fast-check property for overlay focus order is missing from req 27.4.

## 38. [major] .kiro/specs/spirit-sight-ui/design.md:1607 (app-a11y)

**Issue:** Keyboard Walk under reduced motion uses a 0 ms step timer. The walk finishes instantly, and for an inescapable Cursed Loop it becomes an endless setState loop that pegs the CPU. There is no pause or stop control, even though the design says the ghost 'circles indefinitely (manual stop required)'. Infinite animations (Cursed Loop glow, ghost drift) start automatically with no pause, which fails 2.2.2. The walk is purely visual, with no text equivalent of the tab order or trap.

**Evidence:** design.md:1607 `setTimeout(() => animateStep(index + 1), (reducedMotion ? 0 : 300) / speed)`. design.md:1616-1628 controls are only a Play button and a speed select (req 14.7 requires pause). design.md:1657 'Inescapable: Ghost circles indefinitely (manual stop required)'. design.md:1122 `.glowing { animation: glow 2s ease-in-out infinite; }`. design-system.md 'Ghost drift 4000ms ... infinite'.

**Fix:** In design.md: the step interval is `300 / speed` ms in both modes, and reduced motion removes only the CSS transition. Add Pause, Stop, Previous and Next step buttons. An inescapable loop circles at most 3 times, then stops with the caption 'The ghost is trapped: Tab cannot leave this region.' Add req 14.8: 'A visible step caption in a polite live region SHALL read "Step {i} of {n}: {speech of focused node}", plus "Lost Soul skipped: {label}" and "Cursed Loop: trapped" events.' Add req 18.7: 'Any animation that loops SHALL stop after 5 seconds or be controlled by a visible Pause button (WCAG 2.2.2).'

**Verifier note:** Confirmed: design.md:1607 uses a 0 ms step under reduced motion, so the walk is over instantly; the controls at design.md:1616-1628 lack the pause that req 14.7 requires; an inescapable loop 'circles indefinitely' with no stop; and nothing gives a text equivalent (the endless setState loop is overstated, but the defect stands).

## 39. [major] .kiro/specs/spirit-sight-ui/design.md:1449 (app-a11y)

**Issue:** Whisper Walk is not usable as an accessible equivalent. With sound off, Play opens a blocking `alert()` and nothing advances, so caption-only use is impossible and the demo shows a native alert. The caption is `aria-live` during TTS playback, so screen-reader users hear each line twice, overlapping. Caption and highlight are driven by `onstart`/`onend`, which can fail to fire in headless Chromium with no voices, so the E2E step 'Whisper Walk plays' stalls.

**Evidence:** design.md:1449-1451 `if (!soundEnabled) { alert('Sound is disabled...'); return }`. design.md:1465-1478 highlight and auto-advance happen only in `speech.onstart`/`speech.onend`. design.md:1503 `<div className="live-caption" aria-live="polite">`. Prompt 14: 'A visible caption mirrors every utterance, and the caption is the accessible equivalent.' Req 28.3 '... Whisper Walk plays ...'.

**Fix:** Replace in design.md: clicking Play is the user gesture and plays audio (no alert, no dependency on the header toggle). Add a 'Captions only' switch (`aria-pressed`) that advances the caption on a timer of max(1500 ms, 60 ms × characters) with no audio. Drive `currentIndex`, caption and highlight from app state when an utterance is queued, and advance on `onend`, `onerror`, or a timeout of 2× the estimated duration. Set `aria-live="off"` on the caption while audio is playing and `"polite"` in captions-only or manual-step mode. In the E2E, stub `window.speechSynthesis` via `page.addInitScript` and assert the caption text changes.

**Verifier note:** Confirmed: design.md:1449-1451 blocks Whisper Walk with a native alert() when sound is off, so caption-only use is impossible; the caption is aria-live during TTS (double speech for screen-reader users); and advancing depends only on onstart/onend, which can stall in a headless E2E.

## 40. [major] .kiro/specs/spirit-sight-ui/design.md:1859 (app-a11y)

**Issue:** The signature fog wave silently does nothing. It looks up `#spirit-sight-canvas`, but the Spirit Sight render tree has no canvas, and the design system mandates `id="spirit-sight"`. If a canvas is added, the design never says where it sits in the stack, so it could cover the overlay buttons or the app UI.

**Evidence:** design.md:1859-1860 `document.getElementById('spirit-sight-canvas') ... if (!canvas) return`. design.md:950-977 renders only `<img>` and `<svg>`. design-system.md: 'runs only on the screenshot canvas layer (`<canvas id="spirit-sight">`)'. design.md:1874 also hardcodes `rgba(142, 138, 168, 0.3)`, against req 20.5.

**Fix:** In design.md 'Screenshot + Overlay Architecture', specify the stack inside a `position:relative` container clipped to the screenshot box: (1) `<img>`; (2) `<canvas id="spirit-sight" aria-hidden="true" style="pointer-events:none">` sized to the img; (3) `<svg aria-hidden="true">` treatments; (4) the HTML button layer. Rename the lookup to a React ref (no getElementById). Read the fog colour from `getComputedStyle(root).getPropertyValue('--color-mist')`. Add an E2E check that after toggling, the canvas has non-transparent pixels and every `.haunting-trigger` is still clickable.

**Verifier note:** Confirmed: triggerFogWave looks up #spirit-sight-canvas (design.md:1859), but the render tree at design.md:950-977 has no canvas and design-system.md mandates id 'spirit-sight', so the signature effect silently no-ops; a CSS fallback is mentioned but the layer stack is unspecified.

## 41. [major] .kiro/specs/spirit-sight-ui/design.md:986 (app-a11y)

**Issue:** The overlay is scaled with the viewport size, but the engine's screenshot is full-page, so overlays drift vertically. Fitting a full-page screenshot to the viewport height shrinks the overlay buttons far below 24×24 CSS px (2.5.8). Scrolling and focus-not-obscured (2.4.11) are not specified.

**Evidence:** design.md:986-988 `computeScale(audit.raw.viewportWidth, audit.raw.viewportHeight, width, height)` and design.md:961 viewBox uses the same values. browser.ts:346-347 `page.screenshot({ fullPage: true ... })`. design.md:932-935 `scaleFactor = Math.min(containerW/screenshotW, containerH/screenshotH)`: a 1280×5000 page in a 900 px tall pane gives scale 0.18, so a 40 px button becomes a 7 px target.

**Fix:** In design.md use the PNG's natural size (`img.naturalWidth/naturalHeight` on load) for the viewBox and `computeScale`, and scale to the container width only (`scaleFactor = containerW / naturalW`) with vertical scrolling inside the container. Add req 10.7: 'Each overlay button SHALL have a hit area of at least 24×24 CSS px (expand around small boxes; centre on the box), OR the equivalent sidebar instance button (≥24×24 px) satisfies 2.5.8.' Add req 10.8: 'When an overlay button receives focus, it SHALL scroll into view with `scroll-margin` ≥ the height of any sticky header, and no sticky header or toast SHALL cover the focused element (2.4.11).'

**Verifier note:** Confirmed: browser.ts takes a fullPage screenshot, but design.md:986-988 and the viewBox use raw.viewportWidth/Height, so the image is distorted and overlays misalign, and min-fit scaling of tall pages shrinks targets well below 24 px.

## 42. [major] .kiro/specs/spirit-sight-ui/requirements.md:126 (feasibility)

**Issue:** The spec reads ClassifiedAudit/Haunting fields that do not exist and uses deep or runtime imports of core that will not resolve or will break the Vite build. No adapter from ClassifiedAudit to the UI model is specified. The result: compile errors, crashes on `box: null`, page-sized invisible buttons, and accessible names like 'NamelessSpirit: <explanation>'.

**Evidence:** requirements.md:126 `ClassifiedAudit.screenshotPng` (real: `audit.raw.screenshotPng`); requirements.md:209 / tasks.md:262 `audit.tabWalkResult.steps` (real: `audit.raw.tabWalkResult`); requirements.md:228 `haunting.fixSuggestion` (real: `fix.instruction`/`fix.codeSnippet`); design.md:1117 `haunting.cycle?.escapable` (no such field; escapability lives in `raw.tabWalkResult.cycles[].escapable`). design.md:2032 `'@the-unseen/core/classifier'`, design.md:2300 `'@the-unseen/core/classifier/contrast'`, design.md:2506 `'@the-unseen/core/classifier/types'`: core has no `exports` map, only `main: ./dist/index.js`, so these resolve to non-existent paths. The real function is `contrastRatio(RGBColor, RGBColor)`, not `computeContrastRatio(hex, hex)`. design.md:2668 client `utils/contrast.ts # Re-export from core` would pull playwright and node:http into the Vite bundle. Haunting.box is `BoundingBox | null` (classifier types.ts), but design.md:1013-1019 and 1213 dereference `box.x`. SilentTongue and ShatteredOrder carry the <html>/<body> box. design.md:1216 aria-label uses the `haunting.type` id and the explanation, not the Req 10.2 format. The prompt's 'ordering of overlay focus' helper and its fast-check test are absent.

**Fix:** Add a task before 11: `src/client/model/view-model.ts` (pure, client-safe, `import type` only from '@the-unseen/core') with `toOverlayItems(audit)`. It skips `box === null` and page-level types (SilentTongue, and ShatteredOrder: shown in banner/sidebar only). It maps `HAUNTING_DISPLAY_NAMES: Record<HauntingType,string>` ('Nameless Spirit', ... 'The Veiled'). It builds the accessible name `${display}: ${roleLabel} at ${axName || 'unnamed'}, ${severity}` from `raw.axNodes` by `nodeIds[0]`. It sorts overlay focus order by (box.y, box.x), with a fast-check property for a total order that is stable across runs. Fix the four field paths above. All imports from core in apps/web are root `@the-unseen/core`, and client files use `import type` only. Implement `src/client/utils/contrast.ts` locally (hex → sRGB → WCAG luminance) for the token test. Derive escapable cycles from `audit.raw.tabWalkResult.cycles.filter(c => c.escapable)`.

**Verifier note:** Confirmed: requirements/tasks use the wrong paths audit.screenshotPng, tabWalkResult.steps and fixSuggestion. Deep imports like '@the-unseen/core/classifier' cannot resolve because core has no exports map, Haunting.box is nullable but is dereferenced, and the aria-label uses the raw type id.

## 43. [major] .kiro/specs/spirit-sight-ui/requirements.md:193 (feasibility)

**Issue:** The Whisper walk reads only the speech of haunted elements, in haunting-array order, not the whole page in AX-tree order. The demo's 'Hear what they hear' therefore becomes a list of failures. speechNote is never captioned and soundCue is unused. ClassifiedAudit has no per-node speech, and the client cannot import core's `announce` at runtime.

**Evidence:** requirements.md:193 'read speech announcements from `ClassifiedAudit.hauntings[].speech`'; design.md:1437-1438 `audit.hauntings.filter(h => h.speech)`. Prompt 14: 'Reads `speech` strings in AX-tree order ... highlighting each node as it speaks'. hauntings.md §Speech: 'These rules define exactly what text the Whisper walk speaks for each AX node'. packages/core/src/classifier/speech.ts exports `announce(node, raw)` / `announceNote(node)`, but index.ts does not export them, and index.test.ts pins the export list.

**Fix:** Extend core task 0: add a pure `buildSpeechTrack(raw: RawAudit): SpeechLine[]` in `src/classifier/speech-track.ts`. It walks axNodes in tree order from the root, skips ignored and SKIPPED_ROLES, and returns `{ backendDOMNodeId, text: announce(n, raw), note?: announceNote(n), box }`. Add a fast-check test (no 'undefined'/'null', order equals the pre-order traversal). Export it from index.ts and add it to the index.test.ts list. In the server, attach `speechTrack` to the job result and to each sample (`{ result, speechTrack }`). Rewrite Req 13.1 and task 16.2 to read speechTrack: the caption shows `text` plus `note` in a separate line, haunted lines are highlighted in ember, and `soundCue` from the matching haunting plays only when sound is on.

**Verifier note:** Confirmed: design.md:1437 builds utterances only from hauntings[].speech, in haunting order, but prompt 14 line 29 requires speech in AX-tree order. Core's announce() is not exported, so the client has no source for whole-page speech.

## 44. [major] .kiro/specs/spirit-sight-ui/tasks.md:37 (feasibility)

**Issue:** There is no way to generate sample JSON. Task 3.1 asks Kiro to 'create' ClassifiedAudit JSON files by hand, with screenshots, AX trees and box coordinates. They will be fabricated, will drift from the engine, and cannot be regenerated after the classifier lands. That classifier is being built right now, and the task is scheduled in wave 1, before it exists.

**Evidence:** tasks.md:37-41 'Create `apps/web/src/server/samples/cursed-shop-index.json` with pre-audited Cursed Shop home page' (no script). requirements.md:90 'generated offline'. Wave 1 in tasks.md:449 includes 3.1. Prompt 14: samples 'stored as JSON in `apps/web/samples/`'. Existing helper: packages/core/tests/fixtures/shop-server.ts plus capture.mjs already serve the shop and audit it.

**Fix:** Replace task 3.1 with: create `apps/web/scripts/generate-samples.ts` (`npm run samples -w apps/web`). It starts a static server for apps/cursed-shop on 127.0.0.1 (same approach as core's tests/fixtures/shop-server.ts) and calls `auditAndClassify(url, { allowPrivate: true })` for the three pages. It rewrites `raw.auditedUrl` to the display URL `https://cursed-shop.the-unseen.app/<page>`, or to the hosted `/haunted/` path. It writes `apps/web/samples/<id>.json` ({ id, name, url, result, speechTrack }) plus `apps/web/samples/<id>.png`, and a `samples/index.json` manifest. The public-site samples come from the same script with the restrictive default. Prerequisite: classifier tasks complete and `npm run build -w @the-unseen/core`. Until then, task 3.2 serves the manifest only. Resolve the directory with `new URL('../../samples/', import.meta.url)`, so tsc never needs to copy JSON.

**Verifier note:** Confirmed: task 3.1 asks Kiro to hand-create ClassifiedAudit JSON (screenshots, AX trees, boxes) in wave 1, with no generator script, before the classifier exists. The samples would be fabricated and would drift from the engine.

## 45. [major] .kiro/specs/spirit-sight-ui/design.md:539 (feasibility)

**Issue:** The landing page and the job store carry full ClassifiedAudits, including the base64 full-page PNG and the entire raw evidence. GET /api/samples alone ships every sample's screenshot and AX tree before the cards render, so it is not instant. Results are refetched after the Séance, and done jobs are kept for 1 h without a size cap, which can exhaust memory on a small hosted VM.

**Evidence:** requirements.md:86 /api/samples returns `[{ id, name, url, result: ClassifiedAudit }]`, and design.md:824 thumbnail = 'screenshot scaled to 200×150px' (a full data URI per card). ClassifiedAudit.raw holds screenshotPng (fullPage) plus axNodes/domNodes/textNodeStyles. The Cursed Shop raw without the PNG is already about 280 KB per page (packages/core/tests/fixtures/raw/*.json), and public sites will be several MB plus a multi-MB PNG (base64 +33%). design.md:849-850 / tasks.md:156: the Séance receives `result` and SpiritSightView fetches it again. design.md:574 TTL 1 h with no entry cap.

**Fix:** API: `GET /api/samples` returns a manifest only (`{ id, name, url, score, countsByType, thumbnailUrl }`). Add `GET /api/samples/:id`, and `GET /api/samples/:id/screenshot.png` / `GET /api/audit/:id/screenshot.png` as binary `image/png`, served from a Buffer. Strip `raw.screenshotPng` from the JSON (set it to '') and have the <img> point at the PNG URL (CSP img-src 'self' already allows it). GET /api/audit/:id returns `result` only when done. The client keeps it in a module-level cache keyed by job id, so SpiritSightView does not refetch. JobStore: keep at most 50 finished results (LRU) as well as the TTL, and drop `result` after 15 min. Thumbnails are pre-generated 400 px-wide PNG/WebP files written by generate-samples.

**Verifier note:** Confirmed: /api/samples returns the full ClassifiedAudit, including the base64 full-page PNG and raw evidence, for every card. This contradicts the 'samples render instantly' budget, and done jobs are kept 1 h with no size cap.

## 46. [major] .kiro/specs/spirit-sight-ui/design.md:1603 (feasibility)

**Issue:** The keyboard walk cannot show its two signature moments. Lost Souls are, by definition, never Tab steps, so the `lostSouls.has(step)` check never fires. The 'stuck in a Cursed Loop' state has no stop or pause, and the setTimeout chain is never cleared on unmount or when changing view.

**Evidence:** design.md:1568-1572 builds lostSouls from LostSoul nodeIds, and design.md:1603 checks `lostSouls.has(Number(step.backendDOMNodeId))`. LostSoul = a click handler NOT in the Tab sequence (requirements.md:211). design.md:1657 'Inescapable: Ghost circles indefinitely (manual stop required)', but the controls (design.md:1616-1627) have only Play and Speed, against requirements.md:215 'play, pause, and speed controls'. design.md:1607 recursive setTimeout with no cleanup. Escapable is read from the non-existent `haunting.cycle`.

**Fix:** Rewrite design §Keyboard Walk and task 17: precompute a pure `buildWalkScript(audit): WalkFrame[]` in src/client/utils/walk-script.ts (fast-check tested). Frames are `{ kind:'step', box }` for each step. When a LostSoul box lies between two consecutive steps in reading order (y, then x), insert a `{ kind:'skip-soul', box }` frame. Each `raw.tabWalkResult.cycles` entry becomes `{ kind:'circle', boxes, escapable }`: escapable circles twice and then continues; inescapable circles for 3 loops, then stops on a 'Trapped: Cursed Loop' end frame. It never loops forever. All Lost Soul boxes are drawn behind glass for the whole walk. Playback is one `useEffect` with a cleared timeout, with Play / Pause / Step / Restart controls. Under reduced motion, frames advance only by Step.

**Verifier note:** Confirmed: lostSouls.has(step) can never fire, because a Lost Soul by definition is not a Tab step. An inescapable loop circles 'indefinitely (manual stop required)', yet the controls have no pause/stop (against Req 14.7), and the setTimeout chain is never cleared.

## 47. [major] .kiro/specs/spirit-sight-ui/design.md:1718 (feasibility)

**Issue:** The Daylight report and the Markdown export under-report. Each haunting is filed under only its first WCAG criterion, so criteria such as 3.3.2 and 4.1.2 for Whispering Fields never appear. Secondary hauntings (`secondary[]`, `detectedCountsByType`) and the Invisible Wanderer's AAA `guidance` are not shown anywhere, so the WCAG table does not match the engine's findings.

**Evidence:** design.md:1718 `const primary = h.wcag[0] // First WCAG criterion is primary`. Classifier types: `wcag: WCAGCriterion[] // full criteria list ... primary first`, `secondary: Haunting[]`, `detectedCountsByType` (primary + secondary), `guidance?: WCAGCriterion // Invisible Wanderer only: 2.4.13`. groupHauntings (design.md:1274) and the sidebar count only `audit.hauntings`. Prompt 14 asks how 'secondary hauntings' and 'wcag[]' map to the UI.

**Fix:** groupByWCAG: iterate over `[h, ...h.secondary]` and over every criterion in `x.wcag`. Count distinct nodeIds per criterion. Severity = the most severe primary touching it. Render `guidance` in a separate 'Advisory (AAA, not counted)' list. Sidebar: show `countsByType[type]` (scored) and, when different, `+N more found under other hauntings` from `detectedCountsByType`. The detail dialog lists `secondary` types for the same element. The Markdown export uses the same groupByWCAG. Add unit tests with a haunting whose wcag has 3 entries and one secondary.

**Verifier note:** Confirmed: groupByWCAG files each haunting only under h.wcag[0], and nothing renders secondary, detectedCountsByType or guidance, so the Daylight/export WCAG table under-reports what the engine found.

## 48. [major] .kiro/specs/spirit-sight-ui/design.md:966 (feasibility)

**Issue:** The overlay SVG sets `pointer-events: none`, which every <foreignObject> <button> inherits. Mouse users cannot click any haunting, and the specified e2e step fails because Playwright reports that the element does not receive pointer events.

**Evidence:** design.md:966 `pointerEvents: 'none', // Overlays are focusable via Tab, not click`; requirements.md:174 'clicked or activated with Enter/Space'; design.md:2358 `page.click('.haunting-trigger:first-of-type')`.

**Fix:** Keep `pointer-events: none` on the decorative layers only (fog canvas, ghost, SVG art). Set `.haunting-trigger { pointer-events: auto }` explicitly. Render the triggers as absolutely positioned HTML <button>s in a sibling layer (left/top/width/height = box × scaleFactor) rather than inside <foreignObject>, because buttons in foreignObject behave inconsistently across browsers. In e2e use `page.getByRole('button', { name: /Nameless Spirit:/ }).first().click()`.

**Verifier note:** Confirmed: the overlay SVG sets pointerEvents 'none' (design.md:966), which the foreignObject buttons inherit with no override anywhere, so mouse clicks and the e2e page.click step fail.

## 49. [major] .kiro/specs/spirit-sight-ui/tasks.md:11 (feasibility)

**Issue:** The Phase 1 'vertical slice' does not deliver what the prompt requires first: the score, the WCAG export, and an end-to-end run on the Cursed Shop. The score sidebar is task 14 (Phase 2), the export is task 22 (Phase 3), and the self-audit is task 28. The checkpoint at task 10 only checks a screenshot.

**Evidence:** Prompt 14 addendum item 2: 'First a vertical slice that runs end to end on the Cursed Shop, including the score and the WCAG export. Then polish ... then edge cases.' tasks.md:169-171 checkpoint 'can load sample → Spirit Sight displays screenshot'. Sidebar is task 14 and export is task 22 (wave 17-18).

**Fix:** Reorder: Phase 1 = tasks 0 (core onProgress/speechTrack), 1, 2, 3 (generate-samples), 4, 5, 6, 7, 8, 9, plus a minimal sidebar with score and counts (from 14), a minimal DaylightReport with the WCAG table and Markdown/JSON export (from 18.2, 22), and the self-audit (28). The checkpoint becomes: 'Landing → Cursed Shop sample → Spirit Sight shows score → Daylight → export .md; live `{demo}` audit reaches done ≤ 20 s; self-audit green'. Move fog, takes-form and drone to the polish phase, and error-copy, rate-limit tuning and Docker to edge cases. Update the waves JSON accordingly.

**Verifier note:** Confirmed: the Phase 1 checkpoint only verifies 'load sample -> screenshot', while the score (task 14), export (22) and self-audit (28) come later. The prompt addendum explicitly requires the vertical slice to include the score and WCAG export.

## 50. [minor] .kiro/specs/spirit-sight-ui/design.md:2617 (ux-demo)

**Issue:** The '?' shortcut is a single printable-character shortcut with no way to turn it off or remap it, which fails WCAG 2.1.4. The design wrongly claims compliance, and the prompt says shortcuts must not hijack single printable keys.

**Evidence:** design.md 2623: `if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openShortcutsDialog() }` on window, and 2633 claims 'WCAG 2.1.4 Compliance: ... Only `?` (a punctuation key) is used'. 2.1.4 explicitly covers punctuation and symbol characters. Prompt 14: 'shortcuts that ... do not hijack single printable keys (WCAG 2.1.4)'.

**Fix:** Req 30.3 and design: remove the bare '?' handler. Open the shortcuts dialog from the header button only, or bind it to `Alt+Shift+/` (modifier, not a printable-only key). Any future view shortcuts also require Alt or Ctrl. Add a Vitest test: dispatching keydown '?' on document.body does not open a dialog.

**Verifier note:** WCAG 2.1.4 covers punctuation characters, so a bare global '?' handler with preventDefault fails it, and it also swallows '?' typed into the URL input (query strings), which contradicts the design's own compliance claim.

## 51. [minor] .kiro/specs/spirit-sight-ui/design.md:1853 (app-a11y)

**Issue:** The Spirit Sight toggle's visible text ('Normal View' / 'Spirit Sight') is not contained in its fixed aria-label 'Toggle Spirit Sight', which fails 2.5.3 Label in Name (Level A). It also changes its label and sets aria-pressed at the same time, which double-encodes state. The sound toggle conveys state only through its icon.

**Evidence:** design.md:1848-1853 `aria-pressed={spiritSightEnabled} aria-label="Toggle Spirit Sight">{spiritSightEnabled ? '👁️ Spirit Sight' : '🌫️ Normal View'}`. Req 19.3 'icon that reflects current state (muted/unmuted)' with no aria-pressed.

**Fix:** Change design.md to `<button aria-pressed={on}><span aria-hidden="true">👁️</span> Spirit Sight</button>`: constant visible label, no aria-label. Amend req 12.1 to 'visible label "Spirit Sight"'. Amend req 19.3: 'THE Sound toggle SHALL expose state with `aria-pressed`; its icon SHALL be `aria-hidden`.'

**Verifier note:** Minor but real: when off, the visible text 'Normal View' is not contained in the fixed aria-label 'Toggle Spirit Sight' (design.md:1848-1853), a Level A 2.5.3 failure, and req 19.3 gives the sound toggle no aria-pressed.

## 52. [minor] .kiro/specs/spirit-sight-ui/design.md:640 (feasibility)

**Issue:** The job lifecycle has small correctness gaps. Stage timestamps are written from a stale snapshot, so earlier stages may be overwritten. There is no 'done' timestamp, so the classifying stage has no elapsed time. The queue-full check happens after the 202 is sent.

**Evidence:** design.md:627 `const job = jobStore.get(jobId)`, then design.md:640 `stages: { ...job.stages, [stage]: Date.now() }`. If `update` stores a new object, each call keeps only the latest stage. Stages (design.md:513-518) has no `done`, but requirements.md:76 'display the elapsed time for each completed stage'. design.md:479-482 '5. Return 202 ... 6. Enqueue job', while enqueue throws QueueFullError (design.md:597-598) after the reply.

**Fix:** Worker: `jobStore.update(id, j => ({ ...j, status: stage, stages: { ...j.stages, [stage]: Date.now() } }))`, a functional update that reads the current job. Add `done?: number` and `queued: number` to Stages. Route: call `queue.enqueue(id)` before replying, and on QueueFullError delete the job and reply 503. Séance: stop polling on 'error' and on 404 (job expired → 'This séance has ended, start again').

**Verifier note:** Confirmed: the worker writes `{...job.stages, [stage]}` from the initial snapshot, which drops earlier stage timings that Req 3 displays. Enqueue can throw QueueFullError after the 202 is sent, leaving a job stuck in queued that the client polls forever.
