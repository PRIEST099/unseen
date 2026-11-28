# Handoff: continuing THE UNSEEN with your own Kiro

This guide is for a teammate who continues the build with their own Kiro account and credits, using Claude Code as a planning and verification assistant.

## 1. What this project is
**THE UNSEEN** is a haunted web-accessibility auditor for Kiroween 2026. The deadline is **Fri 4 Dec 2026, 2:00 PM PT**. You paste a URL and see the site the way a screen-reader or keyboard user experiences it. Each WCAG 2.2 failure becomes a "haunting": Nameless Spirit, The Fog, Cursed Loop and so on.

Read, in this order:
1. `CLAUDE.md`: the division of labour. **The team directs; Claude Code drafts the instructions to Kiro and verifies the results; Kiro writes the code, except the labelled exceptions in the table below.**
2. `docs/brief/PRODUCT_BRIEF.md`: the vision, demo script and prize strategy.
3. `docs/brief/prompts/README.md`: the run queue, with model, rough credit cost and review gate for each run.
4. `docs/brief/KIRO_SESSION_LOG.md`: what every past run did, including failures.

## 2. Current state (as of 2026-11-24)
| Piece | State | Built by |
|---|---|---|
| Steering (`.kiro/steering/`, 6 docs) | Done. Drift fixed in run 10 | Kiro; run 10 Step 0.4–0.6 by Claude Code |
| `audit-engine` spec (`.kiro/specs/audit-engine/`) | Done: 15 requirements, **16/16 tasks ticked** | Kiro |
| Cursed Shop (`apps/cursed-shop`) | **Done and verified** (run 09, merged in #1). `npm run verify` passes; all 30 golden counts match | Kiro |
| `packages/core` tasks 1–4 | Done | Kiro |
| `packages/core` tasks 5–8 (BrowserPool, PageLoader, AX tree, axe) | Done, PR #2 | **Claude Code** (Kiro hit the monthly limit mid-run) |
| `packages/core` tasks 9–16 (collectors, Tab walker, `auditUrl`/`auditHtml`, determinism) | Done, PR #3 | **Claude Code** (no Kiro credits) |
| Tests | `npm run typecheck` clean; Vitest 62/62; Playwright 20/20 | |
| **Next run: 12** | `12-spec-haunting-classifier.md` | |

**Open PRs, stacked. Merge in order with merge commits, not squash:**
- [#2](https://github.com/PRIEST099/unseen/pull/2) is the run 10 branch, now based on `main`.
- [#3](https://github.com/PRIEST099/unseen/pull/3) is the run 11 branch, based on #2's branch.
- Merging #2 first makes #3's diff collapse to run 11 only.

### ⚠️ Decision before submission: hand-written code in PRs #2 and #3
The hackathon requires the project to be built with Kiro, and `CLAUDE.md` says only Kiro writes code. Tasks 5–16 were written by Claude Code because the teammate's Kiro account had run out of credits. Every commit, both PR bodies and `KIRO_SESSION_LOG.md` say so openly. Now that there are Kiro credits again, pick one option:

1. **Kiro reviews and adopts (recommended, cheaper).** Send Kiro a review run, `docs/brief/prompts/19-kiro-review-runs-10-11.md`. Kiro reads tasks 5–16 against the spec and steering, fixes anything wrong, and adds what's missing. Everything it changes is then Kiro-written, and the log shows Kiro verified the rest. Estimate: 30–60 credits.
2. **Kiro rebuilds.** Revert the Claude-written files and re-send `18-run-10-resume.md` and `11-impl-audit-engine-9-16.md`. This is the purest route, but costs about 100–150 credits and time we may need for the UI (14b).

Whichever you pick, keep the honesty notes in the session log; judges read it.

### Findings worth knowing (from runs 10–11)
- `safe-fetch.ts` (task 3) used `route.abort('blocked')`, which is not a valid Playwright error code, so every blocked request threw. It was fixed to `'blockedbyclient'` in PR #3. The other safe-fetch gaps in `review-notes/safe-fetch-review-1.md` still stand (runs 13/13b).
- CDP AX nodes of role `InlineTextBox` have no `backendDOMNodeId`. They are kept, and the exemption is recorded in `design.md` Req 5.2.
- `trapRegionNodeIds` holds the region element (the dialog or common ancestor) followed by the cycle members.
- Chromium ids differ per renderer, so the determinism test canonicalises them. The screenshot SHA can differ (font rasterisation) and is recorded, not failed.
- On macOS both the `chromium` channel and the bundled headless shell work. Windows still needs `UNSEEN_CHROMIUM_CHANNEL=chromium` (see `local-env.md`).

### Kiro CLI notes from the teammate's machine
- `/usage` can't be read headless. Sending it as a headless prompt spends credits and returns nothing, so check it in an interactive `kiro-cli chat`.
- Two errors to expect:
  - `ClientThrottleError`: you are sending too fast. Wait about 5 minutes and re-send.
  - `UsageLimitReachedError`: the monthly credits are gone. Log what was finished, then check the files.
- Write Kiro's output log **outside the repo** (for example `../kiro-logs/runNN.log`). The OS can clear the scratchpad.

## 3. One-time setup
```bash
git clone <repo-url> && cd the-unseen
npm install
npx playwright install chromium
cd packages/core && npm run typecheck && npx vitest --run && npx playwright test   # expect 62 + 20 passing
```
- **Kiro CLI:** install it from kiro.dev, then run `kiro-cli login` (device flow in the browser; no API key needed). Check your credits with `/usage` in an interactive `kiro-cli chat`; the counter lags by a few minutes.
- **Hackathon credits:** each teammate can request Kiro credits through the Devpost credit form linked on the Kiroween page.
- **Chromium channel:** if `npx playwright install chromium` cannot fetch the headless shell (it fails on the owner's Windows machine), use `npx playwright install chromium --no-shell` and launch with `channel: 'chromium'`. `BrowserPool` reads `UNSEEN_CHROMIUM_CHANNEL` (an empty string means the bundled build), and so do the probes and `playwright.config.ts`. See `docs/brief/review-notes/local-env.md`.


## 4. The loop for each run
1. **Claim the run.** Create a branch (`kiro/run-09-cursed-shop-finish`), add a "Run NN · started" line to the session log, and tell the owner. Then two people never send the same prompt.
2. **Send the prompt to Kiro headless** from the repo root.
   - bash:
     ```bash
     kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,execute_bash --model auto < docs/brief/prompts/09-cursed-shop-finish.md
     ```
   - PowerShell:
     ```powershell
     Get-Content -Raw docs/brief/prompts/09-cursed-shop-finish.md | kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,execute_pwsh --model auto
     ```
   - Spec-creation runs 12, 13, 14 and 15 add `--mode spec`; implementation runs (12b–15b) do not. Use the model listed in the queue.
   - Long runs: run in the background and capture the output to a file outside the repo.
3. **Verify independently. Do not trust Kiro's own summary.** Run the tests yourself. For the Cursed Shop, run the probes in `docs/brief/review-notes/probes/` (Tab walk with the escape test, axe, CDP `Accessibility.getFullAXTree`; see their README) and compare against `apps/cursed-shop/expected-hauntings.json`. Kiro's first Cursed Shop claimed success while most hauntings did not fire.
4. **If something is wrong,** write a fix instruction under the next free number (e.g. `docs/brief/prompts/18-cursed-shop-fix-3.md`) with evidence, add a row for it in `prompts/README.md`, and add a review note in `docs/brief/review-notes/`. Send that to Kiro. **Do not edit app code yourself.**
5. **Log the run** in `KIRO_SESSION_LOG.md` (append only): the instruction file, command, model, credits used, what Kiro produced, and what your verification found. This log becomes the Kiro write-up that judges read, so keep it honest, including failures.
6. **Commit and push your branch, then open a PR to `main`.** Commit only after verification passes, or after logging a partial result. Never force-push `main`.

## 5. Credit tips
- A spec run costs about 15–30 credits. An implementation run costs about 20–80. The queue README has an estimate for each run.
- **If credits are tight,** put a priority order at the top of the prompt and ask Kiro to save after each item (as run 08 did), so a cut-off still leaves usable work.
- Cheap models (`claude-haiku-4.5`, about 0.4×) suit mechanical fix passes. Use `claude-sonnet-4.5` for the security and classifier specs.
- When Kiro stops with `UsageLimitReachedError`, log what was finished and check the files: Kiro's partial summaries can over-claim.

## 6. Splitting work with the owner
Coordinate on chat; the session log claim line is the source of truth. A natural split once credits exist on both sides:
- **Teammate:** runs 09 → 10 → 11 (Cursed Shop and audit engine), then 13/13b (safe-fetch).
- **Owner:** 12/12b (classifier), 14/14b (UI), 15/15b (MCP and Power).
- Run 16 (deploy) needs the owner's hosting account. Run 17 (Night Shift) goes in a separate repo and is cut first if time runs short.

Runs 12b and 14b depend on 11 (they need real `RawAudit` fixtures), so 09–11 is the critical path.

## 7. Hackathon submission checklist (owner submits)
- Public repo with the MIT license visible in the GitHub About section
- `.kiro/` committed
- A live URL
- A public YouTube video under 3 minutes
- A Kiro write-up, built from the session log
- Optional: blog post. The social post is written by the owner personally.
