Create the Kiro spec **`spirit-sight-ui`** in `.kiro/specs/spirit-sight-ui/`. Do not implement yet.

Inputs:
- `docs/brief/PRODUCT_BRIEF.md` §5 (experience walkthrough), §6 (non-negotiables) and §8 (design direction)
- `.kiro/steering/design-system.md` (binding)
- `structure.md`

This spec covers all of `apps/web`: the Fastify API and the React + Vite SPA, in one Docker image. Keep `requirements.md` under about 25 KB.

## API (Fastify)
- `POST /api/audit` `{ url }` → `202 { id }`. Validates the URL, applies the SSRF pre-check, and is rate limited per IP (`@fastify/rate-limit`: 5 audits per minute, 30 per hour).
- `GET /api/audit/:id` → `{ status: queued|loading|tree|walking|classifying|done|error, stage timings, result? }`. Stages are **real**, reported by the engine through a progress callback (add `onProgress` to `AuditOptions`). There are no fake delays.
- `GET /api/samples` → pre-audited results: the Cursed Shop's 3 pages, plus 2–3 public sites the product lead will choose. These are stored as JSON in `apps/web/samples/`, so the demo works even when live audits are slow.
- In-memory job store with a TTL of 1 hour. `@fastify/helmet` with a strict CSP. Serve the built SPA from `dist/client`. Health route.

## SPA views and components
1. **Landing:**
   - a candle-lit hero
   - one labelled input: "Which site do you dare to see through their eyes?"
   - sample cards for the Cursed Shop and the public examples
2. **Séance (loading):** the real stages from the API, announced in an `aria-live="polite"` region.
3. **Spirit Sight:**
   - The screenshot with an SVG overlay. Boxes come from the same render, so they never drift.
   - A toggle runs the signature fog wave: a top-to-bottom dissolve on a canvas or WebGL noise layer **over the screenshot only**.
   - Each haunting has its own treatment, per the visual described for each haunting in `.kiro/steering/hauntings.md`. All 10, including The Veiled; the brief's §4 table is older and lists only 9.
   - A side list groups hauntings by type, with severity and counts, and shows the Haunting Score.
   - Every overlay item is a real focusable button in a logical order, with an accessible name such as "Nameless Spirit: button at Add to cart, Wraith". It is never a canvas-only interaction.
4. **Whisper walk ("Hear what they hear"):**
   - Reads `speech` strings in AX-tree order with Web Speech, highlighting each node as it speaks.
   - Speed and voice controls, plus play, pause and step.
   - Off until the user clicks.
   - A visible caption mirrors every utterance, and the caption is the accessible equivalent.
5. **Keyboard walk:**
   - A ghost follows the real `TabStep` sequence across the screenshot.
   - It skips Lost Souls (shown as souls behind glass) and gets stuck circling in a Cursed Loop with an ember ring.
   - Escapable cycles are shown as briefly circling, then breaking free.
6. **Haunting detail (dialog):**
   - what it is
   - the persona line ("who it hurts")
   - the WCAG criterion with a link
   - the offending HTML snippet
   - a fix snippet
   - a "Copy as Kiro prompt" button that copies a ready-to-paste Exorcise instruction
7. **Daylight mode:**
   - A calm, high-contrast, motion-free report: a WCAG table and the needs-manual-check list.
   - The honest coverage note: automated checks find about 30–40% of issues, and we never say "compliant".
   - Export to Markdown and JSON.
   - It is the default when `prefers-reduced-motion: reduce` is set.
8. **Optional ambient drone** (Web Audio): off by default, with a visible toggle.

## Non-negotiable requirements (EARS, each testable)
- **The app is WCAG 2.2 AA.** Add a Playwright test that runs **the app's own audit engine** (`auditAndClassify` with the permissive policy) against the built app at `localhost`. It must report **zero hauntings** on the landing page, the Spirit Sight view of a sample and Daylight mode. The app audits itself.
- The fog and effects never cover the app's own text.
- Full keyboard support, with shortcuts that are documented and do not hijack single printable keys (WCAG 2.1.4).
- A visible ecto focus ring with ≥ 3:1 contrast.
- The token contrast test from `design-system.md`.
- Under `prefers-reduced-motion`, there is no animation at all.
- No external network calls from the client except the API. Fonts (Atkinson Hyperlegible, Cormorant Garamond) are self-hosted via `@fontsource`.

## Testing
- Vitest + Testing Library for the components.
- Playwright end-to-end: paste the Cursed Shop URL → Spirit Sight → keyboard walk → Daylight → export.
- Use fast-check for pure UI helpers: box scaling between screenshot and viewport, and the ordering of overlay focus.

## Tasks
Ordered so that a demo-able vertical slice arrives early:
1. API plus the sample JSON first.
2. Then Spirit Sight on a sample.
3. Then the whisper walk, keyboard walk and Daylight.
4. Then the polish (fog shader, takes-form animation).

## Addendum (2026-11-24): what the judges told us, and the engine as it really is
**Judges' guidance** (`PRODUCT_BRIEF.md` §11b): all 5 criteria are weighted equally, so **Design is a full fifth of the score**. The judges asked for:
- "a complete, polished product, not a proof of concept"
- "a clean interface and an intuitive user experience"
- "simple, focused solutions"
- a demo video that shows it working **end to end**

Shape the spec around that:
1. **One obvious path.** Landing (paste a URL, or pick the Cursed Shop) → séance with real stages → Spirit Sight → keyboard walk and whisper walk → Daylight report. Every view has one primary action and is reachable in at most 2 clicks or keypresses.
2. **Demo-first ordering in `tasks.md`.** First a vertical slice that runs end to end on the Cursed Shop, including the score and the WCAG export. Then polish (fog shader, takes-form animation, ambient sound), then edge cases. If time runs out, polish beats features.
3. **The app audits itself.** A Playwright test runs `auditAndClassify` on the built app and must report **zero hauntings**. Treat that as a demo moment: "THE UNSEEN finds nothing haunted in itself".
4. **Real engine API:** `auditAndClassify(url, options)` from `@the-unseen/core` returns a `ClassifiedAudit`, built by the classifier run. Read `packages/core/src/index.ts` and `src/classifier/` once they exist, and read `.kiro/specs/haunting-classifier/design.md` for the `ClassifiedAudit`/`Haunting` types (`wcag[]`, `guidance`, `speech`, `speechNote`, `soundCue`, `secondary`, `detectedCountsByType`, `needsManualCheck`). The séance stages need an `onProgress` callback in `AuditOptions`. Specify it as a small additive task in this spec (`runner` emits: loading → tree → walking → classifying).
5. **Hosted safety:** the server uses the default restrictive policy (the safe-fetch spec adds an in-process proxy). The API must never accept a policy from the client.
6. **Performance budget:** the first audit result appears in ≤ 20 s for the Cursed Shop on the hosted box, and the samples render instantly from JSON.

In headless spec mode, write all three files (`requirements.md`, `design.md`, `tasks.md`) in this run. The product lead approves the requirements up front. Do not ask questions; if you near a limit, stop after a completed file and say which comes next.
