**Your deliverable is an edited `.kiro/specs/spirit-sight-ui/tasks.md`.** Do NOT create any report, summary or resolution-table file; a previous attempt did that instead of editing, and the product lead verifies with `git diff`. First read `docs/brief/prompts/38-ui-design-fresh-common.md` (decisions).

Rewrite `tasks.md` **completely, in place**, to match the current `design.md`. It has already been fixed; read its section headings first.

**Phase 1, the vertical slice**, in this order:
1. **Task 1.0: scaffold `apps/web`.** `package.json` with the `@the-unseen/core` workspace dependency and scripts (`dev`, `build`, `start`, `test`, `e2e`, `typecheck`, `build-samples`), `cross-env`, `tsconfig.client.json`/`tsconfig.server.json`, `vite.config.ts` with the `/api` proxy, `vitest.config.ts` (`src/**`), and `playwright.config.ts` (`e2e/`).
2. **Task 1.0a: core `buildSpeechTrack(raw): SpeechLine[]`** in `packages/core/src/classifier/speech.ts`. Export it by name from `src/index.ts`, with a unit test and an `index.test.ts` export update.
3. **Task 1.1: core `onProgress`.** Stages are emitted when each one starts, with a test.
4. **Task 1.2: `build-samples.mjs`** plus the samples endpoints (metadata, `:id`, `screenshot.png`). The PNG and thumbnail JPG are committed.
5. **Task 1.3: Fastify server.** `main.ts` with `listen`; helmet scoped to the app; `/cursed-shop/` without CSP; rate limit with `global: false` on `POST /api/audit` only; queue-full returns 429 before a job exists; `/api/health`; `UNSEEN_DEV_ALLOW_PRIVATE` refused in production.
6. **Task 1.4: job store and worker.** Functional updates; the screenshot stored before stripping.
7. **Task 1.5: routing and the app shell.** One h1 per view, `main`, a skip link, focus moved to the h1, and a "Keyboard help" dialog.
8. **Task 1.6: Spirit Sight.** Geometry from `naturalWidth`, the overlays and their reading order, the score, and the signature fog toggle.
9. **Task 1.7: Daylight** with export.
10. **Task 1.8: e2e test of the whole slice** on the Cursed Shop sample.

**Phase 2:** the Séance with real stages, the Whisper walk, the Keyboard walk.
**Phase 3:** the takes-form animation, the optional ambient drone, product states, the haunting detail dialog, then the **self-audit on every route** (as in the common file).

Every task lists its requirement and design-section references, and ends in passing tests with Windows-safe commands (`npm run <script> -w apps/web`; core: `npm run test -w @the-unseen/core`). There is no Dockerfile task.

**Verify before finishing:**
- run `git diff --stat .kiro/specs/spirit-sight-ui/tasks.md` and paste the output; it must show a large change
- grep `tasks.md` for `Task 1.0a`, `buildSpeechTrack`, `global: false`, `UNSEEN_DEV_ALLOW_PRIVATE`, `/sample/:id` and `cross-env`

Do not ask questions. If you near a limit, stop after a completed task section and write `Next: <section>`.
