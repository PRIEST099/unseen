---
inclusion: always
---

# THE UNSEEN — Kiro Workflow

## Communication rules

- Never end a turn with a menu or a question. If you approach a context limit, stop after completing the current item and write `Next: <item name>`.
- Report progress with concrete facts: test results, file paths, line counts. No vague summaries.

## Spec task completion

- Tick a spec task `[x]` only when its tests pass (unit tests for pure modules, integration tests for I/O).
- Record every spec deviation in that spec's `tasks.md` Notes section. If you change a requirement or design decision during implementation, that is drift and must be logged.

## Windows environment

- Set `UNSEEN_CHROMIUM_CHANNEL=chromium` before any command that launches a browser (Playwright tests, audit runs, manual checks).
- PowerShell command chaining: use `;` not `&&`.
- Environment variables: `$env:VARIABLE` syntax, never `%VARIABLE%`.

## Test commands

**packages/core:**
- `npm run typecheck` — TypeScript strict-mode check
- `npx vitest --run` — unit and property tests (src/**/*.test.ts)
- `npx playwright test` — integration tests (tests/**/*.int.spec.ts)

**apps/cursed-shop:**
- `npm run verify` — recomputes expected hauntings and diffs against golden file

Always run from workspace root with `-w <package-name>`, or `cd` into the package directory first.

## Protected files

Never edit these files. The product lead owns them:
- `apps/cursed-shop/expected-hauntings.json` — the golden truth for haunting counts
- `docs/brief/**` — product requirements, prompts, and review notes
- `.env*` — secrets and local configuration

The `guard-protected-files` hook will block writes to these paths. If a test requires changing them, ask the product lead.

## Test quality rules

- Never weaken a test to make it pass. If a property test fails, the implementation is wrong or the property is misstated. Fix the code or restate the property accurately.
- Every behaviour fix gets a regression test: a fixture page demonstrating the bug, plus a `*.int.spec.ts` that asserts the correct haunting result.
- Mutation-test new tests mentally: if you revert the fix, the test must fail. If it still passes, the test is not covering the fix.

## Git discipline

- The product lead owns git. You may read (`git status`, `git diff`, `git log`) but never commit, push, reset, or force-update.
- If you need a commit for a test or deployment step, explain what commit message and staged files you would use, and wait for the product lead to execute it.

## Steering and spec priority

When a steering file and a spec conflict, the spec wins. When a spec and an implementation comment conflict, the spec wins. When hauntings.md and any other file conflict, hauntings.md wins.

## Exorcise workflow

The `#exorcise` steering file defines the on-demand fix loop. It audits a URL, fixes the highest-severity haunting in source code (never with a runtime overlay), re-audits, and repeats. Use it when the product lead gives you a site to exorcise.
