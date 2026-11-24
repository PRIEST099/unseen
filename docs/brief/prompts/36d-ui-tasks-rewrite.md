Part D of 4. **Context:** we are amending `.kiro/specs/spirit-sight-ui/` after a review: `docs/brief/review-notes/spirit-sight-ui-spec-review-1.md` (52 findings) and decisions A–N in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md`. `requirements.md` is already amended and is the source of truth for this part. The real core types are in `packages/core/src/classifier/types.ts` and `packages/core/src/types.ts`.

**Step 0:** set `"enabled": false` in `.kiro/hooks/spec-types-drift.json`. Its agent action interrupts headless spec edits. **Last step:** set it back to `true`.

**Rules:**
- Rewrite only the sections named below. **Replace** stale sections, do not append, and delete obsolete text, so that `design.md` gets shorter, not longer.
- Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`.
- Final message: the sections you rewrote, plus the grep results named below.

**Rewrite `tasks.md` completely** in the decided phase order. Every task references requirements and design sections and ends in passing tests.
- **Phase 1, the vertical slice:**
  1. The additive core `onProgress` task. Note it in `.kiro/specs/audit-engine/tasks.md` Notes.
  2. `build-samples.mjs` and the samples endpoints, including `screenshot.png`.
  3. The Fastify server (rate limit with `global: false` on POST only; `UNSEEN_DEV_ALLOW_PRIVATE` refused in production; static `/cursed-shop/`; the `dist/server/main.js` entry point).
  4. Routing and the app shell (h1, `main`, skip link).
  5. Spirit Sight with geometry, the overlays, the score and the fog toggle.
  6. Daylight with export.
  7. An e2e test of the whole slice on the Cursed Shop sample.
- **Phase 2:** the Séance with real stages, then the Whisper walk, then the Keyboard walk.
- **Phase 3:** polish (the takes-form animation, the optional ambient drone), product states and edge cases, then the self-audit test on every route.
- **No Dockerfile task.**
- **Checkpoints:** `npm run typecheck`, `npx vitest --run` and `npx playwright test` in `apps/web`, and the `packages/core` suite whenever core changes.

**Grep afterwards (tasks.md):** `global: false`, `UNSEEN_DEV_ALLOW_PRIVATE`, `build-samples`, `/sample/:id`, `onProgress` all present; no `Dockerfile` task.
