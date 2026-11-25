Finish the `unseen-mcp-and-power` spec. Tasks 0–5 are done and verified by the product lead. Work in order and save after each item. If you approach a limit, stop after a finished item and print `Next: <item>`. Never end with a menu or a question.

## 1. Fix: the fallback gate gets its own file
`unseen-mcp install-hooks` currently writes the agent-type fallback Stop hook as a third entry in `unseen-hooks.json` with a per-hook `"enabled": false`.
- **The problem:** the only `enabled` flag the product lead has seen working in this repo is the **top-level** one (`.kiro/hooks/spec-types-drift.json`). An unknown per-hook field risks the whole file failing to load, which would also lose the real gate.
- **The fix:**
  - Write the fallback to its own file, `.kiro/hooks/unseen-gate-agent-fallback.json`, with top-level `"enabled": false`.
  - Keep `unseen-hooks.json` to the two command hooks only.
  - Update `install-hooks`, its tests, `power/skills/install-unseen-hooks/SKILL.md` and `power/DEMO.md`. The new fallback steps in `DEMO.md`:
    1. Delete the Stop entry from `unseen-hooks.json`.
    2. Set `"enabled": true` in `unseen-gate-agent-fallback.json`.
    3. Start a new chat session.
  - The end-to-end integration test must still pass.

## 1b. Fix: the demo page must not announce its ghost
`power/demo/checkout.html` line 2 is an HTML comment: "Expected: one Nameless Spirit (Wraith)…". The model reads it and may fix the button before the gate fires. It also looks staged on camera.
- Remove the comment from the page.
- Keep that explanation only in `power/DEMO.md` and in the test that checks the scores. The page must still score 15 before the fix and 0 after.

## 2. Task 6: the `unseen-auditor` custom agent
Build it exactly as the amended spec says, including the `mcp` allow rule for the four tools. Writes to `.kiro/agents/` may be refused in headless mode. If one is, put the complete file content in your final summary and continue; the product lead applies it verbatim.

## 3. Task 7: the `web-self-audit-on-save` hook for this repo
Build it as the amended spec says. Writes to `.kiro/hooks/` may be refused; handle them as in item 2. The script under `.kiro/hooks/scripts/` is a normal file, so write it.

## 4. Task 8: Exorcise the Cursed Shop
Build the workflow as the amended spec says. Then **produce the exorcised copy for real**: `demo/cursed-shop-exorcised/`, with every haunting fixed in source.
- Re-audit the copy with the MCP server or core, and record before and after scores per page in `demo/cursed-shop-exorcised/README.md`.
- The original `apps/cursed-shop/` must be byte-for-byte unchanged: `git diff --exit-code -- apps/cursed-shop` is empty, and `npm run verify -w cursed-shop` still passes.

## At the end
Run these and report the pass counts:
- `npm run build`
- `npm run typecheck`
- `npm test -w @the-unseen/core`
- `npm test -w @the-unseen/mcp`
- `npm run test:integration -w @the-unseen/mcp`
- `npm run verify -w cursed-shop`

Use `UNSEEN_CHROMIUM_CHANNEL=chromium` on this Windows host. Never weaken a test. Tick tasks only when their tests pass. Print `Next: <first unfinished item>`.
