# Run 50: ghosts in the margins (the lights-on intro and the lantern)

One job, built in `apps/web/` only. Save after each numbered step. If you approach a limit, stop after a finished step and print `Next: <step>`. Never end with a menu or a question. Do not commit or push. Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.

## Why
The owner wants the ghosts from the video thumbnail inside the real app. The reference image is `docs/brief/prompts/50-ghost-reference.png`: chubby mint ghosts with tall black oval eyes, peeking in from the edges of the frame, small hands curled over the edge.

The feeling to aim for: something was creeping around behind you while you weren't looking.
- When the lights come on, the ghosts scatter and hide at the edges of the screen.
- Wherever your lantern goes (the mouse pointer, or the keyboard focus), they duck out of sight.
- When you look away, they move.

THE UNSEEN is an accessibility tool and audits its own UI on every test run. The ghosts must be pure decoration that never gets in anyone's way. The "Accessibility rules" section is not optional.

## What to build (in `apps/web/src/client/`)

### 1. The ghost art: `components/Ghost.tsx`
- One inline SVG ghost in the thumbnail's style: domed head, soft wavy hem, two tall black oval eyes, two small hands that can curl over an edge.
- Mint body with a vertical gradient from `#E4FBF2` to `#A8EBD3`, and a soft `#6FD3B0` glow. Add these colours to `styles/tokens.css` as tokens and use the tokens.
- Props:
  - `size`
  - `edge`: `top | right | bottom | left`. The ghost is rotated so its hands hold that edge and it leans in from it.
  - `mood`: `looking | startled`. Startled eyes are rounder and slightly larger.
- No raster images. Always `aria-hidden="true"` and `focusable="false"`.

### 2. The lights come on: `components/LightsOn.tsx`, mounted once in `App.tsx`
- On the first page load of a browser session, the screen starts dark (near `--color-void`).
  - In the centre: a small candle-flame spinner and the text "Lighting the candles…" in an element with `role="status"`.
  - Three or four ghosts drift slowly across the middle of the dark screen.
- **Lights on:** when the app is ready, the dark layer fades out over about 600 ms. The ghosts turn startled and dart to the nearest screen edge, ending half-hidden behind it: the same peeking spots that step 3 uses, so the hand-off is seamless.
  - "Ready" means the fonts have loaded (`document.fonts.ready`) and the first route has rendered.
  - Minimum 900 ms, hard maximum 2.5 s.
- **Skipping:**
  - Any key, click or touch jumps straight to the end state.
  - A key press must not be swallowed: Tab still moves focus normally.
- It plays once per browser session (a `sessionStorage` flag, every access in try/catch), never on later navigations.
- **The page underneath:**
  - The real page renders underneath the whole time and stays in the accessibility tree.
  - The dark layer is `aria-hidden`, apart from the status text.
  - The layer never takes focus.
  - The status text is removed once the lights are on.

### 3. Peeking ghosts: `components/MarginGhosts.tsx`
- **How many:**
  - 3 ghosts at 1100 px wide and above
  - 2 ghosts from 768 to 1099 px
  - none below 768 px
- **Where they may sit:** only in the page margins and at the screen edges, outside the main content column.
  - Never over the header controls, the skip link, an open dialog, or any focus outline.
  - `position: fixed`, `pointer-events: none`, below dialogs in the stacking order.
- **Idle:** each peeks in from an edge like the thumbnail, with a slow bob.
- **The lantern:** the mouse pointer carries a soft warm light, a radial gradient with `pointer-events: none`.
  - The light may only *brighten*: it never darkens text and never lowers contrast anywhere.
  - When the lantern comes within about 180 px of a ghost, the ghost turns startled and slips back behind its edge in about 250 ms.
- **Keyboard parity:** when focus lands on an element within about 180 px of a ghost, that ghost hides too.
- **Creeping:**
  - A hidden ghost never comes back where it left. A few seconds after the lantern has gone, it re-emerges at a different spot, possibly on a different edge.
  - When the tab is hidden and shown again (`visibilitychange`), every ghost has moved.
- **Routes:**
  - Shown on the landing page, the séance (audit in progress) page and every "not found" page.
  - Not on the audit result views (Spirit Sight, Keyboard walk, Whisper walk), where they would distract from the findings.
  - Never on Daylight: there, "the ghosts are gone" by design.

### 4. A control to stop them: in `components/AppHeader.tsx`
- A toggle button next to the sound toggle, styled like it.
  - Accessible name "Hide ghosts", with `aria-pressed`.
  - Its state is remembered in `localStorage` (try/catch).
- When pressed: no intro, no ghosts, no lantern.
- This is the WCAG 2.2.2 (Pause, Stop, Hide) control for the ghosts' endless motion.

## Accessibility rules (the self-audit tests these)
- Every ghost and lantern element is `aria-hidden="true"`, not focusable and `pointer-events: none`. The one exception is the intro's dark layer, which may take the skip click.
- **Reduced motion** (both `useReducedMotion()` and the CSS media query):
  - no intro at all
  - ghosts shown still in their peeking spots: no bob, no darting, no lantern
  - "Hide ghosts" still removes them
- Nothing ever covers or dims text, controls or focus outlines.
- Motion:
  - Animate `transform` and `opacity` only.
  - No layout shift from the intro or the ghosts.
  - Nothing flashes more than three times a second.
- No change to sound or to the ambient drone.

## Tests
- **Unit (Vitest and Testing Library):**
  - `LightsOn`:
    - plays once per session;
    - ends on a key or a click without swallowing Tab;
    - never renders under reduced motion or when ghosts are hidden.
  - `MarginGhosts`:
    - the ghost count follows the width breakpoints;
    - nothing renders below 768 px, on the result views or in Daylight;
    - a ghost hides when the pointer or the focus comes within range, and comes back at a different spot.
  - "Hide ghosts": the toggle state and its persistence.
  - `Ghost` is `aria-hidden` and not focusable.
- **End-to-end (Playwright):**
  - The intro ends within 2.5 s.
  - The landing page is usable during the intro: Tab reaches the skip link.
  - With `reducedMotion: 'reduce'`, no intro appears.
  - "Hide ghosts" removes the ghosts, and the choice survives a reload.
- **The self-audit** (`e2e/self-audit.spec.ts`, 8 routes) must stay clean.
  - Add the new header button to the route markers if the markers list header buttons.
  - Never weaken a test or loosen the self-audit.
- **Existing tests:** existing end-to-end tests that wait for landing content must still pass.
  - If the intro gets in their way, start those tests with the intro already seen (set the session flag in a shared fixture).
  - Keep the dedicated intro tests above.
- **Replay edition:** it must keep working. The ghosts and the intro appear there too.

## At the end
Run these and report the pass counts. Use `UNSEEN_CHROMIUM_CHANNEL=chromium` on this host.
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Then:
1. List the files you changed or added.
2. Print `Next: owner review`.
