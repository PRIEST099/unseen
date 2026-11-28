# Kiro run queue

Claude Code drafted these instructions at our direction and ran each one through Kiro CLI headless, in order, checking each result before sending the next. Kiro writes the code, except the labelled exceptions in rows 10 and 11 and those logged in `../KIRO_SESSION_LOG.md`, where every run is recorded.


Command pattern (prompt piped on stdin):
```
kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,execute_bash,execute_pwsh [--model M] [--mode spec] < prompt.md
```

## Done
| # | Prompt | Result |
|---|---|---|
| 01–02 | Steering + review | 6 steering docs |
| 03 | `audit-engine` spec | 15 requirements, 16 tasks |
| 04 | Audit engine tasks 1–4 | 47 tests passing |
| 05 | Cursed Shop (vibe) | Built, but most hauntings were wrong |
| 06 | Steering review 2 | Rules tightened from the Chromium evidence |
| 07–08 | Cursed Shop fixes | SVGs and Lost Souls partly fixed; stopped at the monthly limit |
| 09 | Cursed Shop finish (Kiro) | All 30 golden counts match; `verify.mjs` works (merged, #1) |
| 10 | Audit engine 5–8 + Step 0 | Kiro did Step 0.1–0.4, then hit the limit. **Claude Code finished it by hand** (#2) |
| 11 | Audit engine 9–16 | **Written by Claude Code, no Kiro credits** (#3); 62 unit + 20 integration tests |

## Queue (once credits arrive)
| # | Prompt | Mode / model | Rough credits | Review check before the next run |
|---|---|---|---|---|
| 09 | `09-cursed-shop-finish.md` | vibe, auto | 15–30 | Run `review-notes/probes/` (Tab walk, axe, CDP); counts must match the golden file (stale until this run) |
| 10 | `10-impl-audit-engine-5-8.md` | auto | 25–45 | Step 0 steering/config sync landed; run the tests independently; read `browser.ts` |
| 11 | `11-impl-audit-engine-9-16.md` | auto | 40–80 | Full test suite; the `RawAudit` of each shop page looks right |
| 12 | `12-spec-haunting-classifier.md` | spec, claude-sonnet-4.5 | 20–30 | The spec is consistent with `hauntings.md`; the precedence is sensible |
| 12b | "Implement all tasks of `.kiro/specs/haunting-classifier/tasks.md`" | auto | 40–80 | Golden test passes; PBTs ≥ 100 runs |
| 13 | `13-spec-safe-fetch.md` | spec, claude-sonnet-4.5 | 15–25 | Every review defect is covered |
| 13b | "Implement all tasks of `.kiro/specs/safe-fetch/tasks.md`" | claude-sonnet-4.5 | 30–60 | Re-run the SSRF probes, including `[::1]`, mapped IPv6, an AAAA-only host and a redirect to loopback |
| 14 | `14-spec-spirit-sight-ui.md` | spec, auto | 20–35 | The UX matches brief §5; AA requirements are present |
| 14b | Implement spirit-sight-ui (split into 2–3 runs by task range) | auto | 120–250 | Demo slice on a sample; the self-audit is clean; keyboard-only pass; screen-reader spot check |
| 15 | `15-spec-unseen-mcp-and-power.md` | spec, auto | 15–25 | Power format and hooks |
| 15b | Implement mcp + power + hooks | auto | 40–80 | Try the "build a checkout button" demo in the Kiro IDE |
| 16 | `16-deploy.md` | auto | 15–30 | Smoke test passes locally; **the owner picks Fly or Render and deploys** |
| 17 | `17-night-shift-crew.md` (separate repo) | spec then implement, auto | 60–120 | Demo patrol runs; the Exorcist rejects a bad fix |
| 18 | `18-run-10-resume.md` (resume run 10 after the usage limit) | auto | 25–45 | Same gate as run 10 |
| 19 | `19-kiro-review-runs-10-11.md` (Kiro reviews and adopts the Claude-written tasks 5–16) | claude-sonnet-4.5 | 30–60 | Full test suite; every change logged; nothing weakened to pass |

**Estimated total: about 500–1,000 credits**, leaving headroom for review-driven fix passes. Each spec gets an independent review (as the audit engine did) before implementation.

**File naming:** new fix instructions take the next free number (`18-…`, `19-…`) and get their own row. The `12b`–`15b` rows are implementation runs with no file of their own.

**Erratum (historical prompts, left unchanged):** integration tests live in `packages/core/tests/` (not `test/`), and the Cursed Shop's verifier is `apps/cursed-shop/verify.mjs`.

## Schedule (deadline Fri 4 Dec 2026, 2:00 PM PT)
- **Day 1 of credits:** 09, 10, 11
- **Day 2:** 12/12b, 13/13b
- **Days 3–5:** 14/14b
- **Day 6:** 15/15b, 16 and deploy
- **Day 7:** 17 (cut it if behind)
- **Last 2 days:** video, write-up, blog draft, README

If credits arrive after about Nov 27, cut in this order:
1. Night Shift
2. The ambient drone and fog shader (use a CSS fog)
3. Shattered Order and Silent Tongue visuals (keep the detection)
