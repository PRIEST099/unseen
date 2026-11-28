# Verification probes

These are independent verification scripts, written and run by Claude Code at our direction, to check Kiro's Cursed Shop. They are **not** product code. Use them to verify Kiro's work; do not trust Kiro's own summary.

Run from the repo root after `npm install`. Outputs (JSON, screenshots) go to `$PROBE_OUT`, or `<os tmp>/unseen-probes` by default. Chromium launches with `UNSEEN_CHROMIUM_CHANNEL`, defaulting to `chromium`; set it to an empty string to use the bundled headless shell.

| Script | What it checks |
|---|---|
| `imgcheck.mjs` | Every `<img>` on the 3 pages loads (`naturalWidth > 0`) |
| `trap.mjs` | Real key-press checks: the newsletter-modal trap (Tab, Enter/Space on exits, Escape, Escape+Shift+Tab), the cookie-banner control, 390px overflow, CTA occlusion, View Cart navigation and focus-ring contrast |
| `audit.mjs` | Recomputes every haunting count from CDP `Accessibility.getFullAXTree`, `DOMDebugger.getEventListeners`, axe-core and a real Tab walk, using the rules in `.kiro/steering/hauntings.md`. Compares the result with `apps/cursed-shop/expected-hauntings.json` (golden vs actual, bad selectors, not-fired, extra) |

```bash
node docs/brief/review-notes/probes/imgcheck.mjs
node docs/brief/review-notes/probes/trap.mjs
node docs/brief/review-notes/probes/audit.mjs
```

These scripts were written against the shop as it was during review 2 (2026-11-20). If Kiro restructures the pages, update the selectors in the scripts, not the rules.
