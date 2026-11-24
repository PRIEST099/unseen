# Tasks Document

## Phase 1: Vertical Slice (Landing → Séance → Spirit Sight → Daylight → Export)

The vertical slice delivers one complete user path: submit a Cursed Shop demo → real progress → score + overlays + WCAG report → export → self-audit proof. All subsequent features build on this foundation.

### Task 1.1: Add `onProgress` callback to `auditAndClassify` (additive core change)

**Requirements**: Requirement 3 (Execute Audits with Progress Tracking)

**Design**: Section "Audit Job Queue > Job Worker" and Requirement 3 acceptance criteria 2–3

**Acceptance Criteria**:
- `auditAndClassify(url, options)` in `packages/core/src/index.ts` accepts an optional `onProgress?: (stage: 'loading'|'tree'|'walking'|'classifying', atMs: number) => void` callback in `options`
- When the page load completes, call `onProgress('loading', Date.now())`
- When the AX tree collection completes, call `onProgress('tree', Date.now())`
- When the Tab walk completes, call `onProgress('walking', Date.now())`
- When classification starts, call `onProgress('classifying', Date.now())`
- If `onProgress` is not provided, skip the calls (no-op)
- The callback is never called with the same stage twice in one audit
- If an error occurs before a stage is reached, do not call `onProgress` for that stage
- `OnProgressCallback` type exported from `packages/core/src/types.ts`: `type OnProgressCallback = (stage: 'loading' | 'tree' | 'walking' | 'classifying', atMs: number) => void`
- `AuditOptions` type amended to include `onProgress?: OnProgressCallback`
- Tests: add a property test that calls `auditAndClassify` with a mock `onProgress` callback and asserts that stages are called in order (loading < tree < walking < classifying)

**Checkpoint**: `npm run typecheck -w @the-unseen/core`, `npx vitest --run -w @the-unseen/core`, `npx playwright test -w @the-unseen/core` all pass

**Note in audit-engine spec**: Add this change to `.kiro/specs/audit-engine/tasks.md` Notes section under "Drift from spec": "Task 1.1 (spirit-sight-ui): Added optional `onProgress` callback to `auditAndClassify` for real-time stage reporting. No breaking change; additive only."

---

### Task 1.2: Generate sample data with `build-samples.mjs` and serve sample endpoints

**Requirements**: Requirement 5 (Provide Pre-Audited Samples)

**Design**: Section "Sample Generation" and "API Layer Design > Route: GET /api/samples"

**Acceptance Criteria**:
- `apps/web/scripts/build-samples.mjs` exists and runs with Node ESM (`node --experimental-modules build-samples.mjs`)
- The script starts a local file server for `apps/cursed-shop` on port 4173 using `packages/core/tests/fixtures/shop-server.js` (the existing fixture server)
- For each of three pages (`index.html`, `product.html`, `checkout.html`), the script:
  - Calls `auditAndClassify('http://127.0.0.1:4173/<page>', { allowPrivate: true })`
  - Rewrites `classified.raw.auditedUrl` to `https://cursed-shop.the-unseen.app/<page>` (the public display URL)
  - Calls `buildSpeechTrack(classified.raw)` to generate the speech track
  - Writes `apps/web/samples/<id>.json` with `{ id, name, url, result: ClassifiedAudit, speechTrack: SpeechLine[] }`, where `result.raw.screenshotPng = ''` (stripped)
  - Writes `apps/web/samples/<id>.png` (the PNG buffer from base64)
  - Uses `sharp` to generate a 400px-wide JPEG thumbnail and writes `apps/web/samples/<id>-thumb.jpg`
- The script writes `apps/web/samples/index.json` with an array of `SampleMetadata`: `[{ id, name, url, score, countsByType, thumbnailUrl: '/api/samples/:id/thumbnail.jpg' }]`
- `apps/web/src/server/routes/samples.ts` reads `samples/index.json` at startup and caches it in memory
- `GET /api/samples` returns the cached array as JSON
- `GET /api/samples/:id` reads `samples/<id>.json` and returns it as JSON; returns 404 if the file doesn't exist
- `GET /api/samples/:id/screenshot.png` reads `samples/<id>.png` and returns it as `image/png`; returns 404 if the file doesn't exist
- `GET /api/samples/:id/thumbnail.jpg` reads `samples/<id>-thumb.jpg` and returns it as `image/jpeg`; returns 404 if the file doesn't exist
- `apps/web/package.json` has a `"build-samples"` script: `"build-samples": "node --experimental-modules scripts/build-samples.mjs"`
- `apps/web/samples/.gitignore` excludes `*.png` and `*.jpg` (JSON files are committed)
- Tests: run `npm run build-samples -w apps/web` manually; verify `samples/index.json`, `samples/cursed-shop-index.json`, and all PNGs are created; verify `GET /api/samples` returns 3 samples with correct scores

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run build-samples -w apps/web` completes without error; `samples/index.json` exists and contains 3 samples

---

### Task 1.3: Implement Fastify server with rate limit, SSRF guard, and static serving

**Requirements**: Requirement 1 (Serve the Spirit Sight UI Application), Requirement 2 (Accept Audit Requests)

**Design**: Section "API Layer Design > Fastify Server Factory" and "Route: POST /api/audit"

**Acceptance Criteria**:
- `apps/web/src/server/server.ts` exports `createServer(options?: ServerOptions): FastifyInstance`
- `ServerOptions` type: `{ maxConcurrency?: number; logger?: boolean | object }`
- The server registers `@fastify/helmet` with strict CSP (no inline scripts, no external domains except self)
- The server registers `@fastify/rate-limit` with `global: false` (applies only to routes that opt in)
- The server registers `auditRoutes` at `/api` prefix with `maxConcurrency` passed through
- The server registers `samplesRoutes` at `/api` prefix
- The server registers `healthRoutes` at `/api` prefix
- The server serves `apps/cursed-shop` statically at `/haunted/` without helmet (so inline scripts work) using `@fastify/static` with `decorateReply: false`
- In production (`NODE_ENV=production`), the server refuses to start if `process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1'` (throws an error with message "UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)")
- In production, the server registers `@fastify/static` serving `dist/client/` at `/` with SPA fallback (`setNotFoundHandler` sends `index.html`)
- `apps/web/src/server/main.ts` exists and calls `createServer({ maxConcurrency: Number(process.env.UNSEEN_MAX_CONCURRENCY) || 2 }).listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })`
- `apps/web/package.json` has scripts: `"dev": "vite"`, `"dev:api": "tsx watch src/server/main.ts"`, `"build": "vite build && tsc -p tsconfig.server.json"`, `"start": "NODE_ENV=production node dist/server/main.js"`
- `POST /api/audit` accepts `{ url: string }` or `{ demo: 'cursed-shop-index'|'cursed-shop-product'|'cursed-shop-checkout' }` (JSON schema with `additionalProperties: false` enforces exactly one field)
- When `demo` is provided, the route builds `url = 'http://127.0.0.1:' + PORT + '/haunted/' + <page>.html` (where `<page>` is `index.html`, `product.html`, or `checkout.html` based on `demo`)
- When `url` is invalid (not `http://` or `https://`, not well-formed), return `400 { "error": "INVALID_URL", "message": "URL must be a valid http or https URL" }`
- When SSRF pre-check fails (private IP, loopback, metadata endpoint per `.kiro/steering/security.md`), return `403 { "error": "SSRF_BLOCKED", "message": "Cannot audit private or internal URLs" }`
- Rate limiting on `POST /api/audit` only: 5 requests per minute per IP, 30 requests per hour per IP; return `429 { "error": "RATE_LIMIT", "message": "Too many requests", "retryAfter": <seconds> }` when exceeded
- No rate limiting on `GET /api/audit/:id`, `GET /api/samples*`, static assets, or `GET /api/health`
- When the global concurrent audit limit (from `UNSEEN_MAX_CONCURRENCY` env var, default 2) is reached, enqueue the job up to a depth of 20; when the queue is full, return `503 { "error": "QUEUE_FULL", "message": "Server is at capacity, please try again later" }`
- When a valid request is accepted, create a job with `crypto.randomUUID()` and return `202 { "id": "uuid" }` immediately (before enqueueing)
- The job is enqueued after the response is sent; if `queue.enqueue` throws `QueueFullError`, delete the job from the store and return 503
- `GET /api/health` returns `200 { "status": "ok" }`
- Tests: Vitest integration test that starts the server, posts a URL, receives a 202, posts 25 more URLs from the same IP, receives 429 on the 6th request within 1 minute; verify that `GET /api/audit/:id` polling is not rate-limited

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run dev:api -w apps/web` starts without error; `GET /api/health` returns 200; `POST /api/audit` with an invalid URL returns 400; `POST /api/audit` with a private IP returns 403

---

### Task 1.4: Implement job queue, store, and worker with stage tracking

**Requirements**: Requirement 3 (Execute Audits with Progress Tracking), Requirement 4 (Return Audit Status and Results)

**Design**: Section "Audit Job Queue > Job Store", "Job Queue", and "Job Worker"

**Acceptance Criteria**:
- `apps/web/src/server/jobs/store.ts` exports `JobStore` class with methods: `set(job: Job)`, `get(id: string): Job | undefined`, `update(id: string, updater: (job: Job) => Partial<Job>)`, `startCleanup(): NodeJS.Timeout`
- `Job` type: `{ id: string; url: string; status: JobStatus; stages: Stages; result?: ClassifiedAudit; error?: { code: string; message: string }; createdAt: number; updatedAt: number }`
- `JobStatus` type: `'queued' | 'loading' | 'tree' | 'walking' | 'classifying' | 'done' | 'error'`
- `Stages` type: `{ queued: number; loading?: number; tree?: number; walking?: number; classifying?: number; done?: number }`
- The store is an in-memory Map with TTL of 1 hour; `startCleanup()` runs every 5 minutes and removes jobs older than 1 hour
- The store also drops `result` from done jobs older than 15 minutes (to save memory), and keeps at most 50 done jobs (LRU)
- `update(id, updater)` is a functional update: it reads the current job, calls `updater(job)` to get a patch, merges the patch into the job, sets `updatedAt: Date.now()`, and stores the updated job
- `apps/web/src/server/jobs/queue.ts` exports `JobQueue` class with methods: `enqueue(jobId: string): void`, `processNext(): Promise<void>`
- The queue is a FIFO queue with a concurrency limit (from `maxConcurrency` option, default 2) and a queue depth limit of 20
- When `enqueue` is called and the queue length is ≥20, throw `QueueFullError` (a custom error class)
- When `enqueue` is called and the queue length is <20, push the job ID to the queue and call `processNext()`
- `processNext()` checks if `running.size >= maxConcurrency` or `queue.length === 0`; if so, return early
- Otherwise, `processNext()` shifts the first job ID from the queue, adds it to `running`, calls `executeJob(jobId)` in a try/finally block, removes the job ID from `running` in the finally block, and calls `processNext()` again
- `apps/web/src/server/jobs/worker.ts` exports `executeJob(jobId: string): Promise<void>`
- `executeJob` reads the job from the store, determines if it is a demo (URL starts with `http://127.0.0.1:`), chooses the appropriate safe fetch policy (demos use `OriginScopedPolicy('http://127.0.0.1:' + PORT, new RestrictiveSafeFetchPolicy())`; real URLs use the default restrictive policy), and calls `auditAndClassify(url, { allowPrivate: isDev && UNSEEN_DEV_ALLOW_PRIVATE === '1', safeFetchPolicy, timeoutMs: 60000, onProgress })` where `isDev = NODE_ENV !== 'production'`
- The `onProgress` callback updates the job status and stages using `jobStore.update(jobId, (j) => ({ status: stage, stages: { ...j.stages, [stage]: atMs } }))`
- When `auditAndClassify` completes, `executeJob` strips the screenshot from the result (`result.raw.screenshotPng = ''`) and updates the job with `status: 'done'`, the stripped result, and `stages: { ...job.stages, done: Date.now() }`
- When any error occurs, `executeJob` calls `mapErrorToResponse(error)` to get a user-safe error code and message, and updates the job with `status: 'error'` and the error response
- `mapErrorToResponse(error: unknown): { code: string; message: string }` returns specific error responses for `SsrfBlockedError`, `AuditTimeoutError`, and `AuditResourceLimitError`, and a generic `NETWORK_ERROR` response for all other errors
- `GET /api/audit/:id` reads the job from the store and returns `404 { "error": "NOT_FOUND" }` if the job doesn't exist, `200 { "status": "queued" }` if status is queued, `200 { "status": <stage>, "stages": <Stages> }` if status is loading/tree/walking/classifying, `200 { "status": "done", "result": <ClassifiedAudit>, "stages": <Stages> }` if status is done, or `200 { "status": "error", "error": <code>, "message": <message> }` if status is error
- `GET /api/audit/:id/screenshot.png` reads the job from the store, extracts the PNG buffer from `result.raw.screenshotPng` (which is still base64 in the full job, only stripped in the GET response), and returns it as `image/png` with a Buffer; returns 404 if the job doesn't exist or status is not done
- Tests: Vitest integration test that posts a Cursed Shop demo URL, polls `GET /api/audit/:id` every 500ms, verifies that stages progress in order (queued → loading → tree → walking → classifying → done), verifies that the final result is a `ClassifiedAudit` with score > 0, and verifies that `GET /api/audit/:id/screenshot.png` returns a PNG

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run dev:api -w apps/web` starts without error; posting a demo URL and polling returns a done result within 20 seconds

---

### Task 1.5: Implement routing, app shell, and Landing view

**Requirements**: Requirement 6 (Display Landing Page), Requirement 22 (Ensure App Self-Accessibility)

**Design**: Section "Routing and URL Structure" and "Component Architecture > Views"

**Acceptance Criteria**:
- `apps/web/src/client/main.tsx` renders `<BrowserRouter><App /></BrowserRouter>` where `App` is the root component
- `apps/web/src/client/App.tsx` renders `<ReducedMotionProvider><SoundProvider><Routes>...</Routes></SoundProvider></ReducedMotionProvider>` where `Routes` is the route switch
- `apps/web/src/client/components/AppShell.tsx` renders `<><header><a href="#main" className="skip-link">Skip to main content</a><button aria-label="Toggle sound" onClick={toggleSound}>{soundEnabled ? 'Sound on' : 'Sound off'}</button></header><main id="main" tabindex="-1">{children}</main><footer>© THE UNSEEN</footer></>`
- The skip link is visually hidden by default and visible on focus using CSS: `.skip-link { position: absolute; top: -40px; left: 0; background: var(--color-ecto); color: var(--color-ink); padding: 8px; z-index: 1000; } .skip-link:focus { top: 0; }`
- `apps/web/src/client/views/LandingView.tsx` renders the Landing view with h1 "THE UNSEEN", a text input with label "Enter a URL to audit", a submit button with accessible name "Begin audit", and sample cards
- Sample cards are fetched from `GET /api/samples` on mount and rendered as clickable buttons with the sample name and thumbnail
- When a sample card is clicked, navigate to `/sample/:id` (not `/sample/:id/spirit-sight`; the base route is Spirit Sight by default)
- When the form is submitted, post to `/api/audit` with `{ url }` or `{ demo }` (depending on whether the URL matches a demo pattern), read the job ID from the response, and navigate to `/seance/:jobId`
- `apps/web/index.html` has `<html lang="en">`, a `<title>THE UNSEEN</title>`, and a `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- Every view sets `document.title` on mount using a custom hook `useDocumentTitle(title: string)`
- Every route wraps its content in `<main id="main" tabindex="-1">` (or the `AppShell` does this once for all routes)
- When a route changes, focus moves to `#main` using a `useEffect` that calls `document.getElementById('main')?.focus()` after navigation
- Tests: Playwright e2e test that loads `/`, verifies the h1 "THE UNSEEN", tabs through the skip link and sample cards, clicks a sample card, and verifies navigation to `/sample/cursed-shop-index`

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/` without error; clicking a sample card navigates to `/sample/:id`

---

### Task 1.6: Implement Spirit Sight view with geometry, overlays, score, and fog toggle

**Requirements**: Requirement 8 (Render Spirit Sight View with Screenshot and Overlay), Requirement 9 (Render All Ten Haunting Visual Treatments), Requirement 10 (Make Haunting Overlays Keyboard-Accessible), Requirement 11 (Display Haunting List Sidebar), Requirement 12 (Animate Spirit Sight Fog Toggle)

**Design**: Section "Component Architecture > Views > AuditResultView" and "Spirit Sight View"

**Acceptance Criteria**:
- `apps/web/src/client/views/AuditResultView.tsx` reads route params to determine source (`{ kind: 'job', id }` or `{ kind: 'sample', id }`), fetches the matching endpoint once and caches the result
- The view shows a 404 state if the job expired or the sample doesn't exist
- The view reads the current sub-route (`/keyboard`, `/whisper`, `/daylight`, or base) from `useLocation()` and renders the matching panel
- The base route renders the Spirit Sight view: screenshot + sidebar + overlays
- `apps/web/src/client/components/SpiritSightView.tsx` fetches the screenshot separately from `/api/audit/:id/screenshot.png` or `/api/samples/:id/screenshot.png`
- The screenshot is rendered in an `<img>` element with `alt="Audited page screenshot"`
- A custom hook `useScale(screenshotWidth, screenshotHeight, containerRef)` computes the scale factor: `scaleFactor = min(1, containerWidth / screenshotWidth)`
- The PNG's intrinsic dimensions are read from the `<img>` element's `naturalWidth` and `naturalHeight` properties after load (not from `viewportWidth`/`Height`)
- An SVG overlay layer is rendered with the same `viewBox` as the PNG dimensions: `<svg viewBox="0 0 ${pngWidth} ${pngHeight}" width={scaledWidth} height={scaledHeight}>`
- When the viewport is resized, the scale factor is recomputed and all overlay elements are repositioned
- The view opens with the clean screenshot and overlays hidden; the primary button is "Open Spirit Sight" with `aria-pressed="false"`
- When "Open Spirit Sight" is clicked and `prefers-reduced-motion` is NOT set, a `<canvas id="spirit-sight">` layer is absolutely positioned over the screenshot and draws a 2D value-noise fog (precomputed 256×256 noise tile, tinted from `--color-mist`)
- The fog wave is masked by a soft-edged band sweeping from y=0 to y=scaledHeight over 800ms `ease-in-out`
- Each haunting overlay fades in (400ms) as the wave passes its `box.y`, so overlays appear in reading order
- When the wave ends, focus remains on the toggle, and a polite status line announces "Spirit Sight open: N hauntings, score S"
- If sound is enabled, the first Wraith's speech plays through the whisper engine (the toggle click is the user gesture)
- When `prefers-reduced-motion` IS set, no canvas animation is applied; a CSS `filter` on the `<img>` is applied instantly, and all overlays appear at once
- Overlays are absent from the DOM before activation and present after it
- Each overlay is rendered as a `<button>` element inside the SVG with `role="button"`, positioned using the haunting's bounding box, with an accessible name in the format: `"[Haunting Display Name]: [role] at [name or landmark], [severity]"` (e.g. "Nameless Spirit: button named Add to cart, Wraith")
- Each overlay button has a hit area of at least 24×24 CSS px (expand around small boxes; centre on the box)
- Each overlay button has visible focus indicators: `outline: 3px solid var(--color-ecto)` with `box-shadow: 0 0 0 2px var(--color-ink), 0 0 0 7px var(--color-ink)` (ink halo ensures ≥3:1 contrast against any screenshot background)
- When an overlay button is clicked or activated with Enter/Space, open the haunting detail dialog for that haunting
- Overlay buttons have `pointer-events: auto`; decorative layers (screenshot, fog canvas) have `pointer-events: none`
- The DOM order is: skip link, h1, sidebar (score + haunting list), overlay buttons
- The sidebar displays the Haunting Score (0-100) prominently at the top, hauntings grouped by type (10 groups), counts per type, and severity colors (`--color-ember` for Wraith, `--color-candle` for Restless, `--color-mist` for Banished)
- When a haunting type group is clicked, the instance list for that type expands/collapses
- When a specific haunting instance in the sidebar is clicked, open the haunting detail dialog for that instance
- Tests: Playwright e2e test that loads `/sample/cursed-shop-index`, clicks "Open Spirit Sight", waits for overlays to appear, tabs through overlay buttons, verifies that each button has an accessible name, clicks an overlay button, and verifies that the dialog opens

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/sample/cursed-shop-index` without error; clicking "Open Spirit Sight" reveals overlays; tabbing through overlays works; clicking an overlay opens a dialog

---

### Task 1.7: Implement Daylight mode with WCAG report and export

**Requirements**: Requirement 16 (Render Daylight Mode Report), Requirement 17 (Export Audit Results)

**Design**: Section "Component Architecture > Views > DaylightReport"

**Acceptance Criteria**:
- The user navigates to `/audit/:id/daylight` or `/sample/:id/daylight` (via a "Daylight mode" button in the Spirit Sight view)
- The view hides the screenshot overlay and displays a table-based WCAG report
- The report groups findings by WCAG criterion (using `groupByWCAG(audit.hauntings)`)
- Each criterion row displays: criterion number (e.g. "1.1.1"), name ("Non-text Content"), level (A/AA/AAA), affected element count, and severity (Wraith/Restless/Banished)
- A "Needs manual check" section displays nodes from `audit.needsManualCheck` with the reason (e.g. "Contrast uncertain: image background")
- A prominent note at the top of the report states: "Automated checks find approximately 30-40% of WCAG issues. Manual testing is required for full compliance. This tool never claims a site is 'compliant'."
- The report provides two export buttons: "Export as Markdown" and "Export as JSON"
- When "Export as Markdown" is clicked, generate a Markdown document containing the Haunting Score, hauntings grouped by WCAG criterion, and the coverage disclaimer, and trigger a file download with filename `unseen-audit-[domain]-[timestamp].md`
- When "Export as JSON" is clicked, serialize the full `ClassifiedAudit` object as JSON and trigger a file download with filename `unseen-audit-[domain]-[timestamp].json`
- The filename uses `new URL(audit.raw.auditedUrl).hostname` for the domain and `Date.now()` for the timestamp
- When `prefers-reduced-motion` is set, the Spirit Sight view defaults to Daylight mode on load (the route is `/audit/:id/daylight` or `/sample/:id/daylight`)
- Tests: Playwright e2e test that loads `/sample/cursed-shop-index/daylight`, verifies the report heading, verifies that the first criterion row contains "1.1.1", clicks "Export as Markdown", and verifies that a file download is triggered

**Checkpoint**: `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/sample/cursed-shop-index/daylight` without error; clicking "Export as Markdown" downloads a file; the file contains the Haunting Score and criterion groups

---

### Task 1.8: Self-audit test on Landing and Daylight views

**Requirements**: Requirement 22 (Ensure App Self-Accessibility)

**Design**: Requirement 22 acceptance criteria 1–13

**Acceptance Criteria**:
- Playwright e2e test that starts the dev server, runs `auditAndClassify('http://127.0.0.1:5173/', { allowPrivate: true })`, and asserts that `result.hauntings.length === 0` and `result.axeCrossCheck.unmapped.length === 0`
- Playwright e2e test that runs `auditAndClassify('http://127.0.0.1:5173/sample/cursed-shop-index', { allowPrivate: true })` and asserts zero hauntings and zero unmapped axe violations
- Playwright e2e test that runs `auditAndClassify('http://127.0.0.1:5173/sample/cursed-shop-index/daylight', { allowPrivate: true })` and asserts zero hauntings and zero unmapped axe violations
- If any test fails, the test output must include the full list of hauntings and unmapped violations
- Tests: run `npx playwright test -w apps/web` and verify that all three self-audit tests pass

**Checkpoint**: `npx playwright test -w apps/web` passes with zero hauntings on all three routes

---

## Phase 2: Séance, Whisper Walk, and Keyboard Walk

Phase 2 completes the three audit lenses: real-time progress (Séance), AX-tree speech (Whisper Walk), and Tab sequence animation (Keyboard Walk).

### Task 2.1: Implement Séance view with real stage polling

**Requirements**: Requirement 7 (Display Séance Loading Stage)

**Design**: Section "Routing and URL Structure" and "Component Architecture > Views > SeanceView"

**Acceptance Criteria**:
- `apps/web/src/client/views/SeanceView.tsx` reads the job ID from route params and polls `GET /api/audit/:id` every 500ms while status is queued/loading/tree/walking/classifying
- The view displays the current stage name in human-readable form: "Loading page…", "Reading accessibility tree…", "Walking the keyboard path…", "Classifying hauntings…"
- Each new stage is announced to screen readers via an `aria-live="polite"` region
- The polite live region is rendered empty on mount, before the first poll, and only its text content changes (no DOM node replacement)
- The view displays the elapsed time for each completed stage (e.g. "Loading page… 1.2s")
- When status becomes `"done"`, polling stops immediately and the view auto-navigates to `/audit/:id` (the base route, which is Spirit Sight by default)
- When status becomes `"error"`, polling stops immediately, the error message is displayed in an `aria-live="assertive"` region, and a "Try another URL" button is provided that navigates back to `/`
- On arrival at Spirit Sight from Séance, focus moves to the h1, and a persistent app-level polite region announces "Audit complete: {n} hauntings found, Haunting Score {score}"
- Tests: Playwright e2e test that posts a demo URL, navigates to `/seance/:id`, waits for the Séance view to display "Loading page…", waits for auto-navigation to `/audit/:id`, and verifies that the Spirit Sight view is rendered

**Checkpoint**: `npm run typecheck -w apps/web` passes; posting a demo URL and navigating to `/seance/:id` shows real stage updates and auto-navigates to Spirit Sight when done

---

### Task 2.2: Implement Whisper Walk with Web Speech and synchronized highlighting

**Requirements**: Requirement 13 (Implement Whisper Walk with Web Speech)

**Design**: Section "Component Architecture > Views > WhisperWalk"

**Acceptance Criteria**:
- The user navigates to `/audit/:id/whisper` or `/sample/:id/whisper` (via a "Whisper walk" button in the Spirit Sight view)
- `apps/web/src/client/views/WhisperWalk.tsx` builds utterances from `buildSpeechTrack(audit.raw): SpeechLine[]` exported by `@the-unseen/core`, which walks `axNodes` in tree order and returns `{ backendDOMNodeId, text: announce(node, raw), note?: announceNote(node), box }` for each visible, non-ignored node
- The view provides play, pause, step back, step forward, and speed controls (0.5x, 0.75x, 1x)
- Speed controls map to `rate = clamp(0.85 * speed, 0.4, 0.85)` so speeds above 1× shorten pauses instead of raising the rate
- The view provides a voice selection dropdown populated from `window.speechSynthesis.getVoices()`
- The view provides a "Captions only" toggle that advances captions on a timer (max(1500 ms, 60 ms × characters)) with no audio
- When an utterance is spoken, the corresponding element on the screenshot is highlighted with a yellow box
- A live caption is displayed synchronized with utterances; the caption has `aria-live="off"` during audio playback and `"polite"` in captions-only or manual-step mode
- Pressing Play is the user gesture and sets `soundEnabled=true` if it was off; no alert blocks playback
- The Whisper Walk drives `currentIndex`, caption, and highlight from app state when an utterance is queued, and advances on `onend`, `onerror`, or a timeout of 2× the estimated duration
- All controls have accessible labels
- Tests: Playwright e2e test that loads `/sample/cursed-shop-index/whisper`, clicks Play, waits for the first utterance to complete, verifies that the caption updates, clicks Pause, clicks Step forward, and verifies that the caption advances

**Checkpoint**: `npm run typecheck -w apps/web` passes; loading `/sample/cursed-shop-index/whisper` and clicking Play speaks the first utterance and highlights the corresponding element

---

### Task 2.3: Implement Keyboard Walk with ghost animation and Lost Soul reveals

**Requirements**: Requirement 14 (Animate Keyboard Walk)

**Design**: Section "Component Architecture > Views > KeyboardWalk"

**Acceptance Criteria**:
- The user navigates to `/audit/:id/keyboard` or `/sample/:id/keyboard` (via a "Keyboard walk" button in the Spirit Sight view)
- `apps/web/src/client/views/KeyboardWalk.tsx` displays an animated ghost following the Tab sequence from `audit.raw.tabWalkResult.steps`
- When `prefers-reduced-motion` is NOT set, the ghost transitions between focus positions with 300ms `ease-in-out` easing
- When `prefers-reduced-motion` IS set, the ghost uses 300ms step intervals with no CSS transition (not 0ms, which causes instant completion and endless loops)
- Before moving from step i to step i+1, the walk reveals every Lost Soul (from `audit.hauntings` with type `LostSoul`) whose box lies in reading order between the two step boxes, using the glass treatment with 600ms fade (instant under reduced motion)
- When the walk encounters an escapable cycle (from `audit.raw.tabWalkResult.cycles.filter(c => c.escapable)`), the ghost circles the members twice, then breaks free and continues
- When the walk encounters an inescapable Cursed Loop (a haunting with type `CursedLoop`), the ghost circles at most 3 times, an ember ring pulses, and the walk stops with the status "Trapped: keyboard users cannot leave this dialog"
- The view provides Play/Pause (one button with `aria-pressed`), Step back, Step forward, Restart, and Speed controls
- A visible step caption in a polite live region reads "Step {i} of {n}: {speech of focused node}", plus "Lost Soul skipped: {label}" and "Cursed Loop: trapped" events
- The ghost is rendered as a `<g>` inside the SAME overlay SVG (same `viewBox`), not a separate unscaled layer
- Tests: Playwright e2e test that loads `/sample/cursed-shop-index/keyboard`, clicks Play, waits for the ghost to move through the first 5 steps, clicks Pause, clicks Step back, and verifies that the ghost moves backward

**Checkpoint**: `npm run typecheck -w apps/web` passes; loading `/sample/cursed-shop-index/keyboard` and clicking Play animates the ghost through the Tab sequence

---

## Phase 3: Polish, Product States, and Self-Audit

Phase 3 completes the demo-ready polish: "takes form" animation, ambient drone, error states, and self-audit proof on every route.

### Task 3.1: Implement "Takes Form" celebration animation on exorcism

**Requirements**: Requirement 18 (Respect Reduced Motion Preference)

**Design**: Section "Motion rules" in `.kiro/steering/design-system.md`

**Acceptance Criteria**:
- When a haunting is fixed (simulated by clicking a "Fix" button in the haunting detail dialog, which removes the haunting from the list and decrements the score), trigger a "Takes form" animation on the overlay element
- When `prefers-reduced-motion` is NOT set, the animation uses 600ms `cubic-bezier(0.34, 1.56, 0.64, 1)` easing (a bounce)
- When `prefers-reduced-motion` IS set, the animation is a simple opacity fade (100ms)
- The overlay element fades out and is removed from the DOM after the animation completes
- Tests: Playwright e2e test that loads `/sample/cursed-shop-index`, opens a haunting detail dialog, clicks "Fix" (a mock button that removes the haunting from state), and verifies that the overlay element is removed

**Checkpoint**: `npm run typecheck -w apps/web` passes; clicking "Fix" in a haunting detail dialog removes the overlay with the "Takes form" animation

---

### Task 3.2: Implement optional ambient drone with reduced-motion respect

**Requirements**: Requirement 19 (Provide Sound Controls)

**Design**: Section "Sound rules" in `.kiro/steering/design-system.md`

**Acceptance Criteria**:
- When sound is enabled by user gesture (the sound toggle button in the app header) AND `prefers-reduced-motion` is NOT set, start an ambient drone using Web Audio API (a low-frequency oscillator with reverb)
- The drone volume is low enough to not interfere with Web Speech (≤20% of the master volume)
- When `prefers-reduced-motion` IS set, do not start the drone even if sound is enabled
- When sound is disabled, stop the drone immediately
- The drone loops continuously until stopped
- Tests: manual test that enables sound and verifies that the drone starts (listen with headphones); verify that disabling sound stops the drone

**Checkpoint**: `npm run typecheck -w apps/web` passes; enabling sound starts the ambient drone; disabling sound stops it; setting `prefers-reduced-motion` prevents the drone from starting

---

### Task 3.3: Handle product states: 404, error, empty audit

**Requirements**: Requirement 7 (Display Séance Loading Stage, error handling), Routing and URL Structure

**Design**: Section "Routing and URL Structure > 404 Handling" and "API Layer Design > Route: GET /api/audit/:id"

**Acceptance Criteria**:
- A `NotFoundView` component is rendered for unmatched routes, displaying h1 "Page not found" and a link back to `/`
- When `GET /api/audit/:id` returns 404 (job expired or never existed), the `AuditResultView` displays a 404 state with h1 "Audit not found" and a link back to `/`
- When `GET /api/samples/:id` returns 404 (sample doesn't exist), the `AuditResultView` displays a 404 state with h1 "Sample not found" and a link back to `/`
- When an audit completes with zero hauntings (score 0), the Spirit Sight view displays a success message: "No hauntings detected. This page passed all automated checks." and a note: "Automated checks find approximately 30-40% of WCAG issues. Manual testing is still required."
- When an audit errors (status `"error"` from `GET /api/audit/:id`), the Séance view displays the error message in an `aria-live="assertive"` region and provides a "Try another URL" button
- Tests: Playwright e2e test that navigates to `/audit/nonexistent-id` and verifies the 404 state; test that posts a URL that times out (mock a 60s delay) and verifies the error state

**Checkpoint**: `npm run typecheck -w apps/web` passes; navigating to `/audit/nonexistent-id` displays the 404 state; auditing a URL that errors displays the error state

---

### Task 3.4: Self-audit test on Séance, Spirit Sight, Whisper, and Keyboard routes

**Requirements**: Requirement 22 (Ensure App Self-Accessibility)

**Design**: Requirement 22 acceptance criteria 1–13

**Acceptance Criteria**:
- Playwright e2e test that runs `auditAndClassify('http://127.0.0.1:5173/seance/mock-id', { allowPrivate: true })` (with a mock job in the store) and asserts zero hauntings and zero unmapped axe violations
- Playwright e2e test that runs `auditAndClassify('http://127.0.0.1:5173/sample/cursed-shop-index/whisper', { allowPrivate: true })` and asserts zero hauntings and zero unmapped axe violations
- Playwright e2e test that runs `auditAndClassify('http://127.0.0.1:5173/sample/cursed-shop-index/keyboard', { allowPrivate: true })` and asserts zero hauntings and zero unmapped axe violations
- If any test fails, the test output must include the full list of hauntings and unmapped violations
- Tests: run `npx playwright test -w apps/web` and verify that all self-audit tests pass on all routes

**Checkpoint**: `npx playwright test -w apps/web` passes with zero hauntings on all routes (Landing, Séance, Spirit Sight, Whisper, Keyboard, Daylight)

---

### Task 3.5: E2E test of the full vertical slice on Cursed Shop

**Requirements**: All Phase 1–3 requirements

**Design**: Full user flow from Landing to Daylight export

**Acceptance Criteria**:
- Playwright e2e test that:
  1. Loads `/`
  2. Clicks the "Cursed Shop: Home" sample card
  3. Verifies navigation to `/sample/cursed-shop-index`
  4. Clicks "Open Spirit Sight"
  5. Waits for overlays to appear
  6. Verifies that the score matches the expected score from `samples/cursed-shop-index.json`
  7. Clicks an overlay button
  8. Verifies that the haunting detail dialog opens
  9. Closes the dialog
  10. Clicks "Whisper walk"
  11. Verifies navigation to `/sample/cursed-shop-index/whisper`
  12. Clicks Play
  13. Waits for the first utterance to complete
  14. Clicks Pause
  15. Clicks "Keyboard walk"
  16. Verifies navigation to `/sample/cursed-shop-index/keyboard`
  17. Clicks Play
  18. Waits for the ghost to move through 3 steps
  19. Clicks Pause
  20. Clicks "Daylight mode"
  21. Verifies navigation to `/sample/cursed-shop-index/daylight`
  22. Clicks "Export as Markdown"
  23. Verifies that a file download is triggered
  24. Navigates back to `/` using the browser back button
  25. Verifies that the Landing view is rendered again
- Tests: run `npx playwright test -w apps/web` and verify that the full vertical slice test passes

**Checkpoint**: `npx playwright test -w apps/web` passes; the full vertical slice test completes without error

---

## Final Checkpoint

**Run all three package test suites**:
1. `npm run typecheck -w @the-unseen/core` and `npx vitest --run -w @the-unseen/core` and `npx playwright test -w @the-unseen/core` all pass
2. `npm run typecheck -w apps/web` and `npx vitest --run -w apps/web` and `npx playwright test -w apps/web` all pass
3. `npm run build-samples -w apps/web` completes without error
4. `npm run build -w apps/web` completes without error (Vite build + server TypeScript compile)
5. `npm run start -w apps/web` starts the production server without error (requires `npm run build` first)

**Self-audit proof**:
- All self-audit tests pass: Landing, Séance, Spirit Sight, Whisper, Keyboard, Daylight
- Zero hauntings and zero unmapped axe violations on every route
- The app itself is WCAG 2.2 AA compliant

**Demo readiness**:
- The full vertical slice test passes: Landing → sample click → Spirit Sight → Whisper → Keyboard → Daylight → export
- The Cursed Shop demo loads and audits successfully
- All animations respect `prefers-reduced-motion`
- Sound is off by default and respects the user's gesture
- The design system tokens are applied consistently
- All text has ≥4.5:1 contrast (verified by the design token test)
- All interactive elements are keyboard-accessible with visible focus indicators
- All form inputs have accessible labels
- All images have alt text
- The app has correct heading hierarchy on every route

---

## Notes

### Deviations from Original Spec

None. This `tasks.md` follows the phase structure decided in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md` and the requirements in `requirements.md`.

### Dependencies on Other Specs

- **audit-engine** (`.kiro/specs/audit-engine/`): Task 1.1 adds `onProgress` to `auditAndClassify`. This is an additive change and is noted in the audit-engine spec's Notes section.
- **haunting-classifier** (`.kiro/specs/haunting-classifier/`): The classifier exports `ClassifiedAudit`, which is the data contract for the UI. No changes required.
- **cursed-shop** (`apps/cursed-shop/`): The shop must be buildable and servable by the sample generation script. No changes required.

### Tech Stack Decisions

- **React Router**: `react-router-dom` v6 for routing
- **Vite**: Build tool for the React SPA
- **Fastify**: API server
- **Web Speech API**: For Whisper Walk utterances
- **Web Audio API**: For optional ambient drone
- **Canvas 2D**: For fog wave animation (not WebGL; simpler for the demo scope)
- **sharp**: For thumbnail generation in `build-samples.mjs`
- **@fontsource/atkinson-hyperlegible** and **@fontsource/cormorant-garamond**: Self-hosted fonts
- **@fastify/helmet**: CSP enforcement
- **@fastify/rate-limit**: Per-route rate limiting
- **@fastify/static**: Static file serving
- **playwright**: E2e testing
- **vitest**: Unit and integration testing

### Open Questions

None. All decisions are finalized in the requirements and design documents.
