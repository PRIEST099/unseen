# Design: unseen-mcp-and-power

## Overview

`packages/mcp` is a thin wrapper over `@the-unseen/core`. It validates input, calls Core, and formats results. Pure modules (formatting, diffing, gating, error mapping, fix templates) are separated from I/O so they can be property-tested. The Power and the hooks reach the same code through CLI sub-commands of the `unseen-mcp` binary.

```
Kiro agent ──MCP stdio──▶ unseen-mcp (tools) ──▶ @the-unseen/core
Kiro hooks ──shim (node <abs server.js> <sub>)──▶ unseen-mcp on-save | gate ──▶ core
                                   └─ .unseen/ in the workspace root taken from hook stdin `cwd`
```

## Install route (D2, no npm publish)

- `npm run unseen:install-global` (root script `scripts/install-global.mjs`): `npm pack` in `packages/core` and `packages/mcp` into a temp dir, then one `npm i -g <core.tgz> <mcp.tgz>`. Spawns use `process.execPath`/`npm_execpath` style argument arrays; on Windows `npm.cmd` is run through `cmd.exe /c` with an argument array, never a split string.
- `@the-unseen/core` is `private` today. `npm pack` works on private packages, so `private` stays. Recorded in Notes after the pack run.
- The global bin is `unseen-mcp`. `power/mcp.json` has the single server `unseen` with `command: "unseen-mcp"`.
- Hooks in other workspaces: `unseen-mcp install-hooks [dir]` writes `.kiro/hooks/unseen-hooks.json`, `.kiro/hooks/scripts/unseen-on-save.mjs` and `.kiro/hooks/scripts/unseen-gate.mjs`. Each shim is a 15-line ESM file with the absolute `process.execPath` and `server.js` baked in as JSON string literals; it runs `spawnSync(execPath, [serverJs, sub], { stdio: ['inherit','inherit','inherit'] })` and forwards the exit status. Powers cannot ship hooks, so there is no `power/hooks/`.

## Reuse of Core

| Need | Core symbol | Where used |
|------|------------|-----------|
| Audit and classify a URL | `auditAndClassify(url, { allowPrivate: true })` | `audit_url`, CLI |
| Audit and classify HTML | `auditHtmlAndClassify(html, options)` (new, `audit.ts`, mirrors `auditAndClassify`) | `audit_html`, gate for `.html` files |
| Speech | `announce` | `explain_haunting` speech example |
| Catalogue | `generateExplanation`, `generatePersona`, `generateFix`, `HAUNTING_TYPES`, `WCAG_BY_TYPE`, `SOUND_CUE_BY_TYPE`, `ALL_WCAG` | `explain_haunting`, `suggest_fix` |
| Errors | the Core error classes | error mapper |
| Pool | `getPool().close()` | CLI `finally` |

All additions to `packages/core/src/index.ts` are additive and are appended to the expected list in `index.test.ts`. `WCAG_BY_TYPE` and `SOUND_CUE_BY_TYPE` live in `classifier/wcag.ts` and the detectors read them; the core tests stay green with no other edit.

## Package layout (`packages/mcp`)

```
src/
├── server.ts          # shebang entry: stdio server, or CLI when argv[2] is a sub-command
├── cli.ts             # sub-command dispatch with try/finally pool close
├── types.ts           # Zod schemas
├── tools/{audit-url,audit-html,explain,suggest-fix}.ts
├── pure/              # no I/O, no clock, no randomness
│   ├── summary.ts  selector.ts  critical.ts  baseline.ts  gate.ts  dev-url.ts  errors.ts
│   ├── fix-variants.ts  speech-example.ts  gate-message.ts
├── session.ts         # in-memory Map<haunting id, Haunting> (last 5 audits)
├── workspace.ts       # reads/writes .unseen/* for the CLI only
├── dirty.ts           # finds dirty UI files by mtime (I/O)
├── hooks-cli.ts       # on-save and gate sub-commands
└── install-hooks.ts   # writes the hook files
```

`pure/` imports only types and Core's pure exports (checked by a test over import specifiers).

## Tool contracts

```typescript
type AuditToolResult = {
  url: string; score: number
  countsByType: Record<HauntingType, number>
  detectedCountsByType: Record<HauntingType, number>
  hauntings: ToolHaunting[]            // top 10, ordered
  truncated: boolean
  needsManualCheckCount: number
  automatedCoverageNote: string
  summary: string
  classified?: Omit<ClassifiedAudit, 'raw'> & { raw: Omit<RawAudit, 'screenshotPng'> }  // page: 'full'
}
type ToolHaunting = { id; type; severity; wcag: {id, url}[]; selector; htmlSnippet; fix: HauntingFix }
```

**Selector.** `selectorFor(haunting, raw)`: first `raw.axeViolations[*].nodes[*]` whose `backendDOMNodeId` is not null and is in `haunting.nodeIds` gives its `target` joined by a space. Else tag, `#id` and `.class` tokens parsed from the opening tag of `htmlSnippet`. Else the literal `(see htmlSnippet)`.

**Summary.** Deterministic Markdown (no clocks): heading with URL, score line, one block per top haunting (severity, type, selector, snippet, fix), "+N more", coverage note, and the sentence "Fix the source, then call audit_url again and report the before/after score." It makes no compliance claim (pattern in Requirement 18.1).

**Sessions.** `audit_url` and `audit_html` record every primary and secondary haunting by id in a bounded map (5 audits). A new process starts empty.

**Explain / suggest_fix.** As in Requirements 4 and 5. `speech-example.ts` builds a `syntheticRaw()` (a complete `RawAudit` with empty collections) plus one synthetic `AXNode` per speech type and calls `announce`. `fix-variants.ts`: `react` rewrites `class`, `for`, `tabindex`, `readonly`-style attributes to JSX names; `vue` wraps in `<template>`. A forbidden-token guard runs in the handler.

**Errors.** `toToolError(error: unknown)` with fixed messages per code, never the URL or error text.

## Fingerprints, turn start, and dirty detection

- `fingerprints(hauntings)`: for each primary haunting `${type}|${kind ?? ''}|${htmlSnippet}`, with `#n` appended where n is the occurrence index of an identical key. Renumbering node ids does not change it.
- `.unseen/last-audit.json` and `turn-start.json`: `{ savedAtMs, targets: { label: { score, fingerprints[] } } }`. A target label is the dev URL or the file path relative to the workspace root.
- **On-save** writes `turn-start.json` only if absent, `last-audit.json` always. The **gate** reads "before" from `turn-start.json` (writing it first if absent), deletes it on pass.
- **Dirty files** (`dirty.ts`): walk the workspace root (skip `node_modules`, `.git`, `.unseen`, `.kiro`, `dist`), keep files with a UI extension and `mtimeMs > lastPassMs`. With no gate state the threshold is `now - 30 min`. The walk is capped (20,000 entries) so a large tree cannot stall the hook.
- **Targets**: dev URL if its source is env or config and a 3 s `HEAD` succeeds; otherwise each dirty `.html` file (newest first, at most 5) through `auditHtmlAndClassify(readFile)`. If neither applies the result is `skip`.

## Gate

```typescript
type GateInput = { anyDirty: boolean; auditable: boolean; criticalCount: number
                   consecutiveBlocks: number; sessionChanged: boolean }
type GateAction = 'skip' | 'pass' | 'block' | 'gave-up'
// skip: !anyDirty or !auditable. blocks = sessionChanged ? 0 : consecutiveBlocks.
// pass: criticalCount = 0. gave-up: criticalCount > 0 and blocks >= 5. block: otherwise.
```

`isCritical(h) = h.severity === 'Wraith' || h.type in {NamelessSpirit, WhisperingField, CursedLoop}`; the gate counts primary hauntings only.

**Mechanism (D1, settled from the docs).** The Stop hook gets stdin JSON `{hook_event_name, cwd, session_id}`. To keep the agent working it exits **1** and writes the instruction to **stderr**. Exit 2 drops the output, so it is never used. The instruction is under 3,000 characters (top 5 critical hauntings, `gate-message.ts` truncates) and ends with the report sentence. A pass exits 0 and prints one line for the user. The agent gets the before/after instruction in the blocking turn, because a passing Stop ends the turn.

**IDE fallback.** `unseen-hooks.json` has a second Stop entry of type `agent` with `"enabled": false`: its prompt runs the gate shim and tells the agent to fix listed hauntings and report before and after. It costs credits each turn and is enabled by hand (`DEMO.md`). The exact field names for the disabled entry are not verifiable offline; this is recorded as a risk.

**Timeouts.** PostFileSave `timeout: 90`, internal deadline 75 s. Stop `timeout: 150`, internal deadline 130 s. Deadlines are an `AbortSignal`-style race in `hooks-cli.ts`; on expiry the CLI prints one line, closes the pool and exits 0.

**Process hygiene.** Each sub-command: `try { … } finally { await getPool().close() }`, `process.exitCode = n`.

## Power layout

```
power/
├── plugin.json
├── mcp.json                # $schema + mcpServers.unseen {type: stdio, command: unseen-mcp}
├── README.md  DEMO.md
├── demo/checkout.html
└── skills/{audit-before-done,exorcise,install-unseen-hooks}/SKILL.md   (+ exorcise-the-cursed-shop in task 8)
```

## Demo flow (`power/DEMO.md`)

Deterministic (D5). The workspace starts with the haunted `checkout.html` (copied from `power/demo/`). Prompt: "Add a quantity selector next to the checkout button in checkout.html." Kiro edits the page. The gate dirty-scans, audits the file, blocks on the pre-existing Wraith Nameless Spirit. Kiro fixes the button, calls `audit_html`, reports before and after. Kiro ends its turn, the gate passes and prints `gate passed (score N, before M)`. Recording note: the install route needs no npm account; expect approval prompts for the `.kiro/hooks` writes, each `unseen` tool call (`power-the-unseen-unseen`), and the hook trust prompt.

## Exorcise the Cursed Shop

As before: copy to `demo/cursed-shop-exorcised/`, fix the copy. Guard: `git diff --exit-code -- apps/cursed-shop` and `npm run verify -w apps/cursed-shop`, plus absence of `demo/cursed-shop-exorcised/package.json`.

## Repo hook `web-self-audit-on-save`

Runs `apps/web/e2e/self-audit.spec.ts` through `.kiro/hooks/scripts/web-self-audit.mjs` with `CI=1`, spawning with `process.execPath`-based argument arrays (Playwright's `cli.js` resolved from `apps/web`), 30 s debounce via `.unseen/web-self-audit.lock` (`.unseen/` is gitignored), 170 s timeout, one output line, exit 0. Justification kept: only the self-audit finds hauntings in rendered output; a jsdom test cannot compute the accessibility tree or run the Tab walk.

## Agent `unseen-auditor`

As in Requirement 16, with the `mcp` allow rule and `includePowers: false`.

## Correctness properties

| # | Property | Module |
|---|----------|--------|
| P1 | `newHauntings(b, c) ⊆ c` by fingerprint; none of its fingerprints is in `b`; `newHauntings(fp(c), c) = []`; `newHauntings([], c) = c`; renumbering all node ids leaves the result unchanged | baseline |
| P2 | Order of baseline fingerprints does not change the result; the result keeps current's order | baseline |
| P3 | `parseBaseline` never throws; any string yields a valid, possibly empty, baseline | baseline |
| P4 | Every Wraith is critical; every non-Wraith is critical iff its type is one of the three | critical |
| P5 | `decideGate` is total; `¬anyDirty → skip`; `anyDirty ∧ ¬auditable → skip`; `auditable ∧ critical = 0 → pass`; `critical > 0 ∧ blocks ≥ 5 → gave-up` where blocks is 0 when `sessionChanged`; otherwise `block` | gate |
| P6 | `toToolError` is total, returns a listed code, and the message contains none of the input's URL, IP or stack text | errors |
| P7 | For arbitrary attribute-bearing snippets (class, for, tabindex, aria-*, void elements) without forbidden tokens: every framework output has no forbidden token, is non-empty; `react` output has no ` class=` or ` for=`, keeps every `aria-*` attribute | fix-variants |
| P8 | Summary has the coverage note, no match for the claim pattern, at most 10 hauntings in non-increasing severity order, and is identical for identical input | summary |
| P9 | `resolveDevUrl` returns env if valid, else config if valid, else the default, with the matching source; always an `http(s)` URL | dev-url |
| P10 | For each type, `speechExample(type)` contains the `hauntings.md` role label (NamelessSpirit `button`, HollowPortrait `unlabelled graphic`, WhisperingField `blank`, …) and is `null` for the five silent types | speech-example |
| P11 | `selectorFor` returns either an axe target joined by a space taken from `raw.axeViolations`, or a string built only from tag, id and class tokens present in `htmlSnippet`, or exactly `(see htmlSnippet)` | selector |
| P12 | `gateMessage` is under 3,000 characters for any input, lists at most 5 hauntings, and ends with the report sentence | gate-message |

## Risks

- **IDE Stop semantics** are documented but unobserved here: if the IDE does not start a new turn on exit 1, switch to the disabled `agent` Stop entry. Rehearsal is a manual step the product lead records.
- **PostFileSave for agent writes** may not fire; the gate does not depend on it (mtime scan).
- **Windows**: spawn with `process.execPath` and argument arrays; `npm.cmd` only through `cmd.exe /c` with an argument array. This repo's path contains a space, and a test uses a path with a space.
- **Global install of two tarballs**: `@the-unseen/mcp` depends on `@the-unseen/core@0.1.0`, which is not on a registry. Both tarballs are installed in one `npm i -g` command; if npm still resolves from the registry the script falls back to installing core first. Recorded in Notes after the run.
- **Shared Chromium**: `UNSEEN_CHROMIUM_CHANNEL=chromium` on this host; the shims forward the environment.
