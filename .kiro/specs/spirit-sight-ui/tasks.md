# Implementation Plan: Spirit Sight UI

## Overview

This plan implements a production-ready web application combining a React + Vite SPA with a Fastify API server in a single Docker image. The implementation is ordered for maximum demo impact: vertical slice first (working end-to-end on Cursed Shop sample), then polish, then edge cases.

**Strategy**: Get one complete flow working fast (sample → Spirit Sight → self-audit proof), then layer on polish that judges will see.

## Tasks

### Phase 1: Vertical Slice (Priority: MUST for demo)

- [ ] 1. Set up apps/web workspace structure
  - Create directory structure: `apps/web/src/{client,server}`, `apps/web/public`, `apps/web/tests`
  - Configure `apps/web/package.json` with dependencies: React 18, Vite 5, Fastify, Playwright, @the-unseen/core
  - Configure `apps/web/tsconfig.json` extending `tsconfig.base.json` with client and server paths
  - Configure `apps/web/vite.config.ts` with React plugin, dev server port 5173, and build output to `dist/client`
  - Configure `apps/web/vitest.config.ts` with jsdom environment and React Testing Library
  - _Requirements: 1.1, 1.3, 20.1, 20.2, 24.2_

- [ ] 2. Create Fastify server factory and health endpoint
  - [ ] 2.1 Implement server factory in `apps/web/src/server/server.ts`
    - Export `createServer(options?: ServerOptions)` function returning FastifyInstance
    - Register `@fastify/helmet` with strict CSP (allow self, Vite inline script hashes, no external domains)
    - Register health route at `GET /health` returning `{ status: "ok" }`
    - In production mode, register `@fastify/static` serving from `dist/client` with SPA fallback
    - Configure logger: pretty-print in dev, structured JSON in production
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 25.3, 25.4, 25.5_
  
  - [ ] 2.2 Add server startup script
    - Create `apps/web/src/server/index.ts` that calls `createServer()` and listens on PORT
    - Read PORT from `process.env.PORT` (default 3000)
    - Bind to `0.0.0.0` for Docker compatibility
    - _Requirements: 1.5, 25.1_

- [ ] 3. Implement pre-audited samples endpoint
  - [ ] 3.1 Create sample JSON files
    - Create `apps/web/src/server/samples/cursed-shop-index.json` with pre-audited Cursed Shop home page
    - Create `apps/web/src/server/samples/cursed-shop-product.json` with pre-audited product page
    - Create `apps/web/src/server/samples/cursed-shop-checkout.json` with pre-audited checkout page
    - Each JSON file contains: `{ id, name, url, result: ClassifiedAudit }`
    - _Requirements: 5.3_
  
  - [ ] 3.2 Implement samples route handler
    - Create `apps/web/src/server/routes/samples.ts`
    - Load all JSON files from `samples/` directory at server startup
    - Export `samplesRoutes` Fastify plugin
    - Implement `GET /api/samples` returning array of Sample objects
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [ ] 4. Create React app shell with routing and contexts
  - [ ] 4.1 Set up design tokens
    - Create `apps/web/src/client/styles/tokens.css` with CSS custom properties from `.kiro/steering/design-system.md`
    - Create `apps/web/src/client/tokens.ts` exporting TypeScript constants mirroring CSS tokens
    - Install `@fontsource/atkinson-hyperlegible` and `@fontsource/cormorant-garamond`
    - Create `apps/web/src/client/styles/global.css` with reset and base styles
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.6_
  
  - [ ] 4.2 Implement React contexts
    - Create `apps/web/src/client/contexts/ReducedMotionContext.tsx` reading `prefers-reduced-motion` media query
    - Create `apps/web/src/client/contexts/SoundContext.tsx` with localStorage-persisted sound toggle
    - Export `useReducedMotion()` and `useSound()` hooks
    - _Requirements: 18.1, 18.2, 19.1, 19.2_
  
  - [ ] 4.3 Set up routing
    - Create `apps/web/src/client/App.tsx` with react-router-dom
    - Define routes: `/` (Landing), `/seance/:id` (Séance), `/spirit-sight/:id` (Spirit Sight)
    - Wrap in ReducedMotionProvider and SoundProvider
    - Create `apps/web/src/client/main.tsx` mounting React app
    - Import fonts and global styles in main.tsx
    - _Requirements: 20.3_

- [ ] 5. Build Landing view with sample cards
  - [ ] 5.1 Create Landing view component
    - Create `apps/web/src/client/views/LandingView.tsx`
    - Render hero section with tagline "Which site do you dare to see through their eyes?"
    - Render `<h1>THE UNSEEN</h1>`
    - Create form with labeled URL input and submit button
    - On submit, POST to `/api/audit` and navigate to `/seance/:id`
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7_
  
  - [ ] 5.2 Create sample card component
    - Create `apps/web/src/client/components/SampleCard.tsx`
    - Fetch samples from `/api/samples` on mount
    - Render cards showing sample name and Haunting Score badge
    - On click, navigate to `/spirit-sight/:id` with cached result
    - Use `<button>` elements with accessible names "Load sample: [name]"
    - _Requirements: 6.4, 6.5_
  
  - [ ]* 5.3 Add Landing accessibility verification
    - Verify one `<h1>` element
    - Verify form label with `htmlFor` matching input id
    - Verify visible focus indicators using `--color-ecto`
    - Verify text contrast ≥4.5:1 on all elements
    - _Requirements: 6.6, 6.7, 6.8_

- [ ] 6. Implement audit job queue and worker
  - [ ] 6.1 Create job store
    - Create `apps/web/src/server/jobs/store.ts`
    - Implement `JobStore` class with in-memory Map
    - Implement methods: `set`, `get`, `update`, `delete`
    - Implement TTL cleanup running every 5 minutes (1-hour TTL)
    - _Requirements: 3.8_
  
  - [ ] 6.2 Create job queue
    - Create `apps/web/src/server/jobs/queue.ts`
    - Implement `JobQueue` class with FIFO queue and concurrency limit
    - Read `UNSEEN_MAX_CONCURRENCY` from env (default 2)
    - Implement `enqueue(jobId)` throwing QueueFullError when depth exceeds 20
    - _Requirements: 2.9, 2.10, 25.2_
  
  - [ ] 6.3 Implement audit worker
    - Create `apps/web/src/server/jobs/worker.ts`
    - Implement `executeJob(jobId)` calling `auditUrl` from `@the-unseen/core`
    - Pass `RestrictiveSafeFetchPolicy`, 60s timeout, and `onProgress` callback
    - On progress callback, update job status and stages timestamps
    - Call `classify(rawAudit)` to produce ClassifiedAudit
    - On completion, mark job as done with result
    - On error, map to user-safe error messages per design.md
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 7. Create audit API endpoints
  - [ ] 7.1 Implement POST /api/audit endpoint
    - Create `apps/web/src/server/routes/audit.ts`
    - Validate URL format (http/https, well-formed)
    - Perform SSRF pre-check (resolve DNS, check blocked ranges)
    - Return 400 for invalid URLs, 403 for SSRF blocks
    - Create job with `crypto.randomUUID()`, enqueue, return 202 with job ID
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [ ] 7.2 Implement GET /api/audit/:id endpoint
    - Return 404 if job not found
    - Return status: queued, loading/tree/walking/classifying with stages, done with result, or error with message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 8. Create Séance loading view with polling
  - Create `apps/web/src/client/views/SeanceView.tsx`
  - Implement polling loop fetching `/api/audit/:id` every 500ms
  - Display current stage name ("Loading page…", "Reading accessibility tree…", etc.)
  - Display elapsed time for each completed stage
  - Announce stage changes via `aria-live="polite"`
  - On status=done, navigate to `/spirit-sight/:id`
  - On status=error, display error in `aria-live="assertive"` with retry button
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 9. Build Spirit Sight view with screenshot and overlay
  - [ ] 9.1 Implement scale computation hook
    - Create `apps/web/src/client/utils/scale.ts` with pure `computeScale` function
    - Create `apps/web/src/client/hooks/useScale.ts` hook wrapping ResizeObserver
    - Compute scale factor as min(containerW/screenshotW, containerH/screenshotH)
    - Return ScaleState with screenshotWidth, screenshotHeight, containerWidth, containerHeight, scaleFactor, scaledWidth, scaledHeight
    - _Requirements: 8.3, 8.4_
  
  - [ ] 9.2 Create Spirit Sight view shell
    - Create `apps/web/src/client/views/SpiritSightView.tsx`
    - Fetch audit result from `/api/audit/:id`
    - Render screenshot as `<img>` with base64 PNG from `audit.screenshotPng`
    - Render SVG overlay layer with same scaledWidth and scaledHeight
    - Use `useScale` hook to compute positioning on resize
    - _Requirements: 8.1, 8.2, 8.5, 8.6_
  
  - [ ]* 9.3 Test scale computation properties
    - **Property 1: Scale is deterministic** — same inputs produce same output
    - **Property 2: Scale is bounded** — scaleFactor in [0, 1] when container ≤ screenshot
    - **Property 3: Aspect ratio preserved** — scaledWidth/scaledHeight = screenshotWidth/screenshotHeight
    - Use fast-check arbitraries for screenshot and container dimensions
    - _Validates: Requirements 8.3, 8.4_

- [ ] 10. Checkpoint - Vertical slice complete
  - Ensure all tests pass
  - Verify: can load sample → Spirit Sight displays screenshot
  - Ask user if questions arise

### Phase 2: Haunting Rendering and Interactivity

- [ ] 11. Render basic haunting overlays (Nameless Spirit, Hollow Portrait, The Fog)
  - [ ] 11.1 Create HauntingOverlay component
    - Create `apps/web/src/client/components/HauntingOverlay.tsx`
    - Accept props: `haunting: Haunting`, `onClick: () => void`
    - Position using SVG foreignObject with bounding box coordinates
    - Render focusable `<button>` with accessible name "[Type]: [role] at [location], [severity]"
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 11.2 Implement visual treatments for Nameless Spirit, Hollow Portrait, The Fog
    - **Nameless Spirit**: translucent ghost gradient with faded role text
    - **Hollow Portrait**: dashed border with two hollow eye circles
    - **The Fog**: fog pattern rect with opacity based on contrast deficit
    - Implement `computeFogDensity(contrastRatio, isLargeText)` in `apps/web/src/client/utils/fog.ts`
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ]* 11.3 Test fog density computation
    - **Property 4: Fog density is bounded** — output in [0, 0.8]
    - **Property 5: Fog density monotonic in deficit** — density increases as contrast decreases
    - Use fast-check to generate contrast ratios
    - _Validates: Requirements 9.3_

- [ ] 12. Render remaining haunting overlays (Lost Soul, Cursed Loop, Invisible Wanderer, Whispering Field, The Veiled)
  - **Lost Soul**: frosted glass gradient with X-mark lines
  - **Cursed Loop**: glowing red ellipse with pulsing/glowing animation class
  - **Invisible Wanderer**: ghost footprint path icons
  - **Whispering Field**: dashed border rect with wavy mouth path
  - **The Veiled**: thick fog pattern with darken blend mode (distinct from contrast fog)
  - Respect `prefers-reduced-motion` for Cursed Loop animation (replace with static ring)
  - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.10, 18.3_

- [ ] 13. Render page-level hauntings (Silent Tongue, Shattered Order)
  - **Silent Tongue**: page-level banner text at top of SVG overlay
  - **Shattered Order**: render in sidebar outline panel (not in SVG overlay)
  - _Requirements: 9.8, 9.9_

- [ ] 14. Build haunting sidebar with grouping and score
  - [ ] 14.1 Implement haunting grouping logic
    - Create `apps/web/src/client/utils/hauntings.ts` with `groupHauntings(hauntings)` function
    - Group by type, count instances, determine most severe in group
    - Return HauntingGroup[] with type, count, severity, instances, expanded state
    - _Requirements: 11.1, 11.2_
  
  - [ ] 14.2 Create HauntingSidebar component
    - Create `apps/web/src/client/components/HauntingSidebar.tsx`
    - Display Haunting Score at top with progress bar
    - Render collapsible groups for each haunting type
    - Use severity colors: Wraith=ember, Restless=candle, Banished=mist
    - On group header click, toggle expand/collapse
    - On instance click, call `onHauntingClick(haunting)` callback
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 15. Create haunting detail dialog with focus trap
  - Create `apps/web/src/client/components/HauntingDetailDialog.tsx`
  - Use `focus-trap-react` library for focus management
  - Set `role="dialog"` and `aria-modal="true"`
  - Display: haunting type, severity badge, persona line, WCAG criterion with link, HTML snippet, fix suggestion
  - Provide "Copy as Kiro prompt" button using `generateKiroPrompt` utility
  - Close on Escape key, close button click, or outside click
  - Return focus to trigger element on close
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

- [ ] 16. Implement Whisper Walk with Web Speech
  - [ ] 16.1 Create Web Speech hook
    - Create `apps/web/src/client/hooks/useWebSpeech.ts`
    - Accept props: utterances array, pitch, rate, voice
    - Manage playback state, currentIndex, play/pause/stepNext/stepPrev controls
    - Use Web Speech Synthesis API with utterance callbacks
    - Return: currentIndex, playbackState, control functions
    - _Requirements: 13.1_
  
  - [ ] 16.2 Create WhisperWalk component
    - Create `apps/web/src/client/components/WhisperWalk.tsx`
    - Build utterances array from `audit.hauntings[].speech`
    - Set whisper effect: pitch=0.8, rate=0.85
    - Render play/pause/step controls with accessible labels
    - Render speed select (0.5x, 0.75x, 1x, 1.25x, 1.5x)
    - Render voice select populated from `speechSynthesis.getVoices()`
    - Display live caption synchronized with current utterance
    - Highlight corresponding element on screenshot during playback
    - Require sound enabled; show alert if disabled
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

- [ ] 17. Implement Keyboard Walk with ghost animation
  - [ ] 17.1 Create KeyboardWalk component
    - Create `apps/web/src/client/components/KeyboardWalk.tsx`
    - Render SVG ghost icon positioned using transform
    - Implement `animateStep(index)` walking through `audit.tabWalkResult.steps`
    - Use 300ms ease-in-out transitions unless `prefers-reduced-motion` is set
    - Provide play button and speed select
    - _Requirements: 14.1, 14.2, 14.7_
  
  - [ ] 17.2 Add Lost Soul and Cursed Loop rendering
    - Detect Lost Soul elements (in hauntings but not in Tab walk)
    - Show frosted glass effect when ghost walks past Lost Soul
    - Detect Cursed Loop elements (cycle in Tab walk)
    - For inescapable traps: ghost circles indefinitely with glowing ember ring
    - For escapable traps: ghost circles twice then breaks free
    - _Requirements: 14.4, 14.5, 14.6_

- [ ] 18. Build Daylight mode WCAG report
  - [ ] 18.1 Implement WCAG grouping
    - Create `groupByWCAG(hauntings)` in `apps/web/src/client/utils/hauntings.ts`
    - Group by primary WCAG criterion ID
    - Return: criterionId, title, level, url, count, severity
    - _Requirements: 16.3, 16.4_
  
  - [ ] 18.2 Create DaylightReport component
    - Create `apps/web/src/client/components/DaylightReport.tsx`
    - Render table with columns: WCAG Criterion, Level, Affected Elements, Severity
    - Render "needs manual check" section for uncertain findings
    - Display coverage disclaimer prominently: "Automated checks find 30-40% of issues..."
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [ ] 18.3 Add Daylight mode toggle to Spirit Sight view
    - Add toggle button in header
    - Default to Daylight mode when `prefers-reduced-motion` is set
    - Switch between Spirit Sight canvas and Daylight report
    - _Requirements: 16.1, 16.7, 16.8, 18.5_

- [ ] 19. Checkpoint - Core interactions complete
  - Verify: can click haunting overlays → dialog opens
  - Verify: Whisper Walk plays utterances with caption
  - Verify: Keyboard Walk animates ghost through Tab sequence
  - Verify: Daylight mode displays WCAG table

### Phase 3: Polish and Accessibility

- [ ] 20. Implement Spirit Sight fog toggle animation
  - Create `apps/web/src/client/components/FogToggle.tsx`
  - Implement fog wave animation dissolving top-to-bottom over 800ms
  - Use CSS clip-path animation or canvas rendering
  - Apply animation only to screenshot layer, never app UI
  - Disable animation when `prefers-reduced-motion` is set
  - Use `aria-pressed` for toggle button state
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 18.3_

- [ ] 21. Add sound controls and header UI
  - Create sound toggle button in app header with mute/unmute icon
  - Use `aria-label="Toggle sound"`
  - Persist sound preference in SoundContext (localStorage)
  - Ensure sound is off by default
  - Disable ambient drone when `prefers-reduced-motion` is set
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 22. Implement export functionality
  - [ ] 22.1 Create export utility functions
    - Create `apps/web/src/client/utils/export.ts`
    - Implement `generateMarkdownReport(audit)` producing formatted markdown
    - Implement `generateJSONReport(audit)` serializing ClassifiedAudit
    - Implement `generateFilename(audit, ext)` sanitizing domain and timestamp
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_
  
  - [ ] 22.2 Add export buttons to Daylight report
    - Add "Export as Markdown" and "Export as JSON" buttons
    - Trigger file downloads using Blob and URL.createObjectURL
    - _Requirements: 17.1, 17.4_
  
  - [ ]* 22.3 Test filename sanitization
    - **Property 6: Filenames are valid** — contain only alphanumeric, hyphens, periods
    - **Property 7: Filenames have correct extension** — .md or .json
    - Use fast-check to generate arbitrary URLs and timestamps
    - _Validates: Requirements 17.3, 17.6_

- [ ] 23. Add keyboard shortcuts dialog
  - Create `apps/web/src/client/components/KeyboardShortcutsDialog.tsx`
  - Provide button in header to open shortcuts dialog
  - Display table: Key, Action
  - List shortcuts: Tab, Enter/Space, Escape, ?
  - Use `?` key to open dialog (register global keydown handler)
  - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

- [ ] 24. Add rate limiting to API
  - Register `@fastify/rate-limit` plugin
  - Configure: 5 requests/minute per IP, 30 requests/hour per IP
  - Return 429 with `retryAfter` header when exceeded
  - Only enable in production mode
  - _Requirements: 2.7, 2.8_

- [ ] 25. Implement comprehensive error handling
  - Create `apps/web/src/server/middleware/error-handler.ts`
  - Map error types to user-safe messages per design.md
  - Display errors in UI with appropriate severity (toast, dialog, or inline)
  - Log detailed errors server-side only
  - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_

- [ ] 26. Write design token contrast tests
  - Create `apps/web/tests/contrast.test.ts`
  - Import COLORS from `tokens.ts` and `computeContrastRatio` from `@the-unseen/core`
  - Test: bone-on-ink ≥7:1, ecto-on-ink ≥7:1, ember-on-ink ≥4.5:1, candle-on-ink ≥4.5:1, mist-on-ink ≥4.5:1
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [ ] 27. Ensure app-wide accessibility compliance
  - [ ] 27.1 Audit all views for WCAG 2.2 AA
    - Verify exactly one `<h1>` per page
    - Verify correct heading hierarchy (no skipped levels)
    - Verify all interactive elements keyboard-accessible
    - Verify visible focus indicators (--color-ecto outline ≥2px with ≥3:1 contrast)
    - Verify all inputs have labels
    - Verify all images have alt text (use alt="" for decorative)
    - Verify semantic HTML usage (button, a, nav, main, etc.)
    - _Requirements: 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9_
  
  - [ ] 27.2 Add aria-live regions for dynamic content
    - Séance progress announcements
    - Error messages
    - Toast notifications
    - _Requirements: 22.10_

- [ ] 28. Write self-audit Playwright test (CRITICAL for demo)
  - Create `apps/web/tests/self-audit.spec.ts`
  - Start dev server on localhost:3000
  - Call `auditUrl('http://localhost:3000')` with `allowPrivate: true`
  - Call `classify(rawAudit)`
  - Assert: `classified.hauntings.length === 0` and `classified.score === 0`
  - If test fails, log all hauntings found with type, explanation, and HTML snippet
  - _Requirements: 22.1, 22.2, 28.4_

### Phase 4: Deployment and Testing

- [ ] 29. Create Dockerfile
  - Base on `mcr.microsoft.com/playwright:v1.40.0-focal`
  - Install Node.js 22 if not present
  - Copy workspace root package files and run `npm ci`
  - Build `@the-unseen/core` package
  - Build React SPA in `apps/web`
  - Set environment variables: NODE_ENV=production, PORT=3000, UNSEEN_MAX_CONCURRENCY=2
  - Add health check using `/health` endpoint
  - Expose port and run Fastify server
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8_

- [ ] 30. Write component unit tests
  - Test scale computation with different viewport sizes
  - Test haunting grouping logic (count, severity, expand state)
  - Test WCAG grouping logic (sort by criterion ID)
  - Test Whisper Walk state management (play/pause/step)
  - Test reduced motion context (media query listener)
  - _Requirements: 27.1, 27.2, 27.3_

- [ ] 31. Write end-to-end Playwright tests
  - Create `apps/web/tests/e2e/full-flow.spec.ts`
  - Test complete flow: paste Cursed Shop URL → séance → Spirit Sight → haunting click → dialog → Whisper Walk → Keyboard Walk → Daylight → export MD/JSON
  - Verify sample cards load and navigate correctly
  - Verify error handling for invalid URLs and SSRF blocks
  - _Requirements: 28.1, 28.2, 28.3, 28.5_

- [ ] 32. Final checkpoint - Demo readiness check
  - Verify vertical slice works end-to-end on Cursed Shop
  - Verify self-audit test passes (zero hauntings proof)
  - Verify all 10 haunting visual treatments render correctly
  - Verify Whisper Walk and Keyboard Walk function
  - Verify Daylight mode and export work
  - Verify Docker image builds and runs

## Notes

- **Demo Priority**: The vertical slice (tasks 1-10) is MUST-HAVE. Everything else is HIGH or LOWER priority.
- **Parallel Work**: Tasks within phases 1, 2, and 3 can often run in parallel (e.g., API and React infrastructure are independent).
- **Testing Strategy**: Property tests only for pure functions (scale, fog density, filename sanitization). Component tests for React behavior. E2E tests for full flows.
- **Self-Audit Test**: Task 28 is the proof that the app itself is accessible. This is a powerful demo moment.
- **Optional Tasks**: Test-related sub-tasks (marked with `*`) can be skipped for faster MVP, but property tests add rigor.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "4.1"] },
    { "id": 2, "tasks": ["3.2", "4.2", "4.3"] },
    { "id": 3, "tasks": ["5.1", "5.2", "6.1"] },
    { "id": 4, "tasks": ["5.3", "6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3"] },
    { "id": 9, "tasks": ["10"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3"] },
    { "id": 12, "tasks": ["12", "13", "14.1"] },
    { "id": 13, "tasks": ["14.2", "15"] },
    { "id": 14, "tasks": ["16.1", "17.1", "18.1"] },
    { "id": 15, "tasks": ["16.2", "17.2", "18.2"] },
    { "id": 16, "tasks": ["18.3", "19"] },
    { "id": 17, "tasks": ["20", "21", "22.1"] },
    { "id": 18, "tasks": ["22.2", "22.3", "23", "24"] },
    { "id": 19, "tasks": ["25", "26", "27.1"] },
    { "id": 20, "tasks": ["27.2", "28"] },
    { "id": 21, "tasks": ["29", "30"] },
    { "id": 22, "tasks": ["31"] },
    { "id": 23, "tasks": ["32"] }
  ]
}
```
