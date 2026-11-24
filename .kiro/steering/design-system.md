---
inclusion: fileMatch
fileMatchPattern: "apps/web/**"
---

# THE UNSEEN — Design System

Rules for all UI code in `apps/web/`. Every token, component, and motion decision here is binding. Do not introduce ad-hoc colours, fonts, or animation durations that aren't defined below.

---

## Colour tokens

Define these as CSS custom properties on `:root` and as TypeScript constants in `apps/web/src/client/tokens.ts`. Never hardcode hex values in components.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-ink` | `#0B0A10` | Page background |
| `--color-bone` | `#ECE6D6` | Primary text, labels |
| `--color-ecto` | `#7CF5C8` | Spirit Sight accent, focus indicators |
| `--color-ember` | `#FF5A4E` | Traps (Cursed Loop), critical severity |
| `--color-candle` | `#F4B860` | Warnings, Restless severity |
| `--color-mist` | `#8E8AA8` | Secondary text, helper text |

### Contrast requirements (AA)

Every token pair used for text-on-background must meet WCAG 1.4.3 (4.5:1 for normal text, 3:1 for large text ≥18pt / ≥14pt bold). The following pairs are pre-verified and are the only permitted combinations:

| Foreground | Background | Ratio | Use |
|------------|------------|-------|-----|
| `--color-bone` on `--color-ink` | ≥7:1 | Body text, labels |
| `--color-ecto` on `--color-ink` | ≥7:1 (verify in test) | Focus rings, accent text |
| `--color-ember` on `--color-ink` | ≥4.5:1 (verify in test) | Error text, critical labels |
| `--color-candle` on `--color-ink` | ≥4.5:1 (verify in test) | Warning text |
| `--color-mist` on `--color-ink` | ≥4.5:1 (required; verify in test) | Secondary text |
| `--color-ink` on `--color-ecto` | (inverse of above) | Button text on ecto bg |

A CI test must compute the contrast ratio for each pair and fail if any pair falls below the threshold. The contrast ratio formula is the WCAG 2.x relative luminance formula, which is also property-tested in `packages/core`.

Do not use any colour combination not in this table for text. For decorative/non-text elements, contrast rules do not apply, but prefer to stay on-token anyway.

---

## Typography

### Typefaces

| Role | Font | Why |
|------|------|-----|
| **All UI text, body, labels, inputs, buttons** | **Atkinson Hyperlegible** | Designed by the Braille Institute specifically for low-vision readability. This choice is intentional and meaningful for the product. |
| **Display headings only** (`<h1>`, `<h2>`, hero text) | **Cormorant Garamond** (or **IM Fell English SC** as fallback) | Restrained display serif for the Victorian séance aesthetic. Used sparingly. |

Self-host both fonts via `@fontsource` packages only. Never load Google Fonts (no third-party font requests from the auditor). Never swap or substitute them without updating this file.

### Type scale (rem-based, `1rem = 16px`)

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | 0.75rem | 400 | Fine print, timestamps |
| `--text-sm` | 0.875rem | 400 | Secondary labels, captions |
| `--text-base` | 1rem | 400 | Body, default |
| `--text-lg` | 1.125rem | 400 | Lead paragraph |
| `--text-xl` | 1.25rem | 600 | Section labels |
| `--text-2xl` | 1.5rem | 700 | Card headings (`<h3>`, `<h4>`) |
| `--text-3xl` | 2rem | 700 | Page headings (`<h2>`) — Atkinson |
| `--text-display` | 3rem+ | 400 | Hero / `<h1>` — Cormorant Garamond |

Minimum body text size: 1rem (16px). Never set text below 0.75rem (12px).

---

## Spacing and layout tokens

```css
--space-1:  0.25rem   /* 4px  */
--space-2:  0.5rem    /* 8px  */
--space-3:  0.75rem   /* 12px */
--space-4:  1rem      /* 16px */
--space-6:  1.5rem    /* 24px */
--space-8:  2rem      /* 32px */
--space-12: 3rem      /* 48px */
--space-16: 4rem      /* 64px */
```

---

## Motion rules

### Permitted motion (standard experience)

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Spirit Sight toggle (fog wave) | 800ms | `ease-in-out` | User click |
| Haunting overlay fade-in | 400ms | `ease-out` | On load |
| Ghost drift (subtle) | 4000ms | `ease-in-out`, infinite | Passive ambient |
| "Takes form" (fix celebration) | 600ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | On exorcism |
| Tab ghost movement | 300ms per step | `ease-in-out` | Keyboard walk |
| Focus ring | instant | — | `:focus-visible` |

WebGL/canvas noise fog runs only on the **screenshot canvas layer** (`<canvas id="spirit-sight">`). It must never be applied to any app UI element.

### Reduced-motion rules (`prefers-reduced-motion: reduce`)

When `prefers-reduced-motion` is set, **all animations must be disabled or replaced**:

- The Spirit Sight fog wave: instant toggle (no wave).
- Ghost drift: static position, no animation.
- "Takes form": a simple opacity fade (100ms).
- Tab ghost movement: instant jump, no transition.
- WebGL fog on the screenshot canvas: disable entirely; use a static desaturation CSS filter instead.
- Ambient drone (Web Audio): do not start.

Implement this with a React context (`ReducedMotionContext`) that reads `window.matchMedia('(prefers-reduced-motion: reduce)')` and passes a boolean down. Every animated component must consume this context and branch accordingly.

**Daylight mode** (the calm WCAG report view) is also the default when `prefers-reduced-motion` is set. If the user has the preference set and loads the app, default to Daylight mode and do not auto-start the Spirit Sight animation.

---

## Sound rules

- All sound (Web Speech whispers, ambient drone, chimes) is **off by default**.
- Sound must not start until the user explicitly enables it. Autoplay before a user gesture is prohibited (browser policy and accessibility policy).
- Provide a persistent on/off toggle in the app header with a clear accessible label (`aria-label="Toggle sound"`) and an icon that reflects state.
- Web Speech synthesis settings: pitch ≤0.8, rate ≤0.85, to produce the whisper effect. Expose speed and voice controls in the Whisper walk panel.
- Under `prefers-reduced-motion`, do not start the ambient drone even if the user has sound enabled — the drone is tied to motion. Web Speech is still permitted.

---

## Component accessibility rules

These rules apply to every React component generated for `apps/web/`.

### Focus

- Every interactive element must have a visible focus indicator using `--color-ecto` as the outline colour.
- Default browser outline must not be removed without a custom replacement. `outline: none` without a `:focus-visible` replacement is forbidden.
- Required focus style minimum: `outline: 2px solid var(--color-ecto); outline-offset: 2px`.
- Focus must follow logical DOM order. Never use `tabindex` values > 0 to override natural order.

### Labels

- Every `<input>`, `<textarea>`, and `<select>` must have an associated `<label>` (via `htmlFor`/`id`) or `aria-label` or `aria-labelledby`. Placeholder text alone is not a label.
- Every `<button>` must have a non-empty accessible name. If the button is icon-only, add `aria-label`.
- Every `<img>` must have `alt`. Use `alt=""` only for decorative images.
- Every icon used as a standalone interactive element must have an accessible name via `aria-label` or visually-hidden text.

### Live regions

- Use `aria-live="polite"` for status updates (audit progress, score change).
- Use `aria-live="assertive"` only for urgent errors that interrupt the user (network failure, SSRF block).
- Do not set `aria-live` on elements that update continuously (use a debounced update pattern instead).
- Audit progress stages must announce to screen readers via a live region: e.g. "Loading page…", "Reading accessibility tree…".

### Keyboard

- Modal dialogs must trap focus while open (using a focus trap library or equivalent) and return focus to the trigger element on close.
- The haunting detail panel (opened from the Spirit Sight overlay) is a dialog: implement it with `role="dialog"`, `aria-modal="true"`, and a focus trap.
- Dropdown menus must implement the ARIA Authoring Practices Guide menu pattern (arrow key navigation, Home/End, type-ahead).
- The Daylight mode toggle must be keyboard-operable and announce its current state via `aria-pressed` or `aria-checked`.

### Semantic HTML

- Use native HTML elements where possible: `<button>` for buttons, `<a href>` for navigation links, `<nav>`, `<main>`, `<header>`, `<footer>`, `<aside>` for landmarks.
- Do not use `<div>` or `<span>` with click handlers in place of `<button>` or `<a>`.
- Heading hierarchy must be correct: one `<h1>` per page, no skipped levels.
