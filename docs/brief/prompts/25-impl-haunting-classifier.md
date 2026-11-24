Run 12b: implement **all tasks** of `.kiro/specs/haunting-classifier/tasks.md` in dependency order, starting with **task 0** (the `RawAudit` extension in the runner). Tick each task `[x]` only when its tests pass. The spec has been through two independent reviews and a consistency sync (runs 20 and 23). Follow it exactly. Where it is still ambiguous, the order of truth is `.kiro/steering/hauntings.md`, then `docs/brief/prompts/20-classifier-spec-amend.md` (decisions A–F), then `requirements.md`, then `design.md`.

## Step 0 (before task 0): fix the defect you reported in run 22
`collectBoundingBoxes` in `runner/browser.ts` pairs rects with ids by index across two snapshots, so a page that adds or removes elements during load can throw in `loadPage`. Pair them by identity in a single snapshot (or a map keyed by element), and add a churn fixture plus a regression test. The `domNodes` work in task 0 will rely on correct boxes.

## Non-negotiables
- **Nothing is optional.** Every property test (fast-check, ≥ 100 runs), every golden test and the boundary test must exist and pass.
- **`classifier/` stays pure:** no I/O, no imports from `runner/`. Enforce this with ESLint 9 `no-restricted-imports` (`npm run lint`) and the grep test.
- **Fixture capture (task 1):** capture the 3 Cursed Shop `RawAudit` fixtures plus the `.selectors.json` sidecars **after** task 0, with the current runner. Commit the JSON fixtures. Golden tests run browser-free under Vitest.
- **The golden test must pass exactly against `apps/cursed-shop/expected-hauntings.json`:**
  - `detectedCountsByType` (primary ∪ secondary) per page and per type
  - the node-id unions
  - the CursedLoop subtree rule
  - the page-level `kind`s
  - controls not flagged as their named type

  **Never edit the golden file or the shop to make a test pass.** If you believe the golden file is wrong, stop and explain with evidence.
- **Windows:** use `UNSEEN_CHROMIUM_CHANNEL=chromium` for any browser step.
- **Do not change audit-engine behaviour** beyond task 0's additive fields. Re-run the whole `packages/core` suite at every checkpoint.

## Working style
- Work through the tasks in order and save after each one.
- If you approach a limit, stop after a completed task and write "Next: task N". Never offer a menu or ask a question.
- At each checkpoint, run `npm run typecheck`, `npm run lint`, `npx vitest --run` and `npx playwright test` in `packages/core`.

## Done means
- All four commands exit 0, and `apps/cursed-shop` `npm run verify` passes.
- `auditAndClassify(url)` is exported from `packages/core` and returns a `ClassifiedAudit` for each shop page.
- Final message:
  - the per-page golden table (type → expected vs detected)
  - the score for each shop page
  - the test summary lines
  - any spec deviation, recorded in the `tasks.md` Notes
