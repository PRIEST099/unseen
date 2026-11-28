# Cursed Shop re-verification (after Kiro fix pass 1)

> Evidence paths below of the form `<scratch>/...` were on the local build machine and are not committed. The reusable probe scripts are in [`probes/`](probes/README.md).

**Haunting verifier:** demo_ready=False

Not demo-ready. I re-verified in Chromium (Playwright 1.65.1, axe-core 4.14.1) with my own script, which implements the updated hauntings.md rules. It uses the CDP AX tree with name.sources, axe (wcag2a/aa/21a/21aa/22aa), DOMDebugger.getEventListeners with the outermost and native-skip rules, and a real Tab walk. The walk starts after networkidle + 1500 ms, disables transitions, runs the Escape then Shift+Tab escape test, segments the walk after an escapable cycle, and uses the contrast-aware focus-indicator test.

These match the golden file on every page: Nameless Spirit (9/3/3), The Fog (7/4/2), Silent Tongue, The Veiled, product Lost Soul (10) and product Shattered Order. Mobile scrollWidth is 390 on all 3 pages, and there are no console errors.

The fix pass left these broken:

1. **Broken product images.** All 6 img/*.svg files are malformed XML (duplicate cx/cy attributes), so every product image fails to load (naturalWidth 0) on all pages.
2. **No cookie banner on index.html.** The markup is missing entirely; only the CSS exists. The cookieBanner control selectors match 0 elements.
3. **Index Lost Soul is 0, not 8.** The card-link and quick-view elements on cards 1/2/4/6 are native `<a href>` elements, so the rule skips them.
4. **The checkout modal is not a true trap.** The rule still detects it (Escape then Shift+Tab stays inside), but Tab reaches "No thanks" and ×, and Enter or Space on either closes the modal.
5. **Hollow Portrait counts are wrong on every page.** index 6 vs 4 (cards 3 and 5 have no alt at all), product 0 vs 4 (related images have alt=""), checkout 0 vs 2 (cart images still have real alt text).
6. **Invisible Wanderer extras.** index has 1 extra: the hero .btn outline is 1.49:1 on the brown hero, and that button is a visibleFocus control. product has 12 extra footer links: the UA auto ring is rgb(16,16,16) on the #6d4c41 footer, which is 2.50:1 under rule (a).
7. **The golden file and README are stale against the updated rules.** checkout Whispering Field is actually 3 (the newsletter input is placeholder-only). checkout Shattered Order is actually 2 (heading-skip plus no-main). The README, the noMainUndetectable control and the namedByPlaceholder control still claim the opposite.

Also: the checkout CTA is covered by the fixed promo bar at 1280x900, View Cart goes nowhere, and the card links render blue and underlined.

Files are in <scratch>/shop-reverify/verifier/:
- Scripts: audit.mjs, trap.mjs, imgcheck.mjs
- Output: report.json, details.txt, trap.log
- Screenshots: index-grid.png, checkout-1280-nomodal.png, index-hero-btn-focused.png, product-footer-link-focused.png, *-390.png

Nothing under the-unseen was modified. Note that expected-hauntings.json was last written at 01:18, about 2 minutes before this run.

## Actual vs golden counts

| Haunting | index actual / golden | product actual / golden | checkout actual / golden |
|---|---|---|---|
| NamelessSpirit | 9 / 9 OK | 3 / 3 OK | 3 / 3 OK |
| HollowPortrait | **6 / 4** (cards 3 and 5 have no alt) | **0 / 4** (related images alt="") | **0 / 2** (cart images have real alt) |
| TheFog | 7 / 7 OK (notes 3.14-3.15, footer 2.82) | 4 / 4 OK (review-date 2.38, footer 2.82) | 2 / 2 OK (fog-text 1.54) |
| LostSoul | **0 / 8** (card-link and quick-view are native `<a>`) | 10 / 10 OK | 0 / 0 OK |
| CursedLoop | 0 / 0 OK (no cycles; cookie banner missing) | 0 / 0 OK | 1 / 1 detected, but NOT a true trap (Tab+Enter on × or No thanks exits) |
| InvisibleWanderer | **22 / 21** (+ .hero .btn, 1.49:1) | **21 / 9** (+12 footer links, UA ring 2.50:1) | 0 / 0 OK (walk stops in trap) |
| WhisperingField | 0 / 0 OK | 0 / 0 OK | **3 / 2** (+ newsletter input, placeholder-only) |
| SilentTongue | 0 / 0 OK | 0 / 0 OK | 1 / 1 OK |
| ShatteredOrder | 0 / 0 OK | 1 / 1 OK (h1→h4 .details-heading) | **2 / 1** (h2→h4 footer + no-main) |
| TheVeiled | 1 / 1 OK (.promo-strip) | 0 / 0 OK | 2 / 2 OK (.promo-banner, .badge-free) |

The axe-core 4.14.1 violation counts per page:
- **index:** button-name 8, link-name 1, image-alt 6, color-contrast 7, aria-hidden-focus 1.
- **product:** button-name 2, link-name 1, color-contrast 4, link-in-text-block 2; best-practice heading-order 1.
- **checkout:** button-name 2, link-name 1, color-contrast 2, html-has-lang 1; incomplete: aria-hidden-focus 1; best-practice heading-order 1.

**Visual verifier:** demo_ready=False

Not demo-ready. One regression breaks the whole store: every candle image fails to load. All 6 SVGs in apps/cursed-shop/img were rewritten at 1:04-1:06 and each has a duplicated attribute on line 9 (`<ellipse cx="120" cy="65" cx="120" cy="65" ...>`). That is invalid XML, so Chromium refuses to decode them ("Attribute cx redefined"; new Image() onerror fires for all 6, naturalWidth=0). As a result: index shows 6 grey boxes with broken-image icons; product.html's main image collapses to 550x26px, so the alt text shows and the left half of the hero is empty; the related cards and checkout thumbnails are also broken. No console errors or requestfailed events are reported under file://, so the console check alone misses this. I rendered patched in-memory copies (z-svg-patched-preview.png): with the duplicate removed, the art is decent. Flames are visible, labels fit, and colours match the names. So the fix is one line per file.

Several things are fixed. scrollWidth is exactly 390 on index, product and checkout at 390x844, and 1280 at 1280. The mobile header collapses properly. The hero is now a rich brown radial gradient with no stray arc. Index→product→checkout works: a card click goes to product.html?product=..., and Add to Cart redirects to checkout.html after 900ms. The Order Summary no longer stretches. Arial leakage is gone (the only font is Georgia). The promo 'Shop Now' is readable. Console has 0 errors and 0 warnings on all 6 page/viewport loads.

Still broken:
- The 'Subscribe' modal button is still the browser default (bg rgb(240,240,240), 2px outset border).
- The 'Save this payment method' checkbox still renders 486px wide, centred above its label.
- Index product-card text is underlined in default link blue/purple, because .card-link has no text-decoration or color reset, and 'Shop the sale' is default blue.
- At first paint on checkout 1280x900, the CTA (top 854.75) sits entirely behind the fixed promo bar (top 849.4). It is clear once you scroll.
- Index footer icons are still the die and blob glyphs. Product and checkout have proper ones.
- The product page always shows Midnight Wood: the lavender-haven card leads to h1 'Midnight Wood'.
- The header cart icon is still a '+' and does nothing.
- Footer and reviews are dated 2024.

Evidence is in <scratch>/shop-reverify/visual/: shoot.mjs, svgcheck.mjs, out.json, *-1280/390-*.png, z-*.png. Nothing under the-unseen was modified.

