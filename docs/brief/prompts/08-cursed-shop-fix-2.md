# Cursed Shop fix pass 2 (from independent re-verification)

> **Credits are nearly exhausted, so work strictly in priority order and save after each item:** (1) fix the 6 SVGs (delete the duplicate `cx`/`cy` on line 9; validate the XML), (2) the checkout true trap, (3) the index cookie-banner control, (4) the index Lost Souls, (5) the Hollow Portrait alt fixes, (6) `expected-hauntings.json` + README, then the rest.

Two independent verifiers re-tested the shop in real Chromium against the UPDATED `.kiro/steering/hauntings.md`. Fix **every** item below. Then re-verify yourself with a real Playwright script (`chromium.launch({ channel: 'chromium' })`, the headless shell is not installed) that:
- checks every `<img>` has `naturalWidth > 0`;
- runs a real Tab walk (including the escape test and the cookie-banner control);
- confirms `document.documentElement.scrollWidth === 390` at 390px;
- recomputes every count in `expected-hauntings.json` from the updated rules.

The golden file and README must match reality **exactly** and must not contradict the updated rules.

## 1. [blocker] img/*.svg (index.html, product.html, checkout.html): All 6 candle SVGs are malformed XML, so every product, related, thumbnail and cart image is broken on all pages

**Evidence:** python xml.dom.minidom on each file: 'ExpatError: duplicate attribute: line 9, column 28' (line 9 is `<ellipse cx="120" cy="65" cx="120" cy="65" ...>`). In Chromium every <img> has complete=true and naturalWidth=0 (imgcheck.mjs: index 6/6, product 8/8, checkout 2/2). Screenshots index-grid.png and checkout-1280-nomodal.png show empty grey boxes and broken-image alt text ('Midnight', 'Lavender').

**Fix:** Fix the page assets. In all 6 img/*.svg files, delete the duplicated `cx="120" cy="65"` pair on the wax-surface <ellipse>. Also remove the invalid `font-style="uppercase"` (use font-variant or uppercase text). Move <defs> to the top and draw the glow circle BEFORE the flame path. Validate each file with an XML parser (e.g. `node -e "new DOMParser"` in Playwright, or xmllint) and confirm naturalWidth > 0 for every <img> on all 3 pages.

## 2. [blocker] index.html: The cookie-banner control does not exist: there is no #cookieBanner markup and no banner JS

**Evidence:** trap.mjs: {exists:false, markup:null, anyCookieText:false}. Golden controls.cookieBanner selectors '#cookieBanner' and '#cookieBanner .btn-close' match 0 elements. index.html has only CSS for it (lines 186-230), and the <script> contains only quick-view and add-to-cart handlers. The Tab walk recorded 0 cycles.

**Fix:** Fix the page as in 07-cursed-shop-fix.md §5. Add `<div class="cookie-banner" id="cookieBanner" role="dialog" aria-modal="true" aria-labelledby="cookieText"><p id="cookieText">…</p><button class="btn-close" aria-label="Close cookie banner">×</button><button class="btn">Accept</button></div>` before </body>, without auto-focusing it. Add these handlers:
- keydown on the banner: Escape calls closeCookieBanner(); Tab and Shift+Tab cycle between × and Accept.
- hideBanner() adds .hidden and `inert`.
- closeCookieBanner() returns focus to the focusin relatedTarget, falling back to .hero .btn.
- Persist with sessionStorage inside try/catch.
Verify with a real Tab walk that × → Accept → × cycles and that Escape followed by Shift+Tab leaves the cycle (escapable, so no Cursed Loop). Put any other focusable element after the banner in DOM order so the walk reaches it.

## 3. [blocker] index.html: Lost Soul is 0 (golden 8): the 8 golden targets are native links, so the rule's native skip excludes them

**Evidence:** The golden selectors .product-card:nth-child(1|2|4|6) .card-link and .quick-view resolve to `a.card-link` / `a.quick-view` with href. getEventListeners shows click listeners only on a.quick-view, button.quick-view and button.add-to-cart-btn, all native=true and inWalk=true. The qualifying list is empty. Tab walk steps 10-27 visit every card-link and quick-view.

**Fix:** Fix the page as in §3. For cards 1, 2, 4 and 6:
- Change `<a href=… class="card-link">` to `<div class="card-link">`, with cursor:pointer, no role, no tabindex, and a click listener attached directly to it that navigates to product.html?product=<slug>.
- Change `<a class="quick-view">` to `<div class="quick-view">Quick view</div>` (a sibling of .card-link, not nested in it), with its own direct click listener that opens a display:none quick-view panel containing a named close <button> and a 'View full details' <a>. No alert().
- Keep cards 3 and 5 as <a class="card-link"> and <button class="quick-view">.
Re-verify that getEventListeners finds 8 outermost qualifying elements.

## 4. [blocker] checkout.html: The newsletter modal is not a TRUE keyboard trap: × and 'No thanks' are in the Tab cycle, and Enter or Space on either closes the modal

**Evidence:** trap.mjs:
- Tab x12 cycle: No thanks -> Subscribe -> × -> input -> …
- 'Tab x1 -> No thanks ; Enter -> modalActive=false focus=body' (Space gives the same result).
- 'Tab x3 -> × ; Enter -> modalActive=false' (Space gives the same result).
- Escape alone: still active. Escape then Shift+Tab: focus on × (inside), so the rule still declares a trap (walk endReason trap-declared, 4 cycle members).
Source: `<button class="modal-close" aria-label="Close modal">` and `<button … id="closeModalBtn">` have no tabindex="-1". Because .modal-close comes first in DOM order, the trap query's first element is ×, not the input.

**Fix:** Fix the page as in §4. Add tabindex="-1" to `.modal-close` and `#closeModalBtn`, keeping their click listeners for mouse users. The trap query must then return the input first and Subscribe last. Re-run: Tab and Shift+Tab must cycle input <-> Subscribe only, and Enter/Space on every reachable element, Escape, and Escape+Shift+Tab must all leave modalActive=true with focus inside. Typing an email + Enter already keeps it open, which is correct.

## 5. [blocker] index.html: Hollow Portrait is 6, not 4: the 'decorative' card 3 and card 5 images have no alt attribute at all, so the decorativeImages control is violated

**Evidence:** CDP AX: 6 non-ignored role=image nodes with empty name on img.product-image. axe image-alt lists 6 nodes, including img[src$="candle-meadow.svg"] and img[src$="candle-sea.svg"]. Markup: `<img src="img/candle-meadow.svg" class="product-image" loading="lazy">` with no alt.

**Fix:** Fix the page: add alt="" to the card 3 (meadow) and card 5 (sea) .product-image. Keep the alt attribute absent on cards 1, 2, 4 and 6. The golden count of 4 is correct.

## 6. [blocker] product.html: Hollow Portrait is 0 (golden 4): the 4 related-product images still have alt=""

**Evidence:** `<img src="img/candle-lavender.svg" alt="" class="product-image-related">` (and 3 more). They are AX-ignored and axe reports no image-alt. All 4 golden selectors match 1 element each but none fire.

**Fix:** Fix the page: remove the alt attribute entirely from the 4 `.product-image-related` <img>. Keep alt="" on the 3 .product-thumb and the real alt on #mainImage.

## 7. [blocker] checkout.html: Hollow Portrait is 0 (golden 2): the cart images still have real alt text

**Evidence:** `<img src="img/candle-midnight.svg" alt="Midnight Wood candle" class="cart-item-image">` and alt="Lavender Haven candle". axe has no image-alt violation. The golden selectors match but neither fires.

**Fix:** Fix the page: delete the alt attribute from both .cart-item-image elements, keeping data-sku on the .cart-item.

## 8. [blocker] checkout.html (expected-hauntings.json): Whispering Field is actually 3, golden says 2: the newsletter input is placeholder-only and is a Whispering Field under the updated rule

**Evidence:** CDP name.sources, winning source = placeholder for: input#email (name 'john@example.com'), input#cardNumber ('1234 5678 9012 3456') and the #newsletterForm input ('Your email address'). The other 11 fields win via labelfor or aria-label. The golden controls.namedByPlaceholder ('.modal-form input') and visibleFocusInTrap both point at an element the detector flags.

**Fix:** Fix the golden file, not the page (07 preamble: 'The newsletter email input is placeholder-only too, so it now is a Whispering Field. Remove any namedByPlaceholder control'). Set checkout WhisperingField to count 3, selectors ["#email","#cardNumber","#newsletterForm input[type=email]"]. Delete controls.namedByPlaceholder. Leave #email and #cardNumber as they are (placeholder kept, no label): this is correct under the updated rule, and the conflicting §6 'remove the placeholder' line is overridden.

## 9. [blocker] checkout.html (expected-hauntings.json): Shattered Order is actually 2, golden says 1: the missing <main> is detectable (kind no-main), but the golden file and README claim it is undetectable

**Evidence:** AX landmarks on checkout: [banner, form, contentinfo, navigation, form], with no main. Detected: heading-skip at h4 'Hollow & Vine' (h2→h4) plus no-main. Golden: ShatteredOrder count 1, and controls.noMainUndetectable says 'the missing main landmark is not detectable under current rules', which contradicts hauntings.md §9(c).

**Fix:** Fix the golden file. Set checkout ShatteredOrder to count 2 with selectors [".footer-content > .footer-col:nth-child(1) h4", "body"], and add a parallel "kinds": ["heading-skip","no-main"] array (or a per-instance kind) so the test can match no-main to the document-level instance. Delete controls.noMainUndetectable. Keep the page as is (div.checkout-page).

## 10. [major] product.html: Invisible Wanderer is 21, golden says 9: the 12 footer list links fail rule (a) because the UA auto focus ring is rgb(16,16,16) on the #6d4c41 footer

**Evidence:** Tab walk steps 16-27, for each footer link: outline 'auto 1px rgb(16, 16, 16)', adjacent bg rgb(109,76,65), ratio 2.50 (<3), no other property change, so it counts as invisible. product.html has no footer-link focus rule (only nav, social and icon get outline:none). Screenshot product-footer-link-focused.png: Chromium actually paints a dual-tone ring, so this is a rule-literal false positive a judge would dispute.

**Fix:** Fix the page: product.html should show 9 IW instances, as in the brief. Add `footer a:focus-visible{outline:2px solid #FFF3E0;outline-offset:2px}`, which is about 7:1 on #6d4c41. Exclude .social-link from it, because the outline:none rule must keep winning for social links: use `.footer-col li a:focus-visible`. Add the same rule to checkout.html for consistency. Re-run the walk: product IW must be exactly the 4 nav-links, 2 icon-btns and 3 social-links.

## 11. [major] index.html: The hero 'Explore Collection' button is an Invisible Wanderer (22 vs golden 21) although the golden lists it as a visibleFocus control

**Evidence:** The Tab walk flags step 8 a.btn 'Explore Collection': outline 2px solid rgb(109,76,65) on parent .hero bg rgb(78,52,46), ratio 1.49. Screenshot index-hero-btn-focused.png shows the ring is barely visible.

**Fix:** Fix the page: add `.hero .btn:focus-visible{outline:2px solid #FFF3E0;outline-offset:3px}` after the generic `.btn:focus` rule. Re-run: index IW must be exactly the 21 golden selectors, and .hero .btn must pass (a) with ≥3:1.

## 12. [major] README.md: README contradicts the updated rules and the actual DOM in many places

**Evidence:** - 'Missing main is not detectable … only detects no-main when NO landmarks exist' (Detector Notes), and the checkout control 'Main landmark … not detectable per current rules'. Both contradict hauntings.md §9(c).
- 'Named by placeholder' is listed as a checkout control, but placeholder-only names are Whispering Field.
- The checkout table lists `.modal-form input` as the only Whispering Field and omits #email and #cardNumber (the golden file lists the opposite).
- The Cursed Loop element is given as `.modal-form button.btn`, but the golden says #newsletterModal.
- 'Escape closes banner - Cookie banner' appears under checkout controls, but no banner exists anywhere.
- product `.product-thumb` is listed as Hollow Portrait x3, but they have alt="" and the golden makes them a control. The product Lost Souls are listed as 7, but there are 10 (3 thumbs are missing).
- Contrast claims are wrong: index footer '3.15:1' is actually 2.82, product footer '2.38:1' is actually 2.82, checkout fog '3.15:1' is actually 1.54.
- The index Lost Souls are described as 'Clickable card links / Quick view buttons', but they are native <a>.
- The WCAG table gives Whispering Field as 'AA'; the brief says A.
- 'Mouse-only exits' is claimed, but both exits are Tab-reachable.

**Fix:** Rewrite README.md after the page fixes so that it matches the corrected golden file exactly:
- Remove the 'Missing main is not detectable' section and state that no-main fires (kind no-main).
- Move the newsletter input into the Whispering Field rows next to #email and #cardNumber, and delete the 'Named by placeholder' control.
- Put the cookie-banner control under index.html.
- List product Lost Soul as 10 (3 thumbs, 3 variants, 4 related cards) and the thumbs as a decorative-alt control, not as Hollow Portraits.
- Use the measured contrast ratios (index notes 3.15, footer 2.82; product review-date 2.38, footer 2.82; checkout fog-text 1.54).
- Use #newsletterModal for Cursed Loop and describe it as tabindex=-1 mouse-only exits.
- Set Whispering Field to level A.

## 13. [major] checkout.html: The fixed promo bar still covers the primary 'Checkout with Secure Payment' CTA at 1280x900

**Evidence:** After closing the modal by overlay click: .checkout-btn rect [92,855,486,60], and elementFromPoint at its centre returns 'promo-banner' (screenshot checkout-1280-nomodal.png). body padding is 140px on desktop and 96px under 768px, the reverse of the brief.

**Fix:** Fix the page. Either make .promo-banner non-fixed (e.g. a static strip directly under the header: it keeps aria-hidden and its link, so The Veiled still counts), or move/shrink content so the CTA sits above the bar at first paint. Swap the paddings to body 96px desktop and 140px mobile. Verify that elementFromPoint(CTA centre) === .checkout-btn at 1280x900.

## 14. [major] index.html: Card links render as default blue underlined link text, and the haunted 'Quick view' renders as a plain underlined link rather than the cream pill

**Evidence:** Screenshot index-grid.png: the product titles, prices and notes are underlined in blue, and the Quick view on cards 1, 2 and 4 is a tiny underlined link while cards 3 and 5 show a pill.

**Fix:** Fix the page. Add `.card-link{display:block;color:inherit;text-decoration:none}`. Style `.quick-view` (both the div and button variants) identically as the cream pill at the bottom-right of the image area. Combine this with the Lost Soul restructure above.

## 15. [major] index.html, product.html, checkout.html: The header View Cart button still goes nowhere (brief §12.5)

**Evidence:** trap.mjs: clicking '.nav-icons .icon-btn:nth-child(2)' leaves the URL unchanged on all 3 pages. getEventListeners shows no listener on either icon-btn.

**Fix:** Fix the page: on all 3 pages, attach a click listener to the 2nd .nav-icons .icon-btn that sets location.href='checkout.html'. Keep the button nameless and do not add role or tabindex.

## 16. [minor] index.html, product.html, checkout.html: Inline icon SVGs were not given role="none" focusable="false" (ground rule 3), so the AX tree has unnamed role=image nodes beyond the Hollow Portraits

**Evidence:** Unnamed non-ignored image AX nodes that are inline <svg> with no role: index 11, product 6, checkout 7 (in icon-btn, add-to-cart-btn, social-link, wishlist-btn, checkout-btn, form-hint). My rule-literal detector excludes them because they are role-less SVGs or sole content, but the brief §15.3 check fails and a stricter detector could double-count.

**Fix:** Fix the page: add role="none" focusable="false" to every icon <svg> listed in ground rule 3, on all 3 pages. Re-check that the only unnamed image nodes are the Hollow Portrait <img>s.

## 17. [minor] expected-hauntings.json: Some golden controls violate the one-element selector rule or make false claims

**Evidence:** - checkout controls.visibleFocusInTrap '.modal-actions .btn' matches 2 (No thanks also has class btn).
- index decorativeIcons '.feature-icon' matches 3.
- product decorativeAltNotHollow '.product-thumb' matches 3.
- mouseOnlyNativeExits says 'Modal exits are mouse-only', which is currently false (both are Tab-reachable).

**Fix:** Fix the golden file:
- Use '.modal-actions button[type=submit]'.
- Split the feature icons into '.features-grid .feature:nth-child(N) .feature-icon' for N=1..3.
- Split the thumbs into '.product-thumbnails .product-thumb:nth-child(N)' for N=1..3.
- Keep the mouseOnlyNativeExits description only after tabindex=-1 is added to both exits.

## 18. [minor] checkout.html (expected-hauntings.json): The Cursed Loop golden selector names the overlay, while the detected trap members live in .modal-content

**Evidence:** Trap cycle members: input, No thanks, Subscribe, × (common ancestor and role=dialog: div#newsletterModal > div.modal-content). requirements 11.8 records the member node ids. Golden selector: #newsletterModal.

**Fix:** Fix the golden file by documenting the match rule. Add to $meta: 'CursedLoop instance matches when every trapRegionNodeId is a descendant of the selector'. Alternatively, use '#newsletterModal .modal-content' to name the dialog element itself.

## 19. [minor] product.html: Leftover items from §3/§12: related cards have cursor:auto, stray spaces in URLs, and axe reports an unplanned link-in-text-block violation

**Evidence:** getEventListeners: div.product-card-related cursor=auto (x4). onclick="window.location.href='product.html?product= lavender-haven'" (space after =, x4). axe violations include link-in-text-block (2 breadcrumb links, 1.05:1), which is not one of the expected axe rules.

**Fix:** Fix the page:
- Add `.product-card-related{cursor:pointer}`.
- Remove the space after 'product=' in all 4 onclick URLs.
- Underline the breadcrumb links (`.product-breadcrumb a{text-decoration:underline}`) so axe link-in-text-block passes.

## 20. [minor] index.html: The index Instagram icon still uses the old 'die' path, and Quick view uses alert() instead of a panel

**Evidence:** index.html social-link 1 <path d="M7.8 2h8.4C19.4 2 …"> (the product and checkout pages use the new rect/circle icon). The quick-view handler calls alert('Quick view would open here').

**Fix:** Fix the page: copy the rect/circle Instagram SVG from product.html into index.html. Implement the display:none quick-view panel described in §3 instead of alert().

## 21. [minor] docs/brief §15 axe expectations: The brief's expected axe output is stale against the updated rules: checkout `label` and `aria-hidden-focus` will never show as violations as written

**Evidence:** Checkout axe: there is no label violation, because placeholders satisfy axe's label rule (the fields are kept placeholder-only per the updated rule). aria-hidden-focus on .promo-banner is 'incomplete', not a violation, while the aria-modal dialog is open. index aria-hidden-focus is a violation (1), as expected.

**Fix:** Fix the verification expectations, not the page. In verify.mjs, expect checkout label 0 (Whispering Field comes from the CDP placeholder source, not axe) and accept aria-hidden-focus as incomplete on checkout. Also change verify.mjs to use the absolute file:// imports and channel:'chromium', or start the port-4173 server first.

## 22. [blocker] img/*.svg (index.html, product.html, checkout.html): All 6 candle SVGs are malformed XML, so every product image renders as a broken-image icon

**Evidence:** svgcheck.mjs: loading each img/candle-*.svg directly gives 'error on line 9 at column 90: Attribute cx redefined'. new Image() fires onerror for all 6, and naturalWidth=0 for every <img> in out.json. Line 9 of every file reads `<ellipse cx="120" cy="65" cx="120" cy="65" rx="48" ...>` (grep: 1 hit in each of the 6 files). Screenshots: index-1280-full.png shows 6 grey boxes with broken-image glyphs; product-1280-full.png shows the main image as a 550x26 strip with alt text and an empty left column; checkout thumbnails show alt text 'Midnight'/'Lavender'. No console error or requestfailed event fires under file://, so console checks miss it.

**Fix:** In each of img/candle-midnight.svg, candle-lavender.svg, candle-meadow.svg, candle-cedar.svg, candle-sea.svg and candle-vanilla.svg, change line 9 to `<ellipse cx="120" cy="65" rx="48" ry="10" fill="rgba(255,255,255,0.3)"/>`, removing the duplicated cx/cy. Add width="240" height="240" to the root <svg>. Validate each file with an XML parser, or open it directly in Chromium and confirm no error banner. Optionally move the glow <circle> before the flame <path> so the flame is drawn on top, and lower its cy or r so it is not clipped at y=0.

## 23. [major] product.html: Product page ignores ?product= and always shows Midnight Wood

**Evidence:** nav test: clicking index card 2 navigates to product.html?product=lavender-haven, but h1 reads 'Midnight Wood' (product-from-card2.png). Related cards still use 'product.html?product= lavender-haven', with a space after '='.

**Fix:** Add a small PRODUCTS map (name, price, description, image) and a URLSearchParams lookup on load that sets h1, price, description, #mainImage src/alt and the thumbnails. Trim the param, and remove the space after '=' in the related-card onclick URLs. Make index slugs match the map: index uses 'meadow', 'sea' and 'vanilla', while related cards use 'wildflower-meadow' and 'ocean-breeze'. Keep all haunting plantings unchanged.

## 24. [major] index.html: Product card text renders as default underlined links: title, price and description are underlined in blue/purple

**Evidence:** z-index-card.png: 'Midnight Wood' has a blue underline, '$32.00' is underlined, and the description is purple and underlined. The .card-link rule (index.html:267-270) sets only display:block and cursor:pointer.

**Fix:** Add `text-decoration:none; color:inherit;` to .card-link in index.html. Also style .promo-strip-link (currently default blue #0000EE) to use var(--color-primary) with a subtle underline. Keep its focus behaviour as planted.

## 25. [major] checkout.html: Newsletter 'Subscribe' primary button is still an unstyled browser-default button

**Evidence:** out.json checkout-1280.modalBtns: Subscribe bg rgb(240,240,240), color rgb(0,0,0), border '2px outset rgb(0,0,0)'. checkout-1280-modal-viewport.png shows a grey bevelled button next to the styled 'No thanks'.

**Fix:** In checkout.html add a primary style for the Subscribe button, e.g. `.modal-actions .btn:not(.btn-secondary){background:var(--color-primary,#6D4C41);color:#fff;border:2px solid #6D4C41;}` plus a hover state. Do not change the modal's focus-trap/Escape haunting logic.

## 26. [major] checkout.html: 'Save this payment method' checkbox still renders full-width and centered above its label

**Evidence:** out.json saveCard: checkbox width 486px at 1280 (286px at 390), top 1389, with the label below at top 1414.6. checkout-1280-nomodal-full.png shows a lone checkbox centered at about (923,1363) and the label on the next line.

**Fix:** Exclude checkboxes from the text-input rule, e.g. `.form-group input.proper-label:not([type=checkbox])`. Give #saveCard `width:auto;margin-right:8px` and place the checkbox and label inline in a flex row with align-items:center.

## 27. [minor] checkout.html: At first paint (1280x900) the primary CTA is completely hidden behind the fixed promo bar

**Evidence:** out.json cta: .checkout-btn top 854.75 and bottom 914.9; .promo-banner is fixed with top 849.4 and bottom 900. checkout-1280-nomodal-viewport.png shows no CTA, only the 'Free shipping' badge and then the bar. When scrolled (block start/center/end), elementFromPoint returns checkout-btn, so the body padding-bottom of 140px works once the user scrolls.

**Fix:** Either make .promo-banner non-fixed (a static top bar under the header), or tighten the Order Summary spacing so the CTA sits above y≈840 at 1280x900. Alternatively make the bar dismissible or reduce it to about 36px. Keep aria-hidden/tabindex plantings as they are.

## 28. [minor] index.html (footer): Index footer social icons are still malformed (Instagram looks like a die, Pinterest like a blob), while product and checkout have correct icons

**Evidence:** z-index-footer.png: the first icon is a filled rounded square with dots and the third is a notched circle. product-1280-full.png and checkout-1280-nomodal-full.png footers show a proper Instagram camera outline.

**Fix:** Copy the Instagram and Pinterest <svg> path markup from product.html's footer (around line 819) into index.html's footer (around lines 895-909). Keep index's missing aria-label on the Instagram link if it is a planted Nameless Spirit.

## 29. [minor] all pages (header): The 'cart' header icon is still a plus glyph and clicking it does nothing

**Evidence:** nav test: clicking header .icon-btn[1] on index leaves the URL at index.html. z-index-header and the viewport shots show '+' at the top right.

**Fix:** Replace the cart button's path with a shopping-bag icon and add `onclick="location.href='checkout.html'"`, or wrap it to navigate to checkout.html. Keep it icon-only without aria-label if that is the planted Nameless Spirit.

## 30. [minor] all pages: Stale 2024 dates in a Nov 2026 demo; checkout CTA uses a person icon instead of a lock

**Evidence:** Footer '© 2024 Hollow & Vine', and reviews 'Reviewed on October 15, 2024' (product-1280-full.png). checkout-1280-cta-viewport.png shows a person glyph on 'Checkout with Secure Payment'.

**Fix:** Update the year to 2026 and the review dates to 2026. Swap the CTA icon for a padlock path.


