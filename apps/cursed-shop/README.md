# Hollow & Vine — Deliberately Haunted Demo Storefront

This is a deliberately haunted demo storefront for **The Unseen**, demonstrating all 10 WCAG 2.2 accessibility violations defined in the Haunting Taxonomy. The site looks beautiful and functional to sighted mouse users, but reveals serious accessibility issues when tested with assistive technologies.

**Visit the site:** [http://localhost:4173](http://localhost:4173)

## Quick Start

```bash
cd apps/cursed-shop
npm install
npm start
```

The shop will be served on port 4173. Open in your browser to see the "haunted" elements.

## Hauntings by Page

### index.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button with no accessible name |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button with no accessible name |
| `.product-grid .product-card:nth-child(N) .add-to-cart-btn` | **Nameless Spirit** | 4.1.2 | 6 | Icon-only Add to Cart buttons |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.product-grid .product-card:nth-child(N) .product-image.no-alt` | **Hollow Portrait** | 1.1.1 | 4 | Product images missing alt attribute (cards 1,2,4,6) |
| `.product-grid .product-card:nth-child(N) .product-note` | **The Fog** | 1.4.3 | 6 | Product notes at 3.15:1 contrast |
| `.footer-bottom p` | **The Fog** | 1.4.3 | 1 | Footer legal text at 3.15:1 contrast |
| `.product-card:nth-child(N) .card-link` | **Lost Soul** | 2.1.1 | 4 | Clickable card links (cards 1,2,4,6) |
| `.product-card:nth-child(N) .quick-view` | **Lost Soul** | 2.1.1 | 4 | Quick view buttons (cards 1,2,4,6) |
| `.nav .nav-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 4 | Nav links with no visible focus |
| `.nav-icons .icon-btn:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 2 | Icon buttons with no visible focus |
| `.social-links .social-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 3 | Social links with no visible focus |
| `.footer-col a` | **Invisible Wanderer** | 2.4.7 | 12 | Footer links with no visible focus |

### product.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.product-grid-related .product-card-related:nth-child(N) .product-image-related` | **Hollow Portrait** | 1.1.1 | 4 | Related product images missing alt |
| `.product-thumb:nth-child(N)` | **Hollow Portrait** | 1.1.1 | 3 | Thumbnail images missing alt |
| `.footer-bottom p` | **The Fog** | 1.4.3 | 1 | Footer text at 2.38:1 contrast |
| `.reviews-grid .review:nth-child(N) .review-date` | **The Fog** | 1.4.3 | 3 | Review dates at 2.38:1 contrast |
| `.product-card-related:nth-child(N)` | **Lost Soul** | 2.1.1 | 4 | Clickable related product cards |
| `.variant-option:nth-child(N)` | **Lost Soul** | 2.1.1 | 3 | Variant option divs |
| `.nav .nav-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 4 | Nav links with no visible focus |
| `.nav-icons .icon-btn:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 2 | Icon buttons with no visible focus |
| `.social-links .social-link:nth-child(N)` | **Invisible Wanderer** | 2.4.7 | 3 | Social links with no visible focus |
| `.product-info h4.details-heading` | **Shattered Order** | 1.3.1 | 1 | Heading skips h1 → h4 |

### checkout.html

| Element | Haunting | WCAG | Count | Description |
|---------|----------|------|-------|-------------|
| `.nav-icons .icon-btn:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only search button |
| `.nav-icons .icon-btn:nth-child(2)` | **Nameless Spirit** | 4.1.2 | 1 | Icon-only cart button |
| `.social-links .social-link:nth-child(1)` | **Nameless Spirit** | 4.1.2 | 1 | Instagram link with no accessible name |
| `.cart-item[data-sku="HV-MW-08"] .cart-item-image` | **Hollow Portrait** | 1.1.1 | 1 | Cart item image missing alt |
| `.cart-item[data-sku="HV-LH-08"] .cart-item-image` | **Hollow Portrait** | 1.1.1 | 1 | Cart item image missing alt |
| `.footer-bottom p.fog-text:nth-child(N)` | **The Fog** | 1.4.3 | 2 | Footer text at 3.15:1 contrast |
| `.modal-form input` | **Whispering Field** | 1.3.1, 3.3.2 | 1 | Email field named by placeholder |
| `.modal-form button.btn` | **Cursed Loop** | 2.1.2 | 1 | Modal focus trap |
| `.footer-content > .footer-col:nth-child(1) h4` | **Shattered Order** | 1.3.1 | 1 | Heading skips h2 → h4 |
| `.promo-banner` | **The Veiled** | 1.3.1 | 1 | Hidden promo banner |
| `.badge-free` | **The Veiled** | 1.3.1 | 1 | Hidden badge element |
| `html` | **Silent Tongue** | 3.1.1 | 1 | Missing lang attribute |

## Controls (Things That Should NOT Be Flagged)

### index.html

- **Cookie banner** - Properly implemented dialog with role=dialog, aria-modal, and Escape key to close
- **Main landmark** - Contains product grid and features (`main`)
- **H1 heading** - Hero section has proper `h1`
- **Named Quick View** - Cards 3 and 5 have button elements with "Quick view" text
- **Accessible card links** - Cards 3 and 5 use `<a class="card-link">` with visible focus
- **Visible focus** - Logo, hero button, promo strip link, card 1 add-to-cart-btn all have visible focus
- **Decorative icons** - Feature icons use `role="presentation" focusable="false"` correctly
- **Named social links** - Social links 2 (Facebook) and 3 (Pinterest) have aria-label names
- **lang="en"** - Page has proper language attribute

### product.html

- **Main landmark** - Contains product content (`main`)
- **H1 heading** - Product title is proper `h1`
- **lang="en"** - Page has proper language attribute
- **Decorative alt** - 3 thumbnails have `alt=""` (decorative)
- **Named field** - Quantity select has `aria-label="Quantity"`
- **Visible focus** - Quantity select, Add to Cart button, wishlist button have visible focus

### checkout.html

- **Main landmark** - Uses `div.checkout-page` instead of `main` (missing landmark is not detectable per current rules)
- **H1 heading** - "Secure Checkout" is proper `h1`
- **Named fields** - 10 form fields have visible labels
- **Named by placeholder** - Newsletter input named by placeholder (not a proper label)
- **Visible focus in trap** - Newsletter input and Subscribe button have visible focus
- **Mouse-only exits** - Modal close buttons are native buttons, not Lost Souls
- **Escape closes banner** - Cookie banner can be closed with Escape key

## Detector Notes

### Checkout Invisible Wanderer = 0

The Tab walk starts inside the newsletter modal trap (requirement 11.6). When the walker detects the trap, it **stops** and declares a Cursed Loop. Therefore, no Invisible Wanderer elements are detected because the walk never reaches the header and footer.

### Missing main is not detectable

The current `ShatteredOrder` rule only detects `no-main` when NO landmarks exist. Since checkout.html uses `div.checkout-page` (a generic container) instead of `<main>`, the missing landmark is not detectable under the current rule. We document this honestly.

### Newsletter trap opens synchronously

The modal opens immediately on page load (no `setTimeout`). It has **mouse-only exits** (× button, "No thanks" button, overlay click). There is **no Escape key handler**, so Escape does nothing and the walker declares a trap.

### Placeholder is the accessible name

Chromium uses a placeholder as the accessible name. An input with only a placeholder (no `<label>`, `aria-label`, or `aria-labelledby`) is a Whispering Field because the placeholder disappears on input and fails WCAG techniques.

## Technical Details

### CSS Variables
```css
--color-primary: #6d4c41;     /* Main brand color */
--color-secondary: #8d6e63;   /* Secondary brand color */
--color-accent: #d7ccc8;      /* Light accent color */
--color-bg: #f5f0eb;          /* Background color */
```

### SVG Assets
All product images are square 240×240 viewBox apothecary jars in `img/`:
- `candle-midnight.svg` - Midnight Wood candle (espresso glass)
- `candle-lavender.svg` - Lavender Haven candle (dusty lilac glass)
- `candle-meadow.svg` - Wildflower Meadow candle (sage glass)
- `candle-cedar.svg` - Cedar Forest candle (forest green glass)
- `candle-sea.svg` - Ocean Breeze candle (slate blue glass)
- `candle-vanilla.svg` - Spiced Vanilla candle (warm amber glass)

### npm Scripts

```json
{
  "start": "npx serve -p 4173",
  "serve": "npx serve -p 4173"
}
```

## How to Test

1. **Start the server:** `npm start`
2. **Open in browser:** http://localhost:4173
3. **Test with screen reader:** Use NVDA, JAWS, or VoiceOver
4. **Test keyboard navigation:** Tab through all interactive elements
5. **Run The Unseen audit:** Use the Kiro Power or the web app

## Why These Hauntings?

These examples mirror real-world accessibility failures:

1. **Icon-only buttons** - Common pattern where designers assume icons are self-explanatory
2. **Missing alt text** - Images added without considering screen reader users
3. **Low contrast text** - Design aesthetics prioritized over readability
4. **Click-only elements** - Divs with click handlers but no keyboard support
5. **Focus styles removed** - Removing default outlines without adding alternatives
6. **Placeholder-only forms** - Assuming placeholder = label (inaccessible)
7. **Hidden content** - Using `aria-hidden` to hide "non-essential" content
8. **Focus traps** - Modals that don't handle Escape key properly
9. **Missing landmarks** - Using div containers instead of semantic HTML
10. **Missing lang** - Not declaring page language

## WCAG Mapping

| Haunting | WCAG 2.2 | Level |
|----------|----------|-------|
| Nameless Spirit | 4.1.2 | A |
| Hollow Portrait | 1.1.1 | A |
| The Fog | 1.4.3 | AA |
| Lost Soul | 2.1.1 | A |
| Cursed Loop | 2.1.2 | A |
| Invisible Wanderer | 2.4.7 | AA |
| Whispering Field | 1.3.1, 3.3.2 | AA |
| Silent Tongue | 3.1.1 | A |
| Shattered Order | 1.3.1, 2.4.6 | A/Best Practice |
| The Veiled | 1.3.1, 4.1.2 | A |

---

*This is a demo storefront for educational purposes. Do not use these patterns in production sites.*
