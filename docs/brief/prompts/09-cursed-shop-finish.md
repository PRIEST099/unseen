Finish the Cursed Shop (`apps/cursed-shop`). Fix pass 2 (`docs/brief/prompts/08-cursed-shop-fix-2.md`) stopped partway when the free plan's credits ran out. The item numbers below refer to that file; read each item there for the evidence and the exact fix.

## Already done in run 08 (verify only; do not redo)
- §1/§22: all 6 SVGs are valid XML.
- §3: cards 1, 2, 4 and 6 use `div.card-link` and `div.quick-view` (4 each), and `alert()` is gone.
- §5: the meadow and sea card images have `alt=""`.
- §16: icon SVGs have `role="none" focusable="false"` on index (11) and product (6). Checkout has 6 and §16 expects 7, so find the missing one.

## Still to do, strictly in this order (save after each)
1. **§4 checkout true trap:** add `tabindex="-1"` to `.modal-close` and `#closeModalBtn`. Tab and Shift+Tab must cycle input ↔ Subscribe only. Enter or Space on every reachable element, Escape, and Escape+Shift+Tab must all leave the modal open with focus inside it.
2. **§2 index cookie-banner control:** there is still no `#cookieBanner` markup or JS. Build it exactly as described in §2. It must be escapable and must NOT count as a Cursed Loop.
3. **§3 remainder:** add the display:none quick-view panel (named close `<button>` and a "View full details" link). Confirm that `getEventListeners` finds exactly 8 qualifying Lost Souls on index.
4. **§6 and §7 Hollow Portraits:** remove the `alt` attribute entirely from the 4 `.product-image-related` images on product and the 2 `.cart-item-image` images on checkout.
5. **§10, §11 focus fixes:** footer-link and hero-button `:focus-visible` rules, so the Invisible Wanderer counts are exactly index 21 and product 9.
6. **§23 product page reads `?product=`:** add a PRODUCTS map and a URLSearchParams lookup, and make the slugs match between index and related cards.
7. **§13/§27 promo bar:** make `.promo-banner` a static strip (it keeps `aria-hidden` and its link). `elementFromPoint` at the CTA centre must return `.checkout-btn` at 1280×900.
8. **§14/§24 card styling, §25 Subscribe button, §26 checkbox row, §15/§29 cart icon navigates to checkout, §19 related cards cursor and breadcrumb underline, §28 index social icons, §30 dates (checkout still says 2024) and lock icon.**
9. **§8, §9, §17, §18 golden file:**
   - checkout WhisperingField = 3
   - checkout ShatteredOrder = 2, with `kinds`
   - delete the stale controls
   - one-element selectors
   - add the CursedLoop match rule to `$meta`
10. **§12 README:** rewrite it so it matches the golden file exactly.
11. **§21 verify.mjs: rewrite it.** Today it calls `axe.run(page)`, but `@axe-core/playwright`'s default export is `AxeBuilder`, so the call throws. It also needs an external server, and it exits 0 even on failure. The rewrite must:
    - use `new AxeBuilder({ page }).withTags([...]).analyze()`
    - launch with `channel: process.env.UNSEEN_CHROMIUM_CHANNEL || 'chromium'`
    - serve the folder itself on a random port, or use `file://` URLs
    - implement every check in the definition of done below
    - set `process.exitCode = 1` on any mismatch, and use `.catch(e => { console.error(e); process.exit(1) })`

    Add `"verify": "node verify.mjs"` to `apps/cursed-shop/package.json`. Cross-check your results with the product lead's probes in `docs/brief/review-notes/probes/` (see their README).
12. **References and WCAG levels:** in `expected-hauntings.json` `$meta.walkNote` and the README, the trap stop rule is **Req 11.8**, not 11.6. The README's WCAG table must match `hauntings.md` and WCAG exactly:
    - Whispering Field: 1.3.1 and 3.3.2 (Level A) and 4.1.2
    - Shattered Order: 1.3.1 (A) and 2.4.6 (AA)
    - Nameless Spirit: 4.1.2, 2.4.4 and 1.1.1

    Any label count stated in the README must match the DOM.

## Definition of done
Run `apps/cursed-shop/verify.mjs` with `chromium.launch({ channel: 'chromium' })`. It must:
- confirm every `<img>` has `naturalWidth > 0`
- run a real Tab walk with the escape test, covering both the cookie banner (escapable) and the newsletter modal (true trap)
- confirm `scrollWidth === 390` at 390px
- recompute every count in `expected-hauntings.json` from the updated `.kiro/steering/hauntings.md`

Every count must match. Paste the per-page table of expected vs. measured counts as your final message. If credits run low, stop after a numbered step and say which step is next.
