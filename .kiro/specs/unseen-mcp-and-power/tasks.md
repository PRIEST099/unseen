# Implementation Plan: unseen-mcp-and-power

## Overview

Builds `packages/mcp`, the Kiro Power in `power/`, the ghost gate and on-save hooks, `power/DEMO.md`, the auditor agent and the repo self-audit hook. Tasks are in demo-critical order. Property-based tests are mandatory (fast-check, ≥100 runs), and a task is ticked only when its tests pass. Browser-launching commands need `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'`.

## Tasks

- [ ] 0. Housekeeping: correct the run 32 date
  - _Requirements: Requirement 19_
  - **Acceptance Criteria:**
    - In `docs/LIVE_VERIFICATION_RESULTS.md`, `**Date:** 2025-01-31` becomes `**Date:** 2026-11-24`. No other line changes (`git diff` shows exactly one changed line).
  - **Checkpoint:** `git diff --stat docs/LIVE_VERIFICATION_RESULTS.md` shows 1 insertion and 1 deletion.

- [ ] 1. MCP server with `audit_url` and `audit_html`
  - _Requirements: Requirements 1, 2, 3, 6, 7, 8, 9, 18, 20_
  - _Design: "Reuse of Core", "Package layout", "Tool contracts", "Baseline and gate"_

  - [ ] 1.1 Scaffold `packages/mcp` and add additive Core exports
    - _Requirements: Requirement 1_
    - **Acceptance Criteria:**
      - `packages/mcp/package.json`: name `@the-unseen/mcp`, version `0.1.0`, `"type": "module"`, `bin: { "unseen-mcp": "dist/server.js" }`, dependencies `@the-unseen/core` `0.1.0`, `@modelcontextprotocol/sdk`, `zod`; devDependencies `vitest`, `fast-check`, `typescript`. Scripts: `build`, `typecheck`, `test`.
      - `tsconfig.json` extends `../../tsconfig.base.json`, `strict: true`, excludes `**/*.test.ts` and `tests/**`.
      - `packages/core/src/index.ts` gains named exports (additive): `generateExplanation`, `generatePersona`, `generateFix`, `announce`, `HAUNTING_TYPES`, the WCAG constants, the error classes if not yet exported, the `classify` function if `auditHtml` needs it, and the types `Haunting`, `ClassifiedAudit`, `HauntingType`, `HauntingFix`, `HauntingSeverity`, `RawAudit`, `AXNode`. Logged in `.kiro/specs/audit-engine/tasks.md` Notes ("Drift from spec").
      - A test fails if `packages/mcp/src` imports a Core path other than `@the-unseen/core`.
      - `npm install` at the root links the workspace.
    - **Tests:** `npm run typecheck -w @the-unseen/mcp` and `npm run typecheck -w @the-unseen/core`; `npm run test -w @the-unseen/core` still passes.
    - **Checkpoint:** typechecks pass; core tests unchanged and green.

  - [ ] 1.2 Pure modules: summary, selector, critical, baseline, dev-url, errors
    - _Requirements: Requirements 2.3–2.7, 6, 8, 9; Requirement 20.1_
    - _Design: "Package layout" `pure/`; properties P1–P4, P6, P8, P9, P11_
    - **Acceptance Criteria:**
      - `pure/summary.ts`, `selector.ts`, `critical.ts`, `baseline.ts`, `dev-url.ts`, `errors.ts` exist, are pure (no I/O, no clock, no randomness) and export functions with explicit return types.
      - `tests/arbitraries/` has `haunting.ts`, `classified-audit.ts`, `baseline.ts`, reused by later suites.
      - Mandatory property tests, one invariant per `test()`: P1, P2, P3 (baseline); P4 (critical); P6 (errors, including unknown error values and strings containing URLs and IPs); P8 (summary); P9 (dev URL); P11 (selector).
    - **Tests:** `npm run test -w @the-unseen/mcp` passes.
    - **Checkpoint:** all property tests pass at ≥100 runs; mentally reverting `isCritical` to Wraith-only fails P4.

  - [ ] 1.3 Tool handlers, server entry and CLI mode
    - _Requirements: Requirements 1.2–1.4, 2, 3, 6, 7_
    - _Design: "Tool contracts", "Sessions", "Errors"_
    - **Acceptance Criteria:**
      - `types.ts` has Zod schemas for all four tools (the last two are stubs returning `INVALID_INPUT` until task 5).
      - `tools/audit-url.ts` calls `auditAndClassify(url, { allowPrivate: true })`; `tools/audit-html.ts` calls Core `auditHtml` plus classification; both return `AuditToolResult` and record hauntings in `session.ts`.
      - `workspace.ts` reads and writes `.unseen/last-audit.json`; `audit_url` writes it, `audit_html` does not.
      - `server.ts` runs stdio when no arguments are given and `unseen-mcp audit <url> [--json]` otherwise; stdout carries only protocol frames in server mode.
      - Errors are returned as `isError: true` with `structuredContent: { code, message }`.
    - **Tests:**
      - `tests/helpers/shop-server.ts` serves `apps/cursed-shop` on an ephemeral port.
      - `tests/tools.int.test.ts` uses `InMemoryTransport` and a real `Client`: the tool list contains `audit_url` and `audit_html`; `audit_url` on `checkout.html` returns score, counts and a Wraith; `page: 'full'` has no `screenshotPng`; the summary for `checkout.html` is a snapshot; `audit_html` on `<button><svg></svg></button>` returns a Wraith `NamelessSpirit`; a `file:///` URL and a non-HTML URL return typed error codes.
    - **Checkpoint:** `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npm run test -w @the-unseen/mcp` passes; `npm run build -w @the-unseen/mcp` produces an executable `dist/server.js`.

- [ ] 2. Power packaging (Agent Plugins format)
  - _Requirements: Requirement 10, Requirement 18.1_
  - _Design: "Power layout"_
  - **Acceptance Criteria:**
    - `power/plugin.json` with the schema URL, `name: "the-unseen"`, `version`, `description`, `author.name`, and the keywords from Requirement 10.1.
    - `power/mcp.json` with `mcpServers.unseen` (`npx -y @the-unseen/mcp`) and `mcpServers.unseen-local` (`node packages/mcp/dist/server.js`).
    - Skills with `name` and `description` front matter: `audit-before-done` (the four steering rules from Requirement 10.3, quoted exactly), `exorcise`, `install-unseen-hooks` (copies `power/hooks/*` into the workspace; the skill text lists the files). The `exorcise-the-cursed-shop` skill is added in task 8.
    - `power/README.md`: install by "Add Custom Power" then "Import power from a folder", and by public GitHub URL; documents `UNSEEN_DEV_URL`, `.unseen/config.json` `devServerUrl`, the default `http://localhost:5173`, and the `.gitignore` entry for `.unseen/`.
    - No `package.json`, no `POWER.md` in `power/`.
  - **Tests:** a Vitest test in `packages/mcp/tests/power.test.ts` parses `plugin.json`, `mcp.json` and every `SKILL.md` front matter, and asserts required fields, kebab-case name, the keywords, that no skill or README text contains "compliant" or "accessible" as a claim, and that `power/` has no `package.json`.
  - **Checkpoint:** `npm run test -w @the-unseen/mcp` passes. Manual: Powers panel → "Import power from a folder" loads `power/` (result recorded in Notes).

- [ ] 3. Ghost gate and on-save hooks (Power)
  - _Requirements: Requirements 11, 12, 20.4_
  - _Design: "Baseline and gate", "Stop-hook semantics"_

  - [ ] 3.1 Read the Stop-hook documentation and record the semantics
    - _Requirements: Requirement 12.7_
    - **Acceptance Criteria:**
      - The builder reads the current kiro.dev hooks documentation and writes in Notes: what a Stop hook receives, what a non-zero exit does, and the chosen mechanism (design options 1 or 2).
      - If option 2 is chosen, the deviation from Requirement 12.2 is logged.
    - **Checkpoint:** Notes entry exists before 3.3 starts.

  - [ ] 3.2 Pure `decideGate`, CLI sub-commands `on-save` and `gate`
    - _Requirements: Requirements 11.1–11.5, 12.1–12.6_
    - **Acceptance Criteria:**
      - `pure/gate.ts` implements `decideGate` exactly as in the design.
      - `on-save`: resolves the Dev URL, pre-flights it (3 s `HEAD`), audits, prints only new hauntings or `THE UNSEEN: no new hauntings (score N).`, writes the Baseline and the `.unseen/ui-dirty` marker; unreachable prints the one-line message and exits 0; timeout 90 s exits 0.
      - `gate`: follows `decideGate`; on `block` prints each critical haunting (type, severity, selector, snippet, fix) and exits with the code chosen in 3.1; on `pass` removes the marker, resets the block counter and prints `gate passed (score N, before M)`; on `gave-up` prints so and exits 0.
    - **Tests:**
      - Property tests P5 (gate, all branches).
      - Stub-audit tests (`UNSEEN_MCP_CMD`-style injection of a fake audit function): unreachable server, no new hauntings, new critical haunting blocks, fix then pass, sixth consecutive block gives up.
    - **Checkpoint:** `npm run test -w @the-unseen/mcp` passes; mentally removing the marker check makes the "no marker → skip" test fail.

  - [ ] 3.3 Hook files and shims
    - _Requirements: Requirements 10.3, 11, 12_
    - **Acceptance Criteria:**
      - `power/hooks/unseen-hooks.json` (`version: "v1"`) has a `PostFileSave` hook with matcher `.*\.(html|tsx|jsx|vue|svelte|css)$` running `node .kiro/hooks/unseen-on-save.mjs`, and a `Stop` hook running `node .kiro/hooks/unseen-gate.mjs`.
      - `power/hooks/scripts/on-save.mjs` and `gate.mjs` are shims that run the CLI sub-command and forward stdout, stderr and exit code.
      - `install-unseen-hooks` skill copies them to `.kiro/hooks/` of the target workspace.
    - **Tests:** a test parses the hook JSON against the v1 shape; a test runs each shim against a stub command and checks forwarded exit codes.
    - **Checkpoint:** `npm run test -w @the-unseen/mcp` passes; shim exit codes verified.

- [ ] 4. `power/DEMO.md` and the demo fixture
  - _Requirements: Requirement 13_
  - _Design: "Demo flow"_
  - **Acceptance Criteria:**
    - `power/demo/checkout-start.html` is a tiny page with `<html lang="en">`, an `<h1>`, a `<main>`, and a checkout `<button>` containing only an SVG icon.
    - `power/DEMO.md` has numbered steps: prerequisites (Chromium channel, dev server on 5173, warm-up `npx` audit), import the Power, install hooks, the exact prompt "build a checkout button", expected tool calls, expected gate output, expected fix, expected before/after scores, and a recovery section.
    - Scores in DEMO.md come from running the fixture, not typed by hand.
  - **Tests:** `packages/mcp/tests/demo.int.test.ts`: auditing the fixture gives a Wraith `NamelessSpirit`; the same page with `aria-label="Checkout"` has none and a lower score; the scores in DEMO.md equal the computed ones.
  - **Checkpoint:** `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npm run test -w @the-unseen/mcp` passes. Manual rehearsal of the 1:10–1:50 segment is recorded in Notes.

- [ ] 5. `explain_haunting` and `suggest_fix`
  - _Requirements: Requirements 4, 5, 20.1_
  - _Design: "Explain", "suggest_fix"; properties P7, P10_
  - **Acceptance Criteria:**
    - `pure/speech-example.ts`, `pure/fix-variants.ts`, `tools/explain.ts`, `tools/suggest-fix.ts` implement Requirements 4 and 5 using Core's catalogue (`explanation.ts`, `wcag.ts`) and `announce`.
    - `explain_haunting` rejects both-or-neither of `type`/`id`; unknown ids give `UNKNOWN_HAUNTING_ID`.
    - The forbidden-token guard (Requirement 5.3) runs in the handler.
  - **Tests:**
    - Property tests: P7 (all types × frameworks), P10 (speech example), and "explain by id returns the haunting's own text unchanged".
    - In-memory client: all four tools listed; `explain_haunting` by type for all ten types; by id after an audit; `suggest_fix` in `html`, `react`, `vue` after auditing `checkout.html`.
  - **Checkpoint:** `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npm run test -w @the-unseen/mcp` passes.

- [ ] 6. Custom agent `unseen-auditor`
  - _Requirements: Requirement 16_
  - **Acceptance Criteria:**
    - `.kiro/agents/unseen-auditor.json` in the CLI V3 shape of `unseen-reviewer.json`: `tools: ["read", "@unseen"]`, inline `mcpServers.unseen`, rules allow `fs_read`, deny `fs_write` on `**`, deny `shell`; no `includeMcpJson`, no `allowedTools`; prompt per Requirement 16.3.
  - **Tests:** `packages/mcp/tests/agent.test.ts` parses the file and asserts the tool set, the deny rules, and the absence of `allowedTools` and `includeMcpJson`.
  - **Checkpoint:** `npm run test -w @the-unseen/mcp` passes.

- [ ] 7. Repo hook `web-self-audit-on-save`
  - _Requirements: Requirement 15_
  - _Design: "Repo hook: web-self-audit-on-save"_
  - **Acceptance Criteria:**
    - `.kiro/hooks/web-self-audit-on-save.json` (`PostFileSave`, matcher `apps/web/src/client/.*\.(tsx|ts|css)$`, command `node .kiro/hooks/scripts/web-self-audit.mjs`, timeout 170).
    - `web-self-audit.mjs` runs `npx playwright test e2e/self-audit.spec.ts --reporter=line` in `apps/web` with `UNSEEN_CHROMIUM_CHANNEL=chromium`, applies the 30 s debounce, prints one line, always exits 0.
    - The five existing hooks are untouched (`git diff` shows no change to them).
    - The design's justification for running the e2e spec is kept in Notes.
  - **Tests:** a script test with a stubbed runner covers pass, fail and debounced-skip lines.
  - **Checkpoint:** `npm run test -w @the-unseen/mcp` passes; one manual save of a file under `apps/web/src/client/` prints the one-line summary.

- [ ] 8. Exorcise the Cursed Shop
  - _Requirements: Requirement 14_
  - _Design: "Exorcise the Cursed Shop"_
  - **Acceptance Criteria:**
    - `power/skills/exorcise-the-cursed-shop/SKILL.md` exists; `.kiro/steering/exorcise.md` gets a section pointing at `demo/cursed-shop-exorcised/`.
    - `demo/cursed-shop-exorcised/` holds the fixed copy of `index.html`, `product.html`, `checkout.html` and `img/`, with no `package.json`.
    - `.kiro/steering/structure.md` lists `demo/cursed-shop-exorcised/`.
    - `apps/cursed-shop` is unchanged.
  - **Tests:** an integration test audits the original and the copy through the MCP client and asserts the copy has a lower score on each page; a test asserts `apps/cursed-shop` file hashes equal those recorded before the task and that `demo/cursed-shop-exorcised/package.json` is absent. `npm run verify -w apps/cursed-shop` passes.
  - **Checkpoint:** `$env:UNSEEN_CHROMIUM_CHANNEL='chromium'; npm run test -w @the-unseen/mcp` passes; `npm run verify -w apps/cursed-shop` passes.

- [ ] 9. Enable THE UNSEEN on itself
  - _Requirements: Requirement 17_
  - **Acceptance Criteria:**
    - Preconditions: tasks 1–8 ticked; `npm run build -w @the-unseen/mcp` succeeds; a manual stdio smoke test lists four tools.
    - In `.kiro/settings/mcp.json` the `unseen` entry has `"disabled": false`, `args: ["packages/mcp/dist/server.js"]`, and `autoApprove` for `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`. The `playwright` entry is unchanged.
    - Final run: `npm run typecheck -w @the-unseen/mcp`, `npm run test -w @the-unseen/mcp`, `npm run test -w @the-unseen/core`.
  - **Checkpoint:** all three commands pass; Kiro's MCP panel shows `unseen` connected (recorded in Notes).

## Notes

- Spec drift is recorded here during implementation.
- Task 0 touches only `docs/LIVE_VERIFICATION_RESULTS.md`. `docs/brief/**` and `apps/cursed-shop/expected-hauntings.json` are protected and are not edited.
- Hook command timeouts above are in seconds (the existing hooks use the same `timeout` field).
