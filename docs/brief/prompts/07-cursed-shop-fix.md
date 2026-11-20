# Cursed Shop fix pass (from independent review)

> **Read first.** `.kiro/steering/hauntings.md` was just updated (Run 06). **Where this punch list conflicts with the updated rules, the updated `hauntings.md` wins.** In particular:
> - **Whispering Field:** do NOT remove placeholders. Make `#email` and `#cardNumber` realistic **placeholder-only** fields (delete their `<label>`, keep the `placeholder`, add no other name). The newsletter email input is placeholder-only too, so it now **is** a Whispering Field. Remove any `namedByPlaceholder` control.
> - **Shattered Order:** remove `<main>` from `checkout.html` (a missing main now counts, `kind: no-main`). Keep `product.html`'s `h1` to `h4` skip.
> - **The Veiled:** decorative `aria-hidden` icons are now correct practice and not flagged. Only hidden subtrees with visible text or focusable elements count.
> - **Invisible Wanderer:** a white outline on a white header is invisible and now counts.
> - **Recompute every count** in `expected-hauntings.json` from the updated rules, then verify by running axe-core and dumping the Chromium AX tree on each page (scripts in `apps/cursed-shop/scripts/verify.mjs` are fine). The counts table at the end of this document is a guide only; the updated rules decide.

---
# Fix `apps/cursed-shop`: make the hauntings real, make the shop look premium, make the golden file true

You are fixing `apps/cursed-shop` (index.html, product.html, checkout.html, img/*.svg, expected-hauntings.json, README.md). **Do NOT edit `.kiro/steering/hauntings.md`**: it is the source of truth and every planted haunting must fire under its rules as written. Three independent reviews (visual, AX/axe, keyboard) found that most planted hauntings don't fire, and that the golden counts and selectors don't match the DOM. Evidence (not committed) was in the product lead's local folder `<scratch>/shop-review/` (visual/, hauntings/, keyboard/, merge/).

Facts verified in Chromium (Playwright 1.65), which these fixes rely on:
- A placeholder becomes the accessible name (`name.sources: placeholder`).
- `<svg role="none" focusable="false">` inside a button or link is AX-ignored, so the parent stays nameless.
- A text caption `<div>` next to an `<input>`, not linked to it, leaves the input's name as "".
- The open `aria-modal` newsletter dialog does NOT cause Chromium to ignore background AX nodes.
- Per `.kiro/specs/audit-engine/requirements.md` 11.6, the Tab walker **stops** when it declares a trap.

---

## 0. Ground rules (apply everywhere)
1. **Counting unit = one DOM element per instance.** In expected-hauntings.json, for every haunting, `selectors.length === count`, and every selector must match **exactly one** element (`document.querySelectorAll(sel).length === 1`). Do not use `[aria-label=…]` in selectors, and do not use one group selector for many elements.
2. Every page lists **all 10 haunting keys**: NamelessSpirit, HollowPortrait, TheFog, LostSoul, CursedLoop, InvisibleWanderer, WhisperingField, SilentTongue, ShatteredOrder, TheVeiled. Use `{"count":0,"selectors":[]}` when a haunting is absent.
3. **Decorative inline SVGs:** every inline `<svg>` used as an icon (icon-btn, add-to-cart-btn, social-link, wishlist-btn, checkout-btn, the form-hint shield, feature icons) gets `role="none" focusable="false"`. Remove any `aria-hidden="true"` from them. The only aria-hidden elements left on the site are the intentional The Veiled instances in §10. Do not add `<title>` to any SVG.
4. **No gradient or background-image on any element that is an ancestor of text.** The auditor's contrast walk skips gradients and climbs to the ancestor (cream `#f5f0eb`), so white hero text would become a false Fog. Put decorative gradients and glows on a `::before`/`::after` layer, and give the text container a solid `background-color`.
5. Replace `transition: all …` on links and buttons with explicit properties (`color, background-color, border-color, transform`). Never transition `outline*` or `box-shadow`, because mid-transition reads make the focus detection flaky.
6. Add `button, input, select, textarea { font: inherit; }` at the top of every page's `<style>`. This stops Arial leaking into the main CTA, the Remove links, the select and the modal buttons.
7. Remove `<strong>` from inside every Fog paragraph (`.footer-bottom p` on all pages), so each Fog element is a single text node.
8. Do not add any new aria-hidden element, aria-label, or focusable element that isn't listed below. For example, no aria-hidden cart-count badge and no hamburger button. Any of these would change the counts.

## 1. Nameless Spirit (blocker): currently 0 on every page
- On all 3 pages, remove `aria-label` from both header `.nav-icons .icon-btn` buttons (Search, View Cart) and from the **first** footer `.social-link` (Instagram). Keep `aria-label` on Facebook and Pinterest; those two are named controls.
- index.html: remove `aria-label` from all 6 `.add-to-cart-btn`.
- Keep the wishlist button and the checkout CTA named.
- Target counts: index 9, product 3, checkout 3.

## 2. Hollow Portrait (blocker): currently 0, because every image has `alt=""` or real alt text
- index.html: **remove the `alt` attribute entirely** from the `.product-image` in cards 1, 2, 4 and 6. Keep `alt=""` on cards 3 and 5; they are the decorative control. Drop the `no-alt` class or apply it only to those 4 images.
- product.html: remove `alt` from all 4 `.product-image-related`. Keep `alt=""` on the 3 `.product-thumb`; they are a control (decorative alt, and also Lost Souls). Keep a real alt on the main product image.
- checkout.html: remove `alt` from both `.cart-item-image`. Add a realistic `data-sku` to each `.cart-item` (`data-sku="HV-MW-08"` for Midnight Wood and `data-sku="HV-LH-08"` for Lavender Haven) so the selectors are stable.
- Target counts: index 4, product 4, checkout 2.

## 3. Lost Soul (blocker)
**index.html (currently 0).** The clickable card divs contain the native add-to-cart `<button>`, so the skip rule excludes them. Also, clicking Add-to-cart currently bubbles up and navigates away.
- Restructure **all 6 cards** so the visual layout stays identical: `<div class="product-card">` containing [link-area] + `<div class="quick-view">`/`<button class="quick-view">` + `<div class="product-info product-info--bottom"><div class="product-actions">…add-to-cart button…</div></div>`.
- **Cards 1, 2, 4, 6 (haunted):**
  - link-area = `<div class="card-link">` wrapping the `<img>` and a `.product-info--top` block (h3 title, price, `.product-note`). Attach a `click` listener **directly to each `.card-link`** that navigates to `product.html?product=<slug>`. Give it `cursor:pointer`, no role, no tabindex.
  - Add a sibling (NOT nested in `.card-link`) `<div class="quick-view">Quick view</div>`: an always-visible small cream pill at the bottom-right of the image area, `cursor:pointer`, no role, no tabindex, with its own direct click listener. The listener opens a quick-view panel. The panel is `display:none` until opened, and contains a named close `<button>` and a "View full details" `<a>`, both with visible focus.
- **Cards 3, 5 (controls):** link-area = `<a class="card-link" href="product.html?product=<slug>">` (style `color:inherit;text-decoration:none`, with a visible `:focus-visible{outline:2px solid var(--color-primary);outline-offset:4px}`). Quick view = `<button type="button" class="quick-view">Quick view</button>` with a visible focus style.
- Remove the `clickable` class, `data-product` and the click listener from the outer `.product-card`. There must be no delegated listener on `.product-grid` or `document`. Keep the hover lift with `.product-card:hover{transform:translateY(-4px)}`. Add-to-cart keeps its checkmark feedback, extended to about 1200ms. CSS: `.product-info--top{padding:20px 20px 0}` and `.product-info--bottom{padding:0 20px 20px;margin-top:auto}`. Make the card a flex column so the bottom rows align.
- Target count: 8.

**product.html (currently 10, golden says 4).** Keep all 10; they are realistic.
- 3 `.product-thumb` (inline onclick), 3 `.variant-option` divs, and 4 `.product-card-related`.
- Add `cursor:pointer` to `.product-card-related`.
- Remove the stray space in the 4 related onclick URLs (`product.html?product= lavender-haven` becomes `product.html?product=lavender-haven`, and the same for the others).
- Delete the dead `.variant-option:focus` CSS.

**checkout.html:** stays 0. Don't add any non-native click targets.

## 4. Cursed Loop (blocker): checkout.html must be a TRUE 2.1.2 trap
Currently Tab then Enter on "No thanks" or × closes the modal, submitting the form closes it, and the modal opens on a 1s timer.
1. Line ~775: `<button class="modal-close" aria-label="Close modal" tabindex="-1">&times;</button>`
2. Line ~785: `<button type="button" class="btn btn-secondary" id="closeModalBtn" tabindex="-1">No thanks</button>`. Both stay mouse-clickable. They are native buttons, so they are not Lost Souls.
3. Focusable query in the trap: `modal.querySelectorAll('input, button:not([tabindex="-1"]), [href]:not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])')`. The result must be first = the email input and last = Subscribe.
4. Make the trap **document-level** so it doesn't depend on where the walker starts:
   - a `document` keydown handler cycles Tab and Shift+Tab between the input and Subscribe while the modal is active;
   - a `document` `focusin` handler moves focus back to the email input whenever focus lands outside `.modal-content` while the modal is active.
   - Add **no** Escape handler.
5. Newsletter submit must NOT close the modal: `e.preventDefault(); input.value=''; input.placeholder='Thanks! Check your inbox.'; input.focus();`. Remove the `alert()` and `closeModal()` calls from it.
6. Open the modal **synchronously** at the end of the script (no `load`/`setTimeout`): `modal.classList.add('active'); modal.querySelector('input').focus();`. Keep the CSS fade-in.
7. Mouse exits stay: the × click, the "No thanks" click and the overlay click.
8. Give Subscribe and the input a clearly visible focus style (see §12 `.btn:focus-visible`).
- Expected result: Tab and Shift+Tab cycle input↔Subscribe only, Escape does nothing, and the walker declares a trap and stops. Golden `CursedLoop` count 1, selector `#newsletterModal`.

## 5. Cookie banner control (blocker): index.html must be a closable dialog that is NOT flagged
1. Markup: `<div class="cookie-banner" id="cookieBanner" role="dialog" aria-modal="true" aria-labelledby="cookieText">`, with the `<p>` given `id="cookieText"`. Keep its DOM position. **Do not** auto-focus it on load.
2. CSS: `.cookie-banner.hidden{transform:translateY(100%);visibility:hidden;transition:transform .3s ease,visibility 0s linear .3s}`, so a dismissed banner leaves the Tab order.
3. JS:
   - `hideBanner()` adds `.hidden` and the `inert` attribute.
   - `closeCookieBanner()` calls `hideBanner()`, then focuses `returnFocusTo` (captured from `focusin` `e.relatedTarget` when focus enters the banner from outside), falling back to `.hero .btn`.
   - A `keydown` handler on the banner: Escape calls `closeCookieBanner()`; Tab and Shift+Tab cycle between × and Accept.
   - Accept and × both close the banner.
   - Persist with **sessionStorage**, wrapped in try/catch. On load, the restore path calls `hideBanner()` only, which never steals focus.
- Expected result: × → Accept → × cycles; Escape closes the banner and focus leaves the cycle, so it is not a Cursed Loop.

## 6. Whispering Field (blocker): currently 0, because #email and #cardNumber have `<label for>`
- checkout.html: delete `<label for="email">` and `<label for="cardNumber">`. Replace each with a visible `<div class="field-caption">Email Address</div>` / `<div class="field-caption">Card Number</div>` styled exactly like the labels. **Also remove the `placeholder` attribute** from `#email` and `#cardNumber`, because Chromium uses a placeholder as the accessible name.
- Do not add title, aria-label, aria-labelledby or a wrapping label. Optionally rename the class `placeholder-only` to `unlabelled-field`, and keep its focus style.
- The newsletter input keeps its placeholder, so it is named and does not count.
- index.html WhisperingField becomes 0. The 3 social links were never textboxes.
- Target count: checkout 2 (`#email`, `#cardNumber`).

## 7. Invisible Wanderer (major)
Chromium's UA focus style changes `outline-offset` 0→1px on links even under `outline:none`, so the detector currently sees "visible" focus on every link.
- index.html: `.footer-col a:focus, .nav-link:focus, .icon-btn:focus { outline: none; outline-offset: 0; }`. Keep `.add-to-cart-btn` as a **visible-focus control**: remove it from the outline:none rule, and keep its `:focus-visible` 2px outline.
- product.html: `.nav-link:focus, .social-link:focus, .icon-btn:focus { outline: none; outline-offset: 0; }`. This replaces the white-on-white `.icon-btn:focus{outline:2px solid #fff}`.
- checkout.html: `.nav-link:focus, .social-link:focus, .icon-btn:focus { outline: none; outline-offset: 0; }`. Remove `.promo-link` from that rule and give it a visible focus outline, so it is only The Veiled.
- New index elements (`.promo-strip-link`, card links 3 and 5, quick-view buttons 3 and 5) all get visible focus styles.
- Target counts:
  - index 21: 4 nav-link, 2 icon-btn, 3 social-link, 12 footer list links.
  - product 9: 4 nav-link, 2 icon-btn, 3 social-link.
  - **checkout 0**, because the walk starts inside the trap and stops there (requirements 11.6). The 9 outline-less header and footer links are unreachable by Tab. Document this in the golden `notes` and in the README.

## 8. The Fog (blocker for index, major for product and checkout)
- index.html: `.product-note{color:#9e8e87}` (3.15:1 on #fff, fails at normal size; keep the font-size under 18px). Fog = 6 notes + `.footer-bottom p` = 7. Delete the bogus `.product-grid .product-note:nth-child(4)` selector.
- product.html:
  - `.detail-item` text → `#5d4f49` (6.9:1 on #f5f0eb, passes).
  - Star colour `#f57c00` → `#9a4800` (5.6:1, passes) in both rules (~lines 177 and 382).
  - Keep `.review-date` at `#a89b95` (2.38:1): planted.
  - Fog = 3 review dates + footer p = 4.
- checkout.html:
  - `.remove-btn{color:var(--color-secondary);text-decoration:underline;text-underline-offset:3px}` (#8d6e63 is 4.62:1, passes).
  - `.promo-link{background:#fff;color:var(--color-primary)}`, hover `#FFF3E0`.
  - Make sure `.promo-text` and `.badge-free` pass ≥4.5:1.
  - Change the second fog line's text to "Secure checkout powered by our payment partner. We never store your full card number." (no real brands).
  - Fog = the 2 `.footer-bottom p.fog-text` = 2.

## 9. Shattered Order (blocker)
- **product.html:** insert `<h4 class="details-heading">Product details</h4>` immediately before `<div class="product-details">` (this is the h1→h4 skip). Change the 4 related card titles from `<h4 class="product-title-related">` to `<h3 class="product-title-related">`, and update the CSS, so this is the only skip. Resulting order: h1, h4, h2, h2, h3×4, footer h4×4.
  - Golden: count 1, `.product-info h4.details-heading`.
  - Delete `controls.headingOrder`, and set `controls.hasMain.selectors` to `["main"]`.
- **checkout.html:** change `<main class="checkout-page">…</main>` to `<div class="checkout-page">…</div>` (realistic missing landmark).
  - The current rule only fires when NO landmarks exist, so the missing `<main>` is **not detectable** on its own. Say so honestly in the README.
  - The detectable instance is the existing h2→h4 jump into the footer: golden count 1, `.footer-content > .footer-col:nth-child(1) h4`.
  - Change the hasH1 control to `.checkout-page h1.section-title`, and fix the CSS that targets `h2.section-title` so the h1 is styled.

## 10. The Veiled (blocker for index, major for checkout)
- **index.html:** add right after `</header>`: `<div class="promo-strip" aria-hidden="true"><p>Autumn sale: 20% off all candles this week</p><a href="#products" class="promo-strip-link">Shop the sale</a></div>`. Use a solid background with passing contrast. The link stays focusable and gets a visible focus style. Count 1: `.promo-strip`.
- Change the 3 `.feature-icon` SVGs from `aria-hidden="true"` to `role="presentation" focusable="false"`. hauntings.md excludes role=presentation with no focusable children, while visible aria-hidden SVGs would be flagged.
- **checkout.html:**
  - Restructure as `<div class="promo-banner" aria-hidden="true"><span class="promo-text">Free shipping on orders over $50!</span><a href="#" class="promo-link">Shop Now</a></div>`. Remove `tabindex="-1"` from the link, and **delete** the off-screen `.hidden-from-ax` span and its "Hidden Link".
  - Add a visible badge in the order totals next to the Shipping row: `<span class="badge-free" aria-hidden="true">Free shipping</span>` (pill, passing contrast, no focusables).
  - Count 2: `.promo-banner`, `.badge-free`.

## 11. Silent Tongue (blocker: present but missing from golden)
- checkout `<html>` keeps no `lang`. Golden: checkout `{"count":1,"selectors":["html"]}`, index and product count 0, plus a `hasLang` control `html[lang="en"]`.

## 12. Visual: make it look premium (blocker/major)
1. **Mobile header (blocker; scrollWidth is 485 at 390px).** In each page's `@media (max-width:768px)`:
   - `.header-inner{flex-wrap:wrap;gap:8px 16px}`
   - `.logo{font-size:1.35rem;white-space:nowrap}`
   - `.nav{order:3;width:100%;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 12px}` (no overflow:auto)
   - `.nav-link{font-size:.9rem}`
   - `.nav-icons{gap:4px;margin-left:auto}`
   - Safety net: `html{overflow-x:clip}`. Use **clip, not hidden**, which would break the sticky summary.
   - Check: `document.documentElement.scrollWidth === 390` on all 3 pages.
2. **Candle art (blocker).** Redraw all 6 `img/*.svg` as square `viewBox="0 0 240 240"` apothecary jars, with everything inside the box:
   - a muted full-bleed backdrop;
   - a tumbler of about x70 y90 w100 h120 rx14 with a vertical gradient sheen, plus a lighter wax-surface ellipse;
   - a wick and a teardrop flame at about y58–88 (radialGradient #FFE082→#FF8F00). Draw the glow **before** the flame, inside the viewBox;
   - a cream label about 80 wide, with the small-caps name at font-size 10–11 using `textLength`/`lengthAdjust="spacingAndGlyphs"`, and the sub-name at 8.
   - Palettes: Midnight Wood = espresso/charcoal glass #3E2C25 with a gold accent (not pink); Lavender = dusty lilac; Meadow = sage; Cedar = forest green; Sea = slate blue; Vanilla = warm amber.
   - Keep the filenames.
   - index `.product-image` and product `.product-image-related`: `object-fit:contain;background:var(--color-accent);padding:16px 0`.
3. **Hero (major).**
   - `<main id="products" class="container products">` (restores the 60px padding).
   - Drop the stray-path SVG background. `.hero{position:relative;background-color:#4e342e}` with the glow on `.hero::before` (radial rgba(255,183,77,.25) + linear #3E2723→#6D4C41, `z-index:0`), and content at `position:relative;z-index:1`.
   - Add the eyebrow `<p class="eyebrow">Small-batch · Pacific Northwest</p>` (letter-spacing .2em, uppercase, .8rem).
   - Explore Collection button: `background:#FFF3E0;color:#3E2723`.
   - Keep the h1 text.
4. **Checkout polish (major).**
   - Add the base `.btn` / `.btn:hover` rules from index.html, plus `.btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}` and `.modal-actions .btn-secondary{border-radius:var(--radius)}`.
   - `.modal-form input{border:1px solid #d7ccc8;border-radius:var(--radius)}`.
   - Checkbox: `.form-group input[type=checkbox]{width:auto;padding:0;margin:0;accent-color:var(--color-primary)}`, with its `.form-group` given a new class `form-group--inline{display:flex;align-items:center;gap:8px}`. Keep the id, for and class.
   - `.checkout-container{align-items:start}`, and make the Order Summary card `position:sticky;top:96px`.
   - Add `margin-bottom:24px` under the Shipping and Payment h2s, and remove one of the two stacked divider rules under the cart items.
   - Promo bar: `body{padding-bottom:96px}` (140px under 768px), `html{scroll-padding-bottom:110px}`, `.promo-banner{padding:12px 20px}`, `.promo-text{font-size:1rem}`. The CTA must not be covered at 1280×900: check `elementFromPoint` at the CTA centre returns the CTA.
5. **Path to checkout (major).** On all pages, attach `click` to the header View Cart button (the 2nd `.nav-icons .icon-btn`) that navigates to `checkout.html`. Keep it nameless. product.html `addToCart()`: after "Added!", navigate to `checkout.html` after about 900ms.
6. **Footer social icons (major).** Replace the paths with clean 24×24 stroke icons (`fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round`). Instagram = `<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>`; use a simple Facebook "f" and a circle-plus-P Pinterest. Keep the `<a class="social-link">` wrappers and hrefs, and the aria-labels on links 2 and 3 only.

## 13. Rewrite expected-hauntings.json exactly (one selector per instance)
Add a top-level `"$meta": {"countUnit":"element","selectorRule":"each selector matches exactly 1 element","walkNote":"checkout Tab walk starts inside the newsletter trap and stops when the trap is declared (requirements 11.6)"}`. Then:
- **index.html.hauntings**
  - NamelessSpirit 9: `.nav-icons .icon-btn:nth-child(1)`, `.nav-icons .icon-btn:nth-child(2)`, `.product-grid .product-card:nth-child(N) .add-to-cart-btn` for N=1..6, `.social-links .social-link:nth-child(1)`
  - HollowPortrait 4: `.product-grid .product-card:nth-child(N) .product-image`, N∈{1,2,4,6}
  - TheFog 7: `.product-grid .product-card:nth-child(N) .product-note` for N=1..6, `.footer-bottom p`
  - LostSoul 8: `.product-grid .product-card:nth-child(N) .card-link` and `.product-grid .product-card:nth-child(N) .quick-view`, N∈{1,2,4,6}
  - CursedLoop 0
  - InvisibleWanderer 21: `.nav .nav-link:nth-child(1..4)`, `.nav-icons .icon-btn:nth-child(1..2)`, `.social-links .social-link:nth-child(1..3)`, `.footer-content > .footer-col:nth-child(C) li:nth-child(L) a` for C=2..4, L=1..4 (written out individually)
  - WhisperingField 0, SilentTongue 0, ShatteredOrder 0
  - TheVeiled 1: `.promo-strip`
- **index.html.controls:**
  - cookieBanner (`#cookieBanner`, `#cookieBanner .btn-close`), description "role=dialog cookie banner that cycles focus and closes on Escape; must NOT be a Cursed Loop"
  - decorativeImages (cards 3 and 5 `.product-image`)
  - accessibleCardLinks (cards 3 and 5 `a.card-link`)
  - namedQuickView (cards 3 and 5 `button.quick-view`)
  - visibleFocus (`.logo`, `.hero .btn`, `.promo-strip-link`, card 1 `.add-to-cart-btn`)
  - decorativeIcons (`.feature-icon`)
  - namedSocialLinks (social-link 2 and 3)
  - hasMain `main`, hasH1 `.hero h1`, hasLang `html[lang="en"]`
- **product.html.hauntings**
  - NamelessSpirit 3: icon-btn 1 and 2, social-link 1
  - HollowPortrait 4: `.product-card-related:nth-child(N) .product-image-related` N=1..4 (prefix with the real related-grid container class)
  - TheFog 4: `.reviews-grid .review:nth-child(N) .review-date` N=1..3, `.footer-bottom p`
  - LostSoul 10: `.product-thumbnails .product-thumb:nth-child(1..3)`, `.variant-options .variant-option:nth-child(1..3)`, related cards 1..4
  - CursedLoop 0
  - InvisibleWanderer 9: nav 1..4, icon-btn 1..2, social 1..3
  - WhisperingField 0, SilentTongue 0
  - ShatteredOrder 1: `.product-info h4.details-heading`
  - TheVeiled 0
- **product.html.controls:**
  - hasMain `main`, hasH1 `.product-title`, hasLang
  - decorativeAltNotHollow (3 thumbs)
  - visibleFocus (`.quantity-select`, the Add to Cart `.btn`, `.wishlist-btn`)
  - namedField (the quantity select)
- **checkout.html.hauntings**
  - NamelessSpirit 3: icon-btn 1 and 2, social-link 1
  - HollowPortrait 2: `.cart-item[data-sku="HV-MW-08"] .cart-item-image`, `.cart-item[data-sku="HV-LH-08"] .cart-item-image`
  - TheFog 2: `.footer-bottom p.fog-text:nth-child(1)`, `.footer-bottom p.fog-text:nth-child(2)`
  - LostSoul 0
  - CursedLoop 1: `#newsletterModal`
  - InvisibleWanderer 0 (+ note: 9 outline-less links are behind the trap)
  - WhisperingField 2: `#email`, `#cardNumber`
  - SilentTongue 1: `html`
  - ShatteredOrder 1: `.footer-content > .footer-col:nth-child(1) h4`
  - TheVeiled 2: `.promo-banner`, `.badge-free`
- **checkout.html.controls:**
  - hasH1 `.checkout-page h1.section-title`
  - properLabels (the existing 10 ids)
  - namedByPlaceholder `#newsletterForm input[type=email]`
  - visibleFocusInTrap (the newsletter input and Subscribe)
  - mouseOnlyNativeExits `#newsletterModal .modal-close`, `#closeModalBtn`, which must NOT be Lost Souls
  - noMainUndetectable (description only)

## 14. Rewrite README.md to match reality exactly
- Remove the false claims ("global `*:focus`", "3.5:1", social links as Whispering Field, "proper heading hierarchy" on product, "Main landmark" on checkout).
- One table per page with columns: Page | Element (exact selector) | Haunting | WCAG | Why it's realistic. Add one row per golden instance, or one row per group with the count.
- A per-page count summary matching §13.
- A controls section.
- A "Detector notes" section covering:
  - why checkout Invisible Wanderer = 0;
  - that the missing `<main>` is not detectable under the current rule;
  - that the checkout trap opens synchronously and has mouse-only exits;
  - that the placeholder is the accessible name in Chromium.
- Fix the WCAG level table: Whispering Field A, Shattered Order A (1.3.1), Invisible Wanderer AA (2.4.7).

## 15. Re-verify before you report done (required)
For each page, at 1280×900 and 390×844, via Playwright plus `@axe-core/playwright` (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa):
1. Every golden selector matches exactly 1 element, and `selectors.length === count`.
2. **Run axe on each page.** Expected violations and node counts, with nothing else:
   - index: button-name 8, link-name 1, image-alt 4, color-contrast 7, aria-hidden-focus 1
   - product: button-name 2, link-name 1, image-alt 4, color-contrast 4
   - checkout: button-name 2, link-name 1, image-alt 2, color-contrast 2, label 2, html-has-lang 1, aria-hidden-focus 1
   - With best-practice heading-order: product 1, checkout 1.
3. CDP `Accessibility.getFullAXTree`: no unnamed role `image` nodes except the Hollow Portrait `<img>`s.
4. A real Tab walk:
   - index: × → Accept → × cycles, and Escape plus Shift+Tab leaves the banner;
   - checkout: the first Tab from body lands in the modal, the cycle is input↔Subscribe, Escape plus Shift+Tab stays inside, and Tab then Enter cannot close it;
   - the Invisible Wanderer elements show no computed change in outline, outline-width, outline-offset, box-shadow, border-color, background-color or text-decoration.
5. `scrollWidth === 390` on all 3 pages at mobile width, and no console errors.
6. Screenshot all pages at both widths and confirm they look premium.

Report the final per-page counts table and the axe output.

