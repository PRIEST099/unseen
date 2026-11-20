---
inclusion: always
---

# THE UNSEEN — Haunting Taxonomy

This file is the **single source of truth** for haunting definitions, severity rules, the Haunting Score algorithm, and speech announcement rules. All generated code must follow these specifications exactly. When a rule here conflicts with a spec or a comment in code, this file wins.

---

## Haunting definitions

Each haunting maps to a WCAG 2.2 success criterion. No haunting may be decorative or invented; every one must be derivable from the data sources listed.

### 1. Nameless Spirit

| Field | Value |
|-------|-------|
| **Detection rule** | An AX node has an interactive role AND its computed accessible name is empty (zero-length string after trimming) |
| **Interactive roles** | `button`, `link`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `tab`, `checkbox`, `radio`, `switch`, `option`, `combobox`, `listbox`, `treeitem`, `gridcell` |
| **Data source** | CDP `Accessibility.getFullAXTree` — use `role.value` and `name.value` |
| **Visual** | Element becomes a faceless translucent ghost; its label text fades out |
| **Sound** | Whispers only the role: e.g. `"button"` |
| **WCAG** | 4.1.2 (Name, Role, Value), 2.4.4 (Link Purpose), 1.1.1 (image buttons) |

### 2. Hollow Portrait

| Field | Value |
|-------|-------|
| **Detection rule** | AX node has role `img` or `image` (CDP reports `image` for `<img>` and `<svg role="img">`) AND the accessible name is empty AND `alt` is not explicitly set to `""` (decorative). An `<img alt="">` is intentionally decorative and must NOT be flagged. Treat `img` and `image` as equivalent everywhere in this codebase. |
| **Additional exclusions** | Also skip images with `role="presentation"` or `role="none"`, and images excluded from the AX tree via `aria-hidden="true"` — unless the image is the sole content of a `<button>` or `<a href>`, in which case the parent element is a Nameless Spirit (haunting #1) and should be reported there instead. For inline `<svg>`: flag only when the SVG has an explicit `role="img"` attribute, or when it is the sole content of a link or button (parent is the Nameless Spirit, not the SVG). Inline SVG icons inside an already-named control must NOT be flagged. |
| **Data source** | CDP AX tree for role and name; DOM attribute check for `alt=""` exclusion |
| **Visual** | Image goes hollow-eyed and desaturated |
| **Sound** | `"unlabelled graphic"` followed by the filename extracted from the `src` attribute (last path segment, no query string) |
| **WCAG** | 1.1.1 (Non-text Content) |

### 3. The Fog

| Field | Value |
|-------|-------|
| **Detection rule** | Text contrast ratio below 4.5:1 for normal text, or below 3:1 for large text (≥18pt / ≥14pt bold). Contrast ratio computed per WCAG 2.x relative luminance formula. |
| **Data source** | Computed styles (`color`, `background-color`) collected via `page.evaluate` for each text node. If the background is transparent or a gradient, walk up the DOM to find the effective background. |
| **Uncertain backgrounds** | If the effective background is an image, gradient, or semi-transparent overlay that cannot be resolved to a single colour, mark the text node `contrastUncertain: true` and do **not** flag it as a haunting — same treatment as axe "incomplete". Show such nodes in Daylight mode as "needs manual check", never as a haunting. |
| **Visual** | A fog overlay on the text element; density proportional to the contrast deficit (more deficit = denser fog) |
| **Sound** | None |
| **WCAG** | 1.4.3 (Contrast Minimum) |
| **Note** | Do not flag text that is disabled (`aria-disabled`, `:disabled`), decorative (empty alt, role none/presentation), or inside the focus indicator only. |

### 4. Lost Soul

| Field | Value |
|-------|-------|
| **Detection rule** | An element has a click event handler (detected via CDP `DOMDebugger.getEventListeners` for `click`, `mousedown`, `pointerdown`, or `pointerup`) AND is not reachable by Tab (not in the Tab walk sequence) AND does not have an interactive ARIA role AND is not a native interactive element (`<button>`, `<a href>`, `<input>`, `<select>`, `<textarea>`, `<summary>`, `[contenteditable]`). A `cursor: pointer` computed style may be used as a supporting signal only — never as the sole trigger, because the property is inherited by descendants and would flood results. |
| **Outermost rule** | Report only the **outermost** qualifying element. If a child and its ancestor both match, report the ancestor and suppress the child. |
| **Skip rule** | Skip any element that is inside a native interactive element OR that contains a native interactive element as a descendant. |
| **Data source** | Tab walk sequence from `runner/tab-walker.ts`; CDP `DOMDebugger.getEventListeners`; computed styles; CDP AX tree roles |
| **Visual** | A soul trapped behind glass; the Tab path ghost walks straight past it |
| **Sound** | None |
| **WCAG** | 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value) |

### 5. Cursed Loop

| Field | Value |
|-------|-------|
| **Detection rule** | The Tab walk visits a focus cycle (the same element appears twice in the Tab sequence) **before** all focusable elements have been visited at least once, AND pressing `Escape` then `Shift+Tab` does not move focus outside the cycle. If either key sequence breaks out of the cycle, it is NOT a trap — a closable modal with `aria-modal="true"` that lets the user press `Escape` is compliant with 2.1.2. A cycle that includes all focusables (e.g. a small widget with intentional roving tabindex) is also NOT a trap. |
| **Walk cap** | Cap the Tab walk at `focusableCount * 2 + 10` steps. Treat focus moving to `body` or the document/browser chrome as the natural end of the walk, not a cycle. |
| **Escapable cycle handling** | When the escape test moves focus out of a cycle, mark the cycle `escapable: true`, **reset cycle detection** (segment the walk at that point), and continue walking from the new focus position so that elements later in the page (footers, etc.) are still visited. The step cap applies to the whole walk, not each segment. |
| **Walk start timing** | Start the Tab walk only after `networkidle` plus a **1500 ms settle window**, so that dialogs that open on a timer (e.g. newsletter popups) are present when the walk begins. Record the timestamp when the walk started as `walkStartedAtMs` in the raw data. |
| **Data source** | `runner/tab-walker.ts` — cycle detection on focus order; escape-testing via `Keyboard.press('Escape')` then `Keyboard.press('Shift+Tab')` after a cycle is detected |
| **Visual** | A glowing red cursed circle around the trapped region; the walking ghost gets stuck |
| **Sound** | A repeating chime while the ghost is trapped |
| **WCAG** | 2.1.2 (No Keyboard Trap) |

### 6. Invisible Wanderer

| Field | Value |
|-------|-------|
| **Detection rule** | An element is in the Tab walk sequence AND the computed focus indicator is not visible after a real Tab keypress (`:focus-visible`). Before reading any focus styles, inject `*,*::before,*::after{transition:none!important;animation:none!important}` into the page so that transition values do not interfere with the before/after comparison. |
| **Visible indicator definition** | An indicator is visible if, after a real Tab focus, **at least one** of the following holds: **(a)** `outline-style` ≠ `none` AND `outline-width` ≥ 1px AND the outline colour has ≥ 3:1 contrast against the background adjacent to the element; **(b)** `box-shadow` changed to a non-transparent shadow with ≥ 3:1 contrast against the adjacent background; **(c)** `border-color` or `background-color` changed and the contrast between the before and after colours is ≥ 3:1; **(d)** `text-decoration` changed (e.g. underline added). |
| **Chromium quirk** | Ignore `outline-offset`, `outline-width`, and `outline-color` deltas when `outline-style` is `none` — Chromium's UA `:focus-visible` rule sets `outline-offset: 1px` even under `outline: none`, which would cause false positives. A white outline on a white background is invisible and must be flagged. |
| **Data source** | Computed styles collected by `runner/tab-walker.ts` on each focused element: compare `outline-style`, `outline-width`, `outline-color`, `box-shadow`, `border-color`, `background-color`, and `text-decoration` before vs. after focus |
| **Visual** | Ghost footsteps with no accompanying light |
| **Sound** | None |
| **WCAG** | **2.4.7 Focus Visible (AA)** — primary mapping. Reference 2.4.13 Focus Appearance (AAA) as guidance only. (Note: 2.4.11 is "Focus Not Obscured", not Focus Appearance — do not cite it here.) |

### 7. Whispering Field

| Field | Value |
|-------|-------|
| **Detection rule** | An AX node has role `textbox`, `searchbox`, `spinbutton`, `slider`, or `combobox` AND either: **(a)** the computed accessible name is empty, **or** **(b)** the winning name source in CDP `name.sources` is the `placeholder` attribute (i.e. no `<label>`, `aria-label`, `aria-labelledby`, or `title` supplied the name). A placeholder is not an accessible label: it disappears on input, has low contrast in most UAs, and fails WCAG 3.3.2 / 1.3.1 technique F68. |
| **Data source** | CDP AX tree — `role.value`, `name.value`, and `name.sources` |
| **Visual** | A form field with a ghostly mouth and no words |
| **Sound** | For case (a) — empty name: `"edit text, blank"` (or the appropriate role name: `"search, blank"`, etc.). For case (b) — placeholder-only name: `"<placeholder text>, edit text"`, with a UI note that the name vanishes once the user types. |
| **WCAG** | 1.3.1 (Info and Relationships), 3.3.2 (Labels or Instructions), 4.1.2 (Name, Role, Value) |

### 8. Silent Tongue

| Field | Value |
|-------|-------|
| **Detection rule** | The `<html>` element has no `lang` attribute, OR the `lang` attribute value is not a valid BCP 47 language tag (at minimum a primary subtag of 2–3 letters, e.g. `en`, `fr`, `en-US`) |
| **Data source** | DOM attribute; validate with a BCP 47 primary-subtag regex: `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/` |
| **Visual** | A page-level banner: the spirits speak a garbled tongue |
| **Sound** | A garbled whisper |
| **WCAG** | 3.1.1 (Language of Page) |

### 9. Shattered Order

| Field | Value |
|-------|-------|
| **Detection rule** | Each of the following is a separate instance with its own `kind` field: **(a)** `kind: "no-h1"` — the page has no `<h1>` element; **(b)** `kind: "heading-skip"` — heading levels skip (e.g. `<h1>` → `<h3>` with no `<h2>`); **(c)** `kind: "no-main"` — no `main` landmark is present (`<main>` or an element with `role="main"`). The old "no landmarks at all" condition is replaced by the specific `no-main` check. |
| **Data source** | DOM structure — collect all heading elements in DOM order; collect landmark roles from CDP AX tree |
| **Visual** | Broken gravestone headings in an outline panel view |
| **Sound** | None |
| **WCAG** | 1.3.1 (Info and Relationships), 2.4.6 (Headings and Labels — best practice) |

### 10. The Veiled

| Field | Value |
|-------|-------|
| **Detection rule** | Either: **(a)** a focusable element exists inside an `aria-hidden="true"` subtree (axe rule `aria-hidden-focus`), OR **(b)** a DOM node is visually present (non-zero bounding box, not `visibility:hidden` or `display:none`, `opacity > 0`, and the element's box intersects the page's scrollable area — off-screen-positioned elements do not count) but is excluded from the accessibility tree via `aria-hidden="true"` or `role="presentation"`/`"none"`, AND the hidden subtree contains **visible non-whitespace text** or a **focusable** element. Purely decorative hidden graphics (icons, dividers, separator lines) that contain no text and no focusable children are correct practice and must NOT be flagged. |
| **Exclusions** | Nodes that are purely decorative and correctly hidden: `<img alt="">`, elements with `role="presentation"`/`"none"` that contain no focusable children and no visible non-whitespace text, and nodes whose visual presence is a CSS artefact (e.g. `opacity:0` pseudo-content). |
| **Data source** | DOM-to-AX mapping via CDP `backendDOMNodeId`: for each visible DOM node, check whether a corresponding AX node exists and is not marked `ignored`. Use `Accessibility.getFullAXTree` with `fetchRelatedNodes` to resolve the mapping. |
| **Visual** | The element dissolves into thick, impenetrable fog — distinct from the lighter contrast-failure fog of The Fog haunting. |
| **Sound** | Silence. The point is that nothing is announced. |
| **WCAG** | 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value) |

---

## Severity rules

Every haunting instance is assigned one of three severity levels. Apply the first matching rule.

| Severity | Symbol | Rules (apply in order; first match wins) |
|----------|--------|------------------------------------------|
| **Wraith** | 👻 | The affected element is part of a core task flow (checkout, login, navigation, search) AND the haunting makes the task impossible for AT users. A checkout button that is a Nameless Spirit is always Wraith. |
| **Restless** | 🌫️ | The haunting affects multiple elements (≥3 instances of the same type) OR the WCAG criterion is level A. |
| **Banished** | 💀 | All other hauntings (single instance, level AA criterion, element is not on a critical path). |

**Rule for "core task flow":** any element inside a `<form>`, or with a role of `button`/`link` that contains the words "submit", "checkout", "buy", "pay", "login", "sign in", "sign up", "search", "continue", "cart", "add to", "basket", "register", or "subscribe" (case-insensitive name match).

---

## Haunting Score

The Haunting Score is a number from 0 to 100. Lower is better. 0 means no hauntings detected.

### Weights

| Severity | Points per instance |
|----------|-------------------|
| Wraith | 20 |
| Restless | 8 |
| Banished | 3 |

### Algorithm

```
rawScore = sum of (weight × instanceCount) for each haunting
score = round(100 * (1 - exp(-rawScore / 120)))
```

The exponential curve means the score approaches 100 asymptotically instead of capping at five Wraiths. A single Wraith (rawScore 20) gives ≈ 15; five Wraiths (rawScore 100) gives ≈ 57; twenty Wraiths (rawScore 400) gives ≈ 96. The number stays meaningful across the full range of real-world pages.

### Invariants (enforced by property-based tests)

1. **Deterministic:** given the same set of `Haunting[]` inputs, the score is always the same value.
2. **Monotonic non-decreasing:** adding any haunting to the input set never decreases the score. `score(H ∪ {h}) >= score(H)` for all `H` and `h`. Rounding means the score may stay the same for a marginal addition — it never goes down.
3. **Order-independent:** `score([a, b, c]) === score([c, a, b])` for all permutations.
4. **Bounded:** `0 <= score <= 100` always.
5. **Zero baseline:** `score([]) === 0`.
6. **Severity-dominance:** replacing one haunting instance with a more severe one never lowers the score. Formally, if severity(h′) > severity(h) then `score(H ∪ {h′}) >= score(H ∪ {h})` for all `H`.

The classifier function signature must be:
```typescript
function computeScore(hauntings: readonly Haunting[]): number
```

No side effects. No global state. No `Date.now()`. Testable with fast-check arbitraries that generate `Haunting[]`.

---

## Speech announcement rules

These rules define exactly what text the Whisper walk speaks for each AX node. The function is `packages/core/src/classifier/speech.ts`. It is pure and must be property-tested.

### Base rule

```
announcement = [name, role, state].filter(Boolean).join(", ")
```

Where:
- **name** = `axNode.name.value.trim()` — omit if empty
- **role** = human-readable role label (see table below) — always included
- **state** = human-readable state string (see table below) — omit if no relevant state

### Examples

| AX node | Announcement |
|---------|-------------|
| button, name="Add to cart", not pressed | `"Add to cart, button"` |
| button, name="", not pressed | `"button"` |
| checkbox, name="Subscribe", checked | `"Subscribe, checkbox, checked"` |
| checkbox, name="", unchecked | `"checkbox, unchecked"` |
| link, name="Learn more" | `"Learn more, link"` |
| link, name="" | `"link"` |
| textbox, name="Email", value="" | `"Email, edit text"` |
| textbox, name="", value="" | `"edit text, blank"` (Whispering Field — empty name) |
| textbox, name="Email address" (from placeholder only), value="" | `"Email address, edit text"` + UI note: "name disappears when typing" (Whispering Field — placeholder-only name) |
| img, name="Company logo" | `"Company logo, graphic"` |
| img, name="" | `"unlabelled graphic, [filename]"` (Hollow Portrait haunting) |
| heading level 2, name="Products" | `"Products, heading level 2"` |
| generic/none/presentation | skip — do not announce |

### Role label map

| AX role | Spoken label |
|---------|-------------|
| `button` | `"button"` |
| `link` | `"link"` |
| `checkbox` | `"checkbox"` |
| `radio` | `"radio button"` |
| `switch` | `"switch"` |
| `textbox` | `"edit text"` |
| `searchbox` | `"search"` |
| `spinbutton` | `"spin button"` |
| `slider` | `"slider"` |
| `combobox` | `"combo box"` |
| `listbox` | `"list box"` |
| `option` | `"option"` |
| `menuitem` | `"menu item"` |
| `menuitemcheckbox` | `"menu item checkbox"` |
| `menuitemradio` | `"menu item radio"` |
| `tab` | `"tab"` |
| `treeitem` | `"tree item"` |
| `gridcell` | `"grid cell"` |
| `img`, `image` | `"graphic"` |
| `heading` | `"heading level N"` (where N = aria-level or DOM heading number) |
| `list` | `"list"` |
| `listitem` | `"list item"` |
| `table` | `"table"` |
| `row` | `"row"` |
| `columnheader` | `"column header"` |
| `rowheader` | `"row header"` |
| `cell` | `"cell"` |
| `form` | `"form"` |
| `region` | `"region"` |
| `main` | `"main"` |
| `navigation` | `"navigation"` |
| `banner` | `"banner"` |
| `contentinfo` | `"content info"` |
| `complementary` | `"complementary"` |
| `dialog` | `"dialog"` |
| `alertdialog` | `"alert dialog"` |
| `alert` | `"alert"` |
| `status` | `"status"` |
| `log` | `"log"` |
| All others | use the raw role string |
| `generic`, `none`, `presentation` | skip entirely |

### State rules

Include state only when it is relevant to the role:

| Role | States to include | Format |
|------|------------------|--------|
| `checkbox`, `menuitemcheckbox` | `checked`, `unchecked`, `mixed` | state word only |
| `radio`, `menuitemradio` | `selected` or `unselected` | state word only |
| `switch` | `on` or `off` | state word only |
| `option` | `selected` | state word only |
| `button` | `pressed` (if `aria-pressed=true`) | `"pressed"` |
| `tab` | `selected` | state word only |
| `combobox` | `expanded` or `collapsed` | state word only |
| `treeitem` | `expanded` or `collapsed` | state word only |
| Any | `disabled` (if `aria-disabled=true` or `:disabled`) | append `"dimmed"` |
| Any | `required` (if `aria-required=true` or `required`) | append `"required"` |

### Property-based test invariants for speech

1. **Role always present:** `announcement(node)` always contains the role label for the node's role, unless the role is `generic`, `none`, or `presentation`.
2. **Name included iff non-empty:** the name appears in the announcement if and only if `axNode.name.value.trim().length > 0`.
3. **No extra content:** the announcement contains only name, role, and state — no fabricated text, no element IDs, no HTML snippets.
4. **Generic nodes skipped:** a node with role `generic`, `none`, or `presentation` returns an empty string (do not speak it).
