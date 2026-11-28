# Run 51c: make the ghost-layer probe test check the right thing

This follows runs 51 and 51b; their rules still apply.
- Work in `apps/web/` only.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken what a test proves.

## The problem (diagnosed by Claude Code, run 51b was stopped)
`e2e/ghosts.spec.ts`, the test "whatever is in the ghost layer is painted behind the header and the panel, and shows only on the wall" (around line 669), fails about 1 run in 6 at line 728: `expect(withProbe.panel.equals(without.panel)).toBe(true)`.

A diagnostic copy of the test, repeated 20 times, showed what happens:
- In the failing runs, 16,000–42,000 pixels of the panel differ between the two shots.
- The largest difference in any colour channel is **2** (out of 255). That is invisible rendering noise from the painting being re-rastered: since run 51 it holds the painting-ghost layer.
- **Zero** probe-coloured (magenta) pixels reach the panel. The product is correct; the byte-for-byte comparison is too strict.

## The fix
Make the header and panel checks prove the real property: **the probe never shows through**.
- Keep the probe exactly as it is: `rgb(255,0,255)`, covering the header, the panel and the wall.
- For the header and the panel, decode both PNGs. Use the page's canvas, as in other specs, or a small helper. Assert:
  1. no pixel in the "with probe" shot is probe-coloured (r > 200, g < 80, b > 200) where the "without" shot was not;
  2. the largest per-channel difference between the two shots is at most 8, which still catches any real bleed of a translucent layer.
- For the wall, keep proving that the probe **does** show: at least one probe-coloured pixel appears.
- Put the decode/compare helper in `e2e/` (for example in `e2e/fixtures.ts`, or a new `e2e/pixels.ts`) so it can be reused.
- Update the test's comment to say why it compares colours and not bytes.
- Apply the same change to any copy of this check in `e2e-replay/`.

## At the end
Set `UNSEEN_CHROMIUM_CHANNEL=chromium` in the environment, then run these, one at a time, and report the pass counts:
- `npm run typecheck -w @the-unseen/web`
- in `apps/web`: `npx playwright test e2e/ghosts.spec.ts -g "painted behind the header and the panel" --repeat-each=20`
- `npm run e2e -w @the-unseen/web` (once)

Then list the files you changed, and print `Next: owner review`.
