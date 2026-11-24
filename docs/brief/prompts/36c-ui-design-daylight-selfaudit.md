Part C of 4. **Context:** we are amending `.kiro/specs/spirit-sight-ui/` after a review: `docs/brief/review-notes/spirit-sight-ui-spec-review-1.md` (52 findings) and decisions A–N in `docs/brief/prompts/29-spirit-sight-ui-spec-amend.md`. `requirements.md` is already amended and is the source of truth for this part. The real core types are in `packages/core/src/classifier/types.ts` and `packages/core/src/types.ts`.

**Step 0:** set `"enabled": false` in `.kiro/hooks/spec-types-drift.json`. Its agent action interrupts headless spec edits. **Last step:** set it back to `true`.

**Rules:**
- Rewrite only the sections named below. **Replace** stale sections, do not append, and delete obsolete text, so that `design.md` gets shorter, not longer.
- Do not ask questions. If you near a limit, stop after a completed section and write `Next: <section>`.
- Final message: the sections you rewrote, plus the grep results named below.

**Rewrite these design.md sections:**
- **Routing (decision F):** `/`, `/seance/:jobId`, `/audit/:id` and `/sample/:id`, plus `/keyboard`, `/whisper` and `/daylight` sub-routes, and a 404 view. Each view has one h1, a `main` landmark, a skip link and `lang="en"`.
- **Daylight (decision M):** every haunting listed under each of its `wcag[]` criteria; the needs-manual-check list; the honest coverage note; Markdown and JSON export.
- **Product states (decision N):** a clean site, an audit error, a blocked URL, and timeouts.
- **Self-audit test (decision F):** it runs against the **production build served by Fastify**, on every route with a sample loaded. It asserts the view rendered (overlays present, h1 text) before asserting zero hauntings.
- **Testing strategy:** Vitest `src/**`, Playwright e2e in `apps/web/e2e/`, and the exact commands.
- **Remove** the Dockerfile section; it is deferred to run 16, which pins `mcr.microsoft.com/playwright:v1.65.1-noble`.

**Grep afterwards:** `/sample/:id` (≥ 1), `Dockerfile` (only in a deferral note).
