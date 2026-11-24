Run 19b: finish adopting the audit engine (`packages/core`). Two inputs:

1. **`docs/brief/review-notes/audit-engine-reverify-1.md`.** The product lead re-ran every original reproduction against your run-19 code and mutation-tested your regression tests: 14 fixes hold, and every test was meaningful (good work). **10 findings are only partly fixed**; their "Remaining" sections give new reproductions.
2. **`docs/brief/review-notes/audit-engine-review-1.md`, findings 25–47** (the minors), followed by checklist items 1–6 of `19-kiro-review-runs-10-11.md`.

Work in this priority order, save after each item, and add a regression test (fixture page plus `*.int.spec.ts`) for each behaviour fix.

## A. Partly fixed (demo-critical first)
1. **Finding 6 + 5 (checkout.html baseline).** `prepare()`'s marker focus is undone by focusin-based traps: checkout's `restoreFocus` does it, and so do focus-trap libraries and native `<dialog>` from `showModal()`. Then the first element is missing from steps, and its `before` snapshot is the focused look. Fix both:
   - After `prepare()`, check that `activeElement` is body or none. If something is still focused, record it as the first step, and take its baseline by reading the styles with focus moved elsewhere (or through CDP forced pseudo-state `CSS.forcePseudoState` with `:focus` off). Do not rely on blur.
   - Pin this with checkout.html's email input: unfocused `outline-style` is `none` and focused is `solid`, so `before ≠ after`.
2. **Finding 7.**
   - A compliant `aria-modal` dialog that **closes on Escape** must not become a Cursed Loop. When the escape test leaves no focused element because the dialog was removed or hidden, the user did escape: that counts as escapable.
   - Keep `trapDetected` for "no focus, and the cycle's nodes are still present and visible".
   - Amend Req 11.8 in `requirements.md` and `design.md` to say exactly this, and test both shapes.
3. **Finding 1, composites.**
   - Cross-origin iframes and closed shadow roots must not eat the step cap: count the presses spent inside a composite host separately, with a sub-cap of 50 per host, then move past it with Tab and mark the step `compositeTruncated`.
   - A real trap inside a cross-origin frame or closed shadow root should end with `endReason: 'composite-stuck'` plus a `CollectionError`, not silently at the step cap.
4. **Finding 15:** if `guard.race(createContext)` rejects, close the late context when it resolves.
5. **Finding 16:**
   - Meter out-of-process iframe (OOPIF) and worker traffic (`Target.setAutoAttach {flatten: true}`, plus `Network.enable` per session).
   - Add a test for the 50 MB limit that uses a cross-origin iframe.
6. **Findings 12 and 19:** text over non-ancestor positioned layers (img, video, gradient divs painted underneath) must set `backgroundUncertain`. Use `elementsFromPoint` at the text's centre.
   - Replace the weak `/^rgba?\(/` assertion in `collectors.int.spec.ts` task 9.
7. **Finding 20:** remove the dead `detectCycle` (or make `runWalk` use it), so there is one cycle semantic.
8. **Finding 24 and the test gaps listed for 2, 3, 14, 17 and 22:**
   - **Context closed:** a failure-path test that asserts the context was really closed (`browser.contexts().length === 0`).
   - **CSP fixture:** give the CSP fixture a real `transition` (in an external stylesheet), so the "transitions are off" assertion is not vacuous.
   - **Walk-failure path:** test the audit-level `walkOrRecord` → `CollectionError 'tab-walk'` path.
   - **Fallbacks and timeouts:** test the white-background fallback and the per-batch timeout path.
   - **`isFocusable`:** add a direct `isFocusable` assertion.
   - **Inert subtrees:** inert subtrees are not `containsFocusable`.
9. **New edges reported by the verifiers (finding 23 and next to 8 and 10):**
   - Focusables that appear mid-walk (`:focus-within` submenus) need a real `before` baseline, not `{}`.
   - A cycle that can only be left backwards must not loop to the cap.
   - A mid-walk navigation sets `endReason: 'navigated'`.

## B. Then findings 25–47 from the review, and checklist items 1–6 from prompt 19.

## Rules
- Do not weaken any test.
- Do not touch `apps/cursed-shop` or the golden file.
- Do not touch `.kiro/specs/haunting-classifier/`; another run owns it.
- Record every spec deviation in the `tasks.md` Notes.

## Done means
- `npm run typecheck`, `npx vitest --run` and `npx playwright test` in `packages/core` all exit 0, and `apps/cursed-shop` `npm run verify` passes.
- Your final table lists each item from A (1–9) and each finding from 25–47 as "fixed" or "not a defect, because …".
