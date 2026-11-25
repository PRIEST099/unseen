# Requirements: unseen-mcp-and-power

## Introduction

This spec delivers three things: `packages/mcp` (the `unseen-mcp` stdio server), `power/` (the Kiro Power that installs it), and the hooks and agent that put the auditor inside Kiro's agent loop. The product claim for the video is: **"Kiro cannot finish a UI task while a ghost is in it."**

Sources of truth: `.kiro/steering/hauntings.md` (taxonomy, severity, speech), `.kiro/steering/security.md` (local MCP exemptions), `docs/brief/prompts/15-spec-unseen-mcp-and-power.md` (base brief and 2026-11-24 format addendum), and the 2026-11-25 updates. The updates win over the brief.

## Glossary

- **Gate**: the Power `Stop` hook that re-audits before Kiro ends a turn that changed UI files.
- **Critical haunting**: a primary haunting with severity `Wraith`, or of type `NamelessSpirit`, `WhisperingField` or `CursedLoop` (the three the steering says must never ship).
- **UI file**: a file matching `**/*.{html,tsx,jsx,vue,svelte,css}`.
- **Dev URL**: the URL of the developer's running dev server (Requirement 8).
- **Baseline**: `.unseen/last-audit.json` in the workspace, holding the haunting ids and score of the last audit.
- **Core**: `@the-unseen/core`. Its exports used here: `auditAndClassify`, `auditUrl`, `auditHtml`, `PermissiveSafeFetchPolicy`, `RestrictiveSafeFetchPolicy`, `buildSpeechTrack`.

## Requirements

### Requirement 1: MCP server skeleton

**User Story:** As a developer, I want one command that starts the auditor as an MCP server, so that any MCP client can use it.

1. `packages/mcp` is the npm workspace package `@the-unseen/mcp`, version `0.1.0`, with `bin: { "unseen-mcp": "dist/server.js" }` and a shebang in the built file, so `npx -y @the-unseen/mcp` works.
2. The server uses `@modelcontextprotocol/sdk` over stdio. Tool input schemas are Zod schemas in `src/types.ts`.
3. Nothing is written to stdout except MCP protocol frames. Logs go to stderr.
4. The server registers exactly four tools: `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`.
5. No audit, classifier, scoring or speech logic is duplicated. Every tool calls Core. A test fails if `packages/mcp/src` imports from `@the-unseen/core` internals other than the public entry or named exports added by task 1.1.

### Requirement 2: `audit_url`

**User Story:** As an agent, I want to audit my running dev server, so that I can see what a screen-reader user would meet.

1. Input: `{ url: string, page?: 'summary' | 'full' }`, default `summary`. Only `http:` and `https:` URLs are accepted.
2. It calls `auditAndClassify(url, { allowPrivate: true })` (the Permissive policy), because the server runs on the developer's machine (`security.md`, "Local MCP server exemptions").
3. The `summary` result contains: `score`, `countsByType`, `detectedCountsByType`, up to 10 top hauntings, `needsManualCheckCount`, `automatedCoverageNote`, and a Markdown `summary` for an agent.
4. Each top haunting has `id`, `type`, `severity`, `wcag` (criterion ids and URLs), `selector`, `htmlSnippet` and `fix`. Ordering is severity (Wraith, Restless, Banished), then the precedence order in `hauntings.md`, then DOM order.
5. `selector` is the CSS target of the matching axe node when one exists for the haunting's node ids, else a tag/id description taken from `htmlSnippet`. It is never invented.
6. The default result contains no screenshot. `page: 'full'` adds the whole `ClassifiedAudit` with `raw.screenshotPng` removed.
7. The Markdown summary states the score, lists each top haunting with its fix, includes the `automatedCoverageNote`, and never says the site is "compliant" or "accessible".
8. Every successful `audit_url` call writes the Baseline (Requirement 9.3).

### Requirement 3: `audit_html`

1. Input: `{ html: string }`, at most 1 MB. It calls Core `auditHtml` and returns the same output shape as `audit_url`, with `selector` and `htmlSnippet` relative to the supplied HTML.
2. It does not write the Baseline, because the snippet has no dev URL.

### Requirement 4: `explain_haunting`

1. Input: exactly one of `{ type }` (a `HauntingType`) or `{ id }` (a haunting id from an audit in this server session). Both or neither is `INVALID_INPUT`.
2. Output: display name, plain-language explanation, persona (one sentence beginning "As a"), WCAG criteria with URLs, severity rules for the type, and a speech example.
3. Text comes from Core's haunting catalogue: `generateExplanation`, `generatePersona` and `generateFix` in `packages/core/src/classifier/explanation.ts`, and the WCAG constants in `packages/core/src/classifier/wcag.ts`. For `{ id }` the haunting's own `explanation`, `persona`, `speech` and `speechNote` are returned unchanged.
4. For `{ type }` the speech example is produced by Core's `announce` on a fixed synthetic AX node per type, never by hand-written strings. Types with no speech (`TheFog`, `LostSoul`, `InvisibleWanderer`, `TheVeiled`, `ShatteredOrder`) return `speechExample: null`; `SilentTongue` and `CursedLoop` return their `soundCue`.
5. An unknown `id` returns `UNKNOWN_HAUNTING_ID`.

### Requirement 5: `suggest_fix`

1. Input: `{ id: string, framework?: 'html' | 'react' | 'vue' }`, default `html`. The id must belong to an audit in this session, else `UNKNOWN_HAUNTING_ID`.
2. Output builds on the haunting's `fix` (`instruction`, `codeSnippet`). `html` returns it unchanged. `react` and `vue` return the same fix in that framework's syntax (`className`/`htmlFor`/`aria-label` for React; `:aria-label` and template syntax for Vue).
3. Every fix is a source-level change. No output may contain a runtime overlay or injected script: no `<script`, `document.`, `innerHTML`, `setAttribute`, `MutationObserver`, `eval` or `new Function`. This holds for every type and framework (brief §6.2; product non-negotiable 2).
4. The output states that the change goes in the developer's source and that the page must be re-audited.

### Requirement 6: Typed errors

1. Tool failures return an MCP tool result with `isError: true` and `structuredContent: { code, message }`. Codes: `SSRF_BLOCKED`, `TIMEOUT`, `NOT_HTML`, `RESOURCE_LIMIT`, `INVALID_INPUT`, `UNKNOWN_HAUNTING_ID`, `AUDIT_FAILED`.
2. Mapping from Core errors: `SsrfBlockedError` → `SSRF_BLOCKED`, `AuditTimeoutError` → `TIMEOUT`, `NonHtmlContentError` → `NOT_HTML`, `AuditResourceLimitError` → `RESOURCE_LIMIT`, any other error → `AUDIT_FAILED`.
3. The mapping function is total. A message never contains a stack trace, a resolved IP or the raw error text of an unknown error. Details go to stderr only.
4. A Zod validation failure is `INVALID_INPUT`.

### Requirement 7: CLI mode for hooks

1. `unseen-mcp audit <url> [--json]` runs one `audit_url` and prints the result to stdout (Markdown, or JSON with `--json`), then exits 0 on success, or 1 with the error code on stderr. It is the same handler as the MCP tool.
2. Two more sub-commands wrap the hook logic: `unseen-mcp on-save` (Requirement 11) and `unseen-mcp gate` (Requirement 12). Both resolve the Dev URL, read and write `.unseen/`, and use the pure modules.
3. With no arguments the binary starts the stdio server. Hooks in consumer workspaces use `npx -y @the-unseen/mcp audit …`, so the Power does not need Core installed.

### Requirement 8: Dev URL resolution

1. The Dev URL is resolved in this order: env `UNSEEN_DEV_URL`; `devServerUrl` in `.unseen/config.json`; the default `http://localhost:5173`.
2. The resolver is a pure function of `(env, configJson)`. A value that is not an `http(s)` URL is ignored and the next source is used.
3. `power/README` and `POWER` docs name the env var, the config key and the default.

### Requirement 9: Baseline and new-haunting diff

1. `newHauntings(baseline, current)` returns the current primary hauntings whose id is not in the baseline. It is pure.
2. On the first audit (no Baseline) every haunting is new.
3. The Baseline holds `{ url, score, ids[], savedAtMs }`. `savedAtMs` is passed in by the I/O caller, not read inside the pure code.
4. A missing or corrupt Baseline is treated as empty, never as an error.

### Requirement 10: Power package

1. `power/` uses the Agent Plugins format: `plugin.json` (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, kebab-case `name` = `the-unseen`, `version`, `description`, `author.name`, `keywords` including accessibility, a11y, WCAG, screen reader, button, form, UI, component, HTML, React), `mcp.json` with top-level `mcpServers`, and `skills/<skill>/SKILL.md` with `name` and `description` front matter.
2. `mcp.json` has two entries: `unseen` (`npx -y @the-unseen/mcp`) and `unseen-local` (`node` on the local build, for development).
3. The Power ships these skills: `audit-before-done` (the steering: audit every UI you build or change with `audit_url` before saying the task is done; never ship a Nameless Spirit, Whispering Field or Cursed Loop; fix source, never inject overlays; re-audit after fixing and report the before/after score), `exorcise` (fix hauntings from the last audit one at a time, re-auditing after each), `exorcise-the-cursed-shop` (Requirement 14) and `install-unseen-hooks` (copies the hooks of Requirement 11 and 12 into the workspace `.kiro/hooks/`).
4. `power/` contains no application code beyond hook scripts, and no `package.json`.
5. `power/README.md` documents install by "Add Custom Power" then "Import power from a folder", and by public GitHub URL (`power/` subdirectory).
6. `POWER.md` is not used. If the Agent Plugins format cannot carry hooks, `install-unseen-hooks` is the delivery route and the fact is logged in `tasks.md` Notes.

### Requirement 11: On-save hook (Power)

1. A `PostFileSave` hook matching UI files audits the Dev URL via `unseen-mcp audit` and prints a short summary of **new** hauntings only (Requirement 9).
2. If there are none it prints one line: `THE UNSEEN: no new hauntings (score N).`
3. If the Dev URL is not reachable it prints one line, `THE UNSEEN: dev server not reachable at <url>; skipped.`, and exits 0. A save never fails because of this hook.
4. Each save of a UI file creates the marker `.unseen/ui-dirty` (used by the Gate).
5. The hook has a timeout of 90 seconds. A timeout prints one line and exits 0.

### Requirement 12: The ghost gate (Power `Stop` hook)

1. Before Kiro ends a turn, if `.unseen/ui-dirty` exists the Gate re-audits the Dev URL. Without the marker it exits 0 silently.
2. If any critical haunting remains, it prints each one (type, severity, selector, snippet, fix) to the agent and exits non-zero, so the agent keeps working. If the documented Stop-hook semantics differ (Requirement 12.7), the closest documented mechanism is used.
3. If no critical haunting remains, it removes the marker, prints `THE UNSEEN: gate passed (score N, before M).` and exits 0. Non-critical hauntings are listed but do not block.
4. If the Dev URL is not reachable, the Gate prints one line and exits 0. It cannot block on a missing server.
5. Loop guard: after 5 consecutive blocks in one session (`.unseen/gate-state.json`) the Gate exits 0 and prints that it gave up, so a haunting the agent cannot fix cannot trap it forever.
6. The decision (block or pass) is a pure function of `(markerPresent, reachable, criticalCount, consecutiveBlocks)`.
7. Before implementing, the builder reads the Kiro Stop-hook documentation. If a non-zero exit does not feed output back to the agent, the builder uses the nearest documented mechanism and records the deviation in `tasks.md` Notes.

### Requirement 13: Demo acceptance and `power/DEMO.md`

1. `power/DEMO.md` documents, step by step, the 1:10–1:50 video segment: fresh workspace, Power installed, prompt "build a checkout button", the gate catching an icon-only button (Nameless Spirit, Wraith), Kiro fixing the source, and the re-audit with before/after scores.
2. It lists the exact prompt, the expected tool calls, the expected gate output and the expected score direction, plus a recovery section for the dev server not running.
3. A fixture `power/demo/checkout-start.html` holds the starting page used by the demo, with an icon-only checkout button. A test audits it and asserts a Wraith `NamelessSpirit`, and that the same page with an `aria-label` on that button has none.

### Requirement 14: Exorcise the Cursed Shop

1. The skill `exorcise-the-cursed-shop` and the manual steering `#exorcise` (`.kiro/steering/exorcise.md`) describe the workflow: audit the Cursed Shop, then write a **fixed copy** to `demo/cursed-shop-exorcised/`.
2. `demo/cursed-shop-exorcised/` has no `package.json` and lies outside the `apps/*` workspace glob, so npm workspaces are unaffected. `structure.md` lists the path.
3. `apps/cursed-shop` is never modified. `npm run verify -w apps/cursed-shop` still passes afterwards.
4. Re-auditing the exorcised copy gives a lower score than the original. The report shows both.

### Requirement 15: Repo hook `web-self-audit-on-save`

1. `.kiro/hooks/web-self-audit-on-save.json` is a `PostFileSave` hook with matcher `apps/web/src/client/.*\.(tsx|ts|css)$`.
2. It runs the web app's self-audit and prints a one-line summary: pass with the route count, or fail with the count and the first haunting type.
3. It never blocks the save and exits 0.
4. The existing hooks `core-typecheck-on-save`, `guard-protected-files`, `shop-verify-on-save`, `spec-types-drift` and `stop-test-gate` are not recreated or changed.

### Requirement 16: Custom agent `unseen-auditor`

1. `.kiro/agents/unseen-auditor.json` uses the CLI V3 schema (`tools`, `permissions.rules`, `resources`, `mcpServers`), not legacy `allowedTools`.
2. It may use `fs_read` and the four unseen MCP tools only. `fs_write` and `shell` are denied.
3. Its prompt tells it to audit, then post a short Markdown summary with the score, critical hauntings and the coverage caveat. It never edits files.

### Requirement 17: Enable THE UNSEEN on itself

1. As the last implementation step, the `unseen` entry in `.kiro/settings/mcp.json` has `"disabled"` removed (or `false`), points at the built server (`packages/mcp/dist/server.js`), and lists the four tools in `autoApprove`.
2. The step runs only after the MCP tests and a manual stdio smoke test pass.

### Requirement 18: Honesty and safety

1. No tool output, summary, DEMO text or skill text claims a site is "compliant", "accessible" or "passes WCAG". Reports carry the 30–40% caveat.
2. `audit_url` accepts private and `localhost` URLs only because the server is local. The hosted app never imports `packages/mcp`.
3. No code in this spec patches another site's DOM at runtime.

### Requirement 19: Housekeeping

1. `docs/LIVE_VERIFICATION_RESULTS.md` line `**Date:** 2025-01-31` is corrected to `**Date:** 2026-11-24`. Nothing else in that file changes.

### Requirement 20: Tests

1. Property-based tests (fast-check, ≥100 runs) are mandatory for: the summary formatter, the baseline diff, the critical classifier, the error mapper, `suggest_fix` output, the dev URL resolver, the gate decision, and the speech-example builder. Each test states its invariant.
2. Every tool is called through an in-memory MCP client (`InMemoryTransport`) against the Cursed Shop served locally by a test helper.
3. The summary text for `checkout.html` is snapshot-tested.
4. Hook scripts are tested with a stub audit command: unreachable server, no new hauntings, new critical haunting, loop guard.
5. All new tests run in `npm run test -w @the-unseen/mcp`; no test needs a live URL.
