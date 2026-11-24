# Requirements Document

## Introduction

Spirit Sight UI is the complete web application (`apps/web`) that makes accessibility issues visible and audible. It combines a React + Vite SPA with a Fastify API server in one Docker image. Users paste a URL and see their site through the eyes of assistive technology users: fog covers low-contrast text, nameless buttons become faceless spirits, and keyboard traps appear as cursed loops. The app itself must be WCAG 2.2 AA compliant and serves as its own accessibility proof.

## Glossary

- **Spirit_Sight**: The primary view overlaying haunting visualizations on a screenshot
- **Séance**: The loading stage displaying real audit progress (loading → tree → walking → classifying)
- **Whisper_Walk**: An audio experience reading the page using Web Speech with synchronized highlighting
- **Keyboard_Walk**: An animated ghost following the Tab key sequence
- **Daylight_Mode**: A calm, high-contrast, motion-free WCAG report view
- **Haunting_Overlay**: SVG/canvas elements positioned over screenshot elements showing hauntings
- **Audit_Job**: An async audit task with status tracking (queued → loading → done/error)
- **Sample**: A pre-audited site (Cursed Shop or public example) with cached results
- **Takes_Form**: The celebration animation when a haunting is fixed
- **Reduced_Motion_Context**: React context reading `prefers-reduced-motion` to disable animations
- **Spirit_Sight_Canvas**: The WebGL/canvas layer for fog effects (screenshot only, never app UI)

## Requirements

### Requirement 1: Serve the Spirit Sight UI Application

**User Story:** As a user, I want to access a web application, so that I can audit any public URL for accessibility issues.

#### Acceptance Criteria

1. THE Fastify_Server SHALL serve the compiled React SPA from `dist/client/` at the root path `/`
2. THE Fastify_Server SHALL apply `@fastify/helmet` with strict CSP (no inline scripts except Vite-generated hashes, no external domains except self)
3. THE Fastify_Server SHALL serve `@fontsource/atkinson-hyperlegible` and `@fontsource/cormorant-garamond` font files from local npm packages (no Google Fonts CDN)
4. THE Fastify_Server SHALL respond to `GET /health` with `200 { "status": "ok" }`
5. THE Fastify_Server SHALL bind to `0.0.0.0:PORT` where PORT is `process.env.PORT` (default 3000)

### Requirement 2: Accept Audit Requests

**User Story:** As a user, I want to submit a URL for auditing, so that I can see its accessibility hauntings.

#### Acceptance Criteria

1. THE Audit_API SHALL accept `POST /api/audit` with JSON body `{ "url": string }`
2. WHEN a request is received, THE Audit_API SHALL validate that `url` is a well-formed `http://` or `https://` URL
3. WHEN the URL is invalid, THE Audit_API SHALL return `400 { "error": "INVALID_URL", "message": "URL must be a valid http or https URL" }`
4. WHEN a valid URL is received, THE Audit_API SHALL perform an SSRF pre-check by resolving DNS and checking against blocked ranges per `.kiro/steering/security.md`
5. WHEN the SSRF pre-check fails, THE Audit_API SHALL return `403 { "error": "SSRF_BLOCKED", "message": "Cannot audit private or internal URLs" }`
6. WHEN the SSRF pre-check passes, THE Audit_API SHALL create an audit job with a unique ID and return `202 { "id": string }` immediately
7. THE Audit_API SHALL enforce rate limiting: 5 requests per minute per IP, 30 requests per hour per IP, using `@fastify/rate-limit`
8. WHEN rate limits are exceeded, THE Audit_API SHALL return `429 { "error": "RATE_LIMIT", "message": "Too many requests", "retryAfter": number }`
9. WHEN the global concurrent audit limit (from `UNSEEN_MAX_CONCURRENCY` env var, default 2) is reached, THE Audit_API SHALL queue the job up to a depth of 20
10. WHEN the queue is full, THE Audit_API SHALL return `503 { "error": "QUEUE_FULL", "message": "Server is at capacity, please try again later" }`

### Requirement 3: Execute Audits with Progress Tracking

**User Story:** As a user, I want to see real-time audit progress, so that I know the system is working.

#### Acceptance Criteria

1. THE Audit_Worker SHALL call `auditUrl(url, options)` from `@the-unseen/core` with `RestrictiveSafeFetchPolicy` and a 60-second timeout
2. THE Audit_Worker SHALL pass an `onProgress` callback to `auditUrl` that receives stage updates: `"loading"`, `"tree"`, `"walking"`, `"classifying"`
3. WHEN `onProgress` is called, THE Audit_Worker SHALL update the job status and record the timestamp for each stage
4. THE Audit_Worker SHALL call `classify(rawAudit)` from `@the-unseen/core` to produce a `ClassifiedAudit`
5. WHEN classification completes, THE Audit_Worker SHALL mark the job as `"done"` and store the `ClassifiedAudit` result
6. WHEN any error occurs (timeout, SSRF block, resource limit, network error), THE Audit_Worker SHALL mark the job as `"error"` and store an error code and user-safe message
7. THE Audit_Worker SHALL NOT include resolved IPs, internal stack traces, or raw URLs in error messages returned to clients
8. THE Audit_Worker SHALL remove completed jobs after 1 hour (TTL)

### Requirement 4: Return Audit Status and Results

**User Story:** As a user, I want to poll for audit results, so that I can display them when ready.

#### Acceptance Criteria

1. THE Audit_API SHALL accept `GET /api/audit/:id`
2. WHEN the job ID does not exist, THE Audit_API SHALL return `404 { "error": "NOT_FOUND" }`
3. WHEN the job is queued, THE Audit_API SHALL return `200 { "status": "queued" }`
4. WHEN the job is in progress, THE Audit_API SHALL return `200 { "status": "loading" | "tree" | "walking" | "classifying", "stages": { "loading": timestamp?, "tree": timestamp?, ... } }`
5. WHEN the job is done, THE Audit_API SHALL return `200 { "status": "done", "result": ClassifiedAudit, "stages": { ... } }`
6. WHEN the job errored, THE Audit_API SHALL return `200 { "status": "error", "error": string, "message": string }`

### Requirement 5: Provide Pre-Audited Samples

**User Story:** As a user, I want to load pre-audited examples instantly, so that I can explore the tool without waiting.

#### Acceptance Criteria

1. THE Audit_API SHALL accept `GET /api/samples`
2. THE Audit_API SHALL return an array of samples: `[{ "id": string, "name": string, "url": string, "result": ClassifiedAudit }]`
3. THE Samples SHALL include all three Cursed Shop pages: `index.html`, `product.html`, `checkout.html`
4. THE Samples MAY include 2-3 pre-audited public sites
5. THE Sample results SHALL be generated offline (not at request time) and committed as JSON files in `apps/web/src/server/samples/`

### Requirement 6: Display Landing Page

**User Story:** As a user, I want a welcoming landing page, so that I understand what the tool does and can start an audit.

#### Acceptance Criteria

1. THE Landing_View SHALL display a hero section with the tagline "Which site do you dare to see through their eyes?"
2. THE Landing_View SHALL provide one labeled text input for entering a URL with an accessible label "Enter a URL to audit"
3. THE Landing_View SHALL provide a submit button with the accessible name "Begin audit"
4. THE Landing_View SHALL display sample cards below the input, each showing the sample name and thumbnail
5. WHEN a sample card is clicked, THE Landing_View SHALL navigate directly to the Spirit Sight view with that sample's pre-loaded result
6. THE Landing_View SHALL have exactly one `<h1>` element with the site title "THE UNSEEN"
7. THE Landing_View SHALL use `--color-ink` background, `--color-bone` text, and `--color-ecto` for focus indicators per `.kiro/steering/design-system.md`
8. THE Landing_View SHALL meet WCAG 2.2 AA: all interactive elements keyboard-accessible, all text ≥4.5:1 contrast, visible focus indicators

### Requirement 7: Display Séance Loading Stage

**User Story:** As a user, I want to see real audit progress, so that I know the system is working and not frozen.

#### Acceptance Criteria

1. THE Séance_View SHALL poll `GET /api/audit/:id` every 500ms while status is `"queued"`, `"loading"`, `"tree"`, `"walking"`, or `"classifying"`
2. THE Séance_View SHALL display the current stage name in human-readable form: "Loading page…", "Reading accessibility tree…", "Walking the keyboard path…", "Classifying hauntings…"
3. THE Séance_View SHALL announce each new stage to screen readers via an `aria-live="polite"` region
4. THE Séance_View SHALL display the elapsed time for each completed stage
5. WHEN status becomes `"done"`, THE Séance_View SHALL transition to the Spirit Sight view
6. WHEN status becomes `"error"`, THE Séance_View SHALL display the error message in an `aria-live="assertive"` region and provide a "Try another URL" button

### Requirement 8: Render Spirit Sight View with Screenshot and Overlay

**User Story:** As a user, I want to see hauntings overlaid on the actual page screenshot, so that I can understand exactly where each issue is located.

#### Acceptance Criteria

1. THE Spirit_Sight_View SHALL display the base64 PNG screenshot from `ClassifiedAudit.screenshotPng` in an `<img>` element with `alt="Audited page screenshot"`
2. THE Spirit_Sight_View SHALL render an SVG overlay layer with the same pixel dimensions as the screenshot
3. THE Spirit_Sight_View SHALL scale both the screenshot and overlay together to fit the viewport while maintaining aspect ratio
4. WHEN the viewport is resized, THE Spirit_Sight_View SHALL recompute the scale factor and reposition all overlay elements
5. THE Spirit_Sight_View SHALL render one overlay element per haunting instance positioned using the haunting's bounding box
6. THE Overlay elements SHALL never drift from their screenshot positions (both are scaled by the same factor from the same render)

### Requirement 9: Render All Ten Haunting Visual Treatments

**User Story:** As a user, I want each haunting type to have a distinct visual treatment, so that I can identify issues at a glance.

#### Acceptance Criteria

1. WHEN a Nameless Spirit haunting is present, THE Spirit_Sight_View SHALL render the element as a faceless translucent ghost with faded label text
2. WHEN a Hollow Portrait haunting is present, THE Spirit_Sight_View SHALL render the image as hollow-eyed and desaturated
3. WHEN a Fog haunting is present, THE Spirit_Sight_View SHALL render a fog overlay on the text element with density proportional to the contrast deficit
4. WHEN a Lost Soul haunting is present, THE Spirit_Sight_View SHALL render a soul trapped behind glass
5. WHEN a Cursed Loop haunting is present, THE Spirit_Sight_View SHALL render a glowing red cursed circle (using `--color-ember`) around the trapped region
6. WHEN an Invisible Wanderer haunting is present, THE Spirit_Sight_View SHALL render ghost footsteps with no accompanying light
7. WHEN a Whispering Field haunting is present, THE Spirit_Sight_View SHALL render a form field with a ghostly mouth and no words
8. WHEN a Silent Tongue haunting is present, THE Spirit_Sight_View SHALL display a page-level banner stating "The spirits speak a garbled tongue"
9. WHEN a Shattered Order haunting is present, THE Spirit_Sight_View SHALL display broken gravestone headings in an outline panel
10. WHEN a Veiled haunting is present, THE Spirit_Sight_View SHALL render the element dissolving into thick impenetrable fog (distinct from contrast fog)

### Requirement 10: Make Haunting Overlays Keyboard-Accessible

**User Story:** As a keyboard user, I want to navigate hauntings with the keyboard, so that I can explore the audit without a mouse.

#### Acceptance Criteria

1. THE Overlay elements SHALL be focusable via Tab key
2. THE Overlay elements SHALL have accessible names in the format: `"[Haunting Type]: [role or element] at [location or name], [severity]"` (e.g. "Nameless Spirit: button at Add to cart, Wraith")
3. THE Overlay elements SHALL use `<button>` elements semantically
4. WHEN an overlay element is clicked or activated with Enter/Space, THE Spirit_Sight_View SHALL open the haunting detail dialog for that haunting
5. THE Overlay elements SHALL have visible focus indicators using `--color-ecto` with ≥3:1 contrast

### Requirement 11: Display Haunting List Sidebar

**User Story:** As a user, I want a sidebar listing all hauntings, so that I can see counts, severity, and the Haunting Score.

#### Acceptance Criteria

1. THE Spirit_Sight_View SHALL display a sidebar with hauntings grouped by type (10 groups, one per haunting type)
2. THE Sidebar SHALL show the count of instances for each haunting type
3. THE Sidebar SHALL display the Haunting Score (0-100) prominently at the top
4. THE Sidebar SHALL use severity colors: `--color-ember` for Wraith, `--color-candle` for Restless, `--color-mist` for Banished
5. WHEN a haunting type group is clicked, THE Sidebar SHALL expand/collapse the instance list for that type
6. WHEN a specific haunting instance is clicked, THE Spirit_Sight_View SHALL open the haunting detail dialog for that instance

### Requirement 12: Animate Spirit Sight Fog Toggle

**User Story:** As a user, I want a dramatic reveal when enabling Spirit Sight, so that the experience is engaging and memorable.

#### Acceptance Criteria

1. THE Spirit_Sight_View SHALL provide a toggle button with accessible name "Toggle Spirit Sight"
2. WHEN the toggle is activated AND `prefers-reduced-motion` is NOT set, THE Spirit_Sight_View SHALL animate a fog wave dissolving from top to bottom over the screenshot over 800ms with `ease-in-out` easing
3. WHEN the toggle is activated AND `prefers-reduced-motion` IS set, THE Spirit_Sight_View SHALL apply the fog instantly with no animation
4. THE Fog wave animation SHALL apply ONLY to the screenshot canvas layer, never to the app's own UI text or controls
5. THE Toggle button SHALL use `aria-pressed` to announce its state

### Requirement 13: Implement Whisper Walk with Web Speech

**User Story:** As a user, I want to hear what a screen reader would announce, so that I understand the assistive technology experience.

#### Acceptance Criteria

1. THE Whisper_Walk_View SHALL use the Web Speech Synthesis API to read speech announcements from `ClassifiedAudit.hauntings[].speech`
2. THE Whisper_Walk SHALL set `pitch <= 0.8` and `rate <= 0.85` to produce a whisper effect
3. THE Whisper_Walk SHALL provide play, pause, and step (next/previous) controls
4. THE Whisper_Walk SHALL provide a speed control (0.5x, 0.75x, 1x, 1.25x, 1.5x)
5. THE Whisper_Walk SHALL provide a voice selection dropdown populated from `window.speechSynthesis.getVoices()`
6. WHEN an utterance is spoken, THE Whisper_Walk SHALL highlight the corresponding element on the screenshot
7. THE Whisper_Walk SHALL display a live caption synchronized with utterances
8. THE Whisper_Walk SHALL NOT start automatically; sound shall remain off until the user clicks play
9. THE Whisper_Walk controls SHALL all have accessible labels

### Requirement 14: Animate Keyboard Walk

**User Story:** As a user, I want to see the Tab key path, so that I understand keyboard navigation order and traps.

#### Acceptance Criteria

1. THE Keyboard_Walk_View SHALL display an animated ghost following the Tab sequence from `ClassifiedAudit.tabWalkResult.steps`
2. WHEN `prefers-reduced-motion` is NOT set, THE Ghost SHALL transition between focus positions with 300ms `ease-in-out` easing
3. WHEN `prefers-reduced-motion` IS set, THE Ghost SHALL jump instantly to each position with no transition
4. WHEN the walk encounters a Lost Soul (element with click handler not in Tab sequence), THE Ghost SHALL walk past it, and the Lost Soul SHALL appear behind glass
5. WHEN the walk encounters a Cursed Loop (inescapable keyboard trap), THE Ghost SHALL circle the trapped region repeatedly, and a glowing ember ring SHALL appear
6. WHEN the walk encounters an escapable cycle, THE Ghost SHALL briefly circle then break free
7. THE Keyboard_Walk SHALL provide play, pause, and speed controls

### Requirement 15: Display Haunting Detail Dialog

**User Story:** As a user, I want detailed information about each haunting, so that I understand the issue and how to fix it.

#### Acceptance Criteria

1. WHEN a haunting overlay or sidebar item is activated, THE Spirit_Sight_View SHALL open a modal dialog with `role="dialog"` and `aria-modal="true"`
2. THE Dialog SHALL display the haunting type name and severity
3. THE Dialog SHALL display a persona line explaining who is affected (e.g. "A blind shopper using NVDA hears only 'button'")
4. THE Dialog SHALL display the WCAG criterion number and name with a link to the official WCAG documentation
5. THE Dialog SHALL display the offending HTML snippet from `haunting.htmlSnippet`
6. THE Dialog SHALL display a suggested fix snippet from `haunting.fixSuggestion`
7. THE Dialog SHALL provide a "Copy as Kiro prompt" button that copies a formatted fix request to the clipboard
8. THE Dialog SHALL trap focus while open using a focus trap library
9. WHEN the dialog is closed, THE Dialog SHALL return focus to the trigger element
10. THE Dialog SHALL be closable via Escape key, close button, or clicking outside

### Requirement 16: Render Daylight Mode Report

**User Story:** As a user who prefers reduced motion or wants to export results, I want a calm WCAG report view, so that I can review findings without animation.

#### Acceptance Criteria

1. THE Spirit_Sight_View SHALL provide a "Daylight mode" toggle
2. WHEN Daylight mode is enabled, THE Spirit_Sight_View SHALL hide the screenshot overlay and display a table-based WCAG report
3. THE Daylight_Report SHALL group findings by WCAG criterion
4. THE Daylight_Report SHALL display the criterion number, name, level (A/AA/AAA), affected element count, and severity
5. THE Daylight_Report SHALL display a "needs manual check" section for findings with uncertain automated detection (e.g. contrast with image backgrounds)
6. THE Daylight_Report SHALL display a prominent note: "Automated checks find approximately 30-40% of WCAG issues. Manual testing is required for full compliance. This tool never claims a site is 'compliant'."
7. THE Daylight_Report SHALL provide export buttons for Markdown and JSON formats
8. WHEN `prefers-reduced-motion` is set, THE Spirit_Sight_View SHALL default to Daylight mode on load

### Requirement 17: Export Audit Results

**User Story:** As a developer, I want to export audit results, so that I can share them with my team or save them for later.

#### Acceptance Criteria

1. THE Daylight_Report SHALL provide an "Export as Markdown" button
2. WHEN the Markdown export button is clicked, THE Daylight_Report SHALL generate a Markdown document containing the Haunting Score, hauntings grouped by WCAG criterion, and the coverage disclaimer
3. THE Daylight_Report SHALL trigger a file download with filename `unseen-audit-[domain]-[timestamp].md`
4. THE Daylight_Report SHALL provide an "Export as JSON" button
5. WHEN the JSON export button is clicked, THE Daylight_Report SHALL serialize the full `ClassifiedAudit` object as JSON
6. THE Daylight_Report SHALL trigger a file download with filename `unseen-audit-[domain]-[timestamp].json`

### Requirement 18: Respect Reduced Motion Preference

**User Story:** As a user with vestibular disorders, I want all animations disabled when I set `prefers-reduced-motion`, so that the app is comfortable to use.

#### Acceptance Criteria

1. THE App SHALL detect `prefers-reduced-motion: reduce` via `window.matchMedia('(prefers-reduced-motion: reduce)')`
2. THE App SHALL provide a React context `ReducedMotionContext` exposing a boolean `reducedMotion`
3. WHEN `reducedMotion` is true, THE App SHALL disable: Spirit Sight fog wave animation, ghost drift, "takes form" animation, Tab ghost transitions, WebGL fog shader
4. WHEN `reducedMotion` is true, THE App SHALL replace animations with instant transitions or static equivalents
5. WHEN `reducedMotion` is true, THE App SHALL default to Daylight mode on the Spirit Sight view
6. WHEN `reducedMotion` is true, THE App SHALL NOT start the ambient drone even if sound is enabled

### Requirement 19: Provide Sound Controls

**User Story:** As a user, I want control over sound, so that I can enable audio features without unexpected autoplay.

#### Acceptance Criteria

1. THE App SHALL keep all sound (Web Speech, ambient drone, chimes) off by default
2. THE App SHALL provide a sound toggle button in the app header with `aria-label="Toggle sound"`
3. THE Sound toggle SHALL use an icon that reflects current state (muted/unmuted)
4. WHEN sound is enabled by user gesture, THE App SHALL allow Web Speech utterances in the Whisper Walk
5. THE App SHALL NOT start the ambient drone when `prefers-reduced-motion` is set, even if sound is enabled
6. THE Whisper Walk controls SHALL be keyboard-accessible and announce their current state

### Requirement 20: Apply Design System Tokens

**User Story:** As a developer, I want consistent design tokens, so that the UI matches the specified aesthetic.

#### Acceptance Criteria

1. THE App SHALL define CSS custom properties for all tokens in `.kiro/steering/design-system.md` on the `:root` element
2. THE App SHALL export TypeScript constants in `apps/web/src/client/tokens.ts` mirroring the CSS custom properties
3. THE App SHALL use `@fontsource/atkinson-hyperlegible` for all UI text, body, labels, inputs, and buttons
4. THE App SHALL use `@fontsource/cormorant-garamond` only for display headings (`<h1>`, hero text)
5. THE App SHALL NOT hardcode hex color values in components; all colors SHALL reference CSS custom properties
6. THE App SHALL enforce a minimum text size of 1rem (16px) and never use text below 0.75rem (12px)

### Requirement 21: Test Design Token Contrast

**User Story:** As a user with low vision, I want sufficient contrast between text and backgrounds, so that I can read all content.

#### Acceptance Criteria

1. THE App SHALL include a Vitest test that computes the contrast ratio for each token pair in `.kiro/steering/design-system.md`
2. THE Test SHALL use the WCAG 2.x relative luminance formula
3. THE Test SHALL fail if any text-on-background pair falls below its required ratio (4.5:1 for normal text, 3:1 for large text)
4. THE Test SHALL verify: `--color-bone` on `--color-ink` ≥7:1, `--color-ecto` on `--color-ink` ≥7:1, `--color-ember` on `--color-ink` ≥4.5:1, `--color-candle` on `--color-ink` ≥4.5:1, `--color-mist` on `--color-ink` ≥4.5:1

### Requirement 22: Ensure App Self-Accessibility

**User Story:** As a keyboard or screen-reader user, I want the app itself to be accessible, so that I can audit other sites without barriers.

#### Acceptance Criteria

1. THE App SHALL pass its own audit when `auditUrl('http://localhost:PORT')` is run with `@the-unseen/core`
2. THE App SHALL report zero hauntings on the Landing, Spirit Sight, and Daylight views
3. THE App SHALL have exactly one `<h1>` per page
4. THE App SHALL use correct heading hierarchy with no skipped levels
5. THE App SHALL provide visible focus indicators with `--color-ecto` outline ≥2px with ≥3:1 contrast
6. THE App SHALL ensure all interactive elements are keyboard-accessible with no keyboard traps
7. THE App SHALL label all form inputs with `<label>` elements or `aria-label`
8. THE App SHALL provide alt text for all images (use `alt=""` for decorative images)
9. THE App SHALL use semantic HTML (`<button>`, `<a href>`, `<nav>`, `<main>`, `<header>`, `<footer>`) instead of `<div>` with click handlers
10. THE App SHALL announce dynamic content updates via `aria-live` regions

### Requirement 23: Implement Modal Dialog Accessibility

**User Story:** As a keyboard user, I want modal dialogs to trap focus and be escapable, so that I can interact with them fully.

#### Acceptance Criteria

1. THE Haunting detail dialog SHALL use `role="dialog"` and `aria-modal="true"`
2. THE Dialog SHALL trap focus while open (focus cycles within the dialog, cannot Tab outside)
3. THE Dialog SHALL return focus to the trigger element when closed
4. THE Dialog SHALL be closable via Escape key
5. THE Dialog SHALL have a visible close button with accessible label "Close dialog"
6. THE Dialog SHALL announce its title to screen readers via `aria-labelledby`

### Requirement 24: Deploy as Docker Container

**User Story:** As a platform operator, I want a deployable Docker image, so that I can run the app on Fly.io, Render, or Railway.

#### Acceptance Criteria

1. THE Dockerfile SHALL be based on `mcr.microsoft.com/playwright` (official Playwright image with Chromium pre-installed)
2. THE Dockerfile SHALL install Node.js 22 dependencies via `npm ci` in the workspace root
3. THE Dockerfile SHALL build the React SPA via `npm run build` in `apps/web`
4. THE Dockerfile SHALL copy the built SPA from `apps/web/dist/client/` into the image
5. THE Dockerfile SHALL expose the port specified by the `PORT` environment variable (default 3000)
6. THE Dockerfile SHALL run the Fastify server as the CMD, binding to `0.0.0.0:$PORT`
7. THE Dockerfile SHALL set appropriate `NODE_ENV=production` and Playwright environment variables
8. THE Dockerfile SHALL be sized reasonably (target <2GB uncompressed)

### Requirement 25: Provide Environment Configuration

**User Story:** As a platform operator, I want environment-based configuration, so that I can tune rate limits and concurrency per deployment.

#### Acceptance Criteria

1. THE Fastify_Server SHALL read `PORT` from environment (default 3000)
2. THE Fastify_Server SHALL read `UNSEEN_MAX_CONCURRENCY` from environment (default 2, range 1-20)
3. THE Fastify_Server SHALL read `NODE_ENV` to distinguish production and development modes
4. THE Fastify_Server SHALL enable Vite dev proxy in development mode (Vite runs separately on port 5173, Fastify proxies `/api/*`)
5. THE Fastify_Server SHALL serve static built files in production mode

### Requirement 26: Handle Errors Gracefully

**User Story:** As a user, I want clear error messages, so that I understand what went wrong and can retry.

#### Acceptance Criteria

1. WHEN an audit times out, THE App SHALL display "The audit took too long (60s limit). The page may be too large or slow to load."
2. WHEN an SSRF block occurs, THE App SHALL display "Cannot audit private or internal URLs for security reasons."
3. WHEN a resource limit is exceeded, THE App SHALL display "The page is too large to audit (50MB limit)."
4. WHEN a network error occurs, THE App SHALL display "Could not load the page. Check the URL and try again."
5. WHEN rate limits are exceeded, THE App SHALL display "Too many requests. Please wait [X] seconds and try again."
6. WHEN the queue is full, THE App SHALL display "The server is at capacity. Please try again in a few minutes."
7. THE App SHALL log detailed errors (with stack traces and resolved IPs) server-side only, never to the client

### Requirement 27: Test UI Components with Vitest

**User Story:** As a developer, I want unit tests for UI components, so that I can refactor confidently.

#### Acceptance Criteria

1. THE App SHALL use Vitest + React Testing Library for component tests
2. THE Component tests SHALL verify: tokens render correctly, hauntings display with correct severity colors, Whisper Walk controls update state, Keyboard Walk respects reduced motion, Daylight mode renders all WCAG criteria
3. THE Component tests SHALL run via `npm test` in `apps/web`
4. THE Component tests SHALL use fast-check for pure UI helper functions (box scaling, overlay positioning)

### Requirement 28: Test End-to-End with Playwright

**User Story:** As a developer, I want end-to-end tests, so that I verify the complete user flow works.

#### Acceptance Criteria

1. THE App SHALL use Playwright Test for end-to-end tests
2. THE E2E tests SHALL start the Fastify server and audit a local Cursed Shop fixture
3. THE E2E tests SHALL verify: paste Cursed Shop URL → séance progress → Spirit Sight with haunting overlays → Whisper Walk plays → Keyboard Walk animates → Daylight mode displays WCAG table → export Markdown and JSON
4. THE E2E tests SHALL verify the app audits itself with zero hauntings (run `auditUrl('http://localhost:PORT')` and assert no hauntings)
5. THE E2E tests SHALL run via `npm run test:e2e` in `apps/web`

### Requirement 29: Optimize Performance

**User Story:** As a user, I want fast audit results, so that I can iterate quickly.

#### Acceptance Criteria

1. THE Audit_Worker SHALL complete a Cursed Shop audit in ≤20 seconds (from `POST /api/audit` to status `done`)
2. THE Audit_Worker SHALL return sample results instantly from cached JSON (no re-audit)
3. THE Spirit_Sight_View SHALL render the initial view (screenshot + overlays) in ≤2 seconds after receiving `ClassifiedAudit`
4. THE Fog wave animation SHALL run at ≥30fps (use `requestAnimationFrame` or CSS animations, not `setInterval`)
5. THE Overlay SVG SHALL use `transform` for positioning (GPU-accelerated) rather than re-rendering the entire SVG on scroll/zoom

### Requirement 30: Document Keyboard Shortcuts

**User Story:** As a keyboard user, I want documented shortcuts, so that I can navigate efficiently.

#### Acceptance Criteria

1. THE App SHALL provide a "Keyboard shortcuts" button accessible from the app header
2. THE Shortcuts dialog SHALL list all shortcuts in a table with columns: Key, Action
3. THE Shortcuts SHALL include: `Tab` (navigate), `Enter/Space` (activate), `Escape` (close dialog), `?` (open shortcuts dialog)
4. THE Shortcuts SHALL NOT hijack printable keys (letters, numbers) per WCAG 2.1.4 (Character Key Shortcuts)
5. THE Shortcuts dialog SHALL be keyboard-accessible and closable via Escape

