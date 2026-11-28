# Run 50b: ghost fixes, and closer to the thumbnail

This follows run 50 (`50-ghosts-in-the-margins.md`). Everything in that instruction still applies unless this file changes it.

The same rules as run 50:
- Work in `apps/web/` only.
- Save after each numbered part.
- If you approach a limit, stop after a finished part and print `Next: <part>`.
- Never end with a menu or a question.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test.

The run 50 code works, and its tests pass. An independent review and a look at the running app found the problems below. Each was checked against the code by a second reviewer before it was listed here.

## Part 1: the look (the owner's main ask)
Compare the ghosts with `docs/brief/prompts/50-ghost-reference.png`. Two things are off.

### 1a. The ghost shape reads as an arcade ghost
Right now the ghost has flat vertical sides, a row of small scallops along the hem and small eyes. Redraw `Ghost.tsx` to match the reference:
- **Body:** a soft bell or teardrop.
  - A big round dome on top.
  - The body is widest around the eyes and tapers a little towards the hem.
  - No straight vertical sides.
- **Hem:** three soft, rounded lobes, gently uneven, as if the cloth is drifting. Not a regular zigzag or a row of small scallops.
- **Eyes:** big, tall black ovals.
  - Each about 18% of the body width and about 28% of the body height.
  - Set fairly wide apart, a little below the middle of the dome.
  - "Startled" makes them rounder and about 15% larger.
- **Hands:** two small rounded hands, one at each side.
  - When peeking, the hands curl over the edge the ghost hides behind, as in the reference.
- **Shading:**
  - Keep the mint gradient, lighter at the top left.
  - Add a faint darker mint under the dome to show form.
  - Keep the soft outer glow.
- Render at about 150 px on screens 1100 px wide and above, about 120 px from 768 to 1099 px.

### 1b. The peeking ghosts are thin slices, and one can sit over the header buttons
**Change the layering: the ghosts hide *behind* the page.**
- Put the margin ghosts' layer **under** the header, the `#main` panel and the footer in the stacking order, and above the page background.
  - Give those three a stacking context (e.g. `position: relative; z-index: 1`) if they need one.
  - Do this without changing their layout.
  - The panel and header backgrounds are opaque, so a ghost behind them can never cover text, controls or focus outlines, at any position.
- With that guarantee, ghosts may now:
  - peek out from behind the **panel's side edges** into the margin, the way the reference ghosts peek in from the frame;
  - peek in from the window's left and right edges, as now;
  - peek up from the **bottom edge of the window**: the bottom of the ghost hidden off-screen, only the dome, eyes and curled hands showing.
- **Hiding:** a startled ghost slips fully behind the panel or out past the window edge, wherever it came from.
- **Showing:** as much of each ghost as the space allows, the dome and both eyes at least, when the margin is wide enough.
- **Keep the header controls clear:** a ghost's visible part must never be under the header (it would be hidden anyway, but don't plan spots there).
- **The lantern:** it still only lights the wall (the area outside the panels), as now.
- **The intro:** its ghosts dart to these same spots, and arrive already sliding behind the panel or edge.

## Part 2: bugs (confirmed by review)
1. **A ghost slides across the panel and spins when it changes edge.**
   - Source: `PeekingGhost.tsx`, and `relocateAll` on `visibilitychange`.
   - Cause: the node keeps its key while `left:0` swaps to `right:0`, the slide transform is transitioned from its old value, and the rotation transitions too.
   - Fix: when the edge or spot changes, place the ghost at its hidden offset on the new edge with no transition, then on the next frame let it slide in. Alternatively, key it on its spot.
   - Fix: do the `visibilitychange` relocation while the tab is **hidden**, so nothing is seen moving.
2. **Ghost spots are planned before the header exists.**
   - Source: `ghost-spots.ts` (`readPlacement` and `plannedSpots`).
   - Cause: `useState(readPlacement)` runs in the first render, when `header.app-header` and `#main` are not in the DOM yet. So `minY` is 24, and the module-level `planned` spots can sit at y about 28 on the right edge, over the header buttons. This was seen in the running app at 1440×900.
   - Fix: plan and measure after the first commit, in a layout effect, with the real header height and panel edges. Re-check them on resize and route change.
3. **The intro lands with the 64 px default margin.**
   - Source: `LightsOn.tsx` reads its placement once, before commit.
   - Effect: its ghosts dart onto the panel, then snap to a different spot.
   - Fix: measure the placement when switching to the lights phase.
   - Fix: keep the margin ghosts invisible until the intro reports done (through `GhostsContext`), so the hand-off is one ghost, not two.
4. **The intro's hard maximum is 3.1 s, not 2.5 s.**
   - Source: `LightsOn.tsx:107`. The max timer only starts the 600 ms fade.
   - Fix: the overlay must be gone by 2.5 s after mount in every case. Start the fade by 1.9 s at the latest.
5. **A skip tap activates the control underneath.**
   - Cause: `skip` runs on `pointerdown` and `touchstart` and unmounts the dark layer before the gesture ends, so on touch the follow-up `click` lands on a link, a sample card or the URL field.
   - Fix: keep the dark layer mounted, catching pointer events, until the gesture ends. Unmount on the following `click` or `pointerup`, and consume that click on the layer.
   - Keyboard events stay unprevented. Tab must still move focus.
6. **The status text is probably never announced.**
   - Cause: the `role="status"` element is inserted already filled.
   - Fix: render it empty, then set "Lighting the candles…" after the first paint. Alternatively, use the app's existing `AnnouncerContext`.
   - Keep removing the text when the lights come on.
7. **Programmatic focus on `#main` hides every ghost.**
   - Cause: `useFocusMain` focuses `#main` after each navigation, and the skip link does the same, so every ghost hides for 4 s.
   - Fix: ignore focus on `#main` and on other `tabindex="-1"` containers. Only react to `:focus-visible` controls.
8. **`MarginGhosts` re-renders on every pointermove in the margin.**
   - Cause: `startle` always returns a new array.
   - Fix: return `previous` when nothing changed, and coalesce pointer handling into one `requestAnimationFrame`.
9. **A breakpoint change while a ghost is hidden leaves it hidden for good.**
   - Cause: the effect cleanup clears the re-emerge timers. The same happens when reduced motion turns on mid-session.
   - Fix: re-arm the timers for ghosts that are still hidden. Under reduced motion, show them still at a spot.
10. **The lantern clip goes stale.**
    - Cause: it is recomputed only on pointermove, resize and scroll, so after a route change (Landing to séance), or when the séance panel grows, a resting glow can fall on new panel text.
    - Fix: observe the header, `#main` and footer with a `ResizeObserver`, and re-clip on route change. Alternatively, fade the glow out on any layout or route change until the next pointermove.
11. **The CSS reduced-motion fallback can't stop the bob,** because the base rule is more specific. Fix the specificity so the media query wins.

## Part 3: tests that don't prove what they claim
- **Intro timing.**
  - Unit: assert that the intro node is **gone** at 2,500 ms when `document.fonts.ready` never resolves.
  - End-to-end:
    - Measure from before `page.goto`, or record `performance.now()` in the page when the overlay is removed, and assert ≤ 2,500 ms.
    - Add one case where `document.fonts.ready` never resolves (`addInitScript`).
- **Axe "while the intro plays".**
  - Hold the intro in its dark phase while axe runs (`page.clock.install()` before `goto`, or fonts that never resolve).
  - After `analyze()`, assert the dark layer and the status are still there.
  - Do the same in `e2e-replay/ghosts.spec.ts`.
- **Reduced-motion "pointer no longer sends them away":** move the pointer onto the first ghost's real centre (read `data-edge` and `data-y`), not fixed coordinates.
- **The two `MarginGhosts.test.tsx` tests whose names don't match what they test:** fix the test or the name.
- **New tests for Part 1 and Part 2:**
  - A ghost's visible box never intersects the header or the `#main` panel (assert by stacking order and geometry).
  - A ghost changing edge never paints inside the panel.
  - Focus on `#main` hides no ghost.
  - A ghost hidden across a breakpoint change comes back.

## At the end
Run and report pass counts, with `UNSEEN_CHROMIUM_CHANNEL=chromium` set in the environment (not as a command prefix):
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Take screenshots of the landing page at 1440×900 and 1100×800 after the intro. Look at them against the reference and say honestly how close they are.

Finally, list the files you changed, then print `Next: owner review`.
