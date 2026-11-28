# Kiro feature map (for the write-up and judging)

The Devpost "How Kiro was used" write-up asks about each Kiro surface, and the Technological Implementation criterion rewards "a variety of Kiro tools used impactfully … deep understanding … experimentation". This file maps each question to where THE UNSEEN uses that surface, with evidence in the repo. Status is as of 2026-11-24 and is updated as runs land.

| Write-up question | How THE UNSEEN uses it | Evidence | Status |
|---|---|---|---|
| **Kiro IDE, CLI, Web, Crew: how did they differ?** | **CLI V3 headless:** the main build engine, driven by Claude Code at our direction (it drafted and ran each instruction), with parallel runs in separate Terminal tabs. **IDE:** Specs panel and hooks firing on agent file saves, used for the UI build and the demo. **Crew:** Night Shift (separate repo). | `KIRO_SESSION_LOG.md` (every command), `prompts/`, `night-shift` repo | CLI ✅ · IDE ⏳ · Crew ⏳ |
| **Custom agents** | `unseen-builder` (implementation; denies git writes), `unseen-spec-writer` (no shell), `unseen-reviewer` (read-only), `unseen-auditor` (MCP-only, for CI) | `.kiro/agents/*.json` | ⏳ run 27, then run 15 |
| **Agent hooks** | **PreToolUse guard:** Kiro cannot edit the golden file or our planning docs, so it cannot cheat the golden test. **PostFileSave:** typecheck and shop verify. **Stop:** test gate. **Spec design save:** types-drift agent check. **App self-audit hook (UI build):** the app audits itself on every save. | `.kiro/hooks/*.json`, `.kiro/hooks/scripts/` | ⏳ run 27 |
| **Spec-driven development vs vibe coding** | Specs:<br>- `audit-engine`: requirements-first<br>- `haunting-classifier`: requirements-first, reviewed twice and synced (run 20/23)<br>- `safe-fetch`: **Kiro chose the bugfix workflow**, writing exploratory tests that prove each bug before fixing it<br>- `spirit-sight-ui` and `unseen-mcp-and-power`<br><br>**Vibe:** the Cursed Shop (run 05) looked done but failed verification on almost every point; the spec-driven engine passed on first verification. | `.kiro/specs/*`, log runs 03–05, 12–13, 20, 23 | ✅ |
| **Steering docs** | All four inclusion modes:<br>- `always`: product, tech, structure, hauntings, security, kiro-workflow<br>- `fileMatch`: design-system for `apps/web/**`, testing for test files<br>- `auto`: wcag-reference<br>- `manual`: `#exorcise`<br><br>**Biggest win:** `hauntings.md` as the single source of truth, refined in two of our reviews, so every spec and detector follows one rulebook. The `kiro-workflow.md` steering also cut repeated prompt boilerplate ("never end with a menu"). | `.kiro/steering/*.md` | ✅ (4 new files ⏳ run 27) |
| **MCP** | **Playwright MCP:** Kiro looks at the UI it builds. **unseen-mcp (our product):** Kiro audits its own UI with THE UNSEEN, the dogfooding loop. | `.kiro/settings/mcp.json`, `packages/mcp` | ⏳ run 27, run 15 |
| **Property-based testing** | fast-check across:<br>- the tab walker: termination, segmenting, step cap<br>- box normalisation<br>- score invariants (6)<br>- contrast<br>- speech<br>- classifier totality and purity<br>- SSRF encodings (≥ 200 runs)<br><br>**PBT and regression tests caught:** the walker's composite and iframe false traps; tests that passed vacuously, found by mutation testing during review. | `packages/core/src/**/*.test.ts` | ✅ engine · ⏳ classifier, SSRF |
| **Kiro powers** | **"The Unseen" Power** (Agent Plugins format: `plugin.json`, `mcp.json`, skills) bundles unseen-mcp and the accessibility workflow, so any Kiro user's agent audits and fixes every UI it builds. | `power/` | ⏳ run 15 |

## Agent-assisted development (our experiment)
We direct the project. Claude Code is our **planning assistant and independent verifier**: it drafts instructions, reviews every spec with multi-agent review workflows (adversarial verifiers, mutation-testing of Kiro's regression tests), and logs everything. **Kiro is the builder of record.**

Measured outcomes so far:
- **Pre-implementation reviews:** 49 classifier-spec defects, 80 spec contradictions and 30 safe-fetch spec defects were caught before any code was written.
- **Engine review:** 47 confirmed findings in the Claude Code-written engine code (tasks 5–16); Kiro fixed 46 and showed the last was no longer a defect, with all regression tests verified meaningful.

## "Kiro surprised us" moments (for the write-up)
1. **Spec mode stops at its approval gate, even headless.** It asked "Requirements or Technical Design?" and waited for approval. That is a human-in-the-loop checkpoint that survives automation (run 12).
2. **Kiro chose the bugfix spec workflow on its own for safe-fetch.** It writes tests that prove each bug exists first (run 13).
3. **Kiro flagged an unreported defect and asked before widening scope:** the bounding-box pairing (run 22, "Decisions for you").
4. **Kiro built its own tracking document,** `REVIEW_RESOLUTION.md`, mapping 49 findings to fixes (run 20).
5. **`--resume` refused to hijack a session another Kiro process owned** (`SessionHeldElsewhereError`). This kept two parallel runs safe (run 23).
6. **Kiro fixed by file rather than by number,** and said why: the shared tab-walker rewrite (run 19).
