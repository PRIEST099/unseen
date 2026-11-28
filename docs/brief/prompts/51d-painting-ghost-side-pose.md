# Run 51d: painting ghosts stand upright on the side edges

This follows runs 51 to 51c; their rules still apply.
- Work in `apps/web/` only.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test.

## The problem
A painting ghost that peeks from the **left or right** inner edge of a frame is drawn lying on its side, rotated a quarter turn, so its eyes are stacked vertically. It reads as a ghost tipped over, not one peeking in. You can see it on the landing hero at 1800×1200, where it peeks from the right edge, and at 430×932, where it peeks from the left.

The margin ghosts already solve this: on a side edge they use the `upright` pose (`artTurn(edge, true)` in `utils/ghost-art.ts`, `upright` on `Ghost`). They stand nearly upright with a gentle lean, as in the thumbnail.

## The fix
- Painting ghosts on a left or right edge use the same upright pose as the margin ghosts. Bottom-edge ghosts are unchanged.
- Update `painting-spots.ts` so the planner works in that pose:
  - the visible fraction;
  - the `viewBox` crop;
  - the "dome and both eyes inside the picture" check;
  - the excluded-area check.
- The intro hand-off already passes `upright` for margin spots. Make it pass `upright` for a painting side spot too, so the arriving ghost lands in the same pose.
- **Unit test:** for every side spot, the ghost is planned upright, and both eyes (in that pose) are inside the picture's inner box.
- **e2e:** on the landing at 1800×1200 and at 430×932, if the painting ghost is on a side edge, its two eye ellipses are side by side: the difference between their centres' y is smaller than the difference between their centres' x.

## At the end
Set `UNSEEN_CHROMIUM_CHANNEL=chromium` in the environment, then run these one at a time and report the pass counts:
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- in `apps/web`: `npx playwright test e2e/painting-ghosts.spec.ts --repeat-each=3`
- `npm run e2e -w @the-unseen/web` (once)

Then list the files you changed, and print `Next: owner review`.
