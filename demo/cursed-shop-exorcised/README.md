# Cursed Shop, exorcised

A fixed copy of `apps/cursed-shop`. Every haunting the THE UNSEEN audit finds in the original is fixed here in the HTML and CSS source. The original is unchanged: `apps/cursed-shop` is the protected demo, and this folder is the "after" take.

This folder has no `package.json` and lies outside the npm workspaces. To look at it:

```
npx serve demo/cursed-shop-exorcised
```

## Scores

Haunting Score from the audit engine (0 is best). The re-audit called `auditAndClassify` from `@the-unseen/core` directly, with `allowPrivate: true`, not through the unseen MCP server. `audit_url` calls the same function. `tests/exorcise.int.test.ts` in `packages/mcp` recomputes these rows and fails if they differ.

| Page | Before (apps/cursed-shop) | After (this folder) |
|------|---------------------------|---------------------|
| index.html | 98 | 0 |
| product.html | 85 | 0 |
| checkout.html | 70 | 0 |

A score of 0 means the audit found no hauntings. It does not mean the pages meet WCAG. Automated checks find roughly 30-40% of WCAG issues. Still needed from a person:

- Text over the hero gradient, the sticky header and the open newsletter overlay on checkout is reported as "needs manual check" (contrast uncertain), not as a haunting. Check those contrast ratios by hand.
- Screen reader testing (NVDA, JAWS or VoiceOver), reading order, the quick view dialog on index.html (it has no focus trap), and the checkout form's error handling.

## What was fixed

Each fix is in the source. Nothing is injected at runtime.

### index.html

| Haunting | Fix |
|----------|-----|
| Nameless Spirit (9) | `aria-label` on the search and cart buttons, `Add <name> to cart` on the six add-to-cart buttons, `Instagram` on the first social link |
| Hollow Portrait (4) | `alt` text on the four product images that had none; the `no-alt` class is removed |
| The Fog (7) | `.product-note` text `#9e8e87` to `#6b5b54`; footer legal text `#a89b95` to `#f5f0eb` |
| Lost Soul (8) | `div.card-link` on cards 1, 2, 4, 6 is now `<a href="product.html?product=...">`; `div.quick-view` is now `<button type="button">`; the click handler script is removed |
| Invisible Wanderer (18) | the `outline: none` rule is replaced by `:focus-visible` outlines: `--color-primary` on the white header, `#FFF3E0` on the brown footer |
| The Veiled (1) | `aria-hidden="true"` removed from `.promo-strip` |

### product.html

| Haunting | Fix |
|----------|-----|
| Nameless Spirit (3) | same labels as index.html |
| Hollow Portrait (4) | related-product images use `alt=""`; each is inside a link that already carries the product name |
| The Fog (4) | `.review-date` `#a89b95` to `#6b5b54`; footer legal text to `#f5f0eb` |
| Lost Soul (10) | thumbnails are wrapped in `<button class="product-thumb-btn" aria-label="Show image N of 3">`; variant options are `<button aria-pressed>` in a labelled group; related cards are `<a>` links; the inline `onclick` on cards is removed |
| Invisible Wanderer (6) | visible `:focus-visible` outlines on header links, icon buttons, thumbnails, related cards and social links |
| Shattered Order (1) | `h4.details-heading` is now `h2.details-heading` (h1 then h2) |

### checkout.html

| Haunting | Fix |
|----------|-----|
| Silent Tongue (1) | `<html lang="en">` |
| Nameless Spirit (3) | same labels as index.html |
| Hollow Portrait (2) | cart images use `alt=""`; the item name is next to each image |
| The Fog (2) | `.fog-text` footer lines to `#f5f0eb` |
| Whispering Field (3) | `<label for="email">` and `<label for="cardNumber">` replace the caption `div`s; the newsletter input has an `id` and `aria-label` |
| Cursed Loop (1) | Escape closes the newsletter modal and returns focus to the page heading; "Close modal" and "No thanks" are in the Tab order (the `tabindex="-1"` is removed) |
| The Veiled (2) | `aria-hidden="true"` removed from `.promo-banner` and `.badge-free` |
| Shattered Order (2) | `div.checkout-page` is now `<main class="checkout-page">`; footer `h4` headings are `h3`, so no level is skipped |
| Invisible Wanderer | visible `:focus-visible` outlines on header links, icon buttons and social links; with the trap gone the Tab walk now reaches them |

## How the scores were produced

Serve each folder on a local port and call `auditAndClassify` with `allowPrivate: true` on the three pages (`audit_url` runs the same function). The "before" run is the unmodified `apps/cursed-shop`.
