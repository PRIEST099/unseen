Continue the `spirit-sight-ui` amendment (prompt 29) where you stopped. Do not ask questions.

1. **Read `docs/brief/review-notes/spirit-sight-ui-spec-review-1.md` completely**, in chunks if you need to. Findings 45–52 exist; your previous read was truncated. Resolve them.
2. **Rewrite `design.md`** so it matches the amended `requirements.md` and decisions A–N. Rewrite whole sections, do not patch lines:
   - routing (every view has a URL, including `/sample/:id`)
   - the Spirit Sight signature moment (canvas `#spirit-sight`, the wave, overlays fading in)
   - geometry (`pngSize`, fit to width)
   - the overlay layer (aria-hidden shapes, named buttons in reading order, a dual-tone focus ring, a concrete visual treatment for each of the 10 hauntings, taken from `hauntings.md`)
   - Whisper walk (AX-tree order through core's `buildSpeechTrack`/`announce`, one Play gesture, captions, no `alert()`)
   - Keyboard walk (Lost Souls behind glass, escapable cycles breaking free, reduced-motion manual step mode)
   - server: rate limit on POST only (`global: false`); samples metadata, `:id` and `screenshot.png` endpoints; static `/cursed-shop/`; `UNSEEN_DEV_ALLOW_PRIVATE` refused in production; a `dist/server/main.js` entry point
   - `build-samples.mjs`
   - the self-audit against the production build on every route, with render-presence checks
   - no Dockerfile (deferred to run 16)
3. **Rewrite `tasks.md` in the decided phase order.**
   - Phase 1, the vertical slice: samples, then Spirit Sight with overlays, score and the fog toggle, then Daylight with export, end to end on the Cursed Shop sample.
   - Phase 2: the walks. Phase 3: polish (takes-form, ambient drone) and edge cases.
   - Every task references requirements, ends in passing tests, and uses the real commands: Vitest `src/**`, Playwright e2e in `apps/web/e2e/`.
   - Include the additive core task for `onProgress`, and note it in `.kiro/specs/audit-engine/tasks.md` Notes.
4. **Grep checks:** none of the following may remain, except in explicit "do not" lines: `viewportWidth` used for scaling, `alert(`, `spirit-sight-canvas`, a `'?'` shortcut, a Dockerfile task. And each of these must be present: `/sample/:id`, `build-samples`, `UNSEEN_DEV_ALLOW_PRIVATE`, `global: false`.

If you near a limit, stop after a completed section and write `Next: <section>`. Final message: the grep results and a table of findings 1–52 → where each is resolved.
