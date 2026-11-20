Implement tasks **9–16** of `.kiro/specs/audit-engine/tasks.md`. As before: requirements, design and `.kiro/steering/hauntings.md` win over stale task text. Mark each `[x]` only when its acceptance criteria pass.

## Product-lead amendments (apply exactly)

1. **The Fog: uncertain backgrounds (task 9).** When walking ancestors for the effective background, also read `background-image` and the alpha of every `background-color`. If any layer between the text and the first opaque colour is an image, a gradient or a semi-transparent colour, record `backgroundUncertain: true` on the `TextNodeStyle` and keep the best-guess colour. The classifier will mark these `contrastUncertain` and never flag them (`hauntings.md` §3 The Fog, "Uncertain backgrounds"). Also record `isLargeText` from the font-size and font-weight per WCAG (≥24px, or ≥18.66px and bold).
2. **The Veiled (task 12).** Add `hasVisibleText: boolean` and `containsFocusable: boolean` to each `DomAxMapping` entry, computed over the element's subtree. "Visible" means a non-zero box intersecting the document's scrollable area: off-screen positioning is not visible. The classifier only flags aria-hidden/presentational subtrees with visible text or a focusable descendant.
3. **Shattered Order (task 11).** Record whether a `main` landmark exists (`<main>` or `role="main"`) as `hasMainLandmark`, in addition to `landmarkRoles`.
4. **Tab walker (task 13).** Follow `hauntings.md` §5 (Cursed Loop, including "Walk start timing") and §6 (Invisible Wanderer):
   - Before the walk, inject `*,*::before,*::after{transition:none!important;animation:none!important}`.
   - Record `walkStartedAtMs`.
   - For each step, capture `outline-style`, `outline-width`, `outline-color`, `box-shadow`, `border-color`, `background-color` and `text-decoration`, before and after. Also capture the adjacent background colour (the nearest opaque ancestor background), which the classifier needs for the 3:1 checks.
   - **Segmenting:** when the escape test moves focus out of a cycle, mark the cycle `escapable: true`, **reset cycle detection** and keep walking from the new focus position. The step cap still applies to the whole walk. Add a fast-check property: a walk over a sequence containing an escapable cycle followed by N unseen elements visits all N.
   - Integration tests:
     - checkout: `trapDetected === true`, and the trap members are inside `#newsletterModal`.
     - **index:** the cookie banner yields a cycle with `escapable: true`, `trapDetected === false`, and the walk still reaches the footer links after the banner.
5. **`auditHtml` vs SSRF (task 14).** `auditHtml` serves the HTML on `127.0.0.1:<random port>`, which `RestrictiveSafeFetchPolicy` would block. Wrap the configured policy so that **exactly** that origin (`http://127.0.0.1:<port>`) is allowed and every other URL is delegated to the configured policy unchanged. Bind the server to `127.0.0.1` only. Add a test: `auditHtml` with the restrictive policy succeeds, and a subresource `<img src="http://127.0.0.1:1/x.png">` on another port is still blocked.
6. **Determinism (task 15).** If byte-identical screenshots prove flaky because of font rasterisation, compare a SHA-256 of the PNG across two runs and record any mismatch; do not weaken the JSON comparison.

## Done means
- Task 16 checkpoint: `tsc --noEmit`, `vitest --run` and `playwright test` in `packages/core` all exit 0.
- Paste the three summary lines, then list any spec text you changed and why.
