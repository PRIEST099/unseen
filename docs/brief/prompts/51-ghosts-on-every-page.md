# Run 51: ghosts on every page, and a longer intro where they roam

This builds on runs 50 to 50d, and their rules still apply.
- Work in `apps/web/` only.
- Save after each numbered step.
- If you approach a limit, stop after a finished step and print `Next: <step>`.
- Never end with a menu or a question.
- Do not commit or push.
- Do not touch `docs/brief/**`, `apps/cursed-shop/expected-hauntings.json`, `packages/` or `.kiro/`.
- Never weaken a test. A test that encodes the old 2.5 s intro or the old route list is updated to the new rule, not deleted.

These instructions were checked against the code by three independent reviewers before sending. File and line references are from that check.

## Why
The owner likes the ghosts and wants two changes:
1. **"The ghosts might appear on any page, not only the home page."**
   - Today `marginGhostsRoute()` in `components/MarginGhosts.tsx` allows only `/`, the séance and the not-found states (through `AllowGhosts`).
   - The audit lenses (Spirit Sight, Keyboard walk, Whisper walk, Daylight) have none. Even if they were allowed, those views are up to 96rem wide, so at 1440 px the panel leaves about 24 px of wall and the margin planner rightly finds no spot.
   - Below about 1,250 px, no page has margin ghosts.
2. **"The loading screen could be a little longer, to show the ghosts roam around a bit."** Today the lights come on by about 1.8 s and the intro is gone by 2.5 s. The ghosts only drift in place (±28 px).

The answer to (1) is a second home for ghosts: **the gilt-framed paintings.** A ghost peeking in from behind the inside edge of a frame is the thumbnail's look. A painting is decorative and carries no text, and it is on screen at every width, phones included.
- **Paintings today:**
  - the landing hero (`.hero-painting`);
  - the séance (`.seance-painting`);
  - `NotFoundView`'s corridor;
  - every loaded audit lens, through `components/LensBanner.tsx` in `AuditResultView`.
- **No painting today:**
  - `StateMessage` in `views/AuditResultView.tsx` ("Audit not found", "Sample not found", "Audit unavailable"). Two of the 8 self-audit routes, `/audit/expired-job` and `/sample/no-such-sample`, render it.
  - The "Loading audit" state.

## What to build (in `apps/web/src/client/`)

### 0. A painting for the state pages
- Give `StateMessage` the same layout as `NotFoundView`: a `.manor-scene` with the decorative corridor `.painting` (`alt=""`), and the existing h1, text and link in the column beside it. Keep the same words and the same heading level.
- Leave "Loading audit" as it is, with no painting and no painting ghost.
- Keep the existing tests for those states passing. Update only the markup assertions that must change.

### 1. A ghost in every painting: `components/PaintingGhost.tsx`
- **One ghost per painting**, peeking in from behind the inner edge of the gilt frame.
  - Its hands rest at the inner (padding-box) edge, and everything beyond that edge is clipped.
  - Do not change `.painting`'s `overflow`, `border`, `border-image` or `filter`.
  - Put the ghost layer at `position: absolute; inset: 0; z-index: 1` inside the painting, so it paints above `.hero-painting::after` (the dark gradient) and below anything placed over the painting.
- **Reuse, don't redraw.**
  - Render with `Ghost` (`svg.ghost`) and the pure helpers in `utils/ghost-art.ts` and `utils/ghost-spots.ts` (`faceBox` and the pose helpers).
  - Never use `PeekingGhost`, `.margin-ghost` or `.margin-ghosts`: `e2e/ghosts.spec.ts` counts `.margin-ghost`.
  - Use your own classes (`.painting-ghost`, `.painting-ghost-slide`, and so on) and your own uniquely named keyframes (the `margin-ghost-bob` lesson from 50c).
- **Mount it from the painting components themselves:** `LensBanner`, the landing hero, the séance, `NotFoundView` and the new `StateMessage` painting. A small shared wrapper is fine. Never query the DOM from far away.
- **Where it may peek:**
  - The left, right or bottom inner edge of the picture.
  - Plan spots in a pure module (for example `utils/painting-spots.ts`) so they can be unit-tested.
  - The margin rule applies: a spot is valid only if the dome and **both eyes** are inside the picture's inner box in the pose it is drawn in.
- **Keep clear of anything drawn over a painting.**
  - On the landing, `.hero-plaque` overlaps the bottom of the painting and `.landing-candle` rises into it.
  - Measure those elements and treat their boxes, plus a small gap, as excluded areas. Do not hard-code pixel offsets.
  - Nothing overlaps the séance, NotFound or LensBanner paintings today. Measure generically anyway.
- **The ghost's bounding box stays inside the picture.**
  - The self-audit and the e2e geometry read an element's full `getBoundingClientRect`, which `overflow: hidden` does not shrink.
  - So size the ghost's SVG element to its visible part only: crop with the `viewBox`, or with a nested `svg`, or similar. While peeking, every element of the ghost then has a bounding box inside the picture's inner box.
  - When ducked, set `visibility: hidden` on the ghost once its transition has finished.
- **Size:**
  - Roughly 40–55% of the picture's height, clamped to 56–150 px.
  - If the picture is too short for a ghost at the floor size with both eyes showing, render none there.
- **Behaviour on the landing, séance, not-found and state pages:**
  - It bobs gently (an infinite bob is fine here).
  - **The lantern:** a mouse or pen pointer within `NEAR_PX` startles it.
  - **Touch:** only a `pointerdown` with `pointerType === "touch"` whose point is inside that painting's own box startles it.
    - Listen passively and never call `preventDefault`, so taps on nearby controls and scrolling behave exactly as before.
    - A touch point never becomes the lantern position.
    - Margin ghosts keep ignoring touch.
  - **When startled,** it ducks behind the frame (startled eyes, slides out of the picture) and re-emerges about 4 s after the pointer last came near.
    - Prefer a different valid spot farther than `NEAR_PX` from the pointer.
    - If there is none, use the valid spot farthest from it.
    - It never stays hidden for good.
  - **When the tab is hidden and shown again,** it has moved.
  - **Wandering:** about every 20–40 s (randomised; the first wander no sooner than 20 s after mount) it slips out of sight and peeks back in somewhere else in the same painting.
  - **Sharing the lantern:** move the existing pointer tracking to a provider-level hook (for example in `GhostsProvider`). It runs whenever ghosts are not hidden and motion is allowed, whether or not any margin ghost exists. It stores positions in refs: no re-render per `pointermove` (the 50b fix).
- **Behaviour on the audit lenses** (every `LensBanner`: Spirit Sight, Keyboard walk, Whisper walk and Daylight). The audit views are still on purpose: `manor.css` (around line 318) says the tests and Daylight's calm rely on no endless animation.
  - **No infinite animation:** no bob, and no transition on first mount (it is simply there).
  - Its only animations are the finite duck and re-peek transitions (≤ 700 ms each). They start only from the lantern, the visibility change or the wander timer.
  - These existing tests must pass unchanged:
    - the `getAnimations()` waits and assertions at `self-audit.spec.ts:152`, `haunting-dialog.spec.ts:17`, `takes-form.spec.ts:21`, `spirit-sight.spec.ts:196`, `daylight.spec.ts:126` and `e2e-replay/replay.spec.ts:188`.
  - **While a Keyboard walk or Whisper walk is playing, or while the Spirit Sight overlay is open,** the painting ghost holds completely still: no ducking and no wandering. A moving ghost could be mistaken for the walk's Tab ghost.
- **Daylight is the morning after: one sleepy ghost.**
  - Detect Daylight from the lens (`lensFromPath(...) === 'daylight'` with the audit loaded), never from a literal path. There is no `/daylight` route; Daylight is `/sample/:id/daylight` or `/audit/:id/daylight`.
  - Its painting ghost is the last one left:
    - about 70% of the normal size, clamped to 40–105 px (its own floor);
    - opacity around 0.75;
    - never bobs;
    - wanders only every 40–60 s.
  - Add a `sleepy` mood to `utils/ghost-art.ts` (half-closed eyes) if it fits cleanly; otherwise use `looking`.
- **Never inside an audit stage:**
  - No decorative ghost is ever drawn inside the Spirit Sight screenshot stage (`ScreenshotStage`, `.stage-frame`), nor in the Keyboard or Whisper walk's `.haunting-overlay` / `.ghost-layer`. Real findings are drawn there.
  - Use the full `Ghost` art, never eyes alone and never the mist gradient that the Nameless Spirit and Hollow Portrait markers use.

### 2. Margin ghosts on every route except Daylight
- Margin ghosts are allowed on **every route except the Daylight lens**.
  - Detect Daylight in the same way as in step 1: for example, the Daylight view publishes it through `GhostsContext`. That way a not-found page under a `.../daylight` path still gets margin ghosts.
  - Replace the `AllowGhosts` / `extraAllowed` route mechanism with this rule if nothing else needs it, and keep the tests meaningful.
  - Add unit cases: allowed on `/sample/x`, `/sample/x/keyboard`, `/sample/x/whisper` and `/nonexistent`; refused on the loaded Daylight lens.
- The geometry rules from 50c and 50d stay exactly as they are:
  - no slivers;
  - never behind the footer;
  - at most two per side;
  - `pickSpot` returns `null` rather than stacking.
- On the wide audit views, this means margin ghosts appear only where the wall is wide enough, for example at 1920 px. That is correct; the painting ghost covers narrower screens.
- **On an audit lens, margin ghosts do not bob.** The audit lenses must settle (see step 1), so margin ghosts there are still. They keep their finite duck and re-peek transitions.
- Update the doc comment on `MarginGhosts`.

### 3. A longer intro where the ghosts roam: `components/LightsOn.tsx`
- **New timing:**
  - **Minimum dark phase:** 3.2 s, even when the fonts are ready sooner.
  - **Lights on:** by 3.9 s after mount at the latest.
  - **Fade:** 600 ms. Keep `.lights-on[data-phase='lights'] .lights-on-dark`'s transition in `styles/ghosts.css` equal to `INTRO_FADE_MS`, and make the dart finish within the fade.
  - **Hard cap:** an `INTRO_MAX_MS = 4600` timer, started at mount, calls `finish()` whatever the phase. The overlay is gone no later than 4.8 s after mount, even with effect latency.
  - The whole intro stays under 5 s (WCAG 2.2.2), and any key, click or touch skips it at once.
  - Update `INTRO_MIN_MS`, `INTRO_MAX_MS`, `INTRO_FADE_MS`, `INTRO_LIGHTS_LATEST_MS` and `introSchedule()` to match. Drop the navigation allowance if it no longer makes sense with a fixed minimum.
  - Keep every doc comment true, including the timer comments in `e2e/intro-clock.ts`.
- **A visible skip hint:** under the status line, add a second line, "Press any key or tap to skip".
  - It is `aria-hidden="true"`.
  - Its contrast is at least 4.5:1 on the dark layer.
  - The single `role="status"` announcement stays "Lighting the candles…", with no extra announcements.
- **Roaming, not drifting in place:**
  - Four ghosts at 768 px and wider, three below.
  - Each follows its own looping path. Over the dark phase, the range of its centre is at least 25% of the viewport width or height.
  - Give the paths character, so it reads as play rather than a screensaver: one circles the candle, two chase each other across the screen, and one sneaks up behind the "Lighting the candles…" line, peeks over it, and shies away.
  - Roaming ghosts pass **behind** the status line, the hint and the candle, never over the words.
  - Animate only `transform` and `opacity`, with CSS keyframes or the Web Animations API. No per-frame React state. The new keyframe names must be unique.
- **The hand-off when the lights come on:**
  - At that moment, read each intro ghost's **current rendered position**: `getBoundingClientRect` of the moving element, or `animation.commitStyles()` before cancelling it.
    - Use that position for the nearest-spot assignment and as the dart's start, so no ghost jumps.
    - Keep the dart target in the `.lights-on-ghost` inline `translate3d(...)`, which the existing hand-off test reads.
  - **Targets:**
    - Margin spots, if the page has any (as now).
    - Otherwise the painting ghost's spot, for one ghost only.
    - The rest dart off the nearest screen edge and fade.
    - Exactly one ghost ends at each waiting spot.
  - **The painting ghost during the intro:**
    - Add `publishPaintingLayout` / `readPaintingLayout` to `GhostsContext`, kept in a ref like the margin layout. It holds the painting ghost's viewport rectangle, edge, pose and size, and the picture's inner (clip) rectangle.
    - While `introActive`, the painting ghost waits with `visibility: hidden` and never startles, wanders or relocates. It appears in the same commit in which the intro ends, as margin ghosts do.
    - The intro ghost sent to it is resized to its size during the dart. It is clipped to the picture's inner rectangle (a `clip-path` from the measured rect) once it crosses into the painting, so it never covers the frame, the plaque or any text.
- **The self-audit and other automated browsers:**
  - The self-audit loads every route in a fresh browser with no intro-seen flag and captures at network idle + about 1.5 s, which would now land in the dark phase.
  - Skip the intro when `navigator.webdriver` is true, unless `sessionStorage["unseen.intro-force"] === "1"`.
  - The intro specs (`e2e/ghosts.spec.ts`, `e2e-replay/ghosts.spec.ts`, and any new intro test) set that flag in an init script, so the intro is still tested fully, including axe during the dark phase.
  - Document this in a comment in `LightsOn.tsx`. Do not change `packages/`.
- **Everything else stays:**
  - once per session;
  - skipping never swallows a key;
  - the skip tap never clicks the control underneath;
  - the real page stays in the accessibility tree;
  - reduced motion means no intro.

### 4. Shared rules for every new ghost
- `aria-hidden="true"`, never focusable, `pointer-events: none`.
- **"Hide ghosts"** removes painting ghosts too, on every page, at once and persistently.
- **Reduced motion:** painting ghosts stand still in one spot, as margin ghosts do. No bob, no duck, no lantern, touch or focus reaction, no wandering, and no relocation on visibility change.
- **`@media print`:** no ghosts of any kind and no intro.
- **Keyboard focus:** no painting contains focusable content today. If one ever does, focus inside it hides its ghost, as with margin ghosts.

## Tests
Add or update the following, and never weaken an existing assertion.

**Unit (Vitest):**
- **`painting-spots`:** for picture boxes from 320 to 1920 px wide and 90 to 600 px tall:
  - every planned spot shows the dome and both eyes inside the picture's inner box;
  - the ghost's cropped SVG box is inside the inner box;
  - an excluded rectangle is never intersected;
  - a too-short picture yields no spot;
  - the Daylight floor (40 px) is honoured.
- **`PaintingGhost`:**
  - it is `aria-hidden` and not focusable;
  - "Hide ghosts" removes it;
  - reduced motion makes it still and unreactive;
  - Daylight gets the smaller, sleepy, lower-opacity one with no bob;
  - on a lens it has no infinite animation class.
- **`LightsOn`:**
  - the lights never come on before 3.2 s;
  - they come on by 3.9 s;
  - the overlay is gone by 4.6 s on fake timers with fonts that never load;
  - four roaming ghosts at 1024 px, three at 375 px;
  - with `navigator.webdriver` true and no force flag, no intro;
  - with no margin layout and a published painting layout, exactly one intro ghost targets the painting spot, and the painting ghost is hidden until the intro is done.
- **`marginGhostsRoute` / the Daylight rule:** the cases listed in step 2.

**End-to-end (Playwright).** Keep the new sweep bounded: **one test per viewport that loops over the routes in a single page** (intro already seen), not one test per route.
- **Every page has a painting ghost:** on each of the 8 routes the self-audit visits (they already include `/sample/cursed-shop-index/daylight`, `/nonexistent`, `/audit/expired-job` and `/sample/no-such-sample`), at **1440×900 and 375×812**:
  - a `.painting-ghost` exists and is `aria-hidden`;
  - both eye ellipses (`svg.ghost ellipse`) and the full bounding box of every element in the ghost lie inside the painting's padding box (`getBoundingClientRect` minus the computed border widths);
  - none of them intersects the box of any text node, control, `.hero-plaque` or `.landing-candle`.
  On Spirit Sight and the two walks, assert that no decorative ghost is inside `.stage-frame`, `.haunting-overlay` or `.ghost-layer`.
- **The lantern** (at 1440×900, where the painting has two or more valid spots):
  1. Move the pointer onto the painting ghost and assert that it hides.
  2. Move the pointer outside the painting.
  3. Assert that the ghost is visible again within 8 s at a different spot.
  If you use the paused clock, call `page.clock.runFor(50)` after `goto` and after each pointer move so `requestAnimationFrame` runs.
- **Touch:** at 375×812 with `hasTouch`, a tap inside the painting startles the ghost. A tap on a nearby control still activates that control.
- **"Hide ghosts"** on an audit route removes the painting ghost and any margin ghosts. The choice survives navigation to another lens and a reload.
- **Margin ghosts on an audit route:**
  - At 1920×1080, a Spirit Sight route has at least one margin ghost, and the existing no-sliver and no-footer rules hold there.
  - The Daylight lens has no margin ghosts at any size.
  - After 2 s on Spirit Sight at 1920×1080, `document.getAnimations()` has no running animation.
- **The intro** (these specs set `unseen.intro-force`):
  - The lifetime test asserts `INTRO_MIN_MS + INTRO_FADE_MS` (about 3.8 s) ≤ lifetime ≤ 4.8 s.
  - The fonts-never-load test asserts ≥ 4.2 s and ≤ 4.8 s.
  - Raise every wait on the intro ending to an explicit timeout of at least 6,000 ms. Today they are 3,000 or 4,000 ms in `e2e/ghosts.spec.ts` (around lines 154, 168, 184, 191, 200, 233 and 260) and `e2e-replay/ghosts.spec.ts` (around lines 32, 47 and 80).
  - **Roaming:** on the paused clock (so the intro stays dark), for each `.lights-on-ghost`, take `el.getAnimations({ subtree: true })` and pause them. Set `currentTime` to 0, 400, 800 … 3,200 ms in turn, and read the rendered box centre each time. Assert that the range (max − min) of the centre in x or in y is at least 25% of the viewport width or height. Page clock time does not move CSS or Web Animations, so do not rely on it.
  - No ghost jumps at the hand-off: just before and just after lights-on, each ghost's rendered centre moves less than 40 px in one frame.
  - The skip hint is visible and `aria-hidden`.
  - Axe during the dark phase stays clean (skip hint included).
  - Skip tests stay on the paused clock, as fixed in 50d.
- **The self-audit** (`e2e/self-audit.spec.ts`) stays clean on all 8 routes, with the new painting ghosts present.
- **Replay edition** (`e2e-replay/`): a sample route shows a painting ghost, and the intro timing assertions are updated in the same way.

## At the end
Set `UNSEEN_CHROMIUM_CHANNEL=chromium` in the environment, then run these and report the pass counts:
- `npm run typecheck -w @the-unseen/web`
- `npm test -w @the-unseen/web`
- `npm run build -w @the-unseen/web`
- `npm run e2e -w @the-unseen/web`, **twice in a row**; both runs must pass
- In `apps/web`, run `npx playwright test <new painting-ghost spec> --repeat-each=5`, and `npx playwright test e2e/ghosts.spec.ts -g "intro" --repeat-each=5`. Match the `-g` text to the intro describe block's real name.
- `npm run build:replay -w @the-unseen/web`, then `npm run e2e:replay -w @the-unseen/web`

Then list the files you changed, and print `Next: owner review`.
