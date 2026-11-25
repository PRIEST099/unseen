# Requirements: unseen-mcp-and-power

## Introduction

This spec delivers three things: `packages/mcp` (the `unseen-mcp` stdio server and CLI), `power/` (the Kiro Power that installs the server), and the hooks and agent that put the auditor inside Kiro's agent loop. The product claim for the video is: **"Kiro cannot finish a UI task while a ghost is in it."** The demo is recorded in the **Kiro IDE**.

Sources of truth: `.kiro/steering/hauntings.md` (taxonomy, severity, speech), `.kiro/steering/security.md` (local MCP exemptions), `docs/brief/prompts/15-spec-unseen-mcp-and-power.md`, and the product lead's decisions D1 to D8 of 2026-11-25 (`docs/brief/prompts/46-mcp-power-amend-and-build.md`) together with `docs/brief/review-notes/mcp-power-spec-review-1.md`. The decisions win over the brief.

Amendment log (2026-11-25): the review findings 1.1 to 2.20 and decisions D1 to D8 are applied in this file, `design.md` and `tasks.md`. Where a finding was overridden by a decision, `tasks.md` Notes says so.

## Glossary

- **Gate**: the `Stop` hook that re-audits before Kiro ends a turn that touched UI files.
- **Critical haunting**: a primary haunting with severity `Wraith`, or of type `NamelessSpirit`, `WhisperingField` or `CursedLoop`.
- **UI file**: a file with extension `html`, `tsx`, `jsx`, `vue`, `svelte` or `css`.
- **Dirty file**: a UI file whose mtime is newer than the last gate pass (Requirement 11.1).
- **Workspace root**: the `cwd` field of the hook's stdin JSON, else env `UNSEEN_WORKSPACE`, else `process.cwd()`. It is never derived from the MCP server's working directory.
- **Dev URL**: the URL of the developer's running dev server (Requirement 8).
- **Fingerprint**: `type|kind|htmlSnippet` plus `#<occurrence index>` for duplicates. It identifies a haunting across audits (node ids are not stable between audits).
- **Turn start**: `.unseen/turn-start.json`, the audit result before Kiro changed anything in this turn.
- **Core**: `@the-unseen/core`.

## Requirements

### Requirement 1: MCP server skeleton

1. `packages/mcp` is the npm workspace package `@the-unseen/mcp`, version `0.1.0`, with `bin: { "unseen-mcp": "dist/server.js" }` and a shebang in the built file. Nothing is published to npm; the install route is Requirement 21.
2. The server uses `@modelcontextprotocol/sdk` over stdio. Tool input schemas are Zod schemas in `src/types.ts`.
3. Nothing is written to stdout except MCP protocol frames in server mode. Logs go to stderr.
4. The server registers exactly four tools: `audit_url`, `audit_html`, `explain_haunting`, `suggest_fix`.
5. No audit, classifier, scoring or speech logic is duplicated. A test fails if `packages/mcp/src` imports from Core other than `@the-unseen/core` (the public entry) or its documented subpath `@the-unseen/core/speech`.
6. MCP tools never write `.unseen/`.

### Requirement 2: `audit_url`

1. Input: `{ url: string, page?: 'summary' | 'full' }`, default `summary`. Only `http:` and `https:` URLs are accepted. Any other scheme (including `file:///`) is `INVALID_INPUT`.
2. It calls `auditAndClassify(url, { allowPrivate: true })`, because the server runs on the developer's machine (`security.md`, "Local MCP server exemptions").
3. The `summary` result contains: `score`, `countsByType`, `detectedCountsByType`, up to 10 top hauntings, `truncated`, `needsManualCheckCount`, `automatedCoverageNote`, and a Markdown `summary` for an agent.
4. Each top haunting has `id`, `type`, `severity`, `wcag` (criterion ids and URLs), `selector`, `htmlSnippet` and `fix`. Ordering is severity (Wraith, Restless, Banished), then the precedence order in `hauntings.md`, then DOM order.
5. `selector` is the CSS target of the first `raw.axeViolations` node whose non-null `backendDOMNodeId` is in the haunting's `nodeIds`, joined with a space. Otherwise it is built only from the tag, id and class tokens in `htmlSnippet`. Otherwise it is exactly `(see htmlSnippet)`.
6. The default result contains no screenshot. `page: 'full'` adds the `ClassifiedAudit` with `raw.screenshotPng` removed.
7. The Markdown summary states the score, lists each top haunting with its fix, includes the `automatedCoverageNote`, and makes no compliance claim: it never matches `/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i`. Core's fix text may contain the phrase "accessible name"; that is not a claim.

### Requirement 3: `audit_html`

1. Input: `{ html: string }`, at most 1 MB. It calls Core `auditHtmlAndClassify` and returns the same output shape as `audit_url`, with `selector` and `htmlSnippet` relative to the supplied HTML.

### Requirement 4: `explain_haunting`

1. Input: exactly one of `{ type }` (a `HauntingType`) or `{ id }` (a haunting id from an audit in this server session). Both or neither is `INVALID_INPUT`.
2. Output: display name, plain-language explanation, persona (one sentence beginning "As a"), WCAG criteria with URLs, severity rules for the type, and a speech example.
3. Text comes from Core: `generateExplanation`, `generatePersona`, `generateFix`, `WCAG_BY_TYPE`, `SOUND_CUE_BY_TYPE`. For `{ id }` the haunting's own `explanation`, `persona`, `speech` and `speechNote` are returned unchanged.
4. For `{ type }` the speech example is produced by Core's `announce` on a fixed synthetic AX node per type. Types with no speech (`TheFog`, `LostSoul`, `InvisibleWanderer`, `TheVeiled`, `ShatteredOrder`) return `speechExample: null`; `SilentTongue` and `CursedLoop` return their `soundCue` from `SOUND_CUE_BY_TYPE`.
5. An unknown `id` returns `UNKNOWN_HAUNTING_ID`.

### Requirement 5: `suggest_fix`

1. Input: `{ id: string, framework?: 'html' | 'react' | 'vue' }`, default `html`. The id must belong to an audit in this session, else `UNKNOWN_HAUNTING_ID`.
2. Output builds on the haunting's `fix` (`instruction`, `codeSnippet`). `html` returns it unchanged. `react` and `vue` return the same fix in that framework's syntax.
3. No output may contain a runtime overlay or injected script: no `<script`, `document.`, `innerHTML`, `setAttribute`, `MutationObserver`, `eval` or `new Function`.
4. The output states that the change goes in the developer's source and that the page must be re-audited.

### Requirement 6: Typed errors

1. Tool failures return `isError: true` with `structuredContent: { code, message }`. Codes: `SSRF_BLOCKED`, `TIMEOUT`, `NOT_HTML`, `RESOURCE_LIMIT`, `INVALID_INPUT`, `UNKNOWN_HAUNTING_ID`, `AUDIT_FAILED`.
2. Mapping: `SsrfBlockedError` to `SSRF_BLOCKED`, `AuditTimeoutError` to `TIMEOUT`, `NonHtmlContentError` to `NOT_HTML`, `AuditResourceLimitError` to `RESOURCE_LIMIT`, `HtmlSizeError` to `INVALID_INPUT`, any other error to `AUDIT_FAILED`. `SSRF_BLOCKED` is covered by a unit test of the mapper with a constructed `SsrfBlockedError`.
3. The mapping function is total. A message never contains a stack trace, a resolved IP, the URL or the raw text of an error.
4. A Zod validation failure is `INVALID_INPUT`.

### Requirement 7: CLI mode

1. `unseen-mcp audit <url> [--json]` runs one `audit_url` and prints the result (Markdown, or JSON with `--json`), exit 0, or exit 1 with the error code on stderr.
2. Further sub-commands: `on-save` (Requirement 11), `gate` (Requirement 12), `install-hooks [dir]` (Requirement 21.5).
3. Every sub-command that audits is wrapped in `try { … } finally { await getPool().close() }` and sets `process.exitCode`; it does not call `process.exit` before output is flushed. A test shows the CLI audit of the Cursed Shop exits within 120 s.
4. With no arguments the binary starts the stdio server.
5. Child processes are spawned with `process.execPath` and an argument array. Command strings are never split on whitespace.

### Requirement 8: Dev URL resolution

1. Order: env `UNSEEN_DEV_URL`; `devServerUrl` in `.unseen/config.json`; the default `http://localhost:5173`. The resolver also reports the source (`env`, `config`, `default`).
2. The resolver is a pure function of `(env, configJson)`. A value that is not an `http(s)` URL is ignored.
3. Only a Dev URL from `env` or `config` is probed by the hooks. The default is documented but never probed, so an unrelated server on 5173 is not audited by accident.
4. README documents the env var, the config key and the default.

### Requirement 9: Fingerprints, turn start and the new-haunting diff

1. `newHauntings(baseline, current)` returns the current primary hauntings whose fingerprint is not in the baseline. It is pure. Renumbering every node id leaves the result unchanged.
2. With no baseline every haunting is new. A missing or corrupt file is an empty baseline, never an error.
3. `.unseen/last-audit.json` holds `{ savedAtMs, targets: { <label>: { score, fingerprints[] } } }`. `.unseen/turn-start.json` has the same shape.
4. `savedAtMs` is passed in by the I/O caller, never read in pure code.

### Requirement 10: Power package

1. `power/` uses the Agent Plugins format: `plugin.json` (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, kebab-case `name` `the-unseen`, `version`, `description`, `author.name`, `keywords` including accessibility, a11y, WCAG, screen reader, button, form, UI, component, HTML, React) and `skills/<skill>/SKILL.md` with `name` and `description` front matter.
2. `power/mcp.json` is exactly: `$schema` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` and `mcpServers.unseen` with `type: "stdio"` and `command: "unseen-mcp"`. No `unseen-local`, no `disabled`, no `autoApprove`. The installed server is named `power-the-unseen-unseen`, and tool calls ask for approval.
3. Skills: `audit-before-done` (audit every UI you build or change before saying the task is done; never ship a Nameless Spirit, Whispering Field or Cursed Loop; fix source, never inject overlays; re-audit after fixing and report before and after), `exorcise`, `install-unseen-hooks` (runs `unseen-mcp install-hooks`). `exorcise-the-cursed-shop` is added in task 8.
4. Powers cannot ship hooks. `power/` has no `hooks/` folder, no `package.json`, no `POWER.md`.
5. `power/README.md` documents install by "Add Custom Power", "Import power from a folder", and by public GitHub URL, the Requirement 21 install route, and the `.gitignore` entry for `.unseen/`.

### Requirement 11: On-save hook

1. `PostFileSave` runs `node .kiro/hooks/scripts/unseen-on-save.mjs`. The CLI resolves dirty files: every UI file under the workspace root (skipping `node_modules`, `.git`, `.unseen`, `.kiro`, `dist`) whose mtime is newer than `lastPassMs` in `.unseen/gate-state.json`; when there is no gate state, files modified in the last 30 minutes.
2. What is audited (Requirement 12.2) and the output: only new hauntings, or `THE UNSEEN: no new hauntings (score N).`
3. It writes `.unseen/turn-start.json` only when the file is absent, and `.unseen/last-audit.json` always.
4. Nothing auditable: one line, `THE UNSEEN: nothing to audit; skipped.`, exit 0. The hook never fails a save.
5. The hook `timeout` is 90 s and the CLI's internal deadline is 75 s. On the deadline it prints one line and exits 0.
6. On-save output reaches the agent only in the Kiro IDE; in the CLI it is informational. The Gate is what feeds hauntings back on both surfaces.

### Requirement 12: The ghost gate (`Stop` hook)

1. The gate reads stdin JSON `{hook_event_name, cwd, session_id}`. Invalid or empty stdin is tolerated. Dirty files are found as in 11.1, so the gate works even if `PostFileSave` does not fire for agent writes. No dirty file: exit 0, silent.
2. Audit targets: if a Dev URL from `env` or `config` is reachable (3 s `HEAD`), audit it with `auditAndClassify`. Otherwise audit each dirty `.html` file (newest first, at most 5) with `auditHtmlAndClassify`. If nothing is auditable, exit 0 with one line.
3. If any critical primary haunting remains, the gate exits **1** and writes the instruction to **stderr** (never exit 2). The instruction is under 3,000 characters, lists at most the top 5 critical hauntings (type, severity, selector, snippet, fix), and ends: "Fix the source, call audit_url (or audit_html) on the same page, and report the before score M and the new score before finishing." (`M` is the number.) The before score comes from `turn-start.json`; if it is absent the gate writes it before blocking.
4. If no critical haunting remains the gate deletes `turn-start.json`, records `lastPassMs`, resets the block counter, prints one line `THE UNSEEN: gate passed (score N, before M).` for the user, and exits 0. Non-critical hauntings are listed but do not block.
5. Gate state `.unseen/gate-state.json` is `{ sessionId, consecutiveBlocks, lastBlockMs, lastPassMs }`. The counter resets when `session_id` changes or after a quiet gap of 10 minutes. After 5 consecutive blocks the gate exits 0 and says it gave up.
6. The decision is the pure function `decideGate`.
7. The Stop hook has `timeout: 150` and an internal deadline of 130 s. Hitting the deadline prints one line and exits 0.
8. Fallback: if the IDE does not start a new turn on a Stop exit 1, `unseen-hooks.json` carries a second Stop entry of type `agent`, disabled by default. `DEMO.md` explains how to switch (costs credits on every turn).

### Requirement 13: Demo and `power/DEMO.md`

1. The demo is deterministic. `power/demo/checkout.html` is a haunted page: `<html lang="en">`, an `<h1>`, a `<main>`, and an icon-only `<button class="checkout">` containing an SVG. By the checkout-context rule this is a Wraith Nameless Spirit.
2. The prompt is exactly: "Add a quantity selector next to the checkout button in checkout.html." Kiro edits the page; the gate audits it and blocks on the existing Nameless Spirit; Kiro fixes the button, re-audits and reports before and after.
3. `DEMO.md` prerequisites, in order: `npx playwright install chromium`; `npm run unseen:install-global`; trust the workspace; import the Power from the folder; run `unseen-mcp install-hooks` and approve the writes; delete `.unseen/`; start a **new** chat session. It lists the tool-approval prompts to expect, a recovery section, and the IDE fallback of 12.8.
4. Scores in `DEMO.md` are computed from the fixture by a test.

### Requirement 14: Exorcise the Cursed Shop

1. The skill `exorcise-the-cursed-shop` and `#exorcise` describe the workflow: audit the Cursed Shop, write a **fixed copy** to `demo/cursed-shop-exorcised/`.
2. The copy has no `package.json` and lies outside the workspace globs. `structure.md` lists the path.
3. `apps/cursed-shop` is never modified (`git diff --exit-code -- apps/cursed-shop` and `npm run verify -w apps/cursed-shop` pass).
4. Re-auditing the copy gives a lower score than the original on each page.

### Requirement 15: Repo hook `web-self-audit-on-save`

1. `.kiro/hooks/web-self-audit-on-save.json` is a `PostFileSave` hook with matcher `apps/web/src/client/.*\.(tsx|ts|css)$`.
2. It runs the self-audit and prints one line: pass with the route count, fail with the count and the first haunting type, or a timeout line. It sets `CI=1` so a fresh build is audited. It never blocks and exits 0.
3. The five existing hooks are not changed.
4. `PostFileSave` fires for Kiro's own edits, not for a manual editor save. The checkpoint asks Kiro to make a whitespace edit.

### Requirement 16: Custom agent `unseen-auditor`

1. `.kiro/agents/unseen-auditor.json` uses the CLI V3 schema (`tools`, `permissions.rules`, `resources`, `mcpServers`), not `allowedTools`, and no `includeMcpJson`.
2. Rules: allow `fs_read`; allow capability `mcp` for `unseen/audit_url`, `unseen/audit_html`, `unseen/explain_haunting`, `unseen/suggest_fix`; deny `fs_write` on `**`; deny `shell`. `includePowers: false`.
3. The prompt tells it to audit, then post a short Markdown summary with the score, critical hauntings and the coverage caveat. It never edits files.

### Requirement 17: Enable THE UNSEEN on itself

1. Kiro cannot write `.kiro/settings/`. After tasks 1 to 8 and a stdio smoke test, the builder prints the exact `unseen` entry for `.kiro/settings/mcp.json` and the product lead applies it.
2. The entry has `"disabled": false`, `args: ["packages/mcp/dist/server.js"]` and `autoApprove` for the four tools.

### Requirement 18: Honesty and safety

1. No tool output, summary, DEMO text or skill text makes a claim matching `/\b(is|are|now|fully)\s+(accessible|compliant)\b|passes WCAG|WCAG compliant/i`. Reports carry the 30 to 40% caveat.
2. `audit_url` accepts private and `localhost` URLs only because the server is local. The hosted app never imports `packages/mcp`.
3. No code patches another site's DOM at runtime.

### Requirement 19: Housekeeping

1. `docs/LIVE_VERIFICATION_RESULTS.md` line `**Date:** 2025-01-31` becomes `**Date:** 2026-11-24`. Nothing else in that file changes.

### Requirement 20: Tests

1. Property tests (fast-check, at least 100 runs) are mandatory for: summary, baseline, critical, errors, fix variants, dev URL, gate decision, speech example, selector.
2. Every tool is called through an in-memory MCP client against the Cursed Shop served locally.
3. The summary for `checkout.html` is snapshot-tested.
4. Hook scripts and shims are tested, including a path that contains a space, and a real end-to-end gate check (Requirement 21.6).
5. `packages/mcp/vitest.config.ts`: `testTimeout` 180000, `hookTimeout` 60000, single thread; the browser pool is closed in `afterAll`. Core is built before the mcp typecheck.
6. Only `packages/core/src/index.test.ts` may change in core's tests: new export names appended to the expected list, no removals.

### Requirement 21: Install route (no npm publish)

1. Root script `npm run unseen:install-global` runs `npm pack` for `@the-unseen/core` and `@the-unseen/mcp`, then `npm i -g` on both tarballs. Nothing is published. `private` is dropped from a package only if packing requires it (recorded in Notes).
2. The global bin is `unseen-mcp`.
3. Core exports `WCAG_BY_TYPE` and `SOUND_CUE_BY_TYPE`, used by the detectors, with unchanged behaviour. Core gains `auditHtmlAndClassify` in `audit.ts`.
4. `power/mcp.json` follows Requirement 10.2.
5. `unseen-mcp install-hooks [dir]` writes into the target workspace (default `cwd`): `.kiro/hooks/unseen-hooks.json`, `.kiro/hooks/scripts/unseen-on-save.mjs`, `.kiro/hooks/scripts/unseen-gate.mjs`. The shims call the server by absolute path (`process.execPath` plus the resolved `server.js`), so no PATH or `npx` lookup is needed. The `install-unseen-hooks` skill runs this command.
6. Acceptance for the gate (integration test, not stubbed): copy `power/demo/checkout.html` into a temp workspace and run `install-hooks` there; touch the file and pipe a Stop payload into the installed gate shim, which must exit 1 with the Nameless Spirit on stderr; fix the button in the temp copy, touch it, run the gate again, which must exit 0 and print the before and after scores.
