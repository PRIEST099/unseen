# Handoff: continuing THE UNSEEN with your own Kiro

This guide is for a teammate's Claude Code session that continues the build using the teammate's own Kiro account and credits.

## 1. What this project is
**THE UNSEEN** is a haunted web-accessibility auditor for Kiroween 2026. The deadline is **Fri 4 Dec 2026, 2:00 PM PT**. You paste a URL and see the site the way a screen-reader or keyboard user experiences it. Each WCAG 2.2 failure becomes a "haunting": Nameless Spirit, The Fog, Cursed Loop and so on.

Read, in this order:
1. `CLAUDE.md`: the division of labour. **Claude directs and verifies; Kiro writes all code.**
2. `docs/brief/PRODUCT_BRIEF.md`: the vision, demo script and prize strategy.
3. `docs/brief/prompts/README.md`: the run queue, with model, rough credit cost and review gate for each run.
4. `docs/brief/KIRO_SESSION_LOG.md`: what every past run did, including failures.

## 2. Current state (as of 2026-11-21)
| Piece | State |
|---|---|
| Steering (`.kiro/steering/`, 6 docs) | Done; reviewed twice |
| `audit-engine` spec (`.kiro/specs/audit-engine/`) | Done: 15 requirements, 16 tasks |
| `packages/core` tasks 1–4 | Done: `tsc` clean, 47/47 Vitest tests pass |
| Cursed Shop (`apps/cursed-shop`) | About half fixed. Run 08 stopped on the free-plan limit. **Next run: 09.** |
| Runs 09–17 | Written and queued in `docs/brief/prompts/`, not yet sent to Kiro |

## 3. One-time setup
```bash
git clone <repo-url> && cd the-unseen
npm install
npx playwright install chromium
cd packages/core && npx tsc --noEmit && npx vitest --run   # expect 47 passing
```
- **Kiro CLI:** install it from kiro.dev, then run `kiro-cli login` (device flow in the browser; no API key needed). Check your credits with `/usage` in an interactive `kiro-cli chat`; the counter lags by a few minutes.
- **Hackathon credits:** each teammate can request Kiro credits through the Devpost credit form linked on the Kiroween page.
- **Chromium channel:** if `npx playwright install chromium` cannot fetch the headless shell (it fails on the owner's Windows machine), use `npx playwright install chromium --no-shell` and launch with `channel: 'chromium'`. `BrowserPool` (task 5, run 10) **will** read `UNSEEN_CHROMIUM_CHANNEL`. Until then, scripts pass the channel themselves, as the probes in `docs/brief/review-notes/probes/` do. See `docs/brief/review-notes/local-env.md`.

> ⚠️ **Known-stale until run 09 is verified:** `apps/cursed-shop/expected-hauntings.json` and `apps/cursed-shop/README.md` contradict the current rules. Until then, the truth is `.kiro/steering/hauntings.md` plus the actual-vs-golden tables in `docs/brief/review-notes/cursed-shop-review-2.md`. The steering docs also have some drift (e.g. `structure.md`), which run 10's "Step 0" fixes.

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
