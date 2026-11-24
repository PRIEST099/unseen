Set up Kiro's own working environment for the rest of THE UNSEEN build. **Use the current Kiro formats exactly as documented on kiro.dev** (CLI V3 and IDE 1.x). The product lead checked the docs on 2026-11-24; the key formats are summarised below. You know Kiro best: if something here contradicts the docs you can see, follow the docs and say so.

Create only files under `.kiro/` (plus helper scripts under `.kiro/hooks/scripts/`). Do not change app code.

## 1. Steering (`.kiro/steering/`)
Add four new files, one per inclusion mode, so the workflow uses all of them:
- **`kiro-workflow.md`** (`inclusion: always`): how to work in this repo, headless or in the IDE.
  - Never end with a menu or a question. If you near a limit, stop after a completed item and write `Next: <item>`.
  - Tick a spec task `[x]` only when its tests pass. Record every spec deviation in that spec's `tasks.md` Notes.
  - Windows: set `UNSEEN_CHROMIUM_CHANNEL=chromium` for any browser step.
  - Test commands in `packages/core`: `npm run typecheck`, `npx vitest --run`, `npx playwright test`. Shop: `npm run verify` in `apps/cursed-shop`.
  - Never weaken a test to make it pass. Never edit `apps/cursed-shop/expected-hauntings.json` or anything under `docs/brief/` (the product lead owns them).
  - Every behaviour fix gets a regression test, built from a fixture page plus a `*.int.spec.ts`.
- **`testing.md`** (`inclusion: fileMatch`, `fileMatchPattern: ["**/*.test.ts", "**/*.int.spec.ts", "**/tests/**"]`). Property-based testing conventions:
  - `fc.asyncProperty` with `await fc.assert(...)`, `numRuns` ≥ 100 (≥ 200 for security).
  - Arbitraries live outside `src/`.
  - Mutation-test new tests mentally: the test must fail if the fix is reverted.
  - Fixture-page conventions.
- **`wcag-reference.md`** (`inclusion: auto`, with `name` and `description`, so Kiro pulls it in for accessibility questions): a compact table of the WCAG 2.2 criteria this product uses (1.1.1, 1.3.1, 1.4.3, 2.1.1, 2.1.2, 2.4.4, 2.4.6, 2.4.7, 2.4.13 as guidance, 3.1.1, 3.3.2, 4.1.2), with their level, a one-line meaning and the W3C Understanding URL. Reference `#[[file:.kiro/steering/hauntings.md]]` rather than restating rules.
- **`exorcise.md`** (`inclusion: manual`, invoked as `#exorcise`): the on-demand "Exorcise" workflow. It replaces the old manual hook type:
  1. Audit the target URL.
  2. Fix the highest-severity haunting in **source**, never with an injected overlay.
  3. Re-audit, and report the before/after score.
  4. Repeat until the user stops.

## 2. Workspace hooks (`.kiro/hooks/*.json`, format `{"version": "v1", "hooks": [...]}`)
These apply to the IDE and to CLI V3 sessions. Put the logic in cross-platform Node scripts (`.kiro/hooks/scripts/*.mjs`) that read the hook's JSON from stdin.
- **`guard-protected-files.json`:** a `PreToolUse` hook on write tools that **blocks** (non-zero exit, with a clear stderr message to the agent) any write to `apps/cursed-shop/expected-hauntings.json`, `docs/brief/**`, `.env*`, or any path outside the workspace. This is our "Kiro cannot cheat the golden test" guardrail.
  - Test the script with sample stdin payloads: a blocked path, an allowed path, and malformed JSON. **Fail closed** on malformed input for protected paths, and **fail open** for everything else, so a bug in the script never stops normal work.
- **`core-typecheck-on-save.json`:** `PostFileSave` (agent edits) matching `packages/core/src/.*\.ts$` runs `npm run typecheck -w @the-unseen/core` and prints a one-line summary.
- **`shop-verify-on-save.json`:** `PostFileSave` matching `apps/cursed-shop/.*\.(html|css|js|svg)$` runs `npm run verify -w cursed-shop`, with the summary line only.
- **`stop-test-gate.json`:** on `Stop`, run `npm run typecheck` plus `npx vitest --run` in `packages/core` (not Playwright; too slow). Print the pass/fail summary, so the agent sees red tests before it claims success. Timeout 180 s.
- **`spec-types-drift.json`:** `PostFileSave` matching `\.kiro/specs/.*/design\.md$` uses an **agent** action. It asks Kiro to compare the data types in the saved design with `packages/core/src/types.ts`, list any drift, and fix nothing.

Each hook has a `description`. Keep the default timeouts unless noted.

## 3. Custom agents (`.kiro/agents/*.json`, CLI V3 schema: `tools` plus `permissions.rules`, not the legacy `allowedTools`)
- **`unseen-builder`:** the default builder for implementation runs.
  - `tools`: read, write, shell.
  - `permissions`: allow `fs_read` and `fs_write` in the workspace. Allow `shell` for `npm *`, `npx *`, `node *`, `git status*`, `git diff*`, `git log*`. **Deny** `git commit*`, `git push*`, `git reset*`, `git checkout*`, `rm -rf*` and `del /s*` (the product lead owns git).
  - `resources`: `file://.kiro/steering/**/*.md`.
  - `includeMcpJson`: true.
  - Inline hook: `SessionStart` prints the current branch and the last 15 lines of `docs/brief/KIRO_SESSION_LOG.md`, so every run starts with context.
  - `prompt`: a short role statement ("You are the builder of record for THE UNSEEN…").
- **`unseen-spec-writer`:** for spec runs. `tools`: read and write only (no shell). Same resources. Its prompt says to write all three spec files without stopping at the approval gate, because the product lead pre-approves requirements in the instruction.
- **`unseen-reviewer`:** read-only (`read` plus `shell` for test commands only; deny all writes). Its prompt says to review a change against the steering and specs, and to output findings with evidence. We will compare its reviews with the product lead's.

Validate each agent: `kiro-cli agent validate` or the equivalent documented command. If none exists, start `kiro-cli chat --agent <name> --no-interactive` with a trivial prompt and confirm it loads.

## 4. MCP (`.kiro/settings/mcp.json`)
- Add the official **Playwright MCP server** (`@playwright/mcp`), pinned to an exact version you look up with `npm view @playwright/mcp version`. Run it with `--browser chromium`, and in headless mode when no display is available. Spirit Sight UI runs will use it to **look at the UI they build**: screenshots, the accessibility snapshot, keyboard checks.
- Leave a disabled placeholder entry named `unseen` pointing at `packages/mcp` (`node packages/mcp/dist/server.js`). It is enabled once the MCP spec is built, and from then on Kiro audits its own UI with THE UNSEEN.
- `autoApprove`: only read-only browser tools (snapshot, screenshot, navigate). Never anything that types into forms on external sites.

## Done means
1. Every file exists and parses as JSON or front matter.
2. The guard script blocks a simulated write to `expected-hauntings.json` and allows a write to `packages/core/src/x.ts`.
3. Each agent loads.
4. `kiro-cli mcp list` (or the documented equivalent) shows the Playwright server.

Final message: a table of `surface | file | what it does | how you verified it`. Then list anything in the docs that differed from the summary above.
