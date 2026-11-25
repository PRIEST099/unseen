# Design: unseen-mcp-and-power

## Overview

`packages/mcp` is a thin wrapper over `@the-unseen/core`. It validates input, calls Core, and formats results. Pure modules (formatting, diffing, gating, error mapping, fix templates) are separated from I/O so they can be property-tested. The Power and the hooks reach the same code through the `unseen-mcp audit` CLI mode, so a consumer workspace needs only `npx`.

```
Kiro agent ──MCP stdio──▶ unseen-mcp (tools) ──▶ @the-unseen/core
Kiro hooks ──command────▶ unseen-mcp audit <url> ─┘            (auditAndClassify, Permissive policy)
                            │
                            └─ .unseen/ (baseline, ui-dirty marker, gate state) in the workspace
```

## Reuse of Core (no duplicated logic)

| Need | Core symbol | Where used |
|------|------------|-----------|
| Audit and classify a URL | `auditAndClassify(url, { allowPrivate: true })` | `audit_url`, CLI |
| Audit HTML | `auditHtml(html, options)` then classify via the same path Core uses | `audit_html` |
| Policies | `PermissiveSafeFetchPolicy` (MCP), `RestrictiveSafeFetchPolicy` (never used here) | `audit_url` |
| Speech | `buildSpeechTrack`, `announce` | `explain_haunting` speech example |
| Haunting catalogue | `generateExplanation`, `generatePersona`, `generateFix` in `packages/core/src/classifier/explanation.ts`; WCAG constants in `packages/core/src/classifier/wcag.ts`; `HAUNTING_TYPES` in `classifier/types.ts` | `explain_haunting`, `suggest_fix` |
| Errors | `SsrfBlockedError`, `AuditTimeoutError`, `AuditResourceLimitError`, `NonHtmlContentError` (`packages/core/src/types.ts`) | error mapper |

`packages/core/src/index.ts` today exports `auditAndClassify`, `auditUrl`, `auditHtml`, `buildSpeechTrack`, the two policies and error classes. Task 1.1 adds named exports (additive, logged in the audit-engine notes) for `generateExplanation`, `generatePersona`, `generateFix`, `announce`, `HAUNTING_TYPES` and the `Haunting`, `ClassifiedAudit`, `HauntingType` types. `apps/web` already reads the same catalogue through the `haunting.explanation/persona/fix` fields; MCP does the same, so the web dialog and the MCP tools say the same thing.

Decision: **`auditHtml`** returns `RawAudit`. If Core has no exported classify entry point for it, task 1.1 exports the existing `classify(raw)` by name instead of reimplementing it.

## Package layout (`packages/mcp`)

```
src/
├── server.ts          # shebang entry: stdio server, or CLI mode when argv[2] === 'audit'
├── types.ts           # Zod input schemas and output types
├── tools/
│   ├── audit-url.ts   # handler: validate → core → format → baseline write
│   ├── audit-html.ts
│   ├── explain.ts
│   └── suggest-fix.ts
├── pure/              # no I/O, no Date.now(), no Math.random()
│   ├── summary.ts     # ClassifiedAudit → AuditToolResult + Markdown
│   ├── selector.ts    # haunting + raw → selector string
│   ├── critical.ts    # isCritical(haunting)
│   ├── baseline.ts    # newHauntings(baseline, current), parseBaseline(text)
│   ├── gate.ts        # decideGate(...)
│   ├── dev-url.ts     # resolveDevUrl(env, config)
│   ├── errors.ts      # toToolError(error: unknown): { code, message }
│   ├── fix-variants.ts# html/react/vue fix text from Core's HauntingFix
│   └── speech-example.ts # per-type synthetic AX node → Core announce
├── session.ts         # in-memory Map<haunting id, Haunting> (last 5 audits)
└── workspace.ts       # reads/writes .unseen/* (I/O)
tests/
├── arbitraries/       # haunting.ts, classified-audit.ts, baseline.ts
├── helpers/shop-server.ts   # serves apps/cursed-shop on an ephemeral port
└── tools.int.test.ts  # in-memory client against the shop
```

The structure rule says nothing in `classifier/` may import `runner/`; here the analogous rule is that `pure/` imports only types and Core's pure exports (checked by a test over import specifiers). `session.ts` and `workspace.ts` hold all state and I/O.

## Tool contracts

```typescript
type AuditToolResult = {
  url: string; score: number
  countsByType: Record<HauntingType, number>
  detectedCountsByType: Record<HauntingType, number>
  hauntings: ToolHaunting[]            // top 10, ordered
  truncated: boolean                   // more than 10 primary hauntings exist
  needsManualCheckCount: number
  automatedCoverageNote: string
  summary: string                      // Markdown for an agent
  classified?: Omit<ClassifiedAudit, 'raw'> & { raw: Omit<RawAudit, 'screenshotPng'> }  // page: 'full'
}
type ToolHaunting = {
  id: string; type: HauntingType; severity: HauntingSeverity
  wcag: { id: string; url: string }[]
  selector: string; htmlSnippet: string; fix: HauntingFix
}
```

**Selector.** `Haunting` has no selector field. `selectorFor(haunting, raw)` looks for an axe node (`raw.axe` results) whose `backendDOMNodeId` is in `haunting.nodeIds` and returns its `target` joined with ` `. If none, it parses the opening tag of `htmlSnippet` into `tag#id.class`, else `"(see htmlSnippet)"`. No Core change.

**Summary Markdown** (deterministic; no timestamps or durations):

```
# THE UNSEEN audit: <url>
Haunting score: 41/100 (lower is better). Hauntings: 7 (Wraith 2, Restless 3, Banished 2).

## 👻 Wraith: Nameless Spirit
- selector: `button.pay`
- html: `<button class="pay"><svg…></button>`
- fix: <instruction> 

…
Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.
Fix the source, then call audit_url again and report the before/after score.
```

The formatter never writes "compliant", "accessible" or "passes". Hauntings beyond 10 are summarised as "+N more".

**Sessions.** `audit_url` and `audit_html` record every primary haunting and secondary by `id` in a bounded map (5 audits). `explain_haunting {id}` and `suggest_fix` read it. A new process has an empty map, so a hook run cannot be followed by `suggest_fix` for the same id unless the agent re-audits; the Markdown summary therefore carries each fix inline.

**Explain.** `{type}`: `generateExplanation(type)`, `generatePersona(type)`, `generateFix(type)`, WCAG list from `wcag.ts`, severity text from a small table that quotes `hauntings.md` ("Severity: which hauntings can block a task"). Speech example: `speech-example.ts` holds one synthetic `AXNode` per type that has speech (e.g. `button` with empty name) and calls Core `announce`, so the strings come from Core.

**suggest_fix.** `fix-variants.ts` transforms the `HauntingFix.codeSnippet`:
- `html`: unchanged.
- `react`: `class`→`className`, `for`→`htmlFor`, self-closing void elements, `tabindex`→`tabIndex`, `aria-*` unchanged.
- `vue`: wraps the snippet in `<template>…</template>`, keeps attributes as is, and uses `:aria-label` only when the snippet marks a dynamic label.

A forbidden-token check runs on every output in the handler as a final guard and returns `AUDIT_FAILED` with a stderr log if it ever trips; the property test makes sure it never does.

**Errors.** `toToolError(error: unknown)` uses `instanceof` on the Core classes. Messages are fixed strings per code ("The URL points to a blocked address.", "The audit took too long.", "The URL did not return HTML."), never the URL or error text.

## Baseline and gate

`.unseen/` is added to the Power's documented `.gitignore` suggestion.

- `.unseen/last-audit.json`: `{ url, score, ids, savedAtMs }`. Written by every `audit_url` and CLI audit. `newHauntings` is a set difference on ids. Haunting ids are stable hashes (type + node id + kind), so the diff is meaningful between audits of the same page build.
- `.unseen/ui-dirty`: empty marker file.
- `.unseen/gate-state.json`: `{ consecutiveBlocks }`.

```typescript
type GateInput = { markerPresent: boolean; reachable: boolean; criticalCount: number; consecutiveBlocks: number }
type GateDecision = { action: 'skip' | 'pass' | 'unreachable' | 'block' | 'gave-up' }
// skip: no marker. unreachable: marker, server down. pass: criticalCount 0.
// gave-up: criticalCount > 0 and consecutiveBlocks >= 5. block: otherwise.
```

`isCritical(h) = h.severity === 'Wraith' || h.type in {NamelessSpirit, WhisperingField, CursedLoop}`. This is stricter than "Wraith only" on purpose: the steering says these three never ship, even outside a form. The gate considers only primary hauntings (secondaries are unscored by the precedence rules).

**Reachability.** The CLI distinguishes "server down" (connection refused, DNS failure for the Dev URL) from other failures by a pre-flight `fetch(url, { method: 'HEAD' })` with a 3 s timeout. Any failure there is `unreachable`; this is I/O in the hook script, not in `pure/`.

**Hook scripts** live in `power/hooks/scripts/` (ESM, no dependencies): `on-save.mjs`, `gate.mjs`. Each script is a shim that runs `npx -y @the-unseen/mcp on-save` or `… gate` (or the command in `UNSEEN_MCP_CMD`, for tests and local development) and forwards its stdout, stderr and exit code. The CLI sub-commands `on-save` and `gate` read the Dev URL, the Baseline and the marker, call the audit handler, and apply `newHauntings` and `decideGate`. All logic therefore stays in `packages/mcp`, where it is tested, and the scripts import nothing from the repo.

**Stop-hook semantics.** The brief says Stop hooks run when the agent finishes; the existing `stop-test-gate.mjs` always exits 0 as informational. The Gate needs a blocking exit. Task 3.1 first reads the Kiro hooks documentation and picks:
1. If a Stop hook's non-zero exit (conventionally 2) returns stderr to the agent and keeps the turn open: use it. The Gate prints to stderr and exits 2.
2. Otherwise: the closest documented mechanism, either an `agent`-type Stop hook whose prompt tells Kiro to run the audit and continue, or a `PostToolUse` hook that prints the haunting list into the agent's context after each UI write, plus the steering rule. The deviation is logged in `tasks.md` Notes.

**Hooks as files.** The Power ships `power/hooks/unseen-hooks.json` in the `.kiro/hooks` v1 format (`PostFileSave` with matcher `.*\.(html|tsx|jsx|vue|svelte|css)$`, and `Stop`). `install-unseen-hooks` copies it and `power/hooks/scripts/` into the workspace.

## Power layout

```
power/
├── plugin.json
├── mcp.json                # unseen (npx), unseen-local (node packages/mcp/dist/server.js)
├── README.md               # install paths, UNSEEN_DEV_URL, .unseen/
├── DEMO.md
├── demo/checkout-start.html
├── skills/
│   ├── audit-before-done/SKILL.md
│   ├── exorcise/SKILL.md
│   ├── exorcise-the-cursed-shop/SKILL.md
│   └── install-unseen-hooks/SKILL.md
└── hooks/
    ├── unseen-hooks.json
    └── scripts/{on-save.mjs,gate.mjs}
```

The `audit-before-done` skill's `description` carries the activation keywords so Kiro loads it for UI work. Its text includes the exact rule: "Audit every UI you build or change before saying the task is done." Kiro still follows hook output even if the skill is not loaded, so the gate does not depend on activation.

## Demo flow (`power/DEMO.md`)

1. Fresh workspace, Power imported, dev server running on 5173 with `checkout-start.html`.
2. Prompt: "build a checkout button".
3. Kiro writes a button with only an SVG icon. `PostFileSave` prints: `THE UNSEEN: 1 new haunting: Nameless Spirit (Wraith) on button.pay`.
4. Kiro tries to finish. The Gate re-audits, finds a critical haunting, exits 2 with the details.
5. Kiro adds `aria-label="Checkout"` (or visible text), the gate re-audits, passes: `gate passed (score 3, before 15)`.
6. Kiro reports the before and after scores. Score numbers in DEMO.md are computed from the fixture by a test, not typed by hand.

## Exorcise the Cursed Shop

The skill copies `apps/cursed-shop/{index,product,checkout}.html` and `img/` into `demo/cursed-shop-exorcised/`, fixes the copy in source, serves it, and audits both. The original is never opened for writing. Guard test: after the workflow's scripted dry run in tests, `apps/cursed-shop` is byte-identical (hash comparison) and `demo/cursed-shop-exorcised/package.json` does not exist. `exorcise.md` steering gets a short section pointing at this path.

## Repo hook: `web-self-audit-on-save`

Choice: run `apps/web/e2e/self-audit.spec.ts` through a script (`.kiro/hooks/scripts/web-self-audit.mjs`) with `npx playwright test e2e/self-audit.spec.ts --reporter=line` in `apps/web`, 170 s timeout, and print one line.

Why not a faster unit-level equivalent: the self-audit is the only check that finds hauntings in rendered output (focus, accessible names, contrast on real pixels). A jsdom test cannot compute the accessibility tree or run the Tab walk, so it would miss what the hook exists to catch. Cost is mitigated by a debounce: if a run started under 30 s ago (`.unseen/web-self-audit.lock`, in the repo's untracked area), the hook prints `web self-audit: skipped (recent run)` and exits 0. The hook always exits 0.

## Agent `unseen-auditor`

Same JSON shape as `unseen-reviewer.json`, but with `mcpServers.unseen` inline (command `node`, args `packages/mcp/dist/server.js`, or `npx -y @the-unseen/mcp` in CI), `tools: ["read", "@unseen"]`, rules: allow `fs_read`; deny `fs_write` on `**`; deny `shell`. No `includeMcpJson`, so the Playwright MCP is not exposed.

## Correctness properties

| # | Property | Module |
|---|----------|--------|
| P1 | `newHauntings(b, c) ⊆ c`, no element's id is in `b`, `newHauntings(b, b-as-current) = []`, `newHauntings([], c) = c` | baseline |
| P2 | Order of baseline ids does not change the result; result keeps current's order | baseline |
| P3 | `parseBaseline` never throws; any string yields a valid (possibly empty) baseline | baseline |
| P4 | Every Wraith is critical; every non-Wraith is critical iff its type is in the three-type set | critical |
| P5 | `decideGate` is total, `criticalCount = 0 ∧ marker ∧ reachable → pass`, `¬marker → skip`, `consecutiveBlocks ≥ 5 ∧ critical>0 → gave-up`, never `block` when unreachable | gate |
| P6 | `toToolError` is total, returns a code from the fixed list, and the message contains none of the input's URL, IP or stack text | errors |
| P7 | For every `HauntingType × framework`, `suggest_fix` output has none of the forbidden tokens, is non-empty, and `react` output has no `class=` or `for=` attribute | fix-variants |
| P8 | Summary contains the coverage note, contains no "compliant"/"accessible"/"passes", lists ≤10 hauntings in non-increasing severity order, and is identical for identical input | summary |
| P9 | `resolveDevUrl` returns the env value if valid, else the config value if valid, else the default; always an `http(s)` URL | dev-url |
| P10 | `speechExample(type)` equals Core `announce` of the synthetic node, and contains the role label from `hauntings.md` | speech-example |
| P11 | `selectorFor` returns a non-empty string and never a string absent from `raw` axe targets and `htmlSnippet` | selector |

Integration tests (in-memory MCP client, Cursed Shop served locally): tool list is exactly four; `audit_url` on `checkout.html` returns hauntings and the snapshot summary; `audit_html` on an icon-only button returns a Wraith Nameless Spirit; `explain_haunting` by type and by id; `suggest_fix` in all three frameworks; `file:///` and a non-HTML URL give `SSRF_BLOCKED`/`NOT_HTML`-class errors (Permissive still rejects non-http schemes); a stub-script test for hooks.

## Risks

- **Stop-hook semantics** are unverified until task 3.1; the fallback is defined above.
- **Gate loop**: bounded by the 5-block guard.
- **`npx -y` startup latency** in the on-save hook: the first call downloads the package. The hook timeout is 90 s, and DEMO.md says to run a warm-up audit before recording.
- **Agent Plugins hook support** is unknown; `install-unseen-hooks` is the guaranteed route.
- **Shared Chromium**: on Windows the audit needs `UNSEEN_CHROMIUM_CHANNEL=chromium`; the CLI forwards the env and DEMO.md documents it.
