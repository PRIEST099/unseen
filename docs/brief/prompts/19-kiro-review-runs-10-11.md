Review and adopt audit-engine tasks 5–16 in `packages/core`. **You are the builder of record for this project.** Tasks 5–16 were written by Claude Code (the product lead) while no Kiro credits were available. That goes against the project rule that Kiro writes all code. Your job is to review that code against the spec and steering, fix anything wrong, and add what's missing, so the final engine is code you have checked and own.

Sources of truth, in order:
1. `.kiro/steering/hauntings.md`
2. `.kiro/specs/audit-engine/requirements.md`
3. `design.md`
4. `tasks.md`, including the "Implementation notes from run 11" in its Notes
5. the product-lead amendments in `docs/brief/prompts/10-impl-audit-engine-5-8.md` and `11-impl-audit-engine-9-16.md`

## Files to review
- `src/runner/browser.ts`
- `src/runner/collectors.ts`
- `src/runner/cdp.ts`
- `src/runner/ax-tree.ts`
- `src/runner/axe.ts`
- `src/runner/tab-walker.ts` (the `runWalk` and `walkTabs` section)
- `src/audit.ts`
- `src/index.ts`
- `src/types.ts` (the new fields)
- `src/runner/safe-fetch.ts` (only the abort-code fix)
- the tests in `src/**/*.test.ts` and `tests/**`

## Check each of these and fix where wrong (save after each)
1. **Requirements coverage.** Every acceptance criterion in Req 1–15 that tasks 5–16 claim is implemented and tested. List any gap and close it.
2. **hauntings.md §5 and §6.**
   - The walk start timing and the no-transition injection.
   - The escape test (Escape, then Shift+Tab).
   - Segmenting: reset detection and continue.
   - A cycle that covers every focusable is not a trap.
   - The step cap covers the whole walk.
   - Focus snapshots contain every property §6 needs, plus the adjacent background.
3. **The Fog and The Veiled fields.**
   - `backgroundUncertain` covers images, gradients and translucent layers.
   - `isLargeText` thresholds.
   - `hasVisibleText` excludes off-screen nodes.
   - `containsFocusable`.
4. **Error handling.** Every collector failure becomes a `CollectionError`, not a crash. `auditUrl` always closes the context and releases the pool slot, including on timeout and on `AuditResourceLimitError`.
5. **Security.**
   - The pre-launch SSRF check happens before `pool.acquire()`.
   - `OriginScopedPolicy` allows exactly one origin.
   - `auditHtml` binds `127.0.0.1` only.
   - No test disables the policy.
6. **Code quality.** Remove dead code, add missing types, use consistent naming, and keep the classifier boundary: nothing here imports from a future `classifier/`.

## Rules
- Do **not** weaken a test so that it passes. If a test is wrong, fix it and explain why.
- Do not change `apps/cursed-shop` or the golden file.

## Done means
- `npm run typecheck`, `npx vitest --run` and `npx playwright test` in `packages/core` all exit 0.
- `apps/cursed-shop` `npm run verify` passes.
- Final message:
  - the three test summary lines
  - a table of `file | what you changed | why`
  - an explicit list of the files you reviewed and accepted unchanged

If credits run low, stop after a numbered item and say which is next.
