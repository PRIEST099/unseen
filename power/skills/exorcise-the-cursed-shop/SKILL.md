---
name: exorcise-the-cursed-shop
description: Audit the Cursed Shop demo storefront with the unseen server and write a fixed copy to demo/cursed-shop-exorcised, leaving apps/cursed-shop untouched. Use when asked to exorcise, fix or demo the Cursed Shop.
---

# Exorcise the Cursed Shop

The Cursed Shop (`apps/cursed-shop`) is deliberately haunted, and its golden counts are protected. Never edit it. Fix a copy.

1. Serve `apps/cursed-shop` locally (`npm start -w cursed-shop`, port 4173) and call `audit_url` on `index.html`, `product.html` and `checkout.html`. Record each page's score and hauntings.
2. Copy the `.html` files and `img/` into `demo/cursed-shop-exorcised/`. Do not copy `package.json`, `README.md`, `verify.mjs` or `expected-hauntings.json`. The copy must have no `package.json`, so it stays outside the npm workspaces.
3. Fix the copy's source, one haunting at a time, in the `exorcise` order. Typical fixes: `aria-label` on icon-only controls, `alt` text (or `alt=""` for decorative images), real `<a href>` and `<button>` elements instead of clickable `div`s, `<label for>` on every input, darker text colours, a visible `:focus-visible` outline, no `aria-hidden` on visible text or links, a `lang` attribute, a `<main>` landmark, no skipped heading levels, and an Escape key that closes the newsletter modal. Never inject a script or an overlay.
4. Serve the copy and call `audit_url` on each page again. Record before and after scores per page in `demo/cursed-shop-exorcised/README.md`, and list what still needs a person (contrast over images or gradients is reported as "needs manual check"). Automated checks find roughly 30-40% of WCAG issues, so do not describe the copy as complete.
5. Check that the original is untouched: `git diff --exit-code -- apps/cursed-shop` and `npm run verify -w cursed-shop` both succeed.
