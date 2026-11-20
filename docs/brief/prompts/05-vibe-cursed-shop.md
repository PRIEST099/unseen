Build `apps/cursed-shop`: the deliberately haunted demo storefront for THE UNSEEN. This is a quick **vibe-coded** task with no spec. Follow `.kiro/steering/hauntings.md` and `structure.md`.

**What it is:** a static site (plain HTML + CSS + a little vanilla JS, no build step) for a fictional, original shop called **"Hollow & Vine"**, which sells hand-poured candles and apothecary goods. It must look **beautiful and completely normal to a sighted mouse user**: modern, warm, premium e-commerce design, real-looking copy, product grid, hero. Use inline SVG or CSS shapes for product images, plus a few small local SVG files in `apps/cursed-shop/img/` (no external image URLs, no copyrighted assets, no real brands). The demo starts with "this store looks fine". It must genuinely look fine.

**Pages:**
- `index.html`: header/nav, hero, product grid (6 products), footer.
- `product.html`: one product detail page with Add to Cart.
- `checkout.html`: cart summary, shipping form, payment button, plus a newsletter modal that opens on load.

**Planted hauntings.** Plant **every one** of the 10 hauntings from `hauntings.md` at least once, realistically (the way real sites actually break):
1. **Nameless Spirit:** icon-only buttons (cart icon, search icon, Add to Cart rendered as an icon-only SVG button on the product grid), a social link with only an SVG.
2. **Hollow Portrait:** product `<img>` elements with no `alt` at all (also keep 1–2 correctly decorative `alt=""` images, which must NOT be flagged).
3. **The Fog:** light-grey-on-white small text (price notes, footer legal text) under 4.5:1.
4. **Lost Soul:** a "Quick view" `<div>` with a click handler and `cursor:pointer` but no role or tabindex; a clickable product-card `<div>`.
5. **Cursed Loop:** the newsletter modal on `checkout.html` traps focus with JS (Tab cycles inside it) **and Escape does not close it** and there is no keyboard-reachable close (this is a true trap). On `index.html` add a properly built cookie banner dialog that cycles focus but closes on Escape (this must NOT be flagged; a control case).
6. **Invisible Wanderer:** a global `*:focus { outline: none }` with no replacement focus style on some links/buttons. Keep a few elements with a proper visible custom focus style as controls.
7. **Whispering Field:** checkout form inputs that use only `placeholder` and no label (email, card number). Keep one properly labelled field as a control.
8. **Silent Tongue:** `checkout.html` has `<html>` with no `lang`. The other pages have `lang="en"`.
9. **Shattered Order:** `product.html` jumps from `h1` to `h4`; `checkout.html` has no `<main>` landmark.
10. **The Veiled:** a promo banner with real visible text and a focusable link inside an `aria-hidden="true"` container; a "Free shipping" badge rendered so that it's visible but excluded from the accessibility tree.

**Golden expectations** (critical: the integration tests depend on these). Create `apps/cursed-shop/expected-hauntings.json` listing, per page, each planted haunting type with the exact count and a CSS selector for each instance, plus a `controls` array of things that must NOT be flagged. Also create `apps/cursed-shop/README.md` that explains each planted haunting in a table (page, element, haunting, WCAG criterion, why it is realistic).

Add an npm script so the shop can be served locally: a tiny static server. Use the `serve` package or `npx http-server` as a devDependency in an `apps/cursed-shop/package.json` with `"start"` on port 4173.

When done, list the files and the per-page haunting counts.
