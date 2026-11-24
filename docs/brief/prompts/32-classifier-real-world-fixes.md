Real-world fixes for the classifier and runner. The product lead tested your classifier on **fresh pages it had never seen** (not the Cursed Shop): per-type pages with near-miss controls, plus common real-world markup. **26 checks passed, and the code review found no shop-specific shortcuts. Good work.** Seven failures are confirmed. Evidence, repro HTML and the expected results are in **`docs/brief/review-notes/classifier-unseen-pages-1.md`**.

For each item:
1. Recreate the repro as a fixture page under `packages/core/tests/fixtures/pages/`.
2. Write a failing test first.
3. Fix the code, keeping the classifier pure, so the test passes.

Do not edit the golden file or the shop.

1. **Iframe content is invisible to the AX-based detectors** (major). Collect the accessibility tree **per frame**: `Accessibility.getFullAXTree` with each same-origin `frameId`, and the OOPIF sessions you already attach for metering, where possible. Map the nodes into `axNodes` with their real `backendDOMNodeId`s. Also, the axe cross-check must **not** mark an axe node with a `null` id as corroborated by a haunting on a *different* element via the rule-table fallback. Unresolved axe nodes go to `axeCrossCheck.unmapped`.
2. **Cross-origin iframes give a false Invisible Wanderer** (major). When a Tab step lands on a frame or composite host whose inner focus cannot be read, the step goes to `needsManualCheck` with reason `focus-style-unavailable`. It is never a haunting. Test: a cross-origin consent iframe with visible inner focus rings gives score 0 and one manual check.
3. **A colour-only focus change counts as visible** (major). The runner serialises `text-decoration` including its colour (`currentColor`), so any text-colour shift passes rule (d).
   - **Rule (d):** compare only `text-decoration-line` and `text-decoration-style`. Capture them separately in the runner (`text-decoration-line`, `-style`, `-thickness`).
   - **Rule (c):** a border-colour change counts only when the border is actually painted (`border-style` ≠ none and `border-width` ≥ 1px). A text-colour or background change needs ≥ 3:1 between the before and after colours.
   - **Tests:** `a:focus{outline:none;color:#4f4f4f}` on `#555` IS an Invisible Wanderer, and an added underline is NOT.
4. **The Veiled case (a) with an off-screen aria-hidden container** (minor). Follow `hauntings.md` exactly for case (a), and make the behaviour explicit in a test. If the steering is ambiguous, keep flagging focusables (they are still reachable by keyboard), and say so in the `tasks.md` Notes.
5. **Severity keyword matching uses substrings** (minor). Match whole words and tokens: split id, class and aria-label on non-alphanumerics and camelCase, and match the steering keywords as tokens. Do **not** scan the raw `outerHTMLSnippet`. `research-toggle` must not match `search`, and `paypal-express` must not match `pay` unless "pay" is a token. `add-to-cart-btn` still matches `cart`. Re-run the golden test; shop severities must not change, and if they do, explain why.
6. **Golden test coverage gaps** (minor). Extend `golden.test.ts` (keep it browser-free) to also assert:
   - the page-level node ids (Silent Tongue → html; Shattered Order kinds → body / the later heading) from the sidecars
   - `countsByType` (primary) and the secondary placement (index: 18 primary Invisible Wanderers; checkout: the newsletter Whispering Field is a secondary of the Cursed Loop)
   - each page's score as a snapshot (index 98, product 85, checkout 70), unless a fix above legitimately changes them; then update the snapshot and explain why in the Notes.
7. **Built public API** (minor): see the note. Make sure the built `dist/index.js` exports `auditAndClassify` and the types, with a test that imports from the package entry.

**Done means:** typecheck, lint (root `npm run lint`), `npx vitest --run` and `npx playwright test` in `packages/core` are green, and `apps/cursed-shop` `npm run verify` passes. Final message: an item → fix → test table.
