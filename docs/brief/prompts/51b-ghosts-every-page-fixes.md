# Run 51b: fixes for the painting ghosts and the longer intro

This follows run 51, and its rules still apply.
- Work in `apps/web/` only.
- Save after each item.
- If you approach a limit, stop after a finished item and print `Next: <item>`.
- Never end with a menu or a question.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test.

Run 51 looks good in the browser: the intro roams, and every page has a painting ghost, Daylight's sleepy one included. An independent review found the items below, and a second reviewer confirmed each one against the code. They are small.

## Behaviour fixes
1. **A held ghost must stay still, even if it ducked before the hold began.** (`components/PaintingGhost.tsx`, around lines 183, 210 and 231)
   - **The bug:**
     - `isHeldStill()` is checked only when the ghost ducks.
     - The ghost ducks when the pointer passes on its way to Play, then the user presses Play within 4 s.
     - 4 s later the `REEMERGE_MS` timer still slides the ghost back in while the walk plays.
     - The wander's `away` timer and the visibility relocation ignore the hold in the same way.
   - **The fix:**
     - Every delayed re-peek checks the hold *when it fires*. While held, the ghost stays ducked behind the frame and re-peeks once the hold is released.
     - Polling every 500 ms is acceptable. A subscribe/notify on the hold in `GhostsContext` is cleaner.
     - The visibility handler does nothing while held.
   - **Unit test:** startle the ghost, call `holdStill()` before `REEMERGE_MS`, and assert that no new figure mounts until the hold is released, after which it re-peeks.
2. **Spirit Sight holds the ghost for the whole time the overlay is open.** In `SpiritSightView.tsx:326`, change `useHoldGhostsStill(rendered.length > 0)` to `useHoldGhostsStill(open || rendered.length > 0)`.
   - Today nothing is held between the click on "Open Spirit Sight" and the first reveal, nor for an audit with no placed hauntings.
   - The pointer that clicked the toggle is often within `NEAR_PX` of the banner ghost.
   - Add a unit or e2e assertion for the moment just after opening, before any reveal.
3. **No touch reactions on the audit lenses.** The lens rules allow only the lantern (mouse or pen), the visibility change and the wander timer. Pass a `calm` flag from the lens painting into `usePaintingBehaviour`, and do not subscribe to touch when it is set.
   - Touch keeps working on the landing, séance, not-found and state pages.
   - **Unit test:** a calm ghost does not startle on a touch `pointerdown` inside its box.
4. **Clip the intro ghost the moment it reaches the painting, not on a fixed timer.** (`LightsOn.tsx`, around line 372, `CLIP_AFTER_MS`)
   - **The bug:** today the clip turns on about 382 ms after lights-on. With the fast-start easing, the dart is 82–99% done between about 150 and 380 ms. During that window, the part of the arriving ghost that belongs behind the frame (up to about 33 px at 150 px) is drawn over the gilt frame and, for a bottom spot, past it onto the page.
   - **The fix:** after `launched`, run a `requestAnimationFrame` loop while the phase is `lights`.
     - For the ghost whose landing has a `clip`, read its rect each frame, and set `clipped` on the first frame it intersects the picture's inner rect (or the frame's outer rect).
     - If it already overlaps at launch, set `clipped` together with `launched`.
     - Keep a fallback timeout at the end of the dart.
     - Cancel the loop and the fallback on cleanup.
     - A stricter option is a frame-band `clip-path` from launch: viewport minus the painting's border box plus the inner rect, with `evenodd`.
   - **e2e:** on a lens route with no margin spots (for example 1440×900 on `/sample/cursed-shop-index`, with the intro forced), sample the arriving ghost each frame during the dart. Assert that no visible part of it is ever drawn inside the frame band.
5. **Measure the painting layout when the intro reads it.** (`GhostsContext` and `usePublishLayout` in `PaintingGhost.tsx`)
   - **The bug:** the published rect is measured once. On the séance, the painting re-centres as the text column grows during the dark phase, so the intro would land on a stale rect.
   - **The fix:**
     - Publish a *measurer*, `() => PaintingLayout | null`, instead of a snapshot.
     - `readPaintingLayout()` calls it, returning null if the element is disconnected or has zero size.
     - Drop the scroll and resize listeners that only republished.
     - Update the context default and the test doubles.

## The bounding-box contract (a decision, not a bug)
6. **Settle what "the ghost's box stays inside the picture" means.**
   - **The gap:** spec 51 asked that *every* element of the ghost have its bounding box inside the picture. You cropped the outer `svg` with its `viewBox`, but the body `<path>` still reports a client rect that crosses the frame.
   - **Decision (the owner's reviewer):** the contract is **the outer `svg` box and both eye ellipses inside the picture's padding box**, which is what you test today.
   - **What to do:**
     - Keep the `viewBox` crop.
     - Rename the e2e check and its comment so they state that contract exactly.
     - Add a comment in `PaintingGhost.tsx` explaining why the child paths are clipped visually, not geometrically.
   - Do not polygon-clip the art.

## Tests that don't prove what they claim
7. **Reduced motion "no intro" is vacuous.** Playwright sets `navigator.webdriver`, so the intro is skipped whether or not reduced motion stops it.
   - In `e2e/ghosts.spec.ts`, inside `test.describe('reduced motion', ...)` (around line 400), add `test.beforeEach(async ({ page }) => forceIntro(page))`, so only the reduced-motion rule can keep the intro away.
   - Do the same for any reduced-motion intro check in `e2e-replay/`.
8. **The old route-rule test (around `e2e/ghosts.spec.ts:796`) still states the old rule.** It now passes only because 1280 px leaves no wall.
   - Retitle it to the new rule.
   - At 1920×1080, assert at least one margin ghost on `/sample/cursed-shop-index`, `/keyboard` and `/whisper`, and zero on `/daylight`.
   - Keep the not-found loop at 1280×720.
   - In `e2e-replay/ghosts.spec.ts`, set 1920×1080 before the Daylight zero-count assertion so it can fail.
9. **The Daylight size check never compares sizes.** (`e2e/painting-ghosts.spec.ts`, around line 219)
   - Read each ghost's full art size from the svg: `width × 120 / viewBox width`.
   - Assert that Daylight's is smaller than the normal ghost's, and within 40–105 px.
   - Remove the vacuous `expect(normal).toBeGreaterThan(0)`.
10. **"A touch never becomes the lantern" checks only `preventDefault`.** (`PaintingGhost.test.tsx`, around line 265) Expose `readLantern` in the probe. Set a mouse lantern at (10, 10), dispatch the touch, and assert that the lantern is still (10, 10).
11. **Stale timing text.**
    - Rename the test at `e2e/ghosts.spec.ts:176` to "…within 4.8 s…".
    - Fix the comment at line 378 that mentions the 900 ms and 1.8 s timers.
    - Search both ghost specs and `intro-clock.ts` for any other 2.5 s, 900 ms or 1.8 s leftovers.

## At the end
Set `UNSEEN_CHROMIUM_CHANNEL=chromium` in the environment, then run these and report the pass counts:
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`, **twice in a row**; both runs must pass
- In `apps/web`: `npx playwright test e2e/painting-ghosts.spec.ts --repeat-each=5`
- In `apps/web`: `npx playwright test e2e/ghosts.spec.ts -g "lights-on intro" --repeat-each=5`
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Run each command on its own, never in parallel with another Playwright run. In run 51 a web server failed to start when two runs overlapped.

Then list the files you changed, and print `Next: owner review`.
