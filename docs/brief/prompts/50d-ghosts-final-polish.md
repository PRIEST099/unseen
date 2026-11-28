# Run 50d: final ghost polish

This follows runs 50 to 50c; their rules still apply.
- Work in `apps/web/` only.
- Save after each item.
- If you approach a limit, stop after a finished item and print `Next: <item>`.
- Never end with a menu or a question.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test.

After 50c, every suite passed for you. On a second full run, one test failed. Run on its own 20 times, it failed 10. A focused review of the 50c code found the cause and four more small items, each confirmed by a second reviewer.

## Items
1. **Flaky test: "a ghost that was hidden when the window changed size comes back"** (`e2e/ghosts.spec.ts`, around line 718).
   - **Cause:** it is a test bug. The pointer at ghost 0 often also hides a second ghost on the same side (by design, every ghost within 180 px hides). The `steps: 5` path can hide one too. Both come back together, so the hidden count goes 2 → 0 and never equals 1.
   - **Fix:**
     - Move to the target in one jump.
     - Wait two animation frames.
     - Record the *set* of hidden ghosts (by edge, anchor and position).
     - After the resize, assert that the same set is still hidden, then that every ghost comes back.
   - Correct the comment that says every visible ghost is planned again.
   - Do the same to any copy in `e2e-replay/`.
   - Run it with `--repeat-each=20` and report the result.
2. **Fewer ghosts, never stacked.**
   - Source: `pickSpot` in `ghost-spots.ts`.
   - **Cause:** after relaxing the lantern rule, it returns the last random candidate even when that overlaps a ghost already taken. So a crowded viewport (e.g. 1920×560) still gets three ghosts, one painted over another's eyes.
   - **Fix:**
     - Return `null` instead.
     - Have `plannedSpots`, the fill loop in `fitGhosts` and `relocateAll` stop at the first `null`.
   - **Also, spread them out:** with three ghosts, no more than two on one side when the other side has room.
     - At 1280×800, all three were seen stacked down the left edge.
   - **Tests:**
     - Unit tests assert that planned spots never intersect (with the gap) and that the count is ≤ 3, not exactly 3.
     - Add short-viewport cases (1920×560, 1920×400).
     - Add a both-sides case at 1280×800.
3. **Pause relocation during the intro.**
   - `refresh()` still calls `fitGhosts` while the intro is active, and it can move a ghost to a panel-anchored spot after `LightsOn` has captured its landing targets. The intro ghost then lands somewhere else, or over the panel, while the intro layer sits above the page.
   - **Fix:**
     - While paused, relocate with `windowOnly: true`, or keep the old spot until the intro ends.
     - Make sure `LightsOn` captures its targets after the post-fonts refit (e.g. one frame after `fonts.ready`).
   - Make the `paused` doc comment match the code.
4. **The intro ghosts should not snap size.**
   - During the dark phase, the intro ghosts are sized with `ghostSizeFor(width)` (150 px). At lights-on they jump to the fitted size, about 106 px at 1280 px.
   - **Fix:** size them from the margin layout at mount, so they keep one size from start to hand-off.
5. **The skip tests don't prove the skip.**
   - The "Tab skips the intro" assertion uses the default 5 s timeout on the real clock, so it passes even if Tab never skips, because the intro ends by itself within 2.5 s.
   - The click-skip test is only a little stronger.
   - **Fix:** call `pauseClock(page)` before `page.goto('/')` in both skip tests, so only the skip can end the dark phase.
   - Keep checking that Tab still reaches the skip link.

## At the end
Run and report pass counts, with `UNSEEN_CHROMIUM_CHANNEL=chromium` set in the environment:
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`, **twice in a row**; both runs must pass
- `npx playwright test e2e/ghosts.spec.ts --repeat-each=5` in `apps/web`
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Then list the files you changed, and print `Next: owner review`.
