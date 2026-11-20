Product-lead review of `.kiro/steering/hauntings.md`. The structure is excellent; keep it. Apply these corrections to the steering files (edit in place, keep everything else):

1. **Haunting Score saturates.** With `min(100, rawScore)`, five Wraiths already give 100, so nearly every real site scores 100 and the number becomes meaningless. Replace it with a saturating curve: `score = round(100 * (1 - exp(-rawScore / 120)))`. Keep the weights. Update the invariants: deterministic, order-independent, bounded [0,100], zero baseline, and **monotonic non-decreasing** (rounding means "never decreases", not strictly increasing). Add a 6th invariant: **severity-dominance**, meaning replacing one instance with a more severe one never lowers the score.

2. **Add the signature haunting, "The Veiled".** It is the heart of the demo: content a sighted user sees but assistive tech cannot perceive.
   - Detection:
     - (a) a focusable element inside an `aria-hidden="true"` subtree (axe `aria-hidden-focus`), or
     - (b) visible, non-empty text or a control (non-zero box, not `visibility:hidden`/`display:none`, opacity > 0) whose DOM node has no corresponding AX node or is excluded via `aria-hidden`/`role=presentation|none`.
   - Data: DOM-to-AX mapping via CDP `backendDOMNodeId`.
   - Visual: the element dissolves into thick fog (this is the fog the brief describes; contrast failures keep their own lighter "Fog").
   - Sound: silence (the point is that nothing is announced).
   - WCAG: 1.3.1, 4.1.2.
   - Number it 10 and add it to severity and score rules.

3. **Cursed Loop must test escape.** Before declaring a keyboard trap, the walker must try `Escape`, then `Shift+Tab`. If focus leaves the cycle, it is NOT a trap (a closable modal with `aria-modal="true"` is compliant with 2.1.2). Also: cap the walk at `focusableCount * 2 + 10` steps, and treat focus returning to `body` or the document/browser chrome as the natural end of the walk, not a cycle.

4. **Lost Soul false positives.** `cursor:pointer` is inherited by descendants, so it will flood results.
   - Detect click handlers with CDP `DOMDebugger.getEventListeners` (`click`, `mousedown`, `pointerdown`, `pointerup`), and use `cursor:pointer` only as a supporting signal.
   - Report only the **outermost** such element.
   - Skip anything inside or containing a native interactive element (`button`, `a[href]`, `input`, `select`, `textarea`, `summary`, `[contenteditable]`).

5. **Hollow Portrait:** also skip images with `role="presentation"`/`none` and images not in the AX tree because of `aria-hidden="true"` (that's intentional hiding, unless the image is the only content of a link or button, in which case the parent is a Nameless Spirit).

6. **Invisible Wanderer:** compare outline, `outline-offset`, `box-shadow`, `border-color`, `background-color` and `text-decoration` before vs. after focus (use `:focus-visible` via a real Tab keypress, not programmatic `.focus()`). Any visible change counts as an indicator.

7. **"Core task flow" keyword list:** also include "cart", "add to", "basket", "register" and "subscribe".

Also update `product.md` if it lists haunting counts (there are now 10 hauntings). Summarize your edits when done.
