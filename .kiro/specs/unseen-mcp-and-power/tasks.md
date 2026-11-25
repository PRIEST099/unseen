# Implementation Plan: unseen-mcp-and-power

## Overview

Builds `packages/mcp`, the Kiro Power in `power/`, the ghost gate and on-save hooks with `unseen-mcp install-hooks`, `power/DEMO.md`, the auditor agent and the repo self-audit hook. Tasks are in demo-critical order. Property tests are mandatory (fast-check, at least 100 runs). A task is ticked only when its tests pass. Browser-launching commands need `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'`. Core is built (`npm run build -w @the-unseen/core`) before the mcp typecheck.

## Tasks

- [x] 0. Housekeeping: correct the run 32 date
  - _Requirements: Requirement 19_
  - **Acceptance Criteria:** In `docs/LIVE_VERIFICATION_RESULTS.md`, `**Date:** 2025-01-31` becomes `**Date:** 2026-11-24`; `git diff` shows one changed line.
  - **Checkpoint:** `git diff --stat docs/LIVE_VERIFICATION_RESULTS.md` shows 1 insertion and 1 deletion.

- [x] 1. MCP server with `audit_url` and `audit_html`
  - _Requirements: 1, 2, 3, 6, 7.3, 7.5, 8, 9, 18, 20, 21.3_

  - [x] 1.1 Scaffold `packages/mcp` and additive Core changes
    - **Acceptance Criteria:**
      - `packages/mcp/package.json`: `@the-unseen/mcp` 0.1.0, `type: module`, `bin.unseen-mcp = dist/server.js`, dependencies `@the-unseen/core` `0.1.0`, `@modelcontextprotocol/sdk`, `zod`; dev dependencies `vitest`, `fast-check`, `typescript`, `@types/node`. Scripts `build`, `typecheck`, `test`, `test:integration`.
      - `tsconfig.json` extends the base, strict, excludes tests.
      - `vitest.config.ts`: `testTimeout` 180000, `hookTimeout` 60000, single thread.
      - Core: `WCAG_BY_TYPE`, `SOUND_CUE_BY_TYPE` in `classifier/wcag.ts`, read by the detectors; `auditHtmlAndClassify` in `audit.ts`; named exports added to `index.ts`; the new names appended to the expected list in `index.test.ts` (no removals, no other core test edits). Logged in Notes.
      - A test fails if `packages/mcp/src` imports Core other than `@the-unseen/core` or `@the-unseen/core/speech`.
    - **Tests:** `npm run typecheck -w @the-unseen/core`, `npm test -w @the-unseen/core` green and unchanged apart from the export list.

  - [x] 1.2 Pure modules and property tests
    - **Acceptance Criteria:** `pure/` modules `summary`, `selector`, `critical`, `baseline`, `dev-url`, `errors` exist with explicit return types; arbitraries in `tests/arbitraries/`; one invariant per `test()`: P1, P2, P3 (baseline), P4, P6 (including an `SsrfBlockedError` unit case), P8, P9, P11.
    - **Checkpoint:** `npm test -w @the-unseen/mcp` green; reverting `isCritical` to Wraith-only fails P4.

  - [x] 1.3 Tool handlers, server entry and CLI
    - **Acceptance Criteria:** Zod schemas for four tools (the last two return `INVALID_INPUT` stubs until task 5); `audit-url.ts` and `audit-html.ts` use `auditAndClassify` and `auditHtmlAndClassify`; tools never write `.unseen/`; stdio server with no arguments, `unseen-mcp audit <url> [--json]` otherwise, `try/finally` pool close; errors are `isError: true` with `structuredContent`.
    - **Tests (`tests/tools.int.test.ts`, in-memory client, Cursed Shop on an ephemeral port):** tools listed; `audit_url` on `checkout.html` returns score, counts and a Wraith; `page: 'full'` has no screenshot; snapshot of the summary; `audit_html` on `<form><button class="checkout"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></button></form>` plus a lang, h1 and main returns a Wraith `NamelessSpirit`; `file:///x` gives `INVALID_INPUT`; a non-HTML URL gives `NOT_HTML`; the CLI audit exits within 120 s.
    - **Checkpoint:** `npm run build -w @the-unseen/mcp` yields an executable `dist/server.js`.

- [x] 2. Power packaging (Agent Plugins format)
  - _Requirements: 10, 18.1, 21.2, 21.4_
  - **Acceptance Criteria:** `power/plugin.json`, `power/mcp.json` (as Requirement 10.2), skills `audit-before-done`, `exorcise`, `install-unseen-hooks` with front matter, `power/README.md`; no `power/hooks/`, no `package.json`, no `POWER.md`.
  - **Tests (`tests/power.test.ts`):** both JSON files validate against structural copies of the two published schemas (required fields, `additionalProperties` false); kebab-case name; keywords; no claim matches the Requirement 18.1 pattern; `mcp.json` has no `disabled`, `autoApprove` or `unseen-local`.
  - **Checkpoint:** `npm test -w @the-unseen/mcp` green. Manual: "Import power from a folder" (product lead records in Notes).

- [x] 3. Ghost gate, on-save hook and `install-hooks`
  - _Requirements: 7, 8, 9, 11, 12, 20.4, 21.5, 21.6_

  - [x] 3.1 Record the Stop-hook semantics (settled by D1)
    - **Acceptance Criteria:** Notes record: stdin shape, exit 1 plus stderr keeps the agent working, exit 2 never used, 3,000 character limit, IDE fallback, and the unverified IDE risk.

  - [x] 3.2 Pure `decideGate`, `gateMessage`, fingerprints; sub-commands
    - **Acceptance Criteria:** `pure/gate.ts`, `pure/gate-message.ts`; `hooks-cli.ts` implements `on-save` and `gate` per Requirements 11 and 12; `dirty.ts`; `workspace.ts`.
    - **Tests:** P5, P12; stub-audit tests: nothing dirty, nothing auditable, no new hauntings, haunted save then fixed save then gate prints `before 15`-style before score from `turn-start.json`, block, sixth block gives up, session change resets, quiet gap resets.

  - [x] 3.3 `install-hooks` and shims
    - **Acceptance Criteria:** `unseen-mcp install-hooks [dir]` writes the three files; `unseen-hooks.json` is `version: "v1"` with `PostFileSave` (matcher `.*\.(html|tsx|jsx|vue|svelte|css)$`, timeout 90), `Stop` (timeout 150) and a disabled `agent` Stop entry; the shims use absolute paths and forward exit codes.
    - **Tests:** every `command` path exists after install; shim exit codes forwarded with a workspace path containing a space.

  - [x] 3.4 End-to-end gate acceptance (`tests/gate.int.test.ts`, real Chromium, no stubs)
    - **Acceptance Criteria:** copy `power/demo/checkout.html` to a temp workspace, run `install-hooks`, touch, pipe a Stop payload into the installed gate shim: exit 1 and the Nameless Spirit on stderr, under 3,000 characters; fix the button, touch, run again: exit 0 and the before and after scores printed.

- [x] 4. `power/DEMO.md` and the demo fixture
  - _Requirements: 13_
  - **Acceptance Criteria:** `power/demo/checkout.html` and `power/DEMO.md` as in Requirement 13; scores in DEMO.md come from a computed run.
  - **Tests (`tests/demo.int.test.ts`):** the fixture has a Wraith `NamelessSpirit`; with `aria-label="Checkout"` it has none and a lower score; the scores printed in DEMO.md equal the computed ones; DEMO.md prerequisites appear in the required order.

- [x] 5. `explain_haunting` and `suggest_fix`
  - _Requirements: 4, 5, 20.1_
  - **Acceptance Criteria:** `pure/speech-example.ts` (with `syntheticRaw()`), `pure/fix-variants.ts`, `tools/explain.ts`, `tools/suggest-fix.ts`; guard in the handler.
  - **Tests:** P7, P10, "explain by id returns the haunting's own text"; in-memory client: four tools listed, `explain_haunting` by type for all ten types and by id, `suggest_fix` in `html`, `react`, `vue`.

- [ ] 6. Custom agent `unseen-auditor`
  - _Requirements: 16_
  - **Acceptance Criteria:** as Requirement 16. Writes to `.kiro/agents/` may prompt or be refused in headless mode; then the file content is printed for the product lead.
  - **Tests:** `tests/agent.test.ts` asserts tools, deny rules, the mcp allow rule, `includePowers: false`, no `allowedTools`, no `includeMcpJson`.

- [ ] 7. Repo hook `web-self-audit-on-save`
  - _Requirements: 15_
  - **Acceptance Criteria:** as Requirement 15, `.unseen/` already in `.gitignore`.
  - **Tests:** script test with a stubbed runner: pass, fail, timeout and debounced-skip lines.
  - **Checkpoint:** ask Kiro to make a whitespace edit to a file under `apps/web/src/client/`; the hook prints one line.

- [ ] 8. Exorcise the Cursed Shop
  - _Requirements: 14_
  - **Tests:** integration test audits original and copy; `git diff --exit-code -- apps/cursed-shop`; `npm run verify -w apps/cursed-shop`; `demo/cursed-shop-exorcised/package.json` absent.

- [ ] 9. Enable THE UNSEEN on itself (product lead applies the settings)
  - _Requirements: 17_
  - **Acceptance Criteria:** tasks 1 to 8 ticked; build succeeds; a stdio smoke test lists four tools; the builder prints the `unseen` entry; the product lead applies it.
  - **Checkpoint:** `npm run typecheck -w @the-unseen/mcp`, `npm test -w @the-unseen/mcp`, `npm test -w @the-unseen/core` pass.

## Notes

- Amendment 2026-11-25: decisions D1 to D8 and review findings applied. Overrides of the review: finding 1.2 and 2.1 (route): D2 uses `npm pack` plus `npm i -g`, no publish; finding 1.4 (hooks inside the skill): D2 uses `install-hooks`, no `power/hooks/`; finding 1.6: `.unseen/` is written only by CLI hook sub-commands; findings 1.7 and 2.5: before score from `turn-start.json`; finding 2.2: dirty `.html` files are audited directly; finding 2.10: dirty detection by mtime; finding 1.13 and 2.17: gate state per session plus a 10 minute quiet gap.
- Hook command timeouts are in seconds.
- Tasks 6 and 7 write to `.kiro/agents` and `.kiro/hooks`, which always prompt; in headless mode the files are printed for the product lead if the write is refused.
- Task 0 touches only `docs/LIVE_VERIFICATION_RESULTS.md`. `docs/brief/**` and `apps/cursed-shop/expected-hauntings.json` are protected.
- Task 1.1 drift (core): `WCAG_BY_TYPE` and `SOUND_CUE_BY_TYPE` added to `classifier/wcag.ts` and read by the detectors; `auditHtmlAndClassify` added to `audit.ts`; the export list in `src/index.test.ts` gained 10 names, none removed. Core: 644 tests passed after the change.

### Implementation notes (2026-11-25 run)

- **Task 3.1, Stop-hook semantics (from the decisions, no doc access in this run).** Stop receives stdin JSON `{hook_event_name, cwd, session_id}`. Exit 1 with the instruction on stderr keeps the agent working in both the IDE and CLI V3; exit 2 drops the output and is never used. The instruction stays under 3,000 characters (CLI 3.6+ truncates longer hook output to a file). A passing gate exits 0 and prints one line for the user; the before/after report is requested in the blocking instruction because a passing Stop ends the turn. **Unverified IDE risk:** whether the IDE starts a new turn on a Stop exit 1 has not been observed. Fallback: the disabled `agent`-type Stop entry in `unseen-hooks.json` (costs credits every turn). The field names of that disabled entry (`enabled`, `action.type: "agent"`, `action.prompt`) are written from the decision text, not from a schema, and must be checked in the IDE.
- **`private` kept on both packages.** `npm pack` and `npm i -g` of both tarballs work with `private: true` on `@the-unseen/core` (checked with `--prefix` into a temp directory: 102 packages, `unseen-mcp --help` runs from the installed copy). `@the-unseen/mcp` was never private. Nothing was published and the global npm prefix was not touched in this run.
- **Test split.** `npm test -w @the-unseen/mcp` runs the unit, property and file-system tests (94). The Chromium tests are `*.int.test.ts` and run with `npm run test:integration -w @the-unseen/mcp` (24), because the single-thread run of both takes about 90 s more. Both scripts build core first.
- **Selector in the gate message.** The gate shows the axe target when one exists (`button` for the demo page) and the HTML snippet carries the class. The on-save line therefore reads `on button`, not `on button.checkout`.
- **Dirty detection without gate state.** Files changed in the last 30 minutes count, so a first gate run in a large tree does not audit old files. The walk skips `node_modules`, `.git`, `.unseen`, `.kiro`, `dist` and stops at 20,000 entries.
- **Dev URL default is never probed.** Only `UNSEEN_DEV_URL` or `.unseen/config.json` `devServerUrl` make the hooks audit a server, so the repo's own Vite app on 5173 cannot be audited by accident.
- **`eval` in the forbidden-token guard** matches as a whole word, so "evaluate" in Core's text is not rejected. The other tokens are matched as substrings.
- **Power schemas.** `agent-plugins.org` could not be fetched in this run. `tests/power.test.ts` checks structural copies (required fields, no extra keys) of what the review described; compare against the published schemas when online.
- **Not done in this run:** tasks 6 to 9. Task 9 needs the product lead to apply the `.kiro/settings/mcp.json` entry printed in the run summary.
- **Manual items for the product lead:** import the Power from the folder in the Powers panel; IDE rehearsal of the gate (does Kiro continue after exit 1?) and of PostFileSave for agent writes; record both here.
