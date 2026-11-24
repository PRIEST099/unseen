Amend the **`spirit-sight-ui`** spec (`.kiro/specs/spirit-sight-ui/requirements.md`, `design.md`, `tasks.md`) before the build. An independent review confirmed **52 findings, 15 of them blockers**; the evidence and fixes are in **`docs/brief/review-notes/spirit-sight-ui-spec-review-1.md`**. The reviewers overlap, so the decisions below are deduplicated. Apply them, then walk all 52 items and resolve each one.

**Read the real types first.** The classifier is now built: `packages/core/src/classifier/types.ts` (`ClassifiedAudit`, `Haunting`) and `packages/core/src/index.ts` (the public exports). The spec must use **only fields that exist** (findings 16 and 42). Import only from `@the-unseen/core`'s public entry.

Spec files only. You may also amend `.kiro/specs/audit-engine/` where decision E touches it.

## Decisions
**A. The signature moment (findings 1 and 40).**
- Spirit Sight opens on the clean screenshot ("mortal eyes") with the overlays hidden. One primary button, "Open Spirit Sight" (`aria-pressed`), whose state lives in `SpiritSightView`.
- On activation, `<canvas id="spirit-sight">` over the screenshot `<img>` only draws a value-noise fog tinted from `--color-mist`. A feathered band sweeps top to bottom over 800 ms, and each haunting overlay fades in (400 ms) as the wave passes its `box.y`.
- At the end, a polite status line reads "Spirit Sight open: N hauntings, score S". If sound is on, the first Wraith's whisper plays; the click is the user gesture.
- **Reduced motion:** no canvas, a CSS filter on the `<img>`, and every overlay at once.
- **Acceptance test:** overlays are absent before activation and present after it.

**B. Geometry (findings 2, 14 and 41).** The screenshot's intrinsic size is the PNG's natural size (from `<img>` load, or a pure `pngSize(base64)` helper), never `viewportWidth`/`Height`. Fit to **width**: `scale = min(1, containerWidth / pngWidth)`. The stage scrolls vertically. Update Property 1, and add a fast-check property for boxes below the first viewport.

**C. Rate limiting (findings 3, 9 and 30).** `@fastify/rate-limit` uses `global: false`. The 5/min and 30/h limits apply **only to `POST /api/audit`**. Polling, samples, static files and health are not limited by the audit quota. Integration test: 20 polls in 10 s after one POST all return 200.

**D. Samples are the guaranteed demo path (findings 4, 15, 44 and 45).**
- `apps/web/scripts/build-samples.mjs` serves the Cursed Shop locally and runs `auditAndClassify` with the permissive policy (dev script only). It also covers 2–3 public URLs from `samples.config.json`, and writes `samples/<id>.json` plus a 400 px thumbnail.
- `GET /api/samples` returns metadata only. `GET /api/samples/:id` returns the audit. The screenshot is served separately as `GET /api/{audit|samples}/:id/screenshot.png`, so JSON payloads stay small.
- Add the SPA route `/sample/:id`.
- Task 3 runs the script before any UI task.

**E. Progress (findings 5 and 8).** Add `onProgress?: (stage: 'loading'|'tree'|'walking'|'classifying', atMs: number) => void` to `AuditOptions`, emitted by the runner and the classifier. This is a small additive task in **this** spec, touching `packages/core`, with a test. Record the deviation in the audit-engine spec Notes.

**F. Every view has a URL, and the self-audit covers all of them (findings 6, 7, 12, 19, 29 and 35).**
- **Routes:** `/`, `/seance/:jobId`, `/audit/:id` and `/sample/:id` (Spirit Sight), `.../keyboard`, `.../whisper`, `.../daylight`, plus a 404 view.
- **Self-audit:** it runs against the **production build served by the Fastify server**, on every route with a sample loaded. Before asserting zero hauntings, it asserts the view actually rendered (overlays present, h1 text). Each view has exactly one h1, a `main` landmark, a skip link and `lang="en"`.
- **Test separation:** Vitest `include` covers `src/**` only, and Playwright e2e lives in `apps/web/e2e/`.

**G. The server must actually run (findings 10, 11 and 28).** Build `src/server` with `tsc` to `dist/server`, using a real `listen()` entry point (`dist/server/main.js`). Remove the Dockerfile from this spec, because run 16 (deploy) owns it; note that its base image must be `mcr.microsoft.com/playwright:v1.65.1-noble`.

**H. The live Cursed Shop on the hosted box (findings 13 and 24).** The Fastify server also serves `apps/cursed-shop` statically at `/cursed-shop/`. On the hosted box, the demo audits `https://<host>/cursed-shop/`, a public URL, so the restrictive SSRF guard allows it.
- Locally and in e2e only, `UNSEEN_DEV_ALLOW_PRIVATE=1` selects the permissive policy. **The server refuses to start with that flag when `NODE_ENV=production`.** Never accept a policy from the client.

**I. The Whisper walk (findings 17, 18, 39 and 43).** It reads the **whole page in accessibility-tree order**: speech for every node via the classifier's `announce()`, with haunted nodes using their haunting speech and highlighted.
- One "Hear what they hear" button starts it; the click is the user gesture. A visible caption mirrors every utterance.
- With sound off it advances captions on a timer, with step, back and pause controls. **No `alert()`.**

**J. Overlays (findings 20, 21, 22, 31, 32, 33, 37 and 48).**
- **No real text over the screenshot:** the visual treatments are `aria-hidden` SVG shapes, and the names live on the buttons.
- **Buttons:** they receive pointer events. They are sorted in reading order (`box.y`, then `box.x`). Their accessible name reads "<Haunting name>: <element name or role>, <severity>", for example "Nameless Spirit: Add to cart button, Wraith".
- **Focus ring:** a dual-tone ring (ink outer, ecto inner), visible on any background.
- **Treatments:** give each of the 10 hauntings a concrete treatment, taken from its "Visual" in `hauntings.md` and brief §4.

**K. The keyboard walk (findings 23, 38 and 46).** Lost Souls (from the hauntings) are shown as souls behind glass, which the ghost visibly skips. An escapable cycle circles once, then breaks free. A true Cursed Loop circles with the ember ring until the user stops it. **Reduced motion:** manual step mode, never a 0 ms timer.

**L. Keyboard and route focus (findings 34, 36, 50 and 51).** No single-character shortcuts: replace `?` with a visible "Keyboard help" button. On every route change, move focus to the h1 and announce the view. Each button's visible text is contained in its accessible name.

**M. Daylight (finding 47).** Every haunting is listed under **each** of its `wcag[]` criteria. Include the needs-manual-check list and the honest coverage note. Export to Markdown and JSON.

**N. Product states and the plan (findings 25, 26, 27, 49 and 52).**
- **States:** a clean site ("No hauntings found by automated checks; a manual review is still needed"), an audit error, a blocked URL, and timeouts.
- **Phase 1 vertical slice (tasks 1–N):** samples → Spirit Sight with overlays, score and the fog toggle → Daylight with export. It must work end to end on the Cursed Shop sample.
- **Phase 2:** the walks. **Phase 3:** polish (the takes-form animation and the optional ambient drone each get a task) and edge cases.
- Fix the job-lifecycle timestamp issue.

## Done means
The three files are consistent with these decisions and with the real core types. Final message: a table of items 1–52 → "fixed in <file §section>", or "not a defect, because …". If you near a limit, stop after a completed item and name the next one. Do not ask questions.
