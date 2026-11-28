# Run 50c: last ghost fixes

This follows runs 50 and 50b; their rules still apply.
- Work in `apps/web/` only.
- Save after each item.
- If you approach a limit, stop after a finished item and print `Next: <item>`.
- Never end with a menu or a question.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test.

A second independent review checked the 50b code. Each item below was confirmed against the code by a second reviewer. One finding was refuted and is not listed. The suites pass and the look is good at 1366 px and wider, so these changes are small.

## Fixes
1. **No eyeless slices.**
   - Between 768 px and about 1240 px wide, the panel leaves about 24 px of margin, so side spots show a thin sliver with no eyes. That includes the 1100×800 size.
   - In `ghost-spots.ts`, plan a spot only if, in the pose it will be drawn in, it shows at least the dome and both eyes.
   - When no side or bottom option qualifies at the current width, show fewer ghosts, or none, rather than slivers. A smaller ghost is fine if it still meets the rule.
   - Add geometry unit tests at 1100 px and 900 px wide asserting that every planned spot shows both eyes.
2. **The footer.**
   - The footer is opaque and now covers ghosts. On short pages (the séance page, the not-found pages, and the landing page scrolled to the bottom) it sits at the bottom of the viewport and hides the bottom ghosts' eyes.
   - Measure `footer.app-footer` in `readPlacement()`, as `#main` is measured. Use the lowest viewport y its top can reach.
   - Cap side spots above it. Drop bottom spots, or lift them, whenever the footer can occupy the viewport bottom.
   - Account for the footer in `visibleBox()` and `spotCenter()`.
3. **The animation name clashes with Spirit Sight.**
   - `ghosts.css` declares `@keyframes ghost-bob`, which replaces Spirit Sight's own `ghost-bob` (`spirit-sight.css:465`, used by the Nameless Spirit overlay). The last declaration wins document-wide.
   - Rename yours to `margin-ghost-bob`. Leave `spirit-sight.css` alone.
4. **No reactions during the intro.** While the intro is active, the margin ghosts wait invisible, but they can still be startled or relocated, which breaks the one-ghost hand-off.
   - Skip startle and relocation while the intro is active (through `GhostsContext`).
   - Better still, have `LightsOn` take its landing targets from the margin ghosts' current spots instead of planning them separately.
5. **Clean up the fonts callback.** Cancel the `document.fonts.ready` follow-up in `useMarginGhosts` on cleanup, with a disposed flag.

## Tests that don't prove what they claim
6. **The clock is not paused.**
   - `page.clock.install()` alone does not stop timers, so the "axe during the dark phase" tests and the touch-skip test race the real 900 ms and 1.8 s intro timers. That affects `e2e/ghosts.spec.ts` around lines 188 and 214, and `e2e-replay/ghosts.spec.ts:73`.
   - Pause the clock before `page.goto` (`install` followed by `pauseAt`), so nothing fires until the test calls `runFor`.
   - Correct the comments.
7. **The intro time check.**
   - Measure from mount: record `performance.now()` when `.lights-on` first appears and when it is removed, then assert the difference is ≤ 2,500 ms. The rule is "gone by 2.5 s after mount", so test exactly that.
   - In the fonts-never-load case, tighten the lower bound so it can tell the time limit apart from ignoring `fonts.ready`.
8. **The "never inside the panel" geometry assertion is tautological:** `visibleRect` has already clipped the panel out. Compute it from the raw ghost box against the panel rect, ring included. Alternatively, drop it and say that the probe-pixel test carries that guarantee.
9. **The footer is untested.**
   - A test name says ghosts hide behind the footer, but nothing asserts it.
   - Assert it on a short page (the séance page or a not-found page, where the footer is in view), including that no planned spot's eyes fall behind the footer.
10. **Two leftovers.**
    - Delete the unused `lookAway` helper.
    - Make the `visibilitychange` relocation check assert that *every* ghost moved, index by index.

## At the end
Run and report pass counts, with `UNSEEN_CHROMIUM_CHANNEL=chromium` set in the environment:
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Then list the files you changed, and print `Next: owner review`.
