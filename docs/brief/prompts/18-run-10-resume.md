Resume run 10. Read `docs/brief/prompts/10-impl-audit-engine-5-8.md` first: its Step 0, product-lead amendments and "Done means" all still apply. The previous attempt (2026-11-21) stopped on `UsageLimitReachedError` partway through Step 0. **Do not redo the finished items. Verify them only.**

## Already done (verify only)
- Step 0.1: `.kiro/steering/structure.md` rewritten: no `docs/specs/`, the real cursed-shop tree, docs/brief listed, "(planned)" markers, and the ESLint-based classifier boundary.
- Step 0.2: Req 15.3 now says `trapRegionNodeIds`.
- Step 0.3: `tasks.md` Notes updated (classifier boundary; the fixtures already exist).
- Step 0.4, partly: task 5 in `tasks.md` now says default `maxConcurrency` 2, range 1–20, queue limit 20, and has the `buildLaunchArgs` bullet.

## Still to do, in this order (save after each)
1. **Task 5 acceptance text:** it still says "queue depth 51 throws". Change it to match the queue limit of 20 (the 21st queued request throws).
2. **Step 0.4, rest:** in `.kiro/steering/security.md`, make one source of truth for the limits:
   - per IP: 5 audits/min and 30/hour
   - global concurrency from `UNSEEN_MAX_CONCURRENCY`, default 2
   - queue depth 20

   Remove any conflicting numbers elsewhere in the steering docs.
3. **Step 0.5:** the `security.md` SSRF section names `RestrictiveSafeFetchPolicy`, `PermissiveSafeFetchPolicy` and `installSafeFetchPolicy`, and notes the known gaps listed in `docs/brief/review-notes/safe-fetch-review-1.md`.
4. **Step 0.6:** `design-system.md` says fonts come from `@fontsource` only, with no Google Fonts.
5. **Step 0.7:** the `packages/core` config items, exactly as in prompt 10.
6. **Step 0.8:** the `apps/cursed-shop/package.json` and root `package.json` items, exactly as in prompt 10. Keep the `"verify"` script that run 09 added.
7. **Tasks 5–8** with all product-lead amendments from prompt 10.

## Notes from the previous attempt (already probed; do not re-probe)
- Both the `chromium` channel and the bundled headless shell launch on this macOS machine.
- In the CDP AX tree, about 75 of 292 nodes on index lack `backendDOMNodeId`. All of them are `InlineTextBox` text runs. Keep them in `axNodes` (Req 5.1, "without filtering"). Apply the Req 5.2 "missing backendDOMNodeId" error only to non-`InlineTextBox` nodes, and record this interpretation in `design.md`.

## Done means
Exactly as in prompt 10. If credits run low, stop after a numbered item and say which is next.
