# Hollow & Vine — Deliberately Haunted Demo Storefront

This is a deliberately haunted demo storefront for **THE UNSEEN**, demonstrating every WCAG 2.2 accessibility violation defined in the Haunting Taxonomy (`.kiro/steering/hauntings.md`). The site looks beautiful and functional to sighted mouse users, but reveals serious accessibility issues when tested with assistive technologies.

The expected hauntings are recorded exactly in [`expected-hauntings.json`](./expected-hauntings.json), which is the single source of truth that `verify.mjs` checks against. This README must stay in sync with that file and with the live DOM.

## Quick Start

```bash
cd apps/cursed-shop
npm install        # installs @axe-core/playwright + serve (via the workspace root)
npm start          # serves the folder on http://localhost:4173
npm run verify     # runs verify.mjs against the real Chromium channel
```

`verify.mjs` recomputes every haunting count from the rules in `hauntings.md` using a real Tab walk (with the escape test), CDP `Accessibility.getFullAXTree`, `DOMDebugger.getEventListeners` and axe-core, then compares the result with `expected-hauntings.json`. It exits non-zero on any mismatch.

## Hauntings by Page

### index.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button with no accessible name |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button with no accessible name |
| `.product-card:nth-child(N) .add-to-cart-btn` | **Nameless Spirit** | 4.1.2 | 6 | Icon-only Add to Cart buttons (cards 1–6) |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.product-card:nth-child(N) .product-image.no-alt` | **Hollow Portrait** | 1.1.1 | 4 | Product images with no `alt` attribute (cards 1, 2, 4, 6) |
| `.product-card:nth-child(N) .product-note` | **The Fog** | 1.4.3 | 6 | Product notes at 3.15:1 contrast |
| `.footer-bottom p` | **The Fog** | 1.4.3 | 1 | Footer legal text at 2.82:1 contrast |
| `.product-card:nth-child(N) .card-link` | **Lost Soul** | 2.1.1 | 4 | Clickable `div.card-link` areas (cards 1, 2, 4, 6) |
| `.product-card:nth-child(N) .quick-view` | **Lost Soul** | 2.1.1 | 4 | Clickable `div.quick-view` areas (cards 1, 2, 4, 6) |
| `.nav .nav-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 4 | Nav links with no visible focus |
| `.nav-icons .icon-btn:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 2 | Icon buttons with no visible focus |
| `.social-links .social-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 3 | Social links with no visible focus |
| `.footer-content > .footer-col:nth-child(N) li a` | **Invisible Wanderer** | 2.4.7 | 12 | Footer list links with no visible focus |
| `.promo-strip` | **The Veiled** | 1.3.1 | 1 | `aria-hidden` promo strip with visible text and a focusable link |

### product.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.product-grid-related .product-card-related:nth-child(N) .product-image-related` | **Hollow Portrait** | 1.1.1 | 4 | Related product images with no `alt` attribute |
| `.reviews-grid .review:nth-child(N) .review-date` | **The Fog** | 1.4.3 | 3 | Review dates at 2.38:1 contrast |
| `.footer-bottom p` | **The Fog** | 1.4.3 | 1 | Footer legal text at 2.82:1 contrast |
| `.product-thumbnails .product-thumb:nth-child(N)` | **Lost Soul** | 2.1.1 | 3 | Clickable thumbnail `img` (switchImage onclick) |
| `.variant-options .variant-option:nth-child(N)` | **Lost Soul** | 2.1.1 | 3 | Clickable variant-option `div`s |
| `.product-grid-related .product-card-related:nth-child(N)` | **Lost Soul** | 2.1.1 | 4 | Clickable related-product cards (onclick navigation) |
| `.nav .nav-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 4 | Nav links with no visible focus |
| `.nav-icons .icon-btn:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 2 | Icon buttons with no visible focus |
| `.social-links .social-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 3 | Social links with no visible focus |
| `.product-info h4.details-heading` | **Shattered Order** | 1.3.1, 2.4.6 | 1 | Heading skips h1 → h4 |

### checkout.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.cart-item[data-sku="HV-MW-08"] .cart-item-image` | **Hollow Portrait** | 1.1.1 | 1 | Cart image with no `alt` attribute |
| `.cart-item[data-sku="HV-LH-08"] .cart-item-image` | **Hollow Portrait** | 1.1.1 | 1 | Cart image with no `alt` attribute |
| `.footer-bottom p.fog-text:nth-child(N)` | **The Fog** | 1.4.3 | 2 | Footer text at 1.54:1 contrast |
| `#email` | **Whispering Field** | 1.3.1, 3.3.2, 4.1.2 | 1 | Email field named only by its placeholder |
| `#cardNumber` | **Whispering Field** | 1.3.1, 3.3.2, 4.1.2 | 1 | Card-number field named only by its placeholder |
| `#newsletterForm input[type=email]` | **Whispering Field** | 1.3.1, 3.3.2, 4.1.2 | 1 | Newsletter email named only by its placeholder |
| `#newsletterModal` | **Cursed Loop** | 2.1.2 | 1 | Newsletter modal focus trap (mouse-only exits) |
| `html` | **Silent Tongue** | 3.1.1 | 1 | Missing `lang` attribute |
| `.footer-content > .footer-col:nth-child(1) h4` | **Shattered Order** | 1.3.1, 2.4.6 | 1 | Heading skips h2 → h4 (kind `heading-skip`) |
| `body` | **Shattered Order** | 1.3.1 | 1 | No `main` landmark (kind `no-main`) |
| `.promo-banner` | **The Veiled** | 1.3.1 | 1 | `aria-hidden` promo banner with visible text and a link |
| `.badge-free` | **The Veiled** | 1.3.1 | 1 | `aria-hidden` "Free shipping" badge with visible text |

The checkout Shattered Order total is **2** instances: one `heading-skip` and one `no-main`.

## Controls (Things That Should NOT Be Flagged)

### index.html

- **Cookie banner** (`#cookieBanner`) — `role="dialog"` banner whose × and Accept buttons cycle focus; **Escape closes it**, so it is escapable and must NOT be a Cursed Loop.
- **Main landmark** — `<main>` contains the product grid and features.
- **H1 heading** — hero section has a proper `h1`.
- **Decorative images** — cards 3 and 5 use `alt=""` decorative images.
- **Accessible card links** — cards 3 and 5 use `<a class="card-link">` with visible focus.
- **Named Quick view** — cards 3 and 5 use `<button class="quick-view">` with the text "Quick view".
- **Quick view panel** (`#quickViewPanel`) — `display:none` until opened; named "Close quick view" button + "View full details" link.
- **Visible focus** — logo, hero button, promo strip link, card 1 Add to Cart all have a visible focus ring.
- **Decorative icons** — the three feature icons use `role="presentation" focusable="false"`.
- **Named social links** — links 2 (Facebook) and 3 (Pinterest) have `aria-label`s.
- **`lang="en"`** — page declares its language.

### product.html

- **Main landmark** — `<main>` contains the product content.
- **H1 heading** — product title is a proper `h1`.
- **`lang="en"`** — page declares its language.
- **Decorative thumbnails** — the 3 `.product-thumb` images use `alt=""` (decorative, not Hollow Portraits).
- **Named field** — the quantity `<select>` has `aria-label="Quantity"`.
- **Visible focus** — quantity select, Add to Cart button, wishlist button have a visible focus ring.

### checkout.html

- **H1 heading** — "Secure Checkout" is a proper `h1`.
- **Properly labeled fields** — 10 fields have a real `<label for>` or label (`#firstName`, `#lastName`, `#phone`, `#address`, `#zip`, `#city`, `#state`, `#cardName`, `#cvv`, `#expiry`).
- **Visible focus in trap** — the newsletter input and the Subscribe button have a visible focus ring inside the trap.
- **Mouse-only modal exits** — `.modal-close` and `#closeModalBtn` are native buttons with `tabindex="-1"`, so they are mouse-only (not in the Tab cycle) and not Lost Souls.

## Detector Notes

### Checkout Invisible Wanderer = 0

The Tab walk starts inside the newsletter modal trap. When the walker detects the trap it **stops** and declares a Cursed Loop (requirements 11.8). No Invisible Wanderer elements are detected because the walk never reaches the header and footer.

### Missing `main` is detectable (Shattered Order, kind `no-main`)

The `ShatteredOrder` rule reports `no-main` when the page has no `main` landmark, regardless of whether other landmarks exist. checkout.html uses `div.checkout-page` (no `main`), so `no-main` fires alongside the `heading-skip` instance. Checkout Shattered Order is therefore **2**.

### Newsletter trap opens synchronously with mouse-only exits

The modal opens immediately on page load (no `setTimeout`) and auto-focuses its email input. Its two exits (× and "No thanks") carry `tabindex="-1"`, so Tab and Shift+Tab cycle only between the email input and the Subscribe button. There is **no Escape handler**, so Escape leaves the modal open, and Enter/Space on every reachable element keeps it open — a true keyboard trap. The exits remain clickable with the mouse (native buttons, not Lost Souls).

### Placeholder is the accessible name

Chromium uses a `placeholder` as the accessible name. An input with only a placeholder (no `<label>`, `aria-label`, or `aria-labelledby`) is a Whispering Field because the placeholder disappears on input and fails WCAG techniques. Checkout has three: `#email`, `#cardNumber`, and `#newsletterForm input[type=email]`.

## WCAG Mapping

| Haunting | WCAG 2.2 | Level |
|----------|----------|-------|
| Nameless Spirit | 4.1.2, 2.4.4, 1.1.1 | A |
| Hollow Portrait | 1.1.1 | A |
| The Fog | 1.4.3 | AA |
| Lost Soul | 2.1.1, 4.1.2 | A |
| Cursed Loop | 2.1.2 | A |
| Invisible Wanderer | 2.4.7 | AA |
| Whispering Field | 1.3.1, 3.3.2, 4.1.2 | A |
| Silent Tongue | 3.1.1 | A |
| Shattered Order | 1.3.1, 2.4.6 | A / AA |
| The Veiled | 1.3.1, 4.1.2 | A |

## Technical Details

### CSS Variables
```css
--color-primary: #6d4c41;     /* Main brand color */
--color-secondary: #8d6e63;   /* Secondary brand color */
--color-accent: #d7ccc8;       /* Light accent color */
--color-bg: #f5f0eb;           /* Background color */
```

### SVG Assets
All product images are square 240×240 viewBox apothecary jars in `img/`:
- `candle-midnight.svg` — Midnight Wood (espresso glass)
- `candle-lavender.svg` — Lavender Haven (dusty lilac glass)
- `candle-meadow.svg` — Wildflower Meadow (sage glass)
- `candle-cedar.svg` — Cedar Forest (forest green glass)
- `candle-sea.svg` — Ocean Breeze (slate blue glass)
- `candle-vanilla.svg` — Spiced Vanilla (warm amber glass)

The product page reads `?product=<slug>` and renders the matching candle; the slugs (`midnight-wood`, `lavender-haven`, `meadow`, `cedar-forest`, `sea`, `vanilla`) match the index card links and the related-card links.

### npm Scripts
```json
{
  "start": "npx serve -p 4173",
  "serve": "npx serve -p 4173",
  "verify": "node verify.mjs"
}
```

## How to Test

1. **Start the server:** `npm start`
2. **Open in browser:** http://localhost:4173
3. **Test with a screen reader:** NVDA, JAWS, or VoiceOver
4. **Test keyboard navigation:** Tab through all interactive elements
5. **Run The Unseen audit:** use the Kiro Power or the web app
6. **Automated check:** `npm run verify`

## Why These Hauntings?

These examples mirror real-world accessibility failures:

1. **Icon-only buttons** — designers assume icons are self-explanatory
2. **Missing alt text** — images added without screen-reader users in mind
3. **Low contrast text** — aesthetics prioritised over readability
4. **Click-only elements** — divs with click handlers but no keyboard support
5. **Focus styles removed** — default outlines removed with no replacement
6. **Placeholder-only forms** — assuming placeholder = label
7. **Hidden content** — `aria-hidden` used to hide "non-essential" content
8. **Focus traps** — modals that don't handle Escape
9. **Missing landmarks** — `div` containers instead of semantic HTML
10. **Missing lang** — page language not declared

---

*This is a demo storefront for educational purposes. Do not use these patterns in production sites.*
