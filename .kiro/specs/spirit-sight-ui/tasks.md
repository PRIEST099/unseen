# Implementation Plan: Spirit Sight UI

## Overview

The Spirit Sight UI is a React + Fastify web application that presents accessibility audit results as visceral hauntings. This plan implements the full vertical slice — Landing, Séance, Spirit Sight, Whisper Walk, Keyboard Walk, Daylight — with self-audit proof.

## Tasks

- [x] 1. Phase 1: Vertical slice (Landing → Séance → Spirit Sight → Daylight → Export)
  - The vertical slice delivers one complete user path: submit a Cursed Shop demo → real progress → score + overlays + WCAG report → export → self-audit proof. All subsequent features build on this foundation.
  
  - [x] 1.0 Scaffold `apps/web` with package.json, tsconfig, and build tools
    - _Requirements: Requirement 1 (Serve the Spirit Sight UI Application)_
    - _Design: Section "Overview", "API Layer Design", "SPA Architecture"_
    - **Acceptance Criteria:**
      - `apps/web/package.json` exists with `"name": "@the-unseen/web"`, `"version": "0.1.0"`, `"type": "module"`
      - `package.json` has a workspace dependency on `"@the-unseen/core": "0.1.0"` (npm workspaces do not support `workspace:*`)
      - `package.json` has dependencies: `fastify`, `@fastify/helmet`, `@fastify/static`, `@fastify/rate-limit`, `react`, `react-dom`, `react-router-dom`, `sharp`
      - `package.json` has devDependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `tsx`, `vitest`, `@playwright/test`, `cross-env`, `@fontsource/atkinson-hyperlegible`, `@fontsource/cormorant-garamond`
      - `package.json` has scripts: `"dev": "vite"`, `"dev:api": "cross-env NODE_ENV=development tsx watch src/server/main.ts"`, `"build": "vite build && tsc -p tsconfig.server.json"`, `"start": "cross-env NODE_ENV=production node dist/server/main.js"`, `"start:test": "cross-env NODE_ENV=test UNSEEN_DEV_ALLOW_PRIVATE=1 node dist/server/main.js"`, `"test": "vitest --run"`, `"e2e": "playwright test"`, `"typecheck": "tsc --noEmit -p tsconfig.client.json && tsc --noEmit -p tsconfig.server.json"`, `"build-samples": "node scripts/build-samples.mjs"`
      - `apps/web/tsconfig.json` exists as a base extending `../../tsconfig.base.json` with `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`, `"esModuleInterop": true`
      - `apps/web/tsconfig.client.json` extends `./tsconfig.json` with `"include": ["src/client/**/*"]`, `"exclude": ["**/*.test.ts", "**/*.test.tsx"]`, `"compilerOptions": { "lib": ["ES2022", "DOM"], "types": ["vite/client"] }`
      - `apps/web/tsconfig.server.json` extends `./tsconfig.json` with `"include": ["src/server/**/*"]`, `"exclude": ["**/*.test.ts"]`, `"compilerOptions": { "outDir": "dist/server", "lib": ["ES2022"], "types": ["node"] }`
      - `apps/web/vite.config.ts` exists with `@vitejs/plugin-react` plugin registered, `server.proxy` config: `"/api": { "target": "http://localhost:3000", "changeOrigin": true }`, `build.outDir: "dist/client"`, `build.sourcemap: true`
      - `apps/web/vitest.config.ts` exists with `test.include: ["src/**/*.test.ts", "src/**/*.test.tsx"]`, `test.environment: "jsdom"` for client tests
      - `apps/web/playwright.config.ts` exists with `testDir: "e2e/"`, `webServer.command: "npm run build && npm run start:test"` (cross-env only applies to the command it prefixes, and `start` forces production, which refuses the dev flag), `webServer.port: 3000`, `use.baseURL: "http://localhost:3000"`
      - `apps/web/index.html` exists with `<html lang="en">`, `<title>THE UNSEEN</title>`, `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<div id="root"></div>`, `<script type="module" src="/src/client/main.tsx"></script>`
      - Directory structure created: `apps/web/src/client/` (components, views, hooks, contexts), `apps/web/src/server/` (routes, jobs), `apps/web/e2e/` (Playwright tests), `apps/web/scripts/` (build-samples.mjs), `apps/web/samples/` (generated JSON + PNG + JPG)
    - **Tests:** `npm run typecheck -w apps/web` passes (with empty client/server stubs)
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm install` completes without peer-dependency warnings
  
  - [x] 1.0a Add `buildSpeechTrack` to core classifier
    - _Requirements: Requirement 13 (Implement Whisper Walk with Web Speech) — the Whisper Walk needs AX-tree speech in reading order_
    - _Design: Section "Data Contract: Core Types to UI Needs" row "Speech", decision I from prompt 38_
    - **Acceptance Criteria:**
      - `packages/core/src/classifier/speech.ts` exports a pure function `buildSpeechTrack(raw: RawAudit): SpeechLine[]`
      - `SpeechLine` type is defined in `packages/core/src/classifier/types.ts`: `{ backendDOMNodeId: number, text: string, note?: string, box: BoundingBox | null }`
      - `buildSpeechTrack` walks `raw.axNodes` in tree order (the array order from CDP `Accessibility.getFullAXTree`)
      - For each AX node where `ignored !== true`: Call `announce(node, raw)` to get the main text (role + name + state), Call `announceNote(node)` to get the optional note (e.g. "name disappears when typing" for placeholder-only fields), Look up the bounding box from `raw.boundingBoxes` using `backendDOMNodeId`, Push `{ backendDOMNodeId: node.backendDOMNodeId, text, note, box }` to the result array
      - `announce` and `announceNote` already exist in `packages/core/src/classifier/speech.ts` (implemented in the haunting-classifier spec); reuse them exactly
      - `buildSpeechTrack` is exported by name from `packages/core/src/index.ts` (add it to the existing named exports list)
      - `SpeechLine` type is re-exported from `packages/core/src/index.ts` via `export type { SpeechLine } from './classifier/types.js'`
      - `packages/core/src/index.test.ts` exists with a test that imports `buildSpeechTrack` and `SpeechLine` by name from `@the-unseen/core` and asserts that they are defined (this confirms the public export)
      - `packages/core/src/classifier/speech.test.ts` already has property tests for `announce` and `announceNote`; add a unit test for `buildSpeechTrack` that: Calls `buildSpeechTrack` with a mock `RawAudit` containing 3 AX nodes (one with a name, one without, one ignored), Asserts that the result has 2 entries (the ignored node is skipped), Asserts that the first entry has `text` matching the expected announcement for that node
    - **Tests:** `npm run typecheck -w @the-unseen/core`, `npm run test -w @the-unseen/core` pass
    - **Checkpoint:** `npm run test -w @the-unseen/core` passes; `buildSpeechTrack` and `SpeechLine` are exported by name from `@the-unseen/core`
    - **Note in audit-engine spec:** Add this change to `.kiro/specs/audit-engine/tasks.md` Notes section under "Drift from spec": "Task 1.0a (spirit-sight-ui): Added `buildSpeechTrack(raw): SpeechLine[]` exported by name from `src/index.ts`. This builds the AX-tree speech track for the Whisper Walk. `SpeechLine` type also exported. No breaking change; additive only."
  
  - [-] 1.1 Add `onProgress` callback to `auditAndClassify` (additive core change)
    - _Requirements: Requirement 3 (Execute Audits with Progress Tracking)_
    - _Design: Section "Audit Job Queue > Job Worker" and Requirement 3 acceptance criteria 2–3_
    - **Acceptance Criteria:**
      - `packages/core/src/index.ts` amends the `AuditOptions` type to include `onProgress?: (stage: 'loading' | 'tree' | 'walking' | 'classifying', atMs: number) => void`
      - `auditAndClassify(url, options)` reads `options.onProgress`; if undefined, no progress callbacks are made (no-op)
      - When the page load completes (`networkidle` or timeout), call `onProgress?.('loading', Date.now())`
      - When the AX tree collection completes, call `onProgress?.('tree', Date.now())`
      - When the Tab walk completes, call `onProgress?.('walking', Date.now())`
      - Before classification starts (before `classify(raw)` is called), call `onProgress?.('classifying', Date.now())`
      - Each stage is called at most once per audit; if an error occurs before a stage is reached, that stage callback is not called
      - The callback must not throw; if it does, the audit continues (wrap the call in a try/catch that logs but does not propagate the error)
      - `packages/core/src/types.ts` exports `OnProgressCallback` type: `export type OnProgressCallback = (stage: 'loading' | 'tree' | 'walking' | 'classifying', atMs: number) => void`
      - `packages/core/src/audit.test.ts` (or a new test file) has a property test that: Calls `auditAndClassify` with a mock `onProgress` callback (via `fc.assert`), Uses `auditHtml` with a minimal valid HTML fixture so the audit completes in <1s, Asserts that stages are called in order: `loading < tree < walking < classifying` (compare the `atMs` timestamps), Asserts that each stage is called exactly once
    - **Tests:** `npm run typecheck -w @the-unseen/core`, `npm run test -w @the-unseen/core` pass
    - **Checkpoint:** `npm run typecheck -w @the-unseen/core`, `npm run test -w @the-unseen/core` pass
    - **Note in audit-engine spec:** Add this change to `.kiro/specs/audit-engine/tasks.md` Notes section under "Drift from spec": "Task 1.1 (spirit-sight-ui): Added optional `onProgress` callback to `auditAndClassify` for real-time stage reporting. Stages emitted: loading, tree, walking, classifying. No breaking change; additive only."
  
  - [~] 1.2 Generate sample data with `build-samples.mjs` and serve sample endpoints
    - _Requirements: Requirement 5 (Provide Pre-Audited Samples)_
    - _Design: Section "Sample Generation" and "API Layer Design > Route: GET /api/samples"_
    - **Acceptance Criteria:**
      - `apps/web/scripts/build-samples.mjs` exists as a Node ESM script (top-level `await`, `import` statements)
      - The script imports `{ createServer as createViteServer }` from `vite` and starts a Vite dev server for `apps/cursed-shop` on a free port (use `server.listen()` with no port to get an ephemeral port, then read `server.httpServer.address().port`)
      - For each of three pages (`index.html`, `product.html`, `checkout.html`), the script: Constructs the local URL: `http://localhost:${port}/${page}`, Calls `auditAndClassify(localUrl, { allowPrivate: true })` to get the `ClassifiedAudit`, Rewrites `classified.raw.auditedUrl` to `https://the-unseen.app/cursed-shop/${page}` (the public display URL), Calls `buildSpeechTrack(classified.raw)` to generate the speech track, Extracts the PNG from `classified.raw.screenshotPng` (base64) and writes `apps/web/samples/<id>.png` (binary PNG buffer), Uses `sharp` to read the PNG, resize to 400px width (maintain aspect ratio), convert to JPEG quality 85, and write `apps/web/samples/<id>-thumb.jpg`, Strips the PNG from the result: `classified.raw.screenshotPng = ''`, Writes `apps/web/samples/<id>.json` with `{ id, name, url, result: classified, speechTrack }`
      - The sample IDs are: `cursed-shop-index`, `cursed-shop-product`, `cursed-shop-checkout`
      - The sample names are: "Cursed Shop — Home", "Cursed Shop — Product", "Cursed Shop — Checkout"
      - The script writes `apps/web/samples/index.json` with an array of `SampleMetadata`: `[{ id, name, url, score, countsByType, thumbnailUrl }]` where `thumbnailUrl = "/api/samples/${id}/thumbnail.jpg"`
      - `apps/web/src/server/routes/samples.ts` reads `samples/index.json` at startup (synchronously, before the server starts) and caches it in memory as a module-level variable
      - `GET /api/samples` returns the cached array as JSON
      - `GET /api/samples/:id` reads `samples/<id>.json` synchronously (using `fs.readFileSync` from `node:fs`) and returns it as JSON; returns 404 if the file doesn't exist
      - `GET /api/samples/:id/screenshot.png` reads `samples/<id>.png` and returns it as `Content-Type: image/png` with a Buffer; returns 404 if the file doesn't exist
      - `GET /api/samples/:id/thumbnail.jpg` reads `samples/<id>-thumb.jpg` and returns it as `Content-Type: image/jpeg`; returns 404 if the file doesn't exist
      - `apps/web/samples/.gitignore` exists with `*.png` and `*.jpg` (JSON files are committed; images are generated locally and in CI)
      - `apps/web/package.json` has a `"build-samples"` script: `"build-samples": "node scripts/build-samples.mjs"`
    - **Tests:** Run `npm run build-samples -w apps/web` manually; verify `samples/index.json`, `samples/cursed-shop-index.json`, `samples/cursed-shop-index.png`, and `samples/cursed-shop-index-thumb.jpg` are created; start the dev API server and verify `GET /api/samples` returns 3 samples with correct scores
    - **Checkpoint:** `npm run build-samples -w apps/web` completes without error; `samples/index.json` exists and contains 3 samples; `GET /api/samples` returns the cached metadata
  
  - [~] 1.3 Implement Fastify server with security, rate limit, and static serving
    - _Requirements: Requirement 1 (Serve the Spirit Sight UI Application), Requirement 2 (Accept Audit Requests)_
    - _Design: Section "API Layer Design > Fastify Server Factory", "Entry Point", and decision H from prompt 38_
    - **Acceptance Criteria:**
      - `apps/web/src/server/server.ts` exports `createServer(options?: ServerOptions): FastifyInstance`
      - `ServerOptions` type: `{ maxConcurrency?: number; logger?: boolean | object }`
      - The server is created with `fastify({ logger: NODE_ENV === 'production' ? true : { transport: { target: 'pino-pretty' } }, trustProxy: true })`
      - The server registers `@fastify/helmet` with `global: false` (applied per-route, not globally)
      - The server decorates a route with helmet by calling `server.register(helmet, { ... })` inside a plugin scoped to `/api` and `/` (but not `/cursed-shop/`)
      - The helmet CSP is strict: `{ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "data:"], fontSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"] } } }`
      - The server registers `@fastify/rate-limit` with `global: false` (applies only to routes that opt in)
      - The server registers `auditRoutes` from `src/server/routes/audit.ts` at `/api` prefix, passing `{ maxConcurrency }` in the route options
      - The server registers `samplesRoutes` from `src/server/routes/samples.ts` at `/api` prefix
      - The server registers `healthRoutes` from `src/server/routes/health.ts` at `/api` prefix
      - The server serves `apps/cursed-shop` statically at `/cursed-shop/` (not `/haunted/`) using `@fastify/static` with `{ root: path.join(__dirname, '../../../cursed-shop'), prefix: '/cursed-shop/', decorateReply: false }`, and **does not** apply helmet to this route (cursed-shop needs its inline scripts)
      - In production (`NODE_ENV === 'production'`): If `process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1'`, throw an error with message: `"UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)"`, The server registers `@fastify/static` serving `dist/client/` at `/` with SPA fallback: `{ root: path.join(__dirname, '../client'), prefix: '/', decorateReply: false }` and `server.setNotFoundHandler((req, reply) => reply.sendFile('index.html'))`
      - `apps/web/src/server/main.ts` exists and: Calls `createServer({ maxConcurrency: Number(process.env.UNSEEN_MAX_CONCURRENCY) || 2, logger: true })`, Calls `server.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })`, Logs the listening address and port, Installs a `SIGTERM` handler that calls `server.close()` and exits gracefully
      - `apps/web/src/server/routes/health.ts` exports a Fastify plugin that registers `GET /api/health` returning `200 { "status": "ok" }`
    - **Tests:** Vitest integration test that starts the server, calls `GET /api/health`, and asserts `200 { "status": "ok" }`; test that setting `UNSEEN_DEV_ALLOW_PRIVATE=1` and `NODE_ENV=production` throws the expected error
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm run dev:api -w apps/web` starts without error; `GET /api/health` returns 200; `GET /cursed-shop/index.html` serves the Cursed Shop HTML
  
  - [~] 1.4 Implement job queue, store, and worker with stage tracking
    - _Requirements: Requirement 3 (Execute Audits with Progress Tracking), Requirement 4 (Return Audit Status and Results)_
    - _Design: Section "Audit Job Queue > Job Store", "Job Queue", and "Job Worker", decision N from prompt 38_
    - **Acceptance Criteria:**
      - `apps/web/src/server/jobs/store.ts` exports a singleton `JobStore` class with methods: `set(job: Job): void`, `get(id: string): Job | undefined`, `update(id: string, updater: (job: Job) => Partial<Job>): void`, `delete(id: string): void`, `startCleanup(): NodeJS.Timeout`
      - `Job` type (defined in `src/server/jobs/types.ts`): `{ id: string; url: string; status: JobStatus; stages: Stages; result?: ClassifiedAudit; screenshotPng?: string; error?: { code: string; message: string }; createdAt: number; updatedAt: number }`
      - `JobStatus` type: `'queued' | 'loading' | 'tree' | 'walking' | 'classifying' | 'done' | 'error'`
      - `Stages` type: `{ queued: number; loading?: number; tree?: number; walking?: number; classifying?: number; done?: number }`
      - The store is an in-memory `Map<string, Job>`
      - `startCleanup()` runs every 5 minutes and: Removes jobs where `Date.now() - job.updatedAt > 3600000` (1 hour), For done jobs older than 15 minutes, delete `job.result` and `job.screenshotPng` to save memory (keep the job metadata), Keeps at most 50 done jobs (LRU: sort by `updatedAt`, keep the 50 newest, delete the rest)
      - `apps/web/src/server/jobs/queue.ts` exports a singleton `JobQueue` class with methods: `enqueue(jobId: string): void`, `processNext(): Promise<void>`
      - The queue is a FIFO array with: `maxConcurrency: number` (from constructor options, default 2), `queue: string[]` (job IDs waiting to run), `running: Set<string>` (job IDs currently running)
      - `enqueue(jobId)`: If `queue.length >= 20`, throw `new QueueFullError('Queue is full')`, Push `jobId` to `queue`, Call `this.processNext()` without awaiting (fire-and-forget)
      - `processNext()`: If `running.size >= maxConcurrency` or `queue.length === 0`, return early, Shift the first job ID from `queue`, Add it to `running`, Call `executeJob(jobId)` in a try/finally block, In the finally block, remove the job ID from `running` and call `this.processNext()` again
      - `apps/web/src/server/jobs/worker.ts` exports `executeJob(jobId: string): Promise<void>`
      - `executeJob`: Reads the job from the store; if not found, return early, Updates the job to `status: 'queued', stages: { queued: Date.now() }`, Determines if the URL is a demo (starts with `http://127.0.0.1:` or `http://localhost:`), Chooses the safe fetch policy: Demos: no explicit policy (uses the default restrictive policy; Playwright will allow localhost because the test runs locally), Real URLs: no explicit policy (uses the default restrictive policy), Determines `allowPrivate`: `true` if `NODE_ENV !== 'production' && process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1'`, else `false`, Calls `auditAndClassify(url, { allowPrivate, timeoutMs: 60000, onProgress })`, The `onProgress` callback calls `jobStore.update(jobId, (j) => ({ status: stage, stages: { ...j.stages, [stage]: atMs } }))`, When `auditAndClassify` completes: Extracts the PNG from `result.raw.screenshotPng` (base64 string) and stores it separately as `screenshotPng: result.raw.screenshotPng` in the job, Strips the PNG from the result: `result.raw.screenshotPng = ''`, Updates the job to `status: 'done', result, stages: { ...job.stages, done: Date.now() }`, When any error occurs: Calls `mapErrorToResponse(error)` to get `{ code, message }`, Updates the job to `status: 'error', error: { code, message }`
      - `mapErrorToResponse(error: unknown): { code: string; message: string }`: If `error instanceof SsrfBlockedError`, return `{ code: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' }`, If `error instanceof AuditTimeoutError`, return `{ code: 'TIMEOUT', message: 'Audit timed out after 60 seconds' }`, If `error instanceof AuditResourceLimitError`, return `{ code: 'RESOURCE_LIMIT', message: 'Page exceeded resource limits' }`, Otherwise, return `{ code: 'NETWORK_ERROR', message: 'Failed to load the page' }`
      - `apps/web/src/server/routes/audit.ts` exports a Fastify plugin that registers: `POST /api/audit` with rate limiting enabled (`{ config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }` and also enforce 30/hour per IP via a custom store), Request body schema: `{ type: 'object', properties: { url: { type: 'string' } }, oneOf: [{ required: ['url'] }], additionalProperties: false }`, Validation: if `url` is not a well-formed `http://` or `https://` URL, return `400 { "error": "INVALID_URL", "message": "URL must be a valid http or https URL" }`, SSRF pre-check: resolve DNS and check against blocked ranges per `.kiro/steering/security.md`; if blocked, return `403 { "error": "SSRF_BLOCKED", "message": "Cannot audit private or internal URLs" }`, If the queue is full (checked before creating the job), return `429 { "error": "QUEUE_FULL", "message": "Server is at capacity, please try again later" }`, If validation and SSRF checks pass: Create a job with `id: crypto.randomUUID()`, `url`, `status: 'queued'`, `stages: {}`, `createdAt: Date.now()`, `updatedAt: Date.now()`, Store the job: `jobStore.set(job)`, Return `202 { "id": job.id }` immediately, After the response is sent, call `queue.enqueue(job.id)`; if it throws `QueueFullError`, call `jobStore.delete(job.id)` (this is a race; return 429 before job creation when possible), `GET /api/audit/:id`: Read the job from the store, If not found, return `404 { "error": "NOT_FOUND" }`, If `status === 'queued'`, return `200 { "status": "queued" }`, If `status` is loading/tree/walking/classifying, return `200 { "status": status, "stages": job.stages }`, If `status === 'done'`, return `200 { "status": "done", "result": job.result, "stages": job.stages }`, If `status === 'error'`, return `200 { "status": "error", "error": job.error.code, "message": job.error.message }`, `GET /api/audit/:id/screenshot.png`: Read the job from the store, If not found or `status !== 'done'` or `!job.screenshotPng`, return `404`, Convert `job.screenshotPng` (base64 string) to a Buffer and return it with `Content-Type: image/png`
    - **Tests:** Vitest integration test that: Starts the server, Posts a Cursed Shop demo URL (e.g. `http://localhost:3000/cursed-shop/index.html` once the server is running), Polls `GET /api/audit/:id` every 500ms, Verifies that stages progress in order: `queued → loading → tree → walking → classifying → done`, Verifies that the final result is a `ClassifiedAudit` with `score > 0`, Calls `GET /api/audit/:id/screenshot.png` and verifies a PNG is returned
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm run test -w apps/web` passes; posting a demo URL and polling returns a done result within 20 seconds
  
  - [~] 1.5 Implement routing, app shell, and Landing view
    - _Requirements: Requirement 6 (Display Landing Page), Requirement 22 (Ensure App Self-Accessibility)_
    - _Design: Section "Routing and URL Structure", "Landing View", "Route Focus and Keyboard Navigation", decision F from prompt 38_
    - **Acceptance Criteria:**
      - `apps/web/src/client/main.tsx` renders: `<React.StrictMode><BrowserRouter><ReducedMotionProvider><SoundProvider><App /></SoundProvider></ReducedMotionProvider></BrowserRouter></React.StrictMode>`
      - `apps/web/src/client/App.tsx` renders: `<Routes><Route path="/" element={<LandingView />} /><Route path="/seance/:jobId" element={<SeanceView />} /><Route path="/audit/:jobId/*" element={<AuditResultView source="job" />} /><Route path="/sample/:sampleId/*" element={<AuditResultView source="sample" />} /><Route path="*" element={<NotFoundView />} /></Routes>`
      - `apps/web/src/client/contexts/ReducedMotionContext.tsx` exports `ReducedMotionProvider` and `useReducedMotion` hook: Reads `window.matchMedia('(prefers-reduced-motion: reduce)')` on mount, Listens for changes to the media query, Provides `{ reducedMotion: boolean }` via context
      - `apps/web/src/client/contexts/SoundContext.tsx` exports `SoundProvider` and `useSound` hook: Provides `{ soundEnabled: boolean, toggleSound: () => void }` via context, `soundEnabled` is in-memory only, starts as `false` (sound is off by default), `toggleSound` flips the boolean; no `localStorage`
      - `apps/web/src/client/hooks/useDocumentTitle.ts` exports `useDocumentTitle(title: string)`: Calls `document.title = title + ' – THE UNSEEN'` on mount and when `title` changes
      - `apps/web/src/client/hooks/useFocusMain.ts` exports `useFocusMain()`: Calls `document.getElementById('main')?.focus()` on mount
      - `apps/web/src/client/views/LandingView.tsx` renders: `useDocumentTitle('THE UNSEEN')`, `useFocusMain()`, Skip link: `<a href="#main" className="skip-link">Skip to main content</a>` (positioned absolutely, visually hidden by default, visible on `:focus`), Header: `<header><button aria-label="Toggle sound" onClick={toggleSound}>{soundEnabled ? '🔊' : '🔇'}</button><a href="#keyboard-help" aria-label="Keyboard help">⌨️</a></header>`, Main: `<main id="main" tabIndex={-1}><h1>THE UNSEEN</h1><form onSubmit={handleSubmit}><label htmlFor="url-input">Enter a URL to audit</label><input id="url-input" type="url" required /><button type="submit">Begin audit</button></form><h2>Try a sample</h2><div className="sample-cards">{samples.map(s => <SampleCard key={s.id} {...s} />)}</div></main>`, Footer: `<footer>© THE UNSEEN</footer>`, On form submit: Prevent default, POST to `/api/audit` with `{ url: inputValue }`, Read the job ID from the response, Navigate to `/seance/:jobId`, Sample cards are fetched from `GET /api/samples` on mount, Each `SampleCard` is a `<button>` with `onClick={() => navigate(\`/sample/\${id}\`)}`, displaying the sample name and thumbnail, The skip link CSS: `.skip-link { position: absolute; top: -40px; left: 0; background: var(--color-ecto); color: var(--color-ink); padding: 8px; z-index: 1000; } .skip-link:focus { top: 0; }`
      - `apps/web/src/client/views/NotFoundView.tsx` renders: `useDocumentTitle('Page not found')`, `useFocusMain()`, `<main id="main" tabIndex={-1}><h1>Page not found</h1><p>The page you're looking for doesn't exist.</p><a href="/">Return to home</a></main>`
      - `apps/web/src/client/components/KeyboardHelpDialog.tsx` renders a modal dialog with `role="dialog"`, `aria-modal="true"`, and a focus trap: Opened via the "Keyboard help" button in the header (using URL hash `#keyboard-help` or React state), Lists keyboard shortcuts: Tab (next), Shift+Tab (previous), Enter/Space (activate), Escape (close dialog), Close button with `aria-label="Close keyboard help"`
    - **Tests:** Playwright e2e test that: Loads `/`, Verifies the h1 "THE UNSEEN", Tabs through the skip link, sound toggle, keyboard help button, URL input, submit button, and sample cards, Verifies that the skip link is visible when focused, Clicks a sample card, Verifies navigation to `/sample/cursed-shop-index`
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/` without error; clicking a sample card navigates to `/sample/:id`; the skip link is visible on focus
  
  - [~] 1.6 Implement Spirit Sight view with geometry, overlays, score, and fog toggle
    - _Requirements: Requirement 8 (Render Spirit Sight View with Screenshot and Overlay), Requirement 9 (Render All Ten Haunting Visual Treatments), Requirement 10 (Make Haunting Overlays Keyboard-Accessible), Requirement 11 (Display Haunting List Sidebar), Requirement 12 (Animate Spirit Sight Fog Toggle)_
    - _Design: Section "Spirit Sight View", "Haunting Visual Treatments (All 10 Types)", "Haunting Sidebar", decision B/D/J from prompt 38_
    - **Acceptance Criteria:**
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
      - When `prefers-reduced-motion` IS set, overlays appear instantly with no fog canvas (a CSS `filter` on the `<img>` is applied instantly instead)
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
    - **Tests:** Playwright e2e test that: Loads `/sample/cursed-shop-index`, Clicks "Open Spirit Sight", Waits for overlays to appear (wait for the SVG to have `display: block` and at least one `<button>` child), Tabs through overlay buttons, Verifies that each button has an accessible name matching the format, Clicks an overlay button, Verifies that the haunting detail dialog opens (detected by `role="dialog"` in the DOM)
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/sample/cursed-shop-index` without error; clicking "Open Spirit Sight" reveals overlays; tabbing through overlays works; clicking an overlay opens a dialog stub
  
  - [~] 1.7 Implement Daylight mode with WCAG report and export
    - _Requirements: Requirement 16 (Render Daylight Mode Report), Requirement 17 (Export Audit Results)_
    - _Design: Section "Daylight Mode", "Summary", "Coverage Note", "Findings by WCAG Criterion", "Needs Manual Check", decision on clean-site copy from prompt 38_
    - **Acceptance Criteria:**
      - The user navigates to `/audit/:id/daylight` or `/sample/:id/daylight` (via a "Daylight mode" button in the Spirit Sight view)
      - The view hides the screenshot overlay and displays a table-based WCAG report
      - The report groups findings by WCAG criterion (using `groupByWCAG(audit.hauntings)`)
      - Each criterion row displays: criterion number (e.g. "1.1.1"), name ("Non-text Content"), level (A/AA/AAA), affected element count, and severity (Wraith/Restless/Banished)
      - A "Needs manual check" section displays nodes from `audit.needsManualCheck` with the reason (e.g. "Contrast uncertain: image background")
      - A prominent note at the top of the report shows `audit.automatedCoverageNote` verbatim
      - The report provides two export buttons: "Export as Markdown" and "Export as JSON"
      - When "Export as Markdown" is clicked, generate a Markdown document containing the Haunting Score, hauntings grouped by WCAG criterion, and the coverage note, and trigger a file download with filename `unseen-audit-[domain]-[timestamp].md`
      - When "Export as JSON" is clicked, serialize the full `ClassifiedAudit` object as JSON and trigger a file download with filename `unseen-audit-[domain]-[timestamp].json`
      - The filename uses `new URL(audit.raw.auditedUrl).hostname` for the domain and `Date.now()` for the timestamp
      - When the audit has zero hauntings (score 0), the report displays: "No hauntings found by automated checks; a manual review is still needed."
    - **Tests:** Playwright e2e test that: Loads `/sample/cursed-shop-index/daylight`, Verifies the h1 "Daylight report: cursed-shop.the-unseen.app", Verifies that the first criterion row contains "1.1.1", Clicks "Export as Markdown", Verifies that a file download is triggered (by checking for a `download` attribute or a Blob URL), Downloads the file and verifies it contains the Haunting Score and criterion groups
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; `npm run dev -w apps/web` starts and loads `/sample/cursed-shop-index/daylight` without error; clicking "Export as Markdown" downloads a file; the file contains the Haunting Score and criterion groups
  
  - [~] 1.8 Self-audit test on Landing, Spirit Sight, and Daylight views
    - _Requirements: Requirement 22 (Ensure App Self-Accessibility)_
    - _Design: Section "Accessibility Self-Audit", decision F from prompt 38_
    - **Acceptance Criteria:**
      - `apps/web/e2e/self-audit.spec.ts` contains: Test "Landing view has zero hauntings": Runs `auditAndClassify('http://localhost:3000/', { allowPrivate: true })`, Asserts that the page loads without error (presence marker: h1 text "THE UNSEEN"), Asserts `result.hauntings.length === 0`, Asserts `result.axeCrossCheck.unmapped.length === 0`, If either assertion fails, log the full list of hauntings and unmapped violations; Test "Spirit Sight view (sample) has zero hauntings": Runs `auditAndClassify('http://localhost:3000/sample/cursed-shop-index', { allowPrivate: true })`, Asserts that the page loads without error (presence marker: h1 text "Spirit Sight: the-unseen.app"), Asserts `result.hauntings.length === 0`, Asserts `result.axeCrossCheck.unmapped.length === 0`; Test "Daylight view (sample) has zero hauntings": Runs `auditAndClassify('http://localhost:3000/sample/cursed-shop-index/daylight', { allowPrivate: true })`, Asserts that the page loads without error (presence marker: h1 text "Daylight report: the-unseen.app"), Asserts `result.hauntings.length === 0`, Asserts `result.axeCrossCheck.unmapped.length === 0`; Test "404 view has zero hauntings": Runs `auditAndClassify('http://localhost:3000/nonexistent', { allowPrivate: true })`, Asserts that the page loads without error (presence marker: h1 text "Page not found"), Asserts `result.hauntings.length === 0`, Asserts `result.axeCrossCheck.unmapped.length === 0`
    - **Tests:** `npm run e2e -w apps/web` runs the self-audit tests
    - **Checkpoint:** `npm run e2e -w apps/web` passes with zero hauntings on all four routes (Landing, Spirit Sight, Daylight, 404)

- [ ] 2. Phase 2: Séance, Whisper Walk, and Keyboard Walk
  - Phase 2 completes the three audit lenses: real-time progress (Séance), AX-tree speech (Whisper Walk), and Tab sequence animation (Keyboard Walk).
  
  - [~] 2.1 Implement Séance view with real stage polling
    - _Requirements: Requirement 7 (Display Séance Loading Stage)_
    - _Design: Section "Routing and URL Structure" and "SeanceView"_
    - **Acceptance Criteria:**
      - `apps/web/src/client/views/SeanceView.tsx` reads the job ID from route params and polls `GET /api/audit/:id` every 500ms while status is queued/loading/tree/walking/classifying
      - The view displays the current stage name in human-readable form: "Loading page…", "Reading accessibility tree…", "Walking the keyboard path…", "Classifying hauntings…"
      - Each new stage is announced to screen readers via an `aria-live="polite"` region
      - The polite live region is rendered empty on mount, before the first poll, and only its text content changes (no DOM node replacement)
      - The view displays the elapsed time for each completed stage (e.g. "Loading page… 1.2s")
      - When status becomes `"done"`, polling stops immediately and the view auto-navigates to `/audit/:id` (the base route, which is Spirit Sight by default)
      - When status becomes `"error"`, polling stops immediately, the error message is displayed in an `aria-live="assertive"` region, and a "Try another URL" button is provided that navigates back to `/`
      - On arrival at Spirit Sight from Séance, focus moves to the h1, and a persistent app-level polite region announces "Audit complete: {n} hauntings found, Haunting Score {score}"
    - **Tests:** Playwright e2e test that: Posts a demo URL, Navigates to `/seance/:id`, Waits for the Séance view to display "Loading page…", Waits for auto-navigation to `/audit/:id`, Verifies that the Spirit Sight view is rendered
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; posting a demo URL and navigating to `/seance/:id` shows real stage updates and auto-navigates to Spirit Sight when done
  
  - [~] 2.2 Implement Whisper Walk with Web Speech and synchronized highlighting
    - _Requirements: Requirement 13 (Implement Whisper Walk with Web Speech)_
    - _Design: Section "WhisperWalk"_
    - **Acceptance Criteria:**
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
    - **Tests:** Playwright e2e test that: Loads `/sample/cursed-shop-index/whisper`, Clicks Play, Waits for the first utterance to complete, Verifies that the caption updates, Clicks Pause, Clicks Step forward, Verifies that the caption advances
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; loading `/sample/cursed-shop-index/whisper` and clicking Play speaks the first utterance and highlights the corresponding element
  
  - [~] 2.3 Implement Keyboard Walk with ghost animation and Lost Soul reveals
    - _Requirements: Requirement 14 (Animate Keyboard Walk)_
    - _Design: Section "KeyboardWalk"_
    - **Acceptance Criteria:**
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
    - **Tests:** Playwright e2e test that: Loads `/sample/cursed-shop-index/keyboard`, Clicks Play, Waits for the ghost to move through the first 5 steps, Clicks Pause, Clicks Step back, Verifies that the ghost moves backward
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; loading `/sample/cursed-shop-index/keyboard` and clicking Play animates the ghost through the Tab sequence

- [ ] 3. Phase 3: Haunting Detail, Takes Form, Ambient Drone, and Product States
  - Phase 3 adds the haunting detail dialog, the "takes form" celebration animation, the optional ambient drone, all product states, and the final self-audit proof.
  
  - [~] 3.1 Implement Haunting Detail Dialog
    - _Requirements: Requirement 15 (Display Haunting Detail Dialog)_
    - _Design: Section "Haunting Detail Dialog"_
    - **Acceptance Criteria:**
      - When an overlay button is clicked, open a modal dialog with `role="dialog"` and `aria-modal="true"`
      - The dialog has an h2 with the haunting display name (e.g. "Nameless Spirit")
      - The dialog displays the haunting severity badge (Wraith/Restless/Banished with appropriate color)
      - The dialog displays the WCAG criteria (primary first, then supporting) with links to Understanding pages
      - The dialog displays the fix instruction text from `haunting.fix.instruction`
      - The dialog displays the code snippet from `haunting.fix.codeSnippet` in a `<pre><code>` block
      - If the haunting has secondary hauntings, display them in a "Related issues" section
      - The dialog has a close button with `aria-label="Close dialog"`
      - The dialog implements a focus trap using `focus-trap-react` or equivalent
      - Pressing Escape closes the dialog and returns focus to the trigger button
      - Clicking the close button closes the dialog and returns focus to the trigger button
      - The dialog is rendered in a React portal at the document body level
    - **Tests:** Playwright e2e test that: Loads `/sample/cursed-shop-index`, Clicks "Open Spirit Sight", Clicks an overlay button (the first Nameless Spirit), Verifies that the dialog opens (detected by `role="dialog"`), Verifies that the h2 contains "Nameless Spirit", Presses Escape, Verifies that the dialog closes and focus returns to the overlay button
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; clicking an overlay button opens the dialog; pressing Escape closes it and returns focus
  
  - [~] 3.2 Implement "Takes Form" celebration animation
    - _Requirements: Requirement 18 (Animate "Takes Form" on Fix)_
    - _Design: Section "Product States > Fixed Haunting"_
    - **Acceptance Criteria:**
      - When a haunting is fixed (simulated by clicking a "Fix" button in the haunting detail dialog, which removes the haunting from the list and decrements the score), trigger a "Takes form" animation on the overlay element
      - When `prefers-reduced-motion` is NOT set, the animation uses 600ms `cubic-bezier(0.34, 1.56, 0.64, 1)` easing (a bounce)
      - When `prefers-reduced-motion` IS set, the animation is a simple opacity fade (100ms)
      - The overlay element fades out and is removed from the DOM after the animation completes
    - **Tests:** Manual test (no automated test for now): Load a sample with hauntings, Manually edit the sample JSON to remove one haunting, Re-audit, Verify that the fixed haunting animates from red to green
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; the "takes form" animation is implemented and can be triggered by editing a sample
  
  - [~] 3.3 Implement optional ambient drone (Web Audio)
    - _Requirements: Requirement 19 (Play Ambient Drone)_
    - _Design: Section "Product States > Ambient Drone"_
    - **Acceptance Criteria:**
      - When sound is enabled by user gesture (the sound toggle button in the app header) AND `prefers-reduced-motion` is NOT set, start an ambient drone using Web Audio API (a low-frequency oscillator with reverb)
      - The drone volume is low enough to not interfere with Web Speech (≤20% of the master volume)
      - When `prefers-reduced-motion` IS set, do not start the drone even if sound is enabled
      - When sound is disabled, stop the drone immediately
      - The drone loops continuously until stopped
    - **Tests:** Manual test (no automated test for Web Audio): Enable sound, Open Spirit Sight, Verify that a low drone is audible (use headphones), Disable sound, Verify that the drone stops
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; the ambient drone plays when sound is enabled and Spirit Sight is open
  
  - [~] 3.4 Implement all product states
    - _Requirements: Requirement 20 (Handle All Product States)_
    - _Design: Section "Product States"_
    - **Acceptance Criteria:**
      - A `NotFoundView` component is rendered for unmatched routes, displaying h1 "Page not found" and a link back to `/`
      - When `GET /api/audit/:id` returns 404 (job expired or never existed), the `AuditResultView` displays a 404 state with h1 "Audit not found" and a link back to `/`
      - When `GET /api/samples/:id` returns 404 (sample doesn't exist), the `AuditResultView` displays a 404 state with h1 "Sample not found" and a link back to `/`
      - When an audit completes with zero hauntings (score 0), the Spirit Sight view displays: "No hauntings found by automated checks; a manual review is still needed."
      - When an audit errors (status `"error"` from `GET /api/audit/:id`), the Séance view displays the error message in an `aria-live="assertive"` region and provides a "Try another URL" button
    - **Tests:** Playwright e2e tests for each state (already covered in previous tasks)
    - **Checkpoint:** `npm run typecheck -w apps/web` passes; all product states are implemented and testable
  
  - [~] 3.5 Final self-audit on all routes
    - _Requirements: Requirement 22 (Ensure App Self-Accessibility)_
    - _Design: Section "Accessibility Self-Audit", decision F from prompt 38_
    - **Acceptance Criteria:**
      - Extend `apps/web/e2e/self-audit.spec.ts` to cover all routes: Landing view: `/`, Spirit Sight view: `/sample/cursed-shop-index`, Whisper Walk view: `/sample/cursed-shop-index/whisper`, Keyboard Walk view: `/sample/cursed-shop-index/keyboard`, Daylight view: `/sample/cursed-shop-index/daylight`, 404 view: `/nonexistent`
      - Each test: Runs `auditAndClassify(url, { allowPrivate: true })`, Asserts that the page loads without error (presence marker: check for the h1 text), Asserts `result.hauntings.length === 0`, Asserts `result.axeCrossCheck.unmapped.length === 0`, If either assertion fails, log the full list of hauntings and unmapped violations
    - **Tests:** `npm run e2e -w apps/web` passes with zero hauntings on all routes
    - **Checkpoint:** `npm run e2e -w apps/web` passes with zero hauntings on all six routes

## Notes

**Completed tasks** from previous sessions:
- None (this is the first implementation run)

**Drift from requirements**:
- None yet

**Drift from design**:
- Task 1.0 (scaffold): `apps/web/tsconfig.server.json` adds `"rootDir": "src/server"` so `tsc -p tsconfig.server.json` emits `dist/server/main.js` (not `dist/server/src/server/main.js`), which the `start` script and the static-root path `../client` depend on. `tsconfig.client.json` `lib` adds `DOM.Iterable` alongside `ES2022` and `DOM`.
- Task 1.0 (scaffold): additional devDependencies not named in the task AC but required to typecheck and run the scaffold: `@types/node`, `@types/react`, `@types/react-dom`, `jsdom` (vitest `environment: "jsdom"`), `pino-pretty` (dev logger transport in the design's `createServer`).
- Task 1.0 (scaffold): version choices follow the design's stack (React 18, Vite 5, `@vitejs/plugin-react` 4) rather than the newest majors, and `vitest` is `^2.1.4` to match `packages/core`. `@playwright/test` is pinned to exact `1.65.1` to match `packages/core` and the Docker tag (requirement 24.2).
- Task 1.0 (scaffold): `vitest.config.ts` adds `environmentMatchGlobs: [['src/server/**', 'node']]` so server tests run in Node while client tests use jsdom. `playwright.config.ts` also sets `testMatch`, `timeout: 240000`, `workers: 1`, `channel` (`UNSEEN_CHROMIUM_CHANNEL ?? 'chromium'`), `reuseExistingServer` and `webServer.timeout: 120000` per requirement 28.
- Task 1.0 (scaffold): `tsconfig.json` overrides the base `module`/`moduleResolution` (`NodeNext`) with `ESNext`/`bundler` as specified. Server source must therefore write relative imports with explicit `.js` extensions (as in the design snippets) so the emitted ESM runs under Node.
- Task 1.0 (scaffold): minimal stubs `src/client/main.tsx` (renders an `h1` in `main#main`) and `src/server/main.ts` (`export {}`) were added so both tsconfigs have inputs; tasks 1.3 and 1.5 replace them. Empty directories are kept with `.gitkeep` files (`src/client/{components,views,hooks,contexts}`, `src/server/{routes,jobs}`, `e2e`, `scripts`, `samples`).

- Task 1.0a (core speech track): `buildSpeechTrack` and `announce`/`announceNote` live together in `packages/core/src/classifier/speech.ts` (the task says `announce` already exists there). Like the design's code sample, `buildSpeechTrack` leaves out AX nodes whose `announce()` text is empty (generic, none, presentation), in addition to ignored nodes; the AC wording ("for each node where `ignored !== true`") would otherwise emit blank utterances. `note` is omitted from the line (not set to `undefined`) when `announceNote` returns nothing. Boxes are looked up through a `Map` keyed by `backendDOMNodeId` (first box wins, same as `find`); `box` is `null` when none is recorded.
- Task 1.0a (existing test updated): `packages/core/src/index.test.ts` already existed and pins the exact public export list (finding 42). `buildSpeechTrack` was added to that list, and a second test imports `buildSpeechTrack` and `SpeechLine` by name. The task text says the file "exists with a test", so no new file was created.
- Task 1.0a (design sample mismatch): the design's `WhisperWalk` code reads `speechTrack` from `buildSpeechTrack(audit.raw)` on the client, while task 1.2 also stores `speechTrack` in each sample JSON. Both are served by the same core function, so they agree.

**Blocked tasks**:
- None

**Dependencies**:
- Task 1.0a depends on the haunting-classifier spec being complete (`announce` and `announceNote` already exist)
- Task 1.1 depends on Task 1.0a (but can be done in parallel)
- Task 1.2 depends on Task 1.0a and 1.1 (needs `buildSpeechTrack` and `onProgress`)
- All other Phase 1 tasks depend on Task 1.0 (scaffold)
- Phase 2 depends on Phase 1 being complete
- Phase 3 depends on Phase 2 being complete
