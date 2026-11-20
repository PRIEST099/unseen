Product-lead decisions on `.kiro/steering/hauntings.md`, round 2.

Three independent reviewers ran real Chromium, axe and CDP tests against the Cursed Shop (evidence in `docs/brief/review-notes/cursed-shop-review-1.md`). They found places where the rules either miss real-world failures or misfire on Chromium specifics. Apply these decisions **exactly**: edit `hauntings.md` in place and keep everything else.

1. **Whispering Field: placeholder-only fields count.** Chromium computes a placeholder-only input's accessible name *from the placeholder*, so "empty name" never catches the most common real-world failure. A placeholder is not a label: it disappears on input and has low contrast (WCAG 3.3.2, 1.3.1; failure technique F68 context).
   - New detection: a form-control role AND (computed name is empty **OR** the winning name source in CDP `name.sources` is the `placeholder` attribute, i.e. no `<label>`, `aria-label`, `aria-labelledby` or `title` supplied the name).
   - Speech for this case: `"<placeholder>, edit text"` followed by a note in the UI that the name vanishes once the user types.

2. **Shattered Order: a missing `<main>` counts.**
   - New detection: no `<h1>`, **OR** a heading level skip, **OR** no `main` landmark (`<main>` or `role="main"`).
   - The old "no landmarks at all" rule is replaced. Each sub-condition is a separate instance, with a `kind` field: `no-h1`, `heading-skip`, `no-main`.

3. **Roles:** CDP reports `image` (not `img`) for `<img>` and `<svg role="img">`. Treat `img` and `image` as equivalent everywhere. **Hollow Portrait** for inline `<svg>` applies only when the SVG has an explicit `role="img"`, or is the **sole** content of a link/button (in that case the parent is the Nameless Spirit, not the SVG). Inline SVG icons inside an already-named control are never flagged.

4. **The Veiled, rule (b), exclusion:** an `aria-hidden`/presentational element counts only if its hidden subtree contains **visible non-whitespace text** or a **focusable** element. Purely decorative hidden graphics (icons, dividers) are correct practice and must NOT be flagged. "Visible" excludes off-screen positioning: the box must intersect the page's scrollable area.

5. **Invisible Wanderer: visible means visible.**
   - Before reading focus styles, inject `*,*::before,*::after{transition:none!important;animation:none!important}`.
   - An indicator is visible iff, after a real Tab focus, at least one of these holds:
     - (a) `outline-style` ≠ `none` AND `outline-width` ≥ 1px AND the outline colour has ≥ 3:1 contrast against the background adjacent to the element;
     - (b) `box-shadow` changed to a non-transparent shadow with ≥ 3:1 contrast against the adjacent background;
     - (c) `border-color` or `background-color` changed with ≥ 3:1 contrast between the before and after colours;
     - (d) `text-decoration` changed (for example underline added).
   - Ignore `outline-offset`/`outline-width`/`outline-color` deltas when `outline-style` is `none` (Chromium's UA `:focus-visible` sets `outline-offset:1px` even under `outline:none`).
   - A white outline on a white background is **invisible**.
   - WCAG mapping fix: Invisible Wanderer is **2.4.7 Focus Visible (AA)**. Reference **2.4.13 Focus Appearance (AAA)** as guidance only. 2.4.11 is "Focus Not Obscured", not Focus Appearance, so correct that label.

6. **Tab walker after an escapable cycle:** when the escape test moves focus out of a cycle, mark the cycle escapable, **reset cycle detection** (segment the walk), and continue walking from the new focus position so later elements (footers and the like) are still visited. The step cap still applies to the whole walk.

7. **Walk start timing:** start the Tab walk only after `networkidle` plus a 1500 ms settle window, so dialogs that open on a timer (common for newsletter popups) are present. Record `walkStartedAtMs` in the raw data.

8. **The Fog, uncertain backgrounds:** if the effective background is an image, gradient or semi-transparent overlay that can't be resolved to a single colour, mark the text node `contrastUncertain: true` and do **not** flag it (same as axe "incomplete"). Show such nodes in Daylight mode as "needs manual check", never as a haunting. Honesty over drama.

Also update the speech examples table for case 1, the severity/score sections if they reference the changed rules, and `.kiro/specs/audit-engine/requirements.md` + `design.md` wherever they encode the old Whispering Field, Shattered Order, Invisible Wanderer or walker rules (keep the spec consistent with the steering). Summarize every edit when done.
